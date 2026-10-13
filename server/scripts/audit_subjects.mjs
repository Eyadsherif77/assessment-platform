import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';

async function main() {
  const subs = await db.query(`
    SELECT s.id, s.code, s.name_ar, s.name_en, g.code as grade_code 
    FROM subjects s 
    JOIN grades g ON s.grade_id = g.id 
    WHERE g.code IN ('PREP_1', 'PREP_2', 'PREP_3') 
    ORDER BY g.sort_order, s.sort_order
  `);
  console.log('Prep subjects count:', subs.rows.length);
  console.table(subs.rows);

  // Cross check with books in DB
  const books = await db.query(`
    SELECT b.id, b.title_ar, b.school_type, b.subject_id, s.code as subj_code, s.name_ar as subj_name, g.code as grade_code
    FROM books b
    JOIN subjects s ON b.subject_id = s.id
    JOIN grades g ON b.grade_id = g.id
    ORDER BY g.sort_order, s.sort_order
  `);
  console.log('\nBooks vs Subjects:');
  console.table(books.rows);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
