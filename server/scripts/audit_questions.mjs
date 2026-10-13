import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';

async function auditQuestions() {
  const qs = await db.query(`
    SELECT qbi.id, qbi.question_text, b.title_ar as book_title, g.code as grade, c.title_ar as chapter, c.chapter_number
    FROM question_bank_items qbi 
    JOIN book_chapters c ON qbi.chapter_id = c.id 
    JOIN books b ON c.book_id = b.id 
    JOIN grades g ON b.grade_id = g.id 
    ORDER BY g.sort_order, b.title_ar, c.chapter_number
  `);
  console.log(`Total questions in question_bank_items: ${qs.rows.length}`);

  // Group by book and chapter
  const map = new Map();
  for (const q of qs.rows) {
    const key = `[${q.grade}] ${q.book_title} (Unit ${q.chapter_number}: ${q.chapter})`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(q.question_text);
  }

  for (const [key, questions] of map.entries()) {
    console.log(`\n=== ${key} (Count: ${questions.length}) ===`);
    questions.slice(0, 5).forEach((qt, idx) => {
      console.log(`  ${idx + 1}. ${qt}`);
    });
  }

  process.exit(0);
}

auditQuestions().catch(err => {
  console.error(err);
  process.exit(1);
});
