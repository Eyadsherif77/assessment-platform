import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import assert from 'assert';
import { db } from '../dist/db/db.js';
import { ExamCacheService } from '../dist/services/examCacheService.js';

async function runTestSuite() {
  console.log('========================================================================');
  console.log('🧪 TEST SUITE: MULTI-VERSION EXAM CACHE & PROVENANCE INTEGRITY AUDIT');
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
  console.log(`Student A: ${studentA} (${studentsRes.rows[0].full_name})`);
  console.log(`Student B: ${studentB} (${studentsRes.rows[1].full_name})`);

  // Use Book 9 (Arabic Prep 1, term 1)
  const book9Id = '0758fc7a-c9b2-4e25-a32b-6cacb6bb418d';
  const identityB9 = await ExamCacheService.resolveCurriculumIdentity(book9Id);

  // Fetch real Book 9 chapters & pages for genuine provenance verification
  const chaptersB9 = await db.query(`SELECT id, title_ar FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number`, [book9Id]);
  const b9Unit1 = chaptersB9.rows[0].id;
  const b9Unit2 = chaptersB9.rows[1].id;

  const realPagesB9 = await db.query(`SELECT page_number FROM book_pages WHERE book_id = $1 AND page_number >= 15 ORDER BY page_number LIMIT 6`, [book9Id]);
  const page1 = realPagesB9.rows[0].page_number;
  const page2 = realPagesB9.rows[1].page_number;
  const page3 = realPagesB9.rows[2].page_number;
  const page4 = realPagesB9.rows[3].page_number;

  // Genuine provenance-grounded Question Set A (Version 1)
  const questionsVersionA = [
    { id: 'q_v1_1', question_text: 'سؤال الإصدار الأول - مفهوم 1', page_reference: page1, options: [{ id: 'opt_1', text: 'أ' }, { id: 'opt_2', text: 'ب' }], correct_answer: 'opt_1' },
    { id: 'q_v1_2', question_text: 'سؤال الإصدار الأول - مفهوم 2', page_reference: page2, options: [{ id: 'opt_1', text: 'أ' }, { id: 'opt_2', text: 'ب' }], correct_answer: 'opt_1' }
  ];

  // Genuine provenance-grounded Question Set B (Version 2 - distinct content)
  const questionsVersionB = [
    { id: 'q_v2_1', question_text: 'سؤال الإصدار الثاني - مفهوم مختلف 1', page_reference: page3, options: [{ id: 'opt_1', text: 'ج' }, { id: 'opt_2', text: 'د' }], correct_answer: 'opt_1' },
    { id: 'q_v2_2', question_text: 'سؤال الإصدار الثاني - مفهوم مختلف 2', page_reference: page4, options: [{ id: 'opt_1', text: 'ج' }, { id: 'opt_2', text: 'د' }], correct_answer: 'opt_1' }
  ];

  try {
    await ExamCacheService.clearCache();

    // -------------------------------------------------------------------------
    // TEST 1: Provenance Verification & Default Value Security
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Provenance Verification & Default Security ---');
    // Questions with non-existent page 99999
    const fakeQuestions = [
      { id: 'fake_1', question_text: 'سؤال غير موثق', page_reference: 99999, options: [{ text: 'أ' }] }
    ];
    const provFailure = await ExamCacheService.verifyExamQuestionsProvenance(fakeQuestions, book9Id);
    assert.strictEqual(provFailure.isVerified, false, 'Provenance must fail for invalid page');
    assert(provFailure.reason?.includes('PAGE_NOT_FOUND'));
    console.log('  ✅ [PASS] Questions with invalid pages are rejected by provenance validator.');

    // Questions with genuine pages
    const provSuccess = await ExamCacheService.verifyExamQuestionsProvenance(questionsVersionA, book9Id);
    assert.strictEqual(provSuccess.isVerified, true, 'Provenance must pass for real pages');
    console.log('  ✅ [PASS] Questions with verified textbook pages pass provenance validator.');

    // -------------------------------------------------------------------------
    // TEST 2: Student A Receives Exam A, Then Requests AGAIN and Receives Exam B
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Multi-Version Generation (Student A Receives Version 1, then Version 2) ---');
    // Initial request: Cache miss
    const initialLookupA = await ExamCacheService.getCachedExamForStudent({
      studentId: studentA,
      bookId: book9Id,
      chapterIds: b9Unit1,
      examParams: { count: 2, difficulty: 'MEDIUM', language: 'ar' }
    });
    assert.strictEqual(initialLookupA.hit, false);
    assert.strictEqual(initialLookupA.reason, 'CACHE_MISS');

    // Store Exam Version 1
    const examV1 = await ExamCacheService.storeExamInCache({
      examId: 'mv_exam_v1',
      identity: identityB9,
      unitIds: [b9Unit1],
      examParams: { count: 2, difficulty: 'MEDIUM', language: 'ar' },
      questions: questionsVersionA,
      assignedStudentId: studentA
    });
    assert.strictEqual(examV1.versionNumber, 1);
    assert.strictEqual(examV1.provenanceVerified, true);
    console.log('  Exam Version 1 stored and assigned to Student A.');

    // Student A requests the EXACT SAME configuration again
    const secondLookupA = await ExamCacheService.getCachedExamForStudent({
      studentId: studentA,
      bookId: book9Id,
      chapterIds: b9Unit1,
      examParams: { count: 2, difficulty: 'MEDIUM', language: 'ar' }
    });
    assert.strictEqual(secondLookupA.hit, false, 'Exam Version 1 must NOT be served to Student A again');
    assert.strictEqual(secondLookupA.reason, 'ALL_VERSIONS_ASSIGNED');
    console.log('  ✅ [PASS] Exam Version 1 excluded for Student A under No-Repeat Rule (reason: ALL_VERSIONS_ASSIGNED).');

    // System creates and stores Exam Version 2 under the EXACT SAME configuration
    const examV2 = await ExamCacheService.storeExamInCache({
      examId: 'mv_exam_v2',
      identity: identityB9,
      unitIds: [b9Unit1],
      examParams: { count: 2, difficulty: 'MEDIUM', language: 'ar' },
      questions: questionsVersionB,
      assignedStudentId: studentA
    });
    assert.strictEqual(examV2.versionNumber, 2, 'Version number must increment to 2');
    assert.strictEqual(examV2.provenanceVerified, true);
    assert.notStrictEqual(examV2.contentHash, examV1.contentHash, 'Content hashes must be distinct');
    console.log('  Exam Version 2 stored and assigned to Student A.');

    // Verify both versions coexist in the database under the exact same config_hash
    const dbVersions = await db.query(
      `SELECT id, version_number, content_hash FROM shared_cached_exams WHERE config_hash = $1 ORDER BY version_number`,
      [examV1.configHash]
    );
    assert.strictEqual(dbVersions.rows.length, 2, 'Both Exam Version 1 and Version 2 coexist in database');
    console.log('  ✅ [PASS] Multiple distinct exam versions coexist under the same canonical configuration.');

    // -------------------------------------------------------------------------
    // TEST 3: Student B Reuses Cached Versions Independently
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Student B Independently Reuses Both Cached Versions ---');
    // Student B requests configuration for the first time -> gets Version 1 (Cache Hit!)
    const firstLookupB = await ExamCacheService.getCachedExamForStudent({
      studentId: studentB,
      bookId: book9Id,
      chapterIds: b9Unit1,
      examParams: { count: 2, difficulty: 'MEDIUM', language: 'ar' }
    });
    assert.strictEqual(firstLookupB.hit, true, 'Student B receives CACHE_HIT on Version 1');
    assert.strictEqual(firstLookupB.exam?.examId, 'mv_exam_v1');
    assert.strictEqual(firstLookupB.exam?.versionNumber, 1);
    await ExamCacheService.recordStudentAssignment(firstLookupB.configKey, studentB, firstLookupB.exam.examId);
    console.log('  Student B received and assigned Version 1.');

    // Student B requests the same configuration a second time -> gets Version 2 (Cache Hit!)
    const secondLookupB = await ExamCacheService.getCachedExamForStudent({
      studentId: studentB,
      bookId: book9Id,
      chapterIds: b9Unit1,
      examParams: { count: 2, difficulty: 'MEDIUM', language: 'ar' }
    });
    assert.strictEqual(secondLookupB.hit, true, 'Student B receives CACHE_HIT on Version 2');
    assert.strictEqual(secondLookupB.exam?.examId, 'mv_exam_v2');
    assert.strictEqual(secondLookupB.exam?.versionNumber, 2);
    await ExamCacheService.recordStudentAssignment(secondLookupB.configKey, studentB, secondLookupB.exam.examId);
    console.log('  Student B received and assigned Version 2.');

    // Student B requests a third time -> both Version 1 and Version 2 are excluded!
    const thirdLookupB = await ExamCacheService.getCachedExamForStudent({
      studentId: studentB,
      bookId: book9Id,
      chapterIds: b9Unit1,
      examParams: { count: 2, difficulty: 'MEDIUM', language: 'ar' }
    });
    assert.strictEqual(thirdLookupB.hit, false);
    assert.strictEqual(thirdLookupB.reason, 'ALL_VERSIONS_ASSIGNED');
    console.log('  ✅ [PASS] Student B exhausts all versions; no repeated version is served.');

    // -------------------------------------------------------------------------
    // TEST 4: Database Unique Constraint & Concurrency Safety
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Database Constraints & Concurrent Duplicate Prevention ---');
    // 10 concurrent requests from Student A attempting to re-assign Version 1
    const racingAssigns = await Promise.all(
      Array.from({ length: 10 }, () =>
        ExamCacheService.recordStudentAssignment(examV1.configKey, studentA, 'mv_exam_v1')
      )
    );
    const duplicates = racingAssigns.filter(r => r.duplicate === true).length;
    assert.strictEqual(duplicates, 10, 'All racing duplicate assignments must be caught');

    // Confirm DB table has exactly 1 assignment for (studentA, mv_exam_v1)
    const asgnCount = await db.query(
      `SELECT count(*) as cnt FROM student_exam_assignments WHERE student_id = $1 AND cached_exam_id = $2`,
      [studentA, 'mv_exam_v1']
    );
    assert.strictEqual(Number(asgnCount.rows[0].cnt), 1);
    console.log('  ✅ [PASS] DB constraint uq_student_cached_exam strictly prevented duplicate assignments.');

    // -------------------------------------------------------------------------
    // TEST 5: Concurrent Identical Generation Deduplication (uq_config_content)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Concurrent Identical Content Deduplication ---');
    // 4 concurrent workers storing the exact same questionsVersionB under the same config
    const racingStores = await Promise.all(
      Array.from({ length: 4 }, (_, idx) =>
        ExamCacheService.storeExamInCache({
          examId: `racing_store_${idx}`,
          identity: identityB9,
          unitIds: [b9Unit1],
          examParams: { count: 2, difficulty: 'MEDIUM', language: 'ar' },
          questions: questionsVersionB,
          skipProvenanceCheck: true
        })
      )
    );
    assert.strictEqual(racingStores.length, 4);

    // Total rows for this config_hash must still be exactly 2 (Version 1 and Version 2)
    const totalRows = await db.query(`SELECT count(*) as cnt FROM shared_cached_exams WHERE config_hash = $1`, [examV1.configHash]);
    assert.strictEqual(Number(totalRows.rows[0].cnt), 2, 'Duplicate identical versions must not be created');
    console.log('  ✅ [PASS] uq_config_content safely deduplicated identical content generations.');

    // -------------------------------------------------------------------------
    // TEST 6: Simulated Restart & Multi-Instance Durability
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Simulated Restart & Multi-Instance Durability ---');
    ExamCacheService.clearMemoryCache();
    // Cold instance querying for a new eligible student (e.g. Student C)
    const studentCRes = await db.query(`
      SELECT sp.user_id FROM student_profiles sp
      JOIN grades g ON sp.grade_id = g.id
      WHERE g.code = 'PREP_1' AND sp.user_id NOT IN ($1, $2) LIMIT 1
    `, [studentA, studentB]);

    if (studentCRes.rows.length > 0) {
      const studentC = studentCRes.rows[0].user_id;
      const coldLookup = await ExamCacheService.getCachedExamForStudent({
        studentId: studentC,
        bookId: book9Id,
        chapterIds: b9Unit1,
        examParams: { count: 2, difficulty: 'MEDIUM', language: 'ar' }
      });
      assert.strictEqual(coldLookup.hit, true);
      assert.strictEqual(coldLookup.exam?.examId, 'mv_exam_v1');
      console.log('  ✅ [PASS] Cold instance after restart successfully reads Version 1 from durable DB.');
    }

  } finally {
    // -------------------------------------------------------------------------
    // TEST 7: Cleanup & Baseline Verification
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Cleanup & Baseline Verification ---');
    await ExamCacheService.clearCache();
    const c1 = await db.query(`SELECT count(*) as cnt FROM shared_cached_exams`);
    const c2 = await db.query(`SELECT count(*) as cnt FROM student_exam_assignments`);
    assert.strictEqual(Number(c1.rows[0].cnt), 0);
    assert.strictEqual(Number(c2.rows[0].cnt), 0);
    console.log('  Cache tables verified at 0 rows.');

    for (const [t, exp] of Object.entries(protectedExpected)) {
      const res = await db.query(`SELECT count(*) as cnt FROM ${t}`);
      const actual = Number(res.rows[0].cnt);
      assert.strictEqual(actual, exp, `Post-test baseline mismatch on ${t}: ${actual} vs ${exp}`);
      console.log(`    ✓ ${t}: ${actual}/${exp} intact`);
    }
    console.log('  ✅ [PASS] All protected baseline tables remain 100% intact.');
  }

  console.log('\n========================================================================');
  console.log('🎉 MULTI-VERSION EXAM CACHE AUDIT PASSED WITH 100% SUCCESS!');
  console.log('========================================================================');
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
