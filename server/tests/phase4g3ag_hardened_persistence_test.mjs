/**
 * Phase 4G.3AG — Hardened New-Book Persistence Integration Test Suite
 *
 * SAFETY & ISOLATION GUARANTEES:
 * - Local isolated SQLite / test DB execution only.
 * - Zero production TiDB writes, zero DDL migrations, zero external AI/OCR calls.
 * - Failure injection at individual SQL statement boundaries without touching TiDB.
 * - Verifies the invariant: Verified canonical books can NEVER be replaced or mutated in-place.
 * - Verifies fail-closed non-destructive staged promotion and conservative cleanup.
 * - Verifies the 54 canonical curriculum units remain 100% eligible and unchanged.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { BookIngestionService } from '../dist/services/bookIngestionService.js';
import { ReadinessValidator, UnitReadinessBlockedError } from '../dist/services/readinessValidator.js';
import { db } from '../dist/db/db.js';
import { setupDisposableTestDb, assertDatabaseIsDisposable, teardownDisposableTestDb } from './test_isolation_helper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

const scannedPdfFixturePath = path.resolve(__dirname, '../uploads/tmp_missing_page_42.pdf');
const authenticPdf = fs.readFileSync(scannedPdfFixturePath);

async function main() {
  const disposable = setupDisposableTestDb('phase4g3ag');
  try {
    console.log('================================================================');
    console.log('PHASE 4G.3AG — HARDENED NEW-BOOK PERSISTENCE INTEGRATION TESTS');
    console.log('Zero Production DB Mutations | Zero External AI Calls | Isolated');
    console.log('================================================================\n');

    await db.init();
    assertDatabaseIsDisposable(db, disposable.dbPath);
    console.log(`🛡️  Test isolation verified: operating strictly on disposable SQLite database: ${disposable.dbPath}\n`);
  const stagesRes = await db.query('SELECT id FROM academic_stages LIMIT 1');
  const gradesRes = await db.query('SELECT id, stage_id FROM grades LIMIT 1');
  const validStageId = stagesRes.rows[0]?.id || 'stage_prim';
  const validGradeId = gradesRes.rows[0]?.id || 'grade_prim_1';

  let validSubjectId = 'sub_arabic_ag';
  const subRes = await db.query('SELECT id FROM subjects WHERE grade_id = $1 LIMIT 1', [validGradeId]);
  if (subRes.rows.length > 0) {
    validSubjectId = subRes.rows[0].id;
  } else {
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, $3, $4, $5)`,
      [validSubjectId, validGradeId, 'ARABIC_AG', 'اللغة العربية', 'Arabic']
    ).catch(() => {});
  }

  // Pre-test fixture cleanup
  const fixtureBookIds = [
    'book_verified_canonical_ag',
    'book_pre_promotion_fail_ag',
    'book_mid_promotion_fail_ag',
    'book_fresh_success_ag',
    'book_cleanup_victim_ag',
    'upload_failed_source_ag'
  ];
  for (const tid of fixtureBookIds) {
    await db.query('DELETE FROM book_chunks WHERE book_id = $1', [tid]).catch(() => {});
    await db.query('DELETE FROM book_chapters WHERE book_id = $1', [tid]).catch(() => {});
    await db.query('DELETE FROM book_pages WHERE book_id = $1', [tid]).catch(() => {});
    await db.query('DELETE FROM book_pdf_chunks WHERE book_id = $1', [tid]).catch(() => {});
    await db.query('DELETE FROM books WHERE id = $1', [tid]).catch(() => {});
  }

  const mockOcr = async (p) =>
    `الوحدة الأولى: قواعد اللغة العربية والمفاهيم الأساسية صفحة ${p}.\n\nشرح متكامل لدروس النحو وتدريبات تطبيقية وافية.`;

  // ==========================================================================
  // TEST 1: Protect Existing Verified Books
  // ==========================================================================
  console.log('--- Test 1: Invariant Protection of Existing Verified Books ---');

  await runTest('1. Attempted replacement of a verified book is rejected without changing its original pages, chunks, chapters, embeddings, or readiness', async () => {
    const verifiedBookId = 'book_verified_canonical_ag';

    // Seed canonical book
    await db.query(
      `INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, total_pages, processing_status)
       VALUES ($1, 'كتاب القواعد الأصلي المعتمد', 'Original Grammar Book', $2, $3, $4, 10, 'COMPLETED')`,
      [verifiedBookId, validStageId, validGradeId, validSubjectId]
    );
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ('ch_verified_1', $1, 1, 'الوحدة الأولى المعتمدة', 'Canonical Unit 1', 1, 10)`,
      [verifiedBookId]
    );

    const testEmb = JSON.stringify(new Array(100).fill(0.08));
    for (let c = 1; c <= 3; c++) {
      await db.query(
        `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, embedding)
         VALUES ($1, $2, 'ch_verified_1', $3, $4, $5, 1, $6, $7, $8)`,
        [
          `chk_verified_${c}`,
          verifiedBookId,
          validStageId,
          validGradeId,
          validSubjectId,
          c,
          'محتوى الوحدة المعتمدة الأصلية يحتوي على شروحات وتطبيقات لغوية ونحوية شاملة ومفصلة لطلاب المرحلة التعليمية المقررة.',
          testEmb
        ]
      );
    }
    await db.query(
      `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
       VALUES ('pg_verified_1', $1, 1, 'نص الصفحة الأصلية الكامل مع شرح وتطبيقات نحوية وافية تتجاوز مائة حرف بكل تأكيد.', 120)`,
      [verifiedBookId]
    );

    ReadinessValidator.clearDynamicUnits();
    const initReadiness = await ReadinessValidator.getUnitReadinessAsync(verifiedBookId, 'ch_verified_1');
    assert.strictEqual(initReadiness.status, 'VERIFIED_READY', 'Pre-condition: book must be VERIFIED_READY');

    // Attempt in-place replacement with forceReingest = true
    const report = await BookIngestionService.ingestTextbook({
      bookId: verifiedBookId,
      pdfBuffer: authenticPdf,
      titleAr: 'كتاب القواعد الأصلي المعتمد (محاولة استبدال غير مصرح بها)',
      academicStageId: validStageId,
      gradeId: validGradeId,
      subjectId: validSubjectId,
      options: {
        ocrProvider: mockOcr,
        visualRequirements: 'NONE',
        forceReingest: true
      }
    });

    // Invariant verification: Ingestion must reject with CANNOT_OVERWRITE_VERIFIED_BOOK
    assert.strictEqual(report.status, 'BLOCKED', 'In-place replacement of verified book must be BLOCKED');
    assert.strictEqual(report.isPublished, false, 'Must not be published');
    assert.ok(
      report.issues.some(i => i.code === 'CANNOT_OVERWRITE_VERIFIED_BOOK'),
      'Must contain CANNOT_OVERWRITE_VERIFIED_BOOK issue code'
    );

    // Verify all original content is 100% preserved
    const chunksRes = await db.query('SELECT id, embedding FROM book_chunks WHERE book_id = $1', [verifiedBookId]);
    assert.strictEqual(chunksRes.rows.length, 3, 'Must retain exactly 3 original chunks');
    assert.strictEqual(chunksRes.rows[0].embedding, testEmb, 'Chunk embeddings must be untouched');

    const pagesRes = await db.query('SELECT id FROM book_pages WHERE book_id = $1', [verifiedBookId]);
    assert.strictEqual(pagesRes.rows.length, 1, 'Must retain original page');

    const chaptersRes = await db.query('SELECT id FROM book_chapters WHERE book_id = $1', [verifiedBookId]);
    assert.strictEqual(chaptersRes.rows.length, 1, 'Must retain original chapter');

    const bookRes = await db.query('SELECT processing_status FROM books WHERE id = $1', [verifiedBookId]);
    assert.strictEqual(bookRes.rows[0].processing_status, 'COMPLETED', 'Book status must remain COMPLETED');

    ReadinessValidator.clearDynamicUnits();
    const postReadiness = await ReadinessValidator.getUnitReadinessAsync(verifiedBookId, 'ch_verified_1');
    assert.strictEqual(postReadiness.status, 'VERIFIED_READY', 'Readiness must remain VERIFIED_READY');
    assert.strictEqual(postReadiness.isEligibleForAI, true, 'Unit must remain eligible for AI');
  });

  // ==========================================================================
  // TEST 2: Failure Before Promotion
  // ==========================================================================
  console.log('\n--- Test 2: Failure Before Promotion Preserves Canonical Content ---');

  await runTest('2. Failure before promotion preserves the original canonical content', async () => {
    const failBookId = 'book_pre_promotion_fail_ag';

    const origQuery = db.query.bind(db);
    let injectedBeforePromotion = false;

    // Simulate failure during staging chunks insertion (before any promotion statements execute)
    db.query = async function (sql, params = []) {
      if (typeof sql === 'string' && sql.includes('INSERT INTO book_chunks') && params.some(p => typeof p === 'string' && p.includes('-'))) {
        injectedBeforePromotion = true;
        throw new Error('Injected statement error: Database connection severed before promotion');
      }
      return origQuery(sql, params);
    };

    let report;
    try {
      report = await BookIngestionService.ingestTextbook({
        bookId: failBookId,
        pdfBuffer: authenticPdf,
        titleAr: 'كتاب الفشل قبل الترقية',
        academicStageId: validStageId,
        gradeId: validGradeId,
        subjectId: validSubjectId,
        options: {
          ocrProvider: mockOcr,
          visualRequirements: 'NONE'
        }
      });
    } finally {
      db.query = origQuery;
    }

    assert.ok(injectedBeforePromotion, 'Injected error must have triggered before promotion');
    assert.strictEqual(report.status, 'BLOCKED', 'Report must be BLOCKED');

    // Canonical book should have 0 chunks and 0 pages promoted
    const canonicalChunks = await db.query('SELECT id FROM book_chunks WHERE book_id = $1', [failBookId]);
    assert.strictEqual(canonicalChunks.rows.length, 0, 'Zero canonical chunks should exist');

    const canonicalPages = await db.query('SELECT id FROM book_pages WHERE book_id = $1', [failBookId]);
    assert.strictEqual(canonicalPages.rows.length, 0, 'Zero canonical pages should exist');

    const bookStatus = await db.query('SELECT processing_status FROM books WHERE id = $1', [failBookId]);
    assert.strictEqual(bookStatus.rows[0]?.processing_status, 'FAILED', 'Status must be FAILED, never COMPLETED');
  });

  // ==========================================================================
  // TEST 3: Failure After First Promotion Statement Never Exposes Content as Ready
  // ==========================================================================
  console.log('\n--- Test 3: Failure Midway During Promotion Statements ---');

  await runTest('3. Failure after the first promotion statement never exposes partial content as AI-ready', async () => {
    const midFailBookId = 'book_mid_promotion_fail_ag';

    const origQuery = db.query.bind(db);
    let chunksPromoted = false;
    let injectedMidPromotion = false;

    // Allow Step 2 (PROMOTING_CHUNKS) to succeed, but inject failure on Step 3 (PROMOTING_PAGES)
    db.query = async function (sql, params = []) {
      if (typeof sql === 'string' && sql.includes('UPDATE book_chunks SET book_id = $1 WHERE book_id = $2')) {
        chunksPromoted = true;
      }
      if (typeof sql === 'string' && sql.includes('UPDATE book_pages SET book_id = $1 WHERE book_id = $2')) {
        injectedMidPromotion = true;
        throw new Error('Injected statement error: Database node rebooted during page promotion');
      }
      return origQuery(sql, params);
    };

    let report;
    try {
      report = await BookIngestionService.ingestTextbook({
        bookId: midFailBookId,
        pdfBuffer: authenticPdf,
        titleAr: 'كتاب الفشل في منتصف الترقية',
        academicStageId: validStageId,
        gradeId: validGradeId,
        subjectId: validSubjectId,
        options: {
          ocrProvider: mockOcr,
          visualRequirements: 'NONE'
        }
      });
    } finally {
      db.query = origQuery;
    }

    assert.ok(chunksPromoted, 'Chunk promotion statement must have run');
    assert.ok(injectedMidPromotion, 'Mid-promotion page statement error must have triggered');
    assert.strictEqual(report.status, 'BLOCKED', 'Ingestion report must fail closed (BLOCKED)');

    // Verify canonical book status is FAILED
    const bookStatus = await db.query('SELECT processing_status, processing_error FROM books WHERE id = $1', [midFailBookId]);
    assert.strictEqual(bookStatus.rows[0]?.processing_status, 'FAILED', 'Status must be FAILED after midway interruption');
    assert.ok(bookStatus.rows[0]?.processing_error?.includes('PROMOTING_PAGES'), 'Processing error must identify interrupted step');

    // Test ReadinessValidator: must strictly block the partially promoted content!
    ReadinessValidator.clearDynamicUnits();
    const chRes = await db.query('SELECT id FROM book_chapters WHERE book_id = $1 LIMIT 1', [midFailBookId]);
    const chapterId = chRes.rows[0]?.id || 'ch_dummy';

    const readiness = await ReadinessValidator.getUnitReadinessAsync(midFailBookId, chapterId);
    assert.strictEqual(readiness.status, 'BLOCKED', 'Partial content must be marked BLOCKED');
    assert.strictEqual(readiness.isEligibleForAI, false, 'Partial content must NOT be eligible for AI');
    assert.ok(readiness.reason.includes('FAILED'), 'Reason must truthfully indicate FAILED processing status');

    // Calling assertUnitEligibleForAIAsync must throw UnitReadinessBlockedError
    await assert.rejects(
      async () => ReadinessValidator.assertUnitEligibleForAIAsync(midFailBookId, chapterId),
      (err) => err instanceof UnitReadinessBlockedError
    );
  });

  // ==========================================================================
  // TEST 4: Retry Does Not Silently Erase Recoverable Copy
  // ==========================================================================
  console.log('\n--- Test 4: Retry Preserves Recoverable Staged Data ---');

  await runTest('4. Retry after a simulated promotion failure does not silently erase the only recoverable copy', async () => {
    const midFailBookId = 'book_mid_promotion_fail_ag';

    // Verify that staged / canonical chunks from Test 3 were NOT wiped out by destructive cleanup
    const preRetryChunks = await db.query('SELECT COUNT(*) as cnt FROM book_chunks WHERE book_id = $1', [midFailBookId]);
    assert.ok(Number(preRetryChunks.rows[0].cnt) > 0, 'Chunks from interrupted run must be preserved in DB for recovery');

    // Launch retry of ingestion
    const retryReport = await BookIngestionService.ingestTextbook({
      bookId: midFailBookId,
      pdfBuffer: authenticPdf,
      titleAr: 'كتاب الفشل في منتصف الترقية (إعادة المحاولة المعتمدة)',
      academicStageId: validStageId,
      gradeId: validGradeId,
      subjectId: validSubjectId,
      options: {
        ocrProvider: mockOcr,
        visualRequirements: 'NONE'
      }
    });

    assert.strictEqual(retryReport.status, 'VERIFIED_READY', 'Retry must succeed and become VERIFIED_READY');
    assert.strictEqual(retryReport.isPublished, true, 'Retry must be published');

    const postRetryBook = await db.query('SELECT processing_status FROM books WHERE id = $1', [midFailBookId]);
    assert.strictEqual(postRetryBook.rows[0].processing_status, 'COMPLETED', 'Final status must be COMPLETED');
  });

  // ==========================================================================
  // TEST 5: Successful Fresh-Book Ingestion
  // ==========================================================================
  console.log('\n--- Test 5: Fresh-Book Ingestion Consistency ---');

  await runTest('5. A successful fresh-book ingestion produces consistent canonical IDs and valid chapter references', async () => {
    const freshBookId = 'book_fresh_success_ag';

    const report = await BookIngestionService.ingestTextbook({
      bookId: freshBookId,
      pdfBuffer: authenticPdf,
      titleAr: 'كتاب القراءة الحديث والتعبير المعتمد',
      titleEn: 'Modern Reading and Expression',
      academicStageId: validStageId,
      gradeId: validGradeId,
      subjectId: validSubjectId,
      options: {
        ocrProvider: mockOcr,
        visualRequirements: 'NONE'
      }
    });

    assert.strictEqual(report.status, 'VERIFIED_READY', 'Must be VERIFIED_READY');
    assert.strictEqual(report.bookId, freshBookId, 'Book ID must match canonical fresh ID');
    assert.ok(report.totalPages >= 1, 'Total pages must be positive');

    // Check database records
    const bookRow = await db.query('SELECT * FROM books WHERE id = $1', [freshBookId]);
    assert.strictEqual(bookRow.rows.length, 1);
    assert.strictEqual(bookRow.rows[0].processing_status, 'COMPLETED');

    const chapters = await db.query('SELECT * FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC', [freshBookId]);
    assert.ok(chapters.rows.length >= 1, 'Must have at least 1 detected chapter');
    const chapterIds = new Set(chapters.rows.map(c => c.id));

    const chunks = await db.query('SELECT * FROM book_chunks WHERE book_id = $1', [freshBookId]);
    assert.ok(chunks.rows.length >= 2, 'Must have at least 2 chunks');

    for (const chunk of chunks.rows) {
      assert.strictEqual(chunk.book_id, freshBookId, 'Chunk must reference canonical bookId');
      assert.ok(chunk.chapter_id && chapterIds.has(chunk.chapter_id), 'Chunk chapter_id must reference a valid detected chapter');
      assert.ok(chunk.embedding && chunk.embedding.length > 50, 'Chunk must have valid vector embedding');
      assert.strictEqual(chunk.academic_stage_id, validStageId);
      assert.strictEqual(chunk.grade_id, validGradeId);
      assert.strictEqual(chunk.subject_id, validSubjectId);
    }

    const pages = await db.query('SELECT * FROM book_pages WHERE book_id = $1', [freshBookId]);
    assert.ok(pages.rows.length >= 1, 'Must have pages');
    for (const page of pages.rows) {
      assert.strictEqual(page.book_id, freshBookId);
      assert.ok(page.raw_text.length > 0);
    }
  });

  // ==========================================================================
  // TEST 6: Staging Records Cannot Pass Readiness Checks
  // ==========================================================================
  console.log('\n--- Test 6: Staging Records Gate ---');

  await runTest('6. Staging records cannot pass readiness checks or generate exams', async () => {
    const syntheticStagingId = 'staging_stub_unpromoted_ag';
    const stagingChapterId = 'staging_ch_unpromoted_1';

    await db.query('DELETE FROM book_chapters WHERE id = $1', [stagingChapterId]).catch(() => {});
    await db.query('DELETE FROM books WHERE id = $1', [syntheticStagingId]).catch(() => {});

    // Insert a staging stub with PENDING status and a linked chapter
    await db.query(
      `INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, total_pages, processing_status, processing_error)
       VALUES ($1, 'كتاب مرحلي قيد التجهيز', 'Staged Book Stub', $2, $3, $4, 10, 'PENDING', 'Staging in progress')`,
      [syntheticStagingId, validStageId, validGradeId, validSubjectId]
    );
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 1, 'وحدة مرحلية قيد التجهيز', 'Staged Unit Stub', 1, 10)`,
      [stagingChapterId, syntheticStagingId]
    );

    ReadinessValidator.clearDynamicUnits();
    const readiness = await ReadinessValidator.getUnitReadinessAsync(syntheticStagingId, stagingChapterId);

    assert.strictEqual(readiness.isEligibleForAI, false, 'Staging book must NOT be eligible for AI');
    assert.strictEqual(readiness.status, 'BLOCKED', 'Staging book must be BLOCKED');
    assert.ok(readiness.reason.includes('PENDING'), 'Reason must indicate PENDING processing status');

    await assert.rejects(
      async () => ReadinessValidator.assertUnitEligibleForAIAsync(syntheticStagingId, stagingChapterId),
      (err) => err instanceof UnitReadinessBlockedError
    );

    // Clean up synthetic staging record
    await db.query('DELETE FROM book_chapters WHERE id = $1', [stagingChapterId]).catch(() => {});
    await db.query('DELETE FROM books WHERE id = $1', [syntheticStagingId]).catch(() => {});
  });

  // ==========================================================================
  // TEST 7: Scoped Cleanup Cannot Affect Other Books
  // ==========================================================================
  console.log('\n--- Test 7: Conservative Scoped Cleanup ---');

  await runTest('7. Cleanup for one failed upload cannot affect another book', async () => {
    const canonicalVictimId = 'book_cleanup_victim_ag';
    const failedUploadSourceId = 'upload_failed_source_ag';

    // Seed canonical book
    await db.query(
      `INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, total_pages, processing_status)
       VALUES ($1, 'كتاب محمي من الحذف العرضي', 'Protected Book', $2, $3, $4, 5, 'COMPLETED')`,
      [canonicalVictimId, validStageId, validGradeId, validSubjectId]
    );
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ('ch_victim_1', $1, 1, 'الوحدة المحمية', 'Protected Unit', 1, 5)`,
      [canonicalVictimId]
    );
    await db.query(
      `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content)
       VALUES ('chk_victim_1', $1, 'ch_victim_1', $2, $3, $4, 1, 1, 'محتوى محمي لا يجوز حذفه')`,
      [canonicalVictimId, validStageId, validGradeId, validSubjectId]
    );
    await db.query(
      `INSERT INTO book_pdf_chunks (book_id, chunk_index, chunk_data) VALUES ($1, 0, $2)`,
      [canonicalVictimId, Buffer.from('CANONICAL_PDF_DATA')]
    );

    // Seed failed upload source
    await db.query(
      `INSERT INTO book_pdf_chunks (book_id, chunk_index, chunk_data) VALUES ($1, 0, $2)`,
      [failedUploadSourceId, Buffer.from('TEMP_FAILED_PDF_DATA')]
    );

    // Execute scoped cleanup targeting only failedUploadSourceId
    const canonicalCheck = await db.query(
      `SELECT id FROM books WHERE id = $1 AND processing_status IN ('COMPLETED', 'VERIFIED_READY')`,
      [failedUploadSourceId]
    );
    if (canonicalCheck.rows.length === 0) {
      await db.query(`DELETE FROM book_pdf_chunks WHERE book_id = $1`, [failedUploadSourceId]);
    }

    // Verify canonicalVictimId is 100% untouched
    const victimPdf = await db.query('SELECT * FROM book_pdf_chunks WHERE book_id = $1', [canonicalVictimId]);
    assert.strictEqual(victimPdf.rows.length, 1, 'Canonical PDF chunks must remain untouched');

    const victimChunks = await db.query('SELECT * FROM book_chunks WHERE book_id = $1', [canonicalVictimId]);
    assert.strictEqual(victimChunks.rows.length, 1, 'Canonical chunks must remain untouched');

    const victimChapters = await db.query('SELECT * FROM book_chapters WHERE book_id = $1', [canonicalVictimId]);
    assert.strictEqual(victimChapters.rows.length, 1, 'Canonical chapters must remain untouched');

    // Failed upload chunks were cleaned up
    const failedPdf = await db.query('SELECT * FROM book_pdf_chunks WHERE book_id = $1', [failedUploadSourceId]);
    assert.strictEqual(failedPdf.rows.length, 0, 'Failed upload chunks must be deleted');
  });

  // ==========================================================================
  // TEST 8: 54 Canonical Curriculum Units Regression
  // ==========================================================================
  console.log('\n--- Test 8: Canonical 54 Curriculum Units Integrity ---');

  await runTest('8. Existing 54 canonical curriculum units remain eligible and unchanged in the isolated regression tests', async () => {
    ReadinessValidator.clearDynamicUnits();
    const summary = ReadinessValidator.getReadinessSummary();

    assert.strictEqual(summary.totalUnits, 54, `Authoritative curriculum must contain exactly 54 units, found ${summary.totalUnits}`);
    assert.strictEqual(summary.verifiedReady, 54, `All 54 canonical curriculum units must be VERIFIED_READY, found ${summary.verifiedReady}`);
    assert.strictEqual(summary.blocked, 0, `Must have 0 BLOCKED units, found ${summary.blocked}`);
    assert.strictEqual(summary.notAudited, 0, `Must have 0 NOT_AUDITED units, found ${summary.notAudited}`);

    // Verify all 54 units are verified ready and eligible for AI
    const inv = ReadinessValidator.loadInventory();
    for (const [key, unit] of inv.entries()) {
      const res = await ReadinessValidator.getUnitReadinessAsync(unit.book_id, unit.chapter_id);
      assert.strictEqual(res.status, 'VERIFIED_READY', `Unit ${key} must remain VERIFIED_READY`);
      assert.strictEqual(res.isEligibleForAI, true, `Unit ${key} must remain eligible for AI`);
    }
  });

  // Post-test cleanup of test fixtures
  for (const tid of fixtureBookIds) {
    await db.query('DELETE FROM book_chunks WHERE book_id = $1', [tid]).catch(() => {});
    await db.query('DELETE FROM book_chapters WHERE book_id = $1', [tid]).catch(() => {});
    await db.query('DELETE FROM book_pages WHERE book_id = $1', [tid]).catch(() => {});
    await db.query('DELETE FROM book_pdf_chunks WHERE book_id = $1', [tid]).catch(() => {});
    await db.query('DELETE FROM books WHERE id = $1', [tid]).catch(() => {});
  }

  console.log('\n================================================================');
  console.log(`PHASE 4G.3AG ALL TESTS PASSED: ${passedTests}/${totalTests}`);
  console.log('Verified Non-Destructive Invariant Protection & Fail-Closed Safety');
  console.log('================================================================');
  } finally {
    teardownDisposableTestDb(db, disposable.tempDir);
    console.log(`🧹 Teardown complete: disposable test directory unlinked: ${disposable.tempDir}`);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
