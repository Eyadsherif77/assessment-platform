import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

async function downloadAndInspectPdf() {
  const bookId = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec';
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const diskPdfPath = path.resolve(uploadsDir, `book_${bookId}.pdf`);

  let pdfBuf;
  if (fs.existsSync(diskPdfPath)) {
    console.log(`Loading cached PDF from disk: ${diskPdfPath}`);
    pdfBuf = fs.readFileSync(diskPdfPath);
  } else {
    console.log(`Downloading chunks from TiDB...`);
    const countRes = await db.query('SELECT COUNT(*) as cnt FROM book_pdf_chunks WHERE book_id = $1', [bookId]);
    const totalChunks = parseInt(countRes.rows[0]?.cnt || '0', 10);
    console.log(`Total chunks: ${totalChunks}`);

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
    pdfBuf = Buffer.concat(buffers);
    fs.writeFileSync(diskPdfPath, pdfBuf);
    console.log(`Reconstructed and saved to: ${diskPdfPath} (${(pdfBuf.length / (1024 * 1024)).toFixed(2)} MB)`);
  }

  const pdfDoc = await PDFDocument.load(pdfBuf);
  const totalPages = pdfDoc.getPageCount();
  console.log(`=== PDF INTEGRITY CHECK ===`);
  console.log(`File Size: ${(pdfBuf.length / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Verified Total PDF Pages: ${totalPages}`);
  console.log(`Header: ${pdfBuf.subarray(0, 10).toString('ascii')}`);
}

downloadAndInspectPdf().catch(console.error);
