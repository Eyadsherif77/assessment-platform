import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import { ExamCacheService } from '../dist/services/examCacheService.js';

async function runTestSuite() {
  console.log('========================================================================');
  console.log('🧪 AUTOMATED TEST SUITE: STRICT CURRICULUM IDENTITY & SHARED EXAM CACHE');
  console.log('========================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName, details = '') {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      if (details) console.log(`     ${details}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      if (details) console.error(`     FAILURE: ${details}`);
    }
  }

  // Clear cache before test runs
  await ExamCacheService.clearCache();

  // Test Entities from Database
  const book1Id = '0758fc7a-c9b2-4e25-a32b-6cacb6bb418d'; // Book 1: Prep 1 Arabic (Term 1, 'كلاهما')
  const book6Id = 'bc6bb834-7192-474c-8507-c53265028b4e'; // Book 6: Prep 2 Arabic (Term 1, 'كلاهما')
  const book3Id = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec'; // Book 3: Prep 1 Science (Term 1, 'لغات')

  const studentA = '09d17236-fc6e-445a-89c8-690684a071d8'; // Adam: Prep 1, 'لغات'
  const studentB = '11722110-fbc7-4412-b565-c03c171f6530'; // Fayrouz: Prep 1, 'لغات'
  const studentC = '053c5aea-ae55-4d2d-b3e3-39f184a36e61'; // Alia: Prep 2, 'لغات'

  // Fetch actual unit IDs for Book 1
  const b1Chapters = (await db.query(`SELECT id FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC`, [book1Id])).rows;
  const b1Unit1 = b1Chapters[0].id;
  const b1Unit2 = b1Chapters[1].id;

  // Fetch actual unit IDs for Book 6
  const b6Chapters = (await db.query(`SELECT id FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC`, [book6Id])).rows;
  const b6Unit1 = b6Chapters[0].id;

  console.log('--- TEST 1: Identical Configuration Cache Reuse (Two Eligible Students) ---');
  {
    // Step A: Student A checks cache (should miss)
    const lookupA = await ExamCacheService.getCachedExamForStudent({
      studentId: studentA,
      bookId: book1Id,
      chapterIds: [b1Unit1],
      examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' }
    });
    assert(lookupA.hit === false && lookupA.reason === 'CACHE_MISS', 'Student A initial lookup is CACHE_MISS', `Cache key: ${lookupA.cacheKey.slice(0, 60)}...`);

    // Step B: Store generated exam in cache for Student A
    const mockQuestions = [
      { id: 'q1', question_text: 'سؤال الأول عن اللغة العربية', options: [] },
      { id: 'q2', question_text: 'سؤال الثاني عن القراءة', options: [] },
      { id: 'q3', question_text: 'سؤال الثالث عن النحو', options: [] }
    ];
    await ExamCacheService.storeExamInCache({
      examId: 'exam_test_001',
      identity: lookupA.curriculumIdentity,
      unitIds: [b1Unit1],
      examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' },
      questions: mockQuestions,
      assignedStudentId: studentA,
      skipProvenanceCheck: true
    });
    assert((await ExamCacheService.getCacheSize()) === 1, 'Exam successfully cached in registry');

    // Step C: Student B (eligible, same grade & curriculum) requests exact same configuration
    const lookupB = await ExamCacheService.getCachedExamForStudent({
      studentId: studentB,
      bookId: book1Id,
      chapterIds: [b1Unit1],
      examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' }
    });
    assert(
      lookupB.hit === true && lookupB.reason === 'CACHE_HIT' && lookupB.exam?.examId === 'exam_test_001',
      'Student B receives CACHE_HIT and reuses the exact cached exam',
      `Reused examId: ${lookupB.exam?.examId}`
    );

    // Record assignment for Student B
    const assignRes = await ExamCacheService.recordStudentAssignment(lookupB.cacheKey, studentB, lookupB.exam?.examId);
    assert(assignRes.success === true, 'Student B assignment recorded independently without overwriting Student A');
  }

  console.log('\n--- TEST 2: Student No-Repeat Rule (Exclusion of Previously Assigned Exam) ---');
  {
    // Student A requests the exact same configuration again
    const lookupA2 = await ExamCacheService.getCachedExamForStudent({
      studentId: studentA,
      bookId: book1Id,
      chapterIds: [b1Unit1],
      examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' }
    });
    assert(
      lookupA2.hit === false && (lookupA2.reason === 'ALL_VERSIONS_ASSIGNED' || lookupA2.reason === 'STUDENT_NO_REPEAT_EXCLUSION'),
      'Student A is excluded from reusing previously assigned exam under No-Repeat Rule',
      `Reason: ${lookupA2.reason}`
    );
  }

  console.log('\n--- TEST 3: Negative Test — Different Book ID (Even if Subject Name Matches) ---');
  {
    // Both Book 1 and Book 6 are "اللغة العربية". Lookup for Book 6 must NOT reuse Book 1's cache.
    const lookupBook6 = await ExamCacheService.getCachedExamForStudent({
      studentId: studentC, // Eligible for Prep 2
      bookId: book6Id,
      chapterIds: [b6Unit1],
      examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' }
    });
    assert(
      lookupBook6.hit === false && lookupBook6.reason === 'CACHE_MISS',
      'Cached exam for Book 1 is NOT reused for Book 6 despite identical subject label ("اللغة العربية")',
      `Book 1 ID != Book 6 ID (${book1Id.slice(0, 8)} vs ${book6Id.slice(0, 8)})`
    );
  }

  console.log('\n--- TEST 4: Negative Test — Grade ID & Academic Stage ID Mismatch ---');
  {
    const identityB1 = await ExamCacheService.resolveCurriculumIdentity(book1Id);
    
    // Inconsistent Grade ID
    const gradeMismatch = ExamCacheService.validateSelectionConsistency(identityB1, {
      gradeId: '44d13655-da95-4425-8566-fd8451af1965' // Prep 2 grade ID for Prep 1 book
    });
    assert(
      gradeMismatch.isValid === false && gradeMismatch.error?.includes('GRADE_MISMATCH'),
      'Contradictory grade ID is rejected with GRADE_MISMATCH',
      gradeMismatch.error
    );

    // Inconsistent Stage ID
    const stageMismatch = ExamCacheService.validateSelectionConsistency(identityB1, {
      academicStageId: 'different_stage_uuid_999'
    });
    assert(
      stageMismatch.isValid === false && stageMismatch.error?.includes('STAGE_MISMATCH'),
      'Contradictory academic stage ID is rejected with STAGE_MISMATCH',
      stageMismatch.error
    );
  }

  console.log('\n--- TEST 5: Negative Test — Subject ID Mismatch ---');
  {
    const identityB1 = await ExamCacheService.resolveCurriculumIdentity(book1Id);
    const subjectMismatch = ExamCacheService.validateSelectionConsistency(identityB1, {
      subjectId: '5ebb5fc2-6edb-4f65-9057-bdb09ccae74e' // Science subject ID for Arabic book
    });
    assert(
      subjectMismatch.isValid === false && subjectMismatch.error?.includes('SUBJECT_MISMATCH'),
      'Contradictory subject ID is rejected with SUBJECT_MISMATCH',
      subjectMismatch.error
    );
  }

  console.log('\n--- TEST 6: Negative Test — Academic Term Mismatch ---');
  {
    const identityB1 = await ExamCacheService.resolveCurriculumIdentity(book1Id);
    const termMismatch = ExamCacheService.validateSelectionConsistency(identityB1, {
      term: 2 // Book 1 is Term 1
    });
    assert(
      termMismatch.isValid === false && termMismatch.error?.includes('TERM_MISMATCH'),
      'Contradictory term is rejected with TERM_MISMATCH',
      termMismatch.error
    );
  }

  console.log('\n--- TEST 7: Negative Test — School Type / Educational System Mismatch ---');
  {
    const identityB3 = await ExamCacheService.resolveCurriculumIdentity(book3Id); // Science Prep 1 'لغات'
    
    // Inconsistent candidate parameter
    const schoolMismatch = ExamCacheService.validateSelectionConsistency(identityB3, {
      schoolType: 'عربي'
    });
    assert(
      schoolMismatch.isValid === false && schoolMismatch.error?.includes('SCHOOL_TYPE_MISMATCH'),
      'Incompatible school type parameter is rejected with SCHOOL_TYPE_MISMATCH',
      schoolMismatch.error
    );

    // Mock student profile with 'عربي' school type requesting 'لغات' book
    const eligibilityCheck = await ExamCacheService.validateStudentEligibility('mock_arabic_student_id', identityB3);
    assert(
      eligibilityCheck.isEligible === false,
      'Arabic-system student is not eligible for language-system exclusive textbook'
    );
  }

  console.log('\n--- TEST 8: Negative Test — Different Selected Unit IDs ---');
  {
    // Request asking for Unit 2 instead of Unit 1
    const lookupUnit2 = await ExamCacheService.getCachedExamForStudent({
      studentId: studentB,
      bookId: book1Id,
      chapterIds: [b1Unit2],
      examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' }
    });
    assert(
      lookupUnit2.hit === false && lookupUnit2.reason === 'CACHE_MISS',
      'Request for Unit 2 does NOT reuse cached exam generated for Unit 1',
      `Unit Set Key: ${lookupUnit2.cacheKey}`
    );

    // Request asking for Units [1, 2] instead of [1]
    const lookupUnits1and2 = await ExamCacheService.getCachedExamForStudent({
      studentId: studentB,
      bookId: book1Id,
      chapterIds: [b1Unit1, b1Unit2],
      examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' }
    });
    assert(
      lookupUnits1and2.hit === false && lookupUnits1and2.reason === 'CACHE_MISS',
      'Request for Units [1, 2] does NOT reuse cached exam generated for Unit 1 alone'
    );
  }

  console.log('\n--- TEST 9: Negative Test — Different Content-Affecting Exam Parameters ---');
  {
    // A. Different Question Count (5 instead of 3)
    const lookupCount5 = await ExamCacheService.getCachedExamForStudent({
      studentId: studentB,
      bookId: book1Id,
      chapterIds: [b1Unit1],
      examParams: { count: 5, difficulty: 'MEDIUM', language: 'ar' }
    });
    assert(
      lookupCount5.hit === false && lookupCount5.reason === 'CACHE_MISS',
      'Request with count: 5 does NOT reuse cached exam of count: 3'
    );

    // B. Different Difficulty ('HARD' instead of 'MEDIUM')
    const lookupHard = await ExamCacheService.getCachedExamForStudent({
      studentId: studentB,
      bookId: book1Id,
      chapterIds: [b1Unit1],
      examParams: { count: 3, difficulty: 'HARD', language: 'ar' }
    });
    assert(
      lookupHard.hit === false && lookupHard.reason === 'CACHE_MISS',
      'Request with difficulty: HARD does NOT reuse cached exam of difficulty: MEDIUM'
    );

    // C. Different Language ('en' instead of 'ar')
    const lookupLangEn = await ExamCacheService.getCachedExamForStudent({
      studentId: studentB,
      bookId: book1Id,
      chapterIds: [b1Unit1],
      examParams: { count: 3, difficulty: 'MEDIUM', language: 'en' }
    });
    assert(
      lookupLangEn.hit === false && lookupLangEn.reason === 'CACHE_MISS',
      'Request with language: en does NOT reuse cached exam of language: ar'
    );
  }

  console.log('\n--- TEST 10: Negative Test — Role-Based Authorization & Cross-Book Chapters ---');
  {
    // Student C (Prep 2) attempting to access Book 1 (Prep 1)
    const lookupIneligible = await ExamCacheService.getCachedExamForStudent({
      studentId: studentC,
      bookId: book1Id,
      chapterIds: [b1Unit1],
      examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' }
    });
    assert(
      lookupIneligible.hit === false && lookupIneligible.reason === 'INELIGIBLE_STUDENT',
      'Student from different grade is safely rejected (INELIGIBLE_STUDENT)',
      `Reason: ${lookupIneligible.reason}`
    );

    // Cross-book chapter contamination: Passing a Book 6 chapter to Book 1
    let crossChapterCaught = false;
    try {
      await ExamCacheService.normalizeAndValidateUnitSelection(book1Id, [b6Unit1]);
    } catch (err) {
      crossChapterCaught = true;
      assert(
        err.message.includes('INVALID_CHAPTER'),
        'Attempting to attach Chapter from Book 6 to Book 1 is strictly rejected',
        err.message
      );
    }
    assert(crossChapterCaught, 'Cross-book chapter reference caught and blocked');

    // Non-existent Book ID
    let missingBookCaught = false;
    try {
      await ExamCacheService.resolveCurriculumIdentity('non_existent_book_uuid_000');
    } catch (err) {
      missingBookCaught = true;
      assert(
        err.message.includes('BOOK_NOT_FOUND'),
        'Non-existent book ID is strictly rejected with BOOK_NOT_FOUND',
        err.message
      );
    }
    assert(missingBookCaught, 'Invalid book ID caught and blocked');
  }

  console.log(`🏁 TEST SUITE RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${passedTests === totalTests ? '100% SUCCESS ✅' : 'FAILURES DETECTED ❌'})`);
  console.log('========================================================================');

  // Cleanup test artifacts from cache tables to preserve clean slate
  await ExamCacheService.clearCache();

  process.exit(passedTests === totalTests ? 0 : 1);
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
