import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '543f2746-460c-41c1-ba38-0933f479272f';

// Units mapping
const UNIT_3_ID = '147144a2-8e01-413d-89e2-45393236f87c';
const UNIT_4_ID = 'e4000000-fa0a-4f96-a54c-bbcf33ddc184';

async function recoverMissingPages() {
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bookId}.pdf`);
  const fullPdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(fullPdfBuf);

  const missingPages = [77, 78, 103, 104];
  console.log(`Recovering missing pages for Book 5: [${missingPages.join(', ')}]...`);

  for (const pNum of missingPages) {
    console.log(`\nExtracting PDF Page ${pNum}...`);
    const singleDoc = await PDFDocument.create();
    const copied = await singleDoc.copyPages(srcDoc, [pNum - 1]);
    singleDoc.addPage(copied[0]);
    const b64 = Buffer.from(await singleDoc.save()).toString('base64');

    const prompt = `You are a high-precision OCR extraction engine for Egyptian Ministry of Education Science textbooks (English Edition).
You are processing PDF page ${pNum} of Second Preparatory Science (Term 1).

Extract ALL educational content verbatim in English:
- Section titles, lesson names, definitions, formulas, and explanations.
- If it contains evaluation questions, transcribe questions, multiple choice options, and problems clearly.
- If it is back matter or title credits, transcribe the text verbatim.

Return strict JSON:
{
  "page_number": ${pNum},
  "text": "Extracted text for page ${pNum}..."
}`;

    const resStr = await GeminiClient.generateContent({
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: b64 } },
        { text: prompt }
      ],
      responseMimeType: 'application/json',
      temperature: 0.1
    });

    let text = '';
    try {
      const parsed = JSON.parse(resStr);
      text = String(parsed.text || '').trim();
    } catch (e) {
      // Fallback text cleanup if JSON escaping fails
      const m = resStr.match(/"text"\s*:\s*"([\s\S]*)"\s*\}/);
      if (m) text = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
      else text = resStr.trim();
    }

    console.log(`  -> Page ${pNum}: Extracted ${text.length} chars: "${text.slice(0, 120).replace(/\n/g, ' ')}..."`);

    // Persist to book_pages
    const pageId = uuidv4();
    await db.query(
      `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
       VALUES ($1, $2, $3, $4, $5)
       ON DUPLICATE KEY UPDATE raw_text = VALUES(raw_text), char_count = VALUES(char_count)`,
      [pageId, bookId, pNum, text, text.length]
    );

    // Unit chunk association
    let chapterId = null;
    let unitNum = null;
    if (pNum >= 70 && pNum <= 87) {
      chapterId = UNIT_3_ID;
      unitNum = 3;
    } else if (pNum >= 88 && pNum <= 103) {
      chapterId = UNIT_4_ID;
      unitNum = 4;
    }

    if (text.length >= 50 && chapterId) {
      await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND page_number = $2', [bookId, pNum]);

      const chunkId = uuidv4();
      const meta = {
        unit_number: unitNum,
        section_type: 'curriculum_unit',
        pdf_page: pNum,
        subject: 'Science',
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
          chapterId,
          '61998777-4c5f-4e51-bc0a-38de938c842a',
          '44d13655-da95-4425-8566-fd8451af1965',
          'a5ecaedb-1a0f-432a-a363-cf9b93e288e2',
          pNum,
          0,
          text,
          JSON.stringify(meta)
        ]
      );
      console.log(`  -> Indexed chunk for Page ${pNum} in Unit ${unitNum}`);
    }

    await new Promise(r => setTimeout(r, 2200));
  }

  // Final check
  const pCheck = await db.query('SELECT count(*) as total, count(distinct page_number) as dcnt FROM book_pages WHERE book_id = $1', [bookId]);
  const cCheck = await db.query('SELECT count(*) as total FROM book_chunks WHERE book_id = $1', [bookId]);

  console.log(`\n======================================================================`);
  console.log(`Recovery Complete: Pages in DB = ${pCheck.rows[0].total}/${pCheck.rows[0].dcnt} (Expected: 104)`);
  console.log(`Total Chunks in DB = ${cCheck.rows[0].total}`);
  console.log(`======================================================================\n`);

  process.exit(0);
}

recoverMissingPages().catch(err => {
  console.error(err);
  process.exit(1);
});
