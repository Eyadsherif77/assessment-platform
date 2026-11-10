/**
 * FARABI AI — DETERMINISTIC OFFLINE VERIFICATION SUITE FOR THE TWO BLOCKERS
 *
 * Blocker 1: Visual review metadata preservation during worker sync and gateway persistence.
 * Blocker 2: Unit-level visual asset requirement detection and quality gate enforcement.
 *
 * ZERO PRODUCTION DATABASE MUTATIONS | ZERO PAID GEMINI CALLS | ZERO CLOUD API CALLS
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { setupDisposableTestDb, assertDatabaseIsDisposable } from './test_isolation_helper.mjs';

// Setup isolated disposable SQLite test database FIRST before importing db
const { tempDir, dbPath } = setupDisposableTestDb('blockers_verify');
process.env.NODE_ENV = 'test';
process.env.ALLOW_PAID_AI_TESTS = 'false';

const { db } = await import('../dist/db/db.js');
await db.init();
assertDatabaseIsDisposable(db, dbPath);

const { CurriculumApprovalService } = await import('../dist/services/curriculumApprovalService.js');
const { ReadinessValidator } = await import('../dist/services/readinessValidator.js');
const { VisualAssetExtractor } = await import('../dist/services/ai/visualAssetExtractor.js');
const { IngestionWorkerSessionService } = await import('../dist/services/jobs/ingestionWorkerSessionService.js');
const { BookIngestionService } = await import('../dist/services/bookIngestionService.js');

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

async function main() {
  console.log('==============================================================================');
  console.log('FARABI AI — DETERMINISTIC OFFLINE VERIFICATION: BLOCKERS 1 & 2');
  console.log('Strict Offline Mode | Disposable Test DB | Zero Production Mutations');
  console.log('==============================================================================\n');

  const stageId = 'stage_prep_vbf';
  const gradeId = 'grade_prep3_vbf';
  const subjectId = 'subj_math_vbf';

  await db.query(`INSERT OR REPLACE INTO academic_stages (id, code, name_ar, name_en, sort_order) VALUES ($1, 'PREP_VBF', 'الإعدادية', 'Preparatory', 2)`, [stageId]);
  await db.query(`INSERT OR REPLACE INTO grades (id, stage_id, code, name_ar, name_en, sort_order) VALUES ($1, $2, 'PREP3_VBF', 'الصف الثالث الإعدادي', 'Prep 3', 3)`, [gradeId, stageId]);
  await db.query(`INSERT OR REPLACE INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'MATH_VBF', 'الرياضيات', 'Mathematics')`, [subjectId, gradeId]);

  console.log('--- TEST GROUP 1: Blocker 1 — Metadata Preservation During Worker Sync & Gateway Persistence ---');

  await runTest('Worker Sync Payload preserves requires_visual_review and visual_review_flags', async () => {
    // Seed book record first
    await db.query(`
      INSERT INTO books (id, title_ar, title_en, processing_status, active_generation_id, academic_stage_id, grade_id, subject_id)
      VALUES ('book_math_test', 'الرياضيات', 'Mathematics', 'COMPLETED', 'v1', $1, $2, $3)
    `, [stageId, gradeId, subjectId]);

    // Simulate chunk selection from local worker SQLite
    const mockLocalChunks = [
      {
        id: 'chk_test_001',
        book_id: 'book_math_test',
        chapter_id: 'ch_geo_test',
        page_number: 45,
        chunk_index: 0,
        content: 'Solve the equation: x + 1 / x - 1 = 3',
        embedding: JSON.stringify(new Array(768).fill(0.01)),
        metadata: JSON.stringify({
          requires_visual_review: true,
          visual_review_flags: ['POTENTIAL_2D_FRACTION'],
          has_uncertain_math: true,
          detected_math_patterns: ['FRACTION_OVER_FRACTION']
        }),
        generation_id: 'v1'
      },
      {
        id: 'chk_test_002',
        book_id: 'book_math_test',
        chapter_id: 'ch_geo_test',
        page_number: 46,
        chunk_index: 1,
        content: 'Standard text without special formatting.',
        embedding: JSON.stringify(new Array(768).fill(0.02)),
        metadata: JSON.stringify({
          requires_visual_review: false,
          visual_review_flags: [],
          has_uncertain_math: false
        }),
        generation_id: 'v1'
      }
    ];

    // Simulate mapping in LocalIngestionRunner
    const chunksPayload = mockLocalChunks.map((c, idx) => {
      let parsedMeta = {};
      try {
        parsedMeta = typeof c.metadata === 'string' ? JSON.parse(c.metadata) : (c.metadata || {});
      } catch (_) {}

      return {
        chunkIndex: idx,
        pageNumber: c.page_number,
        content: c.content,
        chapterId: c.chapter_id,
        metadata: parsedMeta,
        embedding: typeof c.embedding === 'string' ? JSON.parse(c.embedding) : c.embedding
      };
    });

    assert.strictEqual(chunksPayload[0].metadata.requires_visual_review, true);
    assert.deepStrictEqual(chunksPayload[0].metadata.visual_review_flags, ['POTENTIAL_2D_FRACTION']);
    assert.strictEqual(chunksPayload[0].metadata.has_uncertain_math, true);
    assert.strictEqual(chunksPayload[1].metadata.requires_visual_review, false);

    // Call IngestionWorkerSessionService.persistSemanticChunks to verify Gateway persistence
    await IngestionWorkerSessionService.persistSemanticChunks({
      session: {
        id: 'sess_test_1',
        book_id: 'book_math_test',
        generation_id: 'v1',
        worker_id: 'worker_local',
        worker_name: 'test_worker',
        status: 'ACTIVE'
      },
      chunks: chunksPayload
    });

    // Query DB to verify persistence into book_chunks.metadata
    const dbRes = await db.query(
      `SELECT id, metadata FROM book_chunks WHERE book_id = 'book_math_test' ORDER BY chunk_index ASC`
    );

    assert.strictEqual(dbRes.rows.length, 2);
    const savedMeta1 = JSON.parse(dbRes.rows[0].metadata);
    assert.strictEqual(savedMeta1.requires_visual_review, true);
    assert.deepStrictEqual(savedMeta1.visual_review_flags, ['POTENTIAL_2D_FRACTION']);
    assert.strictEqual(savedMeta1.has_uncertain_math, true);

    const savedMeta2 = JSON.parse(dbRes.rows[1].metadata);
    assert.strictEqual(savedMeta2.requires_visual_review, false);
  });

  await runTest('BookIngestionService heuristic detects visual review math patterns deterministically', async () => {
    const fractionText = 'Given that:\n 2x + 3\n -------\n 5x - 1\n Find the value of x.';
    const radicalText = 'Calculate the square root: √144 + ∛27 = ?';
    const exponentText = 'Simplify the expression: x^2 + 2x^3 - 4x^5.';
    const plainText = 'The quick brown fox jumps over the lazy dog. General educational reading material.';

    const fracFlags = BookIngestionService.detectVisualReviewReasons(fractionText);
    assert.ok(fracFlags.includes('POTENTIAL_2D_FRACTION'), 'Should detect 2D fraction');

    const radFlags = BookIngestionService.detectVisualReviewReasons(radicalText);
    assert.ok(radFlags.includes('RADICAL_EXPRESSION'), 'Should detect radical');

    const expFlags = BookIngestionService.detectVisualReviewReasons(exponentText);
    assert.ok(expFlags.includes('EXPONENT_UNCERTAINTY'), 'Should detect exponent');

    const plainFlags = BookIngestionService.detectVisualReviewReasons(plainText);
    assert.strictEqual(plainFlags.length, 0, 'Plain text should produce zero flags');
  });

  console.log('\n--- TEST GROUP 2: Blocker 2 — Unit-Level Visual Requirement Detection ---');

  await runTest('CurriculumApprovalService.detectVisualRequirement inspects unit title and book title', async () => {
    // Case 1: Geometry unit under general "الرياضيات" book
    const vis1 = CurriculumApprovalService.detectVisualRequirement({
      unitTitleAr: 'الوحدة الخامسة: الهندسة المستوية والتحليلية',
      unitTitleEn: 'Unit 5: Plane and Analytic Geometry',
      bookTitleAr: 'الرياضيات',
      bookTitleEn: 'Mathematics'
    });
    assert.strictEqual(vis1, 'GEOMETRY_DIAGRAMS', 'Geometry unit title under general math book must require GEOMETRY_DIAGRAMS');

    // Case 2: Trigonometry unit under general "الرياضيات" book
    const vis2 = CurriculumApprovalService.detectVisualRequirement({
      unitTitleAr: 'الوحدة الرابعة: حساب المثلثات',
      unitTitleEn: 'Unit 4: Trigonometry',
      bookTitleAr: 'الرياضيات',
      bookTitleEn: 'Mathematics'
    });
    assert.strictEqual(vis2, 'GEOMETRY_DIAGRAMS', 'Trigonometry unit title must require GEOMETRY_DIAGRAMS');

    // Case 3: Algebra unit under general "الرياضيات" book
    const vis3 = CurriculumApprovalService.detectVisualRequirement({
      unitTitleAr: 'الوحدة الثانية: الجبر والتناسب',
      unitTitleEn: 'Unit 2: Algebra and Proportions',
      bookTitleAr: 'الرياضيات',
      bookTitleEn: 'Mathematics'
    });
    assert.strictEqual(vis3, 'NONE', 'Algebra unit title under general math book must NOT require visual assets');

    // Case 4: Geography unit under general "الدراسات الاجتماعية" book
    const vis4 = CurriculumApprovalService.detectVisualRequirement({
      unitTitleAr: 'الوحدة الأولى: الجغرافيا الطبيعية للعالم',
      unitTitleEn: 'Unit 1: Physical Geography of the World',
      bookTitleAr: 'الدراسات الاجتماعية',
      bookTitleEn: 'Social Studies'
    });
    assert.strictEqual(vis4, 'CARTOGRAPHIC_MAPS', 'Geography unit title under social studies must require CARTOGRAPHIC_MAPS');

    // Case 5: History unit under general "الدراسات الاجتماعية" book
    const vis5 = CurriculumApprovalService.detectVisualRequirement({
      unitTitleAr: 'الوحدة الثالثة: تاريخ مصر الحديث والمعاصر',
      unitTitleEn: 'Unit 3: Modern and Contemporary History of Egypt',
      bookTitleAr: 'الدراسات الاجتماعية',
      bookTitleEn: 'Social Studies'
    });
    assert.strictEqual(vis5, 'NONE', 'History unit title under social studies must NOT require visual assets');

    // Case 6: Calling with two string arguments
    assert.strictEqual(
      CurriculumApprovalService.detectVisualRequirement('الوحدة الرابعة: الهندسة والقياس', 'الرياضيات'),
      'GEOMETRY_DIAGRAMS'
    );
  });

  await runTest('ReadinessValidator.detectVisualRequirement matches CurriculumApprovalService detection', async () => {
    const geo = ReadinessValidator.detectVisualRequirement({
      unitTitleAr: 'الوحدة الرابعة: الهندسة وحساب المثلثات',
      bookTitleAr: 'الرياضيات (لغات)'
    });
    assert.strictEqual(geo, 'GEOMETRY_DIAGRAMS');

    const alg = ReadinessValidator.detectVisualRequirement({
      unitTitleAr: 'الوحدة الأولى: العلاقات والدوال',
      bookTitleAr: 'الرياضيات (لغات)'
    });
    assert.strictEqual(alg, 'NONE');

    const maps = ReadinessValidator.detectVisualRequirement({
      unitTitleAr: 'الوحدة الأولى: تضاريس العالم وخريطة السكان',
      bookTitleAr: 'الدراسات الاجتماعية'
    });
    assert.strictEqual(maps, 'CARTOGRAPHIC_MAPS');
  });

  console.log('\n--- TEST GROUP 3: Quality Gate Enforcement & Safe Failure ---');

  await runTest('Geometry unit missing visual assets fails auto-approval and is blocked', async () => {
    const bookId = 'book_geo_test_fail';
    const chId = 'ch_geo_test_fail';
    const genId = 'v1';

    // Seed book and geometry chapter
    await db.query(`
      INSERT INTO books (id, title_ar, title_en, processing_status, active_generation_id, total_pages, academic_stage_id, grade_id, subject_id)
      VALUES ($1, 'الرياضيات', 'Mathematics', 'COMPLETED', $2, 30, $3, $4, $5)
    `, [bookId, genId, stageId, gradeId, subjectId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'الوحدة الخامسة: الهندسة التحليلية', 'Unit 5: Analytic Geometry', 1, 3, $3)
    `, [chId, bookId, genId]);

    // Seed pages and OCR provenance
    for (let p = 1; p <= 3; p++) {
      await db.query(`
        INSERT INTO book_pages (id, book_id, page_number, char_count, raw_text, generation_id)
        VALUES ($1, $2, $3, 100, 'Geometric proof content for triangles and circles page ${p}', $4)
      `, [`bp_${bookId}_${p}`, bookId, p, genId]);

      await db.query(`
        INSERT INTO book_ocr_page_results (job_id, book_id, page_number, extracted_text, char_count)
        VALUES ($1, $2, $3, 'OCR proof content', 100)
      `, [`job_${bookId}`, bookId, p]);
    }

    // Seed valid chunks WITHOUT visual review flags
    for (let c = 1; c <= 3; c++) {
      await db.query(`
        INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, embedding, metadata, generation_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Geometric theory chunk content $c with theorems', $9, $10, $11)
      `, [
        `chk_${bookId}_${c}`,
        bookId,
        chId,
        stageId,
        gradeId,
        subjectId,
        c,
        c - 1,
        JSON.stringify(new Array(768).fill(0.05)),
        JSON.stringify({ requires_visual_review: false, visual_review_flags: [] }),
        genId
      ]);
    }

    // Evaluate auto-approval: MUST FAIL because no visual assets exist for this geometry unit!
    const result = await CurriculumApprovalService.evaluateAndAutoApproveUnit(chId, bookId, genId);

    assert.strictEqual(result.approved, false, 'Geometry unit without visual assets MUST NOT be auto-approved');
    assert.ok(
      result.issues.some((iss) => iss.includes('المقرر يتطلب أصولاً بصرية (GEOMETRY_DIAGRAMS)')),
      'Should report visual assets missing issue'
    );

    // Verify DB approval status was saved as NOT_AUDITED
    const approvalRes = await db.query(
      `SELECT approval_status FROM curriculum_unit_approvals WHERE book_id = $1 AND chapter_id = $2`,
      [bookId, chId]
    );
    assert.strictEqual(approvalRes.rows[0]?.approval_status, 'NOT_AUDITED');
  });

  await runTest('Non-geometry (Algebra) unit under same math book is NOT blocked by visual assets', async () => {
    const bookId = 'book_alg_test_pass';
    const chId = 'ch_alg_test_pass';
    const genId = 'v1';

    // Seed book and algebra chapter
    await db.query(`
      INSERT INTO books (id, title_ar, title_en, processing_status, active_generation_id, total_pages, academic_stage_id, grade_id, subject_id)
      VALUES ($1, 'الرياضيات', 'Mathematics', 'COMPLETED', $2, 30, $3, $4, $5)
    `, [bookId, genId, stageId, gradeId, subjectId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'الوحدة الثانية: الجبر والإحصاء', 'Unit 2: Algebra and Statistics', 1, 2, $3)
    `, [chId, bookId, genId]);

    // Seed pages and OCR provenance
    for (let p = 1; p <= 2; p++) {
      await db.query(`
        INSERT INTO book_pages (id, book_id, page_number, char_count, raw_text, generation_id)
        VALUES ($1, $2, $3, 100, 'Algebra equations and solutions on page ${p}', $4)
      `, [`bp_${bookId}_${p}`, bookId, p, genId]);

      await db.query(`
        INSERT INTO book_ocr_page_results (job_id, book_id, page_number, extracted_text, char_count)
        VALUES ($1, $2, $3, 'Algebra OCR content', 100)
      `, [`job_${bookId}`, bookId, p]);
    }

    // Seed clean chunks
    for (let c = 1; c <= 2; c++) {
      await db.query(`
        INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, embedding, metadata, generation_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Algebra clean text content for chapter equations without uncertainty', $9, $10, $11)
      `, [
        `chk_${bookId}_${c}`,
        bookId,
        chId,
        stageId,
        gradeId,
        subjectId,
        c,
        c - 1,
        JSON.stringify(new Array(768).fill(0.05)),
        JSON.stringify({ requires_visual_review: false, visual_review_flags: [] }),
        genId
      ]);
    }

    // Evaluate auto-approval: MUST PASS because algebra does not require visual assets!
    const result = await CurriculumApprovalService.evaluateAndAutoApproveUnit(chId, bookId, genId);

    assert.strictEqual(result.approved, true, 'Clean algebra unit MUST be auto-approved');
    assert.strictEqual(result.issues.length, 0);

    const approvalRes = await db.query(
      `SELECT approval_status, approved_by FROM curriculum_unit_approvals WHERE book_id = $1 AND chapter_id = $2`,
      [bookId, chId]
    );
    assert.strictEqual(approvalRes.rows[0]?.approval_status, 'APPROVED');
    assert.strictEqual(approvalRes.rows[0]?.approved_by, 'SYSTEM_AUTO_QUALITY_GATE');
  });

  await runTest('Unit with critical unresolved visual review flag cannot be auto-approved', async () => {
    const bookId = 'book_math_flag_fail';
    const chId = 'ch_math_flag_fail';
    const genId = 'v1';

    // Seed book and chapter
    await db.query(`
      INSERT INTO books (id, title_ar, title_en, processing_status, active_generation_id, total_pages, academic_stage_id, grade_id, subject_id)
      VALUES ($1, 'الرياضيات', 'Mathematics', 'COMPLETED', $2, 30, $3, $4, $5)
    `, [bookId, genId, stageId, gradeId, subjectId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'الوحدة الأولى: العلاقات والدوال', 'Unit 1: Relations and Functions', 1, 2, $3)
    `, [chId, bookId, genId]);

    for (let p = 1; p <= 2; p++) {
      await db.query(`
        INSERT INTO book_pages (id, book_id, page_number, char_count, raw_text, generation_id)
        VALUES ($1, $2, $3, 100, 'Functions and mapping relations page ${p}', $4)
      `, [`bp_${bookId}_${p}`, bookId, p, genId]);

      await db.query(`
        INSERT INTO book_ocr_page_results (job_id, book_id, page_number, extracted_text, char_count)
        VALUES ($1, $2, $3, 'Relations OCR content', 100)
      `, [`job_${bookId}`, bookId, p]);
    }

    // Seed chunk with unresolved critical flag
    await db.query(`
      INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, embedding, metadata, generation_id)
      VALUES ($1, $2, $3, $4, $5, $6, 1, 0, 'Chunk 1 with uncertain 2d fraction: (x+1)/(x-1)', $7, $8, $9)
    `, [
      `chk_${bookId}_1`,
      bookId,
      chId,
      stageId,
      gradeId,
      subjectId,
      JSON.stringify(new Array(768).fill(0.05)),
      JSON.stringify({
        requires_visual_review: true,
        visual_review_flags: ['POTENTIAL_2D_FRACTION'],
        has_uncertain_math: true
      }),
      genId
    ]);

    await db.query(`
      INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, embedding, metadata, generation_id)
      VALUES ($1, $2, $3, $4, $5, $6, 2, 1, 'Chunk 2 clean text content', $7, $8, $9)
    `, [
      `chk_${bookId}_2`,
      bookId,
      chId,
      stageId,
      gradeId,
      subjectId,
      JSON.stringify(new Array(768).fill(0.05)),
      JSON.stringify({ requires_visual_review: false, visual_review_flags: [] }),
      genId
    ]);

    const result = await CurriculumApprovalService.evaluateAndAutoApproveUnit(chId, bookId, genId);

    assert.strictEqual(result.approved, false, 'Unit with unresolved math flags MUST NOT be auto-approved');
    assert.ok(
      result.issues.some((iss) => iss.includes('علامة رياضية حرجة غير معتمدة (POTENTIAL_2D_FRACTION)')),
      'Should report critical visual flag issue'
    );
  });

  console.log('\n--- TEST GROUP 4: Authoritative Canonical Books Preservation ---');

  await runTest('Bundled canonical visual assets for Prep 1 & 2 Math resolve properly', async () => {
    const prep1MathBookId = '808104ec-b861-434b-80c6-579f715d8bdf';
    const prep1GeoChapterId = '1b9f4377-6ae0-4c24-b588-c221900597ec';

    const prep2MathBookId = '19886434-1839-427d-af31-4c64fcf79525';
    const prep2GeoChapterId = 'dba6933a-2b80-4d3b-ada4-3ac6acfb58c1';

    const p1Assets = VisualAssetExtractor.getAssetsForChapter(prep1MathBookId, prep1GeoChapterId);
    assert.ok(p1Assets.length > 0, `Prep 1 Geometry unit should have bundled visual assets, found: ${p1Assets.length}`);

    const p2Assets = VisualAssetExtractor.getAssetsForChapter(prep2MathBookId, prep2GeoChapterId);
    assert.ok(p2Assets.length > 0, `Prep 2 Geometry unit should have bundled visual assets, found: ${p2Assets.length}`);
  });

  console.log('\n==============================================================================');
  console.log(`ALL TESTS PASSED: ${passedTests} / ${totalTests}`);
  console.log('Deterministic Verification of Blocker 1 & Blocker 2 COMPLETE.');
  console.log('==============================================================================');
}

main().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
