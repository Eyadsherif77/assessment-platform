import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

async function testGeminiModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const data = await res.json();
  if (data.models) {
    console.log('Available models:');
    const flashModels = data.models.filter(m => m.name.includes('flash') || m.name.includes('gemini'));
    for (const m of flashModels) {
      console.log(`- ${m.name} (${m.displayName}) - inputModalities:`, m.inputModalities || m.supportedGenerationMethods);
    }
  } else {
    console.error('Error listing models:', data);
  }
}

testGeminiModels().catch(console.error);
