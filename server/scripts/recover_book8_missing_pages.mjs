import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '37bfa0c0-c4ce-419f-930a-000043d8d3f9';

const VERIFIED_UNITS = [
  { chapter_number: 1, id: 'af732e7e-1a38-4b17-b23e-d09ac0ac92f1', pdf_start: 14, pdf_end: 27 },
  { chapter_number: 2, id: '344a04d2-23c2-48a5-8c0c-cf1c890731eb', pdf_start: 28, pdf_end: 41 },
  { chapter_number: 3, id: '28fb05cf-f7e9-4e0e-b7d6-3d2380598816', pdf_start: 42, pdf_end: 55 },
  { chapter_number: 4, id: 'e7000000-c4ce-419f-930a-000043d8d3f4', pdf_start: 58, pdf_end: 71 },
  { chapter_number: 5, id: 'f8000000-c4ce-419f-930a-000043d8d3f5', pdf_start: 72, pdf_end: 85 },
  { chapter_number: 6, id: 'a9000000-c4ce-419f-930a-000043d8d3f6', pdf_start: 86, pdf_end: 99 }
];

function getUnitForPdfPage(pdfPageNum) {
  for (const u of VERIFIED_UNITS) {
    if (pdfPageNum >= u.pdf_start && pdfPageNum <= u.pdf_end) {
      return u;
    }
  }
  return null;
}

async function main() {
  const pagesToRecover = [20, 25, 35, 40, 50, 55, 65, 70, 80, 85, 100];
  console.log(`Recovering ${pagesToRecover.length} missing pages in Book 8: [${pagesToRecover.join(', ')}]...`);

  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bookId}.pdf`);
  const fullPdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(fullPdfBuf);

  const bRes = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
  const book = bRes.rows[0];

  for (const pNum of pagesToRecover) {
    const subDoc = await PDFDocument.create();
    const [p] = await subDoc.copyPages(srcDoc, [pNum - 1]);
    subDoc.addPage(p);
    const bytes = await subDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const prompt = `Extract all English educational text verbatim from this textbook page (Prep 2 English, page ${pNum}). Do not summarize. Return pure verbatim text.`;

    try {
      const text = await GeminiClient.generateContent({
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: b64 } },
          { text: prompt }
        ],
        temperature: 0.1,
        timeoutMs: 45000
      });

      const cleanText = text.trim();
      const pageId = uuidv4();
      await db.query(
        `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
         VALUES ($1, $2, $3, $4, $5)
         ON DUPLICATE KEY UPDATE raw_text = VALUES(raw_text), char_count = VALUES(char_count)`,
        [pageId, bookId, pNum, cleanText, cleanText.length]
      );

      const unit = getUnitForPdfPage(pNum);
      if (cleanText.length >= 50 && unit) {
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
            cleanText,
            JSON.stringify(meta)
          ]
        );
      }

      console.log(`  ✅ Page ${pNum}: Extracted ${cleanText.length} chars (Unit: ${unit ? unit.chapter_number : 'Non-unit'})`);
    } catch (err) {
      console.error(`  ❌ Error recovering page ${pNum}:`, err.message);
    }
  }

  // Update total page count in books
  await db.query('UPDATE books SET total_pages = 114, processing_status = $1 WHERE id = $2', ['COMPLETED', bookId]);
  console.log(`\n🎉 Book 8 recovery pass completed.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error in recovery:', err);
  process.exit(1);
});
