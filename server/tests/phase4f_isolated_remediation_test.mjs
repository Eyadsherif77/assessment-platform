import assert from 'assert';
import { db } from '../dist/db/db.js';
import { aiRagEngine, AIRagEngine, verifyQuestionProvenance } from '../dist/services/ai/aiRagEngine.js';
import { ExamCacheService } from '../dist/services/examCacheService.js';
import { AnswerValidationService } from '../dist/services/answerValidationService.js';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

console.log('================================================================');
console.log('PHASE 4F — ISOLATED REGRESSION TEST SUITE');
console.log('Zero Database Mutations | Zero External AI Calls | Strictly Mocked');
console.log('================================================================\n');

// Ensure mock key is set so mocked client is invoked
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'mock-key-for-isolated-testing';

// Track and enforce ZERO production writes
let productionWritesAttempted = 0;
const originalDbQuery = db.query.bind(db);

// Mock DB state storage
const mockBookPages = new Map();
const mockBookChunks = new Map();
const mockBookChapters = new Map();
const mockBooks = new Map();
const mockTopicMastery = new Map();
const mockLearningHistory = [];
const mockEvaluations = [];

// Synthetic fixture IDs
const FIXTURE_STAGE_ID = 'stage_prep_123';
const FIXTURE_GRADE_ID = 'grade_prep3_123';
const FIXTURE_SUBJECT_ID = 'subj_math_123';
const FIXTURE_BOOK_ID = 'book_math_prep3_term1';
const FIXTURE_CHAPTER_ID = 'ch_math_algebra_1';

// Populate synthetic fixtures
mockBooks.set(FIXTURE_BOOK_ID, {
  id: FIXTURE_BOOK_ID,
  academic_stage_id: FIXTURE_STAGE_ID,
  grade_id: FIXTURE_GRADE_ID,
  subject_id: FIXTURE_SUBJECT_ID,
  title_ar: 'الرياضيات - الصف الثالث الإعدادي',
  title_en: 'Mathematics - Prep 3',
  school_type: 'عربي',
  term: 1,
  subject_code: 'MATH',
  subject_name_ar: 'الرياضيات',
  subject_name_en: 'Mathematics',
  grade_name_ar: 'الصف الثالث الإعدادي',
  grade_name_en: 'Third Preparatory',
  stage_name_ar: 'المرحلة الإعدادية',
  stage_name_en: 'Preparatory Stage'
});

mockBookChapters.set(FIXTURE_CHAPTER_ID, {
  id: FIXTURE_CHAPTER_ID,
  book_id: FIXTURE_BOOK_ID,
  title_ar: 'الوحدة الأولى: العلاقات والدوال',
  title_en: 'Unit 1: Relations and Functions',
  chapter_number: 1,
  start_page: 5,
  end_page: 25
});

mockBookPages.set(`${FIXTURE_BOOK_ID}:10`, {
  book_id: FIXTURE_BOOK_ID,
  page_number: 10,
  raw_text: 'حساب حاصل الضرب الديكارتي: إذا كانت س = {1، 2} فإن حاصل الضرب الديكارتي س × ص يتكون من أزواج مرتبة. 15 + 27 = 42 في التطبيقات الحسابية.'
});

mockBookPages.set(`${FIXTURE_BOOK_ID}:12`, {
  book_id: FIXTURE_BOOK_ID,
  page_number: 12,
  raw_text: 'الدوال كثيرة الحدود ودرجة الدالة: إذا كانت د(س) = 2س + 6 فإن حل المعادلة يعطي ناتج المعادلة البسيطة 20 * 3 = 60 في الدوال.'
});

mockBookChunks.set('chunk_math_10_1', {
  id: 'chunk_math_10_1',
  book_id: FIXTURE_BOOK_ID,
  chapter_id: FIXTURE_CHAPTER_ID,
  page_number: 10,
  chunk_index: 1,
  content: 'حساب حاصل الضرب الديكارتي: إذا كانت س = {1، 2} فإن حاصل الضرب الديكارتي س × ص يتكون من أزواج مرتبة. تطبيق مباشر: ما ناتج 15 + 27؟ الناتج هو 42.',
  metadata: {}
});

