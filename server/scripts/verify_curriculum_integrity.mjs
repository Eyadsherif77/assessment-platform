import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  console.log('Verifying exact curriculum alignment for all chunks:\n');

  const booksRes = await db.query(`
    SELECT id, grade_id, subject_id, academic_stage_id, title_ar, title_en
    FROM books
    ORDER BY created_at ASC
  `);

  let anyMismatchedChunks = 0;
  let anyInvalidChapterRef = 0;

  for (const b of booksRes.rows) {
    // Check chunks with mismatched curriculum attributes
    const mismatchRes = await db.query(
      `SELECT count(*) as cnt FROM book_chunks 
       WHERE book_id = $1 
         AND (grade_id != $2 OR subject_id != $3 OR academic_stage_id != $4)`,
      [b.id, b.grade_id, b.subject_id, b.academic_stage_id]
    );

    // Check chunks with chapter_id pointing to another book
    const crossBookChapterRes = await db.query(
      `SELECT count(*) as cnt FROM book_chunks bc
       JOIN book_chapters ch ON bc.chapter_id = ch.id
       WHERE bc.book_id = $1 AND ch.book_id != $1`,
      [b.id]
    );

    const mCount = Number(mismatchRes.rows[0].cnt);
    const cbCount = Number(crossBookChapterRes.rows[0].cnt);

    anyMismatchedChunks += mCount;
    anyInvalidChapterRef += cbCount;

    console.log(`Book [${b.id.slice(0, 8)}] (${b.title_ar}): Mismatched curriculum: ${mCount} | Cross-book chapters: ${cbCount}`);
  }

  console.log(`\nTOTAL Mismatched curriculum chunks across platform: ${anyMismatchedChunks}`);
  console.log(`TOTAL Cross-book chapter references across platform: ${anyInvalidChapterRef}`);
}

main().catch(console.error);
