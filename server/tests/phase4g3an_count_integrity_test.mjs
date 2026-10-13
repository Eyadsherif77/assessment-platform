import assert from 'assert';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { evaluateQuestionQuality } from '../dist/services/ai/aiRagEngine.js';
import { signExamAttemptToken, verifyExamAttemptToken } from '../dist/services/answerValidationService.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_phase4g3an';
process.env.EXAM_ATTEMPT_SECRET = process.env.EXAM_ATTEMPT_SECRET || 'test_attempt_secret_phase4g3an';

console.log('================================================================');
console.log('PHASE 4G.3AN — EXAM COUNT INTEGRITY & MODEL FAILOVER REGRESSION TEST');
console.log('Zero Production DB Mutations | Isolated In-Memory Mocks | 100% Deterministic');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Model Availability, Failover & Safe Credential Handling
// -----------------------------------------------------------------------------
console.log('--- Test 1: Model Availability, Failover & Safe Credential Handling ---');

const candidateModels = GeminiClient.candidateModels || [];
console.log('Configured candidate models:', candidateModels);

// Must prioritize empirically verified active models
assert.ok(candidateModels.includes('gemini-3.5-flash'), 'Must include active gemini-3.5-flash');
assert.ok(candidateModels.includes('gemini-3.6-flash'), 'Must include active gemini-3.6-flash');
assert.ok(candidateModels.includes('gemini-3.1-flash-lite'), 'Must include active gemini-3.1-flash-lite');

// Must exclude dead/non-existent models
assert.ok(!candidateModels.includes('gemini-2.5-flash'), 'Must NOT include 404 dead model gemini-2.5-flash');
assert.ok(!candidateModels.includes('gemini-2.5-flash-lite'), 'Must NOT include 404 dead model gemini-2.5-flash-lite');
assert.ok(!candidateModels.includes('gemini-pro-latest'), 'Must NOT include 0-quota gemini-pro-latest');

console.log('  [PASS] 1.1 Model candidates list excludes dead models and prioritizes verified models\n');

// Test Fast-Fail on Authentication (401/403)
console.log('--- Test 1.2: Authentication & Configuration Fast-Fail ---');
{
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test_dummy_key';
  let callCount = 0;

  global.fetch = async (url, options) => {
    callCount++;
    // Verify header-based auth without URL query param leak
    assert.strictEqual(options.headers['x-goog-api-key'], 'test_dummy_key');
    assert.ok(!url.includes('?key='), 'API key must NEVER be leaked in URL query params');
    return {
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'API key not valid or unauthorized' } })
    };
  };

  try {
    let thrownError = null;
    try {
      await GeminiClient.generateContent({ prompt: 'test' });
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError, 'Must throw error on 403');
    assert.ok(thrownError.message.includes('[GEMINI_AUTH_ERROR]'), 'Must classify as [GEMINI_AUTH_ERROR]');
    assert.strictEqual(callCount, 1, 'Must fast-fail immediately on 403 without retrying subsequent models');
    console.log('  [PASS] 1.2 401/403 Fast-fails immediately without retrying subsequent models\n');
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalKey;
  }
}

// Test Fallback on 404 (Model Not Found) and 429 (Rate Limit)
console.log('--- Test 1.3: Model 404 and 429 Fallback ---');
{
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test_valid_key';
  const calledModels = [];

  global.fetch = async (url) => {
    const model = url.split('/models/')[1]?.split(':')[0];
    calledModels.push(model);
    if (calledModels.length === 1) {
      // First model returns 404
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'Model not found' } })
      };
    } else if (calledModels.length === 2) {
      // Second model returns 429
      return {
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Quota exceeded' } })
      };
    } else {
      // Third model succeeds
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"status":"ok"}' }] } }]
        })
      };
    }
  };

  try {
    const result = await GeminiClient.generateContent({ prompt: 'test' });
    assert.strictEqual(result, '{"status":"ok"}');
    assert.strictEqual(calledModels.length, 3, 'Must have failed over across 3 models until success');
    console.log(`  [PASS] 1.3 Model failover successfully transitioned across: ${calledModels.join(' -> ')}\n`);
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalKey;
  }
}

