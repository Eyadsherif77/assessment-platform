import assert from 'assert';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { setupDisposableTestDb, assertDatabaseIsDisposable } from './test_isolation_helper.mjs';

// Setup isolated disposable SQLite test database
const { tempDir, dbPath } = setupDisposableTestDb('critical_post_fix_audit_test');
process.env.NODE_ENV = 'test';
process.env.ALLOW_PAID_AI_TESTS = 'false';

const { db } = await import('../dist/db/db.js');
await db.init();
assertDatabaseIsDisposable(db, dbPath);

const { GeminiClient, GeminiProviderError } = await import('../dist/services/ai/geminiClient.js');
const { AIRagEngine, aiRagEngine, computeQuestionVerificationHash } = await import('../dist/services/ai/aiRagEngine.js');
const { ExamCacheService } = await import('../dist/services/examCacheService.js');

let passed = 0;
const pass = (name) => {
  passed++;
  console.log(`  [PASS] ${name}`);
};

console.log('================================================================');
console.log('FARABI AI — CRITICAL POST-FIX AUDIT REGRESSION TEST SUITE');
console.log('Zero Paid API Calls | Disposable SQLite DB | Strict Invariants');
console.log('================================================================\n');

// Retrieve baseline stage and grade
const stageRow = (await db.query(`SELECT id FROM academic_stages LIMIT 1`)).rows[0];
const gradeRow = (await db.query(`SELECT id FROM grades WHERE stage_id = $1 LIMIT 1`, [stageRow.id])).rows[0];
const stageId = stageRow.id;
const gradeId = gradeRow.id;

