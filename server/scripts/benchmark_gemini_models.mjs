import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const apiKey = process.env.GEMINI_API_KEY;
const models = ['gemini-3.5-flash-lite', 'gemini-3.7-flash', 'gemini-3-flash-preview'];

async function testModel(m) {
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Respond with OK' }] }] }),
      signal: controller.signal
    });
    clearTimeout(timer);
    const data = await res.json();
    console.log(`Model ${m}: ${res.status} in ${Date.now() - t0}ms`);
  } catch (err) {
    console.log(`Model ${m}: ERROR ${err.message} in ${Date.now() - t0}ms`);
  }
}

async function main() {
  for (const m of models) {
    await testModel(m);
  }
}

main().catch(console.error);
