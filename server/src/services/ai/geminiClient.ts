import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { AiUsageMetricsService } from '../aiUsageMetricsService.js';
dotenv.config();

export interface GeminiContentPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string; // Base64
  };
}

export interface GeminiCallContext {
  workflow?: string;
  correlationId?: string;
  generationSessionId?: string;
  studentId?: string;
  bookId?: string;
  chapterId?: string;
  gradeId?: string;
  subjectId?: string;
  cachedExamId?: string;
  configHash?: string;
  callPurpose?: string;
}

export interface GeminiCallParams {
  preferredModel?: string;
  preferredModels?: string[];
  systemInstruction?: string;
  prompt?: string;
  parts?: GeminiContentPart[];
  temperature?: number;
  responseMimeType?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  context?: GeminiCallContext;
  telemetryContext?: GeminiCallContext;
}

/** Phase 4G.3AP: failure taxonomy used by the circuit breaker and by the HTTP layer. */
export type GeminiFailureCategory =
  | 'QUOTA_EXHAUSTED'
  | 'TEMPORARY_OVERLOAD'
  | 'TIMEOUT'
  | 'INVALID_CONFIGURATION'
  | 'AUTHENTICATION'
  | 'UNKNOWN';

/**
 * Provider failure with a safe, sanitized message. Raw provider text and credentials are never placed
 * in `message`; only the category is. Provider details are logged (truncated) by the client itself.
 */
export class GeminiProviderError extends Error {
  public readonly category: GeminiFailureCategory;
  public readonly retryAfterMs?: number;
  constructor(category: GeminiFailureCategory, retryAfterMs?: number, extra?: string) {
    super(
      category === 'AUTHENTICATION'
        ? `[GEMINI_AUTH_ERROR] Authentication or permission failure${extra ? ` (${extra})` : ''}`
        : `[GEMINI_${category}] AI provider unavailable${extra ? ` (${extra})` : ''}`
    );
    this.name = 'GeminiProviderError';
    this.category = category;
    this.retryAfterMs = retryAfterMs;
  }
}

