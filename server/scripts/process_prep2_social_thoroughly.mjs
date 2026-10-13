import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import crypto from 'crypto';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '81b8a308-7fcf-4938-8c45-aa0056624f32'; // Prep 2 Social Studies
const expectedSnapshotChecksum = '14411c110e862e393a568c6c2add903b951d5d0a6f8fd0a80875ef84dcd0eb13';

// -----------------------------------------------------------------------------
// STEP 1: STRICT PREFLIGHT SNAPSHOT VERIFICATION
// -----------------------------------------------------------------------------
function verifyPreflightSnapshot() {
  console.log(`======================================================================`);
  console.log(`🛡️  STEP 1: PREFLIGHT SNAPSHOT INTEGRITY VERIFICATION`);
  console.log(`======================================================================`);

  const snapshotFile = path.resolve(process.cwd(), 'backups', `snapshot_${bookId}_2026-10-11T20-02-32-408Z.json`);
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
// VERIFIED CURRICULUM BOUNDARIES (FROM TEXTBOOK TOC & EMPIRICAL AUDIT)
// -----------------------------------------------------------------------------
const VERIFIED_UNITS = [
  {
    chapter_number: 1,
    id: 'b123b656-03b1-4af5-be4e-971dd5ba74a6', // PRESERVE EXISTING ID
    title_ar: 'الوحدة الأولى: الملامح الطبيعية لقارتي آسيا وأوروبا',
    title_en: 'Unit 1: Natural Features of Asia and Europe Continents',
    pdf_start: 7,
    pdf_end: 26,
    printed_start: 6,
    printed_end: 25,
    description: 'موقع ومظاهر سطح قارتي آسيا وأوروبا، المعادن ومصادر الطاقة في قارتي آسيا وأوروبا، وأنشطة وتقييم ختامي للوحدة الأولى',
    description_en: 'Location and surface features of Asia and Europe, minerals and energy resources, unit activities and assessment'
  },
  {
    chapter_number: 2,
    id: 'ae5ca8ad-b23f-4875-ba5d-8b3f0091ffa2', // PRESERVE EXISTING ID
    title_ar: 'الوحدة الثانية: الحضارات القديمة في قارة آسيا وعلاقتها بمصر',
    title_en: 'Unit 2: Ancient Civilizations in Asia Continent and Their Relations with Egypt',
    pdf_start: 27,
    pdf_end: 56,
    printed_start: 26,
    printed_end: 55,
    description: 'نماذج للحضارات القديمة بالشرق الأدنى (العراق وفينيقيا)، حضارات بلاد اليمن القديم، حضارات الشرق الأقصى (الهند والصين)، الحضارة الإسلامية، وأنشطة وتقييم ختامي للوحدة الثانية',
    description_en: 'Ancient Near East civilizations (Mesopotamia, Phoenicia), ancient Yemen, Far East civilizations (India, China), Islamic civilization, and unit assessment'
  },
  {
    chapter_number: 3,
    id: '5b304263-9134-470a-81c6-677db64ce02a', // PRESERVE EXISTING ID
    title_ar: 'الوحدة الثالثة: النُّظم البيئية في قارتي آسيا وأوروبا',
    title_en: 'Unit 3: Ecosystems in Asia and Europe Continents',
    pdf_start: 57,
    pdf_end: 80,
    printed_start: 56,
    printed_end: 79,
    description: 'نُظم الغابات في قارتي آسيا وأوروبا، نُظم الحشائش ونُظم الصحاري، النُّظم البيئية المائية، وأنشطة وتقييم ختامي للوحدة الثالثة',
    description_en: 'Forest systems in Asia and Europe, grassland and desert systems, aquatic ecosystems, and unit assessment'
  },
  {
    chapter_number: 4,
    id: 'c4000000-7fcf-4938-8c45-aa0056624f34', // STABLE 4TH CHAPTER ID
    title_ar: 'الوحدة الرابعة: الحضارات القديمة في قارة أوروبا وعلاقتها بمصر',
    title_en: 'Unit 4: Ancient Civilizations in Europe Continent and Their Relations with Egypt',
    pdf_start: 81,
    pdf_end: 96,
    printed_start: 80,
    printed_end: 95,
    description: 'الحضارة اليونانية، الحضارة الرومانية وعلاقتها بمصر والمسرح الروماني بالإسكندرية، وأنشطة وتقييم ختامي للوحدة الرابعة',
    description_en: 'Greek civilization, Roman civilization and its relations with Egypt, and unit assessment'
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

async function runPrep2SocialExtraction() {
  // 1. Snapshot Preflight
  verifyPreflightSnapshot();

  console.log(`======================================================================`);
  console.log(`🌍 THOROUGH, IDEMPOTENT EXTRACTION FOR PREP 2 SOCIAL STUDIES (Book ${bookId})`);
  console.log(`======================================================================\n`);

  // 2. Read book record & stage/grade/subject
  const bRes = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
  const book = bRes.rows[0];
  if (!book) throw new Error(`Book ${bookId} not found in database.`);
  console.log(`Target Book: "${book.title_ar}" (Stage: ${book.academic_stage_id}, Grade: ${book.grade_id}, Subject: ${book.subject_id})`);

  // 3. Update book_chapters preserving existing chapter IDs
  console.log(`\n2. Updating book_chapters with authentic ministerial curriculum units (preserving IDs)...`);
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

  // 4. Load PDF
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bookId}.pdf`);
  if (!fs.existsSync(diskPdfPath)) {
    throw new Error(`Reconstructed PDF missing at ${diskPdfPath}`);
  }
  const fullPdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(fullPdfBuf);
  const totalPages = srcDoc.getPageCount();
  console.log(`\n3. Loaded PDF: ${totalPages} pages from ${diskPdfPath} (${(fullPdfBuf.length / (1024 * 1024)).toFixed(2)} MB)\n`);

  // 5. Resumability check
  const existingPagesRes = await db.query(
    'SELECT page_number, char_count FROM book_pages WHERE book_id = $1',
    [bookId]
  );
  const completedPagesMap = new Map();
  for (const r of existingPagesRes.rows) {
    if (Number(r.char_count) >= 60) {
      completedPagesMap.set(Number(r.page_number), Number(r.char_count));
    }
  }
  console.log(`4. Resumability: Found ${completedPagesMap.size}/${totalPages} pages already completed with substantial text.`);

  // 6. Batching (2 pages per batch for maximum Arabic OCR quality)
  const BATCH_SIZE = 2;
  const batches = [];
  for (let p = 1; p <= totalPages; p += BATCH_SIZE) {
    const endP = Math.min(totalPages, p + BATCH_SIZE - 1);
    const pagesInBatch = [];
    for (let cur = p; cur <= endP; cur++) {
      pagesInBatch.push(cur);
    }
    const needsProcessing = pagesInBatch.some(pg => !completedPagesMap.has(pg));
    if (needsProcessing) {
      batches.push(pagesInBatch);
    }
  }

  console.log(`5. Batches to process: ${batches.length} (Total pages to extract: ${batches.flat().length})\n`);

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

    const prompt = `أنت نظام استخراج نصوص تعليمية فائق الدقة لمناهج الدراسات الاجتماعية بوزارة التربية والتعليم المصرية.
أمامك ${pageNums.length} صفحات مصورة من كتاب الدراسات الاجتماعية (الصف الثاني الإعدادي - الفصل الدراسي الأول): "مصر وعلاقتها بآسيا وأوروبا".
أرقام صفحات ملف الـ PDF هي: ${pageNums.join(', ')}.

المطلوب استخراج النص التعليمي الكامل لكل صفحة باللغة العربية الفصحى بدقة متناهية:
1. استخرج نصوص الدروس، العناوين الرئيسية والفرعية، الفقرات والشروحات التاريخية والجغرافية.
2. استخرج أسماء الشخصيات التاريخية (مثل الإسكندر، رمسيس، حمورابي، ملوك اليمن، الفينيقيين، إلخ)، التواريخ، المعارك، والمعالم الأثرية (مثل المسرح الروماني، سور الصين العظيم).
3. استخرج نصوص الخرائط والظواهر الجغرافية (الجبال، الهضاب، الأنهار، المناخ، الأقاليم النباتية والحيوانية، المعادن ومصادر الطاقة).
4. استخرج نصوص الجداول والمفاهيم والمصطلحات والأسئلة والأنشطة والتقييمات الختامية بدقة.
5. إذا كانت الصفحة غلافاً أو صفحة بيضاء أو رسماً توضيحياً بلا نص، استخرج النص الموجود إن وُجد أو اتركه نصاً فارغاً "".

أخرج النتيجة بصيغة JSON حصراً بهذا التنسيق:
{
  "pages": [
    ${pageNums.map(n => `{"page_number": ${n}, "text": "النص التعليمي المستخرج لصفحة ${n}..."}`).join(',\n    ')}
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

          // Handle Chunk Indexing:
          // For educational pages (within units 1..4 or general review pages 97..104)
          const isGeneralReview = pNum >= 97 && pNum <= 104;
          if (text.length >= 50 && (unit || isGeneralReview)) {
            await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND page_number = $2', [bookId, pNum]);

            const chunkId = uuidv4();
            const chapterId = unit ? unit.id : null;
            const meta = {
              unit_number: unit ? unit.chapter_number : null,
              section_type: unit ? 'curriculum_unit' : 'general_review',
              pdf_page: pNum,
              subject: 'Social Studies',
              grade: 'Prep 2'
            };

            await db.query(
              `INSERT INTO book_chunks (
                id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                chunkId,
                bookId,
                chapterId,
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
          console.log(`   -> Page ${pNum}: Extracted ${text.length} chars (Unit: ${unit ? unit.chapter_number : (isGeneralReview ? 'General Review' : 'Intro/Front-matter')})`);
        }
      }
    } catch (err) {
      console.error(`   ❌ Error on batch [${pageNums.join(', ')}]:`, err.message);
    }

    // Rate-limiting delay
    await new Promise(r => setTimeout(r, 2200));
  }

  // 7. Update Book Metadata in books table
  console.log(`\n6. Updating Book 4 metadata in books table...`);
  await db.query(
    `UPDATE books 
     SET total_pages = $1, processing_status = 'COMPLETED', processing_error = NULL
     WHERE id = $2`,
    [totalPages, bookId]
  );
  console.log(`   ✅ Book 4 status set to COMPLETED with total_pages = ${totalPages}.`);

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
  console.log(`🏁 EXTRACTION SUMMARY FOR PREP 2 SOCIAL STUDIES`);
  console.log(`Total Pages in book_pages: ${finalPages.rows[0].count}/${totalPages}`);
  console.log(`Total Unicode Characters: ${finalPages.rows[0].total_unicode}`);
  console.log(`Total Bytes (UTF-8): ${finalPages.rows[0].total_bytes}`);
  console.log(`Total Indexed Chunks: ${finalChunks.rows[0].count}`);
  console.log(`Short/Blank Pages Count: ${shortOrBlankPages.length}`);
  console.log(`======================================================================\n`);

  fs.writeFileSync(
    path.resolve(process.cwd(), 'scripts', 'prep2_social_extraction_report.json'),
    JSON.stringify({
      book_id: bookId,
      total_pdf_pages: totalPages,
      pages_in_db: finalPages.rows[0].count,
      total_unicode_chars: finalPages.rows[0].total_unicode,
      total_bytes: finalPages.rows[0].total_bytes,
      total_chunks: finalChunks.rows[0].count,
      short_or_blank_pages: shortOrBlankPages
    }, null, 2)
  );

  console.log(`Report saved to scripts/prep2_social_extraction_report.json`);
}

runPrep2SocialExtraction().catch(err => {
  console.error('Fatal Extraction Error:', err);
  process.exit(1);
});
