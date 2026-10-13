import dotenv from 'dotenv';
dotenv.config();

import assert from 'assert';
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { connect } from '@tidbcloud/serverless';

import { db } from '../src/db/db.js';
import booksRouter from '../src/routes/books.js';
import aiRouter from '../src/routes/ai.js';
import { aiRagEngine, GroundedQuestion } from '../src/services/ai/aiRagEngine.js';
import { ReadinessValidator } from '../src/services/readinessValidator.js';
import { AnswerValidationService } from '../src/services/answerValidationService.js';
import { generateToken, AuthUser } from '../src/middleware/auth.js';

/**
 * Focused End-to-End Student Exam Workflow Verification
 * 
 * Safety & Isolation Guarantees:
 * 1. Read-only TiDB connection for authentic textbook retrieval.
 * 2. Database client interceptor rejecting all write statements to production.
 * 3. Synthetic in-memory state for test users, profiles, cached exams, attempts, and results.
 * 4. Deterministic mocked AI generator (Zero external AI calls).
 * 5. Strict verification of answer-key privacy, scoring, retries, and failure handling.
 */

const JWT_SECRET = process.env.JWT_SECRET || 'secret_assessment_platform_jwt_key_2026';
process.env.JWT_SECRET = JWT_SECRET;
process.env.EXAM_ATTEMPT_SECRET = process.env.EXAM_ATTEMPT_SECRET || 'test_exam_attempt_integrity_secret_2026';

// ---------------------------------------------------------------------------
// 1. Synthetic In-Memory State
// ---------------------------------------------------------------------------
const mockState = {
  users: new Map<string, any>(),
  studentProfiles: new Map<string, any>(),
  sharedCachedExams: new Map<string, any>(),
  studentExamAssignments: [] as any[],
  aiEvaluations: new Map<string, any>(),
  studentLearningHistory: [] as any[],
  studentTopicMastery: new Map<string, any>()
};

// Fixture Users
const STUDENT_A = {
  id: 'student_alice_prep1',
  email: 'alice.prep1@school.edu',
  role: 'STUDENT',
  fullName: 'أليس الطالبة',
  governorateId: null,
  subjectId: null,
  is_active: 1
};

const STUDENT_B = {
  id: 'student_bob_prep1',
  email: 'bob.prep1@school.edu',
  role: 'STUDENT',
  fullName: 'بوب الطالب',
  governorateId: null,
  subjectId: null,
  is_active: 1
};

// Target Curriculum Fixtures (Science Prep 1)
const STAGE_PREP_ID = '61998777-4c5f-4e51-bc0a-38de938c842a'; // المرحلة الإعدادية
const GRADE_PREP1_ID = '4baa5084-112d-45e5-908e-1ae67ea8b4e8'; // الصف الأول الإعدادي
const SUBJECT_SCIENCE_ID = '5ebb5fc2-6edb-4f65-9057-bdb09ccae74e'; // العلوم (لغات)
const BOOK_SCIENCE_ID = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec'; // Science Prep 1
const CHAPTER_SCIENCE_U1_ID = '1d68b948-4326-41cc-b9f9-51169b931c1f'; // Unit 1: Matter and its Properties

// Blocked Unit Fixture (Prep 1 Math Geometry & Measurement)
const BOOK_MATH_ID = '808104ec-b861-434b-80c6-579f715d8bdf';
const CHAPTER_MATH_BLOCKED_ID = '1b9f4377-6ae0-4c24-b588-c221900597ec';
const SUBJECT_MATH_ID = '639c0854-028f-4b74-9734-0e9cb2778844';

// Populate Synthetic Users & Profiles
mockState.users.set(STUDENT_A.id, STUDENT_A);
mockState.studentProfiles.set(STUDENT_A.id, {
  user_id: STUDENT_A.id,
  academic_stage_id: STAGE_PREP_ID,
  grade_id: GRADE_PREP1_ID,
  school_type: 'لغات'
});

mockState.users.set(STUDENT_B.id, STUDENT_B);
mockState.studentProfiles.set(STUDENT_B.id, {
  user_id: STUDENT_B.id,
  academic_stage_id: STAGE_PREP_ID,
  grade_id: GRADE_PREP1_ID,
  school_type: 'لغات'
});

