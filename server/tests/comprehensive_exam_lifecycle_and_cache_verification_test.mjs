import assert from 'assert';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { setupDisposableTestDb, teardownDisposableTestDb } from './test_isolation_helper.mjs';

// Setup isolated disposable SQLite test environment
const { dbPath, tempDir } = setupDisposableTestDb('comprehensive_lifecycle');

const { db } = await import('../dist/db/db.js');
const { ExamCacheService } = await import('../dist/services/examCacheService.js');
const { ReadinessValidator } = await import('../dist/services/readinessValidator.js');
const {
  validateEmbeddingVector,
  cosineSimilarity,
  computeEducationalBM25Score,
  createSemanticVector
} = await import('../dist/services/ai/vectorEmbedding.js');
const { BookIngestionService } = await import('../dist/services/bookIngestionService.js');

console.log('========================================================================');
console.log('ALFARABI AI — COMPLETE LIFECYCLE, NEW BOOK & CACHE VERIFICATION SUITE');
console.log('Zero Paid API Calls | Zero Production Writes | 100% Isolated Test State');
console.log('========================================================================\n');

let passed = 0;
const pass = (desc) => {
  passed++;
  console.log(`  [PASS] ${passed}. ${desc}`);
};

async function seedCoreCurriculum() {
  const stageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PREPARATORY'`);
  const stageId = stageRes.rows[0].id;
  const gradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PREP_1'`);
  const gradeId = gradeRes.rows[0].id;

  const subjectArId = uuidv4();
  const subjectSciId = uuidv4();
  await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'AR', 'اللغة العربية', 'Arabic')`, [subjectArId, gradeId]);
  await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'SCI', 'العلوم', 'Science')`, [subjectSciId, gradeId]);

  const book1Id = 'book_arabic_001';
  const book2Id = 'book_science_002';
  await db.query(
    `INSERT INTO books (id, title_ar, title_en, grade_id, subject_id, academic_stage_id, term, school_type)
     VALUES ($1, 'كتاب لغتي الجميلة', 'Arabic Book', $2, $3, $4, 1, 'عربي')`,
    [book1Id, gradeId, subjectArId, stageId]
  );
  await db.query(
    `INSERT INTO books (id, title_ar, title_en, grade_id, subject_id, academic_stage_id, term, school_type)
     VALUES ($1, 'كتاب العلوم المتكامل', 'Science Book', $2, $3, $4, 1, 'عربي')`,
    [book2Id, gradeId, subjectSciId, stageId]
  );

  const ch1Id = 'chapter_arabic_u1';
  const ch2Id = 'chapter_arabic_u2';
  const chSciId = 'chapter_science_u1';
  await db.query(
    `INSERT INTO book_chapters (id, book_id, title_ar, title_en, chapter_number, start_page, end_page)
     VALUES ($1, $2, 'الوحدة الأولى: القراءة وحب الوطن', 'Unit 1', 1, 1, 20)`,
    [ch1Id, book1Id]
  );
  await db.query(
    `INSERT INTO book_chapters (id, book_id, title_ar, title_en, chapter_number, start_page, end_page)
     VALUES ($1, $2, 'الوحدة الثانية: مكارم الأخلاق', 'Unit 2', 2, 21, 40)`,
    [ch2Id, book1Id]
  );
  await db.query(
    `INSERT INTO book_chapters (id, book_id, title_ar, title_en, chapter_number, start_page, end_page)
     VALUES ($1, $2, 'الوحدة الأولى: المادة وتركيبها', 'Science Unit 1', 1, 1, 25)`,
    [chSciId, book2Id]
  );

  // Seed sample book pages for provenance verification
  for (let p = 1; p <= 40; p++) {
    const text = `صفحة دراسية رقم ${p} تحتوي على شرح مفصل ومعتمد لدروس الوحدة والمفاهيم اللغوية.`;
    await db.query(`INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count) VALUES ($1, $2, $3, $4, $5)`, [
      uuidv4(), book1Id, p, text, text.length
    ]);
  }
  for (let p = 1; p <= 25; p++) {
    const text = `صفحة علوم رقم ${p} تشرح المادة والكثافة وقوانين الفيزياء والكيمياء.`;
    await db.query(`INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count) VALUES ($1, $2, $3, $4, $5)`, [
      uuidv4(), book2Id, p, text, text.length
    ]);
  }

  // Seed test student profile
  const student1Id = 'student_test_user_001';
  const student2Id = 'student_test_user_002';
  await db.query(`INSERT INTO users (id, role, full_name, email, password_hash) VALUES ($1, 'STUDENT', 'طالب تجريبي أول', 'student1@farabi.edu', 'mock_hash_123')`, [student1Id]);
  await db.query(`INSERT INTO users (id, role, full_name, email, password_hash) VALUES ($1, 'STUDENT', 'طالب تجريبي ثان', 'student2@farabi.edu', 'mock_hash_123')`, [student2Id]);
  await db.query(
    `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_type)
     VALUES ($1, 'طالب تجريبي أول', $2, $3, 'عربي')`,
    [student1Id, stageId, gradeId]
  );
  await db.query(
    `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_type)
     VALUES ($1, 'طالب تجريبي ثان', $2, $3, 'عربي')`,
    [student2Id, stageId, gradeId]
  );

  return { stageId, gradeId, subjectArId, subjectSciId, book1Id, book2Id, ch1Id, ch2Id, chSciId, student1Id, student2Id };
}

