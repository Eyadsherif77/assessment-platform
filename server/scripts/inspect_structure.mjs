import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';

async function inspectPdfStructure() {
  const bookId = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec'; // Science Prep 1
  console.log('Downloading chunks in batches for Book 3...');
  const countRes = await db.query(
    'SELECT COUNT(*) as cnt FROM book_pdf_chunks WHERE book_id = $1',
    [bookId]
  );
  const totalChunks = parseInt(countRes.rows[0]?.cnt || '0', 10);
  console.log(`Total chunks: ${totalChunks}`);

  const buffers = [];
  for (let i = 0; i < totalChunks; i++) {
    const chunkRes = await db.query(
      'SELECT chunk_data FROM book_pdf_chunks WHERE book_id = $1 AND chunk_index = $2',
      [bookId, i]
    );
    const raw = chunkRes.rows[0].chunk_data;
    buffers.push(Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
  }
  const pdfBuffer = Buffer.concat(buffers);
  console.log(`Assembled PDF size: ${(pdfBuffer.length / (1024*1024)).toFixed(2)} MB`);

  // Let's check some text search in the raw PDF
  const pdfString = pdfBuffer.toString('binary');
  const hasImages = (pdfString.match(/\/Subtype\s*\/Image/g) || []).length;
  const hasFonts = (pdfString.match(/\/Type\s*\/Font/g) || []).length;
  console.log(`PDF structural elements: Image count = ${hasImages}, Font count = ${hasFonts}`);

  // Let's also check another book, e.g. English or Arabic book
  const booksRes = await db.query('SELECT id, title_ar, title_en, grade_id, subject_id FROM books');
  console.log('\nAll 13 books in TiDB:');
  for (const b of booksRes.rows) {
    console.log(`- ${b.id}: [Grade: ${b.grade_id}] [Subject: ${b.subject_id}] ${b.title_ar} (${b.title_en})`);
  }

  process.exit(0);
}

inspectPdfStructure().catch(err => {
  console.error(err);
  process.exit(1);
});
