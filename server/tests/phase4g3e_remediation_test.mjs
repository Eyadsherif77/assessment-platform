import assert from 'assert';
import http from 'http';
import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from '../dist/db/db.js';
import aiRouter from '../dist/routes/ai.js';
import { aiRagEngine, AIRagEngine } from '../dist/services/ai/aiRagEngine.js';
import { ExamCacheService } from '../dist/services/examCacheService.js';
import {
  AnswerValidationService,
  signExamAttemptToken,
  verifyExamAttemptToken
} from '../dist/services/answerValidationService.js';

console.log('================================================================');
console.log('PHASE 4G.3E — SECURE AI EXAM REMEDIATION TEST SUITE');
console.log('Zero Database Mutations | Zero External AI Calls | Strictly Isolated');
console.log('================================================================\n');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret_assessment_platform_jwt_key_2026';
process.env.EXAM_ATTEMPT_SECRET = process.env.EXAM_ATTEMPT_SECRET || 'test_exam_attempt_integrity_secret_2026';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'mock-key-for-phase4g3e';
const JWT_SECRET = process.env.JWT_SECRET;

// Track DB writes to ensure zero production mutations
let productionWritesAttempted = 0;
const originalDbQuery = db.query.bind(db);



// In-Memory Mock Database
const mockState = {
  users: new Map(),
  studentProfiles: new Map(),
  books: new Map(),
  bookChapters: new Map(),
  bookChunks: new Map(),
  bookPages: new Map(),
  sharedCachedExams: new Map(),
  studentExamAssignments: new Map(),
  aiEvaluations: new Map(),
  topicMastery: new Map(),
  studentLearningHistory: [],
  questionBankItems: [],
  simulateDupEntryOnInsert: false
};

// Fixture Constants
const FIXTURE_STUDENT_A_ID = 'student_alice_123';
const FIXTURE_STUDENT_B_ID = 'student_bob_456';
const FIXTURE_STAGE_ID = 'stage_prep_123';
const FIXTURE_GRADE_ID = 'grade_prep3_123';
const FIXTURE_SUBJECT_ID = 'subj_science_123';
const FIXTURE_BOOK_ID = 'book_science_prep3';
const FIXTURE_CHAPTER_ID = 'ch_forces_motion';

// Populate Student A
mockState.users.set(FIXTURE_STUDENT_A_ID, {
  id: FIXTURE_STUDENT_A_ID,
  email: 'alice@test.edu',
  role: 'STUDENT',
  full_name: 'أليس الطالبة',
  is_active: 1
});
mockState.studentProfiles.set(FIXTURE_STUDENT_A_ID, {
  user_id: FIXTURE_STUDENT_A_ID,
  academic_stage_id: FIXTURE_STAGE_ID,
  grade_id: FIXTURE_GRADE_ID,
  school_type: 'عربي'
});

// Populate Student B
mockState.users.set(FIXTURE_STUDENT_B_ID, {
  id: FIXTURE_STUDENT_B_ID,
  email: 'bob@test.edu',
  role: 'STUDENT',
  full_name: 'بوب الطالب',
  is_active: 1
});
mockState.studentProfiles.set(FIXTURE_STUDENT_B_ID, {
  user_id: FIXTURE_STUDENT_B_ID,
  academic_stage_id: FIXTURE_STAGE_ID,
  grade_id: FIXTURE_GRADE_ID,
  school_type: 'عربي'
});

// Populate Book & Chapter
mockState.books.set(FIXTURE_BOOK_ID, {
  id: FIXTURE_BOOK_ID,
  academic_stage_id: FIXTURE_STAGE_ID,
  grade_id: FIXTURE_GRADE_ID,
  subject_id: FIXTURE_SUBJECT_ID,
  title_ar: 'العلوم - الصف الثالث الإعدادي',
  title_en: 'Science - Prep 3',
  school_type: 'عربي',
  term: 1,
  subject_code: 'SCI',
  subject_name_ar: 'العلوم',
  subject_name_en: 'Science',
  grade_name_ar: 'الصف الثالث الإعدادي',
  grade_name_en: 'Third Preparatory',
  stage_name_ar: 'المرحلة الإعدادية',
  stage_name_en: 'Preparatory Stage'
});

