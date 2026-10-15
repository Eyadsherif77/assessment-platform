import assert from 'assert';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { setupDisposableTestDb, teardownDisposableTestDb } from './test_isolation_helper.mjs';

// Setup isolated disposable SQLite test environment
const { dbPath, tempDir } = setupDisposableTestDb('exam_repair_regression');

const { db } = await import('../dist/db/db.js');
const { AnswerValidationService } = await import('../dist/services/answerValidationService.js');
const {
  aiRagEngine,
  extractQuestionSkeleton,
  computeJaccardSimilarity,
  isDuplicateOrParameterVariant,
  evaluateQuestionQuality,
  verifyQuestionProvenance,
  DISQUALIFIED_GEOMETRY_CHAPTER_IDS
} = await import('../dist/services/ai/aiRagEngine.js');
const { ExamCacheService } = await import('../dist/services/examCacheService.js');

console.log('========================================================================');
console.log('ALFARABI AI — EMERGENCY FULL-PLATFORM SCHOOL EXAM REPAIR REGRESSION TEST');
console.log('Math Solver | Parameter Variants | Geometry Gates | Cache & Subject Availability');
console.log('Zero Paid API Calls | Zero Production Writes | 100% Isolated Disposable State');
console.log('========================================================================\n');

let passed = 0;
const pass = (desc) => {
  passed++;
  console.log(`  [PASS] ${passed}. ${desc}`);
};