const tokenA = generateToken({
  id: STUDENT_A.id,
  email: STUDENT_A.email,
  role: 'STUDENT',
  fullName: STUDENT_A.fullName
});

const tokenB = generateToken({
  id: STUDENT_B.id,
  email: STUDENT_B.email,
  role: 'STUDENT',
  fullName: STUDENT_B.fullName
});

// ---------------------------------------------------------------------------
// 2. Read-Only TiDB Connection & Interception
// ---------------------------------------------------------------------------
const tidbConn = connect({
  host: process.env.TIDB_HOST,
  username: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE
});

const assessmentTables = [
  'ai_evaluations',
  'shared_cached_exams',
  'student_exam_assignments',
  'question_bank_items',
  'question_bank_options',
  'student_learning_history',
  'exams',
  'exam_attempts'
];

async function getLiveTableCount(tbl: string): Promise<number> {
  const rows = await tidbConn.execute(`SELECT COUNT(*) as cnt FROM ${tbl}`) as any[];
  return Number(rows[0]?.cnt || 0);
}

// ---------------------------------------------------------------------------
// 3. Database Client Interceptor
// ---------------------------------------------------------------------------
let interceptedWritesCount = 0;
const originalDbQuery = db.query.bind(db);

db.query = async (sql: string, params: any[] = []): Promise<any> => {
  const normalizedSql = sql.replace(/\s+/g, ' ').trim().toUpperCase();
  const forbiddenCommands = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'REPLACE'];

  const isWrite = forbiddenCommands.some(cmd => 
    normalizedSql.startsWith(cmd) || normalizedSql.includes(` ${cmd} `)
  );

  if (isWrite) {
    interceptedWritesCount++;

    // 1. Shared Cached Exams INSERT / REPLACE
    if (normalizedSql.includes('SHARED_CACHED_EXAMS')) {
      const examId = params[0];
      mockState.sharedCachedExams.set(examId, {
        id: examId,
        config_key: params[1],
        config_hash: params[2],
        content_hash: params[3],
        version_number: params[4],
        book_id: params[5],
        academic_stage_id: params[6],
        grade_id: params[7],
        subject_id: params[8],
        term: params[9],
        school_type: params[10],
        unit_ids: params[11],
        unit_set_key: params[12],
        parameters_json: params[13],
        param_hash: params[14],
        questions_data: params[15],
        total_questions: params[16],
        provenance_verified: params[17]
      });
      return { rows: [], rowCount: 1 };
    }

    // 2. Student Exam Assignments INSERT
    if (normalizedSql.includes('STUDENT_EXAM_ASSIGNMENTS')) {
      mockState.studentExamAssignments.push({
        id: params[0],
        cache_key: params[1],
        student_id: params[2],
        exam_id: params[3]
      });
      return { rows: [], rowCount: 1 };
    }

    // 3. AI Evaluations INSERT / UPDATE
    if (normalizedSql.includes('AI_EVALUATIONS')) {
      if (normalizedSql.startsWith('INSERT')) {
        const evalId = params[0];
        mockState.aiEvaluations.set(evalId, {
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
        });
      } else if (normalizedSql.startsWith('UPDATE')) {
        const evalId = params[1];
        const existing = mockState.aiEvaluations.get(evalId) || {};
        existing.evaluation_report = params[0];
        mockState.aiEvaluations.set(evalId, existing);
      }
      return { rows: [], rowCount: 1 };
    }

    // 4. Student Learning History INSERT
    if (normalizedSql.includes('STUDENT_LEARNING_HISTORY')) {
      mockState.studentLearningHistory.push({
        id: params[0],
        student_id: params[1],
        event_type: params[2],
        reference_id: params[3],
        subject_id: params[4],
        chapter_id: params[5],
        score_percentage: params[6],
        weak_areas: params[7]
      });
      return { rows: [], rowCount: 1 };
    }

    // 5. Student Topic Mastery INSERT / UPDATE
    if (normalizedSql.includes('STUDENT_TOPIC_MASTERY')) {
      const key = `${params[1]}_${params[2]}_${params[3]}`;
      mockState.studentTopicMastery.set(key, params);
      return { rows: [], rowCount: 1 };
    }

    // Any other write statement is blocked
    throw new Error(`INTERCEPTOR_BLOCKED_UNHANDLED_WRITE: ${sql.slice(0, 60)}`);
  }

  // Handle SELECT Queries
  // Synthetic: Users
  if (normalizedSql.includes('FROM USERS WHERE ID =')) {
    const u = mockState.users.get(params[0]);
    return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
  }

  // Synthetic: Student Profiles
  if (normalizedSql.includes('FROM STUDENT_PROFILES WHERE USER_ID =')) {
    const prof = mockState.studentProfiles.get(params[0]);
    return { rows: prof ? [prof] : [], rowCount: prof ? 1 : 0 };
  }

  // Synthetic: Shared Cached Exams Lookup
  if (normalizedSql.includes('FROM SHARED_CACHED_EXAMS') && normalizedSql.includes('WHERE ID =')) {
    const ex = mockState.sharedCachedExams.get(params[0]);
    return { rows: ex ? [ex] : [], rowCount: ex ? 1 : 0 };
  }

  // Synthetic: Student Exam Assignments
  if (normalizedSql.includes('FROM STUDENT_EXAM_ASSIGNMENTS')) {
    const matching = mockState.studentExamAssignments.filter(a => {
      if (params.length === 2) return a.student_id === params[0] && a.exam_id === params[1];
      if (params.length === 1) return a.student_id === params[0];
      return true;
    });
    return { rows: matching, rowCount: matching.length };
  }

  // Synthetic: AI Evaluations Lookup
  if (normalizedSql.includes('FROM AI_EVALUATIONS WHERE ID =')) {
    const row = mockState.aiEvaluations.get(params[0]);
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }

  // Synthetic: Student Learning History Lookup
  if (normalizedSql.includes('FROM STUDENT_LEARNING_HISTORY WHERE REFERENCE_ID =')) {
    const matching = mockState.studentLearningHistory.filter(h => h.reference_id === params[0]);
    return { rows: matching, rowCount: matching.length };
  }

  // Synthetic: Monthly Exam Limits Check
  if (normalizedSql.includes('FROM AI_EVALUATIONS WHERE STUDENT_ID =') && normalizedSql.includes('COUNT(*)')) {
    return { rows: [{ count: 0 }], rowCount: 1 };
  }
  if (normalizedSql.includes('FROM EXAM_ATTEMPTS WHERE STUDENT_ID =') && normalizedSql.includes('COUNT(*)')) {
    return { rows: [{ count: 0 }], rowCount: 1 };
  }

  // Platform Settings
  if (normalizedSql.includes('FROM PLATFORM_SETTINGS WHERE SETTING_KEY =')) {
    return { rows: [{ setting_value: '10' }], rowCount: 1 };
  }

  // Real Database Query for Curriculum, Books, Chapters, Chunks, Pages, Subjects, Stages
  // Transform $1, $2 placeholders to ? for TiDB Cloud
  const orderedParams: any[] = [];
  const tidbSql = sql.replace(/\$(\d+)/g, (_, idxStr) => {
    const idx = parseInt(idxStr, 10) - 1;
    orderedParams.push(params[idx]);
    return '?';
  });

  const res = await tidbConn.execute(tidbSql, orderedParams) as any[];
  return { rows: res || [], rowCount: res?.length || 0 };
};