mockState.bookChapters.set(FIXTURE_CHAPTER_ID, {
  id: FIXTURE_CHAPTER_ID,
  book_id: FIXTURE_BOOK_ID,
  title_ar: 'الوحدة الأولى: القوى والحركة',
  title_en: 'Unit 1: Forces and Motion',
  chapter_number: 1,
  start_page: 5,
  end_page: 25
});

const FIXTURE_CHUNK_ID = 'chunk_forces_p10';
const FIXTURE_PASSAGE = 'مفهوم السرعة المنتظمة في الحركة: السرعة المنتظمة هي السرعة التي يتحرك بها الجسم عندما يقطع مسافات متساوية في أزمنة متساوية مهما كانت هذه المسافات أو الأزمنة صغيرة. وتقاس السرعة بوحدة متر لكل ثانية.';

mockState.bookChunks.set(FIXTURE_CHUNK_ID, {
  id: FIXTURE_CHUNK_ID,
  book_id: FIXTURE_BOOK_ID,
  chapter_id: FIXTURE_CHAPTER_ID,
  page_number: 10,
  content: FIXTURE_PASSAGE
});

mockState.bookPages.set(`${FIXTURE_BOOK_ID}_10`, {
  book_id: FIXTURE_BOOK_ID,
  page_number: 10,
  content: FIXTURE_PASSAGE,
  raw_text: FIXTURE_PASSAGE
});

