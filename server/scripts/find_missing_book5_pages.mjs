import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  const bookId = '543f2746-460c-41c1-ba38-0933f479272f';
  const res = await db.query('SELECT page_number FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC', [bookId]);
  const pageNums = new Set(res.rows.map(r => Number(r.page_number)));
  const missing = [];
  for (let p = 1; p <= 104; p++) {
    if (!pageNums.has(p)) missing.push(p);
  }
  console.log(`Total in DB: ${res.rows.length} / 104`);
  console.log('Missing pages:', missing);

  process.exit(0);
}

main().catch(console.error);
