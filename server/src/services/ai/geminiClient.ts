import dotenv from 'dotenv';
dotenv.config();

export interface GeminiContentPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string; // Base64
  };
}

export interface GeminiCallParams {
  systemInstruction?: string;
  prompt?: string;
  parts?: GeminiContentPart[];
  temperature?: number;
  responseMimeType?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
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
    'gemini-flash-latest',             // primary — latest stable Flash (verified 200 OK on Google API)
    'gemini-3-flash-preview',          // fallback 1 — next-gen flash preview
    'gemini-pro-latest',               // fallback 2 — latest stable Pro
    'gemini-3.1-flash-lite-preview'    // fallback 3 — lightweight flash
  ].filter(Boolean)));

  // ---- Tunables (documented in docs/phase4g3ap_provider_reliability.md) ----
  public static maxConcurrentCalls = num(process.env.GEMINI_MAX_CONCURRENCY, 3);
  public static queueTimeoutMs = 15_000;
  public static maxModelsPerCall = 2;
  public static quotaCooldownMs = 60_000;
  public static notFoundCooldownMs = 10 * 60_000;
  public static overloadCooldownMs = 20_000;
  public static timeoutCooldownMs = 45_000;
  public static maxCooldownMs = 5 * 60_000;
  public static breakerFailureThreshold = 2; // consecutive 503/timeout failures before opening
  public static backoffBaseMs = 150;
  public static minIntervalMs = 250;

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
    const cap = Math.max(this.maxCooldownMs, baseMs);
    const backoff = Math.min(cap, baseMs * Math.pow(2, Math.min(b.trips, 3)));
    const jitter = 1 + Math.random() * 0.2;
    const wait = Math.min(cap * 1.2, Math.max(retryAfterMs || 0, backoff) * jitter);
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

  private static classify(status: number, errMsg: string): { category: GeminiFailureCategory; retryAfterMs?: number } {
    if (status === 401 || status === 403) return { category: 'AUTHENTICATION' };
    if (status === 429) {
      const m = /retry in ([\d.]+)s/i.exec(errMsg);
      return { category: 'QUOTA_EXHAUSTED', retryAfterMs: m ? Math.ceil(parseFloat(m[1]) * 1000) : undefined };
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

      for (const model of this.candidateModels) {
        if (attempts >= this.maxModelsPerCall) break;
        if (!this.tryReserve(model)) continue;
        if (attempts > 0) await this.sleepWithJitter(attempts - 1);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
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
              return text;
            }
            this.onFailure(model, 'UNKNOWN');
            attempts++;
            lastFailure = new GeminiProviderError('UNKNOWN', undefined, 'empty response');
            console.warn(`[GeminiClient] ${model} returned an empty response.`);
            continue;
          }

          const errorData = await res.json().catch(() => ({}));
          const errMsg: string = errorData.error?.message || `HTTP ${res.status}`;
          const { category, retryAfterMs } = this.classify(res.status, errMsg);
          console.warn(`[GeminiClient] ${model} failed: ${category} (HTTP ${res.status}).`);

          if (category === 'AUTHENTICATION') {
            this.getBreaker(model).probing = false;
            throw new GeminiProviderError('AUTHENTICATION', undefined, String(res.status)); // fast-fail, never retried
          }
          this.onFailure(model, category, retryAfterMs);
          if (category !== 'QUOTA_EXHAUSTED' && category !== 'INVALID_CONFIGURATION') attempts++; // fast deterministic failures (429/404) open the breaker and don't consume the slow-attempt budget
          lastFailure = new GeminiProviderError(category, retryAfterMs);
          if (res.status === 400) break; // payload/config error is model-independent: do not amplify
        } catch (err: any) {
          clearTimeout(timer);
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
