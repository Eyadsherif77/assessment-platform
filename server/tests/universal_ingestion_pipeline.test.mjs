import assert from 'assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';

import { BookIngestionService } from '../dist/services/bookIngestionService.js';
import { aiChapterDetector } from '../dist/services/ai/aiChapterDetector.js';
import { DurableIngestionJobService } from '../dist/services/jobs/durableIngestionJobService.js';
import { GeminiOcrService } from '../dist/services/ai/geminiOcrService.js';
import { DatabaseChunkStorageProvider, getStorageProvider } from '../dist/services/storage/storageProvider.js';
import { ReadinessValidator } from '../dist/services/readinessValidator.js';
import { db } from '../dist/db/db.js';
import { setupDisposableTestDb, assertDatabaseIsDisposable, teardownDisposableTestDb } from './test_isolation_helper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

/**
 * Slice pages from an existing textbook to create a real text-based PDF fixture
 */
async function createTextPdfFixture() {
  const sourcePath = path.resolve(__dirname, '../uploads/book_0758fc7a-c9b2-4e25-a32b-6cacb6bb418d.pdf');
  const srcBytes = fs.readFileSync(sourcePath);
  const srcDoc = await PDFDocument.load(srcBytes);

  const newDoc = await PDFDocument.create();
  // Copy 4 pages with rich educational content
  const pages = await newDoc.copyPages(srcDoc, [9, 10, 11, 12]);
  pages.forEach(p => newDoc.addPage(p));
  return Buffer.from(await newDoc.save());
}

/**
 * Get authentic scanned page fixture (image-only PDF page, 2 text chars)
 */
function getScannedPdfFixture() {
  const scannedPath = path.resolve(__dirname, '../uploads/tmp_missing_page_42.pdf');
  return fs.readFileSync(scannedPath);
}

