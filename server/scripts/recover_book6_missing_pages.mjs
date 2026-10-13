import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '21e1d639-9f59-4a58-a8f8-8373b8e7fc90';

const VERIFIED_UNITS = [
  { chapter_number: 1, id: '192c06db-b3e1-4717-b6e9-0b06a0364764', pdf_start: 14, pdf_end: 27 },
  { chapter_number: 2, id: 'fd851a26-5f46-4018-b469-1d7b9d8f50fe', pdf_start: 28, pdf_end: 41 },
  { chapter_number: 3, id: '7410734d-e306-451c-b252-4deb1b8c62cf', pdf_start: 42, pdf_end: 55 },
  { chapter_number: 4, id: 'e6000000-9f59-4a58-a8f8-8373b8e7fc94', pdf_start: 60, pdf_end: 73 },
  { chapter_number: 5, id: 'f5000000-9f59-4a58-a8f8-8373b8e7fc95', pdf_start: 74, pdf_end: 87 },
  { chapter_number: 6, id: 'a6000000-9f59-4a58-a8f8-8373b8e7fc96', pdf_start: 88, pdf_end: 101 }
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
  const pagesToRecover = [48, 64, 80, 98, 106, 107, 108];
  console.log(`Recovering ${pagesToRecover.length} pages: [${pagesToRecover.join(', ')}]...`);

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

    const prompt = `Extract all text and educational content verbatim from this textbook page. Do not summarize. Return pure verbatim text.`;

    try {
      const text = await GeminiClient.generateContent({
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: b64 } },
          { text: prompt }
        ],
        temperature: 0.1,
        timeoutMs: 25000
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
            cleanText,
            JSON.stringify(meta)
          ]
        );
      }

      console.log(`  ✅ Page ${pNum}: Extracted ${cleanText.length} chars (Unit: ${unit ? unit.chapter_number : 'Non-unit'})`);
    } catch (err) {
      console.error(`  ❌ Failed page ${pNum}:`, err.message);
    }

    await new Promise(r => setTimeout(r, 1200));
  }

  console.log('Recovery complete!');
}

main().catch(console.error);
