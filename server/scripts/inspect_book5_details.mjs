import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  const bookId = '543f2746-460c-41c1-ba38-0933f479272f';
  const res = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
  console.log('Book 5 row:', JSON.stringify(res.rows[0], null, 2));

  const chRes = await db.query('SELECT * FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC', [bookId]);
  console.log('Book 5 existing chapters:', JSON.stringify(chRes.rows, null, 2));

  const pdfCount = await db.query('SELECT count(*) as cnt, sum(length(chunk_data)) as total_bytes FROM book_pdf_chunks WHERE book_id = $1', [bookId]);
  console.log('Book 5 PDF chunks:', pdfCount.rows[0]);

  process.exit(0);
}

main().catch(console.error);