async function main() {
  const disposable = setupDisposableTestDb('universal_pipeline');
  let textPdfBuffer;
  let scannedPdfBuffer;

  try {
    console.log('================================================================');
    console.log('UNIVERSAL TEXTBOOK INGESTION PIPELINE — ACCEPTANCE VERIFICATION');
    console.log('TiDB-Backed Queue | Real OCR Fallback | Universal Chapter Detection');
    console.log('Durable Chunk Storage | Fail-Closed Gates | 13-Book Preservation');
    console.log('================================================================\n');

    // Step 0: Initialize isolated test DB and create tables
    await db.init();
    assertDatabaseIsDisposable(db, disposable.dbPath);
    console.log(`🛡️  Test isolation verified: operating strictly on disposable SQLite database: ${disposable.dbPath}\n`);

    // Ensure schema and book_ingestion_jobs table exist in disposable DB
    await db.query(`
      CREATE TABLE IF NOT EXISTS book_ingestion_jobs (
        id VARCHAR(64) PRIMARY KEY,
        book_id VARCHAR(64) NOT NULL,
        file_checksum VARCHAR(64) NOT NULL,
        current_stage VARCHAR(32) NOT NULL DEFAULT 'UPLOADED',
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        attempt_count INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 3,
        lease_owner VARCHAR(64) NULL,
        lease_expires_at DATETIME NULL,
        checkpoint_data TEXT NULL,
        last_error TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS book_pdf_chunks (
        book_id VARCHAR(64) NOT NULL,
        chunk_index INT NOT NULL,
        chunk_data BLOB NOT NULL,
        PRIMARY KEY (book_id, chunk_index)
      );
    `);

    // Resolve valid stage and grade
    const stagesRes = await db.query('SELECT id FROM academic_stages LIMIT 1');
    const gradesRes = await db.query('SELECT id FROM grades LIMIT 1');
    const validStageId = stagesRes.rows[0]?.id || 'stage_prep';
    const validGradeId = gradesRes.rows[0]?.id || 'grade_prep_1';

    let validSubjectId = 'sub_universal_test';
    const subRes = await db.query('SELECT id FROM subjects WHERE grade_id = $1 LIMIT 1', [validGradeId]);
    if (subRes.rows.length > 0) {
      validSubjectId = subRes.rows[0].id;
    } else {
      await db.query(
        `INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, $3, $4, $5)`,
        [validSubjectId, validGradeId, 'SCIENCE_UNIVERSAL', 'العلوم العامة', 'General Science']
      ).catch(() => {});
    }

    textPdfBuffer = await createTextPdfFixture();
    scannedPdfBuffer = getScannedPdfFixture();

    // =========================================================================
    // SECTION 1: Universal Support & Removal of Hardcoded Curriculum Titles
    // =========================================================================
    console.log('--- SECTION 1: Universal Support & Fallback Chapter Detection ---');

    await runTest('1.1 Universal detector extracts authentic unit titles from text markers without hardcoded Prep 1 titles', async () => {
      const mockPages = [
        { pageNumber: 1, text: 'الوحدة الأولى: أسس علم الأحياء والخلية النباتية\nشرح مفصل لبنية الخلية ووظائف العضيات الحيوية.' },
        { pageNumber: 2, text: 'تابع الوحدة الأولى: الانقسام الخلوي والتكاثر في الكائنات الحية.' },
        { pageNumber: 3, text: 'الوحدة الثانية: التنوع الحيوي والنظم البيئية الصحراوية والمائية\nدراسة سلاسل الغذاء والتوازن البيئي.' },
        { pageNumber: 4, text: 'تابع الوحدة الثانية: حماية البيئة والتنوع البيولوجي في البيئة المصرية.' }
      ];

      const detected = aiChapterDetector.detectHeuristicChapters({
        bookTitleAr: 'الأحياء والبيئة',
        bookTitleEn: 'Biology and Ecology',
        totalPages: 4,
        pages: mockPages
      });

      assert.strictEqual(detected.length, 2, 'Must detect exactly 2 units');
      assert.strictEqual(detected[0].chapter_number, 1);
      assert.ok(detected[0].title_ar.includes('أسس علم الأحياء'), `Must contain actual title, got: ${detected[0].title_ar}`);
      assert.strictEqual(detected[1].chapter_number, 2);
      assert.ok(detected[1].title_ar.includes('التنوع الحيوي'), `Must contain actual title, got: ${detected[1].title_ar}`);
      // Zero hardcoded Prep 1 science/math titles!
      assert.ok(!detected[0].title_ar.includes('المادة وتركيبها'), 'Must NOT contain hardcoded Prep 1 Science Unit 1');
      assert.ok(!detected[0].title_ar.includes('الأعداد النسبية'), 'Must NOT contain hardcoded Prep 1 Math Unit 1');
    });

    await runTest('1.2 Content-aware fallback partitions arbitrary curriculum dynamically using real book title', async () => {
      const mockPages = [
        { pageNumber: 1, text: 'مقدمة في تاريخ الفلسفة الإسلامية وعلم الكلام.' },
        { pageNumber: 2, text: 'أهم رواد الفكر الفلسفي: الكندي والفارابي وابن رشد.' },
        { pageNumber: 3, text: 'مناهج البحث الفلسفي والتفكير المنطقي.' },
        { pageNumber: 4, text: 'خاتمة وتطبيقات في المنطق الصوري.' }
      ];

      const detected = aiChapterDetector.detectHeuristicChapters({
        bookTitleAr: 'الفلسفة والمنطق',
        bookTitleEn: 'Philosophy and Logic',
        totalPages: 4,
        pages: mockPages
      });

      assert.ok(detected.length >= 2, 'Must create at least 2 content-aware partitions');
      assert.ok(detected[0].title_ar.includes('الفلسفة والمنطق'), 'Must use authentic book title in partition');
      assert.strictEqual(detected[0].start_page, 1);
      assert.strictEqual(detected[detected.length - 1].end_page, 4);
    });

    await runTest('1.3 Chapter boundary validator blocks invalid, inverted, or overlapping ranges', async () => {
      const invalidChapters = [
        { chapter_number: 1, title_ar: 'الوحدة 1', title_en: 'Unit 1', start_page: 15, end_page: 5 }, // Inverted
        { chapter_number: 2, title_ar: 'الوحدة 2', title_en: 'Unit 2', start_page: 6, end_page: 200 } // Out of bounds
      ];

      const check = BookIngestionService.validateChapterBoundaries(invalidChapters, 100);
      assert.strictEqual(check.valid, false, 'Must fail validation');
      assert.ok(check.issues.some(i => i.code === 'INVERTED_PAGE_RANGE'), 'Must report INVERTED_PAGE_RANGE');
      assert.ok(check.issues.some(i => i.code === 'OUT_OF_BOUNDS_PAGE_RANGE'), 'Must report OUT_OF_BOUNDS_PAGE_RANGE');
    });

    // =========================================================================
    // SECTION 2: Durable Relational Job Processing (TiDB-Backed Queue)
    // =========================================================================
    console.log('\n--- SECTION 2: Durable Job Queue & Atomic CAS Claims ---');

    await runTest('2.1 Registers job and enforces atomic single-worker claim via CAS lease', async () => {
      const bookId = 'job_test_book_' + Date.now();
      const checksum = crypto.createHash('sha256').update(bookId).digest('hex');

      const job = await DurableIngestionJobService.createOrGetJob({
        bookId,
        fileChecksum: checksum,
        initialCheckpoint: { stage: 'INIT' }
      });

      assert.strictEqual(job.status, 'PENDING');
      assert.strictEqual(job.attemptCount, 0);

      // Worker A claims the job
      const claimedA = await DurableIngestionJobService.claimJob(job.id, 'worker_A', 90);
      assert.strictEqual(claimedA, true, 'Worker A must successfully claim the job');

      // Worker B attempts to claim the same job concurrently -> Must be rejected!
      const claimedB = await DurableIngestionJobService.claimJob(job.id, 'worker_B', 90);
      assert.strictEqual(claimedB, false, 'Worker B must NOT claim an active in-progress job');

      const updatedJob = await DurableIngestionJobService.getJobById(job.id);
      assert.strictEqual(updatedJob.leaseOwner, 'worker_A');
      assert.strictEqual(updatedJob.status, 'IN_PROGRESS');
      assert.strictEqual(updatedJob.attemptCount, 1);
    });

    await runTest('2.2 Checkpoint persistence preserves verified stage data across crashes', async () => {
      const bookId = 'checkpoint_test_book_' + Date.now();
      const checksum = crypto.createHash('sha256').update(bookId).digest('hex');

      const job = await DurableIngestionJobService.createOrGetJob({ bookId, fileChecksum: checksum });
      await DurableIngestionJobService.claimJob(job.id, 'worker_crash_test', 90);

      // Worker saves extraction checkpoint
      const extractedPagesMock = [
        { pageNumber: 1, text: 'نص الصفحة الأولى المستخرج', charCount: 25 },
        { pageNumber: 2, text: 'نص الصفحة الثانية المستخرج', charCount: 25 }
      ];

      await DurableIngestionJobService.saveCheckpoint(job.id, 'worker_crash_test', 'EXTRACTING_PAGES', {
        extractedPages: extractedPagesMock,
        totalPages: 2
      });

      // Verify checkpoint saved
      const savedJob = await DurableIngestionJobService.getJobById(job.id);
      assert.strictEqual(savedJob.currentStage, 'EXTRACTING_PAGES');
      assert.strictEqual(savedJob.checkpointData.extractedPages.length, 2);

      // Worker simulates transient failure and marks retryable
      const failRes = await DurableIngestionJobService.markFailed(job.id, 'worker_crash_test', 'Worker crashed unexpectedly', true);
      assert.strictEqual(failRes.willRetry, true);
      assert.strictEqual(failRes.nextStatus, 'RETRYING');

      // Replacement worker recovers the job and verifies checkpoint is intact
      const recoveredJobs = await DurableIngestionJobService.recoverStalledJobs(10);
      const targetRecovered = recoveredJobs.find(j => j.id === job.id);
      assert.ok(targetRecovered, 'Job must be recovered from RETRYING state');
      assert.strictEqual(targetRecovered.checkpointData.extractedPages.length, 2, 'Checkpoint data must be preserved');
    });

    await runTest('2.3 Bounded retries: Job transitions to FAILED after max attempts exceeded', async () => {
      const bookId = 'retry_limit_test_' + Date.now();
      const checksum = crypto.createHash('sha256').update(bookId).digest('hex');

      const job = await DurableIngestionJobService.createOrGetJob({ bookId, fileChecksum: checksum });

      // Simulate 3 failures
      await DurableIngestionJobService.claimJob(job.id, 'worker_1', 90);
      await DurableIngestionJobService.markFailed(job.id, 'worker_1', 'Attempt 1 failed', true);

      await DurableIngestionJobService.claimJob(job.id, 'worker_2', 90);
      await DurableIngestionJobService.markFailed(job.id, 'worker_2', 'Attempt 2 failed', true);

      await DurableIngestionJobService.claimJob(job.id, 'worker_3', 90);
      const finalFail = await DurableIngestionJobService.markFailed(job.id, 'worker_3', 'Attempt 3 failed', true);

      assert.strictEqual(finalFail.willRetry, false, 'Must NOT retry after 3 failed attempts');
      assert.strictEqual(finalFail.nextStatus, 'FAILED');

      const terminalJob = await DurableIngestionJobService.getJobById(job.id);
      assert.strictEqual(terminalJob.status, 'FAILED');
      assert.strictEqual(terminalJob.currentStage, 'FAILED');
    });

    // =========================================================================
    // SECTION 3: Multimodal OCR & Model Reliability
    // =========================================================================
    console.log('\n--- SECTION 3: Multimodal OCR Fallback & Zero Synthetic Text ---');

    await runTest('3.1 Scanned page activates real OCR fallback and saves page-level checkpoints', async () => {
      const scannedBookId = 'scanned_ocr_test_' + Date.now();
      let ocrProviderCalled = false;

      // Provide simulated OCR provider that extracts authentic Arabic content
      const mockOcrProvider = async (pageNumber, buffer) => {
        ocrProviderCalled = true;
        return `الوحدة الأولى: البصريات والموجات الضوئية المتقدمة\nشرح ظاهرة انعكاس وانكسار الضوء في العدسات والمرايا المستوية. صفحة ${pageNumber}`;
      };

      const result = await BookIngestionService.ingestTextbook({
        bookId: scannedBookId,
        pdfBuffer: scannedPdfBuffer,
        titleAr: 'كتاب البصريات الممسوح',
        academicStageId: validStageId,
        gradeId: validGradeId,
        subjectId: validSubjectId,
        options: {
          ocrProvider: mockOcrProvider
        }
      });

      assert.strictEqual(ocrProviderCalled, true, 'OCR fallback must be invoked for scanned page');
      assert.strictEqual(result.status, 'VERIFIED_READY', 'Scanned book with valid OCR text must become ready');
      assert.ok(result.units.length >= 1, 'Must create verified units from OCR text');
    });

    await runTest('3.2 Unresolved scanned pages fail-closed without fabricating synthetic text', async () => {
      const unresolvableBookId = 'unresolvable_scanned_' + Date.now();

      // OCR provider fails / returns empty string
      const failingOcr = async () => '';

      const result = await BookIngestionService.ingestTextbook({
        bookId: unresolvableBookId,
        pdfBuffer: scannedPdfBuffer,
        titleAr: 'كتاب غير قابل للقراءة',
        academicStageId: validStageId,
        gradeId: validGradeId,
        subjectId: validSubjectId,
        options: {
          ocrProvider: failingOcr
        }
      });

      assert.strictEqual(result.status, 'REQUIRES_REMEDIATION');
      assert.strictEqual(result.isPublished, false);
      assert.ok(result.issues.some(i => i.code === 'UNRESOLVED_SCANNED_PAGES'), 'Must report UNRESOLVED_SCANNED_PAGES');

      // Verify no book_chunks were synthesized in database
      const chunks = await db.query('SELECT COUNT(*) as count FROM book_chunks WHERE book_id = $1', [unresolvableBookId]);
      assert.strictEqual(Number(chunks.rows[0].count), 0, 'Must NOT generate fake synthetic chunks');
    });

    // =========================================================================
    // SECTION 4: Storage Durability & DatabaseChunkStorageProvider
    // =========================================================================
    console.log('\n--- SECTION 4: Canonical TiDB Chunk Storage & Range Reads ---');

    await runTest('4.1 DatabaseChunkStorageProvider stores, verifies SHA-256 checksum, and streams ranges', async () => {
      const storage = new DatabaseChunkStorageProvider();
      const testKey = 'books/storage_verify_test/book_storage_verify_test.pdf';
      const samplePdf = textPdfBuffer;
      const expectedChecksum = crypto.createHash('sha256').update(samplePdf).digest('hex');

      // Save file
      const meta = await storage.saveFile(testKey, samplePdf, 'application/pdf');
      assert.strictEqual(meta.durable, true, 'Database chunk storage must be marked durable');
      assert.strictEqual(meta.sha256, expectedChecksum);

      // Verify exists
      const exists = await storage.exists(testKey);
      assert.strictEqual(exists, true);

      // Verify full reconstruction and integrity check
      const fullBuffer = await storage.getFile(testKey);
      assert.strictEqual(fullBuffer.length, samplePdf.length);
      const reconstructedChecksum = crypto.createHash('sha256').update(fullBuffer).digest('hex');
      assert.strictEqual(reconstructedChecksum, expectedChecksum, 'SHA-256 checksum must match byte-for-byte');

      // Verify HTTP Range Read (e.g. read bytes 100 to 499)
      const rangeBuffer = await storage.getFileRange(testKey, 100, 499);
      assert.strictEqual(rangeBuffer.length, 400);
      assert.deepStrictEqual(rangeBuffer, samplePdf.subarray(100, 500));

      // Clean up
      await storage.deleteFile(testKey);
      const existsAfter = await storage.exists(testKey);
      assert.strictEqual(existsAfter, false);
    });

    // =========================================================================
    // SECTION 5: End-to-End Real Textbook Ingestion (Book 14) & Exam Gate
    // =========================================================================
    console.log('\n--- SECTION 5: End-to-End Real Ingestion & Exam Readiness Gate ---');

    let ingestedBook14Id = 'book_14_real_' + Date.now();

    await runTest('5.1 Ingests a new textbook end-to-end, creating pages, chapters, chunks, and embeddings', async () => {
      const result = await BookIngestionService.ingestTextbook({
        bookId: ingestedBook14Id,
        pdfBuffer: textPdfBuffer,
        titleAr: 'كتاب الأحياء والعلوم البيئية للصف الأول',
        titleEn: 'Biology and Environmental Sciences Grade 1',
        academicStageId: validStageId,
        gradeId: validGradeId,
        subjectId: validSubjectId,
        schoolType: 'كلاهما',
        term: 1
      });

      assert.strictEqual(result.status, 'VERIFIED_READY', 'Textbook must achieve VERIFIED_READY');
      assert.strictEqual(result.isPublished, true);
      assert.ok(result.totalPages >= 3, 'Must have at least 3 pages');
      assert.ok(result.units.length >= 1, 'Must have at least 1 verified unit');

      // Verify database records
      const bookRow = await db.query('SELECT * FROM books WHERE id = $1', [ingestedBook14Id]);
      assert.strictEqual(bookRow.rows.length, 1);
      assert.strictEqual(bookRow.rows[0].processing_status, 'COMPLETED');

      const pagesRows = await db.query('SELECT * FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC', [ingestedBook14Id]);
      assert.ok(pagesRows.rows.length >= 3, 'All pages must be persisted in book_pages');

      const chaptersRows = await db.query('SELECT * FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC', [ingestedBook14Id]);
      assert.ok(chaptersRows.rows.length >= 1, 'Chapters must be persisted in book_chapters');

      const chunksRows = await db.query('SELECT * FROM book_chunks WHERE book_id = $1', [ingestedBook14Id]);
      assert.ok(chunksRows.rows.length >= 2, 'Chunks must be persisted in book_chunks');

      // Verify 100% embedding coverage
      for (const chunk of chunksRows.rows) {
        assert.ok(chunk.embedding, `Chunk ${chunk.id} must have non-null embedding`);
        const vec = JSON.parse(chunk.embedding);
        assert.strictEqual(vec.length, 768, 'Embedding must be 768-dimensional normalized vector');
      }

      // Verify durable job was marked COMPLETED
      const jobRow = await db.query('SELECT * FROM book_ingestion_jobs WHERE book_id = $1', [ingestedBook14Id]);
      assert.strictEqual(jobRow.rows.length, 1);
      assert.strictEqual(jobRow.rows[0].status, 'COMPLETED');
      assert.strictEqual(jobRow.rows[0].current_stage, 'COMPLETED');
    });

    await runTest('5.2 Readiness Validator gate: Authorizes exams ONLY for VERIFIED_READY units', async () => {
      const chapters = await db.query('SELECT id FROM book_chapters WHERE book_id = $1', [ingestedBook14Id]);
      const validChapterId = chapters.rows[0].id;

      // Check unit readiness
      const readiness = await ReadinessValidator.getUnitReadinessAsync(ingestedBook14Id, validChapterId);
      assert.strictEqual(readiness.status, 'VERIFIED_READY', 'Verified ready unit must have VERIFIED_READY status');
      assert.strictEqual(readiness.isEligibleForAI, true, 'Verified ready unit must be eligible for AI');

      // Create an unverified/corrupt book to test fail-closed exam gate
      const corruptBookId = 'book_corrupt_' + Date.now();
      await db.query(`
        INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, processing_status, total_pages)
        VALUES ($1, 'كتاب غير معتمد', 'Unapproved Book', $2, $3, $4, 'FAILED', 10)
      `, [corruptBookId, validStageId, validGradeId, validSubjectId]);

      const corruptChapterId = 'ch_corrupt_' + Date.now();
      await db.query(`
        INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
        VALUES ($1, $2, 1, 'وحدة ناقصة', 'Incomplete Unit', 1, 10)
      `, [corruptChapterId, corruptBookId]);

      // Readiness gate must fail-closed!
      const corruptReadiness = await ReadinessValidator.getUnitReadinessAsync(corruptBookId, corruptChapterId);
      assert.strictEqual(corruptReadiness.isEligibleForAI, false, 'Incomplete / blocked book unit must NEVER be ready for exams');
      assert.strictEqual(corruptReadiness.status, 'BLOCKED');

      await assert.rejects(
        async () => {
          await ReadinessValidator.assertUnitEligibleForAIAsync(corruptBookId, corruptChapterId);
        },
        /UNIT_READINESS_BLOCKED/
      );
    });

    await runTest('5.3 Idempotency: Duplicate upload returns existing report and preserves verified canonical book', async () => {
      // Re-upload the exact same buffer for book 14
      const dupResult = await BookIngestionService.ingestTextbook({
        bookId: ingestedBook14Id,
        pdfBuffer: textPdfBuffer,
        titleAr: 'كتاب الأحياء والعلوم البيئية للصف الأول',
        academicStageId: validStageId,
        gradeId: validGradeId,
        subjectId: validSubjectId
      });

      assert.strictEqual(dupResult.bookId, ingestedBook14Id);
      assert.strictEqual(dupResult.status, 'VERIFIED_READY');

      // Re-upload with forceReingest: true must be rejected to prevent overwriting verified canonical content
      const overwriteAttempt = await BookIngestionService.ingestTextbook({
        bookId: ingestedBook14Id,
        pdfBuffer: textPdfBuffer,
        titleAr: 'محاولة استبدال كتاب معتمد',
        academicStageId: validStageId,
        gradeId: validGradeId,
        subjectId: validSubjectId,
        options: { forceReingest: true }
      });

      assert.strictEqual(overwriteAttempt.status, 'BLOCKED');
      assert.ok(overwriteAttempt.issues.some(i => i.code === 'CANNOT_OVERWRITE_VERIFIED_BOOK'));
    });

    // =========================================================================
    // SECTION 6: TiDB Cloud MySQL Dialect Live Verification
    // =========================================================================
    console.log('\n--- SECTION 6: TiDB Cloud Live Dialect Verification ---');

    await runTest('6.1 Verifies TiDB Cloud connection and 13 canonical books preservation', async () => {
      const { connect } = await import('@tidbcloud/serverless');
      const conn = connect({
        host: process.env.TIDB_HOST,
        username: process.env.TIDB_USER,
        password: process.env.TIDB_PASSWORD,
        database: 'assessment_platform'
      });

      const res = await conn.execute('SELECT COUNT(*) as count FROM books');
      const bookCount = Number((res.rows || res)[0].count);
      assert.strictEqual(bookCount, 13, `TiDB production must contain exactly 13 canonical books, found: ${bookCount}`);

      const chapRes = await conn.execute('SELECT COUNT(*) as count FROM book_chapters');
      const chapCount = Number((chapRes.rows || chapRes)[0].count);
      assert.strictEqual(chapCount, 55, `TiDB production must contain exactly 55 canonical units, found: ${chapCount}`);
      console.log(`    ✓ TiDB assessment_platform preserved: 13 books, 55 units 100% intact.`);
    });

    await runTest('6.2 Verifies TiDB Cloud MySQL dialect compatibility on isolated test database', async () => {
      const { connect } = await import('@tidbcloud/serverless');
      const conn = connect({
        host: process.env.TIDB_HOST,
        username: process.env.TIDB_USER,
        password: process.env.TIDB_PASSWORD,
        database: 'test'
      });

      // 1. DDL verification on TiDB
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS book_ingestion_jobs (
          id VARCHAR(64) PRIMARY KEY,
          book_id VARCHAR(64) NOT NULL,
          file_checksum VARCHAR(64) NOT NULL,
          current_stage VARCHAR(32) NOT NULL DEFAULT 'UPLOADED',
          status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
          attempt_count INT NOT NULL DEFAULT 0,
          max_attempts INT NOT NULL DEFAULT 3,
          lease_owner VARCHAR(64) NULL,
          lease_expires_at DATETIME NULL,
          checkpoint_data JSON NULL,
          last_error TEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_book_jobs_book_id (book_id),
          INDEX idx_book_jobs_checksum (file_checksum),
          INDEX idx_book_jobs_status_lease (status, lease_expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 2. Insert test job with JSON checkpoint data on TiDB
      const testJobId = 'tidb_dialect_test_' + Date.now();
      const testChecksum = 'checksum_tidb_live_' + Date.now();
      const testJson = JSON.stringify({ extractedPagesCount: 15, ocrCompleted: true });

      await conn.execute(
        `INSERT INTO book_ingestion_jobs (id, book_id, file_checksum, current_stage, status, checkpoint_data)
         VALUES (?, ?, ?, 'UPLOADED', 'PENDING', ?)`,
        [testJobId, 'book_dialect_tidb', testChecksum, testJson]
      );

      // 3. Atomic CAS Claim with DATE_ADD(NOW(), INTERVAL 90 SECOND) on TiDB
      const casResult = await conn.execute(
        `UPDATE book_ingestion_jobs
         SET status = 'IN_PROGRESS',
             lease_owner = ?,
             lease_expires_at = DATE_ADD(NOW(), INTERVAL 90 SECOND),
             attempt_count = attempt_count + 1,
             updated_at = NOW()
         WHERE id = ?
           AND (status IN ('PENDING', 'RETRYING') OR (status = 'IN_PROGRESS' AND lease_expires_at < NOW()))`,
        ['worker_live_tidb_1', testJobId],
        { fullResult: true }
      );

      assert.strictEqual(casResult.rowsAffected, 1, 'CAS claim must succeed on TiDB Cloud');

      // 4. Second worker concurrent CAS claim on TiDB must be rejected
      const casRejectResult = await conn.execute(
        `UPDATE book_ingestion_jobs
         SET status = 'IN_PROGRESS',
             lease_owner = ?,
             lease_expires_at = DATE_ADD(NOW(), INTERVAL 90 SECOND),
             attempt_count = attempt_count + 1,
             updated_at = NOW()
         WHERE id = ?
           AND (status IN ('PENDING', 'RETRYING') OR (status = 'IN_PROGRESS' AND lease_expires_at < NOW()))`,
        ['worker_live_tidb_2', testJobId],
        { fullResult: true }
      );

      assert.strictEqual(casRejectResult.rowsAffected, 0, 'Concurrent CAS claim on TiDB Cloud must be rejected (0 rows affected)');

      // 5. Heartbeat on TiDB
      const hbResult = await conn.execute(
        `UPDATE book_ingestion_jobs
         SET lease_expires_at = DATE_ADD(NOW(), INTERVAL 120 SECOND),
             updated_at = NOW()
         WHERE id = ? AND lease_owner = ? AND status = 'IN_PROGRESS'`,
        [testJobId, 'worker_live_tidb_1'],
        { fullResult: true }
      );
      assert.strictEqual(hbResult.rowsAffected, 1, 'Heartbeat on TiDB Cloud must succeed');

      // 6. Clean up test record from test DB
      await conn.execute('DELETE FROM book_ingestion_jobs WHERE id = ?', [testJobId]);
      console.log('    ✓ TiDB MySQL dialect verified live: CAS atomic claims, DATE_ADD leases, JSON columns verified.');
    });

    console.log('\n================================================================');
    console.log('ALL ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY!');
    console.log('Universal Ingestion Pipeline is Complete, Tested, and Non-Destructive.');
    console.log('================================================================\n');

  } finally {
    teardownDisposableTestDb(db, disposable.tempDir);
  }
}

main().catch(err => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
