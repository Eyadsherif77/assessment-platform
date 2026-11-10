/**
 * FARABI AI — DETERMINISTIC VERIFICATION SUITE FOR STRICT VISUAL ASSET VALIDATION
 *
 * Verifies the 13 required scenarios for VISUAL_ASSET_VALIDATION_SHALLOW_CHECK resolution:
 * 1.  VERIFIED diagram with accessible file -> accepted for Geometry.
 * 2.  VERIFIED map with accessible file -> accepted for Geography/Maps.
 * 3.  EXTRACTED asset -> rejected (strictly VERIFIED required).
 * 4.  AMBIGUOUS asset -> rejected.
 * 5.  Missing physical file -> rejected.
 * 6.  Wrong asset type (page_image for Geometry) -> rejected.
 * 7.  Wrong book ID -> rejected.
 * 8.  Wrong chapter ID -> rejected.
 * 9.  Malformed manifest entry -> safely rejected without crashing.
 * 10. Geometry unit without valid diagram -> blocked from auto-approval and AI readiness.
 * 11. Geography unit without valid map -> blocked from auto-approval and AI readiness.
 * 12. Non-visual Algebra unit -> not blocked.
 * 13. Canonical assets compatibility check -> audits all canonical books & manifest entries.
 *
 * ZERO PRODUCTION MUTATIONS | ZERO PAID GEMINI CALLS | ISOLATED DISPOSABLE SQLITE
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { setupDisposableTestDb, assertDatabaseIsDisposable } from './test_isolation_helper.mjs';

const { tempDir, dbPath } = setupDisposableTestDb('strict_visual_test');
process.env.NODE_ENV = 'test';
process.env.ALLOW_PAID_AI_TESTS = 'false';

const { db } = await import('../dist/db/db.js');
await db.init();
assertDatabaseIsDisposable(db, dbPath);

const { VisualAssetExtractor } = await import('../dist/services/ai/visualAssetExtractor.js');
const { CurriculumApprovalService } = await import('../dist/services/curriculumApprovalService.js');
const { ReadinessValidator } = await import('../dist/services/readinessValidator.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] Scenario ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] Scenario ${totalTests}: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function main() {
  console.log('==============================================================================');
  console.log('FARABI AI — STRICT VISUAL ASSET VALIDATION DETERMINISTIC SUITE');
  console.log('Centralized Quality Gate | 7 Strict Validation Conditions | 13 Scenarios');
  console.log('==============================================================================\n');

  // Create real temporary physical files for deterministic accessibility testing
  const tempAssetsDir = path.join(tempDir, 'visual_assets_test');
  fs.mkdirSync(tempAssetsDir, { recursive: true });

  const dummySvgPath = path.join(tempAssetsDir, 'sample_triangle.svg');
  fs.writeFileSync(dummySvgPath, '<svg><polygon points="0,0 100,0 50,100"/></svg>', 'utf8');

  const dummyPdfPath = path.join(tempAssetsDir, 'sample_map.pdf');
  fs.writeFileSync(dummyPdfPath, '%PDF-1.4\n%EOF\n', 'utf8');

  const bookA = 'book_strict_001';
  const chapGeo = 'chap_geo_001';
  const chapMap = 'chap_map_001';
  const chapAlg = 'chap_alg_001';

  console.log('--- PART 1: Unit-Level Asset Validation Rules (Scenarios 1-9) ---');

  await runTest('VERIFIED diagram with accessible file -> accepted for Geometry', async () => {
    const asset = {
      asset_id: 'diag_test_triangle_01',
      book_id: bookA,
      chapter_id: chapGeo,
      printed_page_number: 75,
      pdf_page_index: 74,
      asset_type: 'diagram',
      file_path: dummySvgPath,
      url_path: '/assets/sample_triangle.svg',
      file_size: fs.statSync(dummySvgPath).size,
      mime_type: 'image/svg+xml',
      sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      extraction_method: 'vector-svg',
      validation_status: 'VERIFIED',
      description_ar: 'مخطط مثلث قائم الزاوية',
      description_en: 'Right angle triangle diagram'
    };

    const result = VisualAssetExtractor.validateSingleAsset(asset, bookA, chapGeo, 'GEOMETRY_DIAGRAMS');
    assert.strictEqual(result.isValid, true, 'Valid verified diagram must be accepted');
    assert.strictEqual(result.reason, undefined);
  });

  await runTest('VERIFIED map with accessible file -> accepted for Geography/Maps', async () => {
    const asset = {
      asset_id: 'map_test_africa_01',
      book_id: bookA,
      chapter_id: chapMap,
      printed_page_number: 14,
      pdf_page_index: 13,
      asset_type: 'map',
      file_path: dummyPdfPath,
      url_path: '/assets/sample_map.pdf',
      file_size: fs.statSync(dummyPdfPath).size,
      mime_type: 'application/pdf',
      sha256: 'b1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      extraction_method: 'pdf-lib-page',
      validation_status: 'VERIFIED',
      description_ar: 'خريطة تضاريس قارة إفريقيا',
      description_en: 'Physical map of Africa'
    };

    const result = VisualAssetExtractor.validateSingleAsset(asset, bookA, chapMap, 'CARTOGRAPHIC_MAPS');
    assert.strictEqual(result.isValid, true, 'Valid verified map must be accepted');
    assert.strictEqual(result.reason, undefined);
  });

  await runTest('EXTRACTED asset -> rejected (strictly VERIFIED required)', async () => {
    const asset = {
      asset_id: 'map_test_extracted_01',
      book_id: bookA,
      chapter_id: chapMap,
      printed_page_number: 14,
      pdf_page_index: 13,
      asset_type: 'map',
      file_path: dummyPdfPath,
      url_path: '/assets/sample_map.pdf',
      file_size: fs.statSync(dummyPdfPath).size,
      mime_type: 'application/pdf',
      sha256: 'c1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      extraction_method: 'pdf-lib-page',
      validation_status: 'EXTRACTED', // Not verified!
      description_ar: 'خريطة مستخرجة آلياً غير معتمدة',
      description_en: 'Extracted map unverified'
    };

    const result = VisualAssetExtractor.validateSingleAsset(asset, bookA, chapMap, 'CARTOGRAPHIC_MAPS');
    assert.strictEqual(result.isValid, false, 'EXTRACTED asset must be rejected');
    assert.ok(result.reason.includes('EXTRACTED'), `Expected EXTRACTED in reason, got: ${result.reason}`);
  });

  await runTest('AMBIGUOUS asset -> rejected', async () => {
    const asset = {
      asset_id: 'diag_ambiguous_01',
      book_id: bookA,
      chapter_id: chapGeo,
      printed_page_number: 80,
      pdf_page_index: 79,
      asset_type: 'diagram',
      file_path: dummySvgPath,
      url_path: '/assets/sample_triangle.svg',
      file_size: fs.statSync(dummySvgPath).size,
      mime_type: 'image/svg+xml',
      sha256: 'd1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      extraction_method: 'vector-svg',
      validation_status: 'AMBIGUOUS', // Ambiguous!
      description_ar: 'مخطط غير محدد',
      description_en: 'Ambiguous diagram'
    };

    const result = VisualAssetExtractor.validateSingleAsset(asset, bookA, chapGeo, 'GEOMETRY_DIAGRAMS');
    assert.strictEqual(result.isValid, false, 'AMBIGUOUS asset must be rejected');
    assert.ok(result.reason.includes('AMBIGUOUS'), `Expected AMBIGUOUS in reason, got: ${result.reason}`);
  });

  await runTest('Missing physical file -> rejected', async () => {
    const missingFilePath = path.join(tempAssetsDir, 'phantom_missing_file_never_existed.svg');
    const asset = {
      asset_id: 'diag_missing_file_01',
      book_id: bookA,
      chapter_id: chapGeo,
      printed_page_number: 80,
      pdf_page_index: 79,
      asset_type: 'diagram',
      file_path: missingFilePath,
      url_path: '/assets/phantom.svg',
      file_size: 1024,
      mime_type: 'image/svg+xml',
      sha256: 'e1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      extraction_method: 'vector-svg',
      validation_status: 'VERIFIED',
      description_ar: 'مخطط ملفه مفقود',
      description_en: 'Missing file diagram'
    };

    const result = VisualAssetExtractor.validateSingleAsset(asset, bookA, chapGeo, 'GEOMETRY_DIAGRAMS');
    assert.strictEqual(result.isValid, false, 'Asset with missing physical file must be rejected');
    assert.ok(result.reason.includes('missing or inaccessible'), `Expected missing file reason, got: ${result.reason}`);
  });

  await runTest('Wrong asset type (page_image for Geometry) -> rejected', async () => {
    const asset = {
      asset_id: 'page_as_diagram_01',
      book_id: bookA,
      chapter_id: chapGeo,
      printed_page_number: 80,
      pdf_page_index: 79,
      asset_type: 'page_image', // page_image is NOT diagram!
      file_path: dummyPdfPath,
      url_path: '/assets/sample_map.pdf',
      file_size: fs.statSync(dummyPdfPath).size,
      mime_type: 'application/pdf',
      sha256: 'f1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      extraction_method: 'pdf-lib-page',
      validation_status: 'VERIFIED',
      description_ar: 'صورة صفحة كاملة',
      description_en: 'Whole page image'
    };

    const result = VisualAssetExtractor.validateSingleAsset(asset, bookA, chapGeo, 'GEOMETRY_DIAGRAMS');
    assert.strictEqual(result.isValid, false, 'page_image must be rejected when diagram is required');
    assert.ok(result.reason.includes('does not match required visual category'), `Expected category mismatch, got: ${result.reason}`);
  });

  await runTest('Wrong book ID -> rejected', async () => {
    const asset = {
      asset_id: 'diag_wrong_book_01',
      book_id: 'other_unrelated_book_999',
      chapter_id: chapGeo,
      printed_page_number: 80,
      pdf_page_index: 79,
      asset_type: 'diagram',
      file_path: dummySvgPath,
      url_path: '/assets/sample_triangle.svg',
      file_size: fs.statSync(dummySvgPath).size,
      mime_type: 'image/svg+xml',
      sha256: '11b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      extraction_method: 'vector-svg',
      validation_status: 'VERIFIED',
      description_ar: 'مخطط لكتاب آخر',
      description_en: 'Diagram for other book'
    };

    const result = VisualAssetExtractor.validateSingleAsset(asset, bookA, chapGeo, 'GEOMETRY_DIAGRAMS');
    assert.strictEqual(result.isValid, false, 'Asset with mismatched book_id must be rejected');
    assert.ok(result.reason.includes('does not match expected book'), `Expected book mismatch, got: ${result.reason}`);
  });

  await runTest('Wrong chapter ID -> rejected', async () => {
    const asset = {
      asset_id: 'diag_wrong_chap_01',
      book_id: bookA,
      chapter_id: 'other_unrelated_chapter_888',
      printed_page_number: 80,
      pdf_page_index: 79,
      asset_type: 'diagram',
      file_path: dummySvgPath,
      url_path: '/assets/sample_triangle.svg',
      file_size: fs.statSync(dummySvgPath).size,
      mime_type: 'image/svg+xml',
      sha256: '21b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      extraction_method: 'vector-svg',
      validation_status: 'VERIFIED',
      description_ar: 'مخطط لفصل آخر',
      description_en: 'Diagram for other chapter'
    };

    const result = VisualAssetExtractor.validateSingleAsset(asset, bookA, chapGeo, 'GEOMETRY_DIAGRAMS');
    assert.strictEqual(result.isValid, false, 'Asset with mismatched chapter_id must be rejected');
    assert.ok(result.reason.includes('does not match expected chapter'), `Expected chapter mismatch, got: ${result.reason}`);
  });

  await runTest('Malformed manifest entry -> safely rejected without crashing', async () => {
    // Test null
    assert.strictEqual(VisualAssetExtractor.validateSingleAsset(null, bookA, chapGeo, 'GEOMETRY_DIAGRAMS').isValid, false);
    // Test empty object
    assert.strictEqual(VisualAssetExtractor.validateSingleAsset({}, bookA, chapGeo, 'GEOMETRY_DIAGRAMS').isValid, false);
    // Test missing asset_id
    assert.strictEqual(VisualAssetExtractor.validateSingleAsset({ file_path: dummySvgPath, sha256: 'a'.repeat(64), file_size: 10 }, bookA, chapGeo, 'GEOMETRY_DIAGRAMS').isValid, false);
    // Test invalid file_size
    assert.strictEqual(VisualAssetExtractor.validateSingleAsset({ asset_id: 'x', book_id: bookA, chapter_id: chapGeo, file_path: dummySvgPath, sha256: 'a'.repeat(64), file_size: 0, validation_status: 'VERIFIED', asset_type: 'diagram' }, bookA, chapGeo, 'GEOMETRY_DIAGRAMS').isValid, false);
    // Test invalid sha256
    assert.strictEqual(VisualAssetExtractor.validateSingleAsset({ asset_id: 'x', book_id: bookA, chapter_id: chapGeo, file_path: dummySvgPath, sha256: 'short', file_size: 10, validation_status: 'VERIFIED', asset_type: 'diagram' }, bookA, chapGeo, 'GEOMETRY_DIAGRAMS').isValid, false);
  });

  console.log('\n--- PART 2: End-to-End Approval & Readiness Integration (Scenarios 10-12) ---');

  const stageId = 'stage_prep_strict';
  const gradeId = 'grade_prep3_strict';
  const subjMathId = 'subj_math_strict';
  const subjSocId = 'subj_soc_strict';

  await db.query(`INSERT OR REPLACE INTO academic_stages (id, code, name_ar, name_en, sort_order) VALUES ($1, 'PREP_STR', 'الإعدادية', 'Preparatory', 2)`, [stageId]);
  await db.query(`INSERT OR REPLACE INTO grades (id, stage_id, code, name_ar, name_en, sort_order) VALUES ($1, $2, 'PREP3_STR', 'الصف الثالث الإعدادي', 'Prep 3', 3)`, [gradeId, stageId]);
  await db.query(`INSERT OR REPLACE INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'MATH_STR', 'الرياضيات', 'Mathematics')`, [subjMathId, gradeId]);
  await db.query(`INSERT OR REPLACE INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'SOC_STR', 'الدراسات الاجتماعية', 'Social Studies')`, [subjSocId, gradeId]);

  await runTest('Geometry unit without valid diagram -> blocked from auto-approval and AI readiness', async () => {
    const bookId = 'book_geo_no_diagram';
    const chId = 'ch_geo_no_diagram';
    const genId = 'v1';

    // Seed book and geometry chapter
    await db.query(`
      INSERT INTO books (id, title_ar, title_en, processing_status, active_generation_id, total_pages, academic_stage_id, grade_id, subject_id)
      VALUES ($1, 'الرياضيات', 'Mathematics', 'COMPLETED', $2, 50, $3, $4, $5)
    `, [bookId, genId, stageId, gradeId, subjMathId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 4, 'الوحدة الرابعة: حساب المثلثات والهندسة التحليلية', 'Unit 4: Geometry and Trigonometry', 1, 3, $3)
    `, [chId, bookId, genId]);

    // Seed 3 valid pages and OCR records
    for (let p = 1; p <= 3; p++) {
      await db.query(`
        INSERT INTO book_pages (id, book_id, page_number, char_count, raw_text, generation_id)
        VALUES ($1, $2, $3, 200, 'Geometry proofs and theorems text on page ${p}', $4)
      `, [`bp_${bookId}_${p}`, bookId, p, genId]);

      await db.query(`
        INSERT INTO book_ocr_page_results (job_id, book_id, page_number, extracted_text, char_count)
        VALUES ($1, $2, $3, 'Geometry OCR page text', 200)
      `, [`job_${bookId}`, bookId, p]);
    }

    // Seed 3 clean chunks
    for (let c = 1; c <= 3; c++) {
      await db.query(`
        INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, embedding, metadata, generation_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Clean geometry theorems text without equations or flags', $9, $10, $11)
      `, [
        `chk_${bookId}_${c}`,
        bookId,
        chId,
        stageId,
        gradeId,
        subjMathId,
        c,
        c - 1,
        JSON.stringify(new Array(768).fill(0.01)),
        JSON.stringify({ requires_visual_review: false, visual_review_flags: [] }),
        genId
      ]);
    }

    // 1. Check auto-approval
    const autoApproveRes = await CurriculumApprovalService.evaluateAndAutoApproveUnit(chId, bookId, genId);
    assert.strictEqual(autoApproveRes.approved, false, 'Geometry unit without verified diagrams must NOT be auto-approved');
    assert.ok(
      autoApproveRes.issues.some(iss => iss.includes('المقرر يتطلب أصولاً بصرية (GEOMETRY_DIAGRAMS)')),
      `Expected visual issue in auto-approval, got: ${autoApproveRes.issues.join(' | ')}`
    );

    // 2. Check direct admin approval call -> must fail closed
    let threwOnAdminApprove = false;
    try {
      await CurriculumApprovalService.approveUnit('admin_user_test', chId, bookId, 'attempt manual approve');
    } catch (approveErr) {
      threwOnAdminApprove = true;
      assert.ok(approveErr.message.includes('الأصول البصرية') || approveErr.message.includes('سلامة البيانات'));
    }
    assert.strictEqual(threwOnAdminApprove, true, 'Admin approveUnit must throw if visual dependencies are not satisfied');

    // 3. Check AI readiness evaluation
    const readiness = await ReadinessValidator.getUnitReadinessAsync(bookId, chId);
    assert.strictEqual(readiness.isEligibleForAI, false, 'Geometry unit without diagrams must NOT be eligible for AI');
    assert.notStrictEqual(readiness.status, 'VERIFIED_READY');
  });

  await runTest('Geography unit without valid map -> blocked from auto-approval and AI readiness', async () => {
    const bookId = 'book_soc_no_map';
    const chId = 'ch_soc_no_map';
    const genId = 'v1';

    await db.query(`
      INSERT INTO books (id, title_ar, title_en, processing_status, active_generation_id, total_pages, academic_stage_id, grade_id, subject_id)
      VALUES ($1, 'الدراسات الاجتماعية', 'Social Studies', 'COMPLETED', $2, 60, $3, $4, $5)
    `, [bookId, genId, stageId, gradeId, subjSocId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'الوحدة الأولى: الجغرافيا الطبيعية للعالم وتوزيع التضاريس', 'Unit 1: World Physical Geography', 1, 3, $3)
    `, [chId, bookId, genId]);

    for (let p = 1; p <= 3; p++) {
      await db.query(`
        INSERT INTO book_pages (id, book_id, page_number, char_count, raw_text, generation_id)
        VALUES ($1, $2, $3, 200, 'World continents relief and rivers text on page ${p}', $4)
      `, [`bp_${bookId}_${p}`, bookId, p, genId]);

      await db.query(`
        INSERT INTO book_ocr_page_results (job_id, book_id, page_number, extracted_text, char_count)
        VALUES ($1, $2, $3, 'Geography OCR page text', 200)
      `, [`job_${bookId}`, bookId, p]);
    }

    for (let c = 1; c <= 3; c++) {
      await db.query(`
        INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, embedding, metadata, generation_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Clean geography mountains and plains text', $9, $10, $11)
      `, [
        `chk_${bookId}_${c}`,
        bookId,
        chId,
        stageId,
        gradeId,
        subjSocId,
        c,
        c - 1,
        JSON.stringify(new Array(768).fill(0.01)),
        JSON.stringify({ requires_visual_review: false, visual_review_flags: [] }),
        genId
      ]);
    }

    const autoApproveRes = await CurriculumApprovalService.evaluateAndAutoApproveUnit(chId, bookId, genId);
    assert.strictEqual(autoApproveRes.approved, false, 'Geography unit without verified maps must NOT be auto-approved');
    assert.ok(
      autoApproveRes.issues.some(iss => iss.includes('CARTOGRAPHIC_MAPS')),
      `Expected CARTOGRAPHIC_MAPS in auto-approval issues, got: ${autoApproveRes.issues.join(' | ')}`
    );

    const readiness = await ReadinessValidator.getUnitReadinessAsync(bookId, chId);
    assert.strictEqual(readiness.isEligibleForAI, false, 'Geography unit without maps must NOT be eligible for AI');
  });

  await runTest('Non-visual Algebra unit -> not blocked by visual assets', async () => {
    const bookId = 'book_alg_clean_pass';
    const chId = 'ch_alg_clean_pass';
    const genId = 'v1';

    await db.query(`
      INSERT INTO books (id, title_ar, title_en, processing_status, active_generation_id, total_pages, academic_stage_id, grade_id, subject_id)
      VALUES ($1, 'الرياضيات', 'Mathematics', 'COMPLETED', $2, 60, $3, $4, $5)
    `, [bookId, genId, stageId, gradeId, subjMathId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'الوحدة الأولى: العلاقات والدوال والنسبة والتناسب', 'Unit 1: Relations and Functions', 1, 3, $3)
    `, [chId, bookId, genId]);

    for (let p = 1; p <= 3; p++) {
      await db.query(`
        INSERT INTO book_pages (id, book_id, page_number, char_count, raw_text, generation_id)
        VALUES ($1, $2, $3, 200, 'Functions relations equations text on page ${p}', $4)
      `, [`bp_${bookId}_${p}`, bookId, p, genId]);

      await db.query(`
        INSERT INTO book_ocr_page_results (job_id, book_id, page_number, extracted_text, char_count)
        VALUES ($1, $2, $3, 'Algebra OCR page text', 200)
      `, [`job_${bookId}`, bookId, p]);
    }

    for (let c = 1; c <= 3; c++) {
      await db.query(`
        INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, embedding, metadata, generation_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Clean algebra text with fully verified content', $9, $10, $11)
      `, [
        `chk_${bookId}_${c}`,
        bookId,
        chId,
        stageId,
        gradeId,
        subjMathId,
        c,
        c - 1,
        JSON.stringify(new Array(768).fill(0.01)),
        JSON.stringify({ requires_visual_review: false, visual_review_flags: [] }),
        genId
      ]);
    }

    // Auto-approve should succeed
    const autoApproveRes = await CurriculumApprovalService.evaluateAndAutoApproveUnit(chId, bookId, genId);
    assert.strictEqual(autoApproveRes.approved, true, `Algebra unit should be auto-approved, got issues: ${autoApproveRes.issues.join(' | ')}`);

    // AI readiness should be VERIFIED_READY
    const readiness = await ReadinessValidator.getUnitReadinessAsync(bookId, chId);
    assert.strictEqual(readiness.isEligibleForAI, true, 'Algebra unit should be eligible for AI');
    assert.strictEqual(readiness.status, 'VERIFIED_READY');
  });

  console.log('\n--- PART 3: Canonical Textbooks Compatibility Audit (Scenario 13) ---');

  await runTest('Canonical assets compatibility check -> audits all canonical books & manifest entries', async () => {
    const manifest = VisualAssetExtractor.loadManifest();
    console.log(`\n  [AUDIT] Visual manifest loaded: total ${manifest.assets.length} assets.`);

    // 1. Verify Math Prep 1 and Prep 2 SVG diagrams
    const prep1MathBookId = '808104ec-b861-434b-80c6-579f715d8bdf';
    const prep1GeoChapId = '1b9f4377-6ae0-4c24-b588-c221900597ec';
    const p1Validation = VisualAssetExtractor.validateAssetsForChapter(prep1MathBookId, prep1GeoChapId, 'GEOMETRY_DIAGRAMS');
    console.log(`  [AUDIT] Math Prep 1 Geometry Chapter validation: validAssets=${p1Validation.validAssets.length}, isValid=${p1Validation.isValid}`);
    assert.strictEqual(p1Validation.isValid, true, 'Math Prep 1 Geometry must have verified diagrams');
    assert.strictEqual(p1Validation.validAssets.length, 2, 'Math Prep 1 Geometry has exactly 2 verified SVGs');

    const prep2MathBookId = '19886434-1839-427d-af31-4c64fcf79525';
    const prep2GeoChapId = 'dba6933a-2b80-4d3b-ada4-3ac6acfb58c1';
    const p2Validation = VisualAssetExtractor.validateAssetsForChapter(prep2MathBookId, prep2GeoChapId, 'GEOMETRY_DIAGRAMS');
    console.log(`  [AUDIT] Math Prep 2 Geometry Chapter validation: validAssets=${p2Validation.validAssets.length}, isValid=${p2Validation.isValid}`);
    assert.strictEqual(p2Validation.isValid, true, 'Math Prep 2 Geometry must have verified diagrams');
    assert.strictEqual(p2Validation.validAssets.length, 2, 'Math Prep 2 Geometry has exactly 2 verified SVGs');

    // 2. Audit Social Studies canonical units in visual_manifest.json
    const socBooks = [
      { id: 'fa2a1525-c46f-4b34-9f48-b762be88e5c5', name: 'Social Studies Prep 1' },
      { id: '81b8a308-7fcf-4938-8c45-aa0056624f32', name: 'Social Studies Prep 2' },
      { id: 'f19276d3-4adb-4297-bb77-5ed87ba638b9', name: 'Social Studies Prep 3' }
    ];

    console.log('\n  [AUDIT] Canonical Social Studies Map Assets Status in visual_manifest.json:');
    for (const b of socBooks) {
      const bAssets = manifest.assets.filter(a => a.book_id === b.id);
      const verifiedCount = bAssets.filter(a => a.validation_status === 'VERIFIED').length;
      const extractedCount = bAssets.filter(a => a.validation_status === 'EXTRACTED').length;
      console.log(`    - ${b.name} (${b.id}): Total Assets=${bAssets.length}, VERIFIED=${verifiedCount}, EXTRACTED=${extractedCount}`);
    }

    // 3. Verify that authoritative_curriculum_inventory.json protects canonical runtime AI generation
    const invUnits = [
      { bookId: 'fa2a1525-c46f-4b34-9f48-b762be88e5c5', chapId: 'c2387de6-beda-4c55-b93b-b65bfced4e45', name: 'Prep 1 Social Unit 1' },
      { bookId: '81b8a308-7fcf-4938-8c45-aa0056624f32', chapId: 'b123b656-03b1-4af5-be4e-971dd5ba74a6', name: 'Prep 2 Social Unit 1' },
      { bookId: 'f19276d3-4adb-4297-bb77-5ed87ba638b9', chapId: '3fa3ec4a-2af8-43e2-980f-dbd70ac62640', name: 'Prep 3 Social Unit 1' }
    ];

    console.log('\n  [AUDIT] Authoritative Inventory Protection for Canonical Units:');
    for (const u of invUnits) {
      const syncReadiness = ReadinessValidator.getUnitReadiness(u.bookId, u.chapId);
      const asyncReadiness = await ReadinessValidator.getUnitReadinessAsync(u.bookId, u.chapId);
      console.log(`    - ${u.name}: status=${syncReadiness.status}, isEligibleForAI=${syncReadiness.isEligibleForAI}`);
      assert.strictEqual(syncReadiness.status, 'VERIFIED_READY', `${u.name} must remain VERIFIED_READY in canonical inventory`);
      assert.strictEqual(syncReadiness.isEligibleForAI, true, `${u.name} must remain eligible for AI in canonical inventory`);
      assert.strictEqual(asyncReadiness.status, 'VERIFIED_READY', `${u.name} must remain VERIFIED_READY in async inventory`);
      assert.strictEqual(asyncReadiness.isEligibleForAI, true, `${u.name} must remain eligible for AI in async inventory`);
    }
  });

  console.log('\n==============================================================================');
  console.log(`ALL 13 SCENARIOS PASSED: ${passedTests} / ${totalTests}`);
  console.log('Deterministic Strict Visual Asset Validation Verification COMPLETE.');
  console.log('==============================================================================');
}

main().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
