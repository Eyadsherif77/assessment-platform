import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { ReferenceImportService } from '../dist/services/referenceImportService.js';
import { db } from '../dist/db/db.js';

async function testRealWorkbookImport() {
  console.log('🚀 Phase 1 & 3: Testing Real Workbook Import from Desktop...');
  const desktopFilePath = 'C:\\Users\\eyadsherif\\OneDrive\\Desktop\\Science - Unit 2.xlsx';

  if (!fs.existsSync(desktopFilePath)) {
    throw new Error(`CRITICAL: File not found at path: ${desktopFilePath}`);
  }

  const fileBuffer = fs.readFileSync(desktopFilePath);
  console.log(`✅ Read desktop file successfully (${fileBuffer.length} bytes).`);

  // First import run
  console.log('🔄 Executing First Import Run...');
  const result1 = await ReferenceImportService.importReferenceWorkbook(fileBuffer, {
    operatorId: 'admin_test_operator',
    operatorRole: 'ADMIN',
    workbookName: 'Science - Unit 2.xlsx',
    createFixedExam: true
  });

  console.log('First Run Summary:');
  console.log(JSON.stringify({
    success: result1.success,
    totalRows: result1.totalRows,
    imported: result1.imported,
    duplicates: result1.duplicates,
    quarantined: result1.quarantined,
    resolvedCurriculum: result1.resolvedCurriculum,
    fixedExam: result1.fixedExam
  }, null, 2));

  if (!result1.success || result1.totalRows !== 10) {
    throw new Error(`Import failed or row count mismatch: ${result1.totalRows}`);
  }

  // Second import run: verify idempotency
  console.log('🔄 Executing Second Import Run (Idempotency Test)...');
  const result2 = await ReferenceImportService.importReferenceWorkbook(fileBuffer, {
    operatorId: 'admin_test_operator',
    operatorRole: 'ADMIN',
    workbookName: 'Science - Unit 2.xlsx',
    createFixedExam: true
  });

  console.log('Second Run Summary:');
  console.log(JSON.stringify({
    success: result2.success,
    imported: result2.imported,
    duplicates: result2.duplicates
  }, null, 2));

  if (result2.duplicates !== 10 || result2.imported !== 0) {
    throw new Error(`IDEMPOTENCY FAILURE: Expected 10 duplicates and 0 new imported, got ${result2.duplicates} duplicates and ${result2.imported} imported`);
  }
  console.log('✅ IDEMPOTENCY VERIFIED: Repeated import produced 0 duplicates and preserved integrity.');

  // Verify in database: check Fixed Exam
  const examCheck = await db.query(
    `SELECT e.id, e.title_ar, e.subject_id, e.chapter_id, e.is_published, e.is_style_reference,
            (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) as q_count
     FROM exams e
     WHERE e.id = $1`,
    [result1.fixedExam.id]
  );
  console.log('Database Exam Record:', examCheck.rows[0]);

  if (examCheck.rows.length === 0 || Number(examCheck.rows[0].q_count) !== 10) {
    throw new Error(`Fixed Exam verification failed: questions count is ${examCheck.rows[0]?.q_count}`);
  }

  console.log('🎉 ALL WORKBOOK IMPORT AND IDEMPOTENCY CHECKS PASSED PERFECTLY!');
  process.exit(0);
}

testRealWorkbookImport().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
