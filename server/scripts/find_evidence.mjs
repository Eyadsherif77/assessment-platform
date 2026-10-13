import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

const bookId = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec';

async function findEvidence() {
  console.log(`======================================================================`);
  console.log(`🔬 SEARCHING EXACT EVIDENCE FOR QUESTIONS IN BOOK_PAGES`);
  console.log(`======================================================================\n`);

  // 1. Search for Question 1: "Alkali" and "group 1A"
  console.log(`--- [Question 1 Evidence: Group 1A / Alkali Metals] ---`);
  const r1 = await db.query(
    'SELECT page_number, char_count, raw_text FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC',
    [bookId]
  );

  for (const p of r1.rows) {
    const text = p.raw_text.toLowerCase();
    if (text.includes('alkali') || text.includes('group 1a') || text.includes('1a')) {
      console.log(`Found on PDF Page ${p.page_number} (${p.char_count} chars):`);
      // Extract sentence
      const idx = text.indexOf('alkali') !== -1 ? text.indexOf('alkali') : text.indexOf('group 1a');
      const start = Math.max(0, idx - 100);
      const end = Math.min(p.raw_text.length, idx + 200);
      console.log(`Snippet: "...${p.raw_text.slice(start, end).replace(/\n/g, ' ')}..."\n`);
    }
  }

  // 2. Search for Question 2: "organic compounds" / "carbon"
  console.log(`--- [Question 2 Evidence: Carbon / Organic Compounds] ---`);
  for (const p of r1.rows) {
    const text = p.raw_text.toLowerCase();
    if (text.includes('organic compound') || (text.includes('carbon') && text.includes('organic'))) {
      console.log(`Found on PDF Page ${p.page_number} (${p.char_count} chars):`);
      const idx = text.indexOf('organic');
      const start = Math.max(0, idx - 100);
      const end = Math.min(p.raw_text.length, idx + 200);
      console.log(`Snippet: "...${p.raw_text.slice(start, end).replace(/\n/g, ' ')}..."\n`);
    }
  }
}

findEvidence().catch(console.error);
