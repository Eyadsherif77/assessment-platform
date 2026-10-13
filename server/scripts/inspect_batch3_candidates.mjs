import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function run() {
  const processedIds = [
    'd7bbfca2-6d8f-461b-8e39-2015981e86ec', // Book 1 (Science Prep 1)
    'f19276d3-4adb-4297-bb77-5ed87ba638b9', // Book 2 (Social Studies Prep 3)
    '19886434-1839-427d-af31-4c64fcf79525', // Book 3 (Math Prep 2)
    '81b8a308-7fcf-4938-8c45-aa0056624f32', // Book 4 (Social Studies Prep 2)
    '543f2746-460c-41c1-ba38-0933f479272f', // Book 5 (Science Prep 2)
    '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', // Book 6 (English Prep 1)
    'bc6bb834-7192-474c-8507-c53265028b4e', // Book 7 (Arabic Prep 2)
    '37bfa0c0-c4ce-419f-930a-000043d8d3f9'  // Book 8 (English Prep 2)
  ];

  console.log('======================================================================');
  console.log('📚 INVENTORY AUDIT: REMAINING CANDIDATE BOOKS FOR BATCH 3');
  console.log('======================================================================\n');

  // Order 1: Curriculum Natural Order (Grade asc, Subject asc, Title asc)
  const q1 = await db.query(`
    SELECT 
      b.id, b.title_ar, b.title_en, b.file_url, b.total_pages, b.file_size, b.created_at, b.term,
      g.name_ar as grade_ar, g.code as grade_code, g.sort_order as grade_order,
      s.name_ar as subject_ar, s.code as subject_code, s.sort_order as subj_order,
      (SELECT count(*) FROM book_pdf_chunks bc WHERE bc.book_id = b.id) as pdf_chunks_count
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
    ORDER BY g.sort_order ASC, s.sort_order ASC, b.title_ar ASC
  `);

  const remainingByCurriculum = q1.rows.filter(r => !processedIds.includes(r.id));
  console.log('--- A. REMAINING BOOKS ORDERED BY CURRICULUM (Grade, Subject) ---');
  console.table(remainingByCurriculum.map((r, i) => ({
    num: i + 9,
    id: r.id,
    grade: r.grade_ar,
    subject: r.subject_ar,
    title: r.title_ar,
    term: r.term,
    pages: r.total_pages,
    pdf_chunks: r.pdf_chunks_count,
    file_url: r.file_url
  })));

  // Order 2: Database Creation Order (created_at asc)
  const q2 = await db.query(`
    SELECT 
      b.id, b.title_ar, b.title_en, b.file_url, b.total_pages, b.file_size, b.created_at, b.term,
      g.name_ar as grade_ar, g.code as grade_code,
      s.name_ar as subject_ar, s.code as subject_code,
      (SELECT count(*) FROM book_pdf_chunks bc WHERE bc.book_id = b.id) as pdf_chunks_count
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
    ORDER BY b.created_at ASC, b.id ASC
  `);

  const remainingByCreation = q2.rows.filter(r => !processedIds.includes(r.id));
  console.log('\n--- B. REMAINING BOOKS ORDERED BY CREATION DATE (created_at) ---');
  console.table(remainingByCreation.map((r, i) => ({
    num: i + 9,
    id: r.id,
    grade: r.grade_ar,
    subject: r.subject_ar,
    title: r.title_ar,
    term: r.term,
    pages: r.total_pages,
    pdf_chunks: r.pdf_chunks_count,
    created_at: r.created_at
  })));

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
