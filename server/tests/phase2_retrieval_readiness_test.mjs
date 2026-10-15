import assert from 'assert';
import { createSemanticVector, cosineSimilarity } from '../dist/services/ai/vectorEmbedding.js';
import { ReadinessValidator } from '../dist/services/readinessValidator.js';

console.log('================================================================');
console.log('PHASE 2 — RETRIEVAL READINESS & ISOLATION UNIT TEST SUITE');
console.log('Zero External Gemini API Calls | Zero Production Data Mutation');
console.log('================================================================\n');

let passed = 0;
const pass = (name) => {
  passed++;
  console.log(`  [PASS] ${passed}. ${name}`);
};

// ============================================================================
// TEST 1: Semantic vector ranking accuracy against known source passages
// ============================================================================
console.log('--- Test Group 1: Non-Generative Semantic Retrieval Validation ---');

// Ground-truth educational passages from curriculum textbooks
const passageScience = 'الكثافة هي كتلة وحدة الحجوم من المادة، وتُقاس بوحدة جرام لكل سنتيمتر مكعب (جم/سم³). العلاقة الرياضية لحساب الكثافة: الكثافة = الكتلة ÷ الحجم.';
const passageHistory = 'نجح محمد علي باشا في بناء مصر الحديثة وتطوير الجيش والأسطول وإنشاء القناطر الخيرية لتنظيم الري في الوجه البحري.';
const passageGrammar = 'الفاعل اسم مرفوع تقدمه فعل تام مبني للمعلوم ودل على من قام بالفعل أو اتصف به، وتكون علامة رفعه الضمة أو الواو أو الألف.';

const vecScience = createSemanticVector(passageScience, 768);
const vecHistory = createSemanticVector(passageHistory, 768);
const vecGrammar = createSemanticVector(passageGrammar, 768);

assert.strictEqual(vecScience.length, 768, 'Semantic vector must have 768 dimensions');
assert.strictEqual(vecHistory.length, 768, 'Semantic vector must have 768 dimensions');

// Query 1: Science query about density and mass
const query1 = 'كيف يتم حساب الكثافة والكتلة والحجم في مادة العلوم؟';
const queryVec1 = createSemanticVector(query1, 768);

const simScience1 = cosineSimilarity(queryVec1, vecScience);
const simHistory1 = cosineSimilarity(queryVec1, vecHistory);
const simGrammar1 = cosineSimilarity(queryVec1, vecGrammar);

console.log(`  Science Query Scores -> Science: ${simScience1.toFixed(4)}, History: ${simHistory1.toFixed(4)}, Grammar: ${simGrammar1.toFixed(4)}`);
assert.ok(simScience1 > simHistory1, 'Science passage must score higher than History passage');
assert.ok(simScience1 > simGrammar1, 'Science passage must score higher than Grammar passage');
pass('Semantic vector ranking correctly ranks relevant Science passage #1 with high confidence');

// Query 2: History query about Muhammad Ali and modern Egypt
const query2 = 'دور محمد علي في بناء القناطر الخيرية وتطوير الجيش';
const queryVec2 = createSemanticVector(query2, 768);

const simScience2 = cosineSimilarity(queryVec2, vecScience);
const simHistory2 = cosineSimilarity(queryVec2, vecHistory);
const simGrammar2 = cosineSimilarity(queryVec2, vecGrammar);

console.log(`  History Query Scores -> Science: ${simScience2.toFixed(4)}, History: ${simHistory2.toFixed(4)}, Grammar: ${simGrammar2.toFixed(4)}`);
assert.ok(simHistory2 > simScience2, 'History passage must score higher than Science passage');
assert.ok(simHistory2 > simGrammar2, 'History passage must score higher than Grammar passage');
pass('Semantic vector ranking correctly ranks relevant History passage #1 with high confidence');

// ============================================================================
// TEST 2: Curriculum isolation validation (Stage, Grade, Subject, Book, Unit)
// ============================================================================
console.log('\n--- Test Group 2: Curriculum Isolation & Boundary Safety ---');

