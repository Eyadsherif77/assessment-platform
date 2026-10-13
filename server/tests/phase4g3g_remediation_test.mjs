import assert from 'assert';
import http from 'http';
import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from '../dist/db/db.js';
import aiRouter from '../dist/routes/ai.js';
import examRouter from '../dist/routes/exams.js';
import { aiRagEngine, AIRagEngine } from '../dist/services/ai/aiRagEngine.js';
import { ExamCacheService } from '../dist/services/examCacheService.js';
import {
  AnswerValidationService,
  signExamAttemptToken,
  verifyExamAttemptToken
} from '../dist/services/answerValidationService.js';

console.log('================================================================');
console.log('PHASE 4G.3G — FINAL PRE-TRIAL REMEDIATION & SCOPE TEST SUITE');
console.log('Zero Database Mutations | Zero External AI Calls | Strictly Isolated');
console.log('================================================================\n');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret_assessment_platform_jwt_key_2026';
process.env.EXAM_ATTEMPT_SECRET = process.env.EXAM_ATTEMPT_SECRET || 'test_exam_attempt_integrity_secret_2026';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'mock-key-for-phase4g3g';
const JWT_SECRET = process.env.JWT_SECRET;

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
  questionBanks: new Map(),
  questionBankItems: [],
  exams: new Map(),
  examQuestions: new Map(),
  examOptions: new Map(),
  simulateDupEntryOnInsert: false
};

// Fixture Constants
const FIXTURE_STUDENT_A_ID = 'student_alice_777';
const FIXTURE_STUDENT_B_ID = 'student_bob_888';
const FIXTURE_TEACHER_ID = 'teacher_sarah_999';
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

