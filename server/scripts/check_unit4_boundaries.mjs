import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

const bookId = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec';

async function checkUnit4Boundaries() {
  console.log(`======================================================================`);
  console.log(`🪐 VERIFYING UNIT 4 BOUNDARIES & PAGES (PDF 86 - 102)`);
  console.log(`======================================================================\n`);

  const pagesRes = await db.query(
    'SELECT page_number, char_count, SUBSTRING(raw_text, 1, 150) as sample FROM book_pages WHERE book_id = $1 AND page_number >= 85 AND page_number <= 102 ORDER BY page_number ASC',
    [bookId]
  );

  for (const p of pagesRes.rows) {
    console.log(`[PDF Page ${p.page_number}] (${p.char_count} chars): "${p.sample.replace(/\n/g, ' ')}..."`);
  }
}

checkUnit4Boundaries().catch(console.error);
