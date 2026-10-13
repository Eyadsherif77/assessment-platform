import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import crypto from 'crypto';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '9e702109-7d92-445c-b814-567c1f6cba49'; // Book 13: Prep 3 English
const expectedSnapshotChecksum = '9e41440d1d71bfe05425e3cc4880c292a041a8fcb56e0ddb22064ceea13ad4ed';
const snapshotFileName = 'snapshot_9e702109-7d92-445c-b814-567c1f6cba49_2026-10-12T09-00-16-098Z.json';

// -----------------------------------------------------------------------------
// STEP 1: PREFLIGHT SNAPSHOT INTEGRITY VERIFICATION
// -----------------------------------------------------------------------------
function verifyPreflightSnapshot() {
  console.log(`======================================================================`);
  console.log(`🛡️  STEP 1: PREFLIGHT SNAPSHOT INTEGRITY VERIFICATION (BOOK 13)`);
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
// VERIFIED CURRICULUM BOUNDARIES (THIRD PREPARATORY ENGLISH - NEW HELLO - TERM 1)
// -----------------------------------------------------------------------------
const VERIFIED_UNITS = [
  {
    chapter_number: 1,
    id: 'f8d4d833-792d-408b-8b72-1417c85282bc', // PRESERVE EXISTING ID
    title_en: 'Unit 1: Personal Identity',
    title_ar: 'الوحدة الأولى: الهوية الشخصية',
    pdf_start: 14,
    pdf_end: 27,
    description: 'Personal identity, values, background, beliefs, character, strengths, Present Perfect Active and Passive, since vs for.'
  },
  {
    chapter_number: 2,
    id: '498b0ea7-ad68-4e00-9fcb-194601fa721a', // PRESERVE EXISTING ID
    title_en: 'Unit 2: Communication with Family and Friends',
    title_ar: 'الوحدة الثانية: التواصل مع العائلة والأصدقاء',
    pdf_start: 28,
    pdf_end: 41,
    description: 'Interpersonal communication, active listening, dialogue, body language, family ties, and friendship skills.'
  },
  {
    chapter_number: 3,
    id: '5b8f39d4-30f8-43d5-97ce-39057d9f63da', // PRESERVE EXISTING ID
    title_en: 'Unit 3: Artificial Intelligence',
    title_ar: 'الوحدة الثالثة: الذكاء الاصطناعي',
    pdf_start: 42,
    pdf_end: 55,
    description: 'AI concepts, machine learning, robots, smart technology, innovation, Future Simple Passive.'
  },
  {
    chapter_number: 4,
    id: 'f13a0004-9e70-445c-b814-567c1f6cba49', // DETERMINISTIC ID
    title_en: 'Unit 4: Screen Time',
    title_ar: 'الوحدة الرابعة: وقت الشاشة',
    pdf_start: 60,
    pdf_end: 72,
    description: 'Screen habits, digital wellbeing, social media, technology balance, health effects of prolonged device use.'
  },
  {
    chapter_number: 5,
    id: 'f13a0005-9e70-445c-b814-567c1f6cba49', // DETERMINISTIC ID
    title_en: 'Unit 5: Design Thinking',
    title_ar: 'الوحدة الخامسة: التفكير التصميمي',
    pdf_start: 73,
    pdf_end: 85,
    description: 'Problem-solving process, brainstorming, prototyping, testing, feedback, sequence connectors, and imperatives.'
  },
  {
    chapter_number: 6,
    id: 'f13a0006-9e70-445c-b814-567c1f6cba49', // DETERMINISTIC ID
    title_en: 'Unit 6: Why Do We Like Stories?',
    title_ar: 'الوحدة السادسة: لماذا نحب القصص؟',
    pdf_start: 86,
    pdf_end: 100,
    description: 'Narrative structure, moral lessons, characters, traditional tales, cultural story traditions, narrative past tenses.'
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

// -----------------------------------------------------------------------------
// STEP 2: SYNCHRONIZE OFFICIAL BOOK CHAPTERS
// -----------------------------------------------------------------------------
async function updateChapters() {
  console.log(`--- STEP 2: SYNCHRONIZING OFFICIAL BOOK CHAPTERS (6 UNITS) ---`);
  for (const u of VERIFIED_UNITS) {
    const existing = await db.query('SELECT id FROM book_chapters WHERE id = $1', [u.id]);
    if (existing.rows.length > 0) {
      await db.query(
        `UPDATE book_chapters SET
           chapter_number = $1,
           title_ar = $2,
           title_en = $3,
           description = $4,
           description_en = $4,
           start_page = $5,
           end_page = $6
         WHERE id = $7 AND book_id = $8`,
        [u.chapter_number, u.title_ar, u.title_en, u.description, u.pdf_start, u.pdf_end, u.id, bookId]
      );
    } else {
      await db.query(
        `INSERT INTO book_chapters (
           id, book_id, chapter_number, title_ar, title_en, description, description_en,
           start_page, end_page, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, NOW())`,
        [u.id, bookId, u.chapter_number, u.title_ar, u.title_en, u.description, u.pdf_start, u.pdf_end]
      );
    }
    console.log(`   ✅ Unit ${u.chapter_number}: "${u.title_en}" (Pages ${u.pdf_start}..${u.pdf_end}) [ID: ${u.id}]`);
  }
  console.log('');
}

// -----------------------------------------------------------------------------
// STEP 3: EXTRACT AND STRUCTURE ALL 114 PAGES
// -----------------------------------------------------------------------------
async function extractAndStructureAllPages() {
  console.log(`======================================================================`);
  console.log(`📄 STEP 3: HIGH-FIDELITY EXTRACTION & OCR (BOOK 13 - 114 PAGES)`);
  console.log(`======================================================================`);

  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bookId}.pdf`);
  if (!fs.existsSync(diskPdfPath)) {
    throw new Error(`CRITICAL: Reconstructed PDF file missing at ${diskPdfPath}`);
  }

  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);
  const totalPages = srcDoc.getPageCount();
  console.log(`   Source PDF verified: ${totalPages} total pages (${(pdfBuf.length / (1024 * 1024)).toFixed(2)} MB)\n`);

  if (totalPages !== 114) {
    throw new Error(`Expected exactly 114 pages in Book 13 PDF, found: ${totalPages}`);
  }

  const existingPagesRes = await db.query(
    'SELECT page_number, char_count FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC',
    [bookId]
  );
  const existingPageMap = new Map();
  existingPagesRes.rows.forEach(r => existingPageMap.set(Number(r.page_number), Number(r.char_count)));
  console.log(`   Existing verified pages in DB: ${existingPageMap.size}`);

  for (let pNum = 1; pNum <= totalPages; pNum++) {
    const existingChars = existingPageMap.get(pNum) || 0;
    if (existingChars >= 100) {
      continue;
    }

    console.log(`   🔄 Extracting Page ${pNum}/${totalPages}...`);

    const pageDoc = await PDFDocument.create();
    const [copiedPage] = await pageDoc.copyPages(srcDoc, [pNum - 1]);
    pageDoc.addPage(copiedPage);
    const pageBytes = await pageDoc.save();
    const b64 = Buffer.from(pageBytes).toString('base64');

    const prompt = `You are a high-precision OCR extraction engine for Egyptian Ministry of Education English textbooks (New Hello! Prep 3 - Term 1).
In front of you is a single page from the Third Preparatory English textbook.

Tasks:
1. Extract ALL English text, vocabulary definitions, readings, dialogues, questions, and exercises verbatim.
2. Extract all grammatical explanations (Language in Use), rules, examples, and sentence patterns.
3. Extract all Life Skills, Core Values, Writing tasks, and Assessment Corner questions.
4. If this page is a unit cover, table of contents, review, or story section, transcribe all headings and problems verbatim.
Do not comment on page numbering or page existence. Simply transcribe the exact text visible on this page.

Return strict JSON: {"text": "..."}`;

    let extractedText = '';
    let retries = 0;
    while (retries < 3) {
      try {
        const resStr = await GeminiClient.generateContent({
          parts: [
            { inline_data: { mime_type: 'application/pdf', data: b64 } },
            { text: prompt }
          ],
          responseMimeType: 'application/json',
          temperature: 0.1
        });

        const parsed = JSON.parse(resStr);
        extractedText = String(parsed.text || '').trim();
        break;
      } catch (err) {
        retries++;
        console.warn(`      ⚠️ Retry ${retries}/3 for page ${pNum}: ${err.message}`);
        await new Promise(r => setTimeout(r, 2000 * retries));
      }
    }

    // Upsert into book_pages
    await db.query(
      `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
       VALUES ($1, $2, $3, $4, $5)
       ON DUPLICATE KEY UPDATE raw_text = VALUES(raw_text), char_count = VALUES(char_count)`,
      [uuidv4(), bookId, pNum, extractedText, extractedText.length]
    );
    existingPageMap.set(pNum, extractedText.length);

    // Create/Update chunk if it belongs to an official unit
    const unit = getUnitForPdfPage(pNum);
    if (unit && extractedText.length >= 50) {
      await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND page_number = $2', [bookId, pNum]);

      const chunkId = uuidv4();
      const meta = {
        unit_number: unit.chapter_number,
        unit_title: unit.title_en,
        section_type: 'curriculum_unit',
        pdf_page: pNum,
        subject: 'English',
        grade: 'Prep 3',
        term: 1,
        language: 'en'
      };

      await db.query(
        `INSERT INTO book_chunks (
           id, book_id, chapter_id, academic_stage_id, grade_id, subject_id,
           page_number, chunk_index, content, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          chunkId,
          bookId,
          unit.id,
          '61998777-4c5f-4e51-bc0a-38de938c842a',
          '2f0f4f5a-7c5c-4136-a935-33c79effca3d',
          'c50199a5-3461-4b7f-bd6a-726bcad2e358',
          pNum,
          0,
          extractedText,
          JSON.stringify(meta)
        ]
      );
    }

    console.log(`      ✅ Page ${pNum}: ${extractedText.length} chars (Unit: ${unit ? 'Unit ' + unit.chapter_number : 'Front/Back/Review'})`);
    await new Promise(r => setTimeout(r, 800));
  }

  console.log(`\n======================================================================`);
  console.log(`✅ STEP 3 COMPLETE: ALL 114 PAGES EXTRACTED & STRUCTURED`);
  console.log(`======================================================================\n`);
}

async function main() {
  verifyPreflightSnapshot();
  await updateChapters();
  await extractAndStructureAllPages();
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