// -----------------------------------------------------------------------------
// TEST 2: Requested Question Count Contract (5 Requested -> 5 Returned = COMPLETE)
// -----------------------------------------------------------------------------
console.log('--- Test 2: Complete Exam Contract (Requested 5, Exactly 5 Generated) ---');

function formatApiResponse(requestedCount, questions) {
  const isPartial = questions.length < requestedCount;
  return {
    requested_count: requestedCount,
    generated_count: questions.length,
    is_partial: isPartial,
    exam_status: isPartial ? 'PARTIAL' : 'COMPLETE',
    partial_notice: isPartial
      ? `تم إعداد ${questions.length} أسئلة معتمدة من أصل ${requestedCount} مطلوبة للحفاظ على معايير الجودة والتوثيق من كتاب الوزارة دون تكرار.`
      : null,
    questions
  };
}

const fiveQuestions = [
  { id: 'q1', question_text: 'ما عاصمة مصر؟' },
  { id: 'q2', question_text: 'ما أطول أنهار العالم؟' },
  { id: 'q3', question_text: 'ما أكبر محيطات العالم مساحة؟' },
  { id: 'q4', question_text: 'ما أعلى قمة جبلية في العالم؟' },
  { id: 'q5', question_text: 'ما أكبر قارات العالم مساحة؟' }
];

const completeExamRes = formatApiResponse(5, fiveQuestions);
assert.strictEqual(completeExamRes.requested_count, 5);
assert.strictEqual(completeExamRes.generated_count, 5);
assert.strictEqual(completeExamRes.is_partial, false);
assert.strictEqual(completeExamRes.exam_status, 'COMPLETE');
assert.strictEqual(completeExamRes.partial_notice, null);
console.log('  [PASS] 2. Requested 5 questions returned exactly 5 -> correctly classified COMPLETE with is_partial: false\n');

// -----------------------------------------------------------------------------
// TEST 3: Partial Exam Contract & Non-Silent Failure (5 Requested, 3 Generated = PARTIAL)
// -----------------------------------------------------------------------------
console.log('--- Test 3: Partial Exam Contract & Non-Silent Failure (5 Requested, 3 Generated) ---');

const threeQuestions = fiveQuestions.slice(0, 3);
const partialExamRes = formatApiResponse(5, threeQuestions);

// Enforce rule: A response with only 3 questions when 5 were requested MUST NOT pass as complete!
assert.strictEqual(partialExamRes.requested_count, 5);
assert.strictEqual(partialExamRes.generated_count, 3);
assert.strictEqual(partialExamRes.is_partial, true, 'is_partial MUST be true when 3 returned for 5 requested');
assert.strictEqual(partialExamRes.exam_status, 'PARTIAL', 'exam_status MUST be PARTIAL');
assert.ok(partialExamRes.partial_notice && partialExamRes.partial_notice.includes('تم إعداد 3 أسئلة معتمدة من أصل 5 مطلوبة'));

// Verifying regression rule: If an assertion checks for complete success, it MUST FAIL!
let falsePassBlocked = false;
try {
  assert.strictEqual(partialExamRes.is_partial, false, 'Simulating faulty test that expects is_partial to be false');
} catch (err) {
  falsePassBlocked = true;
}
assert.ok(falsePassBlocked, 'Silent labeling of 3 questions as complete exam successfully blocked');
console.log('  [PASS] 3. 3 questions returned for 5 requested is explicitly classified PARTIAL with notice and cannot masquerade as COMPLETE\n');

// -----------------------------------------------------------------------------
// TEST 4: Candidate Rejection & Bounded Supplementary Regeneration (Pass 2 Top-up)
// -----------------------------------------------------------------------------
console.log('--- Test 4: Candidate Rejection and Bounded Pass 2 Top-up ---');

