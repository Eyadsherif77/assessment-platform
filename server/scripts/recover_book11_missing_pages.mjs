import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '808104ec-b861-434b-80c6-579f715d8bdf';
const totalPages = 122;

const VERIFIED_UNITS = [
  { chapter_number: 1, id: 'e57a89eb-1cc9-46ac-a3dd-598f3de7b06c', pdf_start: 8, pdf_end: 38 },
  { chapter_number: 2, id: 'dec90b76-3479-40a3-b720-4a06a61a4b3f', pdf_start: 39, pdf_end: 53 },
  { chapter_number: 3, id: 'd00b0570-8269-4ec6-9ccb-2536fb338131', pdf_start: 54, pdf_end: 75 },
  { chapter_number: 4, id: '1b9f4377-6ae0-4c24-b588-c221900597ec', pdf_start: 76, pdf_end: 111 }
];

function getUnitForPdfPage(pdfPageNum) {
  for (const u of VERIFIED_UNITS) {
    if (pdfPageNum >= u.pdf_start && pdfPageNum <= u.pdf_end) return u;
  }
  return null;
}

async function main() {
  const bRes = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
  const book = bRes.rows[0];

  const existingRes = await db.query('SELECT page_number FROM book_pages WHERE book_id = $1', [bookId]);
  const existingSet = new Set(existingRes.rows.map(r => Number(r.page_number)));

  const missingPages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (!existingSet.has(i)) {
      missingPages.push(i);
    }
  }

  console.log(`Missing pages for Book 11 (${missingPages.length}):`, missingPages);
  if (missingPages.length === 0) {
    console.log('All 122 pages present!');
    process.exit(0);
  }

  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bookId}.pdf`);
  const fullPdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(fullPdfBuf);

  for (const pNum of missingPages) {
    console.log(`Recovering missing page ${pNum}...`);
    const pageDoc = await PDFDocument.create();
    const [p] = await pageDoc.copyPages(srcDoc, [pNum - 1]);
    pageDoc.addPage(p);
    const bytes = await pageDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const prompt = `Extract all mathematical educational content from page ${pNum} of Egyptian Ministry of Education Mathematics Prep 1 verbatim.
Return strict JSON: {"page_number": ${pNum}, "text": "..."}`;

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
      const text = String(parsed.text || '').trim();

      const pageId = uuidv4();
      await db.query(
        `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
         VALUES ($1, $2, $3, $4, $5)
         ON DUPLICATE KEY UPDATE raw_text = VALUES(raw_text), char_count = VALUES(char_count)`,
        [pageId, bookId, pNum, text, text.length]
      );

      const unit = getUnitForPdfPage(pNum);
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
      console.log(`  ✅ Page ${pNum} recovered: ${text.length} chars (Unit: ${unit ? unit.chapter_number : 'Non-unit'})`);
    } catch (err) {
      console.error(`  ❌ Failed to recover page ${pNum}:`, err.message);
    }
  }

  // Cleanup any out of bounds chunks
  await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND (page_number < 8 OR page_number > 111)', [bookId]);

  const finalCheck = await db.query('SELECT count(*) as cnt FROM book_pages WHERE book_id = $1', [bookId]);
  console.log(`Final page count for Book 11: ${finalCheck.rows[0].cnt}/${totalPages}`);
}

main().catch(console.error);
