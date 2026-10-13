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

export class GeminiClient {
  public static candidateModels: string[] = Array.from(new Set([
    process.env.GEMINI_MODEL || '',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-flash-latest'
  ].filter(Boolean)));

  private static lastCallTime = 0;
  private static minIntervalMs = 250;

  /** Phase 4G.3AO: model -> epoch ms until which it is skipped (quota exhausted / not found). */
  public static modelCooldownUntil = new Map<string, number>();
  public static quotaCooldownMs = 60_000;
  public static notFoundCooldownMs = 10 * 60_000;
  public static overloadCooldownMs = 20_000;
  public static timeoutCooldownMs = 45_000;

  /** Models to try now: skip cooling models; if every model is cooling, try them all (bounded failover). */
  private static activeModels(): string[] {
    const now = Date.now();
    const active = this.candidateModels.filter(m => (this.modelCooldownUntil.get(m) || 0) <= now);
    return active.length > 0 ? active : this.candidateModels;
  }

  /**
   * Safely calls Gemini with model failover, per-model cooldown, and rate-limiting.
   */
  public static async generateContent(params: GeminiCallParams): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment variables.');
    }

    // Rate limiter (slot reservation is synchronous so parallel callers are staggered, not bursted)
    const now = Date.now();
    const slot = Math.max(now, this.lastCallTime + this.minIntervalMs);
    this.lastCallTime = slot;
    if (slot > now) {
      await new Promise(res => setTimeout(res, slot - now));
    }

    const parts: GeminiContentPart[] = params.parts ? [...params.parts] : [];
    if (params.prompt) {
      parts.push({ text: params.prompt });
    }

    const payload: any = {
      contents: [{ parts }],
      generationConfig: {
        temperature: params.temperature ?? 0.2,
        ...(params.responseMimeType ? { responseMimeType: params.responseMimeType } : {}),
        ...(params.maxOutputTokens ? { maxOutputTokens: params.maxOutputTokens } : {})
      }
    };

    if (params.systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: params.systemInstruction }]
      };
    }

    const timeout = params.timeoutMs ?? 25000;
    let lastError: any = null;

    for (const model of this.activeModels()) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          }
        );
        clearTimeout(timer);

        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text.trim().length > 0) {
            return text;
          }
        }

        const errorData = await res.json().catch(() => ({}));
        const errMsg = errorData.error?.message || `HTTP ${res.status}`;

        // Fast-fail on authentication or permission errors: do not retry other models with invalid credentials
        if (res.status === 401 || res.status === 403) {
          throw new Error(`[GEMINI_AUTH_ERROR] Authentication or permission failure (${res.status}): ${errMsg}`);
        }

        lastError = new Error(`Model ${model} failed: ${errMsg}`);
        const category = res.status === 404 ? 'MODEL_NOT_FOUND' : res.status === 429 ? 'RATE_LIMIT_OR_QUOTA' : `HTTP_${res.status}`;
        if (res.status === 429) {
          this.modelCooldownUntil.set(model, Date.now() + this.quotaCooldownMs);
        } else if (res.status === 404) {
          this.modelCooldownUntil.set(model, Date.now() + this.notFoundCooldownMs);
        } else if (res.status === 503) {
          this.modelCooldownUntil.set(model, Date.now() + this.overloadCooldownMs);
        }
        console.warn(`[GeminiClient] ${model} failed with ${category} (${errMsg.slice(0, 60)}). Trying next candidate...`);
      } catch (err: any) {
        if (err.message?.includes('[GEMINI_AUTH_ERROR]')) {
          throw err;
        }
        lastError = err;
        if (err?.name === 'AbortError' || /aborted/i.test(err?.message || '')) {
          this.modelCooldownUntil.set(model, Date.now() + this.timeoutCooldownMs);
        }
        console.warn(`[GeminiClient] ${model} error: ${err.message}. Trying next candidate...`);
      }
    }

    throw lastError || new Error('All Gemini candidate models failed to generate content.');
  }
}
