import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

const bookId = 'fa2a1525-c46f-4b34-9f48-b762be88e5c5';

async function main() {
  const check = await db.query(
    'SELECT id, page_number, chapter_id FROM book_chunks WHERE book_id = $1 AND (page_number < 7 OR page_number > 96)',
    [bookId]
  );
  console.log(`Found ${check.rows.length} out-of-boundary chunks for Book 10:`, check.rows);

  if (check.rows.length > 0) {
    const del = await db.query(
      'DELETE FROM book_chunks WHERE book_id = $1 AND (page_number < 7 OR page_number > 96)',
      [bookId]
    );
    console.log('Deleted out-of-boundary chunks.');
  }

  const minMax = await db.query(
    'SELECT min(page_number) as min_p, max(page_number) as max_p, count(*) as cnt FROM book_chunks WHERE book_id = $1',
    [bookId]
  );
  console.log('Book 10 remaining chunks:', minMax.rows[0]);
}

main().catch(console.error);
