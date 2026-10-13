import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec';

// Verified Unit Boundaries by PDF Page Index (1-based)
const VERIFIED_UNITS = [
  {
    chapter_number: 1,
    title_ar: 'الوحدة الأولى: المادة',
    title_en: 'Unit 1: The Matter',
    pdf_start: 8,
    pdf_end: 38,
    printed_start: 2,
    printed_end: 32,
    description: 'تركيب الذرة، الجدول الدوري للعناصر، المادة وخصائصها، الروابط الكيميائية',
    description_en: 'Structure of the Atom, Periodic Table, Matter and Properties, Chemical Bonds'
  },
  {
    chapter_number: 2,
    title_ar: 'الوحدة الثانية: مجالات القوى',
    title_en: 'Unit 2: Force Fields',
    pdf_start: 39,
    pdf_end: 61,
    printed_start: 33,
    printed_end: 55,
    description: 'القوى الكهربية، القوى المغناطيسية، قوى الجاذبية',
    description_en: 'Electric Forces, Magnetic Forces, Gravitational Forces'
  },
  {
    chapter_number: 3,
    title_ar: 'الوحدة الثالثة: الكائنات الحية، تركيبها وعملياتها',
    title_en: 'Unit 3: Living Organisms, Their Structure and Processes',
    pdf_start: 62,
    pdf_end: 85,
    printed_start: 56,
    printed_end: 79,
    description: 'الخلايا والحياة، الخصائص العامة للكائنات الحية، الميكروبات',
    description_en: 'Cells and Life, General Characteristics of Living Organisms, Microbes'
  },
  {
    chapter_number: 4,
    title_ar: 'الوحدة الرابعة: نظام (الأرض - الشمس - القمر)',
    title_en: 'Unit 4: The (Earth - Sun - Moon) System',
    pdf_start: 86,
    pdf_end: 102,
    printed_start: 80,
    printed_end: 95,
    description: 'الأرض والمجموعة الشمسية، خسوف القمر',
    description_en: 'The Earth and the Solar System, Lunar Eclipse'
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

async function runThoroughScienceExtraction() {
  console.log(`======================================================================`);
  console.log(`🔬 THOROUGH, RESUMABLE EXTRACTION FOR SCIENCE PREP 1 (Book ${bookId})`);
  console.log(`======================================================================\n`);

  // 1. Verify/Update Verified Chapters in Database
  console.log(`1. Ensuring verified authentic chapters exist in DB...`);
  const existingChapters = await db.query(
    'SELECT id, chapter_number FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC',
    [bookId]
  );

  const chapterIdMap = {};
  if (existingChapters.rows.length === 4) {
    for (const r of existingChapters.rows) {
      const u = VERIFIED_UNITS.find(u => u.chapter_number === r.chapter_number);
      chapterIdMap[r.chapter_number] = r.id;
      await db.query(
        `UPDATE book_chapters SET
          title_ar = $1, title_en = $2, start_page = $3, end_page = $4, description = $5, description_en = $6
         WHERE id = $7`,
        [u.title_ar, u.title_en, u.pdf_start, u.pdf_end, u.description, u.description_en, r.id]
      );
    }
  } else {
    await db.query('DELETE FROM book_chapters WHERE book_id = $1', [bookId]);
    for (const u of VERIFIED_UNITS) {
      const chId = uuidv4();
      chapterIdMap[u.chapter_number] = chId;
      await db.query(
        `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, description, description_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [chId, bookId, u.chapter_number, u.title_ar, u.title_en, u.pdf_start, u.pdf_end, u.description, u.description_en]
      );
    }
  }
  console.log(`   ✅ 4 verified chapters mapped to IDs:`, chapterIdMap);

  // 2. Load PDF
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bookId}.pdf`);
  if (!fs.existsSync(diskPdfPath)) {
    throw new Error(`Cached PDF not found at ${diskPdfPath}`);
  }
  const fullPdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(fullPdfBuf);
  const totalPages = srcDoc.getPageCount();
  console.log(`2. Loaded PDF with ${totalPages} total pages.\n`);

  // 3. Check existing extracted pages in DB (Resumability check)
  const existingPagesRes = await db.query(
    'SELECT page_number, char_count FROM book_pages WHERE book_id = $1',
    [bookId]
  );
  const completedPagesMap = new Map();
  for (const r of existingPagesRes.rows) {
    if (r.char_count >= 60) {
      completedPagesMap.set(Number(r.page_number), r.char_count);
    }
  }
  console.log(`3. Resumability: Found ${completedPagesMap.size} pages already extracted with substantial text.`);

  // 4. Batch Process Remaining Pages
  // We process in small 3-page batches for fast, high-quality multimodal OCR
  const BATCH_SIZE = 3;
  const batches = [];
  for (let p = 1; p <= totalPages; p += BATCH_SIZE) {
    const endP = Math.min(totalPages, p + BATCH_SIZE - 1);
    const pagesInBatch = [];
    for (let cur = p; cur <= endP; cur++) {
      pagesInBatch.push(cur);
    }
    // Only process if at least one page in batch is missing
    const needsProcessing = pagesInBatch.some(pg => !completedPagesMap.has(pg));
    if (needsProcessing) {
      batches.push(pagesInBatch);
    }
  }

  console.log(`4. Total batches to process: ${batches.length} (Pages needing extraction: ${batches.flat().length})`);

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

    const prompt = `You are a high-accuracy OCR system for Egyptian Ministry of Education Science textbooks.
You are given ${pageNums.length} page images from Prep 1 Science (English language textbook).
The pages correspond to PDF page numbers: ${pageNums.join(', ')}.

For EACH page, extract:
- The full textbook educational text exactly as printed (the titles, concepts, definitions, explanations, formulas, exercises).
- If the page is blank or has no text, return empty string "".
- Do NOT skip scientific explanations or text.

Output strictly valid JSON in this format:
{
  "pages": [
    {
      "page_number": ${pageNums[0]},
      "text": "Full extracted text..."
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
            shortOrReviewPages.push({ page_number: pNum, length: text.length, reason: text.length === 0 ? 'BLANK_PAGE' : 'SHORT_OR_IMAGE' });
          }

          // Persist to book_pages
          const pageId = uuidv4();
          await db.query(
            `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
             VALUES ($1, $2, $3, $4, $5)
             ON DUPLICATE KEY UPDATE raw_text = VALUES(raw_text), char_count = VALUES(char_count)`,
            [pageId, bookId, pNum, text, text.length]
          );

          // Find which unit this belongs to
          const { unit, chapterId } = getUnitForPdfPage(pNum, chapterIdMap);

          if (text.length >= 50 && chapterId) {
            // Delete old chunk for this exact page to avoid duplication
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
                '61998777-4c5f-4e51-bc0a-38de938c842a',
                '4baa5084-112d-45e5-908e-1ae67ea8b4e8',
                '5ebb5fc2-6edb-4f65-9057-bdb09ccae74e',
                pNum,
                0,
                text,
                JSON.stringify({ unit_number: unit.chapter_number, unit_name: unit.title_en, pdf_page: pNum })
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

    // Rate-limiting pause between batches
    await new Promise(r => setTimeout(r, 2200));
  }

  // Update book total_pages & status
  await db.query(
    `UPDATE books SET total_pages = $1, processing_status = 'COMPLETED' WHERE id = $2`,
    [totalPages, bookId]
  );

  console.log(`\n======================================================================`);
  console.log(`🎉 EXTRACTION SUMMARY`);
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
    './scripts/science_extraction_report.json',
    JSON.stringify({
      book_id: bookId,
      total_pdf_pages: totalPages,
      pages_in_db: finalPagesRes.rows[0].total_pages,
      total_chars: finalPagesRes.rows[0].total_chars,
      total_chunks: finalChunksRes.rows[0].total_chunks,
      short_pages: shortOrReviewPages
    }, null, 2),
    'utf-8'
  );
}

runThoroughScienceExtraction().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
