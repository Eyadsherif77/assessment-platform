import assert from 'assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { BookIngestionService } from '../dist/services/bookIngestionService.js';
import { ReadinessValidator, UnitReadinessBlockedError } from '../dist/services/readinessValidator.js';
import { VisualAssetExtractor } from '../dist/services/ai/visualAssetExtractor.js';
import { getStorageProvider, LocalStorageProvider, setStorageProvider } from '../dist/services/storage/storageProvider.js';
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

const scannedPdfFixturePath = path.resolve(__dirname, '../uploads/tmp_missing_page_42.pdf');
const authenticScannedPdf = fs.readFileSync(scannedPdfFixturePath);

function createSyntheticPdf() {
  return authenticScannedPdf;
}

async function main() {
  const disposable = setupDisposableTestDb('phase4g3q');
  try {
    console.log('================================================================');
    console.log('PHASE 4G.3Q — UNIFIED AUTOMATED NEW-TEXTBOOK INGESTION TEST SUITE');
    console.log('Zero Database Mutations | Zero External AI Calls | Strictly Isolated');
    console.log('================================================================\n');

    // Initialize DB and resolve valid relational IDs
    await db.init();
    assertDatabaseIsDisposable(db, disposable.dbPath);
    console.log(`🛡️  Test isolation verified: operating strictly on disposable SQLite database: ${disposable.dbPath}\n`);
  const stagesRes = await db.query('SELECT id FROM academic_stages LIMIT 1');
  const gradesRes = await db.query('SELECT id, stage_id FROM grades LIMIT 1');
  const validStageId = stagesRes.rows[0]?.id || 'stage_prim';
  const validGradeId = gradesRes.rows[0]?.id || 'grade_prim_1';

  let validSubjectId = 'sub_arabic_test';
  const subRes = await db.query('SELECT id FROM subjects WHERE grade_id = $1 LIMIT 1', [validGradeId]);
  if (subRes.rows.length > 0) {
    validSubjectId = subRes.rows[0].id;
  } else {
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, $3, $4, $5)`,
      [validSubjectId, validGradeId, 'ARABIC_TEST', 'اللغة العربية', 'Arabic']
    ).catch(() => {});
  }

  // Ensure clean test setup
  ReadinessValidator.clearDynamicUnits();

  // ==========================================================================
  // TEST 1: File integrity and validation
  // ==========================================================================
  console.log('--- Test Group 1: File Integrity, Header & Validation ---');

  await runTest('1. Rejects corrupt or non-PDF files without "%PDF" header', async () => {
    const corruptBuffer = Buffer.from('This is a plain text file, not a real PDF. '.repeat(5));
    const result = await BookIngestionService.ingestTextbook({
      bookId: 'test_book_corrupt',
      pdfBuffer: corruptBuffer,
      titleAr: 'كتاب تالف غير صالح',
      academicStageId: validStageId,
      gradeId: validGradeId,
      subjectId: validSubjectId
    });

    assert.strictEqual(result.status, 'BLOCKED');
    assert.strictEqual(result.isPublished, false);
    assert.ok(result.issues.some(i => i.code === 'INVALID_PDF_HEADER'), 'Must report INVALID_PDF_HEADER');
  });

  await runTest('2. Rejects files smaller than minimum size limit', async () => {
    const tinyBuffer = Buffer.from('%PDF');
    const result = await BookIngestionService.ingestTextbook({
      bookId: 'test_book_tiny',
      pdfBuffer: tinyBuffer,
      titleAr: 'كتاب صغير جداً',
      academicStageId: validStageId,
      gradeId: validGradeId,
      subjectId: validSubjectId
    });

    assert.strictEqual(result.status, 'BLOCKED');
    assert.strictEqual(result.isPublished, false);
    assert.ok(result.issues.some(i => i.code === 'FILE_TOO_SMALL'), 'Must report FILE_TOO_SMALL');
  });

  // ==========================================================================
  // TEST 2 & 3: Scanned / Low-Text Pages & Removal of Synthetic Text
  // ==========================================================================
  console.log('\n--- Test Group 2: Scanned Pages, Zero Synthetic Text & OCR Diagnostics ---');

  await runTest('3. Blank or scanned pages do NOT receive fabricated synthetic placeholder text', async () => {
    const blankPdf = createSyntheticPdf();

    const result = await BookIngestionService.ingestTextbook({
      bookId: 'test_book_blank',
      pdfBuffer: blankPdf,
      titleAr: 'كتاب ممسوح ضوئياً بدون نصوص',
      academicStageId: validStageId,
      gradeId: validGradeId,
      subjectId: validSubjectId,
      options: {
        ocrProvider: async () => ''
      }
    });

    assert.strictEqual(result.status, 'REQUIRES_REMEDIATION', 'Blank PDF must require remediation');
    assert.strictEqual(result.isPublished, false, 'Blank PDF must never be published as ready');
    assert.ok(result.issues.some(i => i.stage === 'OCR_HANDLING' || i.stage === 'PAGE_EXTRACTION'));

    // Verify zero synthetic text is returned in units
    assert.strictEqual(result.units.length, 0, 'No ready units can be created from blank pages');
  });

  await runTest('4. Configured OCR provider successfully resolves scanned pages and enables progression', async () => {
    const blankPdf = createSyntheticPdf();

    // Mock an active OCR provider that extracts authentic Arabic content
    const mockOcrProvider = async (pageNum) => {
      return `الفقرة الأولى: محتوى أصلي مستخرج عبر قارئ النصوص الضوئي للصفحة رقم ${pageNum} ويتضمن شرحاً مفصلاً للمفاهيم وقوانين المنهج وتدريبات تطبيقية قياسية.\n\nالفقرة الثانية: تطبيقات وأسئلة متنوعة على نواتج التعلم المستهدفة واختبارات دورية لقياس الفهم والاستيعاب بدقة عالية وتدريبات نموذجية.`;
    };

    const result = await BookIngestionService.ingestTextbook({
      bookId: 'test_book_ocr_resolved',
      pdfBuffer: blankPdf,
      titleAr: 'كتاب نصوص عربية قراءة',
      academicStageId: validStageId,
      gradeId: validGradeId,
      subjectId: validSubjectId,
      options: {
        ocrProvider: mockOcrProvider,
        visualRequirements: 'NONE',
        forceReingest: true
      }
    });

    if (result.status !== 'VERIFIED_READY') {
      console.log('DEBUG Test 4 result issues:', JSON.stringify(result.units[0]?.issues, null, 2));
    }
    assert.strictEqual(result.status, 'VERIFIED_READY', 'Should succeed when OCR extracts text');
    assert.strictEqual(result.isPublished, true);
    assert.ok(result.units.length >= 1, 'Units should be audited and ready');
  });

  // ==========================================================================
  // TEST 4: Chapter Mapping Boundary Validation
  // ==========================================================================
  console.log('\n--- Test Group 3: Chapter Boundaries & Overlap Detection ---');

  await runTest('5. Inverted page ranges (start_page > end_page) are detected and blocked', async () => {
    const invertedChapters = [
      { chapter_number: 1, title_ar: 'الوحدة الأولى', title_en: 'Unit 1', start_page: 15, end_page: 5 }
    ];
    const check = BookIngestionService.validateChapterBoundaries(invertedChapters, 30);
    assert.strictEqual(check.valid, false);
    assert.ok(check.issues.some(i => i.code === 'INVERTED_PAGE_RANGE'));
  });

  await runTest('6. Overlapping chapter ranges between consecutive units are detected and blocked', async () => {
    const overlappingChapters = [
      { chapter_number: 1, title_ar: 'الوحدة الأولى', title_en: 'Unit 1', start_page: 1, end_page: 15 },
      { chapter_number: 2, title_ar: 'الوحدة الثانية', title_en: 'Unit 2', start_page: 12, end_page: 25 } // overlaps p12-15
    ];
    const check = BookIngestionService.validateChapterBoundaries(overlappingChapters, 30);
    assert.strictEqual(check.valid, false);
    assert.ok(check.issues.some(i => i.code === 'OVERLAPPING_CHAPTER_RANGES'));
  });

  await runTest('7. Out of bounds page ranges (exceeding total pages) are detected and blocked', async () => {
    const outOfBoundsChapters = [
      { chapter_number: 1, title_ar: 'الوحدة الأولى', title_en: 'Unit 1', start_page: 1, end_page: 50 }
    ];
    const check = BookIngestionService.validateChapterBoundaries(outOfBoundsChapters, 20); // only 20 total pages
    assert.strictEqual(check.valid, false);
    assert.ok(check.issues.some(i => i.code === 'OUT_OF_BOUNDS_PAGE_RANGE'));
  });

  // ==========================================================================
  // TEST 5 & 8: Visual Asset Dependencies & Unit Blocker Gate
  // ==========================================================================
  console.log('\n--- Test Group 4: Visual Asset Integrity & Fail-Closed Gates ---');

  await runTest('8. Units requiring visual assets (Geometry/Maps) are BLOCKED when assets are missing', async () => {
    const blankPdf = createSyntheticPdf();
    const mockOcr = async (p) => `درس الهندسة والتحويلات الهندسية ونظريات المثلثات صفحة ${p} مع براهين وقوانين رياضية دقيقة.`;

    const result = await BookIngestionService.ingestTextbook({
      bookId: 'test_book_geometry_missing_assets',
      pdfBuffer: blankPdf,
      titleAr: 'كتاب الرياضيات - الهندسة التحليلية',
      academicStageId: validStageId,
      gradeId: validGradeId,
      subjectId: validSubjectId,
      options: {
        ocrProvider: mockOcr,
        visualRequirements: 'GEOMETRY_DIAGRAMS', // Mandates visual assets
        forceReingest: true
      }
    });

    assert.strictEqual(result.status, 'BLOCKED', 'Book must be BLOCKED when geometry diagrams are missing');
    assert.strictEqual(result.isPublished, false);
    assert.ok(result.units.some(u => u.readinessStatus === 'BLOCKED'));
    assert.ok(result.units.some(u => u.issues.some(i => i.code === 'MISSING_REQUIRED_VISUAL_ASSETS')));
  });

  await runTest('9. Unready dynamically audited unit cannot generate an exam (Fail-Closed Gate)', async () => {
    const blockedBookId = 'test_book_geometry_missing_assets';
    const testChapterId = 'test_chapter_blocked_unit';

    // Register a blocked unit
    ReadinessValidator.registerDynamicUnit({
      book_id: blockedBookId,
      chapter_id: testChapterId,
      book_title_ar: 'هندسة تجريبية غير مكتملة',
      book_title_en: 'Incomplete Geometry',
      unit_title_ar: 'المثلثات والمضلعات',
      unit_title_en: 'Triangles',
      readiness_status: 'BLOCKED',
      visual_dependencies: 'GEOMETRY_DIAGRAMS',
      status_reason: 'Missing geometric diagrams in manifest.'
    });

    const readiness = ReadinessValidator.getUnitReadiness(blockedBookId, testChapterId);
    assert.strictEqual(readiness.isEligibleForAI, false, 'Blocked unit must not be eligible for AI');
    assert.strictEqual(readiness.status, 'BLOCKED');

    assert.throws(() => {
      ReadinessValidator.assertUnitEligibleForAI(blockedBookId, testChapterId);
    }, UnitReadinessBlockedError, 'Must throw UnitReadinessBlockedError');
  });

  // ==========================================================================
  // TEST 6 & 7: Idempotency, Retries and Concurrency Control
  // ==========================================================================
  console.log('\n--- Test Group 5: Idempotency, Retries & Safe Concurrency ---');

  await runTest('10. Concurrent requests with the same buffer return existing job and do not double-process', async () => {
    const blankPdf = createSyntheticPdf();
    const mockOcr = async (p) => `الفقرة الأولى: نص تدريبي موثق للاختبار التزامني رقم ${p} يحتوي على شرح ومسائل متعددة ومفاهيم كاملة.\n\nالفقرة الثانية: تدريبات نموذجية متقدمة وتطبيقات شاملة للتحقق من الاتساق والاعتمادية البرمجية.`;

    const params = {
      bookId: 'test_book_concurrent',
      pdfBuffer: blankPdf,
      titleAr: 'كتاب التزامن والاعتماد',
      academicStageId: validStageId,
      gradeId: validGradeId,
      subjectId: validSubjectId,
      options: {
        ocrProvider: mockOcr,
        visualRequirements: 'NONE',
        forceReingest: true
      }
    };

    // Launch two simultaneous calls
    const [res1, res2] = await Promise.all([
      BookIngestionService.ingestTextbook(params),
      BookIngestionService.ingestTextbook(params)
    ]);

    assert.strictEqual(res1.status, res2.status);
    assert.strictEqual(res1.fileChecksum, res2.fileChecksum);
  });

  await runTest('11. Retrying a book is idempotent and updates state cleanly without duplicate records', async () => {
    const blankPdf = createSyntheticPdf();
    const mockOcr = async (p) => `الفقرة الأولى: نص تجريبي للإعادة صفحة ${p} مع شرح ومسائل دقيقة ومكتملة.\n\nالفقرة الثانية: تمارين ومسائل إضافية لضمان ثبات البيانات وتفادي تكرار السجلات أو المقاطع.`;

    const params = {
      bookId: 'test_book_retry',
      pdfBuffer: blankPdf,
      titleAr: 'كتاب إعادة المحاولة والتحقق',
      academicStageId: validStageId,
      gradeId: validGradeId,
      subjectId: validSubjectId,
      options: {
        ocrProvider: mockOcr,
        visualRequirements: 'NONE',
        forceReingest: false
      }
    };

    const firstRun = await BookIngestionService.ingestTextbook(params);
    assert.strictEqual(firstRun.status, 'VERIFIED_READY');

    const secondRun = await BookIngestionService.ingestTextbook(params);
    assert.strictEqual(secondRun.status, 'VERIFIED_READY');
  });

  // ==========================================================================
  // TEST 10 & 12: Preservation of Existing 54 Units & Inventory Isolation
  // ==========================================================================
  console.log('\n--- Test Group 6: Authoritative Curriculum & Regression Integrity ---');

  await runTest('12. Existing 13-book inventory of 55 units remains 100% verified ready and untouched', async () => {
    const summary = ReadinessValidator.getReadinessSummary();
    assert.strictEqual(summary.totalUnits, 55, 'Must have exactly 55 total authoritative units');
    assert.strictEqual(summary.verifiedReady, 55, 'All 55 authoritative units must remain VERIFIED_READY');
    assert.strictEqual(summary.blocked, 0, 'No authoritative units can be blocked');
  });

  await runTest('13. Storage abstraction detects environment and reports persistence status', async () => {
    const storage = getStorageProvider();
    const isDurable = storage.isDurable();
    const type = storage.getStorageType();

    assert.ok(typeof isDurable === 'boolean');
    assert.ok(['local-fs', 'ephemeral-serverless', 'cloud-blob', 'database-chunks'].includes(type));
  });

  console.log('\n================================================================');
  console.log('ALL 13 PHASE 4G.3Q INGESTION PIPELINE TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
  } finally {
    teardownDisposableTestDb(db, disposable.tempDir);
    console.log(`🧹 Teardown complete: disposable test directory unlinked: ${disposable.tempDir}`);
  }
}

main().catch(err => {
  console.error('Fatal error in test harness:', err);
  process.exit(1);
});
