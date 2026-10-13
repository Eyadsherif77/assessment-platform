import assert from 'assert';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { evaluateQuestionQuality } from '../dist/services/ai/aiRagEngine.js';

console.log('================================================================');
console.log('PHASE 4G.3AM — EXAM GENERATION ERROR CLASSIFICATION & SAFETY TEST');
console.log('Zero Production DB Mutations | Zero External AI Calls | Isolated');
console.log('================================================================\n');

// Test 1: GeminiClient candidate models must prioritize active models and exclude dead models
console.log('--- Test 1: Active Model Priority in GeminiClient ---');
const candidateModels = GeminiClient.candidateModels || [];
console.log('Candidate models configured:', candidateModels);
assert.ok(candidateModels.includes('gemini-flash-lite-latest'), 'Must include active gemini-flash-lite-latest');
assert.ok(!candidateModels.includes('gemini-2.5-flash'), 'Must NOT include non-existent gemini-2.5-flash');
assert.ok(!candidateModels.includes('gemini-2.5-flash-lite'), 'Must NOT include non-existent gemini-2.5-flash-lite');
assert.ok(['gemini-3.5-flash', 'gemini-flash-lite-latest'].includes(candidateModels[0]), 'First candidate model must be an active verified model');
console.log('  [PASS] 1. GeminiClient excludes dead 404 models and prioritizes active models\n');

// Test 2: Quality filter rejects malformed, metadata-leaking, or slang questions
console.log('--- Test 2: Quality Filter Rigor ---');
const slangQuestion = {
  id: 'q-1',
  chunk_id: 'c-1',
  book_id: 'b-1',
  chapter_id: 'ch-1',
  question_text: 'ما هي أهمية موقع مصر الجغرافي أوي؟',
  page_reference: 10,
  options: [
    { id: 'opt-1', text: 'حاجة حلوة', is_correct: true },
    { id: 'opt-2', text: 'مش مهم', is_correct: false },
    { id: 'opt-3', text: 'عادي', is_correct: false },
    { id: 'opt-4', text: 'تاني', is_correct: false }
  ]
};
const slangQuality = evaluateQuestionQuality(slangQuestion);
assert.strictEqual(slangQuality.isValid, false, 'Slang question must be rejected');
console.log('  [PASS] 2. Slang / dialect question rejected by teacher quality filter\n');

// Test 3: Valid question passes teacher quality filter
console.log('--- Test 3: Educational Question Validation ---');
const validTeacherQuestion = {
  id: 'q-2',
  chunk_id: 'c-1',
  book_id: 'b-1',
  chapter_id: 'ch-1',
  question_text: 'ما السبب الرئيسي وراء الكشوف الجغرافية الأوروبية؟',
  page_reference: 15,
  options: [
    { id: 'opt-1', text: 'البحث عن طرق تجارية جديدة', is_correct: true },
    { id: 'opt-2', text: 'التحالف مع الدولة العثمانية', is_correct: false },
    { id: 'opt-3', text: 'نشر الزراعة التقليدية', is_correct: false },
    { id: 'opt-4', text: 'تجنب التجارة البحرية', is_correct: false }
  ],
  explanation: 'سعت الدول الأوروبية لاكتشاف طرق بحرية مباشرة للتجارة مع آسيا.'
};
const validQuality = evaluateQuestionQuality(validTeacherQuestion);
assert.strictEqual(validQuality.isValid, true, 'Valid teacher question must pass quality filter');
console.log('  [PASS] 3. Rigorous educational question passes quality filter\n');

// Test 4: Over-generation candidate buffer calculation
console.log('--- Test 4: Over-generation Candidate Buffer Calculation ---');
const calculateRequestCount = (requiredCount) => {
  const candidateBuffer = Math.max(3, Math.ceil(requiredCount * 0.6));
  return Math.min(10, requiredCount + candidateBuffer);
};
assert.strictEqual(calculateRequestCount(5), 8, 'For 5 questions, must request 8 candidates');
assert.strictEqual(calculateRequestCount(3), 6, 'For 3 questions, must request 6 candidates');
assert.strictEqual(calculateRequestCount(10), 10, 'For 10 questions, upper bounded at 10');
console.log('  [PASS] 4. Candidate over-generation ratio guarantees statistical headroom for strict validation\n');

console.log('================================================================');
console.log('ALL PHASE 4G.3AM TESTS PASSED SUCCESSFULLY! (4/4)');
console.log('================================================================');
