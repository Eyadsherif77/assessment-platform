import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

async function main() {
  const t0 = Date.now();
  console.log('Testing Gemini API latency...');
  const res = await GeminiClient.generateContent({
    prompt: 'Return JSON: {"status": "ok", "latency": true}',
    responseMimeType: 'application/json',
    timeoutMs: 10000
  });
  console.log(`Gemini responded in ${Date.now() - t0}ms:`, res);
}

main().catch(console.error);