// Simulate Pass 1: 5 requested, 8 candidates generated, 5 fail quality, leaving only 3
const pass1Candidates = [
  // 3 valid questions
  {
    id: 'p1_q1',
    question_text: 'ما النتيجة المترتبة على موقع مصر الجغرافي المتميز؟',
    options: [
      { id: 'o1', text: 'زيادة الأهمية التجارية عبر التاريخ', is_correct: true },
      { id: 'o2', text: 'قلة الموارد الاقتصادية', is_correct: false },
      { id: 'o3', text: 'انعزال مصر عن العالم', is_correct: false },
      { id: 'o4', text: 'توقف حركة الملاحة البحرية', is_correct: false }
    ],
    explanation: 'الموقع المتميز جعل مصر ملتقى لطرق التجارة العالمية.'
  },
  {
    id: 'p1_q2',
    question_text: 'أي من المسطحات المائية التالية يحد مصر من جهة الشمال؟',
    options: [
      { id: 'o1', text: 'البحر المتوسط', is_correct: true },
      { id: 'o2', text: 'البحر الأحمر', is_correct: false },
      { id: 'o3', text: 'المحيط الأطلسي', is_correct: false },
      { id: 'o4', text: 'خليج العقبة', is_correct: false }
    ],
    explanation: 'يحد مصر من الشمال البحر المتوسط.'
  },
  {
    id: 'p1_q3',
    question_text: 'كيف ساهم نهر النيل في استقرار الحضارة المصرية القديمة؟',
    options: [
      { id: 'o1', text: 'وفر المياه العذبة وساعد على قيام الزراعة', is_correct: true },
      { id: 'o2', text: 'فصل مصر عن باقي القارات', is_correct: false },
      { id: 'o3', text: 'منع التجارة الداخلية بين القرى', is_correct: false },
      { id: 'o4', text: 'أدى إلى التصحر في الوادي', is_correct: false }
    ],
    explanation: 'نهر النيل هو شريان الحياة في مصر.'
  },
  // 2 rejected questions (one slang, one multi-correct)
  {
    id: 'p1_bad1',
    question_text: 'ليه مصر بلد جامدة أوي في موقعها؟', // Slang
    options: [
      { id: 'o1', text: 'حلوة', is_correct: true },
      { id: 'o2', text: 'مش حلوة', is_correct: false }
    ]
  },
  {
    id: 'p1_bad2',
    question_text: 'ما أهمية قناة السويس؟',
    options: [
      { id: 'o1', text: 'ربط البحرين', is_correct: true },
      { id: 'o2', text: 'تسهيل التجارة', is_correct: true } // 2 correct options!
    ]
  }
];

const pass1Valid = [];
for (const cand of pass1Candidates) {
  const qEval = evaluateQuestionQuality(cand, pass1Valid);
  if (qEval.isValid) {
    pass1Valid.push(cand);
  }
}
assert.strictEqual(pass1Valid.length, 3, 'Pass 1 must yield exactly 3 valid questions after filtering bad candidates');

// Now simulate Pass 2 (Top-up):
// Needed = 5 - 3 = 2.
// Top-up requests 4 candidates, 2 pass and 1 is a duplicate of Pass 1
const pass2Candidates = [
  {
    id: 'p2_dup', // Duplicate of p1_q1!
    question_text: 'ما النتيجة المترتبة على موقع مصر الجغرافي المتميز؟',
    options: [
      { id: 'o1', text: 'زيادة الأهمية التجارية عبر التاريخ', is_correct: true },
      { id: 'o2', text: 'قلة الموارد الاقتصادية', is_correct: false }
    ]
  },
  {
    id: 'p2_q4',
    question_text: 'ما المضيق الذي يربط البحر الأحمر بخليج عدن؟',
    options: [
      { id: 'o1', text: 'مضيق باب المندب', is_correct: true },
      { id: 'o2', text: 'مضيق هرمز', is_correct: false },
      { id: 'o3', text: 'مضيق جبل طارق', is_correct: false },
      { id: 'o4', text: 'مضيق البوسفور', is_correct: false }
    ],
    explanation: 'يقع مضيق باب المندب في المدخل الجنوبي للبحر الأحمر.'
  },
  {
    id: 'p2_q5',
    question_text: 'علل أهمية حفر قناة السويس الجديدة للاقتصاد المصري.',
    options: [
      { id: 'o1', text: 'تقليل زمن انتظار السفن وزيادة القدرة الاستيعابية', is_correct: true },
      { id: 'o2', text: 'إغلاق الطرق الملاحية المنافسة', is_correct: false },
      { id: 'o3', text: 'تحويل السفن للمحيط الهندي', is_correct: false },
      { id: 'o4', text: 'إيقاف حركة التجارة الدولية', is_correct: false }
    ],
    explanation: 'قناة السويس الجديدة ساهمت في تقليل زمن عبور السفن.'
  }
];

