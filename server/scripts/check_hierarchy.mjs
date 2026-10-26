import 'dotenv/config';
import { db } from '../dist/db/db.js';

async function main() {
  const defaultGrade = await db.query("SELECT id FROM grades WHERE code = 'PREP_3' OR name_ar LIKE '%الثالث الإعدادي%' LIMIT 1");
  const targetGradeId = defaultGrade.rows[0]?.id;

  const examsRes = await db.query(
    "SELECT e.id, e.title_ar, e.chapter_id, s.name_ar as subject_name, bc.title_ar as chapter_title FROM exams e JOIN subjects s ON e.subject_id = s.id LEFT JOIN book_chapters bc ON e.chapter_id = bc.id WHERE e.grade_id = $1 AND e.is_published = 1",
    [targetGradeId]
  );
  console.log('Fixed Exams in Prep 3:');
  console.table(examsRes.rows);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
