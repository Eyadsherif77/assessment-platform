import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9'; // Prep 3 Social Studies

// Verified Unit Boundaries by PDF Page Index (1-based)
const VERIFIED_UNITS = [
  {
    chapter_number: 1,
    title_ar: 'الوحدة الأولى: الملامح الطبيعية والحضارية لقارات العالم الجديد',
    title_en: 'Unit 1: Natural and Civilizational Features of the New World Continents',
    pdf_start: 9,
    pdf_end: 29,
    printed_start: 10,
    printed_end: 28,
    description: 'موقع ومظاهر سطح قارات العالم الجديد، الحضارات القديمة في الأميركتين، الكشوف الجغرافية',
    description_en: 'Location and Surface Features, Ancient Civilizations, Geographical Discoveries'
  },
  {
    chapter_number: 2,
    title_ar: 'الوحدة الثانية: مصر في عصر محمد علي وخلفائه',
    title_en: 'Unit 2: Egypt in the Era of Muhammad Ali and His Successors',
    pdf_start: 30,
    pdf_end: 63,
    printed_start: 29,
    printed_end: 62,
    description: 'تولية محمد علي حكم مصر وتثبيت دعائم حكمه، محمد علي وبناء الدولة الحديثة في مصر، مصر في عصر خلفاء محمد علي',
    description_en: 'Muhammad Ali Accession, Building the Modern State, Era of Successors'
  },
  {
    chapter_number: 3,
    title_ar: 'الوحدة الثالثة: النظم البيئية في قارات العالم الجديد',
    title_en: 'Unit 3: Environmental Systems in the New World Continents',
    pdf_start: 64,
    pdf_end: 91,
    printed_start: 63,
    printed_end: 90,
    description: 'نظم الغابات والحشائش، النظم البيئية الصحراوية والمائية، التغير المناخي وتأثيره على النظم البيئية',
    description_en: 'Forest and Grassland Systems, Desert and Aquatic Systems, Climate Change'
  },
  {
    chapter_number: 4,
    title_ar: 'الوحدة الرابعة: الحركة الوطنية في مواجهة الاحتلال البريطاني',
    title_en: 'Unit 4: The National Movement Facing British Occupation',
    pdf_start: 92,
    pdf_end: 113,
    printed_start: 91,
    printed_end: 112,
    description: 'الثورة العرابية وبداية الاحتلال البريطاني لمصر، كفاح الحركة الوطنية (مصطفى كامل ومحمد فريد)',
    description_en: 'Urabi Revolution, Struggle of National Movement (Mustafa Kamel and Mohamed Farid)'
  }
];

function getUnitForPdfPage(pdfPageNum, chapterIdMap) {
  for (const u of VERIFIED_UNITS) {
    if (pdfPageNum >= u.pdf_start && pdfPageNum <= u.pdf_end) {
      return { unit: u, chapterId: chapterIdMap[u.chapter_number] };
    }
  }
  return { unit: null, chapterId: null };
}

