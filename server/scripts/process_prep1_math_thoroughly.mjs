import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import crypto from 'crypto';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '808104ec-b861-434b-80c6-579f715d8bdf'; // Book 11: Prep 1 Mathematics
const expectedSnapshotChecksum = '2bda302c53847e30a3398254b2dd245d07ef403656bebb9603baf1fc4d201bf2';
const snapshotFileName = 'snapshot_808104ec-b861-434b-80c6-579f715d8bdf_2026-10-12T06-45-01-923Z.json';

// -----------------------------------------------------------------------------
// STEP 1: PREFLIGHT SNAPSHOT INTEGRITY VERIFICATION
// -----------------------------------------------------------------------------
function verifyPreflightSnapshot() {
  console.log(`======================================================================`);
  console.log(`🛡️  STEP 1: PREFLIGHT SNAPSHOT INTEGRITY VERIFICATION (BOOK 11)`);
  console.log(`======================================================================`);

  const snapshotFile = path.resolve(process.cwd(), 'backups', snapshotFileName);
  if (!fs.existsSync(snapshotFile)) {
    throw new Error(`CRITICAL ABORT: Snapshot file not found at ${snapshotFile}`);
  }

  const snapRaw = fs.readFileSync(snapshotFile, 'utf8');
  const snapJson = JSON.parse(snapRaw);

  if (snapJson.data?.book_id !== bookId) {
    throw new Error(`CRITICAL ABORT: Snapshot book_id mismatch. Expected ${bookId}, found ${snapJson.data?.book_id}`);
  }

  const calculatedChecksum = crypto.createHash('sha256').update(JSON.stringify(snapJson.data)).digest('hex');
  if (calculatedChecksum !== expectedSnapshotChecksum) {
    throw new Error(`CRITICAL ABORT: Snapshot checksum mismatch! Calculated: ${calculatedChecksum}, Expected: ${expectedSnapshotChecksum}`);
  }

  console.log(`   ✅ Snapshot File: ${snapshotFile}`);
  console.log(`   ✅ Target Book ID Verified: ${bookId} (${snapJson.data.book_title})`);
  console.log(`   ✅ SHA-256 Checksum Verified: ${calculatedChecksum}`);
  console.log(`   ✅ Snapshot Status: READABLE & UNMODIFIED\n`);
}

// -----------------------------------------------------------------------------
// VERIFIED CURRICULUM BOUNDARIES (FIRST PREPARATORY MATHEMATICS - TERM 1)
// -----------------------------------------------------------------------------
const VERIFIED_UNITS = [
  {
    chapter_number: 1,
    id: 'e57a89eb-1cc9-46ac-a3dd-598f3de7b06c', // PRESERVE EXISTING ID
    title_en: 'Unit 1: Numbers and Their Operations',
    title_ar: 'الوحدة الأولى: الأعداد والعمليات عليها',
    pdf_start: 8,
    pdf_end: 38,
    description: 'Proportion, Applications of Ratio and Proportion, Sets and Their Operations, Operations on Integers, and Operations on Rational Numbers'
  },
  {
    chapter_number: 2,
    id: 'dec90b76-3479-40a3-b720-4a06a61a4b3f', // PRESERVE EXISTING ID
    title_en: 'Unit 2: Algebra',
    title_ar: 'الوحدة الثانية: الجبر',
    pdf_start: 39,
    pdf_end: 53,
    description: 'Mathematical Expressions and Formulas, Linear Equations, algebraic manipulation, solving equations, and applications'
  },
  {
    chapter_number: 3,
    id: 'd00b0570-8269-4ec6-9ccb-2536fb338131', // PRESERVE EXISTING ID
    title_en: 'Unit 3: Statistics',
    title_ar: 'الوحدة الثالثة: الإحصاء',
    pdf_start: 54,
    pdf_end: 75,
    description: 'Organizing Data, Arithmetic Mean, Pie Charts, and statistical representations and data analysis'
  },
  {
    chapter_number: 4,
    id: '1b9f4377-6ae0-4c24-b588-c221900597ec', // PRESERVE EXISTING ID
    title_en: 'Unit 4: Geometry & Measurement',
    title_ar: 'الوحدة الرابعة: الهندسة والقياس',
    pdf_start: 76,
    pdf_end: 111,
    description: 'Types of Angles and Relations between Angles, Parallelism, Triangles, Quadrilaterals, Polygons, and Coordinates'
  }
];

function getUnitForPdfPage(pdfPageNum) {
  for (const u of VERIFIED_UNITS) {
    if (pdfPageNum >= u.pdf_start && pdfPageNum <= u.pdf_end) {
      return u;
    }
  }
  return null;
}