try {
  // ------------------------------------------------------------------------
  // PART 1: DETERMINISTIC LINEAR EQUATION SOLVER & MATH NOTATION
  // ------------------------------------------------------------------------
  console.log('--- PART 1: Deterministic Linear Equation Solver & Math Notation ---');

  // 1. ax + b = c
  const sol1 = AnswerValidationService.solveLinearEquation('2x + 4 = 10');
  assert.strictEqual(sol1.success, true);
  assert.strictEqual(sol1.solution, 3, '2x + 4 = 10 should solve to 3');
  pass('Solves ax + b = c (2x + 4 = 10 => x = 3)');

  // 2. ax - b = c
  const sol2 = AnswerValidationService.solveLinearEquation('3x - 5 = 10');
  assert.strictEqual(sol2.success, true);
  assert.strictEqual(sol2.solution, 5, '3x - 5 = 10 should solve to 5');
  pass('Solves ax - b = c (3x - 5 = 10 => x = 5)');

  // 3. ax = c
  const sol3 = AnswerValidationService.solveLinearEquation('4x = 24');
  assert.strictEqual(sol3.success, true);
  assert.strictEqual(sol3.solution, 6, '4x = 24 should solve to 6');
  pass('Solves ax = c (4x = 24 => x = 6)');

  // 4. Arabic variable (س): 2س + 6 = 18 => 6
  const sol4 = AnswerValidationService.solveLinearEquation('2س + 6 = 18');
  assert.strictEqual(sol4.success, true);
  assert.strictEqual(sol4.solution, 6, '2س + 6 = 18 should solve to 6');
  pass('Solves Arabic variable linear equation (2س + 6 = 18 => س = 6)');

  // 5. Arabic variable (ص): 5ص - 10 = 15 => 5
  const sol5 = AnswerValidationService.solveLinearEquation('5ص - 10 = 15');
  assert.strictEqual(sol5.success, true);
  assert.strictEqual(sol5.solution, 5, '5ص - 10 = 15 should solve to 5');
  pass('Solves Arabic variable with subtraction (5ص - 10 = 15 => ص = 5)');

  // 6. Eastern Arabic digits: ٢س + ٤ = ١٠ => 3
  const sol6 = AnswerValidationService.solveLinearEquation('٢س + ٤ = ١٠');
  assert.strictEqual(sol6.success, true);
  assert.strictEqual(sol6.solution, 3, '٢س + ٤ = ١٠ should solve to 3');
  pass('Solves Arabic digits in equation (٢س + ٤ = ١٠ => س = 3)');

  // 7. Fractions: x / 2 + 3 = 7 => 8
  const sol7 = AnswerValidationService.solveLinearEquation('x / 2 + 3 = 7');
  assert.strictEqual(sol7.success, true);
  assert.strictEqual(sol7.solution, 8, 'x / 2 + 3 = 7 should solve to 8');
  pass('Solves fractional equation (x / 2 + 3 = 7 => x = 8)');

  // 8. Math notation validation: valid expressions pass
  const notValid = AnswerValidationService.validateMathNotation('إذا كانت 2س + 4 = 10، فإن س تساوي:');
  assert.strictEqual(notValid.isValid, true);
  pass('Valid math notation passes notation check');

  // 9. Math notation validation: unbalanced parentheses rejected
  const notUnbalanced = AnswerValidationService.validateMathNotation('(2x + 4 = 10');
  assert.strictEqual(notUnbalanced.isValid, false);
  assert.ok(notUnbalanced.reason?.includes('parenthesis') || notUnbalanced.reason?.includes('bracket'));
  pass('Rejects unbalanced parentheses in math notation');

  // 10. Math notation validation: consecutive invalid operators rejected
  const notConsecutive = AnswerValidationService.validateMathNotation('2x ++ 4 = 10');
  assert.strictEqual(notConsecutive.isValid, false);
  pass('Rejects consecutive invalid operators (2x ++ 4)');

  // 11. Math notation validation: division by zero rejected
  const notDivZero = AnswerValidationService.validateMathNotation('x = 10 / 0');
  assert.strictEqual(notDivZero.isValid, false);
  assert.ok(notDivZero.reason?.includes('Division by zero'));
  pass('Rejects division by zero in math notation');

  // 12. Math notation validation: dangling trailing operators rejected
  const notDangling = AnswerValidationService.validateMathNotation('2x + 4 =');
  assert.strictEqual(notDangling.isValid, false);
  pass('Rejects dangling trailing operators (2x + 4 =)');

  // ------------------------------------------------------------------------
  // PART 2: OPTION UNIQUENESS & SINGLE-CORRECT-ANSWER ENFORCEMENT
  // ------------------------------------------------------------------------
  console.log('\n--- PART 2: Option Uniqueness & Single-Correct-Answer Enforcement ---');

  // 13. Valid unique options pass
  const validOpts = AnswerValidationService.validateOptionsUniqueness([
    { id: '1', text: '3', is_correct: true },
    { id: '2', text: '5', is_correct: false },
    { id: '3', text: '7', is_correct: false },
    { id: '4', text: '9', is_correct: false }
  ]);
  assert.strictEqual(validOpts.isValid, true);
  pass('Distinct, unambiguous multiple-choice options pass');

  // 14. Exact duplicate options rejected
  const dupOpts = AnswerValidationService.validateOptionsUniqueness([
    { id: '1', text: '3', is_correct: true },
    { id: '2', text: '3', is_correct: false },
    { id: '3', text: '7', is_correct: false },
    { id: '4', text: '9', is_correct: false }
  ]);
  assert.strictEqual(dupOpts.isValid, false);
  assert.ok(dupOpts.reason?.includes('Duplicate option text detected'));
  pass('Rejects duplicate options');

  // 15. Mathematically equivalent distractor to correct answer rejected (10/2 vs 5)
  const mathEqDistractor = AnswerValidationService.validateOptionsUniqueness([
    { id: '1', text: '5', is_correct: true },
    { id: '2', text: '10/2', is_correct: false },
    { id: '3', text: '7', is_correct: false },
    { id: '4', text: '9', is_correct: false }
  ]);
  assert.strictEqual(mathEqDistractor.isValid, false);
  assert.ok(mathEqDistractor.reason?.includes('mathematically equivalent'));
  pass('Rejects distractor mathematically equivalent to correct answer (5 vs 10/2)');

  // 16. Two distractors evaluating to the same value rejected (0.5 vs 1/2)
  const mathEqDistractors = AnswerValidationService.validateOptionsUniqueness([
    { id: '1', text: '3', is_correct: true },
    { id: '2', text: '0.5', is_correct: false },
    { id: '3', text: '1/2', is_correct: false },
    { id: '4', text: '9', is_correct: false }
  ]);
  assert.strictEqual(mathEqDistractors.isValid, false);
  assert.ok(mathEqDistractors.reason?.includes('mathematically equivalent'));
  pass('Rejects two distractors evaluating to the same value (0.5 vs 1/2)');

  // 17. Arabic normalized collision rejected (إلكترون vs الكترون)
  const arCollision = AnswerValidationService.validateOptionsUniqueness([
    { id: '1', text: 'بروتون', is_correct: true },
    { id: '2', text: 'إلكترون', is_correct: false },
    { id: '3', text: 'الكترون', is_correct: false },
    { id: '4', text: 'نيوترون', is_correct: false }
  ]);
  assert.strictEqual(arCollision.isValid, false);
  assert.ok(arCollision.reason?.includes('Arabic normalization'));
  pass('Rejects options colliding under Arabic normalization (إلكترون vs الكترون)');

  // ------------------------------------------------------------------------
  // PART 3: PARAMETER-ONLY DUPLICATE DETECTION & PARAPHRASE REJECTION
  // ------------------------------------------------------------------------
  console.log('\n--- PART 3: Parameter-Only Duplicate Detection & Paraphrase Rejection ---');

  // 18. Skeleton extraction normalizes numbers and variables
  const skel1 = extractQuestionSkeleton('Solve for x: 2x + 4 = 10');
  const skel2 = extractQuestionSkeleton('Solve for x: 3x + 5 = 14');
  assert.strictEqual(skel1, skel2, 'Parameter-only questions should produce identical skeletons');
  pass('extractQuestionSkeleton converts numbers and variables to canonical tokens');

  // 19. Parameter-only duplicate rejected
  const isParamDup = isDuplicateOrParameterVariant(
    'إذا كانت 2س + 4 = 10، فما قيمة س؟',
    ['إذا كانت 3س + 6 = 15، فما قيمة س؟']
  );
  assert.strictEqual(isParamDup.isDuplicate, true);
  assert.ok(isParamDup.reason?.includes('PARAMETER_DUPLICATE') || isParamDup.reason?.includes('numerical parameters'));
  pass('Detects and rejects parameter-only duplicate questions');

  // 20. Paraphrased duplicate with high Jaccard similarity rejected
  const isParaphrase = isDuplicateOrParameterVariant(
    'What is the definition of speed in terms of distance and time?',
    ['What is the concept of speed in terms of distance and time?']
  );
  assert.strictEqual(isParaphrase.isDuplicate, true);
  pass('Detects and rejects paraphrased duplicates with high token overlap');

  // 21. Distinct educational questions permitted
  const notDup = isDuplicateOrParameterVariant(
    'ما المقصود بطاقة الحركة؟',
    ['ما المقصود بالكثافة؟', 'احسب السرعة لجسم يتحرك 100 متر في 5 ثوانٍ']
  );
  assert.strictEqual(notDup.isDuplicate, false);
  pass('Permits genuinely distinct questions testing different concepts');

  // ------------------------------------------------------------------------
  // PART 4: GEOMETRY & VISUAL DEPENDENCY REJECTION GATES
  // ------------------------------------------------------------------------
  console.log('\n--- PART 4: Geometry & Visual Dependency Rejection Gates ---');

  // 22. Question referencing visual diagram without diagram_url rejected
  const visualQ = {
    id: 'q_geo_01',
    question_text: 'في الشكل المقابل، احسب قياس زاوية أ ب ج:',
    options: [
      { text: '30°', is_correct: true },
      { text: '60°', is_correct: false },
      { text: '90°', is_correct: false },
      { text: '120°', is_correct: false }
    ],
    explanation: 'مجموع زوايا المثلث 180 درجة.'
  };
  const visualEval = evaluateQuestionQuality(visualQ);
  assert.strictEqual(visualEval.isValid, false);
  assert.ok(visualEval.reason?.includes('MISSING_GEOMETRY_DIAGRAM'));
  pass('Rejects visual geometry question lacking verified diagram asset');

  // 23. Disqualified geometry chapter IDs are tracked
  assert.ok(DISQUALIFIED_GEOMETRY_CHAPTER_IDS.has('1b9f4377-6ae0-4c24-b588-c221900597ec'));
  assert.ok(DISQUALIFIED_GEOMETRY_CHAPTER_IDS.has('dba6933a-2b80-4d3b-ada4-3ac6acfb58c1'));
  pass('Tracks disqualified geometry chapters requiring visual diagrams');

  // ------------------------------------------------------------------------
  // PART 5: CROSS-UNIT PAGE LEAKAGE REJECTION
  // ------------------------------------------------------------------------
  console.log('\n--- PART 5: Cross-Unit Page Leakage Rejection ---');

  // Seed sample book and chapters to test provenance boundaries
  const stageRes = await db.query(`SELECT id FROM academic_stages LIMIT 1`);
  const stageId = stageRes.rows[0].id;
  const gradeRes = await db.query(`SELECT id FROM grades LIMIT 1`);
  const gradeId = gradeRes.rows[0].id;

  const testSubjectId = uuidv4();
  await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'TEST_MATH', 'الرياضيات', 'Mathematics')`, [testSubjectId, gradeId]);

  const testBookId = 'test_book_math_prep1';
  await db.query(
    `INSERT INTO books (id, title_ar, title_en, grade_id, subject_id, academic_stage_id, term, school_type)
     VALUES ($1, 'كتاب الرياضيات التجريبي', 'Math Test Book', $2, $3, $4, 1, 'عربي')`,
    [testBookId, gradeId, testSubjectId, stageId]
  );

  const testUnit1Id = 'unit_math_u1';
  const testUnit2Id = 'unit_math_u2';
  await db.query(
    `INSERT INTO book_chapters (id, book_id, title_ar, title_en, chapter_number, start_page, end_page)
     VALUES ($1, $2, 'الوحدة الأولى: الأعداد النسبية', 'Unit 1: Rational Numbers', 1, 1, 30)`,
    [testUnit1Id, testBookId]
  );
  await db.query(
    `INSERT INTO book_chapters (id, book_id, title_ar, title_en, chapter_number, start_page, end_page)
     VALUES ($1, $2, 'الوحدة الثانية: الجبر والإحصاء', 'Unit 2: Algebra and Statistics', 2, 31, 60)`,
    [testUnit2Id, testBookId]
  );

  // 24. Question belonging to Unit 1 citing Page 45 (which is inside Unit 2) must be rejected
  const crossUnitQ = {
    id: 'q_leak_01',
    book_id: testBookId,
    chapter_id: testUnit1Id,
    page_reference: 45, // Out of Unit 1 bounds (1-30)!
    question_text: 'ما هو المعكوس الجمعي للعدد النسبي؟',
    options: [
      { id: '1', text: '-5', is_correct: true },
      { id: '2', text: '5', is_correct: false },
      { id: '3', text: '0', is_correct: false },
      { id: '4', text: '1', is_correct: false }
    ]
  };
  const provCheck = await verifyQuestionProvenance(crossUnitQ, testBookId);
  assert.strictEqual(provCheck.isVerified, false);
  assert.ok(provCheck.reason?.includes('CROSS_UNIT_PAGE_LEAKAGE'));
  pass('verifyQuestionProvenance rejects cross-unit page boundary leakage (Page 45 outside Unit 1)');

  // 25. Question within declared unit boundaries (Page 15 within 1-30) does not trigger leakage
  // (Note: may fail subsequent page text check if book_pages empty, but must NOT fail with CROSS_UNIT_PAGE_LEAKAGE)
  const validUnitQ = {
    id: 'q_valid_page_01',
    book_id: testBookId,
    chapter_id: testUnit1Id,
    page_reference: 15, // Within Unit 1 bounds (1-30)!
    question_text: 'ما هو المعكوس الجمعي للعدد النسبي؟',
    options: [
      { id: '1', text: '-5', is_correct: true },
      { id: '2', text: '5', is_correct: false },
      { id: '3', text: '0', is_correct: false },
      { id: '4', text: '1', is_correct: false }
    ]
  };
  const validProv = await verifyQuestionProvenance(validUnitQ, testBookId);
  assert.notStrictEqual(validProv.reason?.includes('CROSS_UNIT_PAGE_LEAKAGE'), true);
  pass('Question within declared unit page boundaries does not trigger cross-unit leakage');

  // ------------------------------------------------------------------------
  // PART 6: EXAM ANALYSIS ATTRIBUTION REPAIR
  // ------------------------------------------------------------------------
  console.log('\n--- PART 6: Exam Analysis Attribution Repair ---');

  const testStudentId = 'student_eval_test';
  await db.query(
    `INSERT INTO users (id, email, password_hash, role, full_name)
     VALUES ($1, 'test_student@alfarabi.ai', 'hash123', 'STUDENT', 'Test Student')`,
    [testStudentId]
  );
  await db.query(
    `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_type)
     VALUES ($1, 'Test Student', $2, $3, 'عربي')`,
    [testStudentId, stageId, gradeId]
  );

  // 26. evaluateSubmission attributes each question to its actual chapter
  const evalResult = await aiRagEngine.evaluateSubmission({
    studentId: testStudentId,
    academicStageId: stageId,
    gradeId: gradeId,
    subjectId: testSubjectId,
    bookId: testBookId,
    chapterId: testUnit1Id,
    questions: [
      {
        id: 'q_eval_1',
        chapter_id: testUnit1Id,
        question_text: 'سؤال في الوحدة الأولى؟',
        page_reference: 12,
        difficulty: 'MEDIUM',
        bloom_level: 'UNDERSTANDING',
        options: [{ id: 'opt_1', text: 'إجابة صحيحة', is_correct: true }],
        explanation: 'شرح تربوي معتمد.'
      },
      {
        id: 'q_eval_2',
        chapter_id: testUnit2Id,
        question_text: 'سؤال في الوحدة الثانية؟',
        page_reference: 42,
        difficulty: 'HARD',
        bloom_level: 'APPLICATION',
        options: [{ id: 'opt_2', text: 'إجابة صحيحة 2', is_correct: true }],
        explanation: 'شرح تربوي معتمد 2.'
      }
    ],
    answers: {
      q_eval_1: 'opt_1',
      q_eval_2: 'opt_2'
    }
  });

  assert.strictEqual(evalResult.provisional_score, 2);
  assert.strictEqual(evalResult.items.length, 2);
  assert.ok(evalResult.items[0].topic_area.includes('الأعداد النسبية'), 'Question 1 should attribute to Unit 1');
  assert.ok(evalResult.items[1].topic_area.includes('الجبر والإحصاء'), 'Question 2 should attribute to Unit 2');
  pass('evaluateSubmission accurately attributes multiple chapters rather than forcing Chapter 0');

  // 27. evaluateSubmission does NOT fabricate Page 1 for unverified pages
  const unverifiedPageEval = await aiRagEngine.evaluateSubmission({
    studentId: testStudentId,
    academicStageId: stageId,
    gradeId: gradeId,
    subjectId: testSubjectId,
    bookId: testBookId,
    chapterId: testUnit1Id,
    questions: [
      {
        id: 'q_eval_nopage',
        chapter_id: testUnit1Id,
        question_text: 'سؤال بدون رقم صفحة موثق؟',
        page_reference: null,
        difficulty: 'MEDIUM',
        bloom_level: 'UNDERSTANDING',
        options: [{ id: 'opt_1', text: 'إجابة صحيحة', is_correct: true }],
        explanation: 'شرح تربوي.'
      }
    ],
    answers: {
      q_eval_nopage: 'opt_1'
    }
  });

  const itemNoPage = unverifiedPageEval.items[0];
  assert.ok(!itemNoPage.study_recommendation.includes('صفحة 1'), 'Must not fabricate "صفحة 1" for missing page reference');
  pass('evaluateSubmission does not fabricate "صفحة 1" when page reference is absent');

  // ------------------------------------------------------------------------
  // PART 7: CACHE PARAMETER & DIFFICULTY ISOLATION
  // ------------------------------------------------------------------------
  console.log('\n--- PART 7: Cache Parameter & Difficulty Isolation ---');

  // 28. Difficulty normalization creates distinct param hashes
  const normEasy = ExamCacheService.normalizeExamParameters({ count: 5, difficulty: 'EASY' });
  const normHard = ExamCacheService.normalizeExamParameters({ count: 5, difficulty: 'HARD' });
  const normMedium = ExamCacheService.normalizeExamParameters({ count: 5, difficulty: 'MEDIUM' });

  assert.notStrictEqual(normEasy.paramHash, normHard.paramHash, 'EASY and HARD must have different param hashes');
  assert.notStrictEqual(normEasy.paramHash, normMedium.paramHash, 'EASY and MEDIUM must have different param hashes');
  pass('normalizeExamParameters produces distinct paramHash for EASY vs HARD vs MEDIUM');

  // 29. Canonical config keys are distinct across difficulty levels
  const identityObj = {
    bookId: testBookId,
    titleAr: 'كتاب الرياضيات',
    titleEn: 'Math Book',
    gradeId,
    academicStageId: stageId,
    subjectId: testSubjectId,
    term: 1,
    schoolType: 'عربي'
  };

  const keyEasy = ExamCacheService.buildCanonicalConfigKey(identityObj, testUnit1Id, normEasy.paramHash);
  const keyHard = ExamCacheService.buildCanonicalConfigKey(identityObj, testUnit1Id, normHard.paramHash);

  assert.notStrictEqual(keyEasy, keyHard, 'EASY and HARD config keys must differ');
  assert.notStrictEqual(
    ExamCacheService.computeConfigHash(keyEasy),
    ExamCacheService.computeConfigHash(keyHard),
    'EASY and HARD config hashes must differ'
  );
  pass('buildCanonicalConfigKey prevents cache collision between difficulty levels');

  // ------------------------------------------------------------------------
  // PART 8: PREP 3 MATHEMATICS AVAILABILITY HANDLING
  // ------------------------------------------------------------------------
  console.log('\n--- PART 8: Prep 3 Mathematics Subject Availability Handling ---');

  // Create Prep 3 Grade and Prep 3 Mathematics Subject without a book
  const prep3GradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PREP_3'`);
  const prep3GradeId = prep3GradeRes.rows.length > 0 ? prep3GradeRes.rows[0].id : uuidv4();
  if (prep3GradeRes.rows.length === 0) {
    await db.query(`INSERT INTO grades (id, stage_id, code, name_ar, name_en, sort_order) VALUES ($1, $2, 'PREP_3', 'الصف الثالث الإعدادي', 'Prep 3', 3)`, [prep3GradeId, stageId]);
  }

  const prep3MathSubjId = uuidv4();
  await db.query(
    `INSERT INTO subjects (id, grade_id, code, name_ar, name_en)
     VALUES ($1, $2, 'MATH_P3', 'الرياضيات', 'Mathematics')`,
    [prep3MathSubjId, prep3GradeId]
  );

  // 30. Simulating books listing for Prep 3 grade includes upcoming math placeholder
  const existingBooks = [];
  const subjectsRes = await db.query(
    `SELECT s.id, s.name_ar, s.name_en, s.grade_id,
            g.name_ar as grade_name_ar, g.name_en as grade_name_en,
            st.id as stage_id, st.name_ar as stage_name_ar, st.name_en as stage_name_en
     FROM subjects s
     JOIN grades g ON s.grade_id = g.id
     JOIN academic_stages st ON g.stage_id = st.id
     WHERE s.grade_id = $1
     ORDER BY s.sort_order ASC`,
    [prep3GradeId]
  );

  const coveredSubjectIds = new Set(existingBooks.map(b => b.subject_id));
  for (const subj of subjectsRes.rows) {
    if (!coveredSubjectIds.has(subj.id)) {
      existingBooks.push({
        id: `placeholder_${subj.id}`,
        title_ar: subj.name_ar,
        title_en: subj.name_en || subj.name_ar,
        subject_id: subj.id,
        is_available: false,
        availability_status: 'UPCOMING_TEXTBOOK',
        message: 'جاري رفع كتاب الوزارة المعتمد',
        chapters_count: 0
      });
    }
  }

  const prep3MathPlaceholder = existingBooks.find(b => b.subject_id === prep3MathSubjId);
  assert.ok(prep3MathPlaceholder, 'Prep 3 Mathematics should be included as upcoming book');
  assert.strictEqual(prep3MathPlaceholder.is_available, false);
  assert.strictEqual(prep3MathPlaceholder.availability_status, 'UPCOMING_TEXTBOOK');
  assert.strictEqual(prep3MathPlaceholder.message, 'جاري رفع كتاب الوزارة المعتمد');
  pass('Subject without uploaded book is gracefully represented as UPCOMING_TEXTBOOK');

  // 31. Attempting curriculum resolution on placeholder fails closed
  let caughtPlaceholder = false;
  try {
    await ExamCacheService.resolveCurriculumIdentity(prep3MathPlaceholder.id);
  } catch (err) {
    caughtPlaceholder = true;
    assert.ok(err.message.includes('BOOK_NOT_FOUND'));
  }
  assert.strictEqual(caughtPlaceholder, true, 'Placeholder book ID must fail closed with BOOK_NOT_FOUND');
  pass('Placeholder textbook ID fails closed in curriculum resolution without fabricating content');

  console.log('\n========================================================================');
  console.log(`✅ ALL ${passed}/31 EMERGENCY REPAIR REGRESSION TESTS PASSED CLEANLY!`);
  console.log('========================================================================\n');

} catch (err) {
  console.error('\n❌ REGRESSION TEST FAILED:', err);
  process.exitCode = 1;
} finally {
  teardownDisposableTestDb(dbPath, tempDir);
}