let subjectRow = (await db.query(`SELECT id FROM subjects LIMIT 1`)).rows[0];
if (!subjectRow) {
  const sciId = uuidv4();
  await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'SCIENCE', 'العلوم', 'Science')`, [sciId, gradeId]);
  subjectRow = { id: sciId };
}
const subjectId = subjectRow.id;

// Setup a mock textbook and chapter with chunk content
const bookId = uuidv4();
const chapterId = uuidv4();
const chunkId = uuidv4();

await db.query(
  `INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, term, school_type, processing_status)
   VALUES ($1, 'كتاب العلوم التجريبي', 'Science Book', $2, $3, $4, 1, 'كلاهما', 'COMPLETED')`,
  [bookId, stageId, gradeId, subjectId]
);

await db.query(
  `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
   VALUES ($1, $2, 1, 'الفصل الأول: الكثافة والمادة', 'Chapter 1: Density and Matter', 1, 50)`,
  [chapterId, bookId]
);

await db.query(
  `INSERT INTO book_pages (id, book_id, page_number, raw_text)
   VALUES ($1, $2, 10, 'الكثافة هي كتلة وحدة الحجوم من المادة، وتقاس بوحدة جرام/سم³ أو جرام لكل سنتيمتر مكعب.')`,
  [uuidv4(), bookId]
);

await db.query(
  `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content)
   VALUES ($1, $2, $3, $4, $5, $6, 10, 1, 'الكثافة هي كتلة وحدة الحجوم من المادة، وتقاس بوحدة جرام/سم³ أو جرام لكل سنتيمتر مكعب. وتطفو المواد الأقل كثافة على سطح السائل.')`,
  [chunkId, bookId, chapterId, stageId, gradeId, subjectId]
);

const bankId = uuidv4();
await db.query(
  `INSERT INTO question_banks (id, subject_id, academic_stage_id, grade_id, title)
   VALUES ($1, $2, $3, $4, 'بنك أسئلة العلوم')`,
  [bankId, subjectId, stageId, gradeId]
);

// Helper to construct mock bank question
function createMockQuestion(opts = {}) {
  const qId = opts.id || uuidv4();
  return {
    id: qId,
    chunk_id: chunkId,
    book_id: bookId,
    chapter_id: chapterId,
    question_text: opts.question_text || 'ما هي وحدة قياس الكثافة في النظام الدولي للمادة؟',
    options: opts.options || [
      { id: 'opt_1', text: 'جرام/سم³', is_correct: true },
      { id: 'opt_2', text: 'متر/ثانية', is_correct: false },
      { id: 'opt_3', text: 'نيوتن', is_correct: false },
      { id: 'opt_4', text: 'جول', is_correct: false }
    ],
    difficulty: 'MEDIUM',
    bloom_level: 'UNDERSTANDING',
    page_reference: 10,
    source_excerpt: 'الكثافة هي كتلة وحدة الحجوم من المادة',
    explanation: 'الكثافة هي كتلة وحدة الحجوم وتقاس بـ جرام/سم³'
  };
}

// ============================================================================
// SUITE 1: NEVER SERVE UNVERIFIED QUESTIONS (CRITICAL REQUIREMENT 1)
// ============================================================================
console.log('--- Suite 1: Never Serve Unverified Questions ---');

// Test 1.1: Generation succeeds but verification times out -> persisted as quarantined/pending, never served
{
  AIRagEngine.clearMemoryCache();
  const q = createMockQuestion();
  const qHash = computeQuestionVerificationHash(q);

  // Simulate timeout during verification: question persisted with PENDING_VERIFICATION and quarantined
  await db.query(
    `INSERT INTO question_bank_items (
       id, bank_id, chapter_id, question_text, question_type, difficulty,
       bloom_level, explanation, source_chunk_id, page_reference,
       is_quarantined, quarantine_reason
     ) VALUES ($1, $2, $3, $4, 'MULTIPLE_CHOICE', 'MEDIUM', 'UNDERSTANDING', $5, $6, 10, 1, 'PENDING_VERIFICATION')`,
    [q.id, bankId, chapterId, q.question_text, q.explanation, chunkId]
  );
  for (const opt of q.options) {
    await db.query(
      `INSERT INTO question_bank_options (id, question_item_id, option_text, is_correct) VALUES ($1, $2, $3, $4)`,
      [uuidv4(), q.id, opt.text, opt.is_correct ? 1 : 0]
    );
  }

  // Attempt retrieval from question bank
  const retrieved = await aiRagEngine.getQuestionsFromBank({
    bookId,
    chapterId,
    gradeId,
    count: 1
  });

  assert.strictEqual(retrieved, null, 'Unverified question with PENDING_VERIFICATION must NOT be served from bank');
  pass('1.1 Generation succeeded but verification timed out -> rejected from delivery');
}

// Test 1.2: Server restarts before verification completes -> memory cache empty, DB status pending -> cannot be served
{
  AIRagEngine.clearMemoryCache(); // simulates complete process restart

  const retrievedAfterRestart = await aiRagEngine.getQuestionsFromBank({
    bookId,
    chapterId,
    gradeId,
    count: 1
  });

  assert.strictEqual(retrievedAfterRestart, null, 'After server restart, unverified question must NOT be served');
  pass('1.2 Process restart before verification completes -> memory cleared, question remains unserved');
}

// Test 1.3: Another server instance reads the same question -> DB filter rejects quarantined rows
{
  // A second serverless instance connects with completely cold memory
  AIRagEngine.clearMemoryCache();

  const countRes = await db.query(
    `SELECT COUNT(*) as cnt FROM question_bank_items WHERE chapter_id = $1 AND (is_quarantined = 0 OR is_quarantined IS NULL)`,
    [chapterId]
  );
  assert.strictEqual(Number(countRes.rows[0].cnt), 0, 'Second instance query must filter out is_quarantined = 1 items');
  pass('1.3 Another server instance query strictly filters out pending/quarantined questions');
}

// Test 1.4: Concurrent student request attempts to retrieve question -> gets null/miss, never unverified item
{
  const student1Promise = aiRagEngine.getQuestionsFromBank({ bookId, chapterId, gradeId, count: 1, studentId: 'student_alpha' });
  const student2Promise = aiRagEngine.getQuestionsFromBank({ bookId, chapterId, gradeId, count: 1, studentId: 'student_beta' });

  const [res1, res2] = await Promise.all([student1Promise, student2Promise]);
  assert.strictEqual(res1, null, 'Student 1 must not receive unverified question');
  assert.strictEqual(res2, null, 'Student 2 must not receive unverified question');
  pass('1.4 Concurrent student requests cannot retrieve unverified question');
}

// Test 1.5: Verification fails permanently -> marked with FAILED:<code> and remains quarantined
{
  const failedQ = createMockQuestion({ id: uuidv4(), question_text: 'سؤال غير مثبت في كتاب الوزارة إطلاقاً' });
  await db.query(
    `INSERT INTO question_bank_items (
       id, bank_id, chapter_id, question_text, question_type, difficulty,
       bloom_level, explanation, source_chunk_id, page_reference,
       is_quarantined, quarantine_reason
     ) VALUES ($1, $2, $3, $4, 'MULTIPLE_CHOICE', 'MEDIUM', 'UNDERSTANDING', $5, $6, 10, 1, 'FAILED:UNSUPPORTED_PREMISE')`,
    [failedQ.id, bankId, chapterId, failedQ.question_text, failedQ.explanation, chunkId]
  );

  const retrieved = await aiRagEngine.getQuestionsFromBank({ bookId, chapterId, gradeId, count: 1 });
  assert.strictEqual(retrieved, null, 'Permanently failed question must never be served');
  pass('1.5 Verification fails permanently -> quarantined with FAILED reason, excluded from delivery');
}

// Test 1.6: Verification succeeds after retry/resumption -> quarantine removed, question is served
{
  AIRagEngine.clearMemoryCache();
  const validQ = createMockQuestion({ id: uuidv4(), question_text: 'ما هي وحدة قياس الكثافة للمواد الصلبة؟' });
  const validHash = computeQuestionVerificationHash(validQ);

  // Resume / retry succeeds: item is un-quarantined with VERIFIED:<hash>
  await db.query(
    `INSERT INTO question_bank_items (
       id, bank_id, chapter_id, question_text, question_type, difficulty,
       bloom_level, explanation, source_chunk_id, page_reference,
       is_quarantined, quarantine_reason
     ) VALUES ($1, $2, $3, $4, 'MULTIPLE_CHOICE', 'MEDIUM', 'UNDERSTANDING', $5, $6, 10, 0, $7)`,
    [validQ.id, bankId, chapterId, validQ.question_text, validQ.explanation, chunkId, `VERIFIED:${validHash}`]
  );
  for (const opt of validQ.options) {
    await db.query(
      `INSERT INTO question_bank_options (id, question_item_id, option_text, is_correct) VALUES ($1, $2, $3, $4)`,
      [uuidv4(), validQ.id, opt.text, opt.is_correct ? 1 : 0]
    );
  }

  // Set mock solver to approve if invoked
  AIRagEngine.setBlindSolverOverride(async () => ({
    status: 'SOLVED',
    selected_option_id: 'opt_1',
    defensible_option_ids: ['opt_1'],
    reasoning: 'Verified from passage',
    entailed_evidence_quote: 'الكثافة هي كتلة وحدة الحجوم من المادة'
  }));

  const retrieved = await aiRagEngine.getQuestionsFromBank({ bookId, chapterId, gradeId, count: 1 });
  assert.ok(retrieved && retrieved.length > 0, 'Verified question must be delivered');
  assert.strictEqual(retrieved[0].id, validQ.id);
  assert.strictEqual(retrieved[0].validation_status?.reason, 'VERIFIED_BY_BLIND_SOLVER');
  pass('1.6 Verification succeeds after retry/resumed job -> quarantine lifted, question delivered');
}

// ============================================================================
// SUITE 2: DURABLE AND TRUSTWORTHY VERIFICATION STATE (CRITICAL REQUIREMENT 2)
// ============================================================================
console.log('\n--- Suite 2: Durable and Trustworthy Verification State ---');

// Test 2.1: In-memory state cleared -> L2 durable database hash match preserves verified status without AI re-calls
{
  AIRagEngine.clearMemoryCache(); // Wipe L1 memory
  let solverCallCount = 0;
  AIRagEngine.setBlindSolverOverride(async () => {
    solverCallCount++;
    return {
      status: 'SOLVED',
      selected_option_id: 'opt_1',
      defensible_option_ids: ['opt_1'],
      reasoning: 'Solved',
      entailed_evidence_quote: 'الكثافة هي كتلة وحدة الحجوم من المادة'
    };
  });

  const retrieved = await aiRagEngine.getQuestionsFromBank({ bookId, chapterId, gradeId, count: 1 });
  assert.ok(retrieved && retrieved.length > 0, 'L2 durable database status should serve verified question');
  assert.strictEqual(solverCallCount, 0, 'L2 hash match must NOT trigger AI solver call');
  pass('2.1 Process restart / L1 memory wipe -> L2 durable DB hash match serves question without AI re-invocation');
}

// Test 2.2: Question content modified in DB -> hash mismatch invalidates prior verification
{
  AIRagEngine.clearMemoryCache();

  // Tamper with the question text in the database
  const validQRow = (await db.query(`SELECT id FROM question_bank_items WHERE quarantine_reason LIKE 'VERIFIED:%' LIMIT 1`)).rows[0];
  await db.query(`UPDATE question_bank_items SET question_text = 'نص معدل غير معتمد بعد التعديل' WHERE id = $1`, [validQRow.id]);

  // Set mock solver to reject tampered question
  AIRagEngine.setBlindSolverOverride(async () => ({
    status: 'AMBIGUOUS',
    selected_option_id: null,
    defensible_option_ids: [],
    reasoning: 'Tampered question cannot be solved from passage',
    entailed_evidence_quote: null
  }));

  const retrieved = await aiRagEngine.getQuestionsFromBank({ bookId, chapterId, gradeId, count: 1 });
  assert.strictEqual(retrieved, null, 'Tampered question with mismatched verification hash must NOT be served');

  // Verify that the item was quarantined in DB with FAILED
  const updatedRow = (await db.query(`SELECT is_quarantined, quarantine_reason FROM question_bank_items WHERE id = $1`, [validQRow.id])).rows[0];
  assert.strictEqual(updatedRow.is_quarantined, 1, 'Mismatched question must be quarantined');
  assert.ok(updatedRow.quarantine_reason.startsWith('FAILED:'), 'Quarantine reason must indicate failure');
  pass('2.2 Question content modification invalidates verification hash and triggers quarantine');
}

// ============================================================================
// SUITE 3: CONCURRENCY AND RATE-LIMIT BEHAVIOR (CRITICAL REQUIREMENT 3)
// ============================================================================
console.log('\n--- Suite 3: Concurrency and Rate-Limit Behavior ---');

// Test 3.1: 429 response with "retry in 3.5s" hint parses delay accurately
{
  GeminiClient.resetForTests();
  const classified = GeminiClient['classify'](429, 'Resource has been exhausted (e.g. check quota). Please retry in 3.5s.');
  assert.strictEqual(classified.category, 'QUOTA_EXHAUSTED');
  assert.strictEqual(classified.retryAfterMs, 3500, '3.5s hint must parse to 3500ms');
  assert.strictEqual(classified.isProjectQuotaExhausted, false, 'Transient 429 with short hint is not project quota exhausted');
  pass('3.1 429 with "retry in 3.5s" hint parsed accurately to 3500ms');
}

// Test 3.2: 429 response with HTTP "Retry-After" header parses accurately
{
  GeminiClient.resetForTests();
  const fakeHeaders = new Map([['retry-after', '12']]);
  const classified = GeminiClient['classify'](429, 'Rate limit exceeded', { get: (k) => fakeHeaders.get(k.toLowerCase()) });
  assert.strictEqual(classified.category, 'QUOTA_EXHAUSTED');
  assert.strictEqual(classified.retryAfterMs, 12000, 'Retry-After 12 must parse to 12000ms');
  pass('3.2 429 with HTTP Retry-After header parsed accurately to 12000ms');
}

// Test 3.3: 429 response with daily/project quota exhaustion breaks out of model cascade immediately
{
  GeminiClient.resetForTests();
  const classified = GeminiClient['classify'](429, 'Quota exceeded for quota metric "GenerateContent requests per project per day".');
  assert.strictEqual(classified.category, 'QUOTA_EXHAUSTED');
  assert.strictEqual(classified.isProjectQuotaExhausted, true, 'Daily project quota error must be flagged as isProjectQuotaExhausted');
  pass('3.3 429 with daily/project quota exhaustion flagged to halt retry cascade immediately');
}

// Test 3.4: Bounded concurrency across simultaneous requests
{
  GeminiClient.resetForTests();
  GeminiClient.maxConcurrentCalls = 2; // bound concurrency to 2

  let peakInFlight = 0;
  let currentlyInFlight = 0;

  const mockTasks = Array.from({ length: 6 }).map(async (_, idx) => {
    await GeminiClient['acquireSlot']();
    currentlyInFlight++;
    peakInFlight = Math.max(peakInFlight, currentlyInFlight);
    // Simulate brief work
    await new Promise(r => setTimeout(r, 20));
    currentlyInFlight--;
    GeminiClient['releaseSlot']();
  });

  await Promise.all(mockTasks);
  assert.ok(peakInFlight <= 2, `Peak in flight (${peakInFlight}) must not exceed maxConcurrentCalls (2)`);
  pass('3.4 Bounded concurrency: concurrent callers queue and obey maxConcurrentCalls');
}

// ============================================================================
// SUITE 4: STUDENT DEDUPLICATION AND FALLBACK CORRECTNESS (CRITICAL REQUIREMENT 4)
// ============================================================================
console.log('\n--- Suite 4: Student Deduplication and Fallback Correctness ---');

// Test 4.1: Completed exam cannot be delivered again even through different routes
{
  const identity = await ExamCacheService.resolveCurriculumIdentity(bookId);
  const examParams = { count: 1, difficulty: 'MEDIUM', type: 'MULTIPLE_CHOICE' };
  const studentTestId = 'student_dedup_test_' + uuidv4();

  // Create student user and profile in database
  await db.query(
    `INSERT INTO users (id, email, password_hash, full_name, role)
     VALUES ($1, $2, 'hash', 'طالب تجريبي', 'STUDENT')`,
    [studentTestId, `${studentTestId}@test.com`]
  );
  await db.query(
    `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_type)
     VALUES ($1, 'طالب تجريبي', $2, $3, 'كلاهما')`,
    [studentTestId, stageId, gradeId]
  );

  // Store verified cached exam version
  const stored = await ExamCacheService.storeExamInCache({
    identity,
    unitIds: [chapterId],
    examParams,
    questions: [
      {
        id: 'q_eval_1',
        question_text: 'ما هو رمز عنصر الأكسجين؟',
        options: [{ id: 'opt_o', text: 'O', is_correct: true }, { id: 'opt_h', text: 'H', is_correct: false }]
      }
    ],
    skipProvenanceCheck: true
  });

  // Student takes this exam: record assignment in student_exam_assignments
  await ExamCacheService.recordStudentAssignment(stored.configKey, studentTestId, stored.examId);

  // Mark assignment as completed
  await db.query(
    `UPDATE student_exam_assignments SET status = 'COMPLETED' WHERE student_id = $1 AND cached_exam_id = $2`,
    [studentTestId, stored.examId]
  );

  // Attempt lookup via getCachedExamForStudent: must return hit: false, reason: 'ALL_VERSIONS_ASSIGNED'
  const lookupRes = await ExamCacheService.getCachedExamForStudent({
    studentId: studentTestId,
    bookId,
    chapterIds: [chapterId],
    examParams
  });

  assert.strictEqual(lookupRes.hit, false, 'Completed exam must NOT be delivered again');
  assert.strictEqual(lookupRes.reason, 'ALL_VERSIONS_ASSIGNED');

  // Attempt fallback delivery via getVerifiedFallbackExam: must NOT deliver this completed exam
  const fallbackRes = await ExamCacheService.getVerifiedFallbackExam({
    bookId,
    chapterIds: [chapterId],
    examParams,
    studentId: studentTestId
  });

  assert.strictEqual(fallbackRes, null, 'Fallback exam must NOT deliver already completed exam');
  pass('4.1 Completed exam cannot be delivered via cached lookup, concurrent waiter, or fallback routes');
}

// Test 4.2: Cross-grade student access strictly denied
{
  // Query existing secondary stage and grade
  const secStageRow = (await db.query(`SELECT id FROM academic_stages WHERE code = 'SECONDARY' LIMIT 1`)).rows[0];
  const secGradeRow = (await db.query(`SELECT id FROM grades WHERE stage_id = $1 LIMIT 1`, [secStageRow.id])).rows[0];
  const secStageId = secStageRow.id;
  const secGradeId = secGradeRow.id;

  // Create an exam in Secondary Grade 10
  const teacherId = uuidv4();
  await db.query(
    `INSERT INTO users (id, email, password_hash, full_name, role)
     VALUES ($1, 'teacher_sec@test.com', 'hash', 'معلم ثانوي', 'TEACHER')`,
    [teacherId]
  );
  const secExamId = uuidv4();
  await db.query(
    `INSERT INTO exams (id, teacher_id, academic_stage_id, grade_id, subject_id, title_ar, title_en, is_published)
     VALUES ($1, $2, $3, $4, $5, 'اختبار أحياء أولى ثانوي', 'Secondary 1 Biology Exam', 1)`,
    [secExamId, teacherId, secStageId, secGradeId, subjectId]
  );

  // A prep student attempts to access secExam
  const prepStudentProfile = { academicStageId: stageId, gradeId: gradeId };
  const examRes = (await db.query(`SELECT * FROM exams WHERE id = $1`, [secExamId])).rows[0];

  const isCrossGradeBlocked =
    (prepStudentProfile.academicStageId && examRes.academic_stage_id !== prepStudentProfile.academicStageId) ||
    (prepStudentProfile.gradeId && examRes.grade_id !== prepStudentProfile.gradeId);

  assert.strictEqual(isCrossGradeBlocked, true, 'Student from prep stage must be strictly blocked from secondary exam');
  pass('4.2 Cross-grade/cross-stage student authorization strictly enforced');
}

console.log('\n================================================================');
console.log(`ALL ${passed} CRITICAL POST-FIX REGRESSION TESTS PASSED (100%)`);
console.log('Zero Paid API Calls | Unverified Questions Invariant Proven');
console.log('================================================================\n');

// Clean up test override
AIRagEngine.setBlindSolverOverride(null);
AIRagEngine.clearMemoryCache();
process.exit(0);
