import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const data = await res.json();
  const flashModels = (data.models || []).filter(m => m.name.includes('flash')).map(m => m.name);
  console.log('Available flash models:', flashModels);
}

main().catch(console.error);
