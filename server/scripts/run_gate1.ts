import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connect } from '@tidbcloud/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function runGate1() {
  const host = process.env.TIDB_HOST;
  const username = process.env.TIDB_USER;
  const password = process.env.TIDB_PASSWORD;
  const database = process.env.TIDB_DATABASE || 'assessment_platform';

  console.log(`Connecting to TiDB Cloud: ${host}, database: ${database}...`);
  const conn = connect({ host, username, password, database });

  // 1. Check foreign key references to the target tables
  console.log('\n--- 1. Checking Foreign Key Constraints referencing target tables ---');
  const fkQuery = `
    SELECT 
      TABLE_NAME, 
      COLUMN_NAME, 
      CONSTRAINT_NAME, 
      REFERENCED_TABLE_NAME, 
      REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = ?
      AND REFERENCED_TABLE_NAME IN ('student_exam_assignments', 'shared_cached_exams', 'ai_evaluations');
  `;
  const fks: any = await conn.execute(fkQuery, [database]);
  console.log('FK references to targets:', JSON.stringify(fks.rows || fks, null, 2));

  // 2. Pre-cleanup counts for target tables
  console.log('\n--- 2. Pre-cleanup Row Counts for Target Tables ---');
  const targetTables = ['student_exam_assignments', 'shared_cached_exams', 'ai_evaluations'];
  const preCounts: Record<string, number> = {};
  for (const t of targetTables) {
    const res: any = await conn.execute(`SELECT COUNT(*) as cnt FROM ${t}`);
    const rows = res.rows || res;
    preCounts[t] = Number(rows[0].cnt ?? rows[0]['COUNT(*)']);
    console.log(`Target table ${t}: ${preCounts[t]} rows`);
  }

  // 3. Pre-cleanup counts for protected tables
  console.log('\n--- 3. Pre-cleanup Row Counts for Protected Tables ---');
  const protectedTables = [
    'users',
    'student_profiles',
    'teacher_profiles',
    'user_active_devices',
    'books',
    'book_chapters',
    'book_chunks',
    'book_pages',
    'book_pdf_chunks',
    'academic_stages',
    'grades',
    'subjects',
    'question_banks',
    'question_bank_items',
    'question_bank_options',
    'ai_usage_metrics',
    'platform_settings',
    'backup_shared_cached_exams_incident_20261015',
    'exams',
    'exam_questions',
    'exam_question_options',
    'exam_attempts',
    'student_answers',
    'student_topic_mastery',
    'student_learning_history'
  ];

  const protectedPreCounts: Record<string, number> = {};
  for (const t of protectedTables) {
    try {
      const res: any = await conn.execute(`SELECT COUNT(*) as cnt FROM ${t}`);
      const rows = res.rows || res;
      protectedPreCounts[t] = Number(rows[0].cnt ?? rows[0]['COUNT(*)']);
      console.log(`Protected table ${t}: ${protectedPreCounts[t]} rows`);
    } catch (e: any) {
      console.log(`Protected table ${t}: query failed or table does not exist: ${e.message}`);
    }
  }

  // 4. Verify safety conditions before proceeding
  console.log('\n--- 4. Safety Verification ---');
  if (preCounts['student_exam_assignments'] !== 57) {
    console.warn(`WARNING: student_exam_assignments count is ${preCounts['student_exam_assignments']}, expected 57`);
  }
  if (preCounts['shared_cached_exams'] !== 48) {
    console.warn(`WARNING: shared_cached_exams count is ${preCounts['shared_cached_exams']}, expected 48`);
  }
  if (preCounts['ai_evaluations'] !== 58) {
    console.warn(`WARNING: ai_evaluations count is ${preCounts['ai_evaluations']}, expected 58`);
  }

  // Check if any unexpected table references student_exam_assignments or ai_evaluations
  const fkRows = (fks.rows || fks) as any[];
  const unexpectedFks = fkRows.filter((fk: any) => {
    // student_exam_assignments referencing shared_cached_exams is expected
    if (fk.TABLE_NAME === 'student_exam_assignments' && fk.REFERENCED_TABLE_NAME === 'shared_cached_exams') {
      return false;
    }
    return true;
  });

  if (unexpectedFks.length > 0) {
    console.error('CRITICAL: Unexpected foreign keys detected! Halting!', unexpectedFks);
    process.exit(1);
  }
  console.log('✅ Foreign key verification passed: Only student_exam_assignments references shared_cached_exams.');

  // 5. Execute deletion in transaction
  console.log('\n--- 5. Executing Cleanup Transaction ---');
  const tx = await conn.begin();
  try {
    const del1: any = await tx.execute('DELETE FROM student_exam_assignments', [], { fullResult: true });
    console.log('Deleted student_exam_assignments, affected rows:', del1.rowsAffected ?? del1.rowCount);

    const del2: any = await tx.execute('DELETE FROM shared_cached_exams', [], { fullResult: true });
    console.log('Deleted shared_cached_exams, affected rows:', del2.rowsAffected ?? del2.rowCount);

    const del3: any = await tx.execute('DELETE FROM ai_evaluations', [], { fullResult: true });
    console.log('Deleted ai_evaluations, affected rows:', del3.rowsAffected ?? del3.rowCount);

    await tx.commit();
    console.log('✅ Transaction committed successfully!');
  } catch (err) {
    console.error('❌ Error during deletion, rolling back...', err);
    await tx.rollback();
    process.exit(1);
  }

  // 6. Post-cleanup verification
  console.log('\n--- 6. Post-cleanup Verification ---');
  for (const t of targetTables) {
    const res: any = await conn.execute(`SELECT COUNT(*) as cnt FROM ${t}`);
    const rows = res.rows || res;
    const cnt = Number(rows[0].cnt ?? rows[0]['COUNT(*)']);
    console.log(`Target table ${t}: ${cnt} rows (expected: 0)`);
    if (cnt !== 0) {
      console.error(`FATAL: Table ${t} is not empty! Count: ${cnt}`);
      process.exit(1);
    }
  }

  console.log('\n--- 7. Verifying Protected Tables Intact ---');
  let protectedTampered = false;
  for (const t of Object.keys(protectedPreCounts)) {
    const res: any = await conn.execute(`SELECT COUNT(*) as cnt FROM ${t}`);
    const rows = res.rows || res;
    const postCnt = Number(rows[0].cnt ?? rows[0]['COUNT(*)']);
    if (postCnt !== protectedPreCounts[t]) {
      console.error(`ALERT: Protected table ${t} changed! Pre: ${protectedPreCounts[t]}, Post: ${postCnt}`);
      protectedTampered = true;
    } else {
      console.log(`Protected table ${t}: ${postCnt} rows (unchanged)`);
    }
  }

  if (protectedTampered) {
    console.error('FATAL: One or more protected tables were altered!');
    process.exit(1);
  }

  console.log('\n🎉 GATE 1 COMPLETED SAFELY AND VERIFIED!');
}

runGate1().catch(err => {
  console.error('Gate 1 failed with error:', err);
  process.exit(1);
});
