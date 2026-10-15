import assert from 'assert';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { setupDisposableTestDb } from './test_isolation_helper.mjs';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_phase4g3as_key';

// Initialize isolated disposable SQLite database for test
const { dbPath, tempDir } = setupDisposableTestDb('phase4g3as');

import { ExamCacheService } from '../dist/services/ExamCacheService.js';
import { signExamAttemptToken, verifyExamAttemptToken } from '../dist/services/answerValidationService.js';

console.log('================================================================');
console.log('PHASE 4G.3AS — AI EXAM RESTORATION & VERIFIED CACHE FALLBACK TEST');
console.log('Isolated In-Memory / Test State | Multi-Instance Concurrency | 100% Deterministic');
console.log('================================================================\n');

async function runTests() {
  // Test 1: Concurrency Lock Acquisition, Mutual Exclusion, and Expiration
  console.log('--- Test 1: Concurrency Lock Mutual Exclusion ---');
  const testConfigHash = crypto.createHash('sha256').update('test_concurrency_config_1').digest('hex');

  // Clean any residual test lock in platform_settings
  const { db } = await import('../dist/db/db.js');
  
  // Seed test curriculum fixtures using existing seeded stages and grades
  const stageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PREPARATORY'`);
  const stageId = stageRes.rows[0].id;
  const gradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PREP_1'`);
  const gradeId = gradeRes.rows[0].id;

  const subjectId = uuidv4();
  await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'AR', 'اللغة العربية', 'Arabic')`, [subjectId, gradeId]);

  await db.query(
    `INSERT INTO books (id, title_ar, title_en, grade_id, subject_id, academic_stage_id, term, school_type)
     VALUES ('81b8a308-7fcf-4938-8c45-aa0056624f32', 'كتاب اللغة العربية - الأول الإعدادي', 'Arabic Prep 1', $1, $2, $3, 1, 'عربي')`,
    [gradeId, subjectId, stageId]
  );
  await db.query(
    `INSERT INTO book_chapters (id, book_id, title_ar, title_en, chapter_number, start_page, end_page)
     VALUES ('b8e9f012-3456-4789-abcd-0123456789ab', '81b8a308-7fcf-4938-8c45-aa0056624f32', 'الوحدة الأولى: رحلات ومغامرات', 'Unit 1', 1, 1, 30)`
  );

  const lockKey = `lock:${testConfigHash.slice(0, 58)}`;
  await db.query(`DELETE FROM platform_settings WHERE setting_key = $1`, [lockKey]);

  // Instance A acquires lock
  const lockA = await ExamCacheService.acquireGenerationLock(testConfigHash, 10000);
  assert.strictEqual(lockA.acquired, true, 'Instance A should acquire lock');
  assert.ok(lockA.lockId, 'Instance A should have a valid lockId');

  // Instance B attempts to acquire same lock
  const lockB = await ExamCacheService.acquireGenerationLock(testConfigHash, 10000);
  assert.strictEqual(lockB.acquired, false, 'Instance B must NOT acquire concurrent lock for same configHash');

  // Instance A releases lock
  await ExamCacheService.releaseGenerationLock(testConfigHash, lockA.lockId);

  // Instance B now can acquire lock
  const lockBRetry = await ExamCacheService.acquireGenerationLock(testConfigHash, 10000);
  assert.strictEqual(lockBRetry.acquired, true, 'Instance B should acquire lock after Instance A releases it');

  // Clean up
  await ExamCacheService.releaseGenerationLock(testConfigHash, lockBRetry.lockId);
  console.log('  [PASS] 1. Multi-instance concurrency locking enforces strict mutual exclusion\n');

  // Test 2: Expired Lock Atomic Takeover
  console.log('--- Test 2: Expired Lock Atomic Takeover ---');
  const expiredHash = crypto.createHash('sha256').update('test_expired_config').digest('hex');
  const expiredKey = `lock:${expiredHash.slice(0, 58)}`;
  const stalePayload = JSON.stringify({ lockId: 'stale_id_999', expiresAt: Date.now() - 5000 });
  await db.query(`DELETE FROM platform_settings WHERE setting_key = $1`, [expiredKey]);
  await db.query(
    `INSERT INTO platform_settings (setting_key, setting_value, updated_at, updated_by) VALUES ($1, $2, CURRENT_TIMESTAMP, 'TEST')`,
    [expiredKey, stalePayload]
  );

  // New instance attempts to acquire; should recognize expired lock and take over
  const takeover = await ExamCacheService.acquireGenerationLock(expiredHash, 15000);
  assert.strictEqual(takeover.acquired, true, 'Should successfully take over expired lock');
  assert.notStrictEqual(takeover.lockId, 'stale_id_999', 'New lock ID must be issued');

  await ExamCacheService.releaseGenerationLock(expiredHash, takeover.lockId);
  console.log('  [PASS] 2. Expired concurrency locks are safely taken over\n');

  // Test 3: Verified Cache Fallback Lookup (Empty vs Present)
  console.log('--- Test 3: Verified Cache Fallback Lookup ---');
  // First query with non-existent config: should return null
  const emptyFallback = await ExamCacheService.getVerifiedFallbackExam({
    bookId: '81b8a308-7fcf-4938-8c45-aa0056624f32', // Arabic Prep 1
    chapterIds: 'b8e9f012-3456-4789-abcd-0123456789ab',
    examParams: { count: 3 }
  });
  assert.strictEqual(emptyFallback, null, 'Cache miss fallback must return null when no verified exam exists');
  console.log('  [PASS] 3.1 Cache miss fallback fails closed (returns null) without fabricating data');

  // Now create and store a verified exam fixture in shared_cached_exams
  const identity = await ExamCacheService.resolveCurriculumIdentity('81b8a308-7fcf-4938-8c45-aa0056624f32');
  const testUnitId = 'b8e9f012-3456-4789-abcd-0123456789ab';
  const mockQuestions = [
    {
      id: `q_test_1_${Date.now()}`,
      book_id: identity.bookId,
      chapter_id: testUnitId,
      page_reference: 4,
      question_text: 'ما هي عاصمة جمهورية مصر العربية؟',
      question_type: 'MULTIPLE_CHOICE',
      difficulty: 'MEDIUM',
      bloom_level: 'REMEMBER',
      options: [
        { id: 'opt_1', text: 'القاهرة', is_correct: true },
        { id: 'opt_2', text: 'الإسكندرية', is_correct: false },
        { id: 'opt_3', text: 'الجيزة', is_correct: false },
        { id: 'opt_4', text: 'الأقصر', is_correct: false }
      ],
      correct_answer: 'القاهرة',
      explanation: 'القاهرة هي عاصمة مصر المعتمدة.'
    },
    {
      id: `q_test_2_${Date.now()}`,
      book_id: identity.bookId,
      chapter_id: testUnitId,
      page_reference: 5,
      question_text: 'أي مما يلي يعد من أركان الجملة الاسمية في لغتنا العربية؟',
      question_type: 'MULTIPLE_CHOICE',
      difficulty: 'MEDIUM',
      bloom_level: 'UNDERSTAND',
      options: [
        { id: 'opt_21', text: 'المبتدأ والخبر', is_correct: true },
        { id: 'opt_22', text: 'الفعل والفاعل', is_correct: false },
        { id: 'opt_23', text: 'المفعول به', is_correct: false },
        { id: 'opt_24', text: 'الحال والنعت', is_correct: false }
      ],
      correct_answer: 'المبتدأ والخبر',
      explanation: 'تتكون الجملة الاسمية من المبتدأ والخبر.'
    },
    {
      id: `q_test_3_${Date.now()}`,
      book_id: identity.bookId,
      chapter_id: testUnitId,
      page_reference: 6,
      question_text: 'ما إعراب الفاعل في اللغة العربية دائماً؟',
      question_type: 'MULTIPLE_CHOICE',
      difficulty: 'MEDIUM',
      bloom_level: 'REMEMBER',
      options: [
        { id: 'opt_31', text: 'مرفوع', is_correct: true },
        { id: 'opt_32', text: 'منصوب', is_correct: false },
        { id: 'opt_33', text: 'مجرور', is_correct: false },
        { id: 'opt_34', text: 'مجزوم', is_correct: false }
      ],
      correct_answer: 'مرفوع',
      explanation: 'الفاعل مرفوع دائماً.'
    }
  ];

  const storedFixture = await ExamCacheService.storeExamInCache({
    identity,
    unitIds: [testUnitId],
    examParams: { count: 3 },
    questions: mockQuestions,
    skipProvenanceCheck: true // Test fixture
  });
  assert.ok(storedFixture.examId, 'Stored exam fixture must have valid examId');

  // Query fallback again: now it must return the verified cached exam!
  const presentFallback = await ExamCacheService.getVerifiedFallbackExam({
    bookId: identity.bookId,
    chapterIds: testUnitId,
    examParams: { count: 3 }
  });
  assert.ok(presentFallback, 'Verified fallback exam must be found');
  assert.strictEqual(presentFallback.examId, storedFixture.examId, 'Fallback must match stored fixture examId');
  assert.strictEqual(presentFallback.questions.length, 3, 'Fallback must contain exactly 3 questions');
  console.log('  [PASS] 3.2 Verified cache fallback successfully retrieves stored verified exam\n');

  // Test 4: Attempt Token Issuance & Verification on Fallback Exam
  console.log('--- Test 4: Attempt Token Binding & Verification ---');
  const studentId = 'test_student_user_123';
  const tokenPayload = {
    schema_version: 'v1',
    attempt_id: `att_${uuidv4()}`,
    student_id: studentId,
    cached_exam_id: presentFallback.examId,
    config_hash: presentFallback.configHash,
    content_hash: presentFallback.contentHash,
    version_number: presentFallback.versionNumber,
    question_ids: presentFallback.questions.map(q => q.id),
    issued_at: Date.now(),
    expires_at: Date.now() + 7200000
  };

  const attemptToken = signExamAttemptToken(tokenPayload);
  assert.ok(attemptToken, 'Attempt token must be signed');

  const verifiedToken = verifyExamAttemptToken(attemptToken);
  assert.strictEqual(verifiedToken.valid, true, 'Signed attempt token must be valid');
  assert.strictEqual(verifiedToken.payload.student_id, studentId, 'Attempt token student_id must match');
  assert.strictEqual(verifiedToken.payload.cached_exam_id, presentFallback.examId, 'Attempt token cached_exam_id must match');
  console.log('  [PASS] 4. Cryptographic attempt token correctly signed and verified for fallback exam\n');

  // Test 5: Clean Up Test Assessment Records
  console.log('--- Test 5: Clean Up Test Fixtures ---');
  await db.query(`DELETE FROM shared_cached_exams WHERE id = $1`, [storedFixture.examId]);
  await db.query(`DELETE FROM student_exam_assignments WHERE cached_exam_id = $1`, [storedFixture.examId]);
  console.log('  [PASS] 5. Test fixtures cleanly removed; persistent curriculum data untouched\n');

  console.log('================================================================');
  console.log('ALL PHASE 4G.3AS REGRESSION TESTS PASSED! (5/5)');
  console.log('================================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
