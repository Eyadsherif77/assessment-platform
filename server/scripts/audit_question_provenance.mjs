import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

const chapterId = '8bf8f8e5-09a7-4c42-a220-181f7f984cb9'; // Unit 1
const bookId = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec';

async function auditProvenance() {
  console.log(`======================================================================`);
  console.log(`🔍 AUDITING QUESTION PROVENANCE FOR SCIENCE UNIT 1`);
  console.log(`======================================================================\n`);

  const qRes = await db.query(
    `SELECT qi.id, qi.question_text, qi.page_reference, qi.source_chunk_id, qi.explanation
     FROM question_bank_items qi
     WHERE qi.chapter_id = $1`,
    [chapterId]
  );

  console.log(`Found ${qRes.rows.length} questions in bank for this chapter:\n`);

  for (let i = 0; i < qRes.rows.length; i++) {
    const q = qRes.rows[i];
    console.log(`--- [Question #${i + 1}] ---`);
    console.log(`ID: ${q.id}`);
    console.log(`Text: "${q.question_text}"`);
    console.log(`Stored page_reference: ${q.page_reference}`);
    console.log(`Stored source_chunk_id: ${q.source_chunk_id}`);
    console.log(`Explanation: "${q.explanation}"`);

    // Check if source_chunk_id exists in book_chunks
    if (q.source_chunk_id) {
      const cRes = await db.query(
        `SELECT id, page_number, content FROM book_chunks WHERE id = $1`,
        [q.source_chunk_id]
      );
      if (cRes.rows.length > 0) {
        const chunk = cRes.rows[0];
        console.log(`  Linked Chunk Found: Page ${chunk.page_number}`);
        console.log(`  Chunk Excerpt: "${chunk.content.slice(0, 150).replace(/\n/g, ' ')}..."`);
      } else {
        console.log(`  ⚠️ Linked chunk ${q.source_chunk_id} NOT found in book_chunks!`);
      }
    }

    // Now check book_pages around stored page_reference
    // Check both as PDF index and as printed page (PDF index = printed_page + 7)
    const exactPageRes = await db.query(
      `SELECT page_number, raw_text FROM book_pages WHERE book_id = $1 AND page_number = $2`,
      [bookId, q.page_reference]
    );

    const pdfOffsetPageRes = await db.query(
      `SELECT page_number, raw_text FROM book_pages WHERE book_id = $1 AND page_number = $2`,
      [bookId, q.page_reference + 7]
    );

    console.log(`\n  * Text on book_pages (as PDF page ${q.page_reference}):`);
    if (exactPageRes.rows.length > 0) {
      const txt = exactPageRes.rows[0].raw_text;
      console.log(`    Content: "${txt.slice(0, 200).replace(/\n/g, ' ')}..."`);
      // Check if keyword matches
      const keywords = ['alkali', 'group 1a', 'carbon', 'organic'];
      const foundKw = keywords.filter(k => txt.toLowerCase().includes(k));
      console.log(`    Matched Keywords:`, foundKw);
    } else {
      console.log(`    None found`);
    }

    console.log(`  * Text on book_pages (if printed page was ${q.page_reference}, PDF index would be ${q.page_reference + 7}):`);
    if (pdfOffsetPageRes.rows.length > 0) {
      const txt = pdfOffsetPageRes.rows[0].raw_text;
      console.log(`    Content: "${txt.slice(0, 200).replace(/\n/g, ' ')}..."`);
      const keywords = ['alkali', 'group 1a', 'carbon', 'organic'];
      const foundKw = keywords.filter(k => txt.toLowerCase().includes(k));
      console.log(`    Matched Keywords:`, foundKw);
    } else {
      console.log(`    None found`);
    }

    console.log(`\n----------------------------------------------------------------------\n`);
  }
}

auditProvenance().catch(console.error);
