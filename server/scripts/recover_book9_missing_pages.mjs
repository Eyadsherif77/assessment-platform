import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '0758fc7a-c9b2-4e25-a32b-6cacb6bb418d';
const totalPages = 142;

const VERIFIED_UNITS = [
  { chapter_number: 1, id: 'de726b08-631a-465c-82b4-8d7e3b7be4cb', pdf_start: 11, pdf_end: 50 },
  { chapter_number: 2, id: 'f6f91ad0-8bc3-4a34-856e-90f51d60f888', pdf_start: 51, pdf_end: 92 },
  { chapter_number: 3, id: '2c4282bc-00d1-4ad6-b0fe-9d70f7a4614b', pdf_start: 93, pdf_end: 129 }
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

  console.log(`Missing pages for Book 9 (${missingPages.length}):`, missingPages);
  if (missingPages.length === 0) {
    console.log('All 142 pages present!');
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

    const prompt = `Extract all text and educational content from page ${pNum} of Egyptian Ministry of Education Arabic Prep 1 verbatim in Arabic.
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
          subject: 'Arabic',
          grade: 'Prep 1',
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

  const finalCheck = await db.query('SELECT count(*) as cnt FROM book_pages WHERE book_id = $1', [bookId]);
  console.log(`Final page count for Book 9: ${finalCheck.rows[0].cnt}/${totalPages}`);
}

main().catch(console.error);
