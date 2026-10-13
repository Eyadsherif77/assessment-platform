import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { ExamCacheService } from '../dist/services/examCacheService.js';

async function main() {
  console.log('========================================================================');
  console.log('🧹 PHASE 3B: AUTHORIZED CLEAN-SLATE RESET OF ARTIFACT TABLES');
  console.log('========================================================================\n');

  // --- 1. PRE-CLEANUP INVENTORY ---
  console.log('--- 1. PRE-CLEANUP TARGETED TABLES AUDIT ---');
  const targetTables = [
    'student_learning_history',
    'student_topic_mastery',
    'ai_evaluations',
    'question_bank_options',
    'question_bank_items',
    'question_banks',
    'student_answers',
    'exam_attempts',
    'exam_question_options',
    'exam_questions',
    'exams'
  ];

  const preCounts = {};
  for (const t of targetTables) {
    const res = await db.query(`SELECT count(*) as cnt FROM ${t}`);
    preCounts[t] = Number(res.rows[0].cnt);
    console.log(`  Target: ${t.padEnd(28)}: ${preCounts[t]} rows`);
  }

  console.log('\n--- 2. PRE-CLEANUP PROTECTED TABLES AUDIT ---');
  const protectedTables = {
    users: 229,
    student_profiles: 226,
    books: 13,
    book_pages: 1594,
    book_chunks: 1373,
    book_chapters: 54,
    book_pdf_chunks: 314
  };

  for (const [table, expected] of Object.entries(protectedTables)) {
    const res = await db.query(`SELECT count(*) as cnt FROM ${table}`);
    const actual = Number(res.rows[0].cnt);
    if (actual !== expected) {
      throw new Error(`PROTECTED_TABLE_MISMATCH: ${table} count is ${actual}, expected ${expected}. ABORTING!`);
    }
    console.log(`  Protected: ${table.padEnd(25)}: ${actual}/${expected} ✅`);
  }

  // --- 3. SCOPED BACKUP OF TARGET ARTIFACTS ---
  console.log('\n--- 3. CREATING VERIFIED SCOPED BACKUP ---');
  const backupData = {
    timestamp: new Date().toISOString(),
    purpose: 'Scoped pre-deletion backup for authorized clean-slate reset of old exam and evaluation artifacts',
    counts: { ...preCounts },
    tables: {}
  };

  const tablesToDump = [
    'student_learning_history',
    'student_topic_mastery',
    'ai_evaluations',
    'question_bank_options',
    'question_bank_items',
    'question_banks'
  ];

  for (const t of tablesToDump) {
    console.log(`  Dumping ${t} (${preCounts[t]} rows)...`);
    const res = await db.query(`SELECT * FROM ${t}`);
    backupData.tables[t] = res.rows;
  }

  const isoTime = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilename = `scoped_backup_clean_slate_artifacts_${isoTime}.json`;
  const backupPath = path.resolve(process.cwd(), 'backups', backupFilename);

  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf-8');
  const backupStat = fs.statSync(backupPath);
  console.log(`  ✅ Backup successfully written: ${backupPath}`);
  console.log(`     File size: ${(backupStat.size / (1024 * 1024)).toFixed(2)} MB (${backupStat.size} bytes)`);

  // Verify backup integrity
  console.log('  Verifying backup file readability and row count consistency...');
  const verifyContent = fs.readFileSync(backupPath, 'utf-8');
  const parsedBackup = JSON.parse(verifyContent);

  for (const t of tablesToDump) {
    const dumpedRows = parsedBackup.tables[t]?.length || 0;
    if (dumpedRows !== preCounts[t]) {
      throw new Error(`BACKUP_VERIFICATION_FAILED: ${t} dumped ${dumpedRows} rows, expected ${preCounts[t]}! ABORTING!`);
    }
    console.log(`     ✓ ${t}: ${dumpedRows}/${preCounts[t]} rows verified in backup.`);
  }
  console.log('  ✅ SCOPED BACKUP VERIFIED 100% READABLE & COMPLETE!\n');

  // --- 4. EXECUTE AUTHORIZED CLEANUP IN SAFE DEPENDENCY ORDER ---
  console.log('--- 4. EXECUTING SAFE DELETION IN DEPENDENCY ORDER ---');

  // Order:
  // 1. student_learning_history (references ai_evaluations)
  // 2. student_topic_mastery
  // 3. ai_evaluations
  // 4. question_bank_options (references question_bank_items)
  // 5. question_bank_items (references question_banks)
  // 6. question_banks
  // 7. exams tables (already 0, but execute clean DELETE to ensure zero residues)

  console.log('  1. Deleting student_learning_history...');
  await db.query(`DELETE FROM student_learning_history WHERE id IS NOT NULL`);
  console.log('     ✓ student_learning_history cleared.');

  console.log('  2. Deleting student_topic_mastery...');
  await db.query(`DELETE FROM student_topic_mastery WHERE id IS NOT NULL`);
  console.log('     ✓ student_topic_mastery cleared.');

  console.log('  3. Deleting ai_evaluations...');
  await db.query(`DELETE FROM ai_evaluations WHERE id IS NOT NULL`);
  console.log('     ✓ ai_evaluations cleared.');

  console.log('  4. Deleting question_bank_options...');
  await db.query(`DELETE FROM question_bank_options WHERE id IS NOT NULL`);
  console.log('     ✓ question_bank_options cleared.');

  console.log('  5. Deleting question_bank_items...');
  await db.query(`DELETE FROM question_bank_items WHERE id IS NOT NULL`);
  console.log('     ✓ question_bank_items cleared.');

  console.log('  6. Deleting question_banks...');
  await db.query(`DELETE FROM question_banks WHERE id IS NOT NULL`);
  console.log('     ✓ question_banks cleared.');

  console.log('  7. Ensuring exam tables are zero...');
  await db.query(`DELETE FROM student_answers WHERE id IS NOT NULL`);
  await db.query(`DELETE FROM exam_attempts WHERE id IS NOT NULL`);
  await db.query(`DELETE FROM exam_question_options WHERE id IS NOT NULL`);
  await db.query(`DELETE FROM exam_questions WHERE id IS NOT NULL`);
  await db.query(`DELETE FROM exams WHERE id IS NOT NULL`);
  console.log('     ✓ exam tables confirmed zero.');

  // Clear in-memory cache
  ExamCacheService.clearCache();
  console.log('  8. In-memory exam cache cleared.\n');

  // --- 5. POST-CLEANUP VERIFICATION ---
  console.log('--- 5. POST-CLEANUP ROW COUNT VERIFICATION ---');
  const postCounts = {};
  let targetCleanupPassed = true;
  for (const t of targetTables) {
    const res = await db.query(`SELECT count(*) as cnt FROM ${t}`);
    postCounts[t] = Number(res.rows[0].cnt);
    const ok = postCounts[t] === 0;
    if (!ok) targetCleanupPassed = false;
    console.log(`  Target: ${t.padEnd(28)}: ${postCounts[t]} (Pre: ${preCounts[t]}) -> ${ok ? 'CLEARED ✅' : 'FAIL ❌'}`);
  }

  console.log('\n--- 6. PROTECTED DATA INTEGRITY VERIFICATION ---');
  let protectedPassed = true;
  for (const [table, expected] of Object.entries(protectedTables)) {
    const res = await db.query(`SELECT count(*) as cnt FROM ${table}`);
    const actual = Number(res.rows[0].cnt);
    const ok = actual === expected;
    if (!ok) protectedPassed = false;
    console.log(`  Protected: ${table.padEnd(25)}: ${actual}/${expected} -> ${ok ? 'INTACT ✅' : 'CORRUPTED ❌'}`);
  }

  const report = {
    timestamp: new Date().toISOString(),
    backupPath,
    backupSize: backupStat.size,
    targetCleanupPassed,
    protectedPassed,
    preCounts,
    postCounts,
    protectedCounts: protectedTables
  };

  fs.writeFileSync('scripts/clean_slate_reset_report.json', JSON.stringify(report, null, 2), 'utf-8');
  console.log('\n✅ Report saved to scripts/clean_slate_reset_report.json');

  if (!targetCleanupPassed || !protectedPassed) {
    throw new Error('Post-cleanup verification failed!');
  }

  console.log('\n========================================================================');
  console.log('🎉 CLEAN-SLATE RESET COMPLETED WITH 100% PROTECTED DATA INTEGRITY!');
  console.log('========================================================================');
}

main().catch(err => {
  console.error('Fatal cleanup error:', err);
  process.exit(1);
});