async function runPrep1MathExtraction() {
  // 1. Snapshot Preflight
  verifyPreflightSnapshot();

  console.log(`======================================================================`);
  console.log(`📚 THOROUGH, IDEMPOTENT OCR EXTRACTION FOR PREP 1 MATH (Book ${bookId})`);
  console.log(`======================================================================\n`);

  // 2. Read book record
  const bRes = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
  const book = bRes.rows[0];
  if (!book) throw new Error(`Book ${bookId} not found in database.`);
  console.log(`Target Book: "${book.title_en || book.title_ar}" (Stage: ${book.academic_stage_id}, Grade: ${book.grade_id}, Subject: ${book.subject_id})`);

  // 3. Upsert verified chapters in book_chapters preserving IDs
  console.log(`\n2. Upserting 4 verified official curriculum units into book_chapters...`);
  for (const u of VERIFIED_UNITS) {
    await db.query(
      `INSERT INTO book_chapters (
        id, book_id, chapter_number, title_ar, title_en, start_page, end_page, description, description_en
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON DUPLICATE KEY UPDATE 
        title_ar = VALUES(title_ar),
        title_en = VALUES(title_en),
        start_page = VALUES(start_page),
        end_page = VALUES(end_page),
        description = VALUES(description),
        description_en = VALUES(description_en)`,
      [u.id, bookId, u.chapter_number, u.title_ar, u.title_en, u.pdf_start, u.pdf_end, u.description, u.description_en]
    );
  }
  console.log(`   ✅ 4 verified chapters mapped and preserved in book_chapters.`);

  // 4. Load Reconstructed PDF
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bookId}.pdf`);
  if (!fs.existsSync(diskPdfPath)) {
    throw new Error(`Reconstructed PDF missing at ${diskPdfPath}`);
  }
  const fullPdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(fullPdfBuf);
  const totalPages = srcDoc.getPageCount();
  console.log(`\n3. Loaded PDF: ${totalPages} pages from ${diskPdfPath} (${(fullPdfBuf.length / (1024 * 1024)).toFixed(2)} MB)\n`);

  // 5. Check existing pages in DB (Resumability check)
  const existingPagesRes = await db.query(
    'SELECT page_number, char_count FROM book_pages WHERE book_id = $1 AND char_count >= 60',
    [bookId]
  );
  const alreadyExtracted = new Set(existingPagesRes.rows.map(r => Number(r.page_number)));
  console.log(`   Already thoroughly extracted pages in DB: ${alreadyExtracted.size}/${totalPages}`);

  // 6. Batching (2 pages per batch for rock-solid stability and high precision)
  const BATCH_SIZE = 2;
  const batches = [];
  for (let p = 1; p <= totalPages; p += BATCH_SIZE) {
    const endP = Math.min(totalPages, p + BATCH_SIZE - 1);
    const pagesInBatch = [];
    for (let cur = p; cur <= endP; cur++) {
      pagesInBatch.push(cur);
    }
    if (pagesInBatch.some(n => !alreadyExtracted.has(n))) {
      batches.push(pagesInBatch);
    }
  }

  console.log(`4. Batches to process: ${batches.length} (Skipping ${alreadyExtracted.size} already extracted pages)\n`);

  const shortOrBlankPages = [];

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const pageNums = batches[bIdx];
    console.log(`--- [Batch ${bIdx + 1}/${batches.length}] Extracting PDF Pages: [${pageNums.join(', ')}] ---`);

    const batchDoc = await PDFDocument.create();
    const zeroPages = pageNums.map(n => n - 1).filter(idx => idx >= 0 && idx < totalPages);
    const copiedPages = await batchDoc.copyPages(srcDoc, zeroPages);
    copiedPages.forEach(p => batchDoc.addPage(p));
    const batchBytes = await batchDoc.save();
    const batchB64 = Buffer.from(batchBytes).toString('base64');

    const prompt = `You are a high-precision OCR extraction engine for Egyptian Ministry of Education Mathematics textbooks (First Preparatory Grade - Term 1 - English Language of Instruction).
You are processing PDF pages: ${pageNums.join(', ')} of Math Prep 1.

Extract ALL mathematical educational content verbatim with exact equations, notation, formulas, diagrams, definitions, examples, and exercises:
1. Unit titles, chapter titles, lesson titles, and section headings.
2. Definitions, theorems, properties, corollaries, rules, and mathematical formulas.
3. Fully worked examples, step-by-step solutions, and mathematical expressions.
4. Tables, coordinates, geometric relations, figures, and notation (LaTeX / text).
5. Exercises, problem sets, activities, and chapter reviews.

