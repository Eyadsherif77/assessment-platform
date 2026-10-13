import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '19886434-1839-427d-af31-4c64fcf79525';
const MISSING_PAGES = [13, 14, 47, 48, 75, 76, 77, 78, 96, 99, 100];

const VERIFIED_MATH_UNITS = [
  { chapter_number: 1, id: '8ccdd54b-87ed-419f-a737-a35f11620f15', pdf_start: 4, pdf_end: 34 },
  { chapter_number: 2, id: '7b7aa659-9203-46e2-97f9-341484e882fc', pdf_start: 35, pdf_end: 63 },
  { chapter_number: 3, id: 'dba6933a-2b80-4d3b-ada4-3ac6acfb58c1', pdf_start: 64, pdf_end: 107 },
  { chapter_number: 4, id: 'ccb5b2a6-d55a-40b7-9d20-673fc9764c72', pdf_start: 108, pdf_end: 130 }
];

function getUnitForPage(pageNum) {
  for (const u of VERIFIED_MATH_UNITS) {
    if (pageNum >= u.pdf_start && pageNum <= u.pdf_end) {
      return u;
    }
  }
  return null;
}

async function recoverMissingPages() {
  console.log(`=== RECOVERING ${MISSING_PAGES.length} MISSING PAGES FOR MATH PREP 2 ===\n`);

  const diskPdfPath = path.resolve('uploads', `book_${bookId}.pdf`);
  const fullBytes = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(fullBytes);

  for (const pNum of MISSING_PAGES) {
    console.log(`Processing Missing Page ${pNum}...`);
    const singleDoc = await PDFDocument.create();
    const [copied] = await singleDoc.copyPages(srcDoc, [pNum - 1]);
    singleDoc.addPage(copied);
    const pageBytes = await singleDoc.save();
    const b64 = Buffer.from(pageBytes).toString('base64');

    const prompt = `You are a high-precision OCR extraction engine for Egyptian Ministry of Education Prep 2 Mathematics (English edition).
This is PDF Page ${pNum}.
Extract the educational content verbatim from this page:
- Section titles, lesson names, and definitions.
- Mathematical formulas, equations, inequalities, theorems, corollaries, and algebraic expressions.
- Transcribe mathematical symbols clearly: sqrt, cube root, exponents (x^2, x^3), intervals ([a, b], ]a, b[), triangles (triangle ABC), angles, congruent (≅), parallel (//), perpendicular (⊥), belongs to (∈), subset (⊂).
- Solved examples, step-by-step proofs, and printed exercises.
- If this is a blank page or decorative picture with no educational text, output "".

Output the extracted text directly as plain text.`;

    try {
      const textRaw = await GeminiClient.generateContent({
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: b64 } },
          { text: prompt }
        ],
        temperature: 0.1,
        timeoutMs: 35000
      });

      const text = (textRaw || '').trim();
      console.log(`  -> Page ${pNum}: Extracted ${text.length} characters.`);

      // Persist to book_pages
      await db.query(
        `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
         VALUES ($1, $2, $3, $4, $5)
         ON DUPLICATE KEY UPDATE raw_text = VALUES(raw_text), char_count = VALUES(char_count)`,
        [uuidv4(), bookId, pNum, text, text.length]
      );

      // Find unit & create chunk if text is substantive
      const unit = getUnitForPage(pNum);
      if (text.length >= 50 && unit) {
        await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND page_number = $2', [bookId, pNum]);
        await db.query(
          `INSERT INTO book_chunks (
            id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            uuidv4(),
            bookId,
            unit.id,
            '61998777-4c5f-4e51-bc0a-38de938c842a',
            '44d13655-da95-4425-8566-fd8451af1965',
            '83ef20f6-1b1b-4ac0-bd66-d3333a7c505e',
            pNum,
            0,
            text,
            JSON.stringify({ unit_number: unit.chapter_number, pdf_page: pNum, subject: 'Mathematics' })
          ]
        );
      }
    } catch (err) {
      console.error(`  ❌ Error extracting page ${pNum}:`, err.message);
    }

    // Rate-limiting pause
    await new Promise(r => setTimeout(r, 2200));
  }

  // Check final count
  const countRes = await db.query('SELECT count(*) as count, sum(char_count) as total_chars FROM book_pages WHERE book_id = $1', [bookId]);
  const chunkRes = await db.query('SELECT count(*) as count FROM book_chunks WHERE book_id = $1', [bookId]);
  console.log(`\n✅ RECOVERY COMPLETE:`);
  console.log(`Pages in book_pages: ${countRes.rows[0].count}/130`);
  console.log(`Total Stored Characters: ${countRes.rows[0].total_chars}`);
  console.log(`Total Indexed Chunks: ${chunkRes.rows[0].count}`);

  process.exit(0);
}

recoverMissingPages().catch(err => {
  console.error(err);
  process.exit(1);
});