async function runThoroughSocialExtraction() {
  console.log(`======================================================================`);
  console.log(`🌍 THOROUGH, RESUMABLE EXTRACTION FOR PREP 3 SOCIAL STUDIES (Book ${bookId})`);
  console.log(`======================================================================\n`);

  // 1. Database and Stage/Grade/Subject references
  const bRes = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
  const book = bRes.rows[0];

  // 2. Persist 4 Verified Chapters in DB (Replacing 3 synthetic ones)
  console.log(`1. Updating book_chapters with authentic ministerial curriculum units...`);
  await db.query('DELETE FROM book_chapters WHERE book_id = $1', [bookId]);

  const chapterIdMap = {};
  for (const u of VERIFIED_UNITS) {
    const chId = uuidv4();
    chapterIdMap[u.chapter_number] = chId;
    await db.query(
      `INSERT INTO book_chapters (
        id, book_id, chapter_number, title_ar, title_en, start_page, end_page, description, description_en
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [chId, bookId, u.chapter_number, u.title_ar, u.title_en, u.pdf_start, u.pdf_end, u.description, u.description_en]
    );
  }
  console.log(`   ✅ 4 verified chapters mapped to IDs:`, chapterIdMap);

  // 3. Load PDF
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bookId}.pdf`);
  const fullPdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(fullPdfBuf);
  const totalPages = srcDoc.getPageCount();
  console.log(`2. Loaded PDF with ${totalPages} total pages.\n`);

  // 4. Resumability check
  const existingPagesRes = await db.query(
    'SELECT page_number, char_count FROM book_pages WHERE book_id = $1',
    [bookId]
  );
  const completedPagesMap = new Map();
  for (const r of existingPagesRes.rows) {
    if (r.char_count >= 100) {
      completedPagesMap.set(Number(r.page_number), r.char_count);
    }
  }
  console.log(`3. Resumability: Found ${completedPagesMap.size} pages already extracted with substantial text.`);

  // 5. Batching (3 pages per batch)
  const BATCH_SIZE = 3;
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

  console.log(`4. Total batches to process: ${batches.length} (Pages: ${batches.flat().length})`);

  let totalCharsAdded = 0;
  const shortOrReviewPages = [];

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const pageNums = batches[bIdx];
    console.log(`\n--- [Batch ${bIdx + 1}/${batches.length}] Extracting PDF Pages: [${pageNums.join(', ')}] ---`);

    const batchDoc = await PDFDocument.create();
    const zeroPages = pageNums.map(n => n - 1).filter(idx => idx >= 0 && idx < totalPages);
    const copiedPages = await batchDoc.copyPages(srcDoc, zeroPages);
    copiedPages.forEach(p => batchDoc.addPage(p));
    const batchBytes = await batchDoc.save();
    const batchB64 = Buffer.from(batchBytes).toString('base64');

    const prompt = `أنت نظام استخراج نصوص تعليمية دقيق لمناهج الدراسات الاجتماعية بوزارة التربية والتعليم المصرية.
أمامك ${pageNums.length} صفحات مصورة من كتاب الدراسات الاجتماعية (الصف الثالث الإعدادي - الفصل الدراسي الأول).
أرقام صفحات ملف الـ PDF هي: ${pageNums.join(', ')}.

المطلوب استخراج النص التعليمي الكامل لكل صفحة باللغة العربية بدقة تامة:
- العناوين، المفاهيم الجغرافية والتاريخية، التواريخ، الأحداث، الشخصيات، التفسيرات ونتائج الأحداث (بما تفسر، ما النتائج المترتبة على).
- تفريغ نصوص الخرائط والجداول والأسئلة والتدريبات كما هي.
- إذا كانت الصفحة بيضاء أو غلاف فقط بدون نص، أعد نصاً فارغاً "".

أجب بصيغة JSON حصراً بهذا التنسيق:
{
  "pages": [
    {
      "page_number": ${pageNums[0]},
      "text": "النص التعليمي الكامل المستخرج..."
    }
  ]
}`;

    try {
      const resStr = await GeminiClient.generateContent({
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: batchB64 } },
          { text: prompt }
        ],
        responseMimeType: 'application/json',
        temperature: 0.1
      });

      const parsed = JSON.parse(resStr);
      if (parsed.pages && Array.isArray(parsed.pages)) {
        for (const item of parsed.pages) {
          const pNum = Number(item.page_number) || pageNums[0];
          const text = String(item.text || '').trim();

          if (text.length < 50) {
            shortOrReviewPages.push({ page_number: pNum, length: text.length, reason: text.length === 0 ? 'BLANK_PAGE' : 'SHORT_OR_MAP_ONLY' });
          }

          // Persist to book_pages
          const pageId = uuidv4();
          await db.query(
            `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
             VALUES ($1, $2, $3, $4, $5)
             ON DUPLICATE KEY UPDATE raw_text = VALUES(raw_text), char_count = VALUES(char_count)`,
            [pageId, bookId, pNum, text, text.length]
          );

          // Find unit
          const { unit, chapterId } = getUnitForPdfPage(pNum, chapterIdMap);

          if (text.length >= 50 && chapterId) {
            await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND page_number = $2', [bookId, pNum]);

            const chunkId = uuidv4();
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
                JSON.stringify({ unit_number: unit.chapter_number, unit_name: unit.title_ar, pdf_page: pNum })
              ]
            );
            totalCharsAdded += text.length;
          }
          console.log(`   * Saved Page ${pNum}: ${text.length} chars (Unit: ${unit ? unit.chapter_number : 'Front Matter'})`);
        }
      }
    } catch (err) {
      console.warn(`   ⚠️ Batch error for pages [${pageNums.join(', ')}]:`, err.message);
    }

    // Rate-limiting pause
    await new Promise(r => setTimeout(r, 2200));
  }

  // Update book total_pages & status
  await db.query(
    `UPDATE books SET total_pages = $1, processing_status = 'COMPLETED' WHERE id = $2`,
    [totalPages, bookId]
  );

  console.log(`\n======================================================================`);
  console.log(`🎉 EXTRACTION SUMMARY FOR PREP 3 SOCIAL STUDIES`);
  console.log(`======================================================================`);
  const finalPagesRes = await db.query(
    'SELECT COUNT(*) as total_pages, SUM(char_count) as total_chars, SUM(CASE WHEN char_count < 50 THEN 1 ELSE 0 END) as short_pages FROM book_pages WHERE book_id = $1',
    [bookId]
  );
  const finalChunksRes = await db.query(
    'SELECT COUNT(*) as total_chunks FROM book_chunks WHERE book_id = $1',
    [bookId]
  );

  console.log(`Total Pages in DB: ${finalPagesRes.rows[0].total_pages} / ${totalPages}`);
  console.log(`Total Characters: ${finalPagesRes.rows[0].total_chars}`);
  console.log(`Total Chunks: ${finalChunksRes.rows[0].total_chunks}`);
  console.log(`Short/Blank Pages (flagged for review): ${finalPagesRes.rows[0].short_pages}`);

  fs.writeFileSync(
    './scripts/prep3_social_extraction_report.json',
    JSON.stringify({
      book_id: bookId,
      title: book.title_ar,
      total_pdf_pages: totalPages,
      pages_in_db: finalPagesRes.rows[0].total_pages,
      total_chars: finalPagesRes.rows[0].total_chars,
      total_chunks: finalChunksRes.rows[0].total_chunks,
      short_pages: shortOrReviewPages
    }, null, 2),
    'utf-8'
  );
}

runThoroughSocialExtraction().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
