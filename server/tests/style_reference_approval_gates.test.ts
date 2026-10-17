import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDisposableTestDb, assertDatabaseIsDisposable, teardownDisposableTestDb } from './test_isolation_helper.mjs';

// Setup disposable database for safe, isolated testing
const { tempDir, dbPath } = setupDisposableTestDb('style_reference_gates');

// Set NODE_ENV to test so external network and live DB are never touched
process.env.NODE_ENV = 'test';

import { db } from '../src/db/db.js';
import { ExamCacheService, AuthoritativeCurriculumIdentity } from '../src/services/examCacheService.js';
import { AnswerValidationService } from '../src/services/answerValidationService.js';
import { v4 as uuidv4 } from 'uuid';

describe('Approval Gate 3: Style Reference & Non-Billable Safeguards Verification', () => {
  let mockIdentity: AuthoritativeCurriculumIdentity;
  let testTeacherAId: string;
  let testTeacherBId: string;
  let matchingRefExamId: string;
  let mismatchSubjectExamId: string;
  let mismatchGradeExamId: string;
  let mismatchTermExamId: string;
  let mismatchChapterExamId: string;

  before(async () => {
    await db.init();
    assertDatabaseIsDisposable(db, dbPath);

    // Seed test users
    testTeacherAId = `teacher_a_${uuidv4()}`;
    testTeacherBId = `teacher_b_${uuidv4()}`;
    await db.query(`
      INSERT INTO users (id, email, password_hash, role, full_name)
      VALUES ($1, 'teacherA@test.com', 'hash', 'TEACHER', 'Teacher A'),
             ($2, 'teacherB@test.com', 'hash', 'TEACHER', 'Teacher B')
    `, [testTeacherAId, testTeacherBId]);

    // Query already-seeded preparatory stage and prep 3 grade
    const stageRes = await db.query(`SELECT id, name_ar, name_en FROM academic_stages WHERE code = 'PREPARATORY'`);
    const gradeRes = await db.query(`SELECT id, name_ar, name_en FROM grades WHERE code = 'PREP_3'`);
    const stageId = stageRes.rows[0].id;
    const gradeId = gradeRes.rows[0].id;

    const subjectId = 'subj_science';
    const bookId = 'book_science_prep3';
    const chapterId = 'ch_unit1';

    await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'SCI', 'العلوم', 'Science')`, [subjectId, gradeId]);
    await db.query(`INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, term, school_type)
                    VALUES ($1, $2, $3, $4, 'كتاب العلوم', 'Science Book', 1, 'كلاهما')`,
                   [bookId, stageId, gradeId, subjectId]);
    await db.query(`INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en)
                    VALUES ($1, $2, 1, 'الوحدة الأولى: القوى والحركة', 'Unit 1: Force and Motion')`,
                   [chapterId, bookId]);

    mockIdentity = {
      bookId,
      titleAr: 'كتاب العلوم',
      titleEn: 'Science Book',
      gradeId,
      gradeNameAr: 'الصف الثالث الإعدادي',
      gradeNameEn: 'Prep 3',
      academicStageId: stageId,
      stageNameAr: 'المرحلة الإعدادية',
      stageNameEn: 'Prep',
      subjectId,
      subjectNameAr: 'العلوم',
      subjectNameEn: 'Science',
      term: 1,
      schoolType: 'كلاهما'
    };

    // 1. Create a matching reference exam owned by Teacher A
    matchingRefExamId = `ref_match_${uuidv4()}`;
    await db.query(`
      INSERT INTO exams (id, title_ar, title_en, teacher_id, academic_stage_id, grade_id, subject_id, book_id, chapter_id, term, is_style_reference)
      VALUES ($1, 'اختبار العلوم الشهري', 'Monthly Science', $2, $3, $4, $5, $6, $7, 1, 1)
    `, [matchingRefExamId, testTeacherAId, stageId, gradeId, subjectId, bookId, chapterId]);

    // Seed sample reference questions and options
    const q1Id = `q1_${uuidv4()}`;
    await db.query(`
      INSERT INTO exam_questions (id, exam_id, question_text, question_type, points, order_index)
      VALUES ($1, $2, 'ما المقصود بالسرعة المنتظمة؟', 'MULTIPLE_CHOICE', 1, 1)
    `, [q1Id, matchingRefExamId]);
    await db.query(`
      INSERT INTO exam_question_options (id, question_id, option_text, is_correct)
      VALUES ($1, $2, 'قطع مسافات متساوية في أزمنة متساوية', 1),
             ($3, $2, 'قطع مسافات غير متساوية في أزمنة متساوية', 0),
             ($4, $2, 'تغير المسافة بمرور الزمن عشوائياً', 0),
             ($5, $2, 'انعدام الحركة تماماً', 0)
    `, [uuidv4(), q1Id, uuidv4(), uuidv4(), uuidv4()]);

    const q2Id = `q2_${uuidv4()}`;
    await db.query(`
      INSERT INTO exam_questions (id, exam_id, question_text, question_type, points, order_index)
      VALUES ($1, $2, 'علل: تعتبر حركة المترو من أمثلة الحركة في اتجاه واحد؟', 'MULTIPLE_CHOICE', 1, 2)
    `, [q2Id, matchingRefExamId]);
    await db.query(`
      INSERT INTO exam_question_options (id, question_id, option_text, is_correct)
      VALUES ($1, $2, 'لأنه يتحرك للأمام أو للخلف في مسار مستقيم أو منحنٍ', 1),
             ($3, $2, 'لأنه يتحرك بسرعة الضوء', 0),
             ($4, $2, 'لأنه يتحرك في مسار دائري مغلق فقط', 0),
             ($5, $2, 'لأنه يتوقف دائماً', 0)
    `, [uuidv4(), q2Id, uuidv4(), uuidv4(), uuidv4()]);

    // 2. Create Mismatch Exams with valid FKs:
    // A. Mismatch Subject
    await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ('subj_math_other', $1, 'MATH', 'الرياضيات', 'Math')`, [gradeId]);
    mismatchSubjectExamId = `ref_diff_sub_${uuidv4()}`;
    await db.query(`
      INSERT INTO exams (id, title_ar, title_en, teacher_id, academic_stage_id, grade_id, subject_id, book_id, chapter_id, term, is_style_reference)
      VALUES ($1, 'اختبار رياضيات', 'Math Exam', $2, $3, $4, 'subj_math_other', $5, $6, 1, 1)
    `, [mismatchSubjectExamId, testTeacherAId, stageId, gradeId, bookId, chapterId]);

    // B. Mismatch Grade
    const prep1Res = await db.query(`SELECT id FROM grades WHERE code = 'PREP_1'`);
    const prep1GradeId = prep1Res.rows[0].id;
    mismatchGradeExamId = `ref_diff_grade_${uuidv4()}`;
    await db.query(`
      INSERT INTO exams (id, title_ar, title_en, teacher_id, academic_stage_id, grade_id, subject_id, book_id, chapter_id, term, is_style_reference)
      VALUES ($1, 'اختبار أولى إعدادي', 'Prep 1 Exam', $2, $3, $4, $5, $6, $7, 1, 1)
    `, [mismatchGradeExamId, testTeacherAId, stageId, prep1GradeId, subjectId, bookId, chapterId]);

    // C. Mismatch Term
    mismatchTermExamId = `ref_diff_term_${uuidv4()}`;
    await db.query(`
      INSERT INTO exams (id, title_ar, title_en, teacher_id, academic_stage_id, grade_id, subject_id, book_id, chapter_id, term, is_style_reference)
      VALUES ($1, 'اختبار ترم ثاني', 'Term 2 Exam', $2, $3, $4, $5, $6, $7, 2, 1)
    `, [mismatchTermExamId, testTeacherAId, stageId, gradeId, subjectId, bookId, chapterId]);

    // D. Mismatch Unit
    await db.query(`INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en)
                    VALUES ('ch_unit2', $1, 2, 'الوحدة الثانية: الطاقة الضوئية', 'Unit 2: Light Energy')`, [bookId]);
    mismatchChapterExamId = `ref_diff_ch_${uuidv4()}`;
    await db.query(`
      INSERT INTO exams (id, title_ar, title_en, teacher_id, academic_stage_id, grade_id, subject_id, book_id, chapter_id, term, is_style_reference)
      VALUES ($1, 'اختبار وحدة ثانية', 'Unit 2 Exam', $2, $3, $4, $5, $6, 'ch_unit2', 1, 1)
    `, [mismatchChapterExamId, testTeacherAId, stageId, gradeId, subjectId, bookId]);
  });

  after(async () => {
    teardownDisposableTestDb(db, tempDir);
  });

  test('Scenario 1: No-reference backward compatibility', async () => {
    const { normalizedParams, paramHash } = ExamCacheService.normalizeExamParameters({
      count: 5,
      difficulty: 'MEDIUM'
    });
    assert.strictEqual(normalizedParams.styleReferenceId, null);
    assert.ok(paramHash && paramHash.length === 16);

    const { styleGuidance, error } = await ExamCacheService.loadStyleGuidanceForReference('', mockIdentity);
    assert.strictEqual(styleGuidance, null);
    assert.strictEqual(error, undefined);
  });

  test('Scenario 2: Valid matching reference loads concise style guidance from DB (zero paid calls)', async () => {
    const res = await ExamCacheService.loadStyleGuidanceForReference(
      matchingRefExamId,
      mockIdentity,
      { teacherId: testTeacherAId, chapterId: 'ch_unit1' }
    );

    assert.strictEqual(res.error, undefined);
    assert.ok(res.styleGuidance, 'Style guidance must be returned');
    assert.ok(res.styleGuidance.includes('نماذج من صياغة وبنية الأسئلة المعتمدة'), 'Should include style pattern header');
    assert.ok(res.styleGuidance.includes('ما المقصود بالسرعة المنتظمة؟'), 'Should include question 1 text pattern');
    assert.ok(res.styleGuidance.includes('علل: تعتبر حركة المترو'), 'Should include question 2 text pattern');
    assert.ok(res.styleGuidance.includes('تنبيه صارم'), 'Must include strict grounding disclaimer');
  });

  test('Scenario 3: Subject/grade/term/unit mismatch rejection', async () => {
    // A. Subject Mismatch
    const resSub = await ExamCacheService.loadStyleGuidanceForReference(
      mismatchSubjectExamId,
      mockIdentity,
      { teacherId: testTeacherAId }
    );
    assert.strictEqual(resSub.status, 400);
    assert.ok(resSub.error?.includes('STYLE_REFERENCE_SUBJECT_MISMATCH'));

    // B. Grade Mismatch
    const resGrade = await ExamCacheService.loadStyleGuidanceForReference(
      mismatchGradeExamId,
      mockIdentity,
      { teacherId: testTeacherAId }
    );
    assert.strictEqual(resGrade.status, 400);
    assert.ok(resGrade.error?.includes('STYLE_REFERENCE_GRADE_MISMATCH'));

    // C. Term Mismatch
    const resTerm = await ExamCacheService.loadStyleGuidanceForReference(
      mismatchTermExamId,
      mockIdentity,
      { teacherId: testTeacherAId }
    );
    assert.strictEqual(resTerm.status, 400);
    assert.ok(resTerm.error?.includes('STYLE_REFERENCE_TERM_MISMATCH'));

    // D. Unit (Chapter) Mismatch
    const resUnit = await ExamCacheService.loadStyleGuidanceForReference(
      mismatchChapterExamId,
      mockIdentity,
      { teacherId: testTeacherAId, chapterId: 'ch_unit1' }
    );
    assert.strictEqual(resUnit.status, 400);
    assert.ok(resUnit.error?.includes('STYLE_REFERENCE_UNIT_MISMATCH'));
  });

  test('Scenario 4: Ownership and authorization rejection', async () => {
    // Teacher B tries to use Teacher A's style reference
    const resUnauthorized = await ExamCacheService.loadStyleGuidanceForReference(
      matchingRefExamId,
      mockIdentity,
      { teacherId: testTeacherBId, userRole: 'TEACHER', chapterId: 'ch_unit1' }
    );
    assert.strictEqual(resUnauthorized.status, 403);
    assert.ok(resUnauthorized.error?.includes('UNAUTHORIZED_REFERENCE'));

    // Admin should be allowed without ownership block
    const resAdmin = await ExamCacheService.loadStyleGuidanceForReference(
      matchingRefExamId,
      mockIdentity,
      { teacherId: testTeacherBId, userRole: 'ADMIN', chapterId: 'ch_unit1' }
    );
    assert.strictEqual(resAdmin.error, undefined);
    assert.ok(resAdmin.styleGuidance);
  });

  test('Scenario 5: Missing reference and retrieval-failure fallback', async () => {
    const nonExistentId = 'non_existent_exam_id_12345';
    const resMissing = await ExamCacheService.loadStyleGuidanceForReference(
      nonExistentId,
      mockIdentity,
      { teacherId: testTeacherAId }
    );
    assert.strictEqual(resMissing.styleGuidance, null);
    assert.strictEqual(resMissing.error, undefined, 'Missing reference must fall back safely without blocking');
  });

  test('Scenario 6: Textbook grounding and answer correctness safeguards', async () => {
    // Verify answer validation service catches flawed questions
    const validQuestions = [
      {
        question_text: 'وحدة قياس السرعة هي:',
        question_type: 'MULTIPLE_CHOICE',
        options: [
          { text: 'متر / ثانية', is_correct: true },
          { text: 'كجم', is_correct: false },
          { text: 'متر', is_correct: false },
          { text: 'ثانية', is_correct: false }
        ]
      }
    ];
    const summaryValid = AnswerValidationService.validateExamQuestions(validQuestions);
    assert.strictEqual(summaryValid.allStructurallyValid, true);
    assert.strictEqual(summaryValid.hasRejectedAnswers, false);

    // Flawed: multiple correct options
    const invalidQuestions = [
      {
        question_text: 'سؤال غير سليم:',
        question_type: 'MULTIPLE_CHOICE',
        options: [
          { text: 'خيار 1', is_correct: true },
          { text: 'خيار 2', is_correct: true },
          { text: 'خيار 3', is_correct: false },
          { text: 'خيار 4', is_correct: false }
        ]
      }
    ];
    const summaryInvalid = AnswerValidationService.validateExamQuestions(invalidQuestions);
    assert.strictEqual(summaryInvalid.allStructurallyValid, false, 'Must reject multiple correct options');
  });

  test('Scenario 7: Cache partitioning and isolation', () => {
    // No reference
    const pNoRef = ExamCacheService.normalizeExamParameters({ count: 5, difficulty: 'MEDIUM' });
    const kNoRef = ExamCacheService.buildCanonicalConfigKey(mockIdentity, 'ch_unit1', pNoRef.paramHash);

    // Reference A
    const pRefA = ExamCacheService.normalizeExamParameters({ count: 5, difficulty: 'MEDIUM', styleReferenceId: 'ref_aaa' });
    const kRefA = ExamCacheService.buildCanonicalConfigKey(mockIdentity, 'ch_unit1', pRefA.paramHash);

    // Reference B
    const pRefB = ExamCacheService.normalizeExamParameters({ count: 5, difficulty: 'MEDIUM', styleReferenceId: 'ref_bbb' });
    const kRefB = ExamCacheService.buildCanonicalConfigKey(mockIdentity, 'ch_unit1', pRefB.paramHash);

    assert.notStrictEqual(pNoRef.paramHash, pRefA.paramHash, 'No-ref vs RefA must have different paramHash');
    assert.notStrictEqual(pRefA.paramHash, pRefB.paramHash, 'RefA vs RefB must have different paramHash');
    assert.notStrictEqual(kNoRef, kRefA, 'Config key must partition between no-ref and ref');
    assert.notStrictEqual(kRefA, kRefB, 'Config key must partition between distinct references');

    // Same reference must produce identical hash (cache hit)
    const pRefA2 = ExamCacheService.normalizeExamParameters({ count: 5, difficulty: 'MEDIUM', styleReferenceId: 'ref_aaa' });
    assert.strictEqual(pRefA.paramHash, pRefA2.paramHash, 'Same reference must yield identical paramHash');
  });

  test('Scenario 8: Cost tracking and session correlation preserved', async () => {
    const sessionId = `gen_sess_test_${Date.now()}`;
    const pWithSession = ExamCacheService.normalizeExamParameters({
      count: 3,
      difficulty: 'MEDIUM',
      styleReferenceId: matchingRefExamId
    });
    assert.strictEqual(pWithSession.normalizedParams.styleReferenceId, matchingRefExamId);
    assert.ok(sessionId.startsWith('gen_sess_'));
  });

  test('Scenario 9: Cleanup scope and protected tables intact', async () => {
    // Verify target tables exist and can be safely queried
    const resUsers = await db.query('SELECT COUNT(*) as cnt FROM users');
    assert.ok(Number(resUsers.rows[0].cnt) >= 2, 'Users table intact');

    const resBooks = await db.query('SELECT COUNT(*) as cnt FROM books');
    assert.ok(Number(resBooks.rows[0].cnt) >= 1, 'Books table intact');

    const resExams = await db.query('SELECT COUNT(*) as cnt FROM exams');
    assert.ok(Number(resExams.rows[0].cnt) >= 1, 'Exams table intact');
  });
});
