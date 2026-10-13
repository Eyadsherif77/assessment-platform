import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  const verifiedBookIds = [
    'd7bbfca2-6d8f-461b-8e39-2015981e86ec', // Book 1 (Science Prep 1)
    'f19276d3-4adb-4297-bb77-5ed87ba638b9', // Book 2 (Social Studies Prep 3)
    '19886434-1839-427d-af31-4c64fcf79525'  // Book 3 (Math Prep 2)
  ];

  const res = await db.query(`
    SELECT 
      b.id, b.title, b.title_ar, b.term, b.is_active,
      g.grade_name_ar, g.grade_name_en,
      s.code as subject_code, s.name_ar as subject_name_ar, s.name_en as subject_name_en,
      (SELECT count(*) FROM book_pdf_chunks c WHERE c.book_id = b.id) as chunk_count,
      (SELECT count(*) FROM book_pages p WHERE p.book_id = b.id) as page_count,
      (SELECT count(*) FROM book_chapters ch WHERE ch.book_id = b.id) as chapter_count,
      (SELECT count(*) FROM book_chunks bc WHERE bc.book_id = b.id) as book_chunk_count
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
    ORDER BY b.id ASC
  `);

  console.log('--- ALL 13 BOOKS IN PRODUCTION TIDB ---');
  const unprocessed = [];
  for (const b of res.rows) {
    const isApproved = verifiedBookIds.includes(b.id);
    const info = {
      id: b.id,
      title: b.title || b.title_ar,
      grade: b.grade_name_en || b.grade_name_ar,
      subject: b.subject_name_en || b.subject_name_ar,
      subject_code: b.subject_code,
      term: b.term,
      pdf_chunks: Number(b.chunk_count),
      pages: Number(b.page_count),
      chapters: Number(b.chapter_count),
      chunks: Number(b.book_chunk_count),
      status: isApproved ? 'APPROVED_PILOT' : 'UNPROCESSED'
    };
    if (!isApproved) unprocessed.push(info);
    console.log(`${isApproved ? '✅ [APPROVED]' : '⏳ [PENDING]'} ${info.grade} | ${info.subject} (${info.title}) | ID: ${info.id} | Chunks: ${info.pdf_chunks}`);
  }

  console.log('\n--- UNPROCESSED BOOKS LIST ---');
  console.log(JSON.stringify(unprocessed, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