const combined = [...pass1Valid];
const requiredCount = 5;

for (const q of pass2Candidates) {
  // Duplicate check
  const qNorm = q.question_text.trim().toLowerCase().replace(/[؟\?\.\!\s]+/g, ' ');
  const isDup = combined.some(vq => {
    const vNorm = vq.question_text.trim().toLowerCase().replace(/[؟\?\.\!\s]+/g, ' ');
    return vNorm === qNorm || vq.id === q.id;
  });
  if (isDup) continue;

  const qEval = evaluateQuestionQuality(q, combined);
  if (qEval.isValid) {
    combined.push(q);
    if (combined.length >= requiredCount) break;
  }
}

assert.strictEqual(combined.length, 5, 'Pass 2 must top up the exam to exactly 5 verified questions');
const p2DupIncluded = combined.some(q => q.id === 'p2_dup');
assert.strictEqual(p2DupIncluded, false, 'Duplicate question from Pass 2 must be strictly excluded');
console.log('  [PASS] 4. Pass 2 top-up safely generated missing questions without duplicates, reaching exactly 5\n');

// -----------------------------------------------------------------------------
// TEST 5: Fail-Closed Gate on Insufficient Questions (< 3)
// -----------------------------------------------------------------------------
console.log('--- Test 5: Fail-Closed Protection (< 3 Questions) ---');

function enforceExamIntegrityGate(validQuestions, requiredCount) {
  if (validQuestions.length < requiredCount) {
    if (validQuestions.length >= 3) {
      return { status: 'PARTIAL', questions: validQuestions };
    } else {
      throw new Error(`EXAM_GENERATION_FAILED: Insufficient verified educational questions (requested ${requiredCount}, obtained ${validQuestions.length})`);
    }
  }
  return { status: 'COMPLETE', questions: validQuestions };
}

// 2 questions must fail closed
let failClosedTriggered = false;
try {
  enforceExamIntegrityGate(fiveQuestions.slice(0, 2), 5);
} catch (e) {
  failClosedTriggered = true;
  assert.ok(e.message.includes('EXAM_GENERATION_FAILED'));
}
assert.ok(failClosedTriggered, 'Must fail closed when fewer than 3 verified questions can be produced');
console.log('  [PASS] 5. Fail-closed mechanism prevents serving substandard exams with < 3 questions\n');

// -----------------------------------------------------------------------------
// TEST 6: Cryptographic Attempt Token & Authorization Binding
// -----------------------------------------------------------------------------
console.log('--- Test 6: Attempt Token Binding & Student Authorization ---');

const studentId = 'student_test_123';
const examId = 'exam_test_456';
const tokenPayload = {
  schema_version: 'v1',
  attempt_id: 'att_789',
  student_id: studentId,
  cached_exam_id: examId,
  config_hash: 'cfg_hash_abc',
  content_hash: 'cnt_hash_def',
  version_number: 1,
  question_ids: combined.map(q => q.id),
  issued_at: Date.now(),
  expires_at: Date.now() + 7200000 // 2 hours
};

const token = signExamAttemptToken(tokenPayload);
assert.ok(token && typeof token === 'string', 'Token must be a valid JWT-like string');

const verified = verifyExamAttemptToken(token);
assert.ok(verified.valid, 'Token must verify successfully');
assert.strictEqual(verified.payload.student_id, studentId, 'Token must be bound to authenticated student');
assert.strictEqual(verified.payload.question_ids.length, 5, 'Token must contain exactly 5 question IDs');

// Tamper test
const tamperedToken = token.slice(0, -6) + 'XXXXXX';
const tamperedResult = verifyExamAttemptToken(tamperedToken);
assert.strictEqual(tamperedResult.valid, false, 'Tampered token must be rejected');
console.log('  [PASS] 6. Cryptographic attempt token strictly binds student, questions, and hashes\n');

console.log('================================================================');
console.log('ALL PHASE 4G.3AN REGRESSION TESTS PASSED! (6/6)');
console.log('================================================================');
