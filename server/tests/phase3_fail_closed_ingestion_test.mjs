import assert from 'assert';
import { ReadinessValidator, UnitReadinessBlockedError } from '../dist/services/readinessValidator.js';
import { BookIngestionService } from '../dist/services/bookIngestionService.js';
import { db } from '../dist/db/db.js';
import { setupDisposableTestDb, assertDatabaseIsDisposable, teardownDisposableTestDb } from './test_isolation_helper.mjs';

console.log('================================================================');
console.log('PHASE 3 — FUTURE INGESTION FAIL-CLOSED BEHAVIOR TEST SUITE');
console.log('Zero External AI Calls | Strictly Disposable Isolated Test DB');
console.log('================================================================\n');

let passed = 0;
const pass = (name) => {
  passed++;
  console.log(`  [PASS] ${passed}. ${name}`);
};

async function main() {
  const disposable = setupDisposableTestDb('phase3_fail_closed');
  try {
    await db.init();
    assertDatabaseIsDisposable(db, disposable.dbPath);

    // Setup basic lookup data from initialized schema
    const stagesRes = await db.query('SELECT id FROM academic_stages LIMIT 1');
    const gradesRes = await db.query('SELECT id, stage_id FROM grades LIMIT 1');
    const stageId = stagesRes.rows[0]?.id || 'stage_prep';
    const gradeId = gradesRes.rows[0]?.id || 'grade_prep_1';

    let subjectId = 'sub_arabic_test';
    const subRes = await db.query('SELECT id FROM subjects WHERE grade_id = $1 LIMIT 1', [gradeId]);
    if (subRes.rows.length > 0) {
      subjectId = subRes.rows[0].id;
    } else {
      await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'ARABIC', 'اللغة العربية', 'Arabic')`, [subjectId, gradeId]);
    }

    // ============================================================================
    // TEST 1: Malformed PDF rejection
    // ============================================================================
    console.log('--- Test Group 1: Malformed PDF File Rejection ---');
    const corruptBuffer = Buffer.from('NOT_A_REAL_PDF_FILE_HEADER_XYZ');
    const malformedReport = await BookIngestionService.ingestTextbook({
      bookId: 'test_book_malformed',
      pdfBuffer: corruptBuffer,
      fileName: 'corrupt.pdf',
      titleAr: 'كتاب تالف',
      academicStageId: stageId,
      gradeId: gradeId,
      subjectId: subjectId
    });

    assert.strictEqual(malformedReport.status, 'BLOCKED', 'Malformed PDF must have status BLOCKED');
    assert.strictEqual(malformedReport.isPublished, false, 'Malformed PDF must not be published');
    assert.ok(malformedReport.issues.length > 0, 'Must report issues');
    pass('Malformed or undersized PDF file is immediately blocked with diagnostic code');

    // ============================================================================
    // TEST 2: Successful upload alone never makes book eligible for exam generation
    // ============================================================================
    console.log('\n--- Test Group 2: Upload-Alone Ineligibility (PENDING status gate) ---');
    const uploadedBookId = 'book_just_uploaded_stub';
    const chapterStubId = 'ch_uploaded_stub';

    await db.query(
      `INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, total_pages, processing_status)
       VALUES ($1, 'كتاب مرفوع حديثاً', 'Fresh Upload', $2, $3, $4, 50, 'PENDING')`,
      [uploadedBookId, stageId, gradeId, subjectId]
    );
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 1, 'الوحدة الأولى', 'Unit 1', 1, 20)`,
      [chapterStubId, uploadedBookId]
    );

    const pendingReadiness = await ReadinessValidator.getUnitReadinessAsync(uploadedBookId, chapterStubId);
    assert.strictEqual(pendingReadiness.status, 'BLOCKED', 'Book with PENDING status must be BLOCKED');
    assert.strictEqual(pendingReadiness.isEligibleForAI, false, 'PENDING book must NOT be eligible for AI generation');
    assert.ok(pendingReadiness.reason.includes('غير مكتملة'), 'Reason must diagnose incomplete status');
    pass('Successful upload stub with PENDING status is strictly ineligible for exam generation');

    // ============================================================================
    // TEST 3: Missing embeddings quarantine
    // ============================================================================
    console.log('\n--- Test Group 3: Missing Embeddings Quarantine ---');
    const bookNoEmbedId = 'book_no_embeddings';
    const chNoEmbedId = 'ch_no_embeddings';

    await db.query(
      `INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, total_pages, processing_status)
       VALUES ($1, 'كتاب بدون متجهات', 'Book No Embeddings', $2, $3, $4, 60, 'COMPLETED')`,
      [bookNoEmbedId, stageId, gradeId, subjectId]
    );
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 1, 'الوحدة الأولى', 'Unit 1', 5, 25)`,
      [chNoEmbedId, bookNoEmbedId]
    );

    // Insert chunks with embedding = NULL
    for (let i = 1; i <= 5; i++) {
      await db.query(
        `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL)`,
        [`chk_no_embed_${i}`, bookNoEmbedId, chNoEmbedId, stageId, gradeId, subjectId, 10, i, `محتوى تعليمي درس ${i} بدون متجهات تضمين دلالية.`]
      );
    }

    const noEmbedReadiness = await ReadinessValidator.getUnitReadinessAsync(bookNoEmbedId, chNoEmbedId);

    // NEW BEHAVIOR: A book with sufficient text chunks but 0 embeddings is CONDITIONALLY_READY (BM25 path)
    // Only truly fails closed for: 0 chunks, <100 chars, invalid page range, out-of-range chunks
    assert.strictEqual(noEmbedReadiness.status, 'CONDITIONALLY_READY', 'Unit with valid text but 0/5 embeddings must be CONDITIONALLY_READY (BM25 path)');
    assert.strictEqual(noEmbedReadiness.isEligibleForAI, true, 'Unit with valid text is eligible for BM25 generation');
    assert.strictEqual(noEmbedReadiness.retrievalMode, 'EDUCATIONAL_BM25', 'Retrieval mode must be EDUCATIONAL_BM25');
    assert.ok(noEmbedReadiness.requiredActions.some(a => a.includes('تضمينات') || a.includes('متجه')), 'Required actions must include embedding guidance');
    pass('Book with valid text but 0% vector embeddings correctly routes to CONDITIONALLY_READY BM25 path (not quarantined, awaiting embedding generation)');

    // ============================================================================
    // TEST 4: Invalid chapter boundaries (start_page > end_page or out-of-range)
    // ============================================================================
    console.log('\n--- Test Group 4: Invalid Chapter Boundaries Rejection ---');
    const bookInvertedId = 'book_inverted_pages';
    const chInvertedId = 'ch_inverted_pages';

    await db.query(
      `INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, total_pages, processing_status)
       VALUES ($1, 'كتاب نطاق مقلوب', 'Inverted Book', $2, $3, $4, 80, 'COMPLETED')`,
      [bookInvertedId, stageId, gradeId, subjectId]
    );
    // start_page 40 > end_page 20!
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 1, 'الوحدة المقلوبة', 'Inverted Unit', 40, 20)`,
      [chInvertedId, bookInvertedId]
    );

    const invertedReadiness = await ReadinessValidator.getUnitReadinessAsync(bookInvertedId, chInvertedId);
    assert.strictEqual(invertedReadiness.status, 'BLOCKED', 'Inverted page range must be BLOCKED');
    assert.ok(invertedReadiness.reason.includes('نطاق صفحات الوحدة غير صالح'), 'Must diagnose invalid start > end');
    pass('Inverted chapter boundaries (start_page > end_page) blocked with clear diagnosis');

    // ============================================================================
    // TEST 5: Out-of-bounds chunks assignment rejection
    // ============================================================================
    console.log('\n--- Test Group 5: Out-of-Bounds Chunk Assignments Rejection ---');
    const bookOOBId = 'book_oob_test';
    const chOOBId = 'ch_oob_test';

    await db.query(
      `INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, total_pages, processing_status)
       VALUES ($1, 'كتاب مقاطع شاردة', 'OOB Book', $2, $3, $4, 100, 'COMPLETED')`,
      [bookOOBId, stageId, gradeId, subjectId]
    );
    // Unit is on pages 20-40
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 1, 'الوحدة المحصورة', 'Bounded Unit', 20, 40)`,
      [chOOBId, bookOOBId]
    );

    // Insert 4 chunks on page 25 (in bounds) + 2 chunks on page 2 (out of bounds)
    for (let i = 1; i <= 4; i++) {
      await db.query(
        `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, 25, $7, $8, $9)`,
        [`chk_in_${i}`, bookOOBId, chOOBId, stageId, gradeId, subjectId, i, `محتوى صالح درس ${i}`, JSON.stringify(new Array(768).fill(0.1))]
      );
    }
    // OOB chunks on page 2
    for (let i = 1; i <= 2; i++) {
      await db.query(
        `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, 2, $7, $8, $9)`,
        [`chk_oob_${i}`, bookOOBId, chOOBId, stageId, gradeId, subjectId, 10 + i, `محتوى شارد صفحة 2`, JSON.stringify(new Array(768).fill(0.1))]
      );
    }

    const oobReadiness = await ReadinessValidator.getUnitReadinessAsync(bookOOBId, chOOBId);
    assert.strictEqual(oobReadiness.status, 'BLOCKED', 'Unit with out-of-range chunks must be BLOCKED');
    assert.ok(oobReadiness.reason.includes('خارج النطاق'), 'Must report out-of-range chunks in diagnosis');
    pass('Chunks assigned to unit but located outside unit page boundary (page 2 vs 20-40) trigger BLOCKED');

    // ============================================================================
    // TEST 6: Partial ingestion / promotion failure preserves fail-closed safety
    // ============================================================================
    console.log('\n--- Test Group 6: Partial Ingestion & Error Propagation ---');
    const bookFailedId = 'book_failed_promotion';
    const chFailedId = 'ch_failed_promotion';

    await db.query(
      `INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, total_pages, processing_status, processing_error)
       VALUES ($1, 'كتاب معطل الترويج', 'Failed Promotion Book', $2, $3, $4, 70, 'FAILED', 'PERSISTENCE_FAILED: Disk full during staging')`,
      [bookFailedId, stageId, gradeId, subjectId]
    );
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 1, 'الوحدة الفاشلة', 'Failed Unit', 1, 20)`,
      [chFailedId, bookFailedId]
    );

    const failedReadiness = await ReadinessValidator.getUnitReadinessAsync(bookFailedId, chFailedId);
    assert.strictEqual(failedReadiness.status, 'BLOCKED', 'Failed book must be BLOCKED');
    assert.ok(failedReadiness.reason.includes('أخطاء معالجة'), 'Must diagnose processing error');
    pass('Failed ingestion leaves canonical book in FAILED status and blocked from exam generation');

    // ============================================================================
    // TEST 7: Fully compliant book passes all gates and achieves VERIFIED_READY
    // ============================================================================
    console.log('\n--- Test Group 7: Fully Compliant Book Verification ---');
    const bookHealthyId = 'book_healthy_compliant';
    const chHealthyId = 'ch_healthy_compliant';

    await db.query(
      `INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, total_pages, processing_status)
       VALUES ($1, 'كتاب القراءة المعتمد', 'Compliant Reading Book', $2, $3, $4, 60, 'COMPLETED')`,
      [bookHealthyId, stageId, gradeId, subjectId]
    );
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 1, 'الوحدة الأولى: القراءة', 'Unit 1: Reading', 10, 30)`,
      [chHealthyId, bookHealthyId]
    );

    // Insert 6 valid chunks on page 15-20 with 100% embeddings
    for (let i = 1; i <= 6; i++) {
      await db.query(
        `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, 18, $7, $8, $9)`,
        [`chk_healthy_${i}`, bookHealthyId, chHealthyId, stageId, gradeId, subjectId, i, `مفهوم تعليمي متكامل في مادة القراءة للدرس رقم ${i}.`, JSON.stringify(new Array(768).fill(0.05))]
      );
    }

    const healthyReadiness = await ReadinessValidator.getUnitReadinessAsync(bookHealthyId, chHealthyId);
    assert.strictEqual(healthyReadiness.status, 'VERIFIED_READY', 'Fully compliant unit must be VERIFIED_READY');
    assert.strictEqual(healthyReadiness.isEligibleForAI, true, 'Fully compliant unit must be eligible for AI');
    pass('Fully compliant book with 100% embeddings and zero defects is granted VERIFIED_READY');

    console.log('\n================================================================');
    console.log(`ALL ${passed} PHASE 3 FAIL-CLOSED INGESTION TESTS PASSED PERFECTLY!`);
    console.log('================================================================');
  } finally {
    teardownDisposableTestDb(db, disposable.tempDir);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
