import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import crypto from 'crypto';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '013411b8-edec-477b-bd42-3dbdda9fb6a9'; // Book 12: Prep 3 Arabic
const expectedSnapshotChecksum = '19f7efb53fe33bd1b3219b4fb081d43879c1525758d549f10abe3274ebb2d600';
const snapshotFileName = 'snapshot_013411b8-edec-477b-bd42-3dbdda9fb6a9_2026-10-12T08-59-27-419Z.json';

// -----------------------------------------------------------------------------
// STEP 1: PREFLIGHT SNAPSHOT INTEGRITY VERIFICATION
// -----------------------------------------------------------------------------
function verifyPreflightSnapshot() {
  console.log(`======================================================================`);
  console.log(`🛡️  STEP 1: PREFLIGHT SNAPSHOT INTEGRITY VERIFICATION (BOOK 12)`);
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
// VERIFIED CURRICULUM BOUNDARIES (THIRD PREPARATORY ARABIC - TERM 1)
// -----------------------------------------------------------------------------
const VERIFIED_UNITS = [
  {
    chapter_number: 1,
    id: 'c7043f86-6a40-4417-a1b8-60e3301e7cb7', // PRESERVE EXISTING ID
    title_en: 'Unit 1: Values That Protect Our Youth',
    title_ar: 'الوحدة الأولى: قيم تحمي شبابنا',
    pdf_start: 15,
    pdf_end: 59,
    description: 'نصوص الاستماع والقراءة (آداب التعامل مع الوالدين، أغلى من الذهب، تحية للشباب لأحمد شوقي) وقواعد النحو (اسم الفاعل، اسم المفعول) والإملاء والتعبير'
  },
  {
    chapter_number: 2,
    id: 'e75bad6f-9189-4f0c-8bc1-d2152ce2bb6c', // PRESERVE EXISTING ID
    title_en: 'Unit 2: Towards Sound Thinking',
    title_ar: 'الوحدة الثانية: نحو تفكير سليم',
    pdf_start: 60,
    pdf_end: 105,
    description: 'نصوص الاستماع والقراءة (ثمرة القراءة، أفضل النعم، خير جليس لأحمد زكي، تاج الفضائل للإمام علي) وقواعد النحو (صيغ المبالغة، اسم المكان) والإملاء والتعبير'
  },
  {
    chapter_number: 3,
    id: 'e478df26-829f-4cbd-95cc-56b5428af702', // PRESERVE EXISTING ID
    title_en: 'Unit 3: Me and the Future',
    title_ar: 'الوحدة الثالثة: أنا والمستقبل',
    pdf_start: 106,
    pdf_end: 148,
    description: 'نصوص الاستماع والقراءة (بناء المستقبل في عصر الآلة، حرفتك بين يديك، مستقبل مصر في الزراعة، ابن بيدك مجدك للرصافي) وقواعد النحو (اسم الزمان، اسم الآلة) والإملاء والتعبير'
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
// STEP 2: UPDATE BOOK CHAPTERS
// -----------------------------------------------------------------------------
async function updateChapters() {
  console.log(`--- STEP 2: SYNCHRONIZING OFFICIAL BOOK CHAPTERS ---`);
  for (const u of VERIFIED_UNITS) {
    await db.query(
      `UPDATE book_chapters SET
         title_ar = $1,
         title_en = $2,
         description = $3,
         description_en = $4,
         start_page = $5,
         end_page = $6
       WHERE id = $7 AND book_id = $8`,
      [
        u.title_ar,
        u.title_en,
        u.description,
        u.description,
        u.pdf_start,
        u.pdf_end,
        u.id,
        bookId
      ]
    );
    console.log(`   ✅ Unit ${u.chapter_number}: "${u.title_ar}" (Pages ${u.pdf_start}..${u.pdf_end}) [ID: ${u.id}]`);
  }
  console.log('');
}

// -----------------------------------------------------------------------------
// STEP 3: EXTRACT AND STRUCTURE ALL 162 PAGES
// -----------------------------------------------------------------------------
async function extractAndStructureAllPages() {
  console.log(`======================================================================`);
  console.log(`📄 STEP 3: HIGH-FIDELITY EXTRACTION & OCR (BOOK 12 - 162 PAGES)`);
  console.log(`======================================================================`);

  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bookId}.pdf`);
  if (!fs.existsSync(diskPdfPath)) {
    throw new Error(`CRITICAL: Reconstructed PDF file missing at ${diskPdfPath}`);
  }

  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);
  const totalPages = srcDoc.getPageCount();
  console.log(`   Source PDF verified: ${totalPages} total pages (${(pdfBuf.length / (1024 * 1024)).toFixed(2)} MB)\n`);

  if (totalPages !== 162) {
    throw new Error(`Expected exactly 162 pages in Book 12 PDF, found: ${totalPages}`);
  }

  // Clean any erroneous placeholder pages from cancelled attempt
  await db.query("DELETE FROM book_pages WHERE book_id = $1 AND raw_text LIKE '%عذراً، لا تتوفر صفحات%'", [bookId]);

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

    const prompt = `You are a high-precision OCR extraction engine for Egyptian Ministry of Education Arabic textbooks.
In front of you is a single page from the Third Preparatory Arabic textbook (كتاب اللغة العربية للصف الثالث الإعدادي - الفصل الدراسي الأول).

Tasks:
1. Extract ALL Arabic text, diacritics (التشكيل), vocabulary meanings, reading comprehension questions, and literary texts verbatim.
2. Extract all grammatical rules (النحو: اسم الفاعل، اسم المفعول، صيغ المبالغة، اسم المكان، اسم الزمان، اسم الآلة)، examples, parsing (الإعراب), exercises, and spelling rules.
3. Extract poetry lines with exact hemistichs (شطري البيت الشعري) and poetic aesthetics (مواطن الجمال).
4. If this page is a unit divider, table of contents, review, or exam, transcribe all headings and problems verbatim.
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
        unit_title: unit.title_ar,
        section_type: 'curriculum_unit',
        pdf_page: pNum,
        subject: 'اللغة العربية',
        grade: 'الصف الثالث الإعدادي',
        term: 1,
        language: 'ar'
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
          '954bf689-995f-4020-9ce9-86fa6d2a5a29',
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
  console.log(`✅ STEP 3 COMPLETE: ALL 162 PAGES EXTRACTED & STRUCTURED`);
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