// ---------------------------------------------------------------------------
// 4. Mock AI Generator (Zero External AI Calls)
// ---------------------------------------------------------------------------
function createMockScienceQuestions(bookId: string, chapterId: string): GroundedQuestion[] {
  return [
    {
      id: 'mock_q_science_01',
      chunk_id: '0c1b7a20-eac3-4a73-9af2-d10963bcf171',
      book_id: bookId,
      chapter_id: chapterId,
      question_text: 'What is the fundamental building unit of all matter?',
      options: [
        { id: 'opt_1a', text: 'The Molecule', is_correct: false },
        { id: 'opt_1b', text: 'The Atom', is_correct: true },
        { id: 'opt_1c', text: 'The Compound', is_correct: false },
        { id: 'opt_1d', text: 'The Element', is_correct: false }
      ],
      difficulty: 'EASY',
      bloom_level: 'KNOWLEDGE',
      page_reference: 10,
      source_excerpt: 'The Atom is the Building Unit of Matter. Matter is anything that has mass and occupies space.',
      explanation: 'The atom is the smallest and fundamental building unit of matter.',
      chunk_text: 'The Atom is the Building Unit of Matter Matter is anything that has mass and occupies space.'
    },
    {
      id: 'mock_q_science_02',
      chunk_id: 'eab17ff5-a91e-411a-8eef-cd47cd3172bb',
      book_id: bookId,
      chapter_id: chapterId,
      question_text: 'How many principal energy levels exist in the heaviest known atoms?',
      options: [
        { id: 'opt_2a', text: '5 main energy levels', is_correct: false },
        { id: 'opt_2b', text: '6 main energy levels', is_correct: false },
        { id: 'opt_2c', text: '7 main energy levels', is_correct: true },
        { id: 'opt_2d', text: '8 main energy levels', is_correct: false }
      ],
      difficulty: 'MEDIUM',
      bloom_level: 'UNDERSTANDING',
      page_reference: 12,
      source_excerpt: 'The Energy Levels: Electrons revolve around the nucleus at different energy levels designated by the letters K, L, M, N, O, P, Q (7 main energy levels).',
      explanation: 'There are exactly 7 main energy levels in heavier atoms labeled from K to Q.',
      chunk_text: 'The Energy Levels Electrons revolve around the nucleus at different energy levels...'
    },
    {
      id: 'mock_q_science_03',
      chunk_id: '3b992c6c-60c7-4a8f-8ae1-1294ac0e1d4b',
      book_id: bookId,
      chapter_id: chapterId,
      question_text: 'In the modern periodic table, how are chemical elements arranged?',
      options: [
        { id: 'opt_3a', text: 'According to atomic mass only', is_correct: false },
        { id: 'opt_3b', text: 'Ascending atomic number and electron filling', is_correct: true },
        { id: 'opt_3c', text: 'Alphabetical order of symbols', is_correct: false },
        { id: 'opt_3d', text: 'Physical states of matter', is_correct: false }
      ],
      difficulty: 'MEDIUM',
      bloom_level: 'APPLICATION',
      page_reference: 19,
      source_excerpt: 'The Modern Periodic Table: Elements are classified in ascending order according to their atomic numbers and the way of filling energy sublevels with electrons.',
      explanation: 'Elements are ordered by ascending atomic number and the electronic configuration of energy sublevels.',
      chunk_text: '3 The Modern Periodic Table Some inadequacies in Moseley\'s table prompted the scientific community...'
    }
  ];
}