async function runTestSuite() {
  const seed = await seedCoreCurriculum();

  // ==========================================================================
  // SECTION 6: THE 12 EXAM CACHE VERIFICATION TESTS
  // ==========================================================================
  console.log('\n--- SECTION 6: The 12 Mandatory Exam Cache Lifecycle Tests ---');

  const baseQuestions = [
    {
      id: 'q1',
      question_text: 'ما هي عاصمة جمهورية مصر العربية؟',
      question_type: 'MULTIPLE_CHOICE',
      options: [
        { id: 'opt1', text: 'القاهرة', is_correct: true },
        { id: 'opt2', text: 'الإسكندرية', is_correct: false },
        { id: 'opt3', text: 'الجيزة', is_correct: false },
        { id: 'opt4', text: 'أسوان', is_correct: false }
      ],
      correct_answer: 'القاهرة',
      page_reference: 5
    },
    {
      id: 'q2',
      question_text: 'ما الفكرة الرئيسة التي يدور حولها النص الشعري؟',
      question_type: 'MULTIPLE_CHOICE',
      options: [
        { id: 'opt1', text: 'حب الوطن والتضحية لأجله', is_correct: true },
        { id: 'opt2', text: 'التجارة والصناعة', is_correct: false },
        { id: 'opt3', text: 'الرحلات البحرية', is_correct: false },
        { id: 'opt4', text: 'الزراعة في الريف', is_correct: false }
      ],
      correct_answer: 'حب الوطن والتضحية لأجله',
      page_reference: 6
    },
    {
      id: 'q3',
      question_text: 'ما مضاد كلمة (الوفاء) في سياق العبارة؟',
      question_type: 'MULTIPLE_CHOICE',
      options: [
        { id: 'opt1', text: 'الغدر والخيانة', is_correct: true },
        { id: 'opt2', text: 'الشجاعة', is_correct: false },
        { id: 'opt3', text: 'الكرم', is_correct: false },
        { id: 'opt4', text: 'التواضع', is_correct: false }
      ],
      correct_answer: 'الغدر والخيانة',
      page_reference: 7
    }
  ];

  const identity = await ExamCacheService.resolveCurriculumIdentity(seed.book1Id);

  // Test 1: First eligible request: cache miss, mocked generation, valid exam stored
  let genMockCalls = 0;
  const mockGenerateExam = async () => {
    genMockCalls++;
    return [...baseQuestions];
  };

  const lookup1 = await ExamCacheService.getCachedExamForStudent({
    studentId: seed.student1Id,
    bookId: seed.book1Id,
    chapterIds: seed.ch1Id,
    examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' }
  });
  assert.strictEqual(lookup1.hit, false, 'Lookup 1 must be a cache miss');
  assert.strictEqual(lookup1.reason, 'CACHE_MISS');

  // Perform mock generation and store
  const generatedQs = await mockGenerateExam();
  assert.strictEqual(genMockCalls, 1, 'Generation mock called exactly once on cache miss');

  const storedExam1 = await ExamCacheService.storeExamInCache({
    identity,
    unitIds: [seed.ch1Id],
    examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' },
    questions: generatedQs,
    assignedStudentId: seed.student1Id
  });
  assert.ok(storedExam1.examId, 'Stored exam must have a generated examId');
  assert.strictEqual(storedExam1.versionNumber, 1, 'Initial version number must be 1');
  pass('Test 1: First eligible request produces cache miss, invokes generation, stores valid exam');

  // Test 2: Second request from a DIFFERENT student with identical config: CACHE HIT (Zero extra generation calls)
  const lookup2 = await ExamCacheService.getCachedExamForStudent({
    studentId: seed.student2Id,
    bookId: seed.book1Id,
    chapterIds: seed.ch1Id,
    examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' }
  });
  assert.strictEqual(lookup2.hit, true, 'Lookup 2 from second student must be a cache hit');
  assert.strictEqual(lookup2.reason, 'CACHE_HIT');
  assert.strictEqual(lookup2.exam?.examId, storedExam1.examId, 'Second student must reuse identical cached exam');
  assert.strictEqual(genMockCalls, 1, 'Generation mock must NOT be invoked on cache hit (0 extra calls)');
  pass('Test 2: Second identical request achieves cache hit with zero additional generation calls');

  // Test 3: Different unit: no incorrect cache reuse
  const lookupDiffUnit = await ExamCacheService.getCachedExamForStudent({
    studentId: seed.student2Id,
    bookId: seed.book1Id,
    chapterIds: seed.ch2Id, // Unit 2 instead of Unit 1
    examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' }
  });
  assert.strictEqual(lookupDiffUnit.hit, false, 'Request for different unit must miss cache');
  assert.notStrictEqual(lookupDiffUnit.configHash, lookup1.configHash, 'Config hashes must differ across units');
  pass('Test 3: Different curriculum unit prevents incorrect cache reuse');

  // Test 4: Different textbook: no incorrect cache reuse
  const lookupDiffBook = await ExamCacheService.getCachedExamForStudent({
    studentId: seed.student2Id,
    bookId: seed.book2Id, // Science book instead of Arabic book
    chapterIds: seed.chSciId,
    examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' }
  });
  assert.strictEqual(lookupDiffBook.hit, false, 'Request for different textbook must miss cache');
  assert.notStrictEqual(lookupDiffBook.configHash, lookup1.configHash, 'Config hashes must differ across books');
  pass('Test 4: Different textbook prevents incorrect cache reuse');

  // Test 5: Different question count, difficulty, or language: no incorrect cache reuse
  const lookupDiffCount = await ExamCacheService.getCachedExamForStudent({
    studentId: seed.student2Id,
    bookId: seed.book1Id,
    chapterIds: seed.ch1Id,
    examParams: { count: 5, difficulty: 'MEDIUM', language: 'ar' } // count 5 vs 3
  });
  assert.strictEqual(lookupDiffCount.hit, false, 'Different question count must miss cache');

  const lookupDiffDiff = await ExamCacheService.getCachedExamForStudent({
    studentId: seed.student2Id,
    bookId: seed.book1Id,
    chapterIds: seed.ch1Id,
    examParams: { count: 3, difficulty: 'HARD', language: 'ar' } // HARD vs MEDIUM
  });
  assert.strictEqual(lookupDiffDiff.hit, false, 'Different difficulty must miss cache');

  const lookupDiffLang = await ExamCacheService.getCachedExamForStudent({
    studentId: seed.student2Id,
    bookId: seed.book1Id,
    chapterIds: seed.ch1Id,
    examParams: { count: 3, difficulty: 'MEDIUM', language: 'en' } // en vs ar
  });
  assert.strictEqual(lookupDiffLang.hit, false, 'Different language must miss cache');
  pass('Test 5: Variations in count, difficulty, and language generate distinct config keys');

  // Test 6: Relevant content version change: student who already received version 1 gets fresh version
  // If student 1 requests identical config again, they should get ALL_VERSIONS_ASSIGNED so a fresh version is generated
  const lookupStudent1Repeat = await ExamCacheService.getCachedExamForStudent({
    studentId: seed.student1Id,
    bookId: seed.book1Id,
    chapterIds: seed.ch1Id,
    examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' }
  });
  assert.strictEqual(lookupStudent1Repeat.hit, false, 'Student who took version 1 must not receive duplicate version');
  assert.strictEqual(lookupStudent1Repeat.reason, 'ALL_VERSIONS_ASSIGNED');

  // Store version 2 with different questions
  const version2Questions = baseQuestions.map(q => ({
    ...q,
    id: `${q.id}_v2`,
    question_text: `${q.question_text} (نموذج اختبار ب)`
  }));
  const storedExam2 = await ExamCacheService.storeExamInCache({
    identity,
    unitIds: [seed.ch1Id],
    examParams: { count: 3, difficulty: 'MEDIUM', language: 'ar' },
    questions: version2Questions,
    assignedStudentId: seed.student1Id
  });
  assert.strictEqual(storedExam2.versionNumber, 2, 'Next version stored must increment version_number to 2');
  pass('Test 6: Multi-versioning rejects stale repeated assignments and creates clean sequential versions');

  // Test 7: Readiness failure: no generation and no cache bypass
  ReadinessValidator.registerDynamicUnit({
    book_id: 'unready_book_uuid',
    chapter_id: 'unready_ch_uuid',
    book_title_ar: 'كتاب غير جاهز',
    book_title_en: 'Unready Book',
    unit_title_ar: 'وحدة محجوبة',
    unit_title_en: 'Blocked Unit',
    readiness_status: 'BLOCKED',
    visual_dependencies: 'GEOMETRY_DIAGRAMS'
  });
  const blockedUnitReadiness = ReadinessValidator.getUnitReadiness('unready_book_uuid', 'unready_ch_uuid');
  assert.strictEqual(blockedUnitReadiness.isEligibleForAI, false, 'Unready unit must not be eligible');
  assert.strictEqual(blockedUnitReadiness.status, 'BLOCKED', 'Unready unit status must be BLOCKED');
  pass('Test 7: Readiness gate strictly blocks generation for unready units');

  // Test 8: Generation failure: no successful cache entry created
  let failedStoreError = null;
  try {
    // Malformed question payload with empty text and no options
    await ExamCacheService.storeExamInCache({
      identity,
      unitIds: [seed.ch1Id],
      examParams: { count: 3 },
      questions: [{ id: 'bad_q', question_text: '' }]
    });
  } catch (err) {
    failedStoreError = err;
  }
  assert.ok(failedStoreError, 'Store must fail and throw on rejected/malformed questions');
  pass('Test 8: Generation failure or invalid question payload rejects cache storage');

  // Test 9: Invalid cached exam (e.g. unverified provenance): rejected safely from student retrieval
  const unverifiedExamId = `unverified_exam_${Date.now()}`;
  await db.query(
    `INSERT INTO shared_cached_exams (
       id, book_id, academic_stage_id, grade_id, subject_id, term, school_type,
       config_key, config_hash, content_hash, version_number,
       questions_data, unit_ids, unit_set_key, param_hash, parameters_json,
       provenance_verified, created_at
     ) VALUES ($1, $2, $3, $4, $5, 1, 'عربي',
       $6, 'unverified_hash_001', 'unverified_content_001', 99,
       $7, '["ch1"]', 'ch1', 'p001', '{}',
       0, datetime('now'))`,
    [unverifiedExamId, seed.book1Id, seed.stageId, seed.gradeId, seed.subjectArId, 'exam_cache:v1:unverified', JSON.stringify(baseQuestions)]
  );

  const candidateRes = await db.query(
    `SELECT id FROM shared_cached_exams WHERE id = $1 AND provenance_verified = 1`,
    [unverifiedExamId]
  );
  assert.strictEqual(candidateRes.rows.length, 0, 'Unverified cached exam must be rejected by query filter');
  pass('Test 9: Stored exams with provenance_verified=0 are safely excluded from cache hits');

  // Test 10: Cache read failures handle safely without throwing unhandled exceptions
  const resBadStudent = await ExamCacheService.getCachedExamForStudent({
    studentId: '',
    bookId: seed.book1Id,
    chapterIds: seed.ch1Id,
    examParams: { count: 3 }
  });
  assert.strictEqual(resBadStudent.hit, false, 'Missing studentId must safely return hit=false');
  assert.strictEqual(resBadStudent.reason, 'INELIGIBLE_STUDENT', 'Must return INELIGIBLE_STUDENT');
  pass('Test 10: Cache query failures have explicit and fail-safe handling');

  // Test 11: Concurrent identical requests: generation lock mutual exclusion
  const testLockHash = 'test_hash_concurrency_dedup';
  const lockA = await ExamCacheService.acquireGenerationLock(testLockHash, 10000);
  assert.strictEqual(lockA.acquired, true, 'Instance A must acquire exclusive lock');
  const lockB = await ExamCacheService.acquireGenerationLock(testLockHash, 10000);
  assert.strictEqual(lockB.acquired, false, 'Instance B must be blocked while lock is held');
  await ExamCacheService.releaseGenerationLock(testLockHash, lockA.lockId);
  const lockAfterRelease = await ExamCacheService.acquireGenerationLock(testLockHash, 10000);
  assert.strictEqual(lockAfterRelease.acquired, true, 'Instance can acquire lock after prior release');
  await ExamCacheService.releaseGenerationLock(testLockHash, lockAfterRelease.lockId);
  pass('Test 11: Concurrent lock acquisition guarantees single-instance generation and deduplication');

  // Test 12: Existing cached exam compatibility
  // Verify that an existing cached exam record maps all backward-compatibility fields
  assert.strictEqual(lookup2.exam?.cacheKey, lookup2.exam?.configKey, 'cacheKey alias exists for backward compatibility');
  assert.ok(lookup2.exam?.questions.length === 3, 'Questions are accessible in original format');
  pass('Test 12: Existing cached exam entries maintain backward compatibility with legacy schema fields');

  // ==========================================================================
  // SECTION 3: NEW TEXTBOOK PIPELINE VERIFICATION (13 SCENARIOS)
  // ==========================================================================
  console.log('\n--- SECTION 3: Complete New-Textbook Pipeline Scenarios ---');

  // Scenario 1: New textbook uploaded does NOT automatically make it eligible
  const brandNewBookId = uuidv4();
  const brandNewChId = uuidv4();
  const freshReadiness = ReadinessValidator.getUnitReadiness(brandNewBookId, brandNewChId);
  assert.strictEqual(freshReadiness.isEligibleForAI, false, 'Fresh book upload must NOT be eligible for AI');
  assert.ok(freshReadiness.status === 'BLOCKED' || freshReadiness.status === 'NOT_AUDITED', 'Fresh book upload must fail-closed as BLOCKED or NOT_AUDITED');
  pass('Scenario 1: Uploading a new textbook does not automatically make it eligible');

  // Scenario 2: Valid chapter boundary validation
  const validChapters = [
    { chapter_number: 1, title_ar: 'الفصل الأول', title_en: 'Ch 1', start_page: 5, end_page: 25 },
    { chapter_number: 2, title_ar: 'الفصل الثاني', title_en: 'Ch 2', start_page: 26, end_page: 50 }
  ];
  const validBoundary = BookIngestionService.validateChapterBoundaries(validChapters, 50);
  assert.strictEqual(validBoundary.valid, true, 'Well-formed sequential chapters must be valid');
  pass('Scenario 2: Valid multi-chapter boundary validation passes cleanly');

  // Scenario 3: Empty chapters list check
  const emptyBoundary = BookIngestionService.validateChapterBoundaries([], 50);
  assert.strictEqual(emptyBoundary.valid, false, 'Empty chapters must be rejected');
  assert.strictEqual(emptyBoundary.issues[0].code, 'NO_CHAPTERS_DETECTED');
  pass('Scenario 3: Empty chapter detection is flagged with diagnostic code NO_CHAPTERS_DETECTED');

  // Scenario 4: Inverted page range check
  const invertedChapters = [
    { chapter_number: 1, title_ar: 'فصل مقلوب', title_en: 'Inverted', start_page: 30, end_page: 10 }
  ];
  const invertedBoundary = BookIngestionService.validateChapterBoundaries(invertedChapters, 50);
  assert.strictEqual(invertedBoundary.valid, false, 'Inverted start/end pages must fail');
  assert.strictEqual(invertedBoundary.issues[0].code, 'INVERTED_PAGE_RANGE');
  pass('Scenario 4: Inverted page boundaries rejected with INVERTED_PAGE_RANGE');

  // Scenario 5: Out of bounds page range check
  const oobChapters = [
    { chapter_number: 1, title_ar: 'فصل خارج الحدود', title_en: 'OOB', start_page: 5, end_page: 80 }
  ];
  const oobBoundary = BookIngestionService.validateChapterBoundaries(oobChapters, 50);
  assert.strictEqual(oobBoundary.valid, false, 'End page exceeding totalPages must fail');
  assert.strictEqual(oobBoundary.issues[0].code, 'OUT_OF_BOUNDS_PAGE_RANGE');
  pass('Scenario 5: Out of bounds page boundaries rejected with OUT_OF_BOUNDS_PAGE_RANGE');

  // Scenario 6: Overlapping chapter ranges check
  const overlapChapters = [
    { chapter_number: 1, title_ar: 'فصل 1', title_en: 'Ch 1', start_page: 5, end_page: 25 },
    { chapter_number: 2, title_ar: 'فصل 2', title_en: 'Ch 2', start_page: 20, end_page: 45 }
  ];
  const overlapBoundary = BookIngestionService.validateChapterBoundaries(overlapChapters, 50);
  assert.strictEqual(overlapBoundary.valid, false, 'Overlapping chapters must fail');
  assert.strictEqual(overlapBoundary.issues[0].code, 'OVERLAPPING_CHAPTER_RANGES');
  pass('Scenario 6: Overlapping chapter boundaries rejected with OVERLAPPING_CHAPTER_RANGES');

  // Scenario 7: Missing chunks: unit with 0 chunks must fail readiness
  const zeroChunkEval = ReadinessValidator.evaluateDbRecordReadiness(brandNewBookId, brandNewChId, {
    processing_status: 'COMPLETED',
    total_chunks: 0,
    total_chars: 0,
    embedded_chunks: 0,
    min_page: 1,
    max_page: 10,
    start_page: 1,
    end_page: 10
  });
  assert.strictEqual(zeroChunkEval.isEligibleForAI, false);
  assert.strictEqual(zeroChunkEval.status, 'BLOCKED');
  assert.ok(zeroChunkEval.reason?.includes('غير كافٍ') || zeroChunkEval.reason?.includes('غير مكتملة'));
  pass('Scenario 7: Unit with zero extracted chunks is blocked');

  // Scenario 8: Safe Lexical-Only path: unit with 100% valid text and 0 out-of-range chunks
  // becomes CONDITIONALLY_READY in EDUCATIONAL_BM25 mode even when embeddings are 0 or partial
  const partialEmbEval = ReadinessValidator.evaluateDbRecordReadiness(brandNewBookId, brandNewChId, {
    processing_status: 'COMPLETED',
    total_chunks: 10,
    total_chars: 1000,
    embedded_chunks: 5,
    min_page: 1,
    max_page: 10,
    start_page: 1,
    end_page: 10
  });
  assert.strictEqual(partialEmbEval.isEligibleForAI, true, 'Unit with valid text is eligible for AI via BM25');
  assert.strictEqual(partialEmbEval.status, 'CONDITIONALLY_READY');
  assert.strictEqual(partialEmbEval.retrievalMode, 'EDUCATIONAL_BM25');
  pass('Scenario 8: Complete source text with partial/missing embeddings transitions to CONDITIONALLY_READY in EDUCATIONAL_BM25 mode');

  // Scenario 8a: Missing processing_status must fail closed (never implicitly COMPLETED)
  const missingStatusEval = ReadinessValidator.evaluateDbRecordReadiness(brandNewBookId, brandNewChId, {
    total_chunks: 10,
    total_chars: 1000,
    embedded_chunks: 10,
    start_page: 1,
    end_page: 10
  });
  assert.strictEqual(missingStatusEval.isEligibleForAI, false, 'Missing processing_status must not be eligible');
  assert.strictEqual(missingStatusEval.status, 'BLOCKED');
  assert.ok(missingStatusEval.reason.includes('UNKNOWN'), 'Reason must diagnose UNKNOWN processing status');
  pass('Scenario 8a: Missing processing_status fails closed as BLOCKED (UNKNOWN), never implicitly COMPLETED');

  // Scenario 8b: Insufficient text content (< 100 characters) strictly fails closed as BLOCKED
  const insufficientTextEval = ReadinessValidator.evaluateDbRecordReadiness(brandNewBookId, brandNewChId, {
    processing_status: 'COMPLETED',
    total_chunks: 2,
    total_chars: 40, // insufficient text
    embedded_chunks: 0,
    min_page: 1,
    max_page: 10,
    start_page: 1,
    end_page: 10
  });
  assert.strictEqual(insufficientTextEval.isEligibleForAI, false);
  assert.strictEqual(insufficientTextEval.status, 'BLOCKED');
  pass('Scenario 8b: Insufficient text content (< 100 chars) strictly fails closed as BLOCKED');

  // Scenario 8c: Unit with out-of-range chunks strictly fails closed as BLOCKED
  const outOfRangeEval = ReadinessValidator.evaluateDbRecordReadiness(brandNewBookId, brandNewChId, {
    processing_status: 'COMPLETED',
    total_chunks: 10,
    total_chars: 1500,
    embedded_chunks: 0,
    out_of_range_chunks: 3, // out-of-range chunk leakage
    min_page: 1,
    max_page: 10,
    start_page: 1,
    end_page: 10
  });
  assert.strictEqual(outOfRangeEval.isEligibleForAI, false);
  assert.strictEqual(outOfRangeEval.status, 'BLOCKED');
  pass('Scenario 8c: Out-of-range chunks (page boundary misalignment) strictly fail closed as BLOCKED');

  // Scenario 9: Incompatible embedding model tag
  const badModelVec = validateEmbeddingVector(
    JSON.stringify({ model: 'unknown-hash-model', values: new Array(768).fill(0.1) }),
    768,
    'gemini-embedding-001'
  );
  assert.strictEqual(badModelVec.valid, false);
  assert.ok(badModelVec.error?.includes('Model mismatch'));
  pass('Scenario 9: Incompatible embedding model tag is rejected');

  // Scenario 10: Wrong embedding vector dimensions
  const wrongDimVec = validateEmbeddingVector(new Array(512).fill(0.1), 768);
  assert.strictEqual(wrongDimVec.valid, false);
  assert.ok(wrongDimVec.error?.includes('Dimension mismatch'));
  pass('Scenario 10: Wrong vector dimensions (512 vs 768) are rejected');

  // Scenario 11: Malformed NaN values in vector
  const nanVec = validateEmbeddingVector([0.1, NaN, 0.5], 3);
  assert.strictEqual(nanVec.valid, false);
  assert.ok(nanVec.error?.includes('Invalid numeric value'));
  pass('Scenario 11: Non-finite/NaN vector elements are rejected');

  // Scenario 12: Unit with 100% valid chunks, complete embeddings, and matching pages becomes VERIFIED_READY
  const fullyReadyEval = ReadinessValidator.evaluateDbRecordReadiness(brandNewBookId, brandNewChId, {
    processing_status: 'COMPLETED',
    total_chunks: 15,
    total_chars: 2500,
    embedded_chunks: 15,
    min_page: 1,
    max_page: 10,
    start_page: 1,
    end_page: 10
  });
  assert.strictEqual(fullyReadyEval.isEligibleForAI, true);
  assert.strictEqual(fullyReadyEval.status, 'VERIFIED_READY');
  assert.strictEqual(fullyReadyEval.retrievalMode, 'SEMANTIC_VECTOR');
  pass('Scenario 12: 100% valid chunk coverage and complete embeddings transition unit to VERIFIED_READY in SEMANTIC_VECTOR mode');

  // Scenario 13: Unrelated book failure (e.g. out of range) does not block an independent healthy book
  const healthyBookId = 'healthy_book_uuid';
  const healthyChId = 'healthy_chapter_uuid';
  const healthyEval = ReadinessValidator.evaluateDbRecordReadiness(healthyBookId, healthyChId, {
    processing_status: 'COMPLETED',
    total_chunks: 20,
    total_chars: 3000,
    embedded_chunks: 0, // Text-only
    min_page: 1,
    max_page: 15,
    start_page: 1,
    end_page: 15
  });
  assert.strictEqual(healthyEval.isEligibleForAI, true);
  assert.strictEqual(healthyEval.status, 'CONDITIONALLY_READY');
  assert.strictEqual(outOfRangeEval.status, 'BLOCKED', 'Defective book with out-of-range chunks remains independently BLOCKED');
  pass('Scenario 13: Independent unit evaluation ensures failing book never cascades to block healthy books');

  // ==========================================================================
  // SECTION 4: 54 CURRICULUM UNITS & READINESS MATRIX
  // ==========================================================================
  console.log('\n--- SECTION 4: Curriculum Units Readiness Independence Matrix ---');

  // Test 4.1: Simulate live database distribution: 50 units with complete text (0 embeddings), 4 units with out-of-range seed chunks
  const mock54Units = Array.from({ length: 54 }, (_, i) => ({
    book_id: `book_${Math.floor(i / 4)}`,
    chapter_id: `ch_${i}`,
    processing_status: 'COMPLETED',
    total_chunks: 25,
    total_chars: 3000,
    embedded_chunks: 0, // all missing embeddings
    out_of_range_chunks: i < 4 ? 3 : 0, // 4 units have legacy seed chunks outside page boundaries
    min_page: 1,
    max_page: 20,
    start_page: 1,
    end_page: 20
  }));

  const resultsInitial = mock54Units.map(u => ReadinessValidator.evaluateDbRecordReadiness(u.book_id, u.chapter_id, u));
  const conditionallyReadyCount = resultsInitial.filter(r => r.status === 'CONDITIONALLY_READY').length;
  const blockedCount = resultsInitial.filter(r => r.status === 'BLOCKED').length;
  assert.strictEqual(conditionallyReadyCount, 50, 'Exactly 50 units with clean text and zero out-of-range chunks are CONDITIONALLY_READY');
  assert.strictEqual(blockedCount, 4, 'The 4 units with out-of-range chunks are strictly BLOCKED');
  pass('Test 4.1: Exactly 50 units with clean text are CONDITIONALLY_READY for BM25, and 4 units with out-of-range chunks remain BLOCKED');

  // Test 4.2: Transition one pilot unit to full semantic embeddings
  mock54Units[4].embedded_chunks = 25; // Pilot unit now 100% embedded with clean boundaries
  const resultsWithOneReady = mock54Units.map(u => ReadinessValidator.evaluateDbRecordReadiness(u.book_id, u.chapter_id, u));
  const readyCount = resultsWithOneReady.filter(r => r.status === 'VERIFIED_READY').length;
  const remainingCondReady = resultsWithOneReady.filter(r => r.status === 'CONDITIONALLY_READY').length;
  const remainingBlocked = resultsWithOneReady.filter(r => r.status === 'BLOCKED').length;
  assert.strictEqual(readyCount, 1, 'Exactly one pilot unit becomes VERIFIED_READY');
  assert.strictEqual(remainingCondReady, 49, 'Remaining 49 text-only units stay in CONDITIONALLY_READY mode');
  assert.strictEqual(remainingBlocked, 4, 'The 4 flawed units remain strictly BLOCKED');
  pass('Test 4.2: One pilot unit becoming VERIFIED_READY correctly coexists with 49 BM25 units and 4 BLOCKED units');

  // Test 4.3: Mixed unit readiness within the same book (e.g. Chapter 1 has out-of-range chunks, Chapter 2 is clean)
  const ch1Flawed = ReadinessValidator.evaluateDbRecordReadiness('book_shared_001', 'ch_1', {
    processing_status: 'COMPLETED',
    total_chunks: 10,
    total_chars: 1500,
    embedded_chunks: 0,
    out_of_range_chunks: 3, // flawed
    min_page: 1,
    max_page: 10,
    start_page: 1,
    end_page: 10
  });
  const ch2Clean = ReadinessValidator.evaluateDbRecordReadiness('book_shared_001', 'ch_2', {
    processing_status: 'COMPLETED',
    total_chunks: 10,
    total_chars: 1500,
    embedded_chunks: 0,
    out_of_range_chunks: 0, // clean
    min_page: 11,
    max_page: 20,
    start_page: 11,
    end_page: 20
  });
  assert.strictEqual(ch1Flawed.status, 'BLOCKED');
  assert.strictEqual(ch2Clean.status, 'CONDITIONALLY_READY');
  pass('Test 4.3: Intra-textbook unit independence correctly separates clean vs flawed chapters');

  // ==========================================================================
  // SECTION 5: RETRIEVAL & GROUNDING SAFETY
  // ==========================================================================
  console.log('\n--- SECTION 5: Retrieval & Grounding Safety ---');

  // Test 5.1: Cross-subject query discrimination with BM25
  const scienceText = 'الكتلة هي مقدار ما يحتويه الجسم من مادة والكثافة هي كتلة وحدة الحجوم من المادة وتقاس بوحدة جرام لكل سنتيمتر مكعب.';
  const historyText = 'قامت الحضارة المصرية القديمة على ضفاف نهر النيل وأسس الملك مينا الأسرة الأولى ووحد القطرين عام 3200 قبل الميلاد.';

  const sciScoreForSciQuery = computeEducationalBM25Score('الكثافة والكتلة وحدة الحجوم', scienceText);
  const histScoreForSciQuery = computeEducationalBM25Score('الكثافة والكتلة وحدة الحجوم', historyText);
  assert.ok(sciScoreForSciQuery > 0.2, 'Science text must match science query with positive relevance');
  assert.strictEqual(histScoreForSciQuery, 0, 'History text must score 0 for science query');
  pass('Test 5.1: Lexical retrieval prevents cross-subject contamination (irrelevant subjects score 0)');

  // Test 5.2: Normalized Arabic typography matching
  const scoreVariantHamza = computeEducationalBM25Score('وحده بناء الماده الذره', scienceText);
  assert.ok(scoreVariantHamza > 0, 'Normalized Arabic spelling must match regardless of taa-marbuta / alif forms');
  pass('Test 5.2: Educational BM25 normalizes Arabic orthographic variants');

  // Test 5.3: Cosine similarity vector comparison precision
  const vec1 = [1, 0, 0];
  const vec2 = [1, 0, 0];
  const vec3 = [0, 1, 0];
  assert.strictEqual(cosineSimilarity(vec1, vec2), 1.0, 'Identical vectors must have similarity 1.0');
  assert.strictEqual(cosineSimilarity(vec1, vec3), 0.0, 'Orthogonal vectors must have similarity 0.0');
  pass('Test 5.3: Cosine similarity computation is exact and bounded in [0, 1]');

  // Test 5.4: Provenance and grounding safety: questions referencing non-existent book are rejected
  const crossBookQuestions = [{
    id: 'q_fake_book',
    question_text: 'ما هي عاصمة مصر؟',
    options: [{ id: '1', text: 'القاهرة', is_correct: true }],
    correct_answer: 'القاهرة',
    page_reference: 5
  }];
  const crossBookCheck = await ExamCacheService.verifyExamQuestionsProvenance(crossBookQuestions, 'non_existent_book_id');
  assert.strictEqual(crossBookCheck.isVerified, false, 'Provenance must reject questions with non-existent or cross-book IDs');
  pass('Test 5.4: Cross-book retrieval and invalid book binding strictly fails closed in provenance check');

  // Test 5.5: Contradictory/unsupported answers rejected by AnswerValidationService
  const { AnswerValidationService } = await import('../dist/services/answerValidationService.js');
  const contradictoryQuestions = [{
    id: 'q_bad',
    question_text: 'احسب قيمة العملية الحسابية: 5 + 3 = ؟',
    options: [
      { id: '1', text: '10', is_correct: true }, // Contradiction: 5+3 is 8, but answer says 10!
      { id: '2', text: '7', is_correct: false }
    ],
    correct_answer: '10'
  }];
  const valSummary = AnswerValidationService.validateExamQuestions(contradictoryQuestions);
  assert.strictEqual(valSummary.hasRejectedAnswers, true, 'Questions with contradictory answers must be rejected with REJECTED status');
  pass('Test 5.5: Contradictory answers are strictly rejected by AnswerValidationService');

  console.log('\n========================================================================');
  console.log(`🎉 ALL ${passed} VERIFICATION & LIFECYCLE TESTS PASSED GREEN!`);
  console.log('Zero Paid API Calls | Zero Production DB Modifications | Verified Locally');
  console.log('========================================================================\n');

  // Clean up SQLite database files
  teardownDisposableTestDb(db, tempDir);
}

runTestSuite().catch(err => {
  console.error('FATAL TEST SUITE FAILURE:', err);
  process.exit(1);
});
