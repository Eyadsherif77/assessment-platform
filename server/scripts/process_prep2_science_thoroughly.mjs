import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import crypto from 'crypto';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '543f2746-460c-41c1-ba38-0933f479272f'; // Prep 2 Science (English)
const expectedSnapshotChecksum = '38eed1707c76d7a1775584b4e8a98afc7fe5141570f2684691988705b67629e2';

// -----------------------------------------------------------------------------
// STEP 1: PREFLIGHT SNAPSHOT INTEGRITY VERIFICATION
// -----------------------------------------------------------------------------
function verifyPreflightSnapshot() {
  console.log(`======================================================================`);
  console.log(`🛡️  STEP 1: PREFLIGHT SNAPSHOT INTEGRITY VERIFICATION`);
  console.log(`======================================================================`);

  const snapshotFile = path.resolve(process.cwd(), 'backups', `snapshot_${bookId}_2026-10-11T20-47-52-489Z.json`);
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
// VERIFIED CURRICULUM BOUNDARIES (SECOND PREPARATORY SCIENCE - ENGLISH EDITION)
// -----------------------------------------------------------------------------
const VERIFIED_UNITS = [
  {
    chapter_number: 1,
    id: 'd8b969af-fa0a-4f96-a54c-bbcf33ddc188', // PRESERVE EXISTING ID
    title_en: 'Unit 1: Matter and Energy',
    title_ar: 'الوحدة الأولى: المادة والطاقة',
    pdf_start: 7,
    pdf_end: 44,
    printed_start: 1,
    printed_end: 38,
    description: 'States of matter, changes in states of matter, internal energy and temperature, methods of heat transfer, activities and evaluation questions.',
    description_en: 'States of matter, changes in states of matter, internal energy and temperature, methods of heat transfer, activities and evaluation questions.'
  },
  {
    chapter_number: 2,
    id: '12122d52-126c-452a-a555-a942bc570946', // PRESERVE EXISTING ID
    title_en: 'Unit 2: Matter and Chemical Reactions',
    title_ar: 'الوحدة الثانية: المادة والتفاعلات الكيميائية',
    pdf_start: 45,
    pdf_end: 69,
    printed_start: 39,
    printed_end: 63,
    description: 'Chemical reactions, chemical equations, nutritional chemistry, protein detection, activities and evaluation questions.',
    description_en: 'Chemical reactions, chemical equations, nutritional chemistry, protein detection, activities and evaluation questions.'
  },
  {
    chapter_number: 3,
    id: '147144a2-8e01-413d-89e2-45393236f87c', // PRESERVE EXISTING ID
    title_en: 'Unit 3: Energy Flow in Photosynthesis and Cellular Respiration',
    title_ar: 'الوحدة الثالثة: تدفق الطاقة في البناء الضوئي والتنفس الخلوي',
    pdf_start: 70,
    pdf_end: 87,
    printed_start: 64,
    printed_end: 81,
    description: 'Photosynthesis, light and dark reactions, cellular respiration, aerobic and anaerobic respiration, energy flow, activities and evaluation questions.',
    description_en: 'Photosynthesis, light and dark reactions, cellular respiration, aerobic and anaerobic respiration, energy flow, activities and evaluation questions.'
  },
  {
    chapter_number: 4,
    id: 'e4000000-fa0a-4f96-a54c-bbcf33ddc184', // STABLE 4TH CHAPTER ID
    title_en: 'Unit 4: Geological Processes',
    title_ar: 'الوحدة الرابعة: العمليات الجيولوجية',
    pdf_start: 88,
    pdf_end: 103,
    printed_start: 82,
    printed_end: 97,
    description: 'Changes in Earth surface, weathering, erosion, sedimentation, formation of minerals and soil, activities and evaluation questions.',
    description_en: 'Changes in Earth surface, weathering, erosion, sedimentation, formation of minerals and soil, activities and evaluation questions.'
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

async function runPrep2ScienceExtraction() {
  // 1. Snapshot Preflight
  verifyPreflightSnapshot();

  console.log(`======================================================================`);
  console.log(`🔬 THOROUGH, IDEMPOTENT EXTRACTION FOR PREP 2 SCIENCE (Book ${bookId})`);
  console.log(`======================================================================\n`);

  // 2. Read book record
  const bRes = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
  const book = bRes.rows[0];
  if (!book) throw new Error(`Book ${bookId} not found in database.`);
  console.log(`Target Book: "${book.title_ar}" (Stage: ${book.academic_stage_id}, Grade: ${book.grade_id}, Subject: ${book.subject_id})`);

  // 3. Clean up legacy seed placeholder chunks and seed pages for Book 5 before full extraction
  console.log(`\n2. Purging legacy seed chunks and pages for Book 5...`);
  await db.query('DELETE FROM book_chunks WHERE book_id = $1', [bookId]);
  await db.query('DELETE FROM book_pages WHERE book_id = $1', [bookId]);
  console.log(`   ✅ Cleaned legacy seed data for Book 5.`);

  // 4. Update book_chapters preserving existing IDs and inserting Unit 4
  console.log(`\n3. Updating book_chapters with authentic ministerial curriculum units...`);
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

  // 5. Load PDF
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bookId}.pdf`);
  if (!fs.existsSync(diskPdfPath)) {
    throw new Error(`Reconstructed PDF missing at ${diskPdfPath}`);
  }
  const fullPdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(fullPdfBuf);
  const totalPages = srcDoc.getPageCount();
  console.log(`\n4. Loaded PDF: ${totalPages} pages from ${diskPdfPath} (${(fullPdfBuf.length / (1024 * 1024)).toFixed(2)} MB)\n`);

  // 6. Batching (2 pages per batch for maximum scientific notation & OCR quality)
  const BATCH_SIZE = 2;
  const batches = [];
  for (let p = 1; p <= totalPages; p += BATCH_SIZE) {
    const endP = Math.min(totalPages, p + BATCH_SIZE - 1);
    const pagesInBatch = [];
    for (let cur = p; cur <= endP; cur++) {
      pagesInBatch.push(cur);
    }
    batches.push(pagesInBatch);
  }

  console.log(`5. Batches to process: ${batches.length} (Total pages: ${batches.flat().length})\n`);

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

    const prompt = `You are a high-precision OCR extraction engine for Egyptian Ministry of Education Science textbooks (English Edition).
You are processing PDF pages: ${pageNums.join(', ')} of Second Preparatory Science (Term 1).

Extract ALL educational content verbatim in English:
1. Lesson titles, unit titles, definitions, scientific terms, and core concepts.
2. Scientific explanations, laws, physical states, changes of state, thermal energy, temperature, heat transfer mechanisms (conduction, convection, radiation).
3. Chemical formulas, chemical equations (balanced reactants and products), reaction types, and nutritional chemistry (proteins, carbohydrates, lipids, testing reagents).
4. Biology and energy flow: photosynthesis equations, chloroplast structure, light and dark reactions, cellular respiration (aerobic and anaerobic, ATP, glycolysis, Krebs cycle, mitochondria).
5. Earth science and geology: rock types, minerals, weathering (mechanical and chemical), erosion, sedimentation, soil formation.
6. Solved examples, scientific skills, activities, tables, charts, and evaluation questions at the end of each lesson.
7. If a page is a front-matter cover or preliminary index, extract the text present accurately.

Return strict JSON:
{
  "pages": [
    ${pageNums.map(n => `{"page_number": ${n}, "text": "Extracted educational science text for page ${n}..."}`).join(',\n    ')}
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
        timeoutMs: 45000
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

          // Index educational chunks for pages in Units 1..4 (pages 7..103)
          if (text.length >= 50 && unit) {
            await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND page_number = $2', [bookId, pNum]);

            const chunkId = uuidv4();
            const meta = {
              unit_number: unit.chapter_number,
              section_type: 'curriculum_unit',
              pdf_page: pNum,
              subject: 'Science',
              grade: 'Prep 2',
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
          console.log(`   -> Page ${pNum}: Extracted ${text.length} chars (Unit: ${unit ? unit.chapter_number : 'Intro/Front-matter'})`);
        }
      }
    } catch (err) {
      console.error(`   ❌ Error on batch [${pageNums.join(', ')}]:`, err.message);
    }

    // Rate-limiting delay
    await new Promise(r => setTimeout(r, 2200));
  }

  // 7. Update Book Metadata in books table
  console.log(`\n6. Updating Book 5 metadata in books table...`);
  await db.query(
    `UPDATE books 
     SET total_pages = $1, processing_status = 'COMPLETED', processing_error = NULL,
         title_en = 'Science (English)', title_ar = 'العلوم (لغات)'
     WHERE id = $2`,
    [totalPages, bookId]
  );
  console.log(`   ✅ Book 5 status set to COMPLETED with total_pages = ${totalPages}.`);

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
  console.log(`🏁 EXTRACTION SUMMARY FOR PREP 2 SCIENCE`);
  console.log(`Total Pages in book_pages: ${finalPages.rows[0].count}/${totalPages}`);
  console.log(`Total Characters: ${finalPages.rows[0].total_unicode}`);
  console.log(`Total Bytes: ${finalPages.rows[0].total_bytes}`);
  console.log(`Total Indexed Chunks: ${finalChunks.rows[0].count}`);
  console.log(`Short/Blank Pages Count: ${shortOrBlankPages.length}`);
  console.log(`======================================================================\n`);

  fs.writeFileSync(
    path.resolve(process.cwd(), 'scripts', 'prep2_science_extraction_report.json'),
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

  console.log(`Report saved to scripts/prep2_science_extraction_report.json`);
}

runPrep2ScienceExtraction().catch(err => {
  console.error('Fatal Extraction Error:', err);
  process.exit(1);
});