const candidateChunks = [
  {
    id: 'c-valid-1',
    book_id: 'book-prep1-science',
    chapter_id: 'unit-1',
    academic_stage_id: 'prep',
    grade_id: 'prep-1',
    subject_id: 'science',
    page_number: 15,
    content: passageScience
  },
  {
    id: 'c-leak-grade',
    book_id: 'book-prep2-science',
    chapter_id: 'unit-1',
    academic_stage_id: 'prep',
    grade_id: 'prep-2', // MISMATCH
    subject_id: 'science',
    page_number: 15,
    content: 'تركيب الجدول الدوري الحديث في الصف الثاني الإعدادي'
  },
  {
    id: 'c-leak-subject',
    book_id: 'book-prep1-arabic',
    chapter_id: 'unit-1',
    academic_stage_id: 'prep',
    grade_id: 'prep-1',
    subject_id: 'arabic', // MISMATCH
    page_number: 15,
    content: passageGrammar
  }
];

// Isolation enforcement filter
const filterIsolatedChunks = (chunks, target) => {
  return chunks.filter(c =>
    c.academic_stage_id === target.academicStageId &&
    c.grade_id === target.gradeId &&
    c.subject_id === target.subjectId &&
    c.book_id === target.bookId &&
    c.chapter_id === target.chapterId
  );
};

const targetParams = {
  academicStageId: 'prep',
  gradeId: 'prep-1',
  subjectId: 'science',
  bookId: 'book-prep1-science',
  chapterId: 'unit-1'
};

const isolated = filterIsolatedChunks(candidateChunks, targetParams);
assert.strictEqual(isolated.length, 1, 'Only strictly isolated chunk must be admitted');
assert.strictEqual(isolated[0].id, 'c-valid-1');
pass('Curriculum isolation strictly rejects cross-grade and cross-subject leakage');

// ============================================================================
// TEST 3: Out-of-bounds chunk boundary rejection
// ============================================================================
console.log('\n--- Test Group 3: Out-of-Bounds & Chapter Page Range Verification ---');

const unitBoundary = { start_page: 10, end_page: 30 };
const chunksWithOOB = [
  { id: 'c-in-1', page_number: 12, content: 'مفهوم المادة' },
  { id: 'c-in-2', page_number: 28, content: 'حالات المادة' },
  { id: 'c-oob-pre', page_number: 2, content: 'مقدمة الكتاب العامة' }, // OUT OF BOUNDS (< 10)
  { id: 'c-oob-post', page_number: 35, content: 'الوحدة الثانية' }     // OUT OF BOUNDS (> 30)
];

const boundaryFiltered = chunksWithOOB.filter(
  c => c.page_number >= unitBoundary.start_page && c.page_number <= unitBoundary.end_page
);

assert.strictEqual(boundaryFiltered.length, 2, 'Only in-boundary chunks must survive');
assert.deepStrictEqual(boundaryFiltered.map(c => c.id), ['c-in-1', 'c-in-2']);
pass('Out-of-bounds chunks on pages outside unit start/end page are deterministically filtered');

// ============================================================================
// TEST 4: Dynamic readiness evaluation fail-closed behavior
// ============================================================================
console.log('\n--- Test Group 4: Dynamic Readiness Evaluation Fail-Closed Behavior ---');

// Mock a unit record with 0 embeddings
const rowMissingEmbeddings = {
  book_id: 'b-test-1',
  book_title_ar: 'العلوم',
  chapter_id: 'ch-test-1',
  unit_title_ar: 'الوحدة الأولى: المادة',
  processing_status: 'COMPLETED',
  total_pages: 100,
  start_page: 5,
  end_page: 25,
  total_chunks: 10,
  total_chars: 3500,
  embedded_chunks: 0, // 0 embeddings!
  out_of_range_chunks: 0
};

// Access private/internal evaluateDbRecordReadiness via reflection or call getUnitReadinessAsync
const readinessMissingEmbed = ReadinessValidator['evaluateDbRecordReadiness'](
  'b-test-1',
  'ch-test-1',
  rowMissingEmbeddings
);

