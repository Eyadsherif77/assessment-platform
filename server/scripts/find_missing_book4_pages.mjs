import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  const bookId = '81b8a308-7fcf-4938-8c45-aa0056624f32';
  const res = await db.query('SELECT page_number, char_count FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC', [bookId]);
  const existing = new Set(res.rows.map(r => Number(r.page_number)));
  const missing = [];
  for (let i = 1; i <= 106; i++) {
    if (!existing.has(i)) missing.push(i);
  }
  console.log(`Total pages in DB: ${res.rows.length}`);
  console.log('Missing pages:', missing);

  // Check for duplicates
  const pageCounts = {};
  res.rows.forEach(r => {
    pageCounts[r.page_number] = (pageCounts[r.page_number] || 0) + 1;
  });
  const dups = Object.entries(pageCounts).filter(([k, v]) => v > 1);
  console.log('Duplicate pages:', dups);

  // Check for any pages with char_count < 50
  const shortPages = res.rows.filter(r => Number(r.char_count) < 50);
  console.log('Pages with char_count < 50:', shortPages);

  process.exit(0);
}

main().catch(console.error);
