import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

async function verifyGeminiVision() {
  const apiKey = process.env.GEMINI_API_KEY;
  const candidateModels = [
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash'
  ];

  for (const m of candidateModels) {
    const t0 = Date.now();
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hello, respond with {"status": "ok"} in JSON format.' }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });
      const data = await res.json();
      const dt = Date.now() - t0;
      if (res.ok) {
        console.log(`✅ Model ${m}: OK (${dt}ms) -> response:`, data.candidates?.[0]?.content?.parts?.[0]?.text?.trim());
      } else {
        console.log(`❌ Model ${m}: FAILED (${dt}ms) ->`, data.error?.message?.slice(0, 100));
      }
    } catch (err) {
      console.log(`❌ Model ${m}: Error ->`, err.message);
    }
  }
}

verifyGeminiVision().catch(console.error);