// Populate Teacher
mockState.users.set(FIXTURE_TEACHER_ID, {
  id: FIXTURE_TEACHER_ID,
  email: 'sarah@teacher.edu',
  role: 'TEACHER',
  full_name: 'الأستاذة سارة',
  is_active: 1
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

const FIXTURE_CHUNK_ID = 'chunk_speed_def_p10';
const FIXTURE_PASSAGE = 'السرعة المنتظمة في علم الحركة: السرعة المنتظمة هي السرعة التي يقطع بها الجسم مسافات متساوية في أزمنة متساوية مهما كانت هذه المسافات صغيرة. وتقاس السرعة بوحدة متر لكل ثانية في النظام الدولي.';

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

// Fixture Teacher Exam
const FIXTURE_EXAM_ID = 'exam_teacher_test_01';
mockState.exams.set(FIXTURE_EXAM_ID, {
  id: FIXTURE_EXAM_ID,
  title_ar: 'اختبار العلوم الشهري',
  title_en: 'Science Monthly Exam',
  teacher_id: FIXTURE_TEACHER_ID,
  academic_stage_id: FIXTURE_STAGE_ID,
  grade_id: FIXTURE_GRADE_ID,
  subject_id: FIXTURE_SUBJECT_ID,
  book_id: FIXTURE_BOOK_ID,
  chapter_id: FIXTURE_CHAPTER_ID,
  duration_minutes: 30,
  is_published: 1,
  school_type: 'كلاهما',
  term: 1,
  subject_name_ar: 'العلوم',
  stage_name_ar: 'المرحلة الإعدادية',
  grade_name_ar: 'الصف الثالث الإعدادي',
  teacher_name: 'الأستاذة سارة'
});

const FIXTURE_EXAM_Q_ID = 'eq_forces_01';
mockState.examQuestions.set(FIXTURE_EXAM_Q_ID, {
  id: FIXTURE_EXAM_Q_ID,
  exam_id: FIXTURE_EXAM_ID,
  question_text: 'ما هي وحدة قياس السرعة في النظام الدولي؟',
  points: 2,
  page_reference: '10',
  explanation: 'الإجابة الصحيحة هي متر لكل ثانية لأن السرعة تساوي المسافة مقسومة على الزمن.',
  order_index: 1
});

mockState.examOptions.set(FIXTURE_EXAM_Q_ID, [
  { id: 'eo_1', question_id: FIXTURE_EXAM_Q_ID, option_text: 'متر لكل ثانية', is_correct: 1 },
  { id: 'eo_2', question_id: FIXTURE_EXAM_Q_ID, option_text: 'متر مربع', is_correct: 0 },
  { id: 'eo_3', question_id: FIXTURE_EXAM_Q_ID, option_text: 'كيلوجرام', is_correct: 0 },
  { id: 'eo_4', question_id: FIXTURE_EXAM_Q_ID, option_text: 'نيوتن', is_correct: 0 }
]);

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
        id: b.id,
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

  if (norm.includes('from book_chapters where id =')) {
    const ch = mockState.bookChapters.get(params[0]);
    return { rows: ch ? [ch] : [], rowCount: ch ? 1 : 0 };
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

  if (norm.includes('from book_chunks where id =')) {
    const chunk = mockState.bookChunks.get(params[0]);
    return { rows: chunk ? [chunk] : [], rowCount: chunk ? 1 : 0 };
  }

  if (norm.includes('from book_chunks where book_id =')) {
    const matching = Array.from(mockState.bookChunks.values()).filter(c => c.book_id === params[0]);
    return { rows: matching, rowCount: matching.length };
  }

  // Pages lookup
  if (norm.includes('from book_pages where book_id =') && norm.includes('page_number =')) {
    const p = mockState.bookPages.get(`${params[0]}_${params[1]}`);
    return { rows: p ? [p] : [], rowCount: p ? 1 : 0 };
  }

  if (norm.includes('from book_pages where book_id =')) {
    const key = `${params[0]}_${params[1]}`;
    const page = mockState.bookPages.get(key);
    return { rows: page ? [page] : [], rowCount: page ? 1 : 0 };
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

  // Shared cached exams
  if (norm.includes('from shared_cached_exams where id =')) {
    const exam = mockState.sharedCachedExams.get(params[0]);
    return { rows: exam ? [exam] : [], rowCount: exam ? 1 : 0 };
  }
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

  // Topic Mastery
  if (norm.includes('from student_topic_mastery where student_id =')) {
    const key = `${params[0]}_${params[1]}_${params[2]}`;
    const existing = mockState.topicMastery.get(key);
    return { rows: existing ? [existing] : [], rowCount: existing ? 1 : 0 };
  }
  if (norm.includes('update student_topic_mastery set')) {
    const key = `${params[0]}_${params[1]}_${params[2]}`;
    const existing = mockState.topicMastery.get(key) || { total_attempted: 0, total_correct: 0 };
    existing.total_attempted = params[3];
    existing.total_correct = params[4];
    existing.mastery_percentage = params[5];
    existing.status = params[6];
    mockState.topicMastery.set(key, existing);
    return { rows: [], rowCount: 1 };
  }
  if (norm.includes('insert into student_topic_mastery')) {
    const key = `${params[1]}_${params[2]}_${params[3]}`;
    mockState.topicMastery.set(key, {
      id: params[0],
      student_id: params[1],
      subject_id: params[2],
      chapter_id: params[3],
      total_attempted: params[4],
      total_correct: params[5],
      mastery_percentage: params[6],
      status: params[7]
    });
    return { rows: [], rowCount: 1 };
  }

  // Learning History Select
  if (norm.includes('from student_learning_history where reference_id =')) {
    const matching = mockState.studentLearningHistory.filter(h => h.reference_id === params[0]);
    return { rows: matching, rowCount: matching.length };
  }

  // Learning History Insert
  if (norm.includes('insert into student_learning_history')) {
    const isAiLiteral = norm.includes("'ai_assessment'");
    mockState.studentLearningHistory.push({
      id: params[0],
      student_id: params[1],
      type: isAiLiteral ? 'AI_ASSESSMENT' : params[2],
      reference_id: isAiLiteral ? params[2] : params[3],
      subject_id: isAiLiteral ? params[3] : params[4],
      chapter_id: isAiLiteral ? params[4] : params[5],
      score_percentage: isAiLiteral ? params[5] : params[6],
      weak_areas: isAiLiteral ? params[6] : params[7]
    });
    return { rows: [], rowCount: 1 };
  }

  // Teacher Exams
  if (norm.includes('from exams e') && norm.includes('where e.id =')) {
    const exam = mockState.exams.get(params[0]);
    return { rows: exam ? [exam] : [], rowCount: exam ? 1 : 0 };
  }

  if (norm.includes('from exam_questions where exam_id =')) {
    const qs = Array.from(mockState.examQuestions.values()).filter(q => q.exam_id === params[0]);
    return { rows: qs, rowCount: qs.length };
  }

  if (norm.includes('from exam_question_options where question_id =')) {
    const opts = mockState.examOptions.get(params[0]) || [];
    return { rows: opts, rowCount: opts.length };
  }

  // Question Banks
  if (norm.includes('from question_banks where subject_id =')) {
    const bank = mockState.questionBanks.get(`${params[0]}_${params[1]}`);
    return { rows: bank ? [bank] : [], rowCount: bank ? 1 : 0 };
  }

  if (norm.includes('insert into question_banks')) {
    mockState.questionBanks.set(`${params[1]}_${params[3]}`, { id: params[0] });
    return { rows: [], rowCount: 1 };
  }

  if (norm.includes('from question_bank_items')) {
    return { rows: mockState.questionBankItems, rowCount: mockState.questionBankItems.length };
  }

  return { rows: [], rowCount: 0 };
};

// Express App Setup
const app = express();
app.use(express.json());
app.use('/api/ai', aiRouter);
app.use('/api/exams', examRouter);

const server = http.createServer(app);
let port = 0;

import { generateToken } from '../dist/middleware/auth.js';

function createToken(userId, role = 'STUDENT') {
  return generateToken({
    id: userId,
    email: `${userId}@test.edu`,
    role,
    fullName: role === 'TEACHER' ? 'Test Teacher' : 'Test Student'
  });
}

// Bounded Blind Solver Override
AIRagEngine.setBlindSolverOverride(async (candidate) => {
  const matchingOpt = candidate.options.find(o => o.text.includes('مسافات متساوية في أزمنة متساوية')) || candidate.options[0];
  return {
    status: 'SOLVED',
    selected_option_id: matchingOpt.id,
    defensible_option_ids: [matchingOpt.id],
    entailed_evidence_quote: 'السرعة المنتظمة هي السرعة التي يقطع بها الجسم مسافات متساوية في أزمنة متساوية',
    solver_rationale: 'Definition matches option exactly',
    raw_response: '{"status":"SOLVED"}'
  };
});

// Mock Gemini Question Generator
aiRagEngine.callGeminiForQuestions = async () => {
  return [
    {
      id: 'q_forces_sci_1',
      question_text: 'ما هو تعريف السرعة المنتظمة في علم الحركة؟',
      options: [
        { id: 'opt_1', text: 'السرعة التي يقطع بها الجسم مسافات متساوية في أزمنة متساوية', is_correct: true },
        { id: 'opt_2', text: 'السرعة المتغيرة في أزمنة مختلفة', is_correct: false },
        { id: 'opt_3', text: 'سرعة الجسم عند نقطة معينة فقط', is_correct: false },
        { id: 'opt_4', text: 'متوسط سرعة الجسم في رحلة كاملة', is_correct: false }
      ],
      correct_answer: 'السرعة التي يقطع بها الجسم مسافات متساوية في أزمنة متساوية',
      explanation: 'السرعة المنتظمة هي قطع مسافات متساوية في أزمنة متساوية.',
      source_page: 10,
      page_reference: 10,
      source_chunk_id: FIXTURE_CHUNK_ID,
      chunk_id: FIXTURE_CHUNK_ID,
      chunk_text: FIXTURE_PASSAGE,
      evidence_quote: 'السرعة المنتظمة هي السرعة التي يقطع بها الجسم مسافات متساوية في أزمنة متساوية'
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
  const studentAToken = createToken(FIXTURE_STUDENT_A_ID, 'STUDENT');
  const studentBToken = createToken(FIXTURE_STUDENT_B_ID, 'STUDENT');
  const teacherToken = createToken(FIXTURE_TEACHER_ID, 'TEACHER');

  // Generate an authentic attempt for Student A
  const genRes = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
    body: JSON.stringify({
      book_id: FIXTURE_BOOK_ID,
      chapter_id: FIXTURE_CHAPTER_ID,
      subject_id: FIXTURE_SUBJECT_ID,
      count: 1
    })
  });
  assert.strictEqual(genRes.status, 200, 'Generate quiz must succeed');
  const genData = await genRes.json();
  const attemptToken = genData.attempt_token;
  const verifiedToken = verifyExamAttemptToken(attemptToken);
  assert.ok(verifiedToken.valid);
  const attemptId = verifiedToken.payload.attempt_id;
  const questionId = genData.questions[0].id;
  const chosenOptId = genData.questions[0].options[0].id;

  console.log('----------------------------------------------------------------');
  console.log('TEST 1: Safe Idempotent Lost HTTP Response Evaluation Recovery');
  console.log('----------------------------------------------------------------');
  {
    const initialHistoryCount = mockState.studentLearningHistory.length;

    // First submission
    const res1 = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        attempt_token: attemptToken,
        answers: { [questionId]: chosenOptId }
      })
    });
    assert.strictEqual(res1.status, 200, 'Initial submission must succeed 200 OK');
    const body1 = await res1.json();
    assert.ok(body1.report, 'Must return evaluation report');
    const historyCountAfter1 = mockState.studentLearningHistory.length;

    // Retry submission (Lost HTTP response recovery) with same attempt and answers
    const retryRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        attempt_token: attemptToken,
        answers: { [questionId]: chosenOptId }
      })
    });
    assert.strictEqual(retryRes.status, 200, 'Retry must return 200 OK');
    const retryBody = await retryRes.json();
    assert.strictEqual(retryBody.recovered, true, 'Response must flag recovered: true');
    assert.strictEqual(retryBody.report.evaluation_id, attemptId, 'Returned report must match attempt ID');

    // Verify analytics NOT applied twice
    assert.strictEqual(mockState.studentLearningHistory.length, historyCountAfter1, 'Learning history must not double-count on retry');

    console.log('  ✔ Passed: Lost response retry returns 200 OK with recovered report without duplicate analytics');
  }

  console.log('----------------------------------------------------------------');
  console.log('TEST 2: Attempt Answer Tampering Rejection on Retry');
  console.log('----------------------------------------------------------------');
  {
    // Try to resubmit the evaluated attempt with DIFFERENT answers
    const tamperedRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        attempt_token: attemptToken,
        answers: { [questionId]: 'opt_2' } // Altered answer
      })
    });
    assert.strictEqual(tamperedRes.status, 409, 'Modified answers on retried attempt must return 409 Conflict');
    const tamperedBody = await tamperedRes.json();
    assert.strictEqual(tamperedBody.code, 'ATTEMPT_ANSWER_MISMATCH');

    console.log('  ✔ Passed: Resubmitting evaluated attempt with altered answers rejected with 409 ATTEMPT_ANSWER_MISMATCH');
  }

  console.log('----------------------------------------------------------------');
  console.log('TEST 3: Cross-Student Attempt Retrieval Rejection');
  console.log('----------------------------------------------------------------');
  {
    // Student B attempts to submit or recover Student A's attempt token
    const crossRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentBToken}` },
      body: JSON.stringify({
        attempt_token: attemptToken,
        answers: { [questionId]: chosenOptId }
      })
    });
    assert.strictEqual(crossRes.status, 403, 'Cross-student submission must return 403 Forbidden');
    const crossBody = await crossRes.json();
    assert.strictEqual(crossBody.code, 'STUDENT_IDENTITY_MISMATCH');

    console.log('  ✔ Passed: Student B attempting to access Student A attempt rejected with 403 STUDENT_IDENTITY_MISMATCH');
  }

  console.log('----------------------------------------------------------------');
  console.log('TEST 4: Partial-Failure Recovery (Missing Learning History Recovered)');
  console.log('----------------------------------------------------------------');
  {
    // Create an un-synced attempt record in ai_evaluations (simulating crash before learning history)
    const partialAttemptId = 'att_partial_crash_recovery_1';
    const partialPayload = {
      schema_version: 'v1',
      attempt_id: partialAttemptId,
      student_id: FIXTURE_STUDENT_A_ID,
      cached_exam_id: verifiedToken.payload.cached_exam_id,
      config_hash: verifiedToken.payload.config_hash,
      content_hash: verifiedToken.payload.content_hash,
      version_number: 1,
      question_ids: [questionId],
      issued_at: Date.now(),
      expires_at: Date.now() + 600000
    };
    const partialToken = signExamAttemptToken(partialPayload);

    // Pre-insert into aiEvaluations without inserting into studentLearningHistory
    const mockReport = {
      evaluation_id: partialAttemptId,
      student_id: FIXTURE_STUDENT_A_ID,
      authoritative_score: 1,
      authoritative_max_score: 1,
      authoritative_percentage: 100,
      analytics_synced: false
    };

    mockState.aiEvaluations.set(partialAttemptId, {
      id: partialAttemptId,
      student_id: FIXTURE_STUDENT_A_ID,
      book_id: FIXTURE_BOOK_ID,
      chapter_id: FIXTURE_CHAPTER_ID,
      subject_id: FIXTURE_SUBJECT_ID,
      score: 1,
      total_questions: 1,
      questions_data: JSON.stringify([{ id: questionId }]),
      student_answers_data: JSON.stringify([{ question_id: questionId, selected_option_id: chosenOptId }]),
      evaluation_report: JSON.stringify(mockReport)
    });

    const histCountBefore = mockState.studentLearningHistory.length;

    // Retry call should trigger safe recovery and insert missing learning history
    const recoveryRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        attempt_token: partialToken,
        answers: { [questionId]: chosenOptId }
      })
    });
    assert.strictEqual(recoveryRes.status, 200, 'Recovery retry must return 200 OK');
    const recoveryBody = await recoveryRes.json();
    assert.strictEqual(recoveryBody.recovered, true);

    // Verify learning history was inserted during recovery
    assert.strictEqual(mockState.studentLearningHistory.length, histCountBefore + 1, 'Learning history must be inserted exactly once during recovery');

    // A second retry should NOT insert again
    await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        attempt_token: partialToken,
        answers: { [questionId]: chosenOptId }
      })
    });
    assert.strictEqual(mockState.studentLearningHistory.length, histCountBefore + 1, 'Second retry must not insert learning history again');

    console.log('  ✔ Passed: Incomplete evaluation safely recovered missing history without double-counting on subsequent retries');
  }

  console.log('----------------------------------------------------------------');
  console.log('TEST 5: Concurrent Submission Collision Resolution');
  console.log('----------------------------------------------------------------');
  {
    mockState.simulateDupEntryOnInsert = true;
    const raceAttemptId = 'att_race_collision_1';
    const racePayload = {
      schema_version: 'v1',
      attempt_id: raceAttemptId,
      student_id: FIXTURE_STUDENT_A_ID,
      cached_exam_id: verifiedToken.payload.cached_exam_id,
      config_hash: verifiedToken.payload.config_hash,
      content_hash: verifiedToken.payload.content_hash,
      version_number: 1,
      question_ids: [questionId],
      issued_at: Date.now(),
      expires_at: Date.now() + 600000
    };
    const raceToken = signExamAttemptToken(racePayload);

    const raceRes = await fetch(`${baseUrl}/api/ai/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentAToken}` },
      body: JSON.stringify({
        attempt_token: raceToken,
        answers: { [questionId]: chosenOptId }
      })
    });
    assert.strictEqual(raceRes.status, 409, 'Concurrent collision must safely return 409 Conflict');
    const raceBody = await raceRes.json();
    assert.strictEqual(raceBody.code, 'ATTEMPT_ALREADY_EVALUATED');

    console.log('  ✔ Passed: Concurrent duplicate writes safely caught and returned as 409 Conflict');
  }

  console.log('----------------------------------------------------------------');
  console.log('TEST 6: Legacy Question Bank Isolation (Unverified Items Cannot Bypass Blind Solver)');
  console.log('----------------------------------------------------------------');
  {
    // A. Legacy item lacking chunk_id
    mockState.questionBankItems = [
      {
        id: 'legacy_bank_item_no_chunk',
        question_text: 'سؤال قديم في بنك الأسئلة بدون ربط بالفقرة',
        difficulty: 'MEDIUM',
        bloom_level: 'UNDERSTANDING',
        source_chunk_id: null,
        page_reference: 1,
        opt_id: 'opt_1',
        option_text: 'خيار 1',
        is_correct: 1
      }
    ];

    AIRagEngine.clearMemoryCache();
    const bankRes1 = await aiRagEngine.getQuestionsFromBank({
      bookId: FIXTURE_BOOK_ID,
      chapterId: FIXTURE_CHAPTER_ID,
      gradeId: FIXTURE_GRADE_ID,
      count: 1,
      expectedLanguage: 'ar'
    });
    assert.strictEqual(bankRes1, null, 'Legacy item without chunk must be rejected from bank cache');

    // B. Legacy item with chunk that fails blind solver verification (e.g. ambiguity or disagreement)
    mockState.questionBankItems = [
      {
        id: 'legacy_bank_item_failing_solver',
        question_text: 'سؤال قديم لا تدعمه الفقرة المرفقة إطلاقاً',
        difficulty: 'MEDIUM',
        bloom_level: 'UNDERSTANDING',
        source_chunk_id: FIXTURE_CHUNK_ID,
        page_reference: 10,
        opt_id: 'opt_x',
        option_text: 'خيار خاطئ',
        is_correct: 1
      }
    ];

    AIRagEngine.clearMemoryCache();
    // Temporarily override solver to simulate failure/disagreement
    AIRagEngine.setBlindSolverOverride(async () => {
      return {
        status: 'UNSUPPORTED_PREMISE',
        reasoning: 'Supporting text does not contain question premise',
        defensible_option_ids: [],
        raw_response: '{}'
      };
    });

    const bankRes2 = await aiRagEngine.getQuestionsFromBank({
      bookId: FIXTURE_BOOK_ID,
      chapterId: FIXTURE_CHAPTER_ID,
      gradeId: FIXTURE_GRADE_ID,
      count: 1,
      expectedLanguage: 'ar'
    });
    assert.strictEqual(bankRes2, null, 'Legacy item failing blind solver must be rejected from bank cache');

    // Restore working solver
    AIRagEngine.setBlindSolverOverride(async (candidate) => {
      const matchingOpt = candidate.options.find(o => o.text.includes('مسافات متساوية في أزمنة متساوية')) || candidate.options[0];
      return {
        status: 'SOLVED',
        selected_option_id: matchingOpt.id,
        defensible_option_ids: [matchingOpt.id],
        entailed_evidence_quote: 'السرعة المنتظمة هي السرعة التي يقطع بها الجسم مسافات متساوية في أزمنة متساوية',
        solver_rationale: 'Definition matches option exactly',
        raw_response: '{"status":"SOLVED"}'
      };
    });

    console.log('  ✔ Passed: Legacy question bank items lacking chunk or failing blind solver strictly isolated');
  }

  console.log('----------------------------------------------------------------');
  console.log('TEST 7: Teacher Exam Pre-Submission Explanation Privacy (GET /api/exams/:id)');
  console.log('----------------------------------------------------------------');
  {
    // A. Request by STUDENT role
    const studentExamRes = await fetch(`${baseUrl}/api/exams/${FIXTURE_EXAM_ID}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${studentAToken}` }
    });
    assert.strictEqual(studentExamRes.status, 200, 'Student exam fetch must succeed 200 OK');
    const studentExamData = await studentExamRes.json();
    assert.ok(Array.isArray(studentExamData.questions), 'Must return questions array');
    const studentQ = studentExamData.questions[0];

    // Must NOT leak explanation to student before submission
    assert.strictEqual(studentQ.explanation, undefined, 'Student response MUST NOT leak explanation');

    // Must NOT leak is_correct in options
    for (const opt of studentQ.options) {
      assert.strictEqual(opt.is_correct, undefined, 'Student options MUST NOT leak is_correct');
    }

    // B. Request by TEACHER role
    const teacherExamRes = await fetch(`${baseUrl}/api/exams/${FIXTURE_EXAM_ID}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${teacherToken}` }
    });
    assert.strictEqual(teacherExamRes.status, 200, 'Teacher exam fetch must succeed 200 OK');
    const teacherExamData = await teacherExamRes.json();
    const teacherQ = teacherExamData.questions[0];

    // Teacher MUST have access to explanation and is_correct
    assert.ok(teacherQ.explanation, 'Teacher response MUST preserve explanation');
    assert.strictEqual(teacherQ.explanation, mockState.examQuestions.get(FIXTURE_EXAM_Q_ID).explanation);
    assert.ok(teacherQ.options.some(o => o.is_correct === 1 || o.is_correct === true), 'Teacher response MUST include is_correct in options');

    console.log('  ✔ Passed: Pre-submission explanation & is_correct omitted for students; preserved for teachers');
  }

  server.close();
  console.log('\n================================================================');
  console.log('ALL PHASE 4G.3G TESTS PASSED (7/7 TEST SUITES GREEN)');
  console.log('Zero Database Mutations | Zero External AI Calls | Strictly Isolated');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('❌ TEST RUNNER FAILED:', err);
  if (server) server.close();
  process.exit(1);
});