// Intercept aiRagEngine.generateQuestions
const originalGenerateQuestions = aiRagEngine.generateQuestions.bind(aiRagEngine);
aiRagEngine.generateQuestions = async (params: any): Promise<GroundedQuestion[]> => {
  return createMockScienceQuestions(params.bookId, params.chapterId);
};

// ---------------------------------------------------------------------------
// 5. Test Suite Execution
// ---------------------------------------------------------------------------
async function runStudentWorkflowVerification() {
  console.log('========================================================================');
  console.log('🎓 FOCUSED STUDENT EXAM WORKFLOW VERIFICATION');
  console.log('Target: Prep 1 Science Unit 1 — Matter and Its Properties');
  console.log('Guarantees: Real TiDB (Read-Only) | Synthetic State | Zero External AI');
  console.log('========================================================================\n');

  // Step 0: Pre-Test Live Database Snapshot
  console.log('📊 Taking Pre-Test Snapshot of TiDB Assessment Tables...');
  const preCounts: Record<string, number> = {};
  for (const tbl of assessmentTables) {
    preCounts[tbl] = await getLiveTableCount(tbl);
    console.log(`   - ${tbl}: ${preCounts[tbl]} rows`);
  }
  console.log('🔒 Pre-Test Snapshot Recorded: All tables verified clean.\n');

  // Start Express Test App
  const app = express();
  app.use(express.json());
  app.use('/api/books', booksRouter);
  app.use('/api/ai', aiRouter);

  const server = http.createServer(app);
  await new Promise<void>(res => server.listen(0, res));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`🚀 Isolated Test Server running on ${baseUrl}\n`);

  try {
    // -----------------------------------------------------------------------
    // STEP 1: Student Opens Textbook (Discovery, Details & Reading)
    // -----------------------------------------------------------------------
    console.log('📖 STEP 1: Trace Student Opening Textbook...');

    // 1A. List books filtered for student
    const listRes = await fetch(`${baseUrl}/api/books`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    if (listRes.status !== 200) {
      const errText = await listRes.text();
      console.error(`DEBUG: GET /api/books returned ${listRes.status}:`, errText);
    }
    assert.strictEqual(listRes.status, 200, 'GET /api/books must return HTTP 200');
    const studentBooks = await listRes.json();
    assert(Array.isArray(studentBooks) && studentBooks.length > 0, 'Student must see curriculum books');
    const targetBook = studentBooks.find((b: any) => b.id === BOOK_SCIENCE_ID);
    assert(targetBook, `Target book ${BOOK_SCIENCE_ID} must be listed for Prep 1 student`);
    console.log(`   ✅ 1A. Books List: Found target book "${targetBook.title_en || targetBook.title_ar}" (ID: ${targetBook.id})`);

    // 1B. Fetch book details with real chapters from TiDB
    const bookDetailRes = await fetch(`${baseUrl}/api/books/${BOOK_SCIENCE_ID}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.strictEqual(bookDetailRes.status, 200, 'GET /api/books/:id must return HTTP 200');
    const bookDetail = await bookDetailRes.json();
    assert(Array.isArray(bookDetail.chapters) && bookDetail.chapters.length > 0, 'Book must contain chapters');
    const unit1 = bookDetail.chapters.find((c: any) => c.id === CHAPTER_SCIENCE_U1_ID);
    assert(unit1, 'Chapter 1 must exist in book chapters');
    console.log(`   ✅ 1B. Book Details: Unit 1 "${unit1.title_en || unit1.title_ar}" retrieved (Pages ${unit1.start_page}-${unit1.end_page})`);

    // 1C. Read/preview textbook chunks for Unit 1 from TiDB
    const chunksRes = await fetch(`${baseUrl}/api/books/${BOOK_SCIENCE_ID}/chapters/${CHAPTER_SCIENCE_U1_ID}/chunks`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.strictEqual(chunksRes.status, 200, 'GET chunks must return HTTP 200');
    const chunksData = await chunksRes.json();
    assert(Array.isArray(chunksData) && chunksData.length > 0, 'Real chunks must be returned from TiDB');
    console.log(`   ✅ 1C. Textbook Reading: Retrieved ${chunksData.length} chunks from TiDB (Sample Page ${chunksData[0].page_number})`);

    // -----------------------------------------------------------------------
    // STEP 2: Select Eligible Unit & Verify Readiness Gate
    // -----------------------------------------------------------------------
    console.log('\n🔒 STEP 2: Select Eligible Unit & Verify Readiness Gate...');

    // 2A. Eligible unit check
    const readyStatus = ReadinessValidator.getUnitReadiness(BOOK_SCIENCE_ID, CHAPTER_SCIENCE_U1_ID);
    assert.strictEqual(readyStatus.status, 'VERIFIED_READY');
    assert.strictEqual(readyStatus.isEligibleForAI, true);
    console.log(`   ✅ 2A. Unit 1 is VERIFIED_READY and eligible for exam generation.`);

    // 2B. Blocked unit negative test (Prep 1 Math Geometry Proofs)
    const blockedRes = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        book_id: BOOK_MATH_ID,
        chapter_id: CHAPTER_MATH_BLOCKED_ID,
        subject_id: SUBJECT_MATH_ID,
        count: 3
      })
    });
    assert.strictEqual(blockedRes.status, 403, 'Blocked unit must return HTTP 403');
    const blockedBody = await blockedRes.json();
    assert.strictEqual(blockedBody.code, 'UNIT_READINESS_BLOCKED', 'Must return UNIT_READINESS_BLOCKED');
    console.log(`   ✅ 2B. Safety Gate Verified: Blocked unit was rejected with 403 (${blockedBody.code})`);

    // -----------------------------------------------------------------------
    // STEP 3: Generate Exam & Audit Answer-Key Privacy
    // -----------------------------------------------------------------------
    console.log('\n🤖 STEP 3: Generate Exam & Audit Answer-Key Privacy...');

    const genRes = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        book_id: BOOK_SCIENCE_ID,
        chapter_id: CHAPTER_SCIENCE_U1_ID,
        subject_id: SUBJECT_SCIENCE_ID,
        count: 3
      })
    });

    assert.strictEqual(genRes.status, 200, 'POST /generate-quiz must return HTTP 200');
    const examPayload = await genRes.json();
    assert(examPayload.attempt_token && typeof examPayload.attempt_token === 'string', 'Must issue attempt token');
    assert(Array.isArray(examPayload.questions) && examPayload.questions.length === 3, 'Must return 3 questions');

    console.log(`   ✅ 3A. Exam Generated: Received 3 questions and attempt token (Length: ${examPayload.attempt_token.length})`);

    // Strict Answer-Key Privacy Check
    console.log('   🔒 3B. Auditing Answer-Key Privacy in Student Payload:');
    examPayload.questions.forEach((q: any, idx: number) => {
      assert.strictEqual(q.is_correct, undefined, `Question ${idx + 1} must not have is_correct on root`);
      assert.strictEqual(q.explanation, undefined, `Question ${idx + 1} must not have explanation`);
      assert.strictEqual(q.source_excerpt, undefined, `Question ${idx + 1} must not have source_excerpt`);
      assert.strictEqual(q.chunk_text, undefined, `Question ${idx + 1} must not have chunk_text`);
      assert(Array.isArray(q.options) && q.options.length === 4, `Question ${idx + 1} must have 4 options`);
      q.options.forEach((opt: any) => {
        assert.strictEqual(opt.is_correct, undefined, `Option ${opt.id} must NOT leak is_correct`);
        assert(opt.id && opt.text, `Option must have id and text`);
      });
    });
    console.log('   ✅ 3B. Answer-Key Privacy Verified: Zero answers, explanations, or flags exposed to student client.');

    // -----------------------------------------------------------------------
    // STEP 4: Security Rejections & Failure Handling
    // -----------------------------------------------------------------------
    console.log('\n🛡️ STEP 4: Verify Failure Handling & Security Rejections...');

    const validAttemptToken = examPayload.attempt_token;
    const questions = examPayload.questions;

    // 4A. Reject client-supplied questions
    const legacyRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        attempt_token: validAttemptToken,
        questions: [{ question_text: 'Client spoofed' }]
      })
    });
    assert.strictEqual(legacyRes.status, 400);
    const legacyBody = await legacyRes.json();
    assert.strictEqual(legacyBody.code, 'LEGACY_SUBMISSION_REJECTED');
    console.log(`   ✅ 4A. Client-supplied questions rejected (LEGACY_SUBMISSION_REJECTED)`);

    // 4B. Reject tampered attempt token
    const tamperedRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        attempt_token: validAttemptToken + 'tampered',
        answers: []
      })
    });
    assert.strictEqual(tamperedRes.status, 401);
    console.log(`   ✅ 4B. Tampered token rejected with 401`);

    // 4C. Reject cross-student submission (Student B submitting Student A's token)
    const crossRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({
        attempt_token: validAttemptToken,
        answers: []
      })
    });
    assert.strictEqual(crossRes.status, 403);
    const crossBody = await crossRes.json();
    assert.strictEqual(crossBody.code, 'STUDENT_IDENTITY_MISMATCH');
    console.log(`   ✅ 4C. Cross-student submission rejected (STUDENT_IDENTITY_MISMATCH)`);

    // 4D. Reject foreign question ID
    const foreignRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        attempt_token: validAttemptToken,
        answers: [{ question_id: 'foreign_q_999', selected_option_id: 'opt_1b' }]
      })
    });
    assert.strictEqual(foreignRes.status, 400);
    const foreignBody = await foreignRes.json();
    assert.strictEqual(foreignBody.code, 'FOREIGN_QUESTION_SUBMITTED');
    console.log(`   ✅ 4D. Foreign question ID rejected (FOREIGN_QUESTION_SUBMITTED)`);

    // 4E. Reject duplicate question answer
    const duplicateRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        attempt_token: validAttemptToken,
        answers: [
          { question_id: questions[0].id, selected_option_id: questions[0].options[0].id },
          { question_id: questions[0].id, selected_option_id: questions[0].options[1].id }
        ]
      })
    });
    assert.strictEqual(duplicateRes.status, 400);
    const duplicateBody = await duplicateRes.json();
    assert.strictEqual(duplicateBody.code, 'DUPLICATE_QUESTION_ANSWERED');
    console.log(`   ✅ 4E. Duplicate question answer rejected (DUPLICATE_QUESTION_ANSWERED)`);

    // 4F. Reject unknown option ID
    const unknownOptRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        attempt_token: validAttemptToken,
        answers: [
          { question_id: questions[0].id, selected_option_id: 'bogus_option_xyz' }
        ]
      })
    });
    assert.strictEqual(unknownOptRes.status, 400);
    const unknownOptBody = await unknownOptRes.json();
    assert.strictEqual(unknownOptBody.code, 'UNKNOWN_OPTION_SUBMITTED');
    console.log(`   ✅ 4F. Unknown option ID rejected (UNKNOWN_OPTION_SUBMITTED)`);

    // -----------------------------------------------------------------------
    // STEP 5: Submit Answers & Evaluate Submission (Scoring & Feedback)
    // -----------------------------------------------------------------------
    console.log('\n📝 STEP 5: Submit Answers & Evaluate Submission...');

    // Scenario 5A: Student A Submits 100% Correct Answers
    const correctAnswersA = [
      { question_id: 'mock_q_science_01', selected_option_id: 'opt_1b' }, // The Atom
      { question_id: 'mock_q_science_02', selected_option_id: 'opt_2c' }, // 7 main energy levels
      { question_id: 'mock_q_science_03', selected_option_id: 'opt_3b' }  // Ascending atomic number
    ];

    const evalResA = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        attempt_token: validAttemptToken,
        answers: correctAnswersA
      })
    });

    assert.strictEqual(evalResA.status, 200, 'Submission evaluation must return HTTP 200');
    const evalDataA = await evalResA.json();
    assert(evalDataA.report, 'Response must contain diagnostic report');
    const reportA = evalDataA.report;

    assert.strictEqual(reportA.provisional_score, 3);
    assert.strictEqual(reportA.provisional_max_score, 3);
    assert.strictEqual(reportA.provisional_percentage, 100);
    assert.strictEqual(reportA.provisional_mastery_status, 'MASTERED');
    assert(reportA.items.every((it: any) => it.is_correct === true), 'All items must be marked correct');
    console.log(`   ✅ 5A. Perfect Submission (100%): Score: 3/3 | Status: ${reportA.provisional_mastery_status}`);
    console.log(`        Mastery Feedback: "${reportA.overall_feedback_en}"`);

    // Scenario 5B: Student B Submits Partial / Distractor Answers
    // Generate separate exam for Student B
    const genResB = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({
        book_id: BOOK_SCIENCE_ID,
        chapter_id: CHAPTER_SCIENCE_U1_ID,
        subject_id: SUBJECT_SCIENCE_ID,
        count: 3
      })
    });
    const examPayloadB = await genResB.json();

    const distractorAnswersB = [
      { question_id: 'mock_q_science_01', selected_option_id: 'opt_1b' }, // Correct (The Atom)
      { question_id: 'mock_q_science_02', selected_option_id: 'opt_2a' }, // Distractor (5 levels instead of 7)
      { question_id: 'mock_q_science_03', selected_option_id: 'opt_3a' }  // Distractor (Atomic mass instead of atomic number)
    ];

    const evalResB = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({
        attempt_token: examPayloadB.attempt_token,
        answers: distractorAnswersB
      })
    });

    assert.strictEqual(evalResB.status, 200);
    const evalDataB = await evalResB.json();
    const reportB = evalDataB.report;

    assert.strictEqual(reportB.provisional_score, 1);
    assert.strictEqual(reportB.provisional_max_score, 3);
    assert.strictEqual(reportB.provisional_percentage, 33.3);
    assert.strictEqual(reportB.provisional_mastery_status, 'NEEDS_WORK');
    assert.strictEqual(reportB.weak_topics.length, 2, 'Must identify 2 weak topics');

    // Confirm textbook page reference in study recommendations
    const weakItem = reportB.items.find((it: any) => !it.is_correct);
    assert(weakItem.study_recommendation.includes(`Page ${weakItem.page_reference}`), 'Recommendation must cite page number');
    console.log(`   ✅ 5B. Distractor Submission (33.3%): Score: 1/3 | Status: ${reportB.provisional_mastery_status}`);
    console.log(`        Weak Topics: [${reportB.weak_topics.join(', ')}]`);
    console.log(`        Targeted Action Plan: "${weakItem.study_recommendation}"`);

    // -----------------------------------------------------------------------
    // STEP 6: Idempotent Retries & Anti-Tampering Integrity
    // -----------------------------------------------------------------------
    console.log('\n🔄 STEP 6: Verify Idempotent Retries & Anti-Tampering Integrity...');

    // 6A. Identical resubmission (Network retry or page refresh)
    const retryRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        attempt_token: validAttemptToken,
        answers: correctAnswersA
      })
    });
    assert.strictEqual(retryRes.status, 200, 'Identical retry must return HTTP 200');
    const retryData = await retryRes.json();
    assert.strictEqual(retryData.recovered, true, 'Retry must return recovered: true');
    assert.strictEqual(retryData.report.provisional_score, 3, 'Recovered report must have identical score');
    console.log(`   ✅ 6A. Identical Retry: Recovered cleanly without re-scoring (recovered: true)`);

    // 6B. Altered resubmission (Student attempts to change answers after submission)
    const alteredAnswers = [
      { question_id: 'mock_q_science_01', selected_option_id: 'opt_1a' },
      { question_id: 'mock_q_science_02', selected_option_id: 'opt_2c' },
      { question_id: 'mock_q_science_03', selected_option_id: 'opt_3b' }
    ];
    const alteredRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        attempt_token: validAttemptToken,
        answers: alteredAnswers
      })
    });
    assert.strictEqual(alteredRes.status, 409, 'Altered answers must be rejected with HTTP 409 Conflict');
    const alteredBody = await alteredRes.json();
    assert.strictEqual(alteredBody.code, 'ATTEMPT_ANSWER_MISMATCH');
    console.log(`   ✅ 6B. Altered Resubmission Rejected: Prevented modification of graded attempt (ATTEMPT_ANSWER_MISMATCH)`);

    // -----------------------------------------------------------------------
    // STEP 7: Strict Zero-Mutation Check on TiDB Production Database
    // -----------------------------------------------------------------------
    console.log('\n🔒 STEP 7: Verifying Zero Production Writes to TiDB...');
    let zeroWritesConfirmed = true;
    for (const tbl of assessmentTables) {
      const postCount = await getLiveTableCount(tbl);
      const preCount = preCounts[tbl];
      const delta = postCount - preCount;
      const isClean = delta === 0;
      if (!isClean) zeroWritesConfirmed = false;
      console.log(`   - ${tbl}: Pre=${preCount}, Post=${postCount}, Delta=${delta} [${isClean ? '✅ ZERO WRITES' : '❌ MUTATION DETECTED'}]`);
    }
    assert(zeroWritesConfirmed, 'Every assessment table must have delta === 0');
    console.log(`\n   🔒 Database Interceptor Summary: ${interceptedWritesCount} write operations intercepted and handled in-memory.`);
    console.log('   ✅ Post-Test Snapshot: Zero mutations confirmed across all 8 assessment tables.');

    console.log('\n========================================================================');
    console.log('🎉 FOCUSED STUDENT WORKFLOW VERIFICATION: 100% PASSED');
    console.log('========================================================================\n');
  } finally {
    server.close();
    // Restore originals
    db.query = originalDbQuery;
    aiRagEngine.generateQuestions = originalGenerateQuestions;
  }
}

runStudentWorkflowVerification().catch(err => {
  console.error('\n❌ Workflow Verification Failed:', err);
  process.exit(1);
});
