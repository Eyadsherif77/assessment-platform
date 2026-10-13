import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '19886434-1839-427d-af31-4c64fcf79525'; // Math Prep 2

const VERIFIED_MATH_UNITS = [
  {
    chapter_number: 1,
    id: '8ccdd54b-87ed-419f-a737-a35f11620f15',
    title_en: 'Unit 1: Real Numbers and Their Operations',
    title_ar: 'الوحدة الأولى: الأعداد الحقيقية والعمليات عليها',
    pdf_start: 4,
    pdf_end: 34,
    printed_start: 2,
    printed_end: 32,
    description: 'Real numbers, intervals and operations on intervals, operations on real numbers, laws of square and cube roots, laws of exponents in R.',
    description_ar: 'الأعداد الحقيقية، الفترات والعمليات عليها، العمليات على الأعداد الحقيقية، قوانين الجذور التربيعية والتكعيبية، الأسس في ح.'
  },
  {
    chapter_number: 2,
    id: '7b7aa659-9203-46e2-97f9-341484e882fc',
    title_en: 'Unit 2: Algebra (Factorization)',
    title_ar: 'الوحدة الثانية: الجبر (التحليل)',
    pdf_start: 35,
    pdf_end: 63,
    printed_start: 33,
    printed_end: 61,
    description: 'Factorizing by taking out GCF, factorizing trinomials, special cases (difference of squares, sum/difference of cubes), factorizing by grouping.',
    description_ar: 'التحليل بإخراج العامل المشترك الأعلى، تحليل المقدار الثلاثي، الحالات الخاصة (فرق بين مربعين ومكعبين)، التحليل بالتقسيم.'
  },
  {
    chapter_number: 3,
    id: 'dba6933a-2b80-4d3b-ada4-3ac6acfb58c1',
    title_en: 'Unit 3: Geometry (Theorems & Triangles)',
    title_ar: 'الوحدة الثالثة: الهندسة (النظريات والمثلثات)',
    pdf_start: 64,
    pdf_end: 107,
    printed_start: 62,
    printed_end: 105,
    description: 'Congruence of triangles, Pythagoras theorem and its converse, parallelism, medians of the triangle, isosceles triangle properties, interior and exterior angles of polygons.',
    description_ar: 'تطابق المثلثات، نظرية فيثاغورس وعكسها، التوازي، متوسطات المثلث، خواص المثلث متساوي الساقين، زوايا المضلع الداخلة والخارجة.'
  },
  {
    chapter_number: 4,
    id: 'ccb5b2a6-d55a-40b7-9d20-673fc9764c72',
    title_en: 'Unit 4: Statistics & General Revision',
    title_ar: 'الوحدة الرابعة: الإحصاء والمراجعة العامة',
    pdf_start: 108,
    pdf_end: 130,
    printed_start: 106,
    printed_end: 128,
    description: 'Ascending cumulative frequency table, graphical representation, measures of central tendency (mean, median, mode), and model examination papers.',
    description_ar: 'الجدول التكراري المتجمع الصاعد، التمثيل البياني، مقاييس النزعة المركزية (الوسط والوسيط والمنوال)، ونماذج الامتحانات العامة.'
  }
];

function getUnitForPage(pageNum) {
  for (const u of VERIFIED_MATH_UNITS) {
    if (pageNum >= u.pdf_start && pageNum <= u.pdf_end) {
      return u;
    }
  }
  return null;
}

