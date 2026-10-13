import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = 'bc6bb834-7192-474c-8507-c53265028b4e';

const VERIFIED_UNITS = [
  {
    chapter_number: 1,
    id: '902f6adf-8043-4247-b80c-42bb48d200b8',
    pdf_start: 11,
    pdf_end: 56
  },
  {
    chapter_number: 2,
    id: 'c1fb0f60-6123-40be-8933-33c725c75d63',
    pdf_start: 57,
    pdf_end: 105
  },
  {
    chapter_number: 3,
    id: '6db2a082-2dda-4fe9-9b30-f8ab8c106cce',
    pdf_start: 106,
    pdf_end: 149
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

async function main() {
  const pagesToRecover = [30, 99, 100, 109, 110];
  console.log(`Recovering ${pagesToRecover.length} missing pages in Book 7: [${pagesToRecover.join(', ')}]...`);

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

    const prompt = `Extract all Arabic educational text verbatim with full diacritics where present from this Egyptian textbook page (Prep 2 Arabic, page ${pNum}). Do not summarize. Return pure verbatim text.`;

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
          subject: 'Arabic',
          grade: 'Prep 2',
          language: 'ar'
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
  await db.query('UPDATE books SET total_pages = 162, processing_status = $1 WHERE id = $2', ['COMPLETED', bookId]);
  console.log(`\n🎉 Recovery pass completed.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error in recovery:', err);
  process.exit(1);
});
