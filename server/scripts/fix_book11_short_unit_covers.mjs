import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '808104ec-b861-434b-80c6-579f715d8bdf';

const targetPages = [21, 22, 31, 39, 55, 75, 76, 111];

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
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bookId}.pdf`);
  const fullPdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(fullPdfBuf);

  for (const pNum of targetPages) {
    console.log(`Re-extracting page ${pNum}...`);
    const pageDoc = await PDFDocument.create();
    const [p] = await pageDoc.copyPages(srcDoc, [pNum - 1]);
    pageDoc.addPage(p);
    const bytes = await pageDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const prompt = `You are an OCR extraction engine. In front of you is an image/page from a Grade 7 Mathematics textbook.
Transcribe and extract ALL text, titles, unit names, headings, numbers, formulas, exercises, and objectives present on this page verbatim.
Do not evaluate or comment on page numbering. Simply transcribe the exact text visible on this page.
Return strict JSON: {"text": "..."}`;

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

      await db.query(
        `UPDATE book_pages SET raw_text = $1, char_count = $2 WHERE book_id = $3 AND page_number = $4`,
        [text, text.length, bookId, pNum]
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
            '61998777-4c5f-4e51-bc0a-38de938c842a',
            '4baa5084-112d-45e5-908e-1ae67ea8b4e8',
            '639c0854-028f-4b74-9734-0e9cb2778844',
            pNum,
            0,
            text,
            JSON.stringify(meta)
          ]
        );
      }
      console.log(`  ✅ Page ${pNum}: ${text.length} chars`);
    } catch (err) {
      console.error(`  ❌ Failed page ${pNum}:`, err.message);
    }
  }
}

main().catch(console.error);
