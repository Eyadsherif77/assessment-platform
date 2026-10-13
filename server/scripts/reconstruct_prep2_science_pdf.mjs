import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

async function reconstructBook5Pdf() {
  const bookId = '543f2746-460c-41c1-ba38-0933f479272f';
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const diskPdfPath = path.resolve(uploadsDir, `book_${bookId}.pdf`);

  console.log(`Reconstructing PDF for Book 5 (${bookId}) from read-only book_pdf_chunks...`);
  const countRes = await db.query('SELECT COUNT(*) as cnt FROM book_pdf_chunks WHERE book_id = $1', [bookId]);
  const totalChunks = parseInt(countRes.rows[0]?.cnt || '0', 10);
  console.log(`Total chunks in DB: ${totalChunks}`);

  const buffers = [];
  const BATCH_SIZE = 4;
  for (let c = 0; c < totalChunks; c += BATCH_SIZE) {
    const endC = Math.min(totalChunks - 1, c + BATCH_SIZE - 1);
    const batchRes = await db.query(
      'SELECT chunk_index, chunk_data FROM book_pdf_chunks WHERE book_id = $1 AND chunk_index >= $2 AND chunk_index <= $3 ORDER BY chunk_index ASC',
      [bookId, c, endC]
    );
    for (const r of batchRes.rows) {
      buffers.push(Buffer.isBuffer(r.chunk_data) ? r.chunk_data : Buffer.from(r.chunk_data));
    }
  }

  const pdfBuf = Buffer.concat(buffers);
  fs.writeFileSync(diskPdfPath, pdfBuf);
  console.log(`Saved reconstructed PDF to: ${diskPdfPath} (${(pdfBuf.length / (1024 * 1024)).toFixed(2)} MB)`);

  const pdfDoc = await PDFDocument.load(pdfBuf);
  const totalPages = pdfDoc.getPageCount();
  console.log(`=== PDF INTEGRITY CHECK ===`);
  console.log(`File Size: ${(pdfBuf.length / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Verified Total PDF Pages: ${totalPages}`);
  console.log(`Header: ${pdfBuf.subarray(0, 10).toString('ascii')}`);
}

reconstructBook5Pdf().catch(err => {
  console.error('Error reconstructing PDF:', err);
  process.exit(1);
});
