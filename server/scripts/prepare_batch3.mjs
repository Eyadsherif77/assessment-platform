import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { createBookSnapshot } from './backup_book_preflight.mjs';
import { PDFDocument } from 'pdf-lib';

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
  console.log('🚀 BATCH 3 PREFLIGHT INITIALIZATION (BOOKS 9, 10, AND 11)');
  console.log('======================================================================\n');

  // 1. Verify Books 1 to 8 baseline
  console.log('--- STEP 1: VERIFYING BOOKS 1-8 BASELINE INTEGRITY ---');
  const baseline = [
    { num: 1, id: 'd7bbfca2-6d8f-461b-8e39-2015981e86ec', p: 102, c: 101 },
    { num: 2, id: 'f19276d3-4adb-4297-bb77-5ed87ba638b9', p: 113, c: 104 },
    { num: 3, id: '19886434-1839-427d-af31-4c64fcf79525', p: 130, c: 128 },
    { num: 4, id: '81b8a308-7fcf-4938-8c45-aa0056624f32', p: 106, c: 98 },
    { num: 5, id: '543f2746-460c-41c1-ba38-0933f479272f', p: 104, c: 97 },
    { num: 6, id: '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', p: 113, c: 87 },
    { num: 7, id: 'bc6bb834-7192-474c-8507-c53265028b4e', p: 162, c: 142 },
    { num: 8, id: '37bfa0c0-c4ce-419f-930a-000043d8d3f9', p: 114, c: 86 }
  ];

  for (const b of baseline) {
    const pRes = await db.query('SELECT count(*) as cnt FROM book_pages WHERE book_id = $1', [b.id]);
    const cRes = await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [b.id]);
    const p = Number(pRes.rows[0].cnt);
    const c = Number(cRes.rows[0].cnt);
    const ok = (p === b.p && c === b.c);
    console.log(`  Book ${b.num} [${b.id}]: Pages ${p}/${b.p}, Chunks ${c}/${b.c} -> ${ok ? 'PASSED ✅' : 'FAILED ❌'}`);
    if (!ok) throw new Error(`CRITICAL ABORT: Baseline mismatch on Book ${b.num}`);
  }

  // 2. Target Batch 3 Books
  const targets = [
    { num: 9, id: '0758fc7a-c9b2-4e25-a32b-6cacb6bb418d', label: 'Arabic Prep 1 (كتاب الغة العربية)', expectedPages: 142 },
    { num: 10, id: 'fa2a1525-c46f-4b34-9f48-b762be88e5c5', label: 'Social Studies Prep 1 (كتاب الدرسات الاجتماعية)', expectedPages: 110 },
    { num: 11, id: '808104ec-b861-434b-80c6-579f715d8bdf', label: 'Math Prep 1 (Math book)', expectedPages: 122 }
  ];

  console.log('\n--- STEP 2: CREATING PREFLIGHT SNAPSHOTS & RECONSTRUCTING PDFS ---');
  const snapshots = [];
  for (const t of targets) {
    console.log(`\n📸 Processing Preflight for Book ${t.num}: ${t.label} (ID: ${t.id})...`);
    
    // Create snapshot
    const snap = await createBookSnapshot(t.id);
    console.log(`  ✅ Preflight Snapshot created: ${snap.filePath}`);
    console.log(`     SHA-256 Checksum: ${snap.checksum}`);
    console.log(`     Snapshot row counts:`, snap.counts);

    // Reconstruct PDF
    const pdfInfo = await reconstructPdf(t.id);
    if (pdfInfo.pages !== t.expectedPages) {
      throw new Error(`CRITICAL ABORT: Page count mismatch for Book ${t.num}! PDF has ${pdfInfo.pages}, expected ${t.expectedPages}`);
    }

    snapshots.push({
      num: t.num,
      id: t.id,
      label: t.label,
      snapshotFile: snap.filePath,
      checksum: snap.checksum,
      pdfPath: pdfInfo.path,
      pages: pdfInfo.pages,
      size: pdfInfo.size
    });
  }

  console.log('\n======================================================================');
  console.log('🎉 ALL BATCH 3 PREFLIGHT SNAPSHOTS & RECONSTRUCTIONS COMPLETE!');
  console.log('======================================================================');
  console.log(JSON.stringify(snapshots, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal preflight error:', err);
  process.exit(1);
});
