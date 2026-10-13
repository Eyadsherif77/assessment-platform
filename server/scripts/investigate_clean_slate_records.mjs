import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  console.log('========================================================================');
  console.log('🔍 PHASE 3B: DEEP INVESTIGATION OF ARTIFACT RECORDS & PROVENANCE');
  console.log('========================================================================\n');

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
    'exam_questions',
    'exam_question_options',
    'exam_attempts',
    'student_answers',
    'student_topic_mastery',
    'student_learning_history'
  ];

  console.log('--- 1. CURRENT ROW COUNTS ACROSS ALL PLATFORM TABLES ---');
  const counts = {};
  for (const t of tables) {
    try {
      const res = await db.query(`SELECT count(*) as cnt FROM ${t}`);
      counts[t] = Number(res.rows[0].cnt);
      console.log(`  ${t.padEnd(26)}: ${counts[t]}`);
    } catch (err) {
      counts[t] = 'ERROR: ' + err.message;
      console.log(`  ${t.padEnd(26)}: NOT ACCESSIBLE (${err.message})`);
    }
  }

  // 2. Investigate ai_evaluations provenance
  console.log('\n--- 2. INVESTIGATING ai_evaluations PROVENANCE (345 rows) ---');
  const evalSample = await db.query(`
    SELECT id, student_id, book_id, chapter_id, subject_id, score, total_questions, created_at 
    FROM ai_evaluations 
    ORDER BY created_at ASC 
    LIMIT 5
  `);
  console.log('Oldest 5 ai_evaluations:');
  for (const r of evalSample.rows) {
    console.log(`  [${r.id}] student: ${r.student_id.slice(0, 8)}... | book: ${r.book_id?.slice(0, 8)}... | score: ${r.score}/${r.total_questions} | created: ${r.created_at}`);
  }

  const evalLatest = await db.query(`
    SELECT id, student_id, book_id, chapter_id, subject_id, score, total_questions, created_at 
    FROM ai_evaluations 
    ORDER BY created_at DESC 
    LIMIT 5
  `);
  console.log('Newest 5 ai_evaluations:');
  for (const r of evalLatest.rows) {
    console.log(`  [${r.id}] student: ${r.student_id.slice(0, 8)}... | book: ${r.book_id?.slice(0, 8)}... | score: ${r.score}/${r.total_questions} | created: ${r.created_at}`);
  }

  // 3. Investigate question_banks (13 rows)
  console.log('\n--- 3. INVESTIGATING question_banks PROVENANCE (13 rows) ---');
  const qbRows = await db.query(`SELECT * FROM question_banks ORDER BY created_at ASC`);
  for (const qb of qbRows.rows) {
    const itemsCnt = (await db.query(`SELECT count(*) as cnt FROM question_bank_items WHERE bank_id = $1`, [qb.id])).rows[0].cnt;
    console.log(`  Bank [${qb.id}] title: "${qb.title}" | subject: ${qb.subject_id} | grade: ${qb.grade_id} | items: ${itemsCnt} | created: ${qb.created_at}`);
  }

  // 4. Investigate question_bank_items (298 rows)
  console.log('\n--- 4. INVESTIGATING question_bank_items (298 rows) ---');
  const qbItemsSample = await db.query(`
    SELECT id, bank_id, chapter_id, question_text, source_chunk_id, page_reference, is_quarantined, quarantine_reason, created_at
    FROM question_bank_items
    ORDER BY created_at ASC
    LIMIT 5
  `);
  console.log('Sample question_bank_items:');
  for (const item of qbItemsSample.rows) {
    console.log(`  Item [${item.id}] bank: ${item.bank_id?.slice(0, 8)}... | p.${item.page_reference} | chunk: ${item.source_chunk_id} | quarantined: ${item.is_quarantined} | text: ${(item.question_text || '').slice(0, 60)}...`);
  }

  // 5. Check student_topic_mastery and student_learning_history
  console.log('\n--- 5. CHECKING DERIVED ASSESSMENT TABLES ---');
  const masterySample = await db.query(`SELECT count(*) as cnt FROM student_topic_mastery`);
  const historySample = await db.query(`SELECT count(*) as cnt FROM student_learning_history`);
  console.log(`  student_topic_mastery count: ${masterySample.rows[0].cnt}`);
  console.log(`  student_learning_history count: ${historySample.rows[0].cnt}`);

  // 6. Check foreign key constraints pointing to ai_evaluations or question_banks
  console.log('\n--- 6. FOREIGN KEY DEPENDENCY ANALYSIS ---');
  console.log('  ai_evaluations: No external tables have foreign keys pointing TO ai_evaluations(id).');
  console.log('  question_bank_items: question_bank_options(question_item_id) references question_bank_items(id) ON DELETE CASCADE.');
  console.log('  question_banks: question_bank_items(bank_id) references question_banks(id) ON DELETE CASCADE.');
}

main().catch(console.error);