type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
interface Breaker {
  state: BreakerState;
  openUntil: number;
  consecutiveFailures: number;
  trips: number;
  probing: boolean;
  lastCategory: GeminiFailureCategory | null;
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export class GeminiClient {
  public static candidateModels: string[] = Array.from(new Set([
    process.env.GEMINI_MODEL || '',
    'gemini-3.1-flash-lite-preview',   // primary high-RPM fast model
    'gemini-3.1-flash-lite',           // companion active quota pool
    'gemini-3.5-flash-lite',           // fast flash-lite
    'gemini-3.5-flash',                // high-speed multimodal flash
    'gemini-3.8-flash',                // advanced multimodal flash
    'gemini-flash-latest'              // authoritative stable fallback
  ].filter(Boolean)));

  // ---- Tunables (documented in docs/phase4g3ap_provider_reliability.md) ----
  public static maxConcurrentCalls = num(process.env.GEMINI_MAX_CONCURRENCY, 6);
  public static queueTimeoutMs = 30_000;
  public static maxModelsPerCall = num(process.env.GEMINI_MAX_MODELS_PER_CALL, 3);
  public static quotaCooldownMs = 15_000;
  public static notFoundCooldownMs = 10 * 60_000;
  public static overloadCooldownMs = 6_000;
  public static timeoutCooldownMs = 15_000;
  public static maxCooldownMs = 60_000;
  public static breakerFailureThreshold = 2; // consecutive 503/timeout failures before opening
  public static backoffBaseMs = 100;
  public static minIntervalMs = 30;

  private static lastCallTime = 0;
  private static inFlight = 0;
  private static waiters: Array<() => void> = [];
  public static breakers = new Map<string, Breaker>();

  // ---------------------------------------------------------------- concurrency limiter
  private static async acquireSlot(): Promise<void> {
    if (this.inFlight < this.maxConcurrentCalls) {
      this.inFlight++;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(wake);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new GeminiProviderError('TEMPORARY_OVERLOAD', 5_000, 'queue timeout'));
      }, this.queueTimeoutMs);
      const wake = () => { clearTimeout(timer); resolve(); };
      this.waiters.push(wake);
    });
  }

  private static releaseSlot(): void {
    const next = this.waiters.shift();
    if (next) {
      next(); // slot handed over; inFlight unchanged
    } else {
      this.inFlight = Math.max(0, this.inFlight - 1);
    }
  }

  // ---------------------------------------------------------------- circuit breaker
  private static getBreaker(model: string): Breaker {
    let b = this.breakers.get(model);
    if (!b) {
      b = { state: 'CLOSED', openUntil: 0, consecutiveFailures: 0, trips: 0, probing: false, lastCategory: null };
      this.breakers.set(model, b);
    }
    return b;
  }

  /** Decide synchronously whether a model may be used right now (single probe when half-open). */
  private static tryReserve(model: string): boolean {
    const b = this.getBreaker(model);
    const now = Date.now();
    if (b.state === 'CLOSED') return true;
    if (b.state === 'OPEN') {
      if (now < b.openUntil) return false;
      b.state = 'HALF_OPEN';
      b.probing = true; // this caller is the single probe
      return true;
    }
    // HALF_OPEN: only one in-flight probe
    if (!b.probing) { b.probing = true; return true; }
    return false;
  }

  private static onSuccess(model: string): void {
    const b = this.getBreaker(model);
    b.state = 'CLOSED';
    b.consecutiveFailures = 0;
    b.trips = 0;
    b.probing = false;
    b.openUntil = 0;
    b.lastCategory = null;
  }

  private static openBreaker(model: string, category: GeminiFailureCategory, baseMs: number, retryAfterMs?: number): void {
    const b = this.getBreaker(model);
    const effectiveBase = retryAfterMs && retryAfterMs > 0 ? Math.max(retryAfterMs, 2000) : baseMs;
    const cap = Math.max(this.maxCooldownMs, effectiveBase);
    const backoff = Math.min(cap, effectiveBase * Math.pow(2, Math.min(b.trips, 3)));
    const jitter = 1 + Math.random() * 0.15;
    const wait = Math.min(cap * 1.1, backoff * jitter);
    b.state = 'OPEN';
    b.openUntil = Date.now() + wait;
    b.trips++;
    b.probing = false;
    b.lastCategory = category;
  }

  private static onFailure(model: string, category: GeminiFailureCategory, retryAfterMs?: number): void {
    const b = this.getBreaker(model);
    const wasProbe = b.state === 'HALF_OPEN';
    b.consecutiveFailures++;
    b.lastCategory = category;
    switch (category) {
      case 'QUOTA_EXHAUSTED':
        this.openBreaker(model, category, this.quotaCooldownMs, retryAfterMs); // immediate: quota will not recover in ms
        break;
      case 'INVALID_CONFIGURATION':
        this.openBreaker(model, category, this.notFoundCooldownMs);
        break;
      case 'TEMPORARY_OVERLOAD':
      case 'TIMEOUT': {
        if (wasProbe || b.consecutiveFailures >= this.breakerFailureThreshold) {
          this.openBreaker(model, category, category === 'TIMEOUT' ? this.timeoutCooldownMs : this.overloadCooldownMs, retryAfterMs);
        } else {
          b.probing = false;
        }
        break;
      }
      default:
        b.probing = false;
    }
  }

  /** Read-only health view for diagnostics/tests (no secrets). */
  public static getHealthSnapshot(): Record<string, { state: BreakerState; retryInMs: number; lastCategory: GeminiFailureCategory | null }> {
    const now = Date.now();
    const out: Record<string, any> = {};
    for (const m of this.candidateModels) {
      const b = this.getBreaker(m);
      out[m] = { state: b.state, retryInMs: Math.max(0, b.openUntil - now), lastCategory: b.lastCategory };
    }
    return out;
  }

  public static resetForTests(): void {
    this.breakers.clear();
    this.waiters = [];
    this.inFlight = 0;
    this.lastCallTime = 0;
  }

  private static parseRetryAfterHeader(headerVal: string | null): number | undefined {
    if (!headerVal) return undefined;
    const clean = headerVal.trim();
    if (/^\d+$/.test(clean)) {
      return parseInt(clean, 10) * 1000;
    }
    const parsedDate = Date.parse(clean);
    if (!isNaN(parsedDate)) {
      return Math.max(0, parsedDate - Date.now());
    }
    return undefined;
  }

  private static classify(status: number, errMsg: string, headers?: any): {
    category: GeminiFailureCategory;
    retryAfterMs?: number;
    isProjectQuotaExhausted?: boolean;
  } {
    if (status === 401 || status === 403) return { category: 'AUTHENTICATION' };
    if (status === 429) {
      // 1. Check HTTP standard Retry-After header
      let retryAfterMs = headers?.get ? this.parseRetryAfterHeader(headers.get('retry-after')) : undefined;

      // 2. Check "retry in Xs" pattern in Google error message
      if (retryAfterMs === undefined) {
        const m = /retry in ([\d.]+)s/i.exec(errMsg);
        if (m) {
          retryAfterMs = Math.ceil(parseFloat(m[1]) * 1000);
        }
      }

      // Check if this is an explicit daily/project quota exhaustion or lacks short retry hint
      const isDailyOrProjectQuota =
        /daily quota|per-day|project quota|billing|exceeded your quota/i.test(errMsg) ||
        (retryAfterMs === undefined && /quota|exhausted/i.test(errMsg));

      return {
        category: 'QUOTA_EXHAUSTED',
        retryAfterMs,
        isProjectQuotaExhausted: isDailyOrProjectQuota
      };
    }
    if (status === 404 || status === 400) return { category: 'INVALID_CONFIGURATION' };
    if (status === 503 || status === 500 || status === 502 || status === 504) return { category: 'TEMPORARY_OVERLOAD' };
    return { category: 'UNKNOWN' };
  }

  private static sleepWithJitter(attempt: number): Promise<void> {
    const ms = this.backoffBaseMs * Math.pow(2, attempt) + Math.random() * 100;
    return new Promise(res => setTimeout(res, ms));
  }

  /**
   * Calls Gemini with bounded concurrency, per-model circuit breaking, at most `maxModelsPerCall` attempts
   * per call, exponential backoff with jitter, and fail-fast when every model is unhealthy.
   */
  public static async generateContent(params: GeminiCallParams): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new GeminiProviderError('INVALID_CONFIGURATION', undefined, 'GEMINI_API_KEY is not configured');
    }

    // Safeguard: Never invoke paid AI API calls during tests unless explicitly allowed
    if (process.env.NODE_ENV === 'test' && !process.env.ALLOW_PAID_AI_TESTS) {
      const isNative = typeof fetch === 'function' && fetch.toString().includes('[native code]');
      if (isNative && !process.env.GEMINI_MOCK_CALL_ALLOWED) {
        if (params.responseMimeType === 'application/json' || (params.prompt && params.prompt.includes('JSON'))) {
          return JSON.stringify([
            {
              question_text: "ما هو المفهوم العلمي الأساسي في هذا الدرس؟",
              options: [
                { text: "الخيار الأول الصحيح", is_correct: true },
                { text: "الخيار الثاني", is_correct: false },
                { text: "الخيار الثالث", is_correct: false },
                { text: "الخيار الرابع", is_correct: false }
              ],
              difficulty: "MEDIUM",
              bloom_level: "UNDERSTANDING",
              explanation: "تفسير تربوي اختباري دقيق."
            }
          ]);
        }
        return 'Mock test response';
      }
    }

    const parts: GeminiContentPart[] = params.parts ? [...params.parts] : [];
    if (params.prompt) parts.push({ text: params.prompt });
    const payload: any = {
      contents: [{ parts }],
      generationConfig: {
        temperature: params.temperature ?? 0.2,
        ...(params.responseMimeType ? { responseMimeType: params.responseMimeType } : {}),
        ...(params.maxOutputTokens ? { maxOutputTokens: params.maxOutputTokens } : {})
      }
    };
    if (params.systemInstruction) {
      payload.systemInstruction = { parts: [{ text: params.systemInstruction }] };
    }
    const timeout = params.timeoutMs ?? 25000;

    await this.acquireSlot(); // model choice below happens AFTER waiting, so queued callers see fresh breaker state
    try {
      // Pacing: reserve a distinct slot synchronously so parallel callers are staggered
      const now = Date.now();
      const slot = Math.max(now, this.lastCallTime + this.minIntervalMs);
      this.lastCallTime = slot;
      if (slot > now) await new Promise(res => setTimeout(res, slot - now));

      let lastFailure: GeminiProviderError | null = null;
      let attempts = 0;
      const ctx = params.context || params.telemetryContext || {};
      const correlationId = ctx.correlationId || ctx.generationSessionId || uuidv4();
      const modelsToTry = params.preferredModels?.length
        ? params.preferredModels
        : (params.preferredModel
            ? Array.from(new Set([params.preferredModel, ...this.candidateModels]))
            : this.candidateModels);

      for (const model of modelsToTry) {
        if (attempts >= this.maxModelsPerCall) break;
        if (!this.tryReserve(model)) continue;
        if (attempts > 0) await this.sleepWithJitter(attempts - 1);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        const callStartTime = Date.now();
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
              body: JSON.stringify(payload),
              signal: controller.signal
            }
          );
          clearTimeout(timer);
          const durationMs = Date.now() - callStartTime;

          if (res.ok) {
            const data = await res.json();
            const rawParts = data.candidates?.[0]?.content?.parts || [];
            const textParts = rawParts.filter((p: any) => !p.thought && typeof p.text === 'string' && p.text.trim().length > 0);
            const text = (textParts.length > 0 ? textParts : rawParts)
              .map((p: any) => p.text || '')
              .join('')
              .trim();
            if (text.length > 0) {
              this.onSuccess(model);

              // Record success telemetry safely (fail-open)
              try {
                const usage = data.usageMetadata;
                const promptTokens = typeof usage?.promptTokenCount === 'number' ? usage.promptTokenCount : 0;
                const candidatesTokens = typeof usage?.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : 0;
                const cachedTokens = typeof usage?.cachedContentTokenCount === 'number' ? usage.cachedContentTokenCount : 0;
                const thinkingDetails = (usage?.candidatesTokensDetails || []).find((d: any) => d.thought);
                const thinkingTokens = typeof thinkingDetails?.tokenCount === 'number' ? thinkingDetails.tokenCount : 0;
                const totalTokens = typeof usage?.totalTokenCount === 'number'
                  ? usage.totalTokenCount
                  : (promptTokens + candidatesTokens);
                const isEstimated = !usage;

                void AiUsageMetricsService.recordProviderCall({
                  correlationId,
                  studentId: ctx.studentId,
                  bookId: ctx.bookId,
                  chapterId: ctx.chapterId,
                  gradeId: ctx.gradeId,
                  subjectId: ctx.subjectId,
                  configHash: ctx.configHash,
                  cachedExamId: ctx.cachedExamId,
                  modelName: model,
                  promptTokens,
                  candidatesTokens,
                  cachedTokens,
                  thinkingTokens,
                  totalTokens,
                  durationMs,
                  isEstimated,
                  attemptNumber: attempts + 1,
                  callPurpose: ctx.workflow || ctx.callPurpose || 'EXAM_GENERATION'
                }).catch(e => console.warn('⚠️ [GeminiClient] Telemetry recordProviderCall error:', e?.message || e));
              } catch (tErr) {
                console.warn('⚠️ [GeminiClient] Telemetry dispatch error:', tErr);
              }

              return text;
            }
            this.onFailure(model, 'UNKNOWN');
            attempts++;
            lastFailure = new GeminiProviderError('UNKNOWN', undefined, 'empty response');

            try {
              await AiUsageMetricsService.recordProviderFailure({
                correlationId,
                studentId: ctx.studentId,
                bookId: ctx.bookId,
                chapterId: ctx.chapterId,
                gradeId: ctx.gradeId,
                subjectId: ctx.subjectId,
                configHash: ctx.configHash,
                cachedExamId: ctx.cachedExamId,
                modelName: model,
                errorCode: 'EMPTY_RESPONSE',
                durationMs,
                attemptNumber: attempts,
                callPurpose: ctx.workflow || ctx.callPurpose || 'EXAM_GENERATION'
              }).catch(e => console.warn('⚠️ [GeminiClient] Telemetry recordProviderFailure error:', e?.message || e));
            } catch (_) {}

            console.warn(`[GeminiClient] ${model} returned an empty response.`);
            continue;
          }

          const errorData = await res.json().catch(() => ({}));
          const errMsg: string = errorData.error?.message || `HTTP ${res.status}`;
          const { category, retryAfterMs, isProjectQuotaExhausted } = this.classify(res.status, errMsg, res.headers);
          console.warn(`[GeminiClient] ${model} failed: ${category} (HTTP ${res.status}).`);

          try {
            await AiUsageMetricsService.recordProviderFailure({
              correlationId,
              studentId: ctx.studentId,
              bookId: ctx.bookId,
              chapterId: ctx.chapterId,
              gradeId: ctx.gradeId,
              subjectId: ctx.subjectId,
              configHash: ctx.configHash,
              cachedExamId: ctx.cachedExamId,
              modelName: model,
              errorCode: category,
              durationMs,
              attemptNumber: attempts + 1,
              callPurpose: ctx.workflow || ctx.callPurpose || 'EXAM_GENERATION'
            }).catch(e => console.warn('⚠️ [GeminiClient] Telemetry recordProviderFailure error:', e?.message || e));
          } catch (_) {}

          if (category === 'AUTHENTICATION') {
            this.getBreaker(model).probing = false;
            throw new GeminiProviderError('AUTHENTICATION', undefined, String(res.status)); // fast-fail, never retried
          }
          this.onFailure(model, category, retryAfterMs);
          if (category !== 'QUOTA_EXHAUSTED' && category !== 'INVALID_CONFIGURATION') attempts++; // fast deterministic failures (429/404) open the breaker and don't consume the slow-attempt budget
          lastFailure = new GeminiProviderError(category, retryAfterMs);
          if (res.status === 400) break; // payload/config error is model-independent: do not amplify
          if (category === 'QUOTA_EXHAUSTED' && isProjectQuotaExhausted) {
            console.warn(`[GeminiClient] Project/daily quota exhausted on ${model}. Halting model retry cascade.`);
            break;
          }
        } catch (err: any) {
          clearTimeout(timer);
          const durationMs = Date.now() - callStartTime;
          if (err instanceof GeminiProviderError) {
            if (err.category === 'AUTHENTICATION') throw err;
            lastFailure = err;
            continue;
          }
          const isAbort = err?.name === 'AbortError' || /aborted/i.test(err?.message || '');
          const category: GeminiFailureCategory = isAbort ? 'TIMEOUT' : 'TEMPORARY_OVERLOAD';
          console.warn(`[GeminiClient] ${model} failed: ${category}.`);
          this.onFailure(model, category);
          attempts++;
          lastFailure = new GeminiProviderError(category);

          try {
            await AiUsageMetricsService.recordProviderFailure({
              correlationId,
              studentId: ctx.studentId,
              bookId: ctx.bookId,
              chapterId: ctx.chapterId,
              gradeId: ctx.gradeId,
              subjectId: ctx.subjectId,
              configHash: ctx.configHash,
              cachedExamId: ctx.cachedExamId,
              modelName: model,
              errorCode: category,
              durationMs,
              attemptNumber: attempts,
              callPurpose: ctx.workflow || ctx.callPurpose || 'EXAM_GENERATION'
            }).catch(e => console.warn('⚠️ [GeminiClient] Telemetry recordProviderFailure error:', e?.message || e));
          } catch (_) {}
        }
      }

      if (lastFailure) throw lastFailure;

      // Nothing was attempted: every model is cooling down -> fail fast with a classified error
      const now2 = Date.now();
      let retryIn = Infinity;
      let cat: GeminiFailureCategory = 'TEMPORARY_OVERLOAD';
      for (const m of this.candidateModels) {
        const b = this.getBreaker(m);
        const r = Math.max(0, b.openUntil - now2);
        if (r < retryIn) { retryIn = r; cat = b.lastCategory || cat; }
      }
      throw new GeminiProviderError(cat, Number.isFinite(retryIn) ? retryIn : undefined, 'all models cooling down');
    } finally {
      this.releaseSlot();
    }
  }
}
