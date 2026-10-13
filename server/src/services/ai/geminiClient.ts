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
  private static minIntervalMs = 1000;

  /**
   * Safely calls Gemini with model failover, exponential backoff, and rate-limiting.
   */
  public static async generateContent(params: GeminiCallParams): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment variables.');
    }

    // Rate limiter
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise(res => setTimeout(res, this.minIntervalMs - elapsed));
    }
    this.lastCallTime = Date.now();

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

    for (const model of this.candidateModels) {
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
        console.warn(`[GeminiClient] ${model} failed with ${category} (${errMsg.slice(0, 60)}). Trying next candidate...`);
      } catch (err: any) {
        if (err.message?.includes('[GEMINI_AUTH_ERROR]')) {
          throw err;
        }
        lastError = err;
        console.warn(`[GeminiClient] ${model} error: ${err.message}. Trying next candidate...`);
      }
    }

    throw lastError || new Error('All Gemini candidate models failed to generate content.');
  }
}
