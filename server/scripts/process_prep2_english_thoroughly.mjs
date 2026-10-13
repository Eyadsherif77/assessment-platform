import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import crypto from 'crypto';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '37bfa0c0-c4ce-419f-930a-000043d8d3f9'; // Book 8: Prep 2 English
const expectedSnapshotChecksum = '0307da00b77b0b2a4904c7ddc325ef3e2894d470cb89bf454919d6e19163b2c4';
const snapshotFileName = 'snapshot_37bfa0c0-c4ce-419f-930a-000043d8d3f9_2026-10-11T21-21-52-153Z.json';

// -----------------------------------------------------------------------------
// STEP 1: PREFLIGHT SNAPSHOT INTEGRITY VERIFICATION
// -----------------------------------------------------------------------------
function verifyPreflightSnapshot() {
  console.log(`======================================================================`);
  console.log(`🛡️  STEP 1: PREFLIGHT SNAPSHOT INTEGRITY VERIFICATION (BOOK 8)`);
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
// VERIFIED CURRICULUM BOUNDARIES (SECOND PREPARATORY ENGLISH - TERM 1)
// -----------------------------------------------------------------------------
const VERIFIED_UNITS = [
  {
    chapter_number: 1,
    id: 'af732e7e-1a38-4b17-b23e-d09ac0ac92f1', // PRESERVE EXISTING ID
    title_en: 'Unit 1: Gen Alpha',
    title_ar: 'الوحدة الأولى: جين ألفا',
    pdf_start: 14,
    pdf_end: 27,
    description: "Explores Gen Alpha, daily life, digital habits, language in use, and vocabulary using Present Continuous."
  },
  {
    chapter_number: 2,
    id: '28366e22-1307-4063-a959-f13963009d84', // PRESERVE EXISTING ID
    title_en: 'Unit 2: My Digital Footprint',
    title_ar: 'الوحدة الثانية: بصمتي الرقمية',
    pdf_start: 28,
    pdf_end: 41,
    description: "Covers online privacy, digital safety, cyber habits, and language structures (Present Simple, Passive, modals)."
  },
  {
    chapter_number: 3,
    id: '56d94016-da00-49cf-bb1f-828ecbdaa3b4', // PRESERVE EXISTING ID
    title_en: 'Unit 3: Facing Challenges',
    title_ar: 'الوحدة الثالثة: مواجهة التحديات',
    pdf_start: 42,
    pdf_end: 55,
    description: "Focuses on overcoming obstacles, determination, courage, and narrative grammar (Past Simple and Past Continuous)."
  },
  {
    chapter_number: 4,
    id: '8c2a41d9-761e-4589-9a10-2f1d93b1e004', // STABLE ASSIGNED ID
    title_en: 'Unit 4: Art and Expression',
    title_ar: 'الوحدة الرابعة: الفن والتعبير',
    pdf_start: 58,
    pdf_end: 71,
    description: "Discusses visual art, artists, creative expression, and connectors of Cause, Result, and Contrast."
  },
  {
    chapter_number: 5,
    id: 'e5d33bf1-897b-4177-bc45-873d2a01f005', // STABLE ASSIGNED ID
    title_en: 'Unit 5: Around the World',
    title_ar: 'الوحدة الخامسة: حول العالم',
    pdf_start: 72,
    pdf_end: 85,
    description: "Explores global cultures, geographical landmarks, traditions, and comparative/superlative structures."
  },
  {
    chapter_number: 6,
    id: '64a71bc9-93b5-4b31-9257-2c9381ea7006', // STABLE ASSIGNED ID
    title_en: 'Unit 6: Young Innovators',
    title_ar: 'الوحدة السادسة: المبتكرون الشباب',
    pdf_start: 86,
    pdf_end: 99,
    description: "Highlights young inventors, machines, technological advancements, and conditional sentences (Types 1 and 2)."
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

async function runPrep2EnglishExtraction() {
  // 1. Snapshot Preflight
  verifyPreflightSnapshot();

  console.log(`======================================================================`);
  console.log(`📚 THOROUGH, IDEMPOTENT OCR EXTRACTION FOR PREP 2 ENGLISH (Book ${bookId})`);
  console.log(`======================================================================\n`);

  // 2. Read book record
  const bRes = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
  const book = bRes.rows[0];
  if (!book) throw new Error(`Book ${bookId} not found in database.`);
  console.log(`Target Book: "${book.title_ar}" (Stage: ${book.academic_stage_id}, Grade: ${book.grade_id}, Subject: ${book.subject_id})`);

  // 3. Upsert verified chapters in book_chapters
  console.log(`\n2. Upserting 6 verified official curriculum units into book_chapters...`);
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
      [u.id, bookId, u.chapter_number, u.title_ar, u.title_en, u.pdf_start, u.pdf_end, u.description, u.description]
    );
  }
  console.log(`   ✅ 6 verified chapters mapped and preserved in book_chapters.`);

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

  // 6. Batching (5 pages per batch for optimal throughput and high accuracy)
  const BATCH_SIZE = 5;
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

    const prompt = `You are a high-precision OCR extraction engine for Egyptian Ministry of Education English textbooks (Second Preparatory Grade - Term 1 - New Hello / English Prep 2).
You are processing PDF pages: ${pageNums.join(', ')} of English Prep 2.

Extract ALL educational content verbatim:
1. Unit titles, lesson headings, reading passages, dialogue texts, and listening transcripts.
2. Vocabulary lists with definitions, synonyms, antonyms, and collocations.
3. Grammar focus explanations, rule summaries, example sentences, and usage notes.
4. Exercises, comprehension questions, multiple-choice questions, and writing prompts.
5. Review sections, self-reflection questions, and practice tests.

Return strict JSON:
{
  "pages": [
    ${pageNums.map(n => `{"page_number": ${n}, "text": "Extracted educational content for PDF page ${n}..."}`).join(',\n    ')}
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

          // Index educational chunks for pages in Units 1..6
          if (text.length >= 50 && unit) {
            await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND page_number = $2', [bookId, pNum]);

            const chunkId = uuidv4();
            const meta = {
              unit_number: unit.chapter_number,
              section_type: 'curriculum_unit',
              pdf_page: pNum,
              subject: 'English',
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
          console.log(`   -> Page ${pNum}: Extracted ${text.length} chars (Unit: ${unit ? unit.chapter_number : 'Non-unit/Review/Front-matter'})`);
        }
      }
    } catch (err) {
      console.error(`   ❌ Error on batch [${pageNums.join(', ')}]:`, err.message);
    }

    // Rate-limiting delay
    await new Promise(r => setTimeout(r, 2200));
  }

  // 7. Update Book Metadata in books table
  console.log(`\n5. Updating Book 8 metadata in books table...`);
  await db.query(
    `UPDATE books 
     SET total_pages = $1, processing_status = 'COMPLETED', processing_error = NULL,
         title_en = 'English Language', title_ar = 'اللغة الإنجليزية'
     WHERE id = $2`,
    [totalPages, bookId]
  );
  console.log(`   ✅ Book 8 status set to COMPLETED with total_pages = ${totalPages}.`);

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
  console.log(`🏁 EXTRACTION SUMMARY FOR PREP 2 ENGLISH (BOOK 8)`);
  console.log(`Total Pages in book_pages: ${finalPages.rows[0].count}/${totalPages}`);
  console.log(`Total Characters: ${finalPages.rows[0].total_unicode}`);
  console.log(`Total Bytes: ${finalPages.rows[0].total_bytes}`);
  console.log(`Total Indexed Chunks: ${finalChunks.rows[0].count}`);
  console.log(`Short/Blank Pages Count: ${shortOrBlankPages.length}`);
  console.log(`======================================================================\n`);

  fs.writeFileSync(
    path.resolve(process.cwd(), 'scripts', 'prep2_english_extraction_report.json'),
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

  console.log(`Report saved to scripts/prep2_english_extraction_report.json`);
}

runPrep2EnglishExtraction().catch(err => {
  console.error('Fatal Extraction Error:', err);
  process.exit(1);
});