Return strict JSON:
{
  "pages": [
    ${pageNums.map(n => `{"page_number": ${n}, "text": "Mathematical content extracted for page ${n}..."}`).join(',\n    ')}
  ]
}`;

    try {
      const resStr = await GeminiClient.generateContent({
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: batchB64 } },
          { text: prompt }
        ],
        responseMimeType: 'application/json',
        temperature: 0.1,
        timeoutMs: 60000
      });

      const parsed = JSON.parse(resStr);
      if (parsed.pages && Array.isArray(parsed.pages)) {
        for (const item of parsed.pages) {
          const pNum = Number(item.page_number) || pageNums[0];
          const text = String(item.text || '').trim();

          if (text.length < 50) {
            shortOrBlankPages.push({
              page_number: pNum,
              length: text.length,
              reason: text.length === 0 ? 'BLANK_PAGE' : 'SHORT_OR_IMAGE_ONLY'
            });
          }

          // Persist to book_pages
          const pageId = uuidv4();
          await db.query(
            `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
             VALUES ($1, $2, $3, $4, $5)
             ON DUPLICATE KEY UPDATE raw_text = VALUES(raw_text), char_count = VALUES(char_count)`,
            [pageId, bookId, pNum, text, text.length]
          );

          // Find chapter
          const unit = getUnitForPdfPage(pNum);

          // Index educational chunks for pages in Units 1..4
          if (text.length >= 50 && unit) {
            await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND page_number = $2', [bookId, pNum]);

            const chunkId = uuidv4();
            const meta = {
              unit_number: unit.chapter_number,
              section_type: 'curriculum_unit',
              pdf_page: pNum,
              subject: 'Mathematics',
              grade: 'Prep 1',
              language: 'en'
            };

            await db.query(
              `INSERT INTO book_chunks (
                id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                chunkId,
                bookId,
                unit.id,
                book.academic_stage_id,
                book.grade_id,
                book.subject_id,
                pNum,
                0,
                text,
                JSON.stringify(meta)
              ]
            );
          }
          console.log(`   -> Page ${pNum}: Extracted ${text.length} chars (Unit: ${unit ? unit.chapter_number : 'Non-unit/Intro/Reviews'})`);
        }
      }
    } catch (err) {
      console.error(`   ❌ Error on batch [${pageNums.join(', ')}]:`, err.message);
    }

    // Rate-limiting delay
    await new Promise(r => setTimeout(r, 1000));
  }

  // 7. Update Book Metadata in books table
  console.log(`\n5. Updating Book 11 metadata in books table...`);
  await db.query(
    `UPDATE books 
     SET total_pages = $1, processing_status = 'COMPLETED', processing_error = NULL,
         title_en = 'Mathematics', title_ar = 'الرياضيات (لغات)'
     WHERE id = $2`,
    [totalPages, bookId]
  );
  console.log(`   ✅ Book 11 status set to COMPLETED with total_pages = ${totalPages}.`);

  // 8. Final Coverage Audit
  const finalPages = await db.query(
    'SELECT count(*) as count, sum(char_count) as total_chars, sum(char_length(raw_text)) as total_unicode, sum(length(raw_text)) as total_bytes FROM book_pages WHERE book_id = $1',
    [bookId]
  );
  const finalChunks = await db.query(
    'SELECT count(*) as count FROM book_chunks WHERE book_id = $1',
    [bookId]
  );

  console.log(`\n======================================================================`);
  console.log(`🏁 EXTRACTION SUMMARY FOR PREP 1 MATH (BOOK 11)`);
  console.log(`Total Pages in book_pages: ${finalPages.rows[0].count}/${totalPages}`);
  console.log(`Total Characters: ${finalPages.rows[0].total_unicode}`);
  console.log(`Total Bytes: ${finalPages.rows[0].total_bytes}`);
  console.log(`Total Indexed Chunks: ${finalChunks.rows[0].count}`);
  console.log(`Short/Blank Pages Count: ${shortOrBlankPages.length}`);
  console.log(`======================================================================\n`);

  fs.writeFileSync(
    path.resolve(process.cwd(), 'scripts', 'prep1_math_extraction_report.json'),
    JSON.stringify({
      book_id: bookId,
      total_pdf_pages: totalPages,
      pages_in_db: finalPages.rows[0].count,
      total_chars: finalPages.rows[0].total_unicode,
      total_bytes: finalPages.rows[0].total_bytes,
      total_chunks: finalChunks.rows[0].count,
      short_or_blank_pages: shortOrBlankPages
    }, null, 2)
  );

  console.log(`Report saved to scripts/prep1_math_extraction_report.json`);
}

runPrep1MathExtraction().catch(err => {
  console.error('Fatal Extraction Error:', err);
  process.exit(1);
});
