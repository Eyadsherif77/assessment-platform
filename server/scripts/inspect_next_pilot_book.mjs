import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

const targetBookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9'; // Prep 3 Social Studies

async function inspectNextPilot() {
  console.log(`======================================================================`);
  console.log(`📖 STEP 2: PRE-PROCESSING INSPECTION FOR NEXT PILOT BOOK`);
  console.log(`Target Book ID: ${targetBookId} (كتاب الدراسات الاجتماعية - الصف الثالث الإعدادي)`);
  console.log(`======================================================================\n`);

  // 1. Database Book Record
  const bRes = await db.query(
    `SELECT b.*, g.name_ar as grade_name, s.name_ar as subject_name, s.code as subject_code
     FROM books b
     LEFT JOIN grades g ON b.grade_id = g.id
     LEFT JOIN subjects s ON b.subject_id = s.id
     WHERE b.id = $1`,
    [targetBookId]
  );
  const book = bRes.rows[0];
  console.log(`Book Record:`, {
    title: book.title_ar,
    grade: book.grade_name,
    subject: book.subject_name,
    term: book.term,
    school_type: book.school_type,
    total_pages_db: book.total_pages,
    status: book.processing_status
  });

  // 2. Existing Chapters
  const chRes = await db.query(
    `SELECT id, chapter_number, title_ar, title_en, start_page, end_page, description
     FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC`,
    [targetBookId]
  );
  console.log(`\nExisting Chapters in DB (${chRes.rows.length}):`);
  console.table(chRes.rows);

  // 3. Existing Pages & Chunks
  const pRes = await db.query(
    `SELECT page_number, char_count, SUBSTRING(raw_text, 1, 100) as sample FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC`,
    [targetBookId]
  );
  console.log(`\nExisting Pages in DB (${pRes.rows.length}):`);
  console.table(pRes.rows);

  // 4. Verify PDF Chunks in TiDB
  const chunksCount = await db.query(
    `SELECT COUNT(*) as cnt, MIN(chunk_index) as min_idx, MAX(chunk_index) as max_idx
     FROM book_pdf_chunks WHERE book_id = $1`,
    [targetBookId]
  );
  console.log(`\nTiDB PDF Chunks:`, chunksCount.rows[0]);

  // 5. Reconstruct and Cache PDF
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const diskPdfPath = path.resolve(uploadsDir, `book_${targetBookId}.pdf`);

  let pdfBuf;
  if (fs.existsSync(diskPdfPath)) {
    console.log(`Using cached PDF: ${diskPdfPath}`);
    pdfBuf = fs.readFileSync(diskPdfPath);
  } else {
    console.log(`Downloading ${chunksCount.rows[0].cnt} chunks in batches...`);
    const totalChunks = parseInt(chunksCount.rows[0].cnt, 10);
    const buffers = [];
    const BATCH_SIZE = 4;
    for (let c = 0; c < totalChunks; c += BATCH_SIZE) {
      const endC = Math.min(totalChunks - 1, c + BATCH_SIZE - 1);
      const batchRes = await db.query(
        'SELECT chunk_index, chunk_data FROM book_pdf_chunks WHERE book_id = $1 AND chunk_index >= $2 AND chunk_index <= $3 ORDER BY chunk_index ASC',
        [targetBookId, c, endC]
      );
      for (const r of batchRes.rows) {
        buffers.push(Buffer.isBuffer(r.chunk_data) ? r.chunk_data : Buffer.from(r.chunk_data));
      }
    }
    pdfBuf = Buffer.concat(buffers);
    fs.writeFileSync(diskPdfPath, pdfBuf);
    console.log(`Saved reconstructed PDF to: ${diskPdfPath} (${(pdfBuf.length / (1024 * 1024)).toFixed(2)} MB)`);
  }

  // 6. PDF Integrity & Type Check (Scanned vs Digital)
  const pdfDoc = await PDFDocument.load(pdfBuf);
  const totalPages = pdfDoc.getPageCount();
  console.log(`\nPDF Integrity:`);
  console.log(`- Header: ${pdfBuf.subarray(0, 10).toString('ascii')}`);
  console.log(`- Total Verified PDF Pages: ${totalPages}`);
  console.log(`- Stored total_pages in DB: ${book.total_pages}`);

  // Test whether text can be extracted digitally via pdf-lib / font inspection
  const page0 = pdfDoc.getPage(0);
  const hasDigitalFonts = pdfDoc.getForm() !== null; // Rough heuristic
  console.log(`- PDF load succeeded. Page 1 Dimensions: ${page0.getWidth()} x ${page0.getHeight()}`);
}

inspectNextPilot().catch(console.error);
