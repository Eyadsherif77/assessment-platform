import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  const bookId = '21e1d639-9f59-4a58-a8f8-8373b8e7fc90';
  const pagesRes = await db.query(
    'SELECT count(*) as count, sum(char_count) as total_chars FROM book_pages WHERE book_id = $1',
    [bookId]
  );
  const chunksRes = await db.query(
    'SELECT count(*) as count FROM book_chunks WHERE book_id = $1',
    [bookId]
  );
  const missingPagesRes = await db.query(
    'SELECT page_number FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC',
    [bookId]
  );
  const existingSet = new Set(missingPagesRes.rows.map(r => Number(r.page_number)));
  const missing = [];
  for (let i = 1; i <= 113; i++) {
    if (!existingSet.has(i)) missing.push(i);
  }
  console.log(`Book 6 Pages in DB: ${pagesRes.rows[0].count}/113 (Total Chars: ${pagesRes.rows[0].total_chars})`);
  console.log(`Book 6 Chunks in DB: ${chunksRes.rows[0].count}`);
  console.log(`Missing PDF Pages so far: ${missing.length > 0 ? missing.join(', ') : 'None'}`);
}

main().catch(console.error);