async function runMathExtraction() {
  console.log(`======================================================================`);
  console.log(`📐 END-TO-END OCR & CURRICULUM PIPELINE FOR MATH PREP 2 (Book ${bookId})`);
  console.log(`======================================================================\n`);

  // 1. Update book_chapters preserving existing chapter IDs
  console.log('1. Updating book_chapters with authentic ministerial units (preserving IDs)...');
  for (const u of VERIFIED_MATH_UNITS) {
    await db.query(
      `INSERT INTO book_chapters (
        id, book_id, chapter_number, title_ar, title_en, start_page, end_page, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON DUPLICATE KEY UPDATE 
        title_ar = VALUES(title_ar),
        title_en = VALUES(title_en),
        start_page = VALUES(start_page),
        end_page = VALUES(end_page),
        description = VALUES(description)`,
      [u.id, bookId, u.chapter_number, u.title_ar, u.title_en, u.pdf_start, u.pdf_end, u.description]
    );
  }
  console.log('   ✅ 4 official units updated in book_chapters with verified boundaries.');

  // 2. Load PDF file
  const diskPdfPath = path.resolve('uploads', `book_${bookId}.pdf`);
  const fullBytes = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(fullBytes);
  const totalPages = srcDoc.getPageCount();
  console.log(`2. Reconstructed PDF loaded: ${totalPages} pages.\n`);

  // 3. Resumability check in book_pages
  const existingRes = await db.query(
    'SELECT page_number, char_count FROM book_pages WHERE book_id = $1',
    [bookId]
  );
  const existingMap = new Map();
  for (const r of existingRes.rows) {
    if (Number(r.char_count) >= 60) {
      existingMap.set(Number(r.page_number), Number(r.char_count));
    }
  }
  console.log(`3. Resumability: Found ${existingMap.size}/${totalPages} pages already completed with substantial text.`);

  // 4. Batching (2 pages per batch for maximum OCR fidelity on mathematical notation)
  const BATCH_SIZE = 2;
  const batches = [];
  for (let p = 1; p <= totalPages; p += BATCH_SIZE) {
    const endP = Math.min(totalPages, p + BATCH_SIZE - 1);
    const pagesInBatch = [];
    for (let cur = p; cur <= endP; cur++) {
      pagesInBatch.push(cur);
    }
    const needsProcessing = pagesInBatch.some(pg => !existingMap.has(pg));
    if (needsProcessing) {
      batches.push(pagesInBatch);
    }
  }
  console.log(`4. Total batches to process: ${batches.length} (Pages remaining: ${batches.flat().length})\n`);

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

    const prompt = `You are a high-precision OCR extraction engine for Egyptian Ministry of Education Mathematics textbooks (English Edition).
You are processing PDF pages: ${pageNums.join(', ')} of Prep 2 Mathematics (Term 1).

Extract ALL educational content verbatim from each page:
- Section titles, lesson names, and definitions.
- Mathematical formulas, equations, inequalities, theorems, corollaries, and algebraic expressions.
- Transcribe mathematical symbols clearly: sqrt, cube root, exponents (x^2, x^3), intervals ([a, b], ]a, b[), triangles (triangle ABC), angles, congruent (≅), parallel (//), perpendicular (⊥), belongs to (∈), subset (⊂).
- Solved examples, step-by-step proofs, and printed exercises.
- If a page is a blank page or purely decorative cover with no text, output an empty string "".

Return strict JSON:
{
  "pages": [
    ${pageNums.map(n => `{"page_number": ${n}, "text": "Extracted educational math text for page ${n}..."}`).join(',\n    ')}
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
              reason: text.length === 0 ? 'BLANK_PAGE' : 'SHORT_OR_DIAGRAM_ONLY'
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
          const unit = getUnitForPage(pNum);

          if (text.length >= 50 && unit) {
            await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND page_number = $2', [bookId, pNum]);

            const chunkId = uuidv4();
            await db.query(
              `INSERT INTO book_chunks (
                id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                chunkId,
                bookId,
                unit.id,
                '61998777-4c5f-4e51-bc0a-38de938c842a', // Preparatory
                '44d13655-da95-4425-8566-fd8451af1965', // Prep 2 (الصف الثاني الإعدادي)
                '83ef20f6-1b1b-4ac0-bd66-d3333a7c505e', // Mathematics (الرياضيات)
                pNum,
                0,
                text,
                JSON.stringify({ unit_number: unit.chapter_number, pdf_page: pNum, subject: 'Mathematics' })
              ]
            );
          }
          console.log(`   -> Page ${pNum}: Extracted ${text.length} chars (Unit: ${unit ? unit.chapter_number : 'Intro'})`);
        }
      }
    } catch (err) {
      console.error(`   ❌ Error on batch [${pageNums.join(', ')}]:`, err.message);
    }

    // Rate-limiting pause
    await new Promise(r => setTimeout(r, 2200));
  }

  // 5. Final Coverage Audit
  const finalPages = await db.query(
    'SELECT count(*) as count, sum(char_count) as total_chars, sum(char_length(raw_text)) as total_unicode, sum(length(raw_text)) as total_bytes FROM book_pages WHERE book_id = $1',
    [bookId]
  );
  const finalChunks = await db.query(
    'SELECT count(*) as count FROM book_chunks WHERE book_id = $1',
    [bookId]
  );

  console.log(`\n======================================================================`);
  console.log(`🏁 EXTRACTION COMPLETE FOR MATH PREP 2`);
  console.log(`Total Pages in book_pages: ${finalPages.rows[0].count}/${totalPages}`);
  console.log(`Total Unicode Characters: ${finalPages.rows[0].total_unicode}`);
  console.log(`Total Bytes (UTF-8): ${finalPages.rows[0].total_bytes}`);
  console.log(`Total Indexed Chunks: ${finalChunks.rows[0].count}`);
  console.log(`Short/Blank Pages Count: ${shortOrBlankPages.length}`);
  console.log(`======================================================================\n`);

  fs.writeFileSync(
    path.resolve('scripts', 'math_prep2_extraction_report.json'),
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

  process.exit(0);
}

runMathExtraction().catch(err => {
  console.error('Fatal Extraction Error:', err);
  process.exit(1);
});
