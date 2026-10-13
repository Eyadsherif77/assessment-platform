import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import assert from 'assert';
import { db } from '../dist/db/db.js';
import { ExamCacheService } from '../dist/services/examCacheService.js';
import { AnswerValidationService } from '../dist/services/answerValidationService.js';

async function runTestSuite() {
  console.log('========================================================================');
  console.log('🧪 TEST SUITE: PHASE 4D — PROVENANCE INTEGRITY & ANSWER-KEY VALIDATION');
  console.log('========================================================================\n');

  await db.init();

  // 1. Audit pre-test baseline of protected tables
  const protectedExpected = {
    users: 229,
    student_profiles: 226,
    books: 13,
    book_pages: 1594,
    book_chunks: 1373,
    book_chapters: 54,
    book_pdf_chunks: 314
  };

  for (const [t, exp] of Object.entries(protectedExpected)) {
    const res = await db.query(`SELECT count(*) as cnt FROM ${t}`);
    const actual = Number(res.rows[0].cnt);
    assert.strictEqual(actual, exp, `Baseline mismatch on ${t}: ${actual} vs ${exp}`);
  }
  console.log('✅ Pre-test protected baseline verified (All 7 tables intact).\n');

  // Load test fixtures from real books:
  // Book A: Arabic Prep 1, term 1 ('0758fc7a-c9b2-4e25-a32b-6cacb6bb418d')
  const bookAId = '0758fc7a-c9b2-4e25-a32b-6cacb6bb418d';
  const identityA = await ExamCacheService.resolveCurriculumIdentity(bookAId);

  // Book B: Science Prep 1, term 1 ('d7bbfca2-6d8f-461b-8e39-2015981e86ec')
  const bookBId = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec';
  const identityB = await ExamCacheService.resolveCurriculumIdentity(bookBId);

  // Fetch real chapters for Book A
  const chaptersARes = await db.query(
    'SELECT id, chapter_number, start_page, end_page, title_ar FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number',
    [bookAId]
  );
  assert(chaptersARes.rows.length >= 2, 'Book A must have at least 2 chapters');
  const chapterA1 = chaptersARes.rows[0];
  const chapterA2 = chaptersARes.rows[1];
  console.log(`Book A Chapter 1: "${chapterA1.title_ar}" (Pages ${chapterA1.start_page} to ${chapterA1.end_page})`);
  console.log(`Book A Chapter 2: "${chapterA2.title_ar}" (Pages ${chapterA2.start_page} to ${chapterA2.end_page})`);

  // Fetch real chunks and pages for Book A and Book B
  const chunkA1Res = await db.query(
    'SELECT id, book_id, chapter_id, page_number FROM book_chunks WHERE book_id = $1 AND page_number >= $2 AND page_number <= $3 LIMIT 2',
    [bookAId, chapterA1.start_page, chapterA1.end_page]
  );
  assert(chunkA1Res.rows.length > 0, 'Must have at least 1 chunk for Book A Chapter 1');
  const chunkA1 = chunkA1Res.rows[0];

  const chunkA2Res = await db.query(
    'SELECT id, book_id, chapter_id, page_number FROM book_chunks WHERE book_id = $1 AND page_number >= $2 AND page_number <= $3 LIMIT 2',
    [bookAId, chapterA2.start_page, chapterA2.end_page]
  );
  assert(chunkA2Res.rows.length > 0, 'Must have at least 1 chunk for Book A Chapter 2');
  const chunkA2 = chunkA2Res.rows[0];

  const chunkBRes = await db.query(
    'SELECT id, book_id, chapter_id, page_number FROM book_chunks WHERE book_id = $1 LIMIT 1',
    [bookBId]
  );
  const chunkB = chunkBRes.rows[0];

  // Fetch eligible Prep 1 student
  const studentRes = await db.query(`
    SELECT sp.user_id 
    FROM student_profiles sp 
    JOIN grades g ON sp.grade_id = g.id 
    WHERE g.code = 'PREP_1' LIMIT 2
  `);
  const student1 = studentRes.rows[0].user_id;
  const student2 = studentRes.rows[1].user_id;

  try {
    await ExamCacheService.clearCache();

    // =========================================================================
    // SECTION 1: PROVENANCE INTEGRITY TESTS
    // =========================================================================
    console.log('\n--- SECTION 1: PROVENANCE INTEGRITY TESTS ---');

    // TEST 1: Valid page reference for the correct book
    console.log('1. Valid page reference for the correct book:');
    const qValidPage = [
      {
        id: 'q1',
        question_text: 'سؤال موثق بصفحة صحيحة',
        page_reference: chunkA1.page_number,
        options: [{ id: 'opt1', text: 'خيار 1' }, { id: 'opt2', text: 'خيار 2' }],
        correct_answer: 'opt1'
      }
    ];
    const prov1 = await ExamCacheService.verifyExamQuestionsProvenance(qValidPage, bookAId);
    assert.strictEqual(prov1.isVerified, true, 'Valid page reference must be verified');
    console.log('  ✅ [PASS] Valid page reference verified successfully.');

    // TEST 2: Page reference belonging to a different book (or non-existent page)
    console.log('2. Page reference belonging to a different book / non-existent:');
    const qInvalidPage = [
      {
        id: 'q2',
        question_text: 'سؤال بصفحة غير موجودة',
        page_reference: 99999,
        options: [{ id: 'opt1', text: 'خيار 1' }, { id: 'opt2', text: 'خيار 2' }],
        correct_answer: 'opt1'
      }
    ];
    const prov2 = await ExamCacheService.verifyExamQuestionsProvenance(qInvalidPage, bookAId);
    assert.strictEqual(prov2.isVerified, false, 'Non-existent page must fail provenance');
    assert(prov2.reason?.includes('PAGE_NOT_FOUND'));
    console.log(`  ✅ [PASS] Invalid page rejected: ${prov2.reason}`);

    // TEST 3: Valid chunk reference for the correct book
    console.log('3. Valid chunk reference for the correct book:');
    const qValidChunk = [
      {
        id: 'q3',
        question_text: 'سؤال موثق بقطعة نصية صحيحة',
        chunk_id: chunkA1.id,
        options: [{ id: 'opt1', text: 'خيار 1' }, { id: 'opt2', text: 'خيار 2' }],
        correct_answer: 'opt1'
      }
    ];
    const prov3 = await ExamCacheService.verifyExamQuestionsProvenance(qValidChunk, bookAId);
    assert.strictEqual(prov3.isVerified, true, 'Valid chunk reference must be verified');
    console.log('  ✅ [PASS] Valid chunk reference verified successfully.');

    // TEST 4: Chunk reference belonging to a different book
    console.log('4. Chunk reference belonging to a different book:');
    const qCrossBookChunk = [
      {
        id: 'q4',
        question_text: 'سؤال بقطعة تابعة لكتاب آخر',
        chunk_id: chunkB.id,
        options: [{ id: 'opt1', text: 'خيار 1' }, { id: 'opt2', text: 'خيار 2' }],
        correct_answer: 'opt1'
      }
    ];
    const prov4 = await ExamCacheService.verifyExamQuestionsProvenance(qCrossBookChunk, bookAId);
    assert.strictEqual(prov4.isVerified, false, 'Chunk from different book must be rejected');
    assert(prov4.reason?.includes('CHUNK_NOT_FOUND'));
    console.log(`  ✅ [PASS] Cross-book chunk reference rejected: ${prov4.reason}`);

    // TEST 5: Both references valid and mutually consistent
    console.log('5. Both references valid and mutually consistent (page === chunk.page):');
    const qConsistentDual = [
      {
        id: 'q5',
        question_text: 'سؤال موثق بصفحة وقطعة متطابقتين',
        page_reference: chunkA1.page_number,
        chunk_id: chunkA1.id,
        options: [{ id: 'opt1', text: 'خيار 1' }, { id: 'opt2', text: 'خيار 2' }],
        correct_answer: 'opt1'
      }
    ];
    const prov5 = await ExamCacheService.verifyExamQuestionsProvenance(qConsistentDual, bookAId);
    assert.strictEqual(prov5.isVerified, true, 'Consistent dual references must be verified');
    console.log('  ✅ [PASS] Consistent dual references verified.');

    // TEST 6: Valid page combined with contradictory chunk from another page
    console.log('6. Valid page reference combined with contradictory chunk from another page:');
    const contradictoryPage = chunkA1.page_number + 10;
    // ensure contradictoryPage exists in book_pages
    const pageCheck = await db.query('SELECT page_number FROM book_pages WHERE book_id = $1 AND page_number = $2', [bookAId, contradictoryPage]);
    assert(pageCheck.rows.length > 0, 'Page exists in book A');

    const qContradictory = [
      {
        id: 'q6',
        question_text: 'سؤال ببيانات توثيق متناقضة',
        page_reference: contradictoryPage,
        chunk_id: chunkA1.id, // belongs to chunkA1.page_number !== contradictoryPage
        options: [{ id: 'opt1', text: 'خيار 1' }, { id: 'opt2', text: 'خيار 2' }],
        correct_answer: 'opt1'
      }
    ];
    const prov6 = await ExamCacheService.verifyExamQuestionsProvenance(qContradictory, bookAId);
    assert.strictEqual(prov6.isVerified, false, 'Contradictory provenance must be rejected');
    assert(prov6.reason?.includes('CONTRADICTORY_PROVENANCE'));
    console.log(`  ✅ [PASS] Contradictory provenance rejected: ${prov6.reason}`);

    // TEST 7: Missing or invalid references
    console.log('7. Missing or invalid references:');
    const qMissingRefs = [
      {
        id: 'q7',
        question_text: 'سؤال بدون أي توثيق',
        options: [{ id: 'opt1', text: 'خيار 1' }, { id: 'opt2', text: 'خيار 2' }],
        correct_answer: 'opt1'
      }
    ];
    const prov7 = await ExamCacheService.verifyExamQuestionsProvenance(qMissingRefs, bookAId);
    assert.strictEqual(prov7.isVerified, false, 'Missing references must fail');
    assert(prov7.reason?.includes('UNGROUNDED_QUESTION'));
    console.log(`  ✅ [PASS] Ungrounded question rejected: ${prov7.reason}`);

    // TEST 8: Sources outside the selected unit/chapter scope
    console.log('8. Sources outside the selected unit/chapter scope:');
    // Unit 1 selected, but question references chunk/page from Unit 2
    const qOutsideScope = [
      {
        id: 'q8',
        question_text: 'سؤال من خارج نطاق الفصل المحدد',
        page_reference: chunkA2.page_number,
        chunk_id: chunkA2.id,
        options: [{ id: 'opt1', text: 'خيار 1' }, { id: 'opt2', text: 'خيار 2' }],
        correct_answer: 'opt1'
      }
    ];
    const prov8 = await ExamCacheService.verifyExamQuestionsProvenance(qOutsideScope, bookAId, [chapterA1.id]);
    assert.strictEqual(prov8.isVerified, false, 'Out-of-scope question must be rejected');
    assert(prov8.reason?.includes('PROVENANCE_OUTSIDE_UNIT_SCOPE'));
    console.log(`  ✅ [PASS] Out-of-scope question rejected: ${prov8.reason}`);

    // =========================================================================
    // SECTION 2: ANSWER-KEY & STRUCTURAL INTEGRITY VALIDATION
    // =========================================================================
    console.log('\n--- SECTION 2: ANSWER-KEY & STRUCTURAL INTEGRITY TESTS ---');

    // TEST 9: Invalid / orphan correct_answer identifiers
    console.log('9. Invalid/orphan correct_answer identifiers:');
    const qOrphanAnswer = {
      id: 'q_orphan',
      question_text: 'ما هي عاصمة جمهورية مصر العربية؟',
      options: [
        { id: 'opt_a', text: 'القاهرة' },
        { id: 'opt_b', text: 'الإسكندرية' }
      ],
      correct_answer: 'opt_z' // does not exist
    };
    const ansVal9 = AnswerValidationService.validateQuestion(qOrphanAnswer);
    assert.strictEqual(ansVal9.isStructurallyValid, false);
    assert.strictEqual(ansVal9.structuralStatus, 'ORPHAN_CORRECT_ANSWER');
    assert.strictEqual(ansVal9.answerKeyStatus, 'REJECTED');
    console.log(`  ✅ [PASS] Orphan correct_answer rejected: ${ansVal9.reason}`);

    // TEST 10: Missing or duplicate answer options
    console.log('10. Missing or duplicate answer options:');
    const qDuplicateOptions = {
      id: 'q_dup',
      question_text: 'سؤال يحتوي على خيارات مكررة',
      options: [
        { id: 'opt_1', text: 'الخيار المشترك' },
        { id: 'opt_2', text: 'الخيار المشترك' }
      ],
      correct_answer: 'opt_1'
    };
    const ansVal10 = AnswerValidationService.validateQuestion(qDuplicateOptions);
    assert.strictEqual(ansVal10.isStructurallyValid, false);
    assert.strictEqual(ansVal10.structuralStatus, 'DUPLICATE_OPTIONS');
    assert.strictEqual(ansVal10.answerKeyStatus, 'REJECTED');
    console.log(`  ✅ [PASS] Duplicate option text rejected: ${ansVal10.reason}`);

    const qMissingOpts = {
      id: 'q_missing',
      question_text: 'سؤال بخيار واحد فقط',
      options: [{ id: 'opt_1', text: 'خيار وحيد' }],
      correct_answer: 'opt_1'
    };
    const ansVal10b = AnswerValidationService.validateQuestion(qMissingOpts);
    assert.strictEqual(ansVal10b.isStructurallyValid, false);
    assert.strictEqual(ansVal10b.structuralStatus, 'MISSING_OPTIONS');
    console.log(`  ✅ [PASS] Single-option question rejected: ${ansVal10b.reason}`);

    // TEST 11: Deterministically verifiable correct math answers
    console.log('11. Deterministically verifiable correct math answers:');
    const qCorrectMath = {
      id: 'q_math_correct',
      question_text: 'احسب ناتج: 15 + 27 = ؟',
      options: [
        { id: 'opt_1', text: '40' },
        { id: 'opt_2', text: '42' },
        { id: 'opt_3', text: '45' }
      ],
      correct_answer: 'opt_2' // 42 is correct
    };
    const ansVal11 = AnswerValidationService.validateQuestion(qCorrectMath);
    assert.strictEqual(ansVal11.isStructurallyValid, true);
    assert.strictEqual(ansVal11.answerKeyStatus, 'DETERMINISTICALLY_VERIFIED');
    assert.strictEqual(ansVal11.isAnswerKeyVerified, true);
    assert.strictEqual(ansVal11.verificationMethod, 'DETERMINISTIC_MATH');
    assert.strictEqual(ansVal11.requiresTeacherReview, false);
    assert.strictEqual(ansVal11.deterministicCalculation?.expectedValue, 42);
    console.log('  ✅ [PASS] Correct math question deterministically verified without AI.');

    // TEST 12: Deterministically verifiable INCORRECT math answers (contradictory answer key)
    console.log('12. Deterministically verifiable INCORRECT math answers:');
    const qWrongMath = {
      id: 'q_math_wrong',
      question_text: 'احسب ناتج: 15 + 27 = ؟',
      options: [
        { id: 'opt_1', text: '40' },
        { id: 'opt_2', text: '42' },
        { id: 'opt_3', text: '45' }
      ],
      correct_answer: 'opt_1' // Erroneous answer key: indicates 40 instead of 42
    };
    const ansVal12 = AnswerValidationService.validateQuestion(qWrongMath);
    assert.strictEqual(ansVal12.isStructurallyValid, true);
    assert.strictEqual(ansVal12.answerKeyStatus, 'REJECTED');
    assert.strictEqual(ansVal12.isAnswerKeyVerified, false);
    assert(ansVal12.reason?.includes('DETERMINISTIC_MATH_MISMATCH'));
    console.log(`  ✅ [PASS] Erroneous math answer key rejected: ${ansVal12.reason}`);

    // TEST 13: Semantically uncertain questions remain in explicit review state (PENDING_REVIEW)
    console.log('13. Semantically uncertain questions remain unapproved (PENDING_REVIEW):');
    const qSemantic = {
      id: 'q_semantic',
      question_text: 'ما هو الفكرة الرئيسة في نص مواقف إنسانية؟',
      options: [
        { id: 'opt_1', text: 'مساعدة الضعفاء ورعاية المحتاجين' },
        { id: 'opt_2', text: 'التجارة والربح السريع' },
        { id: 'opt_3', text: 'السفر والترحال' }
      ],
      correct_answer: 'opt_1'
    };
    const ansVal13 = AnswerValidationService.validateQuestion(qSemantic);
    assert.strictEqual(ansVal13.isStructurallyValid, true);
    assert.strictEqual(ansVal13.answerKeyStatus, 'PENDING_REVIEW');
    assert.strictEqual(ansVal13.isAnswerKeyVerified, false);
    assert.strictEqual(ansVal13.verificationMethod, 'SEMANTIC_REVIEW_REQUIRED');
    assert.strictEqual(ansVal13.requiresTeacherReview, true);
    console.log('  ✅ [PASS] Semantic question safely routed to PENDING_REVIEW; not silently approved.');

    // =========================================================================
    // SECTION 3: CACHE STORAGE, SERVING, AND SAFETY ENFORCEMENT
    // =========================================================================
    console.log('\n--- SECTION 3: CACHE STORAGE & SERVING SAFETY ---');

    // TEST 14: Cache storage rejects exams with contradictory answer keys
    console.log('14. Cache storage rejects exams with invalid/contradictory answer keys:');
    let rejectedStorageThrown = false;
    try {
      await ExamCacheService.storeExamInCache({
        identity: identityA,
        unitIds: [chapterA1.id],
        examParams: { count: 1 },
        questions: [qWrongMath] // Math error 15 + 27 = 40
      });
    } catch (err) {
      rejectedStorageThrown = true;
      assert(err.message.includes('ANSWER_VALIDATION_REJECTED'));
      console.log(`  ✅ [PASS] Storage blocked for erroneous answer key: ${err.message}`);
    }
    assert.strictEqual(rejectedStorageThrown, true, 'Must reject storing exam with wrong answer key');

    // TEST 15: Unverified provenance questions never served as verified cached exams
    console.log('15. Unverified questions never served from cache (provenance_verified = 0):');
    const examUnverifiedProv = await ExamCacheService.storeExamInCache({
      identity: identityA,
      unitIds: [chapterA1.id],
      examParams: { count: 1, difficulty: 'HARD', language: 'ar' },
      questions: qInvalidPage // page 99999
    });
    assert.strictEqual(examUnverifiedProv.provenanceVerified, false, 'Record must be marked unverified');

    // Lookup in cache for student
    const lookupUnverified = await ExamCacheService.getCachedExamForStudent({
      studentId: student1,
      bookId: bookAId,
      chapterIds: chapterA1.id,
      examParams: { count: 1, difficulty: 'HARD', language: 'ar' }
    });
    assert.strictEqual(lookupUnverified.hit, false, 'Unverified exam must NEVER hit cache');
    assert.strictEqual(lookupUnverified.reason, 'CACHE_MISS');
    console.log('  ✅ [PASS] Unverified exam in database is shielded; student lookup returns CACHE_MISS.');

    // TEST 16: Cache hit preserves verification status and question review state
    console.log('16. Verified exam cache hit preserves answer-key review status:');
    const verifiedQuestions = [
      {
        id: 'q_v_1',
        question_text: 'احسب: 25 * 4 = ؟',
        page_reference: chunkA1.page_number,
        chunk_id: chunkA1.id,
        options: [
          { id: 'opt_1', text: '100' },
          { id: 'opt_2', text: '105' }
        ],
        correct_answer: 'opt_1'
      },
      {
        id: 'q_v_2',
        question_text: 'ما هي أهمية الأخلاق الكريمة في بناء المجتمع؟',
        page_reference: chunkA1.page_number,
        chunk_id: chunkA1.id,
        options: [
          { id: 'opt_a', text: 'تماسك المجتمع وتقدمه' },
          { id: 'opt_b', text: 'تفكك الروابط الأسرية' }
        ],
        correct_answer: 'opt_a'
      }
    ];

    const storedVerifiedExam = await ExamCacheService.storeExamInCache({
      identity: identityA,
      unitIds: [chapterA1.id],
      examParams: { count: 2, difficulty: 'MEDIUM', language: 'ar' },
      questions: verifiedQuestions,
      assignedStudentId: student1
    });

    assert.strictEqual(storedVerifiedExam.provenanceVerified, true, 'Exam provenance verified');

    // Student 2 requests exam for the same configuration -> CACHE_HIT
    const lookupStudent2 = await ExamCacheService.getCachedExamForStudent({
      studentId: student2,
      bookId: bookAId,
      chapterIds: chapterA1.id,
      examParams: { count: 2, difficulty: 'MEDIUM', language: 'ar' }
    });

    assert.strictEqual(lookupStudent2.hit, true, 'Eligible student 2 receives cache hit');
    assert.strictEqual(lookupStudent2.exam.examId, storedVerifiedExam.examId);
    
    // Verify question statuses are preserved on retrieval
    const retrievedQ1 = lookupStudent2.exam.questions[0];
    const retrievedQ2 = lookupStudent2.exam.questions[1];

    assert.strictEqual(retrievedQ1.answer_key_status, 'DETERMINISTICALLY_VERIFIED');
    assert.strictEqual(retrievedQ1.requires_teacher_review, false);

    assert.strictEqual(retrievedQ2.answer_key_status, 'PENDING_REVIEW');
    assert.strictEqual(retrievedQ2.requires_teacher_review, true);
    console.log('  ✅ [PASS] Cache hit faithfully preserved explicit review states (deterministic vs pending review).');

    // =========================================================================
    // CLEANUP TEST DATA AND AUDIT POST-TEST BASELINE
    // =========================================================================
    await ExamCacheService.clearCache();
    console.log('\n✅ Test cache cleared successfully.');

  } finally {
    await ExamCacheService.clearCache();

    // 4. Verify post-test baseline of protected tables
    console.log('\n--- POST-TEST INTEGRITY AUDIT ---');
    for (const [t, exp] of Object.entries(protectedExpected)) {
      const res = await db.query(`SELECT count(*) as cnt FROM ${t}`);
      const actual = Number(res.rows[0].cnt);
      assert.strictEqual(actual, exp, `Post-test baseline corrupted on ${t}: ${actual} vs ${exp}`);
    }
    console.log('✅ Post-test protected baseline verified (All 7 tables intact at exact counts).');

    // Verify clean slate preserved
    const cachedExamCount = await db.query('SELECT count(*) as cnt FROM shared_cached_exams');
    const asgnCount = await db.query('SELECT count(*) as cnt FROM student_exam_assignments');
    assert.strictEqual(Number(cachedExamCount.rows[0].cnt), 0, 'shared_cached_exams must be clean');
    assert.strictEqual(Number(asgnCount.rows[0].cnt), 0, 'student_exam_assignments must be clean');
    console.log('✅ Clean-slate preserved: shared_cached_exams = 0, student_exam_assignments = 0.\n');
  }

  console.log('========================================================================');
  console.log('🎉 ALL 16 TESTS PASSED: PROVENANCE INTEGRITY & ANSWER-KEY VALIDATION OK');
  console.log('========================================================================');
}

runTestSuite().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
