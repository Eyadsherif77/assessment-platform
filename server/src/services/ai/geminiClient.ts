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
  private static candidateModels: string[] = [
    process.env.GEMINI_MODEL || '',
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-2.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.1-flash-lite-preview'
  ].filter(Boolean);

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

    const timeout = params.timeoutMs ?? 60000;
    let lastError: any = null;

    for (const model of this.candidateModels) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        lastError = new Error(`Model ${model} failed: ${errMsg}`);
        console.warn(`[GeminiClient] ${model} returned ${res.status} (${errMsg.slice(0, 60)}). Trying next candidate...`);
      } catch (err: any) {
        lastError = err;
        console.warn(`[GeminiClient] ${model} error: ${err.message}. Trying next candidate...`);
      }
    }

    throw lastError || new Error('All Gemini candidate models failed to generate content.');
  }
}