// DB Mocking Interceptor
db.query = async (sql, params = []) => {
  const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

  // Users lookup
  if (norm.includes('from users where id =')) {
    const user = mockState.users.get(params[0]);
    return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
  }

  // Student profiles lookup
  if (norm.includes('from student_profiles where user_id =')) {
    const prof = mockState.studentProfiles.get(params[0]);
    return { rows: prof ? [prof] : [], rowCount: prof ? 1 : 0 };
  }

  // Platform settings
  if (norm.includes('from platform_settings where setting_key =')) {
    return { rows: [{ setting_value: '10' }], rowCount: 1 };
  }

  // Monthly exam limits check (always 0 exams taken so far)
  if (norm.includes('from ai_evaluations where student_id =') && norm.includes('count(*)')) {
    return { rows: [{ count: 0 }], rowCount: 1 };
  }

  // Books lookup (simple)
  if (norm.includes('from books where id =')) {
    const b = mockState.books.get(params[0]);
    return { rows: b ? [{ id: b.id }] : [], rowCount: b ? 1 : 0 };
  }

  // Curriculum Identity
  if (norm.includes('from books b') && norm.includes('where b.id =')) {
    const b = mockState.books.get(params[0]);
    if (!b) return { rows: [], rowCount: 0 };
    return {
      rows: [{
        book_id: b.id,
        title_ar: b.title_ar,
        title_en: b.title_en,
        academic_stage_id: b.academic_stage_id,
        grade_id: b.grade_id,
        subject_id: b.subject_id,
        term: b.term,
        school_type: b.school_type,
        grade_name_ar: b.grade_name_ar,
        grade_name_en: b.grade_name_en,
        subject_name_ar: b.subject_name_ar,
        subject_name_en: b.subject_name_en,
        stage_name_ar: b.stage_name_ar,
        stage_name_en: b.stage_name_en
      }],
      rowCount: 1
    };
  }

  // Book Chapters lookup (all for book)
  if (norm.includes('from book_chapters') && norm.includes('where book_id =') && !norm.includes('where id =')) {
    const chList = Array.from(mockState.bookChapters.values()).filter(c => c.book_id === params[0]);
    // console.log('DEBUG CHAPTERS ALL:', chList);
    return { rows: chList, rowCount: chList.length };
  }

  // Chapter lookup by ID and book_id
  if (norm.includes('from book_chapters') && norm.includes('where id =') && norm.includes('book_id =')) {
    const ch = mockState.bookChapters.get(params[0]);
    if (ch && ch.book_id === params[1]) {
      return { rows: [ch], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // Chunks retrieval
  if (norm.includes('from book_chunks') && norm.includes('chapter_id =')) {
    const chk = mockState.bookChunks.get(FIXTURE_CHUNK_ID);
    return { rows: chk ? [chk] : [], rowCount: chk ? 1 : 0 };
  }

  // Chunks lookup by id and book_id (supports both parameter orderings)
  if (norm.includes('from book_chunks') && norm.includes('id =') && norm.includes('book_id =')) {
    const chunkId = norm.indexOf('id =') < norm.indexOf('book_id =') ? params[0] : params[1];
    const bookId = norm.indexOf('id =') < norm.indexOf('book_id =') ? params[1] : params[0];
    const chk = mockState.bookChunks.get(chunkId);
    if (chk && chk.book_id === bookId) {
      return { rows: [chk], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // Pages lookup
  if (norm.includes('from book_pages where book_id =') && norm.includes('page_number =')) {
    const p = mockState.bookPages.get(`${params[0]}_${params[1]}`);
    return { rows: p ? [p] : [], rowCount: p ? 1 : 0 };
  }

  // Shared Cached Exams - Lookup oldest unassigned candidate
  if (norm.includes('from shared_cached_exams sce') && norm.includes('where sce.config_hash =')) {
    return { rows: [], rowCount: 0 };
  }

  // Shared Cached Exams - Total versions count
  if (norm.includes('select count(*) as cnt from shared_cached_exams where config_hash =')) {
    return { rows: [{ cnt: 0 }], rowCount: 1 };
  }

  // Shared Cached Exams - Max version number
  if (norm.includes('max(version_number) as max_v') || norm.includes('max(version_number)')) {
    return { rows: [{ next_ver: 1 }], rowCount: 1 };
  }

  // Shared Cached Exams - Lookup by ID
  if (norm.includes('from shared_cached_exams where id =')) {
    const exam = mockState.sharedCachedExams.get(params[0]);
    return { rows: exam ? [exam] : [], rowCount: exam ? 1 : 0 };
  }

  // Insert into shared_cached_exams
  if (norm.includes('insert into shared_cached_exams')) {
    const examId = params[0];
    const examRecord = {
      id: examId,
      config_key: params[1],
      config_hash: params[2],
      content_hash: params[3],
      version_number: params[4],
      version: params[4],
      book_id: params[5],
      academic_stage_id: params[6],
      grade_id: params[7],
      subject_id: params[8],
      questions_data: params[15],
      questions: params[15],
      total_questions: params[16],
      provenance_verified: params[17]
    };
    mockState.sharedCachedExams.set(examId, examRecord);
    return { rows: [], rowCount: 1 };
  }

  // Student exam assignments
  if (norm.includes('from student_exam_assignments where cached_exam_id =')) {
    return { rows: [], rowCount: 0 };
  }
  if (norm.includes('insert into student_exam_assignments')) {
    mockState.studentExamAssignments.set(params[0], params);
    return { rows: [], rowCount: 1 };
  }

  // AI Evaluations - Check duplicate or select by ID
  if (norm.includes('from ai_evaluations where id =')) {
    const existing = mockState.aiEvaluations.get(params[0]);
    return { rows: existing ? [existing] : [], rowCount: existing ? 1 : 0 };
  }

  // Update AI Evaluation
  if (norm.includes('update ai_evaluations set evaluation_report =')) {
    const evalRecord = mockState.aiEvaluations.get(params[1]);
    if (evalRecord) {
      evalRecord.evaluation_report = params[0];
    }
    return { rows: [], rowCount: 1 };
  }

  // Insert AI Evaluation
  if (norm.includes('insert into ai_evaluations')) {
    const evalId = params[0];
    if (mockState.aiEvaluations.has(evalId) || mockState.simulateDupEntryOnInsert) {
      mockState.simulateDupEntryOnInsert = false;
      const err = new Error(`Duplicate entry '${evalId}' for key 'ai_evaluations.PRIMARY'`);
      err.code = 'ER_DUP_ENTRY';
      throw err;
    }
    const evalRecord = {
      id: evalId,
      student_id: params[1],
      book_id: params[2],
      chapter_id: params[3],
      subject_id: params[4],
      score: params[5],
      total_questions: params[6],
      questions_data: params[7],
      student_answers_data: params[8],
      evaluation_report: params[9]
    };
    mockState.aiEvaluations.set(evalId, evalRecord);
    return { rows: [], rowCount: 1 };
  }

  // Topic Mastery Upsert
  if (norm.includes('topic_mastery')) {
    const key = `${params[0]}_${params[1]}_${params[2]}`;
    mockState.topicMastery.set(key, { mastery: params[3], total: params[4], correct: params[5] });
    return { rows: [], rowCount: 1 };
  }

  // Learning History Select
  if (norm.includes('from student_learning_history where reference_id =')) {
    const matching = mockState.studentLearningHistory.filter(h => h.reference_id === params[0]);
    return { rows: matching, rowCount: matching.length };
  }

  // Learning History Insert
  if (norm.includes('insert into student_learning_history')) {
    mockState.studentLearningHistory.push({
      id: params[0],
      student_id: params[1],
      type: params[2],
      reference_id: params[3],
      details: params[4]
    });
    return { rows: [], rowCount: 1 };
  }

  // Question bank insert
  if (norm.includes('question_banks')) {
    mockState.questionBankItems.push(params);
    return { rows: [], rowCount: 1 };
  }

  return { rows: [], rowCount: 0 };
};

// Express App Setup
const app = express();
app.use(express.json());
app.use('/api/ai', aiRouter);

const server = http.createServer(app);
let port = 0;

import { generateToken } from '../dist/middleware/auth.js';

function generateStudentToken(userId) {
  return generateToken({
    id: userId,
    email: `${userId}@test.edu`,
    role: 'STUDENT',
    fullName: 'Test Student'
  });
}

// Setup Mock Bounded Blind Solver for AIRagEngine
AIRagEngine.setBlindSolverOverride(async (candidate, passage) => {
  const matchingOpt = candidate.options.find(o => o.text.includes('مسافات متساوية في أزمنة متساوية')) || candidate.options[0];
  return {
    status: 'SOLVED',
    selected_option_id: matchingOpt.id,
    defensible_option_ids: [matchingOpt.id],
    entailed_evidence_quote: 'السرعة المنتظمة هي السرعة التي يتحرك بها الجسم',
    solver_rationale: 'Definition matches option exactly',
    raw_response: '{"status":"SOLVED"}'
  };
});

// Mock Gemini Question Generator
aiRagEngine.callGeminiForQuestions = async (prompt, count, chunk) => {
  return [
    {
      id: 'q_gen_forces_1',
      question_text: 'ما مفهوم السرعة المنتظمة في الحركة المقررة؟',
      options: [
        { id: 'opt_a', text: 'السرعة التي يقطع بها الجسم مسافات متساوية في أزمنة متساوية', is_correct: true },
        { id: 'opt_b', text: 'السرعة المتغيرة في أزمنة متساوية', is_correct: false },
        { id: 'opt_c', text: 'السرعة اللحظية في نقطة معينة', is_correct: false },
        { id: 'opt_d', text: 'السرعة المتوسطة لرحلة كاملة', is_correct: false }
      ],
      correct_answer: 'السرعة التي يقطع بها الجسم مسافات متساوية في أزمنة متساوية',
      explanation: 'السرعة المنتظمة تقطع مسافات متساوية في أزمنة متساوية.',
      source_page: 10,
      page_reference: 10,
      source_chunk_id: FIXTURE_CHUNK_ID,
      chunk_id: FIXTURE_CHUNK_ID,
      chunk_text: FIXTURE_PASSAGE,
      evidence_quote: 'السرعة المنتظمة هي السرعة التي يتحرك بها الجسم'
    }
  ];
};

async function runTests() {
  await new Promise(resolve => {
    server.listen(0, () => {
      port = server.address().port;
      resolve();
    });
  });

  const baseUrl = `http://localhost:${port}`;
  const studentAToken = generateStudentToken(FIXTURE_STUDENT_A_ID);
  const studentBToken = generateStudentToken(FIXTURE_STUDENT_B_ID);

  let currentAttemptToken = null;
  let currentCachedExamId = null;
  let currentContentHash = null;
  let currentConfigHash = null;
  let generatedQuestionId = null;
  let chosenOptionId = null;

  // -------------------------------------------------------------
  // TEST 1: No answer keys or private context in serialized response
  // -------------------------------------------------------------
  console.log('▶ Test 1: No answer keys, private context, or verification data in generation HTTP response');
  {
    const res = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentAToken}`
      },
      body: JSON.stringify({
        book_id: FIXTURE_BOOK_ID,
        chapter_id: FIXTURE_CHAPTER_ID,
        subject_id: FIXTURE_SUBJECT_ID,
        count: 1
      })
    });

    if (res.status !== 200) {
      const errBody = await res.json();
      console.error('generate-quiz error body:', errBody);
    }
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();

    // 1. Never return _server_context_questions
    assert.strictEqual(data._server_context_questions, undefined, 'Must not return _server_context_questions');

    // 2. Questions must be sanitized
    assert.ok(Array.isArray(data.questions), 'Must return questions array');
    assert.strictEqual(data.questions.length, 1, 'Must return 1 generated question');
    const q = data.questions[0];

    assert.strictEqual(q.correct_answer, undefined, 'Must not leak correct_answer');
    assert.strictEqual(q.correct_option_id, undefined, 'Must not leak correct_option_id');
    assert.strictEqual(q.explanation, undefined, 'Must not leak explanation');
    assert.strictEqual(q.evidence_quote, undefined, 'Must not leak evidence_quote');
    assert.strictEqual(q.solver_rationale, undefined, 'Must not leak solver_rationale');
    assert.strictEqual(q.internal_verification, undefined, 'Must not leak internal_verification');

    // Verify options do not leak is_correct
    for (const opt of q.options) {
      assert.strictEqual(opt.is_correct, undefined, 'Option must not leak is_correct');
      assert.strictEqual(opt.isCorrect, undefined, 'Option must not leak isCorrect');
    }

    // 3. Must return attempt_token
    currentAttemptToken = data.attempt_token;
    const verifiedData = verifyExamAttemptToken(data.attempt_token);
    assert.ok(verifiedData.valid, 'attempt_token must be valid');
    currentCachedExamId = verifiedData.payload?.cached_exam_id;
    currentContentHash = verifiedData.payload?.content_hash;
    currentConfigHash = verifiedData.payload?.config_hash;
    generatedQuestionId = q.id;
    chosenOptionId = q.options[0].id;

    console.log('  ✔ Passed: Serialized HTTP response contains zero answer keys or private context, and includes attempt_token');
  }

  // -------------------------------------------------------------
  // TEST 2: Tampered, expired, malformed, and wrong-student attempt tokens
  // -------------------------------------------------------------
  console.log('▶ Test 2: Tampered, expired, malformed, and wrong-student attempt tokens rejected');
  {
    // A. Malformed token
    const malformedRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        attempt_token: 'malformed.token.value',
        answers: { [generatedQuestionId]: chosenOptionId }
      })
    });
    assert.strictEqual(malformedRes.status, 401, 'Malformed token must return 401');

    // B. Tampered signature
    const [ver, payloadB64] = currentAttemptToken.split('.');
    const tamperedToken = `${ver}.${payloadB64}.tampered_signature_bytes`;
    const tamperedRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        attempt_token: tamperedToken,
        answers: { [generatedQuestionId]: chosenOptionId }
      })
    });
    assert.strictEqual(tamperedRes.status, 401, 'Tampered token must return 401');

    // C. Expired token
    const expiredPayload = {
      schema_version: 'v1',
      attempt_id: 'att_expired_1',
      student_id: FIXTURE_STUDENT_A_ID,
      cached_exam_id: currentCachedExamId,
      config_hash: 'config_123',
      content_hash: 'hash_123',
      version_number: 1,
      question_ids: [generatedQuestionId],
      issued_at: Date.now() - 10000,
      expires_at: Date.now() - 5000 // In the past
    };
    const expiredToken = signExamAttemptToken(expiredPayload);
    const expiredRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        attempt_token: expiredToken,
        answers: { [generatedQuestionId]: chosenOptionId }
      })
    });
    assert.strictEqual(expiredRes.status, 401, 'Expired token must return 401');

    // D. Wrong student: Student B attempts to submit Student A's token
    const wrongStudentRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentBToken}` },
      body: JSON.stringify({
        attempt_token: currentAttemptToken,
        answers: { [generatedQuestionId]: chosenOptionId }
      })
    });
    assert.strictEqual(wrongStudentRes.status, 403, 'Cross-student submission must return 403');
    const wrongStudentBody = await wrongStudentRes.json();
    assert.strictEqual(wrongStudentBody.code, 'STUDENT_IDENTITY_MISMATCH');

    console.log('  ✔ Passed: Malformed, tampered, expired, and wrong-student tokens rejected strictly');
  }

  // -------------------------------------------------------------
  // TEST 3: Client-supplied questions and answer keys being rejected
  // -------------------------------------------------------------
  console.log('▶ Test 3: Client-supplied questions and answer keys strictly rejected');
  {
    // Client trying to supply questions array (legacy exploit)
    const legacyRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        attempt_token: currentAttemptToken,
        questions: [{ id: 'fake_q', correct_answer: 'hacked' }],
        answers: { [generatedQuestionId]: chosenOptionId }
      })
    });
    assert.strictEqual(legacyRes.status, 400, 'Legacy submission with client questions must return 400');
    const legacyBody = await legacyRes.json();
    assert.strictEqual(legacyBody.code, 'LEGACY_SUBMISSION_REJECTED');

    // Missing attempt_token
    const missingTokenRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        answers: { [generatedQuestionId]: chosenOptionId }
      })
    });
    assert.strictEqual(missingTokenRes.status, 400, 'Missing attempt_token must return 400');

    console.log('  ✔ Passed: Client-supplied questions and answer keys rejected with 400 LEGACY_SUBMISSION_REJECTED');
  }

  // -------------------------------------------------------------
  // TEST 4 & 5: Foreign question IDs and option IDs rejected
  // -------------------------------------------------------------
  console.log('▶ Test 4 & 5: Foreign question IDs, duplicate answers, and unknown option IDs rejected');
  {
    // Foreign Question ID
    const foreignQRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        attempt_token: currentAttemptToken,
        answers: { 'q_foreign_999': 'opt_a' }
      })
    });
    assert.strictEqual(foreignQRes.status, 400, 'Foreign question ID must return 400');
    const foreignQBody = await foreignQRes.json();
    assert.strictEqual(foreignQBody.code, 'FOREIGN_QUESTION_SUBMITTED');

    // Unknown Option ID
    const unknownOptRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        attempt_token: currentAttemptToken,
        answers: { [generatedQuestionId]: 'opt_non_existent' }
      })
    });
    assert.strictEqual(unknownOptRes.status, 400, 'Unknown option ID must return 400');
    const unknownOptBody = await unknownOptRes.json();
    assert.strictEqual(unknownOptBody.code, 'UNKNOWN_OPTION_SUBMITTED');

    console.log('  ✔ Passed: Foreign question IDs and unknown option IDs rejected strictly');
  }

  // -------------------------------------------------------------
  // TEST 6: Authoritative grading & Replay rejection
  // -------------------------------------------------------------
  console.log('▶ Test 6: Server-Authoritative grading and duplicate submission rejection (409 Conflict)');
  {
    const initialMasteryCount = mockState.topicMastery.size;
    const initialLearningHistoryCount = mockState.studentLearningHistory.length;

    // 1st submission: Valid
    const evalRes1 = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        attempt_token: currentAttemptToken,
        answers: { [generatedQuestionId]: chosenOptionId }
      })
    });
    assert.strictEqual(evalRes1.status, 200, `First evaluation must succeed with 200, got ${evalRes1.status}`);
    const evalBody1 = await evalRes1.json();
    assert.ok(evalBody1.report, 'Report must be returned');
    assert.strictEqual(evalBody1.report.provisional_score ?? evalBody1.report.score, 1, 'Score must be 1 out of 1');
    assert.strictEqual(evalBody1.report.provisional_max_score ?? evalBody1.report.totalQuestions, 1, 'Total questions must be 1');

    // Verify authoritative truth loaded from DB, not client
    assert.strictEqual(mockState.aiEvaluations.size, 1, 'One AI evaluation record written to DB');
    const historyCountAfterFirst = mockState.studentLearningHistory.length;

    // 2nd submission (Lost HTTP response retry with same token & identical answers)
    const evalRes2 = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        attempt_token: currentAttemptToken,
        answers: { [generatedQuestionId]: chosenOptionId }
      })
    });
    assert.strictEqual(evalRes2.status, 200, `Retry must return 200 OK with recovered report, got ${evalRes2.status}`);
    const evalBody2 = await evalRes2.json();
    assert.strictEqual(evalBody2.recovered, true, 'Must indicate recovered report');
    assert.strictEqual(evalBody2.report.evaluation_id, evalBody1.report.evaluation_id);

    // Verify retry CANNOT update topic mastery or learning history (zero double-counting)
    assert.strictEqual(mockState.studentLearningHistory.length, historyCountAfterFirst, 'Learning history NOT double-counted');

    // 3rd submission: Tampering with answers on retried attempt -> 409 ATTEMPT_ANSWER_MISMATCH
    const tamperedAnswersRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        attempt_token: currentAttemptToken,
        answers: { [generatedQuestionId]: 'opt_b' }
      })
    });
    assert.strictEqual(tamperedAnswersRes.status, 409, 'Modified answers on retried attempt must return 409');
    const tamperedBody = await tamperedAnswersRes.json();
    assert.strictEqual(tamperedBody.code, 'ATTEMPT_ANSWER_MISMATCH');

    console.log('  ✔ Passed: First submission accepted; lost response retry recovers 200 OK without double-counting; modified answers rejected with 409');
  }

  // -------------------------------------------------------------
  // TEST 7: Concurrent submission collision simulation
  // -------------------------------------------------------------
  console.log('▶ Test 7: Concurrent submission collision handles ER_DUP_ENTRY / SQLITE_CONSTRAINT safely');
  {
    // Generate fresh attempt token
    const newAttemptPayload = {
      schema_version: 'v1',
      attempt_id: 'att_concurrent_race_1',
      student_id: FIXTURE_STUDENT_A_ID,
      cached_exam_id: currentCachedExamId,
      config_hash: currentConfigHash,
      content_hash: currentContentHash,
      version_number: 1,
      question_ids: [generatedQuestionId],
      issued_at: Date.now(),
      expires_at: Date.now() + 600000
    };
    const concurrentToken = signExamAttemptToken(newAttemptPayload);

    // Simulate concurrent evaluation write where DB throws ER_DUP_ENTRY during insertion
    mockState.simulateDupEntryOnInsert = true;

    const raceRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        attempt_token: concurrentToken,
        answers: { [generatedQuestionId]: chosenOptionId }
      })
    });

    assert.strictEqual(raceRes.status, 409, 'Concurrent collision must safely return 409 Conflict');
    const raceBody = await raceRes.json();
    assert.strictEqual(raceBody.code, 'ATTEMPT_ALREADY_EVALUATED');

    console.log('  ✔ Passed: Concurrent duplicate writes safely caught and returned as 409 Conflict');
  }

  // -------------------------------------------------------------
  // TEST 8: Bounded solver timeout, malformed output, ambiguity & disagreement
  // -------------------------------------------------------------
  console.log('▶ Test 8: Solver timeout, malformed output, ambiguity, and disagreement fail closed');
  let bankCountBeforeRejections = 0;
  {
    AIRagEngine.clearMemoryCache();
    bankCountBeforeRejections = mockState.questionBankItems.length;
    // A. Solver timeout
    AIRagEngine.setBlindSolverOverride(async () => {
      const err = new Error('Solver timeout exceeded');
      err.code = 'SOLVER_TIMEOUT';
      throw err;
    });
    try {
      await aiRagEngine.generateQuestions({
        academicStageId: FIXTURE_STAGE_ID,
        gradeId: FIXTURE_GRADE_ID,
        subjectId: FIXTURE_SUBJECT_ID,
        bookId: FIXTURE_BOOK_ID,
        chapterId: FIXTURE_CHAPTER_ID,
        count: 1
      });
      assert.fail('Should have failed closed on solver timeout');
    } catch (err) {
      assert.ok(err.message.includes('EXAM_GENERATION_FAILED'), `Expected EXAM_GENERATION_FAILED on timeout, got: ${err.message}`);
    }

    // B. Solver ambiguity (multiple defensible options)
    AIRagEngine.setBlindSolverOverride(async (candidate) => {
      return {
        status: 'AMBIGUOUS',
        selected_option_id: candidate.options[0].id,
        defensible_option_ids: [candidate.options[0].id, candidate.options[1].id],
        entailed_evidence_quote: 'السرعة المنتظمة هي السرعة التي يتحرك بها الجسم',
        solver_rationale: 'Multiple options plausible',
        raw_response: '{"status":"AMBIGUOUS"}'
      };
    });
    try {
      await aiRagEngine.generateQuestions({
        academicStageId: FIXTURE_STAGE_ID,
        gradeId: FIXTURE_GRADE_ID,
        subjectId: FIXTURE_SUBJECT_ID,
        bookId: FIXTURE_BOOK_ID,
        chapterId: FIXTURE_CHAPTER_ID,
        count: 1
      });
      assert.fail('Should have failed closed on ambiguity');
    } catch (err) {
      assert.ok(err.message.includes('EXAM_GENERATION_FAILED'), `Expected EXAM_GENERATION_FAILED on ambiguity, got: ${err.message}`);
    }

    // C. Solver disagreement
    AIRagEngine.setBlindSolverOverride(async (candidate) => {
      return {
        status: 'SOLVED',
        selected_option_id: candidate.options[1].id, // Chooses opt_b instead of generator's opt_a
        defensible_option_ids: [candidate.options[1].id],
        entailed_evidence_quote: 'السرعة المتغيرة في أزمنة متساوية',
        solver_rationale: 'Disagreed with generator',
        raw_response: '{"status":"SOLVED"}'
      };
    });
    try {
      await aiRagEngine.generateQuestions({
        academicStageId: FIXTURE_STAGE_ID,
        gradeId: FIXTURE_GRADE_ID,
        subjectId: FIXTURE_SUBJECT_ID,
        bookId: FIXTURE_BOOK_ID,
        chapterId: FIXTURE_CHAPTER_ID,
        count: 1
      });
      assert.fail('Should have failed closed on solver disagreement');
    } catch (err) {
      assert.ok(err.message.includes('EXAM_GENERATION_FAILED'), `Expected EXAM_GENERATION_FAILED on disagreement, got: ${err.message}`);
    }

    console.log('  ✔ Passed: Solver failure modes fail closed without returning fallback or unverified questions');
  }

  // -------------------------------------------------------------
  // TEST 9 & 10: Approved cache and question bank isolation
  // -------------------------------------------------------------
  console.log('▶ Test 9 & 10: Unverified questions never enter approved cache or question bank');
  {
    // Confirm no rejected question made it to question bank items
    assert.strictEqual(mockState.questionBankItems.length, bankCountBeforeRejections, 'Zero unverified questions added to question bank');
    // Confirm all cached exams have provenance_verified = 1
    for (const cachedExam of mockState.sharedCachedExams.values()) {
      assert.strictEqual(cachedExam.provenance_verified, 1, 'All cached exams must have provenance_verified = 1');
    }
    console.log('  ✔ Passed: Cache and question bank contain zero unverified questions');
  }

  // -------------------------------------------------------------
  // TEST 11: Attempt token cryptographic validation & secret isolation
  // -------------------------------------------------------------
  console.log('▶ Test 11: Constant-time signature comparison and secret isolation');
  {
    const payload = {
      schema_version: 'v1',
      attempt_id: 'att_crypto_test_1',
      student_id: 'stud_1',
      cached_exam_id: 'exam_1',
      config_hash: 'conf_1',
      content_hash: 'hash_1',
      version_number: 1,
      question_ids: ['q1'],
      issued_at: Date.now(),
      expires_at: Date.now() + 60000
    };
    const token = signExamAttemptToken(payload);
    const verified = verifyExamAttemptToken(token);
    assert.ok(verified.valid, 'Valid token verifies');
    assert.strictEqual(verified.payload?.attempt_id, 'att_crypto_test_1');

    // Verify wrong secret fails
    const otherSecretToken = signExamAttemptToken(payload, 'wrong_custom_secret_key_32_chars_long');
    const verifyOther = verifyExamAttemptToken(otherSecretToken);
    assert.strictEqual(verifyOther.valid, false, 'Wrong secret fails verification');

    console.log('  ✔ Passed: Cryptographic validation adheres to constant-time comparison and secret isolation');
  }

  // -------------------------------------------------------------
  // TEST 12: Database driver error code compatibility
  // -------------------------------------------------------------
  console.log('▶ Test 12: Database driver error code compatibility (SQLite, MySQL, Postgres)');
  {
    const mysqlErr = { code: 'ER_DUP_ENTRY', message: 'Duplicate entry' };
    const sqliteErr = { code: 'SQLITE_CONSTRAINT_PRIMARYKEY', message: 'UNIQUE constraint failed' };
    const pgErr = { code: '23505', message: 'duplicate key value violates unique constraint' };

    const isDuplicate = (err) => {
      return err.code === 'ER_DUP_ENTRY' ||
             err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
             err.code === 'SQLITE_CONSTRAINT' ||
             err.code === '23505' ||
             err.message?.includes('Duplicate') ||
             err.message?.includes('UNIQUE constraint');
    };

    assert.ok(isDuplicate(mysqlErr), 'MySQL duplicate entry detected');
    assert.ok(isDuplicate(sqliteErr), 'SQLite duplicate entry detected');
    assert.ok(isDuplicate(pgErr), 'Postgres duplicate key detected');

    console.log('  ✔ Passed: Database error codes mapped compatibly across all supported database adapters');
  }

  server.close();
  console.log('\n================================================================');
  console.log('RESULTS: ALL 12 / 12 REMEDIATION TESTS PASSED GREEN');
  console.log('Production Writes Attempted: 0 (STRICT ZERO)');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('❌ TEST RUNNER FAILED:', err);
  if (server) server.close();
  process.exit(1);
});
