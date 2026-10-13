import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function check() {
  const res = await db.query(`
    SELECT 
      b.id, b.title_ar, b.title_en, b.term, b.school_type, b.total_pages,
      g.id as grade_id, g.name_ar as grade_ar, g.name_en as grade_en,
      s.id as subject_id, s.name_ar as subject_ar, s.name_en as subject_en,
      (SELECT count(*) FROM book_pages WHERE book_id = b.id) as pages,
      (SELECT count(*) FROM book_chunks WHERE book_id = b.id) as chunks,
      (SELECT count(*) FROM book_chapters WHERE book_id = b.id) as chapters,
      b.created_at
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
    ORDER BY b.created_at ASC
  `);
  console.log(JSON.stringify(res.rows, null, 2));
}

check().catch(console.error);
