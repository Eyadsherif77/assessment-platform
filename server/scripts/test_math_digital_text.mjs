import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

const bId = '19886434-1839-427d-af31-4c64fcf79525';

async function checkMathChapters() {
  const r = await db.query(
    'SELECT id, chapter_number, title_ar, title_en, start_page, end_page, description FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC',
    [bId]
  );
  console.log(`Existing chapters in DB for Math Prep 2 (${r.rows.length}):`);
  console.log(JSON.stringify(r.rows, null, 2));

  // Check baseline production safety counts
  const users = await db.query('SELECT count(*) as count FROM users');
  const students = await db.query('SELECT count(*) as count FROM student_profiles');
  const evals = await db.query('SELECT count(*) as count FROM ai_evaluations');
  const books = await db.query('SELECT count(*) as count FROM books');
  const pdfChunks = await db.query('SELECT count(*) as count FROM book_pdf_chunks');

  console.log('\nBaseline Production Safety Counts:');
  console.log('  Users:', users.rows[0].count);
  console.log('  Students:', students.rows[0].count);
  console.log('  Evaluations:', evals.rows[0].count);
  console.log('  Books:', books.rows[0].count);
  console.log('  PDF Chunks:', pdfChunks.rows[0].count);

  process.exit(0);
}

checkMathChapters().catch(err => {
  console.error(err);
  process.exit(1);
});
