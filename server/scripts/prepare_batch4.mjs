import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';

const B12_ID = '013411b8-edec-477b-bd42-3dbdda9fb6a9';
const B13_ID = '9e702109-7d92-445c-b814-567c1f6cba49';

async function reconstructPdf(bookId) {
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const diskPdfPath = path.resolve(uploadsDir, `book_${bookId}.pdf`);

  console.log(`Reconstructing PDF for ${bookId} from book_pdf_chunks...`);
  const countRes = await db.query('SELECT COUNT(*) as cnt FROM book_pdf_chunks WHERE book_id = $1', [bookId]);
  const totalChunks = parseInt(countRes.rows[0]?.cnt || '0', 10);

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
  console.log(`  ✅ Saved PDF to: ${diskPdfPath} (${(pdfBuf.length / (1024 * 1024)).toFixed(2)} MB)`);

  const pdfDoc = await PDFDocument.load(pdfBuf);
  const totalPages = pdfDoc.getPageCount();
  console.log(`  ✅ Verified Total PDF Pages: ${totalPages}`);
  return { path: diskPdfPath, pages: totalPages, size: pdfBuf.length };
}

async function main() {
  console.log('======================================================================');
  console.log('🚀 BATCH 4 PREFLIGHT RECONSTRUCTION (BOOKS 12 AND 13)');
  console.log('======================================================================\n');

  // 1. Verify Books 1 to 11 baseline
  console.log('--- STEP 1: VERIFYING BOOKS 1-11 BASELINE INTEGRITY ---');
  const baseline = [
    { num: 1, id: 'd7bbfca2-6d8f-461b-8e39-2015981e86ec', p: 102, c: 101, title: 'English Prep 3' },
    { num: 2, id: 'f19276d3-4adb-4297-bb77-5ed87ba638b9', p: 113, c: 104, title: 'Social Studies Prep 3' },
    { num: 3, id: '19886434-1839-427d-af31-4c64fcf79525', p: 130, c: 128, title: 'Science Prep 2' },
    { num: 4, id: '81b8a308-7fcf-4938-8c45-aa0056624f32', p: 106, c: 98, title: 'Social Studies Prep 2' },
    { num: 5, id: '543f2746-460c-41c1-ba38-0933f479272f', p: 104, c: 97, title: 'Math Prep 2' },
    { num: 6, id: '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', p: 113, c: 87, title: 'English Prep 1' },
    { num: 7, id: 'bc6bb834-7192-474c-8507-c53265028b4e', p: 162, c: 142, title: 'Arabic Prep 2' },
    { num: 8, id: '37bfa0c0-c4ce-419f-930a-000043d8d3f9', p: 114, c: 86, title: 'English Prep 2' },
    { num: 9, id: '0758fc7a-c9b2-4e25-a32b-6cacb6bb418d', p: 142, c: 119, title: 'Arabic Prep 1' },
    { num: 10, id: 'fa2a1525-c46f-4b34-9f48-b762be88e5c5', p: 110, c: 90, title: 'Social Studies Prep 1' },
    { num: 11, id: '808104ec-b861-434b-80c6-579f715d8bdf', p: 122, c: 104, title: 'Math Prep 1' }
  ];

  let baselineOk = true;
  for (const b of baseline) {
    const pRes = await db.query('SELECT count(*) as cnt FROM book_pages WHERE book_id = $1', [b.id]);
    const cRes = await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [b.id]);
    const p = Number(pRes.rows[0].cnt);
    const c = Number(cRes.rows[0].cnt);
    const pass = (p === b.p && c === b.c);
    if (!pass) baselineOk = false;
    console.log(`  Book ${b.num} [${b.title}]: Pages ${p}/${b.p}, Chunks ${c}/${b.c} -> ${pass ? 'PASSED ✅' : 'FAILED ❌'}`);
  }

  if (!baselineOk) {
    throw new Error('Baseline check failed for Books 1-11! Aborting.');
  }

  // 2. Reconstruct PDFs
  console.log('\n--- STEP 2: RECONSTRUCTING SOURCE PDFS FOR BATCH 4 ---');
  console.log('Reconstructing Book 12 (Arabic Prep 3)...');
  const b12Pdf = await reconstructPdf(B12_ID);

  console.log('\nReconstructing Book 13 (English Prep 3)...');
  const b13Pdf = await reconstructPdf(B13_ID);

  console.log('\n======================================================================');
  console.log('✅ BATCH 4 RECONSTRUCTION COMPLETE');
  console.log(`  Book 12: ${b12Pdf.pages} pages, ${(b12Pdf.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Book 13: ${b13Pdf.pages} pages, ${(b13Pdf.size / 1024 / 1024).toFixed(2)} MB`);
  console.log('======================================================================');
}

main().catch(err => {
  console.error('Fatal reconstruction error:', err);
  process.exit(1);
});
