import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  console.log('========================================================================');
  console.log('🔍 PHASE 4C: READ-ONLY AUDIT OF TIDB SCHEMA & METADATA');
  console.log('========================================================================\n');

  await db.init();

  // 1. SHOW CREATE TABLE for shared_cached_exams
  console.log('--- 1. SHOW CREATE TABLE shared_cached_exams ---');
  const resCreateExam = await db.query('SHOW CREATE TABLE shared_cached_exams');
  console.log(resCreateExam.rows[0]['Create Table'] || resCreateExam.rows[0]['Create Table\n'] || JSON.stringify(resCreateExam.rows[0], null, 2));

  // 2. SHOW INDEX FROM shared_cached_exams
  console.log('\n--- 2. SHOW INDEX FROM shared_cached_exams ---');
  const resIdxExam = await db.query('SHOW INDEX FROM shared_cached_exams');
  console.table(resIdxExam.rows.map(r => ({
    Key_name: r.Key_name || r.key_name,
    Column_name: r.Column_name || r.column_name,
    Non_unique: r.Non_unique || r.non_unique,
    Seq_in_index: r.Seq_in_index || r.seq_in_index
  })));

  // 3. SHOW CREATE TABLE for student_exam_assignments
  console.log('\n--- 3. SHOW CREATE TABLE student_exam_assignments ---');
  const resCreateAsgn = await db.query('SHOW CREATE TABLE student_exam_assignments');
  console.log(resCreateAsgn.rows[0]['Create Table'] || resCreateAsgn.rows[0]['Create Table\n'] || JSON.stringify(resCreateAsgn.rows[0], null, 2));

  // 4. SHOW INDEX FROM student_exam_assignments
  console.log('\n--- 4. SHOW INDEX FROM student_exam_assignments ---');
  const resIdxAsgn = await db.query('SHOW INDEX FROM student_exam_assignments');
  console.table(resIdxAsgn.rows.map(r => ({
    Key_name: r.Key_name || r.key_name,
    Column_name: r.Column_name || r.column_name,
    Non_unique: r.Non_unique || r.non_unique,
    Seq_in_index: r.Seq_in_index || r.seq_in_index
  })));

  // 5. AUDIT PROTECTED TABLES
  console.log('\n--- 5. PROTECTED PRODUCTION TABLES AUDIT ---');
  const protectedTables = [
    'users',
    'student_profiles',
    'books',
    'book_pages',
    'book_chunks',
    'book_chapters',
    'book_pdf_chunks'
  ];
  for (const t of protectedTables) {
    const res = await db.query(`SELECT count(*) as cnt FROM ${t}`);
    console.log(`  Protected: ${t.padEnd(25)}: ${res.rows[0].cnt} rows`);
  }

  // 6. AUDIT CLEAN-SLATE ARTIFACT TABLES
  console.log('\n--- 6. CLEAN-SLATE ARTIFACT TABLES AUDIT ---');
  const artifactTables = [
    'ai_evaluations',
    'student_learning_history',
    'student_topic_mastery',
    'question_banks',
    'question_bank_items',
    'question_bank_options',
    'exams',
    'exam_questions',
    'exam_question_options',
    'exam_attempts',
    'student_answers',
    'shared_cached_exams',
    'student_exam_assignments'
  ];
  for (const t of artifactTables) {
    const res = await db.query(`SELECT count(*) as cnt FROM ${t}`);
    console.log(`  Artifact:  ${t.padEnd(25)}: ${res.rows[0].cnt} rows`);
  }
}

main().catch(err => {
  console.error('Audit script error:', err);
  process.exit(1);
});
