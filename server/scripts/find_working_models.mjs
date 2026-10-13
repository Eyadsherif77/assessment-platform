import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

async function findWorkingModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const models = [
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-3.1-flash-lite-preview',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash'
  ];

  for (const m of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Respond with: {"ok": true}' }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`✅ WORKING: ${m}`);
      } else {
        console.log(`❌ ${m}: ${res.status} -> ${data.error?.message?.slice(0, 80)}`);
      }
    } catch (e) {
      console.log(`❌ ${m}: Error -> ${e.message}`);
    }
  }
}

findWorkingModels().catch(console.error);
