import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '37bfa0c0-c4ce-419f-930a-000043d8d3f9';

async function main() {
  console.log(`======================================================================`);
  console.log(`📚 FINALIZING BOOK 8 (Prep 2 English) PAGES & CHUNKS`);
  console.log(`======================================================================\n`);

  // 1. Fetch official chapters from DB
  const chapRes = await db.query(
    'SELECT id, chapter_number, start_page, end_page, title_en FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC',
    [bookId]
  );
  const chapters = chapRes.rows;
  console.log('Authoritative Book 8 chapters in DB:');
  chapters.forEach(c => console.log(`  Unit ${c.chapter_number}: ${c.title_en} (Pages ${c.start_page}..${c.end_page}) [ID: ${c.id}]`));

  function getChapterForPage(pNum) {
    return chapters.find(c => pNum >= c.start_page && pNum <= c.end_page) || null;
  }

  // 2. Extract page 100 if missing
  const p100Res = await db.query('SELECT page_number FROM book_pages WHERE book_id = $1 AND page_number = 100', [bookId]);
  if (p100Res.rows.length === 0) {
    console.log('\nExtracting missing Page 100...');
    const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bookId}.pdf`);
    const fullPdfBuf = fs.readFileSync(diskPdfPath);
    const srcDoc = await PDFDocument.load(fullPdfBuf);
    const subDoc = await PDFDocument.create();
    const [p] = await subDoc.copyPages(srcDoc, [99]); // 0-indexed 99 = page 100
    subDoc.addPage(p);
    const bytes = await subDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const prompt = `Extract all English educational text verbatim from this textbook page (Prep 2 English, page 100). Do not summarize. Return pure verbatim text.`;
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
      [pageId, bookId, 100, cleanText, cleanText.length]
    );
    console.log(`  ✅ Page 100 saved to book_pages (${cleanText.length} chars)`);
  } else {
    console.log('Page 100 already in book_pages.');
  }

  // 3. Ensure all pages in Units 1..6 (14..27, 28..41, 42..55, 58..71, 72..85, 86..99) are indexed in book_chunks
  const bRes = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
  const book = bRes.rows[0];

  console.log('\nChecking chunk indexing for all Unit pages...');
  const pagesRes = await db.query(
    'SELECT page_number, raw_text, char_count FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC',
    [bookId]
  );

  for (const pageRow of pagesRes.rows) {
    const pNum = Number(pageRow.page_number);
    const chap = getChapterForPage(pNum);
    if (!chap) continue; // outside unit boundaries (intro, review, etc.)

    const text = pageRow.raw_text.trim();
    if (text.length < 50) continue;

    // Check if chunk exists
    const chunkCheck = await db.query(
      'SELECT id, chapter_id FROM book_chunks WHERE book_id = $1 AND page_number = $2',
      [bookId, pNum]
    );

    if (chunkCheck.rows.length === 0) {
      const chunkId = uuidv4();
      const meta = {
        unit_number: chap.chapter_number,
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
          chap.id,
          book.academic_stage_id,
          book.grade_id,
          book.subject_id,
          pNum,
          0,
          text,
          JSON.stringify(meta)
        ]
      );
      console.log(`  ➕ Indexed chunk for Page ${pNum} under Unit ${chap.chapter_number}`);
    } else if (chunkCheck.rows[0].chapter_id !== chap.id) {
      await db.query('UPDATE book_chunks SET chapter_id = $1 WHERE id = $2', [chap.id, chunkCheck.rows[0].id]);
      console.log(`  🔄 Realigned chunk for Page ${pNum} to Unit ${chap.chapter_number}`);
    }
  }

  // 4. Update book metadata
  await db.query(
    'UPDATE books SET total_pages = 114, processing_status = $1 WHERE id = $2',
    ['COMPLETED', bookId]
  );

  console.log('\n🏁 Book 8 finalized.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
