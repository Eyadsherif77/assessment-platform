import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  const bookId = '81b8a308-7fcf-4938-8c45-aa0056624f32';
  const pRes = await db.query(
    'SELECT page_number, char_count, SUBSTRING(raw_text, 1, 150) as snippet FROM book_pages WHERE book_id = $1 AND page_number <= 6 ORDER BY page_number ASC',
    [bookId]
  );
  console.log('Intro Pages:', pRes.rows);

  const cRes = await db.query(
    'SELECT id, page_number, chapter_id, SUBSTRING(content, 1, 150) as snippet FROM book_chunks WHERE book_id = $1 AND page_number <= 6 ORDER BY page_number ASC',
    [bookId]
  );
  console.log('Intro Chunks:', cRes.rows);

  process.exit(0);
}

main().catch(console.error);
