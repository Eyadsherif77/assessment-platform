import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  await db.init();
  const tables = [
    'users',
    'student_profiles',
    'books',
    'book_pages',
    'book_chunks',
    'book_chapters',
    'book_pdf_chunks',
    'ai_evaluations',
    'question_banks',
    'question_bank_items',
    'question_bank_options',
    'exams',
    'exam_attempts',
    'student_answers',
    'shared_cached_exams',
    'student_exam_assignments'
  ];

  console.log('FINAL LIVE TABLE COUNTS:');
  for (const t of tables) {
    const res = await db.query(`SELECT count(*) as cnt FROM ${t}`);
    console.log(`  ${t.padEnd(28)}: ${res.rows[0].cnt}`);
  }
}

main().catch(console.error);
