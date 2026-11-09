import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDisposableTestDb, assertDatabaseIsDisposable, teardownDisposableTestDb } from './test_isolation_helper.mjs';

// Setup disposable SQLite database for safe, 100% isolated testing
const { tempDir, dbPath } = setupDisposableTestDb('readiness_gate_audit');
process.env.NODE_ENV = 'test';

import { db } from '../src/db/db.js';
import { ReadinessValidator } from '../src/services/readinessValidator.js';
import { ExamCacheService } from '../src/services/examCacheService.js';
import { AIRagEngine } from '../src/services/ai/aiRagEngine.js';
import { v4 as uuidv4 } from 'uuid';

describe('FARABI AI — Phase 3.2: Exam Readiness Gate & Runtime Bypass Removal Audit', () => {
  let stageId: string;
  let gradeId: string;
  let subjectId: string;

  before(async () => {
    await db.init();
    assertDatabaseIsDisposable(db, dbPath);

    // Query pre-seeded stage and grade
    const stageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PREPARATORY'`);
    const gradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PREP_3'`);
    stageId = stageRes.rows[0].id;
    gradeId = gradeRes.rows[0].id;

    subjectId = `subj_arabic_${uuidv4()}`;
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'ARB', 'اللغة العربية', 'Arabic Language')`,
      [subjectId, gradeId]
    );
  });

  after(() => {
    teardownDisposableTestDb(db, tempDir);
  });

  // ---------------------------------------------------------------------------
  // Scenario 1: Newly ingested book remains NOT_AUDITED
  // ---------------------------------------------------------------------------
  test('Scenario 1: Newly ingested book with processing_status = COMPLETED remains NOT_AUDITED and ineligible', async () => {
    const bookId = `book_ingested_unapproved_${uuidv4()}`;
    const chapterId = `ch_unit1_${uuidv4()}`;

    await db.query(`
      INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status, processing_error, term, school_type, active_generation_id)
      VALUES ($1, $2, $3, $4, 'كتاب تجريبي مكتمل المعالجة لكنه غير معتمد', 'Completed Unapproved Book', 10, 'COMPLETED', NULL, 1, 'كلاهما', 'gen_1')
    `, [bookId, stageId, gradeId, subjectId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'الوحدة التجريبية', 'Test Unit', 1, 5, 'gen_1')
    `, [chapterId, bookId]);

    const sampleText = 'هذا النص التعليمي مخصص لاختبار منظومة تقييم الجاهزية التعليمية والتأكد من استيفاء معايير الجودة والاعتماد للمقررات الدراسية الرسمية بدقة متناهية.';
    for (let i = 0; i < 3; i++) {
      await db.query(`
        INSERT INTO book_chunks (id, book_id, chapter_id, page_number, chunk_index, content, embedding, generation_id, academic_stage_id, grade_id, subject_id)
        VALUES ($1, $2, $3, $4, $5, $6, '{"model":"semantic-hash-768","version":"1.0","vector":[' || $5 || ',0.1,0.2]}', 'gen_1', $7, $8, $9)
      `, [`chk_${bookId}_${i}`, bookId, chapterId, 2, i, sampleText, stageId, gradeId, subjectId]);
    }

    const readiness = await ReadinessValidator.getUnitReadinessAsync(bookId, chapterId);
    
    assert.equal(readiness.status, 'NOT_AUDITED', 'Must return NOT_AUDITED instead of VERIFIED_READY');
    assert.equal(readiness.isEligibleForAI, false, 'Must NOT be eligible for AI exam generation');
    assert.match(readiness.reason, /INGESTED_NOT_APPROVED|لم يحصل بعد على اعتماد/, 'Reason must state book is ingested but not audited');
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: Calling registerAuditedCurriculumUnit() CANNOT make an unapproved book AI-eligible
  // ---------------------------------------------------------------------------
  test('Scenario 2: Calling registerAuditedCurriculumUnit() or registerDynamicUnit() CANNOT make an unapproved book AI-eligible', async () => {
    const unapprovedBookId = `book_attempted_bypass_${uuidv4()}`;
    const unapprovedChapterId = `ch_attempted_bypass_${uuidv4()}`;

    await db.query(`
      INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status, term, school_type, active_generation_id)
      VALUES ($1, $2, $3, $4, 'كتاب محاولة التخطي', 'Bypass Attempt Book', 10, 'COMPLETED', 1, 'كلاهما', 'gen_bypass')
    `, [unapprovedBookId, stageId, gradeId, subjectId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'وحدة محاولة التخطي', 'Bypass Unit', 1, 5, 'gen_bypass')
    `, [unapprovedChapterId, unapprovedBookId]);

    const sampleText = 'شرح تفصيلي للمقرر الدراسي لاختبار سد ثغرة التخطي الآني في الذاكرة الحية.';
    for (let i = 0; i < 3; i++) {
      await db.query(`
        INSERT INTO book_chunks (id, book_id, chapter_id, page_number, chunk_index, content, embedding, generation_id, academic_stage_id, grade_id, subject_id)
        VALUES ($1, $2, $3, $4, $5, $6, '{"model":"semantic-hash-768","version":"1.0","vector":[' || $5 || ',0.1,0.2]}', 'gen_bypass', $7, $8, $9)
      `, [`chk_byp_${i}`, unapprovedBookId, unapprovedChapterId, 2, i, sampleText, stageId, gradeId, subjectId]);
    }

    // Attempt runtime in-memory bypass
    ReadinessValidator.registerAuditedCurriculumUnit({
      bookId: unapprovedBookId,
      chapterId: unapprovedChapterId,
      unitTitle: 'محاولة اعتماد وهمية عبر الذاكرة',
      auditStatus: 'VERIFIED_READY',
      auditedAt: new Date().toISOString()
    });

    // Verification: The gate MUST ignore dynamic in-memory registration and fail closed!
    const readiness = await ReadinessValidator.getUnitReadinessAsync(unapprovedBookId, unapprovedChapterId);
    assert.equal(readiness.status, 'NOT_AUDITED', 'In-memory dynamic registration must NOT grant VERIFIED_READY');
    assert.equal(readiness.isEligibleForAI, false, 'Must remain strictly ineligible for AI');
    assert.match(readiness.reason, /INGESTED_NOT_APPROVED/, 'Must fail closed with INGESTED_NOT_APPROVED');
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Restarting or clearing runtime state does not change eligibility
  // ---------------------------------------------------------------------------
  test('Scenario 3: Clearing dynamic units (simulating process restart) maintains identical eligibility state', async () => {
    // 1. Canonical unit remains VERIFIED_READY across dynamic clears
    const canonicalBookId = '013411b8-edec-477b-bd42-3dbdda9fb6a9';
    const canonicalChapterId = 'c7043f86-6a40-4417-a1b8-60e3301e7cb7';

    ReadinessValidator.clearDynamicUnits();
    const canonicalReadiness = await ReadinessValidator.getUnitReadinessAsync(canonicalBookId, canonicalChapterId);
    assert.equal(canonicalReadiness.status, 'VERIFIED_READY', 'Canonical unit must be VERIFIED_READY after clear');
    assert.equal(canonicalReadiness.isEligibleForAI, true);

    // 2. Unapproved book remains NOT_AUDITED across dynamic clears
    const unapprovedBookId = `book_unapproved_persist_${uuidv4()}`;
    const unapprovedChapterId = `ch_unapproved_persist_${uuidv4()}`;

    await db.query(`
      INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status, term, school_type, active_generation_id)
      VALUES ($1, $2, $3, $4, 'كتاب غير معتمد ثابت', 'Unapproved Persist Book', 10, 'COMPLETED', 1, 'كلاهما', 'gen_p1')
    `, [unapprovedBookId, stageId, gradeId, subjectId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'وحدة غير معتمدة', 'Unapproved Unit', 1, 5, 'gen_p1')
    `, [unapprovedChapterId, unapprovedBookId]);

    ReadinessValidator.clearDynamicUnits();
    const unapprovedReadiness = await ReadinessValidator.getUnitReadinessAsync(unapprovedBookId, unapprovedChapterId);
    assert.equal(unapprovedReadiness.isEligibleForAI, false, 'Unapproved book remains ineligible after dynamic clear');
    assert.notEqual(unapprovedReadiness.status, 'VERIFIED_READY');
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: A mismatched active generation remains blocked
  // ---------------------------------------------------------------------------
  test('Scenario 4: Mismatched active generation blocks unit readiness and chunk retrieval', async () => {
    const bookId = `book_gen_mismatch_${uuidv4()}`;
    const chapterId = `ch_gen_mismatch_${uuidv4()}`;

    // Active generation is gen_active, but chapter is tagged gen_old
    await db.query(`
      INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status, term, school_type, active_generation_id)
      VALUES ($1, $2, $3, $4, 'كتاب جيل غير متطابق', 'Mismatched Gen Book', 10, 'COMPLETED', 1, 'كلاهما', 'gen_active')
    `, [bookId, stageId, gradeId, subjectId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'وحدة قديمة', 'Old Unit', 1, 5, 'gen_old')
    `, [chapterId, bookId]);

    await db.query(`
      INSERT INTO book_chunks (id, book_id, chapter_id, page_number, chunk_index, content, generation_id, academic_stage_id, grade_id, subject_id)
      VALUES ($1, $2, $3, 2, 0, 'نص الجيل القديم', 'gen_old', $4, $5, $6)
    `, [`chk_old_${bookId}`, bookId, chapterId, stageId, gradeId, subjectId]);

    const readiness = await ReadinessValidator.getUnitReadinessAsync(bookId, chapterId);
    assert.equal(readiness.isEligibleForAI, false);
    assert.match(readiness.reason, /INACTIVE_GENERATION|لا تتطابق مع جيل الكتاب النشط|وتختلف عن جيل الكتاب النشط/);

    const ragEngine = new AIRagEngine();
    const retrieved = await ragEngine.retrieveGroundedChunks({
      studentId: 'test_student',
      academicStageId: stageId,
      gradeId: gradeId,
      subjectId: subjectId,
      bookId: bookId,
      chapterId: chapterId,
      limit: 5
    });
    assert.equal(retrieved.length, 0, 'Must retrieve 0 chunks from mismatched generation');
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: Trial book (book_trial_mw837hk7) remains strictly blocked
  // ---------------------------------------------------------------------------
  test('Scenario 5: Production trial fixture book_trial_mw837hk7 remains quarantined and blocked across all paths', async () => {
    const trialBookId = 'book_trial_mw837hk7';
    const trialChapterId = 'ch_trial_unit1';

    await db.query(`
      INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status, term, school_type, active_generation_id)
      VALUES ($1, $2, $3, $4, 'كتاب التجربة الإنتاجية', 'Production Trial Book', 5, 'COMPLETED', 1, 'كلاهما', 'gen_trial_mw837hk7')
    `, [trialBookId, stageId, gradeId, subjectId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'وحدة التجربة', 'Trial Unit', 1, 3, 'gen_trial_mw837hk7')
    `, [trialChapterId, trialBookId]);

    const sampleTrialText = 'هذا النص التعليمي الخاص بتجربة الإنتاج الميدانية للتحقق من سلامة خط المعالجة والاستخراج الآلي للمناهج الدراسية مع الحفاظ الكامل على معايير الجاهزية.';
    for (let i = 0; i < 3; i++) {
      await db.query(`
        INSERT INTO book_chunks (id, book_id, chapter_id, page_number, chunk_index, content, embedding, generation_id, academic_stage_id, grade_id, subject_id)
        VALUES ($1, $2, $3, $4, $5, $6, '{"model":"semantic-hash-768","version":"1.0","vector":[' || $5 || ',0.1,0.2]}', 'gen_trial_mw837hk7', $7, $8, $9)
      `, [`chk_trial_${i}`, trialBookId, trialChapterId, 2, i, sampleTrialText, stageId, gradeId, subjectId]);
    }

    // 1. Readiness status must be NOT_AUDITED and ineligible
    const readiness = await ReadinessValidator.getUnitReadinessAsync(trialBookId, trialChapterId);
    assert.equal(readiness.status, 'NOT_AUDITED', 'Trial book must not be approved');
    assert.equal(readiness.isEligibleForAI, false, 'Trial book must NOT be eligible for AI');

    // 2. Cache lookup must reject student eligibility
    const cacheResult = await ExamCacheService.getCachedExamForStudent({
      studentId: 'student_trial',
      bookId: trialBookId,
      chapterIds: [trialChapterId],
      academicStageId: stageId,
      gradeId: gradeId,
      subjectId: subjectId,
      schoolType: 'عربي',
      term: 1,
      difficultyLevel: 'MEDIUM',
      examType: 'UNIT',
      targetQuestionCount: 5
    });
    assert.equal(cacheResult.hit, false);
    assert.equal(cacheResult.reason, 'INELIGIBLE_STUDENT');

    // 3. AI generation throws UNIT_READINESS_BLOCKED
    const ragEngine = new AIRagEngine();
    await assert.rejects(
      async () => {
        await ragEngine.generateQuestions({
          studentId: 'student_trial',
          academicStageId: stageId,
          gradeId: gradeId,
          subjectId: subjectId,
          bookId: trialBookId,
          chapterId: trialChapterId,
          questionCount: 3,
          difficulty: 'MEDIUM',
          language: 'ar',
          examType: 'UNIT'
        });
      },
      /UNIT_READINESS_BLOCKED/
    );
  });

  // ---------------------------------------------------------------------------
  // Scenario 6: Cache cannot reuse exams from unapproved books
  // ---------------------------------------------------------------------------
  test('Scenario 6: ExamCacheService rejects cache lookup for unapproved book', async () => {
    const bookId = `book_unapproved_cache_${uuidv4()}`;
    const chapterId = `ch_unapproved_cache_${uuidv4()}`;

    await db.query(`
      INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status, term, school_type, active_generation_id)
      VALUES ($1, $2, $3, $4, 'كتاب كاش غير معتمد', 'Unapproved Cache Book', 10, 'COMPLETED', 1, 'كلاهما', 'gen_cache')
    `, [bookId, stageId, gradeId, subjectId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'وحدة كاش', 'Cache Unit', 1, 5, 'gen_cache')
    `, [chapterId, bookId]);

    const cacheResult = await ExamCacheService.getCachedExamForStudent({
      studentId: 'student_test_1',
      bookId: bookId,
      chapterIds: [chapterId],
      academicStageId: stageId,
      gradeId: gradeId,
      subjectId: subjectId,
      schoolType: 'عربي',
      term: 1,
      difficultyLevel: 'MEDIUM',
      examType: 'UNIT',
      targetQuestionCount: 5
    });

    assert.equal(cacheResult.hit, false, 'Cache hit must be false for unapproved book');
    assert.equal(cacheResult.reason, 'INELIGIBLE_STUDENT', 'Cache check must reject student eligibility');
  });

  // ---------------------------------------------------------------------------
  // Scenario 7: RAG cannot reuse question-bank items from unapproved books
  // ---------------------------------------------------------------------------
  test('Scenario 7: AIRagEngine.generateQuestions throws UNIT_READINESS_BLOCKED before Q-bank or LLM', async () => {
    const bookId = `book_unapproved_ai_${uuidv4()}`;
    const chapterId = `ch_unapproved_ai_${uuidv4()}`;

    await db.query(`
      INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status, term, school_type, active_generation_id)
      VALUES ($1, $2, $3, $4, 'كتاب ذكاء غير معتمد', 'Unapproved AI Book', 10, 'COMPLETED', 1, 'كلاهما', 'gen_ai')
    `, [bookId, stageId, gradeId, subjectId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'وحدة ذكاء', 'AI Unit', 1, 5, 'gen_ai')
    `, [chapterId, bookId]);

    const ragEngine = new AIRagEngine();
    await assert.rejects(
      async () => {
        await ragEngine.generateQuestions({
          studentId: 'test_student',
          academicStageId: stageId,
          gradeId: gradeId,
          subjectId: subjectId,
          bookId: bookId,
          chapterId: chapterId,
          questionCount: 3,
          difficulty: 'MEDIUM',
          language: 'ar',
          examType: 'UNIT'
        });
      },
      (err: Error) => {
        assert.match(err.message, /UNIT_READINESS_BLOCKED/);
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // Scenario 8: Teacher manual exam creation remains blocked for unapproved books
  // ---------------------------------------------------------------------------
  test('Scenario 8: Teacher manual exam creation gate blocks unapproved books and permits approved units', async () => {
    const unapprovedBookId = `book_unapproved_teacher_${uuidv4()}`;
    const unapprovedChapterId = `ch_unapproved_teacher_${uuidv4()}`;

    await db.query(`
      INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status, term, school_type, active_generation_id)
      VALUES ($1, $2, $3, $4, 'كتاب المعلم غير المعتمد', 'Teacher Unapproved Book', 10, 'COMPLETED', 1, 'كلاهما', 'gen_t1')
    `, [unapprovedBookId, stageId, gradeId, subjectId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'وحدة المعلم', 'Teacher Unit', 1, 5, 'gen_t1')
    `, [unapprovedChapterId, unapprovedBookId]);

    // Check readiness directly matching routes/exams.ts logic
    const unapprovedReadiness = await ReadinessValidator.getUnitReadinessAsync(unapprovedBookId, unapprovedChapterId);
    const wouldBlockUnapproved = (!unapprovedReadiness.isEligibleForAI && unapprovedReadiness.status !== 'VERIFIED_READY');
    assert.equal(wouldBlockUnapproved, true, 'Teacher exam creation logic must block unapproved book');

    // Canonical Prep 3 Arabic unit must be allowed
    const p3ArabicBookId = '013411b8-edec-477b-bd42-3dbdda9fb6a9';
    const p3ArabicUnit1Id = 'c7043f86-6a40-4417-a1b8-60e3301e7cb7';
    const approvedReadiness = await ReadinessValidator.getUnitReadinessAsync(p3ArabicBookId, p3ArabicUnit1Id);
    const wouldBlockApproved = (!approvedReadiness.isEligibleForAI && approvedReadiness.status !== 'VERIFIED_READY');
    assert.equal(wouldBlockApproved, false, 'Teacher exam creation logic must allow approved canonical unit');
  });

  // ---------------------------------------------------------------------------
  // Scenario 9: All existing canonical Prep 1, Prep 2, and Prep 3 curricula remain eligible
  // ---------------------------------------------------------------------------
  test('Scenario 9: Canonical Prep 1, Prep 2, and Prep 3 (Arabic, English, Science) all evaluate to VERIFIED_READY', async () => {
    // Prep 1 Arabic Unit 1
    const p1ArabicBookId = '0758fc7a-c9b2-4e25-a32b-6cacb6bb418d';
    const p1ArabicUnit1Id = 'de726b08-631a-465c-82b4-8d7e3b7be4cb';
    const p1Arabic = await ReadinessValidator.getUnitReadinessAsync(p1ArabicBookId, p1ArabicUnit1Id);
    assert.equal(p1Arabic.status, 'VERIFIED_READY');
    assert.equal(p1Arabic.isEligibleForAI, true);

    // Prep 2 Arabic Unit 1
    const p2ArabicBookId = 'bc6bb834-7192-474c-8507-c53265028b4e';
    const p2ArabicUnit1Id = '902f6adf-8043-4247-b80c-42bb48d200b8';
    const p2Arabic = await ReadinessValidator.getUnitReadinessAsync(p2ArabicBookId, p2ArabicUnit1Id);
    assert.equal(p2Arabic.status, 'VERIFIED_READY');
    assert.equal(p2Arabic.isEligibleForAI, true);

    // Prep 3 Arabic Unit 1
    const p3ArabicBookId = '013411b8-edec-477b-bd42-3dbdda9fb6a9';
    const p3ArabicUnit1Id = 'c7043f86-6a40-4417-a1b8-60e3301e7cb7';
    const p3Arabic = await ReadinessValidator.getUnitReadinessAsync(p3ArabicBookId, p3ArabicUnit1Id);
    assert.equal(p3Arabic.status, 'VERIFIED_READY');
    assert.equal(p3Arabic.isEligibleForAI, true);

    // Prep 3 English Unit 4
    const p3EnglishBookId = '9e702109-7d92-445c-b814-567c1f6cba49';
    const p3EnglishUnit4Id = 'f13a0004-9e70-445c-b814-567c1f6cba49';
    const p3English = await ReadinessValidator.getUnitReadinessAsync(p3EnglishBookId, p3EnglishUnit4Id);
    assert.equal(p3English.status, 'VERIFIED_READY');
    assert.equal(p3English.isEligibleForAI, true);

    // Prep 3 Science all 4 units
    const p3ScienceBookId = 'ecf50c73-4329-436d-a0a6-520cfa8172f6';
    const p3ScienceUnits = [
      '3eeb0aa8-f4f2-4c2f-821c-527ad8b084b6',
      '7c45791b-e5c6-4cf6-9efe-0e32b763a946',
      '53219e01-9c64-43e8-b96e-9296cc41edea',
      'd72d1c19-4016-4d16-8d30-47ac2bdeef80'
    ];
    for (const uId of p3ScienceUnits) {
      const p3Sci = await ReadinessValidator.getUnitReadinessAsync(p3ScienceBookId, uId);
      assert.equal(p3Sci.status, 'VERIFIED_READY', `Prep 3 Science Unit ${uId} must be VERIFIED_READY`);
      assert.equal(p3Sci.isEligibleForAI, true);
    }
  });

  // ---------------------------------------------------------------------------
  // Scenario 10: Provenance verification fails closed when source page is missing
  // ---------------------------------------------------------------------------
  test('Scenario 10: Provenance verification fails closed when source page or chunk is missing', async () => {
    const bookId = `book_provenance_test_${uuidv4()}`;
    const chapterId = `ch_prov_${uuidv4()}`;

    await db.query(`
      INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status, term, school_type, active_generation_id)
      VALUES ($1, $2, $3, $4, 'كتاب التحقق من المصدر', 'Provenance Book', 10, 'COMPLETED', 1, 'كلاهما', 'gen_prov')
    `, [bookId, stageId, gradeId, subjectId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'وحدة التحقق', 'Prov Unit', 1, 5, 'gen_prov')
    `, [chapterId, bookId]);

    const questionsWithMissingPage = [
      {
        question_text: 'سؤال غير موثق بمصدر صفحة حقيقي؟',
        page_reference: 99,
        options: [{ text: 'أ' }, { text: 'ب' }],
        correct_answer: 'أ'
      }
    ];

    const result = await ExamCacheService.verifyExamQuestionsProvenance(
      questionsWithMissingPage,
      bookId,
      [chapterId]
    );

    assert.equal(result.isVerified, false, 'Provenance check must fail closed when page is missing');
    assert.match(result.reason || '', /PAGE_NOT_FOUND/);
  });
});
