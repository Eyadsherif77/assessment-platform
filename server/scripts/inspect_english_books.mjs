import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';

async function main() {
  const booksRes = await db.query(
    `SELECT b.id, b.title_ar, b.title_en, g.name_ar as grade_name 
     FROM books b 
     JOIN grades g ON b.grade_id = g.id 
     JOIN subjects s ON b.subject_id = s.id 
     WHERE s.code = 'ENGLISH' OR b.title_ar LIKE '%انجليز%' OR b.title_en LIKE '%English%'`
  );
  console.log('Total English Books:', booksRes.rows.length);
  for (const b of booksRes.rows) {
    const chRes = await db.query(
      `SELECT id, chapter_number, title_ar, title_en, start_page, end_page 
       FROM book_chapters WHERE book_id = $1`, 
      [b.id]
    );
    console.log(`\n=== Book: ${b.title_ar} | Grade: ${b.grade_name} | ID: ${b.id} ===`);
    console.log('Chapters count:', chRes.rows.length);
    console.log(chRes.rows);
  }

  // Also check why students are 'مدارس عربى'
  const schoolTypes = await db.query(
    `SELECT g.name_ar as grade_name, sp.school_type, COUNT(*) as cnt 
     FROM student_profiles sp 
     JOIN grades g ON sp.grade_id = g.id
     GROUP BY g.name_ar, sp.school_type
     ORDER BY g.name_ar`
  );
  console.log('\n=== Students School Types per Grade in DB ===');
  console.log(schoolTypes.rows);

  const p3Grade = await db.query("SELECT id, name_ar FROM grades WHERE name_ar LIKE '%الثالث الإعدادي%'");
  const p3GradeId = p3Grade.rows[0].id;
  const subs = await db.query("SELECT id, code, name_ar, name_en FROM subjects WHERE grade_id = $1", [p3GradeId]);
  console.log('\n=== Prep 3 Subjects in DB ===');
  console.log(subs.rows);

  process.exit(0);
}

main().catch(console.error);
