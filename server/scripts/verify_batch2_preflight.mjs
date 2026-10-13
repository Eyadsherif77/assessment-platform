import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';

async function main() {
  console.log('======================================================================');
  console.log('🔍 PHASE 1: PRE-FLIGHT VERIFICATION FOR BATCH 2 (BOOKS 6, 7, 8)');
  console.log('======================================================================\n');

  // 1. Verify Book 5 remains accepted and unchanged
  const b5Id = '543f2746-460c-41c1-ba38-0933f479272f';
  const b5Pages = await db.query('SELECT count(*) as cnt, sum(char_count) as chars FROM book_pages WHERE book_id = $1', [b5Id]);
  const b5Chunks = await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [b5Id]);
  const b5Chapters = await db.query('SELECT count(*) as cnt FROM book_chapters WHERE book_id = $1', [b5Id]);
  const b5Pdf = await db.query('SELECT count(*) as cnt FROM book_pdf_chunks WHERE book_id = $1', [b5Id]);
  
  console.log('--- 1. BOOK 5 VERIFICATION ---');
  console.log(`Book 5 Pages: ${b5Pages.rows[0].cnt} (Chars: ${b5Pages.rows[0].chars}) | Expected: 104 pages, 145821 chars`);
  console.log(`Book 5 Educational Chunks: ${b5Chunks.rows[0].cnt} | Expected: 97 chunks`);
  console.log(`Book 5 Chapters: ${b5Chapters.rows[0].cnt} | Expected: 4 chapters`);
  console.log(`Book 5 PDF Chunks: ${b5Pdf.rows[0].cnt} | Expected: 17 chunks`);
  const b5Intact = (
    Number(b5Pages.rows[0].cnt) === 104 &&
    Number(b5Chunks.rows[0].cnt) === 97 &&
    Number(b5Chapters.rows[0].cnt) === 4 &&
    Number(b5Pdf.rows[0].cnt) === 17
  );
  console.log(`Book 5 Intact Status: ${b5Intact ? '✅ PASSED (100% UNCHANGED)' : '❌ FAILED'}\n`);

  // Target Batch 2 Books
  const batch2Targets = [
    { num: 6, id: '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', label: 'English Prep 1' },
    { num: 7, id: 'bc6bb834-7192-474c-8507-c53265028b4e', label: 'Arabic Prep 2' },
    { num: 8, id: '37bfa0c0-c4ce-419f-930a-000043d8d3f9', label: 'English Prep 2' }
  ];

  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  console.log('--- 2. INSPECTION OF BOOKS 6, 7, AND 8 AUTHORITATIVE RECORDS ---');
  for (const t of batch2Targets) {
    console.log(`\n======================================================================`);
    console.log(`📘 INSPECTING BOOK ${t.num}: ${t.label} (ID: ${t.id})`);
    console.log(`======================================================================`);

    const bRes = await db.query(
      `SELECT b.*, g.name_ar as grade_name, g.code as grade_code,
              s.name_ar as subject_name, s.code as subject_code
       FROM books b
       LEFT JOIN grades g ON b.grade_id = g.id
       LEFT JOIN subjects s ON b.subject_id = s.id
       WHERE b.id = $1`,
      [t.id]
    );

    if (bRes.rows.length === 0) {
      console.error(`❌ CRITICAL: Book ${t.id} not found in database!`);
      continue;
    }
    const book = bRes.rows[0];
    console.log(`  Title (Ar): "${book.title_ar}" | Title (En): "${book.title_en}"`);
    console.log(`  Grade: ${book.grade_name} (${book.grade_code})`);
    console.log(`  Subject: ${book.subject_name} (${book.subject_code})`);
    console.log(`  Term: ${book.term} | School Type: "${book.school_type}" | Status: ${book.processing_status}`);
    console.log(`  File Size in DB: ${book.file_size} bytes | Declared Total Pages: ${book.total_pages}`);
    console.log(`  File URL: ${book.file_url}`);

    // Existing Chapters
    const chRes = await db.query(
      'SELECT id, chapter_number, title_ar, title_en, start_page, end_page FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC',
      [t.id]
    );
    console.log(`\n  Existing Baseline Chapters (${chRes.rows.length}):`);
    chRes.rows.forEach(c => {
      console.log(`    - Unit ${c.chapter_number}: "${c.title_ar}" (Pages: ${c.start_page}..${c.end_page}) [ID: ${c.id}]`);
    });

    // Existing Pages
    const pRes = await db.query(
      'SELECT page_number, char_count, SUBSTRING(raw_text, 1, 120) as sample FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC',
      [t.id]
    );
    console.log(`\n  Existing Baseline Pages (${pRes.rows.length}):`);
    pRes.rows.forEach(p => {
      console.log(`    - Page ${p.page_number}: char_count=${p.char_count} | Sample: "${p.sample.replace(/\n/g, ' ')}..."`);
    });

    // Existing Educational Chunks
    const cRes = await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [t.id]);
    console.log(`\n  Existing Baseline Educational Chunks: ${cRes.rows[0].cnt}`);

    // PDF Chunks in book_pdf_chunks
    const pdfChunksRes = await db.query(
      'SELECT chunk_index FROM book_pdf_chunks WHERE book_id = $1 ORDER BY chunk_index ASC',
      [t.id]
    );
    const pdfChunksCount = pdfChunksRes.rows.length;
    const indices = pdfChunksRes.rows.map(x => x.chunk_index);
    const isContiguous = pdfChunksCount > 0 && indices.every((val, idx) => val === idx);
    console.log(`\n  Stored PDF Chunks in book_pdf_chunks: ${pdfChunksCount} chunks`);
    console.log(`  Indices Contiguous (0..${pdfChunksCount - 1}): ${isContiguous}`);

    // Reconstruct full PDF from book_pdf_chunks
    console.log(`  Reconstructing full PDF from database chunks...`);
    const buffers = [];
    const BATCH = 5;
    for (let c = 0; c < pdfChunksCount; c += BATCH) {
      const endC = Math.min(pdfChunksCount - 1, c + BATCH - 1);
      const bQuery = await db.query(
        'SELECT chunk_index, chunk_data FROM book_pdf_chunks WHERE book_id = $1 AND chunk_index BETWEEN $2 AND $3 ORDER BY chunk_index ASC',
        [t.id, c, endC]
      );
      for (const row of bQuery.rows) {
        const raw = row.chunk_data;
        buffers.push(Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
      }
    }
    const fullPdfBuf = Buffer.concat(buffers);
    const pdfPath = path.resolve(uploadsDir, `book_${t.id}.pdf`);
    fs.writeFileSync(pdfPath, fullPdfBuf);
    console.log(`  Reconstructed PDF written to: ${pdfPath}`);
    console.log(`  Reconstructed PDF Size: ${(fullPdfBuf.length / (1024 * 1024)).toFixed(2)} MB (${fullPdfBuf.length} bytes)`);

    const header = fullPdfBuf.slice(0, 10).toString('utf-8').replace(/[\r\n]/g, '').trim();
    console.log(`  PDF Header: "${header}"`);

    const pdfDoc = await PDFDocument.load(fullPdfBuf, { ignoreEncryption: true });
    const actualPageCount = pdfDoc.getPageCount();
    console.log(`  Actual PDF Page Count: ${actualPageCount} pages (DB declared: ${book.total_pages})`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Preflight verification failed:', err);
  process.exit(1);
});
