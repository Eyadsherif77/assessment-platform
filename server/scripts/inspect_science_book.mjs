import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

async function inspectScienceBook() {
  const bookId = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec';

  console.log(`=== 1. BOOK METADATA ===`);
  const bRes = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
  console.log(bRes.rows[0]);

  console.log(`\n=== 2. CHAPTERS / UNITS IN DB ===`);
  const chRes = await db.query(
    'SELECT id, chapter_number, title_ar, title_en, start_page, end_page, description FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC',
    [bookId]
  );
  console.log(JSON.stringify(chRes.rows, null, 2));

  console.log(`\n=== 3. BOOK PAGES IN DB ===`);
  const pRes = await db.query(
    'SELECT page_number, char_count, SUBSTRING(raw_text, 1, 120) as sample_text FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC',
    [bookId]
  );
  console.table(pRes.rows);

  console.log(`\n=== 4. BOOK CHUNKS IN DB ===`);
  const ckRes = await db.query(
    'SELECT id, chapter_id, page_number, chunk_index, LENGTH(content) as content_len, SUBSTRING(content, 1, 100) as sample_content FROM book_chunks WHERE book_id = $1 ORDER BY page_number ASC',
    [bookId]
  );
  console.table(ckRes.rows);

  console.log(`\n=== 5. ORIGINAL PDF & CHUNKS IN DB ===`);
  const chunksCount = await db.query('SELECT COUNT(*) as cnt, SUM(LENGTH(chunk_data)) as total_size FROM book_pdf_chunks WHERE book_id = $1', [bookId]);
  console.log(`Stored PDF chunks in TiDB:`, chunksCount.rows[0]);

  const result = {
    book: bRes.rows[0],
    chapters: chRes.rows,
    pages: pRes.rows,
    chunks: ckRes.rows,
    pdfChunksInDb: chunksCount.rows[0]
  };

  fs.writeFileSync('./scripts/science_book_inspection.json', JSON.stringify(result, null, 2), 'utf-8');
  console.log('✅ Inspection data written to ./scripts/science_book_inspection.json');
}

inspectScienceBook().catch(console.error);