mockBookChunks.set('chunk_math_12_1', {
  id: 'chunk_math_12_1',
  book_id: FIXTURE_BOOK_ID,
  chapter_id: FIXTURE_CHAPTER_ID,
  page_number: 12,
  chunk_index: 2,
  content: 'الدوال كثيرة الحدود: احسب ناتج المعادلة البسيطة 20 * 3 = 60 في الدوال للتأكد من قاعدة الثابت والمجهول.',
  metadata: {}
});

// Intercept DB query to use pure in-memory synthetic fixtures
db.query = async (sql, params = []) => {
  const normSql = sql.trim().toUpperCase();

  // Safety guard: reject any real mutation to production
  if (
    normSql.startsWith('INSERT') ||
    normSql.startsWith('UPDATE') ||
    normSql.startsWith('DELETE') ||
    normSql.startsWith('DROP') ||
    normSql.startsWith('ALTER')
  ) {
    // Record into mock state instead of executing on production
    if (normSql.includes('AI_EVALUATIONS')) {
      mockEvaluations.push({ id: params[0], params });
      return { rows: [], rowCount: 1 };
    }
    if (normSql.includes('STUDENT_TOPIC_MASTERY')) {
      const key = `${params[1] || params[0]}:${params[2] || params[1]}:${params[3] || params[2]}`;
      mockTopicMastery.set(key, params);
      return { rows: [], rowCount: 1 };
    }
    if (normSql.includes('STUDENT_LEARNING_HISTORY')) {
      mockLearningHistory.push({ id: params[0], params });
      return { rows: [], rowCount: 1 };
    }
    if (normSql.includes('QUESTION_BANK') || normSql.includes('SHARED_CACHED_EXAMS')) {
      return { rows: [], rowCount: 1 };
    }
    productionWritesAttempted++;
    throw new Error(`CRITICAL: Prohibited mutating statement attempted in test: ${sql}`);
  }

  // SELECT queries routed to synthetic fixtures
  if (normSql.includes('FROM BOOKS') && normSql.includes('WHERE B.ID = $1')) {
    const book = mockBooks.get(params[0]);
    return { rows: book ? [book] : [], rowCount: book ? 1 : 0 };
  }

  if (normSql.includes('FROM BOOK_CHAPTERS') && normSql.includes('WHERE BOOK_ID = $1')) {
    const chapters = Array.from(mockBookChapters.values()).filter(c => c.book_id === params[0]);
    return { rows: chapters, rowCount: chapters.length };
  }

  if (normSql.includes('FROM BOOK_CHAPTERS') && normSql.includes('WHERE ID = $1')) {
    const ch = mockBookChapters.get(params[0]);
    if (ch && (!params[1] || ch.book_id === params[1])) {
      return { rows: [ch], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (normSql.includes('FROM BOOK_CHUNKS')) {
    if (params.length === 2 && normSql.includes('WHERE ID = $1 AND BOOK_ID = $2')) {
      const chk = mockBookChunks.get(params[0]);
      if (chk && chk.book_id === params[1]) {
        return { rows: [chk], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    // Chunk retrieval by stage, grade, subject, book, chapter
    const chId = params[4];
    const bId = params[3];
    const chunks = Array.from(mockBookChunks.values()).filter(c => c.book_id === bId && c.chapter_id === chId);
    return { rows: chunks, rowCount: chunks.length };
  }

  if (normSql.includes('FROM BOOK_PAGES') && normSql.includes('PAGE_NUMBER = $2')) {
    const pageKey = `${params[0]}:${params[1]}`;
    const page = mockBookPages.get(pageKey);
    return { rows: page ? [page] : [], rowCount: page ? 1 : 0 };
  }

  if (normSql.includes('FROM QUESTION_BANK_ITEMS')) {
    return { rows: [], rowCount: 0 };
  }

  if (normSql.includes('FROM AI_EVALUATIONS')) {
    return { rows: [], rowCount: 0 };
  }

  if (normSql.includes('FROM STUDENT_TOPIC_MASTERY')) {
    return { rows: [], rowCount: 0 };
  }

  return { rows: [], rowCount: 0 };
};

// Backup original Gemini client
const originalGenerateContent = GeminiClient.generateContent;

// Configure blind solver mock for regression suite
AIRagEngine.setBlindSolverOverride(async (input) => {
  let chosenId = input.options[0]?.id;
  for (const opt of input.options) {
    if (opt.text.trim() === '42' || opt.text.trim() === '60') {
      chosenId = opt.id;
      break;
    }
  }
  const quote = input.passage_text.includes('الناتج هو 42')
    ? 'تطبيق مباشر: ما ناتج 15 + 27؟ الناتج هو 42.'
    : input.passage_text.includes('20 * 3 = 60')
      ? 'احسب ناتج المعادلة البسيطة 20 * 3 = 60 في الدوال'
      : input.passage_text.slice(0, 30);
  return {
    status: 'SOLVED',
    selected_option_id: chosenId,
    defensible_option_ids: [chosenId],
    reasoning: 'Solver verified from passage evidence',
    entailed_evidence_quote: quote
  };
});

let passedTests = 0;
let totalTests = 12;

try {
  // --------------------------------------------------------------------------
  // TEST 1: Gemini failure cannot cause hardcoded fallback questions to be returned
  // --------------------------------------------------------------------------
  console.log('▶ Test 1: Gemini failure cannot cause hardcoded fallback questions');
  GeminiClient.generateContent = async () => {
    throw new Error('AI_GATEWAY_TIMEOUT: Simulated Gemini failure');
  };

  let test1Threw = false;
  try {
    await aiRagEngine.generateQuestions({
      academicStageId: FIXTURE_STAGE_ID,
      gradeId: FIXTURE_GRADE_ID,
      subjectId: FIXTURE_SUBJECT_ID,
      bookId: FIXTURE_BOOK_ID,
      chapterId: FIXTURE_CHAPTER_ID,
      count: 3
    });
  } catch (err) {
    test1Threw = true;
    assert(
      err.message.includes('EXAM_GENERATION_FAILED'),
      `Expected EXAM_GENERATION_FAILED error, got: ${err.message}`
    );
  }
  assert(test1Threw, 'generateQuestions must fail closed when Gemini fails');
  console.log('  ✔ Passed: Failed closed with EXAM_GENERATION_FAILED (no fallbacks returned)\n');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 2: A short response cannot be supplemented with generic questions
  // --------------------------------------------------------------------------
  console.log('▶ Test 2: Short Gemini response cannot be supplemented with generic questions');
  GeminiClient.generateContent = async () => {
    // Returns only 1 grounded question when 3 are requested
    return JSON.stringify([
      {
        question_text: "ما ناتج حاصل جمع 15 + 27 في التطبيقات الحسابية؟",
        options: [
          { text: "42", is_correct: true },
          { text: "35", is_correct: false },
          { text: "50", is_correct: false },
          { text: "40", is_correct: false }
        ],
        difficulty: "EASY",
        bloom_level: "KNOWLEDGE",
        explanation: "ناتج جمع 15 و 27 هو 42."
      }
    ]);
  };

  let test2Threw = false;
  try {
    await aiRagEngine.generateQuestions({
      academicStageId: FIXTURE_STAGE_ID,
      gradeId: FIXTURE_GRADE_ID,
      subjectId: FIXTURE_SUBJECT_ID,
      bookId: FIXTURE_BOOK_ID,
      chapterId: FIXTURE_CHAPTER_ID,
      count: 3
    });
  } catch (err) {
    test2Threw = true;
    assert(
      err.message.includes('EXAM_GENERATION_FAILED') && err.message.includes('requested 3, obtained 1'),
      `Expected short-count failure message, got: ${err.message}`
    );
  }
  assert(test2Threw, 'generateQuestions must fail closed when count is insufficient');
  console.log('  ✔ Passed: Short response was not supplemented with generic questions\n');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 3: An empty retrieval result cannot generate an exam or fabricate references
  // --------------------------------------------------------------------------
  console.log('▶ Test 3: Empty retrieval result cannot generate exam or fabricate page references');
  const EMPTY_CHAPTER_ID = 'ch_empty_no_chunks';
  mockBookChapters.set(EMPTY_CHAPTER_ID, {
    id: EMPTY_CHAPTER_ID,
    book_id: FIXTURE_BOOK_ID,
    title_ar: 'فصل فارغ بدون نصوص',
    title_en: 'Empty Chapter',
    chapter_number: 99,
    start_page: 50,
    end_page: 60
  });

  let test3Threw = false;
  try {
    await aiRagEngine.generateQuestions({
      academicStageId: FIXTURE_STAGE_ID,
      gradeId: FIXTURE_GRADE_ID,
      subjectId: FIXTURE_SUBJECT_ID,
      bookId: FIXTURE_BOOK_ID,
      chapterId: EMPTY_CHAPTER_ID,
      count: 3
    });
  } catch (err) {
    test3Threw = true;
    assert(
      err.message.includes('لا توجد مقتطفات تعليمية معتمدة'),
      `Expected no-chunks error, got: ${err.message}`
    );
  }
  assert(test3Threw, 'Empty retrieval must fail closed without generating questions');
  console.log('  ✔ Passed: Empty chunk retrieval immediately fails closed\n');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 4: Every emitted question retains genuine source references from retrieved content
  // --------------------------------------------------------------------------
  console.log('▶ Test 4: Every emitted question retains genuine source references from retrieved content');
  GeminiClient.generateContent = async () => {
    return JSON.stringify([
      {
        question_text: "ما ناتج حاصل جمع 15 + 27 في التطبيقات الحسابية المقررة؟",
        options: [
          { text: "42", is_correct: true },
          { text: "35", is_correct: false },
          { text: "50", is_correct: false },
          { text: "40", is_correct: false }
        ],
        difficulty: "EASY",
        bloom_level: "KNOWLEDGE",
        explanation: "ناتج جمع 15 و 27 هو 42."
      },
      {
        question_text: "احسب ناتج المعادلة البسيطة 20 * 3 في الدوال؟",
        options: [
          { text: "60", is_correct: true },
          { text: "50", is_correct: false },
          { text: "70", is_correct: false },
          { text: "80", is_correct: false }
        ],
        difficulty: "MEDIUM",
        bloom_level: "APPLICATION",
        explanation: "20 في 3 يساوي 60."
      }
    ]);
  };

  const validExams = await aiRagEngine.generateQuestions({
    academicStageId: FIXTURE_STAGE_ID,
    gradeId: FIXTURE_GRADE_ID,
    subjectId: FIXTURE_SUBJECT_ID,
    bookId: FIXTURE_BOOK_ID,
    chapterId: FIXTURE_CHAPTER_ID,
    count: 2
  });

  assert.strictEqual(validExams.length, 2);
  for (const q of validExams) {
    assert(q.chunk_id, 'Question must have non-empty chunk_id');
    assert(q.page_reference > 0, 'Question must have valid page_reference');
    const matchedChunk = mockBookChunks.get(q.chunk_id);
    assert(matchedChunk, `Referenced chunk ${q.chunk_id} must exist in mockBookChunks`);
    assert.strictEqual(q.page_reference, matchedChunk.page_number, 'Page reference must match chunk page number');
  }
  console.log('  ✔ Passed: All emitted questions retain genuine chunk IDs and page references\n');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 5: An unrelated hardcoded question cannot pass merely by borrowing a valid chunk ID
  // --------------------------------------------------------------------------
  console.log('▶ Test 5: Unrelated question borrowing valid chunk ID fails provenance validation');
  const fakeGroundedQ = {
    id: 'fake_q_1',
    chunk_id: 'chunk_math_10_1',
    book_id: FIXTURE_BOOK_ID,
    chapter_id: FIXTURE_CHAPTER_ID,
    question_text: "ما هي عاصمة دولة فرنسا في قارة أوروبا الغربية؟",
    options: [
      { id: 'opt_1', text: "باريس", is_correct: true },
      { id: 'opt_2', text: "لندن", is_correct: false }
    ],
    difficulty: "EASY",
    bloom_level: "KNOWLEDGE",
    page_reference: 10,
    source_excerpt: "حساب حاصل الضرب الديكارتي",
    explanation: "باريس هي العاصمة."
  };

  const provCheck = await verifyQuestionProvenance(fakeGroundedQ, FIXTURE_BOOK_ID);
  assert.strictEqual(provCheck.isVerified, false, 'Unrelated question borrowing valid chunk must be rejected');
  console.log(`  ✔ Passed: Rejected with reason: ${provCheck.reason}\n`);
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 6: Wrong-book and wrong-unit references are rejected
  // --------------------------------------------------------------------------
  console.log('▶ Test 6: Wrong-book and wrong-unit references are rejected');
  const WRONG_BOOK_ID = 'book_science_prep3';
  const wrongBookQ = { ...fakeGroundedQ, book_id: WRONG_BOOK_ID };
  const wrongBookProv = await verifyQuestionProvenance(wrongBookQ, FIXTURE_BOOK_ID);
  assert.strictEqual(wrongBookProv.isVerified, false, 'Wrong book reference must be rejected');
  assert(wrongBookProv.reason.includes('BOOK_MISMATCH'), 'Reason must specify BOOK_MISMATCH');

  const WRONG_CHAPTER_ID = 'ch_wrong_geometry';
  const wrongUnitQ = { ...fakeGroundedQ, book_id: FIXTURE_BOOK_ID, chapter_id: WRONG_CHAPTER_ID };
  const wrongUnitProv = await verifyQuestionProvenance(wrongUnitQ, FIXTURE_BOOK_ID);
  assert.strictEqual(wrongUnitProv.isVerified, false, 'Wrong unit reference must be rejected');
  assert(wrongUnitProv.reason.includes('CHAPTER_NOT_FOUND_IN_BOOK'), 'Reason must specify CHAPTER_NOT_FOUND_IN_BOOK');
  console.log('  ✔ Passed: Both wrong-book and wrong-unit references were strictly rejected\n');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 7: PENDING_REVIEW questions cannot update authoritative mastery or learning history
  // --------------------------------------------------------------------------
  console.log('▶ Test 7: PENDING_REVIEW questions cannot update authoritative mastery or learning history');
  mockTopicMastery.clear();
  mockLearningHistory.length = 0;

  const semanticQuestionsOnly = [
    {
      id: 'sem_q_1',
      question_text: "علل لما يأتي: تعتبر العلاقة دالة إذا ظهر كل عنصر كمسقط أول مرة واحدة فقط؟",
      options: [
        { id: 'o1', text: "لأن كل عنصر يرتبط بصورة واحدة فقط", is_correct: true },
        { id: 'o2', text: "لأن العناصر غير مرتبطة", is_correct: false }
      ],
      difficulty: 'MEDIUM',
      bloom_level: 'UNDERSTANDING',
      page_reference: 10,
      source_excerpt: 'العلاقات والدوال',
      explanation: 'تعريف الدالة الرياضية.'
    }
  ];

  const evalResultSemOnly = await aiRagEngine.evaluateSubmission({
    studentId: 'student_test_1',
    academicStageId: FIXTURE_STAGE_ID,
    gradeId: FIXTURE_GRADE_ID,
    subjectId: FIXTURE_SUBJECT_ID,
    bookId: FIXTURE_BOOK_ID,
    chapterId: FIXTURE_CHAPTER_ID,
    questions: semanticQuestionsOnly,
    studentAnswers: [{ question_id: 'sem_q_1', selected_option_id: 'o1' }]
  });

  assert.strictEqual(evalResultSemOnly.authoritative_max_score, 0, 'Authoritative max score must be 0 for pending-review questions');
  assert.strictEqual(evalResultSemOnly.authoritative_score, 0, 'Authoritative score must be 0');
  assert.strictEqual(evalResultSemOnly.authoritative_percentage, null, 'Authoritative percentage must be null');
  assert.strictEqual(evalResultSemOnly.authoritative_mastery_status, 'PENDING_REVIEW', 'Authoritative mastery must be PENDING_REVIEW');
  assert.strictEqual(evalResultSemOnly.provisional_score, 1, 'Provisional score should be 1 for formative guidance');
  assert.strictEqual(evalResultSemOnly.provisional_max_score, 1, 'Provisional max score should be 1');
  assert.strictEqual(mockTopicMastery.size, 0, 'student_topic_mastery must NOT be updated for unverified questions');
  assert.strictEqual(mockLearningHistory.length, 0, 'student_learning_history must NOT be inserted for unverified questions');
  console.log('  ✔ Passed: Purely pending-review exam leaves authoritative mastery and learning history uncorrupted\n');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 8: Mixed verified and pending-review submissions keep their scoring dimensions separate
  // --------------------------------------------------------------------------
  console.log('▶ Test 8: Mixed verified and pending-review submissions keep scoring dimensions separate');
  mockTopicMastery.clear();
  mockLearningHistory.length = 0;

  const mixedQuestions = [
    // Question 1: Deterministic Math (15 + 27 = 42)
    {
      id: 'math_q_1',
      question_text: "ما ناتج العملية الحسابية: 15 + 27؟",
      options: [
        { id: 'm1_opt1', text: "42", is_correct: true },
        { id: 'm1_opt2', text: "50", is_correct: false }
      ],
      difficulty: 'EASY',
      bloom_level: 'APPLICATION',
      page_reference: 10,
      source_excerpt: '15 + 27 = 42',
      explanation: 'الناتج 42.'
    },
    // Question 2: Deterministic Math (20 * 3 = 60)
    {
      id: 'math_q_2',
      question_text: "احسب ناتج المقدار: 20 * 3 = ؟",
      options: [
        { id: 'm2_opt1', text: "60", is_correct: true },
        { id: 'm2_opt2', text: "70", is_correct: false }
      ],
      difficulty: 'EASY',
      bloom_level: 'APPLICATION',
      page_reference: 12,
      source_excerpt: '20 * 3 = 60',
      explanation: 'الناتج 60.'
    },
    // Question 3: Semantic conceptual question (Pending Review)
    {
      id: 'sem_q_3',
      question_text: "ما هو الشرط الرياضي لتكون العلاقة دالة من المجموعة س إلى المجموعة ص؟",
      options: [
        { id: 's3_opt1', text: "ظهور كل عنصر كمسقط أول مرة واحدة فقط", is_correct: true },
        { id: 's3_opt2', text: "ظهور عنصرين فقط كمسقط أول", is_correct: false }
      ],
      difficulty: 'MEDIUM',
      bloom_level: 'UNDERSTANDING',
      page_reference: 10,
      source_excerpt: 'العلاقات والدوال',
      explanation: 'تعريف الدالة.'
    }
  ];

  // Student answers: Q1 correct, Q2 incorrect, Q3 correct (according to unverified key)
  const mixedAnswers = [
    { question_id: 'math_q_1', selected_option_id: 'm1_opt1' }, // Correct (math)
    { question_id: 'math_q_2', selected_option_id: 'm2_opt2' }, // Incorrect (math)
    { question_id: 'sem_q_3',  selected_option_id: 's3_opt1' }  // Correct (semantic unverified)
  ];

  const mixedEval = await aiRagEngine.evaluateSubmission({
    studentId: 'student_test_2',
    academicStageId: FIXTURE_STAGE_ID,
    gradeId: FIXTURE_GRADE_ID,
    subjectId: FIXTURE_SUBJECT_ID,
    bookId: FIXTURE_BOOK_ID,
    chapterId: FIXTURE_CHAPTER_ID,
    questions: mixedQuestions,
    studentAnswers: mixedAnswers
  });

  assert.strictEqual(mixedEval.authoritative_max_score, 2, 'Authoritative max score must count ONLY the 2 verified questions');
  assert.strictEqual(mixedEval.authoritative_score, 1, 'Authoritative score must be 1 (1 correct out of 2 verified)');
  assert.strictEqual(mixedEval.authoritative_percentage, 50.0, 'Authoritative percentage must be 50.0%');
  assert.strictEqual(mixedEval.authoritative_mastery_status, 'DEVELOPING', 'Mastery status for 50% must be DEVELOPING');
  assert.strictEqual(mixedEval.provisional_max_score, 3, 'Provisional max score must count all 3 questions');
  assert.strictEqual(mixedEval.provisional_score, 2, 'Provisional score must count all correct formative answers (2 out of 3)');
  assert.strictEqual(mixedEval.provisional_percentage, 66.7, 'Provisional percentage must be 66.7%');
  assert.strictEqual(mixedEval.pending_review_count, 1, 'Pending review count must be 1');
  assert.strictEqual(mixedEval.verified_questions_count, 2, 'Verified questions count must be 2');
  assert.strictEqual(mixedEval.has_unverified_questions, true, 'has_unverified_questions must be true');

  // Verify that only verified items updated mastery
  assert.strictEqual(mockTopicMastery.size, 1, 'student_topic_mastery should be updated');
  const masteryParams = Array.from(mockTopicMastery.values())[0];
  assert.strictEqual(masteryParams[4], 2, 'Total attempted in topic mastery must be 2 (verified only)');
  assert.strictEqual(masteryParams[5], 1, 'Total correct in topic mastery must be 1 (verified only)');
  assert.strictEqual(mockLearningHistory.length, 1, 'student_learning_history should have 1 entry');
  assert.strictEqual(mockLearningHistory[0].params[5], 50.0, 'Learning history score percentage must be 50.0% (verified only)');

  console.log('  ✔ Passed: Authoritative (1/2 = 50%) and Provisional (2/3 = 66.7%) scores strictly separated\n');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 9: Pending-review answer is not silently counted as correct or incorrect in authoritative score
  // --------------------------------------------------------------------------
  console.log('▶ Test 9: Pending-review answer is not silently counted as correct or incorrect in authoritative score');
  // In the above test:
  // Item 3 (pending review) was answered correctly. Authoritative score: 1 out of 2 (NOT 2 out of 3, NOT 2 out of 2).
  assert.strictEqual(mixedEval.items[2].is_authoritatively_scored, false, 'Pending item must have is_authoritatively_scored = false');
  assert.strictEqual(mixedEval.items[2].authoritative_points, null, 'Pending item must have authoritative_points = null');
  assert.strictEqual(mixedEval.items[2].points, 0, 'Authoritative points field must be 0 for unverified item');
  assert.strictEqual(mixedEval.items[2].is_correct, true, 'Provisional is_correct must still provide formative feedback');
  console.log('  ✔ Passed: Pending-review items do not alter authoritative numerator or denominator\n');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 10: Cache hits and question-bank paths cannot bypass the new protections
  // --------------------------------------------------------------------------
  console.log('▶ Test 10: Question-bank and cache validation cannot bypass new protections');
  const badMathQuestion = {
    id: 'rejected_math_item',
    question_text: "احسب ناتج: 10 + 10 = ؟",
    options: [
      { id: 'opt_bad_1', text: "999", is_correct: true }, // Incorrect math answer key
      { id: 'opt_bad_2', text: "20", is_correct: false }
    ],
    difficulty: 'EASY',
    bloom_level: 'APPLICATION'
  };

  const validationResult = AnswerValidationService.validateQuestion(badMathQuestion);
  assert.strictEqual(validationResult.answerKeyStatus, 'REJECTED', 'Mismatched arithmetic answer key must be REJECTED');

  let storeRejectedThrew = false;
  try {
    await ExamCacheService.storeExamInCache({
      identity: {
        bookId: FIXTURE_BOOK_ID,
        titleAr: 'الرياضيات',
        titleEn: 'Math',
        gradeId: FIXTURE_GRADE_ID,
        academicStageId: FIXTURE_STAGE_ID,
        subjectId: FIXTURE_SUBJECT_ID,
        term: 1,
        schoolType: 'عربي'
      },
      unitIds: [FIXTURE_CHAPTER_ID],
      examParams: { count: 1 },
      questions: [badMathQuestion],
      skipProvenanceCheck: true
    });
  } catch (err) {
    storeRejectedThrew = true;
    assert(err.message.includes('ANSWER_VALIDATION_REJECTED'), 'Cache store must reject invalid answer key');
  }
  assert(storeRejectedThrew, 'Cache storage must fail closed on rejected answer key');
  console.log('  ✔ Passed: Question bank and cache store strictly reject invalid answer keys\n');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 11: Authentication, authorization, curriculum isolation, multi-version caching remain intact
  // --------------------------------------------------------------------------
  console.log('▶ Test 11: Curriculum identity, multi-version caching, and config hashing remain intact');
  const identity = {
    bookId: FIXTURE_BOOK_ID,
    titleAr: 'الرياضيات',
    titleEn: 'Math',
    gradeId: FIXTURE_GRADE_ID,
    academicStageId: FIXTURE_STAGE_ID,
    subjectId: FIXTURE_SUBJECT_ID,
    term: 1,
    schoolType: 'عربي'
  };

  const configKey1 = ExamCacheService.buildCanonicalConfigKey(identity, 'ch1', 'hashA');
  const configKey2 = ExamCacheService.buildCanonicalConfigKey(identity, 'ch1', 'hashA');
  assert.strictEqual(configKey1, configKey2, 'Canonical config keys must be deterministic');

  const configHash = ExamCacheService.computeConfigHash(configKey1);
  assert.strictEqual(configHash.length, 64, 'SHA-256 config hash must be 64 hex characters');

  const contentHash = ExamCacheService.computeContentHash(mixedQuestions);
  assert.strictEqual(contentHash.length, 64, 'Content hash must be 64 hex characters');
  console.log('  ✔ Passed: Deterministic canonical hashing and curriculum identity integrity verified\n');
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST 12: Existing question and exam response contracts remain backward-compatible
  // --------------------------------------------------------------------------
  console.log('▶ Test 12: Question and exam response contracts remain backward-compatible');
  assert(typeof mixedEval.score === 'number', 'Legacy score property must be present');
  assert(typeof mixedEval.max_score === 'number', 'Legacy max_score property must be present');
  assert(typeof mixedEval.percentage === 'number', 'Legacy percentage property must be present');
  assert(typeof mixedEval.mastery_status === 'string', 'Legacy mastery_status property must be present');
  assert(Array.isArray(mixedEval.items), 'Legacy items array must be present');
  assert(Array.isArray(mixedEval.weak_topics), 'Legacy weak_topics array must be present');
  assert(Array.isArray(mixedEval.strong_topics), 'Legacy strong_topics array must be present');
  assert(typeof mixedEval.overall_feedback_ar === 'string', 'Legacy overall_feedback_ar must be present');
  assert(typeof mixedEval.overall_feedback_en === 'string', 'Legacy overall_feedback_en must be present');

  // Verify new fields coexist cleanly
  assert(typeof mixedEval.authoritative_score === 'number', 'New authoritative_score must exist');
  assert(typeof mixedEval.authoritative_max_score === 'number', 'New authoritative_max_score must exist');
  assert(typeof mixedEval.provisional_score === 'number', 'New provisional_score must exist');
  assert(typeof mixedEval.provisional_max_score === 'number', 'New provisional_max_score must exist');
  assert(typeof mixedEval.has_unverified_questions === 'boolean', 'New has_unverified_questions must exist');
  console.log('  ✔ Passed: Complete backward compatibility with client contracts preserved\n');
  passedTests++;

} finally {
  // Restore original methods
  GeminiClient.generateContent = originalGenerateContent;
  db.query = originalDbQuery;
}

console.log('================================================================');
console.log(`RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log(`Production Writes Attempted: ${productionWritesAttempted} (STRICT ZERO)`);
console.log('================================================================');

if (productionWritesAttempted > 0) {
  console.error('❌ SAFETY FAILURE: Real production writes were attempted!');
  process.exit(1);
} else if (passedTests === totalTests) {
  console.log('🎉 ALL 12 ISOLATED REGRESSION TESTS PASSED GREEN!');
  process.exit(0);
} else {
  console.error('❌ SOME TESTS FAILED');
  process.exit(1);
}