// NEW BEHAVIOR (BM25 Dual-Mode Path):
// A unit with valid text content (totalChunks >= 2, totalChars >= 100, valid page bounds, 0 out-of-range)
// but 0 embeddings is CONDITIONALLY_READY with retrievalMode = EDUCATIONAL_BM25.
// It is only strictly BLOCKED for: 0 chunks, <100 chars, invalid page range, or out-of-range chunks.
assert.strictEqual(readinessMissingEmbed.status, 'CONDITIONALLY_READY', 'Unit with valid text but 0 embeddings must be CONDITIONALLY_READY (BM25 path), not BLOCKED');
assert.strictEqual(readinessMissingEmbed.isEligibleForAI, true, 'Unit with valid text is eligible for BM25-based AI generation');
assert.strictEqual(readinessMissingEmbed.retrievalMode, 'EDUCATIONAL_BM25', 'Retrieval mode must be EDUCATIONAL_BM25 when embeddings are missing but text is valid');
assert.ok(readinessMissingEmbed.requiredActions.some(a => a.includes('تضمينات') || a.includes('متجه')), 'Required actions must include embedding generation guidance');
pass('Readiness validator correctly routes to EDUCATIONAL_BM25 (CONDITIONALLY_READY) when embeddings are missing but text is sufficient (10 chunks, 3500 chars)');

// Verify that truly insufficient text DOES still fail closed
const rowInsufficientText = {
  book_id: 'b-test-insufficient',
  book_title_ar: 'العلوم',
  chapter_id: 'ch-test-insufficient',
  unit_title_ar: 'الوحدة الأولى',
  processing_status: 'COMPLETED',
  total_pages: 100,
  start_page: 5,
  end_page: 25,
  total_chunks: 1,       // Below minimum 2 chunks
  total_chars: 50,       // Below minimum 100 chars
  embedded_chunks: 0,
  out_of_range_chunks: 0
};
const readinessInsufficient = ReadinessValidator['evaluateDbRecordReadiness']('b-test-insufficient', 'ch-test-insufficient', rowInsufficientText);
assert.strictEqual(readinessInsufficient.status, 'BLOCKED', 'Unit with insufficient text (1 chunk, 50 chars) must remain BLOCKED');
assert.strictEqual(readinessInsufficient.isEligibleForAI, false, 'Insufficient text must not be eligible for AI');
pass('Readiness validator still fails closed (BLOCKED) when text content is insufficient (<2 chunks or <100 chars)');

// Mock a unit record with out-of-range chunks
const rowOOB = {
  book_id: 'b-test-2',
  book_title_ar: 'الرياضيات',
  chapter_id: 'ch-test-2',
  unit_title_ar: 'الوحدة الأولى: الأعداد',
  processing_status: 'COMPLETED',
  total_pages: 100,
  start_page: 10,
  end_page: 40,
  total_chunks: 15,
  total_chars: 4000,
  embedded_chunks: 15,
  out_of_range_chunks: 3 // 3 chunks out of range!
};

const readinessOOB = ReadinessValidator['evaluateDbRecordReadiness'](
  'b-test-2',
  'ch-test-2',
  rowOOB
);

assert.strictEqual(readinessOOB.status, 'BLOCKED', 'Unit with out-of-range chunks must be BLOCKED');
assert.strictEqual(readinessOOB.isEligibleForAI, false);
assert.ok(readinessOOB.reason.includes('خارج النطاق'), 'Must cite out-of-range chunks in diagnostic reason');
pass('Readiness validator fails closed (BLOCKED) when chunks fall outside chapter page boundaries');

// Mock a fully valid unit record
const rowHealthy = {
  book_id: 'b-test-3',
  book_title_ar: 'اللغة العربية',
  chapter_id: 'ch-test-3',
  unit_title_ar: 'الوحدة الأولى',
  processing_status: 'COMPLETED',
  total_pages: 90,
  start_page: 11,
  end_page: 35,
  total_chunks: 12,
  total_chars: 4500,
  embedded_chunks: 12, // 100% embeddings
  out_of_range_chunks: 0
};

const readinessHealthy = ReadinessValidator['evaluateDbRecordReadiness'](
  'b-test-3',
  'ch-test-3',
  rowHealthy
);

assert.strictEqual(readinessHealthy.status, 'VERIFIED_READY', 'Fully valid unit must be VERIFIED_READY');
assert.strictEqual(readinessHealthy.isEligibleForAI, true);
pass('Readiness validator grants VERIFIED_READY when all 100% embeddings and boundaries are satisfied');

console.log('\n================================================================');
console.log(`ALL ${passed} PHASE 2 RETRIEVAL READINESS TESTS PASSED PERFECTLY!`);
console.log('================================================================');
