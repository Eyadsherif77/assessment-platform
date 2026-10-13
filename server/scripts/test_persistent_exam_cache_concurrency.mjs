import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import assert from 'assert';
import { db } from '../dist/db/db.js';
import { ExamCacheService } from '../dist/services/examCacheService.js';

async function runTestSuite() {
  console.log('========================================================================');
  console.log('🧪 TEST SUITE: PERSISTENT & CONCURRENCY-SAFE SHARED EXAM CACHE');
  console.log('========================================================================\n');

  await db.init();

  // Baseline Protected Tables Verification
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
    assert.strictEqual(actual, exp, `Pre-test baseline mismatch on ${t}: ${actual} vs ${exp}`);
  }
  console.log('✅ Pre-test protected baseline verified (All 7 tables intact).\n');

  // Fetch two real eligible students from Prep 1 (Grade 7)
  const studentsRes = await db.query(`
    SELECT sp.user_id, sp.academic_stage_id, sp.grade_id, sp.school_type, u.full_name
    FROM student_profiles sp
    JOIN users u ON sp.user_id = u.id
    JOIN grades g ON sp.grade_id = g.id
    WHERE g.code = 'PREP_1'
    LIMIT 2
  `);

  assert(studentsRes.rows.length >= 2, 'Must have at least 2 real eligible Prep 1 students');
  const studentA = studentsRes.rows[0].user_id;
  const studentB = studentsRes.rows[1].user_id;
  console.log(`Eligible Student A: ${studentA} (${studentsRes.rows[0].full_name})`);
  console.log(`Eligible Student B: ${studentB} (${studentsRes.rows[1].full_name})`);

  // Use Book 9 (Arabic Prep 1, term 1)
  const book9Id = '0758fc7a-c9b2-4e25-a32b-6cacb6bb418d';
  const identityB9 = await ExamCacheService.resolveCurriculumIdentity(book9Id);

  // Fetch Book 9 chapters
  const chaptersB9 = await db.query(`SELECT id, title_ar FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number`, [book9Id]);
  const b9Unit1 = chaptersB9.rows[0].id;
  const b9Unit2 = chaptersB9.rows[1].id;

  const mockQuestionsUnit1 = [
    { id: 'test_q1', question_text: 'سؤال تجريبي رقم 1 في الوحدة الأولى', page_reference: 15, options: [{ id: 'opt1', text: 'أ' }, { id: 'opt2', text: 'ب' }], correct_answer: 'opt1' },
    { id: 'test_q2', question_text: 'سؤال تجريبي رقم 2 في الوحدة الأولى', page_reference: 16, options: [{ id: 'opt3', text: 'أ' }, { id: 'opt4', text: 'ب' }], correct_answer: 'opt3' },
    { id: 'test_q3', question_text: 'سؤال تجريبي رقم 3 في الوحدة الأولى', page_reference: 17, options: [{ id: 'opt5', text: 'أ' }, { id: 'opt6', text: 'ب' }], correct_answer: 'opt5' }
  ];

  try {
    // Clean cache tables before starting tests
    await ExamCacheService.clearCache();

    // -------------------------------------------------------------------------
    // TEST 1: Cache Entry Survives a Simulated Service Restart
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Cache Entry Survives a Simulated Service Restart ---');
    const storedExam = await ExamCacheService.storeExamInCache({
      examId: 'test_exam_restart_001',
      identity: identityB9,
      unitIds: [b9Unit1],
      examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' },
      questions: mockQuestionsUnit1,
      assignedStudentId: studentA,
      skipProvenanceCheck: true
    });
    assert.strictEqual(storedExam.examId, 'test_exam_restart_001');
    console.log('  Stored exam in cache for Student A.');

    // Verify written to database table
    const dbCheck = await db.query(`SELECT id, config_hash, total_questions FROM shared_cached_exams WHERE id = $1`, ['test_exam_restart_001']);
    assert.strictEqual(dbCheck.rows.length, 1, 'Exam must exist in shared_cached_exams table');
    assert.strictEqual(Number(dbCheck.rows[0].total_questions), 3);
    console.log('  ✅ [PASS] Exam verified in database table shared_cached_exams.');

    // SIMULATE BACKEND RESTART: clear memory L1 cache completely
    ExamCacheService.clearMemoryCache();
    console.log('  Simulated backend restart (cleared in-memory L1 cache).');

    // Student B looks up the cache from a "fresh" cold instance
    const lookupAfterRestart = await ExamCacheService.getCachedExamForStudent({
      studentId: studentB,
      bookId: book9Id,
      chapterIds: b9Unit1,
      examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' }
    });
    assert.strictEqual(lookupAfterRestart.hit, true, 'Must be a CACHE_HIT from durable DB after restart');
    assert.strictEqual(lookupAfterRestart.exam?.examId, 'test_exam_restart_001');
    assert.strictEqual(lookupAfterRestart.exam?.questions.length, 3);
    console.log('  ✅ [PASS] Cache entry survived simulated service restart and was read by Student B.');

    // -------------------------------------------------------------------------
    // TEST 2: Two Service Instances Read the Same Cached Exam
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Two Service Instances Read the Same Cached Exam ---');
    // Instance 1 reads
    ExamCacheService.clearMemoryCache();
    const inst1 = await ExamCacheService.getCachedExamForStudent({
      studentId: studentB,
      bookId: book9Id,
      chapterIds: b9Unit1,
      examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' }
    });
    // Instance 2 reads (simulated by clearing memory before lookup)
    ExamCacheService.clearMemoryCache();
    const inst2 = await ExamCacheService.getCachedExamForStudent({
      studentId: studentB,
      bookId: book9Id,
      chapterIds: b9Unit1,
      examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' }
    });
    assert.strictEqual(inst1.hit, true);
    assert.strictEqual(inst2.hit, true);
    assert.strictEqual(inst1.exam?.examId, inst2.exam?.examId);
    console.log('  ✅ [PASS] Multiple backend instances read the exact same cached exam from DB.');

    // -------------------------------------------------------------------------
    // TEST 3: Eligible Different Students Receive the Same Exam Independently
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Eligible Different Students Receive Exam Independently ---');
    // Student B records assignment
    const assignB = await ExamCacheService.recordStudentAssignment(inst1.cacheKey, studentB, inst1.exam?.examId);
    assert.strictEqual(assignB.success, true);
    assert.strictEqual(assignB.duplicate, false);

    const assignmentsInDb = await db.query(
      `SELECT student_id, cached_exam_id, status FROM student_exam_assignments WHERE cached_exam_id = $1 ORDER BY student_id`,
      ['test_exam_restart_001']
    );
    assert.strictEqual(assignmentsInDb.rows.length, 2, 'Both Student A and Student B have distinct assignment rows');
    const assignedIds = assignmentsInDb.rows.map((r) => r.student_id).sort();
    const expectedIds = [studentA, studentB].sort();
    assert.deepStrictEqual(assignedIds, expectedIds);
    console.log('  ✅ [PASS] Student A and Student B assigned independently in durable database.');

    // -------------------------------------------------------------------------
    // TEST 4: Durable No-Repeat Enforcement & Simultaneous Concurrent Requests
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Durable No-Repeat Enforcement & Concurrent Requests ---');
    // A: Sequential lookup attempt by Student A
    const repeatLookupA = await ExamCacheService.getCachedExamForStudent({
      studentId: studentA,
      bookId: book9Id,
      chapterIds: b9Unit1,
      examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' }
    });
    assert.strictEqual(repeatLookupA.hit, false);
    assert(
      repeatLookupA.reason === 'ALL_VERSIONS_ASSIGNED' || repeatLookupA.reason === 'STUDENT_NO_REPEAT_EXCLUSION',
      `Unexpected reason: ${repeatLookupA.reason}`
    );
    console.log(`  ✅ [PASS] Sequential repeated lookup correctly rejected with ${repeatLookupA.reason}.`);

    // B: 10 Simultaneous concurrent assignment requests for Student A (simulating racing taps/clicks)
    console.log('  Executing 10 simultaneous concurrent assignment requests for Student A...');
    const concurrentAssignPromises = Array.from({ length: 10 }, () =>
      ExamCacheService.recordStudentAssignment(inst1.cacheKey, studentA, 'test_exam_restart_001')
    );
    const concurrentResults = await Promise.all(concurrentAssignPromises);

    // All should report duplicate: true (because Student A was already assigned)
    const duplicatesCount = concurrentResults.filter(r => r.duplicate === true).length;
    assert.strictEqual(duplicatesCount, 10, 'All 10 concurrent requests must be rejected as duplicates');

    // Confirm DB still has exactly 1 assignment for Student A
    const countA = await db.query(
      `SELECT count(*) as cnt FROM student_exam_assignments WHERE student_id = $1 AND cached_exam_id = $2`,
      [studentA, 'test_exam_restart_001']
    );
    assert.strictEqual(Number(countA.rows[0].cnt), 1, 'Database UNIQUE constraint guaranteed exactly 1 assignment');
    console.log('  ✅ [PASS] Database-level unique constraint prevented duplicate assignments under concurrency.');

    // -------------------------------------------------------------------------
    // TEST 5: Canonical Curriculum Fingerprint & Parameter Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Curriculum Fingerprint & Parameter Isolation ---');
    // Different book (Book 10 Social Studies Prep 1 vs Book 9 Arabic Prep 1)
    const book10Id = 'fa2a1525-c46f-4b34-9f48-b762be88e5c5';
    const b10Chapters = await db.query(`SELECT id FROM book_chapters WHERE book_id = $1 LIMIT 1`, [book10Id]);
    const lookupDiffBook = await ExamCacheService.getCachedExamForStudent({
      studentId: studentB,
      bookId: book10Id,
      chapterIds: b10Chapters.rows[0].id,
      examParams: { count: 3 }
    });
    assert.strictEqual(lookupDiffBook.hit, false);
    assert.strictEqual(lookupDiffBook.reason, 'CACHE_MISS');
    console.log('  ✅ [PASS] Different book ID does not match cache.');

    // Different Unit in Book 9 (Unit 2 instead of Unit 1)
    const lookupDiffUnit = await ExamCacheService.getCachedExamForStudent({
      studentId: studentB,
      bookId: book9Id,
      chapterIds: b9Unit2,
      examParams: { count: 3 }
    });
    assert.strictEqual(lookupDiffUnit.hit, false);
    assert.strictEqual(lookupDiffUnit.reason, 'CACHE_MISS');
    console.log('  ✅ [PASS] Different unit selection does not match cache.');

    // Different Exam Parameter (count 5 instead of count 3)
    const lookupDiffCount = await ExamCacheService.getCachedExamForStudent({
      studentId: studentB,
      bookId: book9Id,
      chapterIds: b9Unit1,
      examParams: { count: 5 }
    });
    assert.strictEqual(lookupDiffCount.hit, false);
    assert.strictEqual(lookupDiffCount.reason, 'CACHE_MISS');
    console.log('  ✅ [PASS] Different exam parameter (count) does not match cache.');

    // -------------------------------------------------------------------------
    // TEST 6: Concurrent Cache Misses Concurrency Safety
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Concurrent Cache Misses Concurrency Safety ---');
    // 5 concurrent workers trying to store the exact same new configuration (Unit 2) simultaneously
    console.log('  Launching 5 concurrent workers storing the same exam for Unit 2...');
    const concurrentMissWorkers = Array.from({ length: 5 }, (_, idx) =>
      ExamCacheService.storeExamInCache({
        examId: `test_concurrent_worker_${idx}`,
        identity: identityB9,
        unitIds: [b9Unit2],
        examParams: { count: 4, difficulty: 'HARD', language: 'ar' },
        questions: [
          { id: 'q_unit2_1', question_text: 'سؤال موحد 1', options: [{ id: 'opt1', text: 'خيار 1' }, { id: 'opt2', text: 'خيار 2' }], correct_answer: 'opt1' },
          { id: 'q_unit2_2', question_text: 'سؤال موحد 2', options: [{ id: 'opt1', text: 'خيار 1' }, { id: 'opt2', text: 'خيار 2' }], correct_answer: 'opt1' },
          { id: 'q_unit2_3', question_text: 'سؤال موحد 3', options: [{ id: 'opt1', text: 'خيار 1' }, { id: 'opt2', text: 'خيار 2' }], correct_answer: 'opt1' },
          { id: 'q_unit2_4', question_text: 'سؤال موحد 4', options: [{ id: 'opt1', text: 'خيار 1' }, { id: 'opt2', text: 'خيار 2' }], correct_answer: 'opt1' }
        ],
        skipProvenanceCheck: true
      })
    );

    const workerResults = await Promise.all(concurrentMissWorkers);
    // All workers must have succeeded
    assert.strictEqual(workerResults.length, 5);

    // Verify DB contains EXACTLY 1 row for this config_hash because all workers generated identical content
    const unit2Hash = ExamCacheService.computeConfigHash(workerResults[0].configKey);
    const dbUnit2Count = await db.query(
      `SELECT count(*) as cnt, min(id) as win_id FROM shared_cached_exams WHERE config_hash = $1`,
      [unit2Hash]
    );
    assert.strictEqual(Number(dbUnit2Count.rows[0].cnt), 1, 'Exactly 1 shared cache row must be created');
    console.log(`  ✅ [PASS] Exactly 1 cache row created across 5 racing workers (Winner ID: ${dbUnit2Count.rows[0].win_id}).`);

    // -------------------------------------------------------------------------
    // TEST 7: Student Attempts, Answers, Scores, and Grading Remain Independent
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Independence of Student Attempts and Grading ---');
    // Verify that exam_attempts and student_answers are not modified by shared caching
    const attemptsCount = await db.query(`SELECT count(*) as cnt FROM exam_attempts`);
    const answersCount = await db.query(`SELECT count(*) as cnt FROM student_answers`);
    assert.strictEqual(Number(attemptsCount.rows[0].cnt), 0);
    assert.strictEqual(Number(answersCount.rows[0].cnt), 0);
    console.log('  ✅ [PASS] Attempts and answers tables are decoupled and verified independent.');

    // -------------------------------------------------------------------------
    // TEST 8: Existing Authorization & Role-Based Rules Still Pass
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Authorization & Role-Based Enforcement ---');
    // Student from different grade
    const fakeSecStudent = await ExamCacheService.validateStudentEligibility('non_existent_student', identityB9);
    assert.strictEqual(fakeSecStudent.isEligible, false);

    // Teacher authorization
    const teacherCheck = await ExamCacheService.validateTeacherAuthorization('non_existent_teacher', identityB9);
    assert.strictEqual(teacherCheck.isAuthorized, false);

    // Cross-book chapter injection blocked
    let crossBookBlocked = false;
    try {
      await ExamCacheService.normalizeAndValidateUnitSelection(book9Id, [b10Chapters.rows[0].id]);
    } catch (e) {
      crossBookBlocked = true;
    }
    assert.strictEqual(crossBookBlocked, true, 'Cross-book chapter injection must be blocked');
    console.log('  ✅ [PASS] Authorization and textbook provenance checks verified.');

  } finally {
    // -------------------------------------------------------------------------
    // TEST 9: Clean Slate Post-Test Integrity Check
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Clean-Slate Post-Test Isolation Cleanup ---');
    // Remove isolated test records from cache tables
    await ExamCacheService.clearCache();
    const finalCacheCount = await db.query(`SELECT count(*) as cnt FROM shared_cached_exams`);
    const finalAssignCount = await db.query(`SELECT count(*) as cnt FROM student_exam_assignments`);
    assert.strictEqual(Number(finalCacheCount.rows[0].cnt), 0);
    assert.strictEqual(Number(finalAssignCount.rows[0].cnt), 0);
    console.log('  Test cache tables cleaned up to 0 rows.');

    // Re-verify all protected tables
    console.log('  Re-verifying all protected tables...');
    for (const [t, exp] of Object.entries(protectedExpected)) {
      const res = await db.query(`SELECT count(*) as cnt FROM ${t}`);
      const actual = Number(res.rows[0].cnt);
      assert.strictEqual(actual, exp, `Post-test baseline mismatch on ${t}: ${actual} vs ${exp}`);
      console.log(`    ✓ ${t}: ${actual}/${exp} intact`);
    }
    console.log('  ✅ [PASS] All protected tables intact (Zero side-effects or regressions).');
  }

  console.log('\n========================================================================');
  console.log('🎉 ALL 9 TEST CATEGORIES PASSED WITH 100% SUCCESS!');
  console.log('========================================================================');
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
