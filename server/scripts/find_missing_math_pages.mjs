import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

const bookId = '19886434-1839-427d-af31-4c64fcf79525'; // Math Prep 2

async function findMissingPages() {
  const r = await db.query(
    'SELECT page_number, char_count FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC',
    [bookId]
  );

  const present = new Set(r.rows.map(x => x.page_number));
  const missing = [];
  for (let i = 1; i <= 130; i++) {
    if (!present.has(i)) {
      missing.push(i);
    }
  }

  console.log(`Present pages count: ${r.rows.length}`);
  console.log(`Missing page numbers in 1..130 (${missing.length}):`, missing);

  process.exit(0);
}

findMissingPages().catch(err => {
  console.error(err);
  process.exit(1);
});
