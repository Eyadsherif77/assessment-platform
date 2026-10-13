import assert from 'assert';
import {
  computeCanonicalFingerprint,
  verifyCanonicalFingerprint,
  normalizeArabicLevel1,
  evaluateMathExpression,
  MissingIntegritySecretError,
  AnswerValidationService
} from '../dist/services/answerValidationService.js';

console.log('================================================================');
console.log('PHASE 4G.3A — ISOLATED IN-MEMORY INTEGRITY TEST SUITE');
console.log('Zero Database Connections | Zero AI API Calls | Pure Unit Logic');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

// ============================================================================
// SUITE 1: CONSERVATIVE ARABIC LEVEL 1 NORMALIZATION
// ============================================================================
console.log('--- Suite 1: Conservative Arabic Level 1 Normalization ---');

runTest('Strips Tashkeel diacritics (Fatha, Damma, Kasra, Sukun, Shadda, Tanwin)', () => {
  const input = 'القَاهِرَةُ عاصِمَةُ جُمْهُورِيَّةِ مِصْرَ العَرَبِيَّةِ';
  const expected = 'القاهرة عاصمة جمهورية مصر العربية';
  assert.strictEqual(normalizeArabicLevel1(input), expected);
});

runTest('Strips Tatweel / Kashida', () => {
  const input = 'مـصـر الـعـزيـزة';
  const expected = 'مصر العزيزة';
  assert.strictEqual(normalizeArabicLevel1(input), expected);
});

runTest('Normalizes Alef variants (أ, إ, آ, ٱ) to bare Alef (ا)', () => {
  const input = 'أحمد وإبراهيم في مأدبة مع آدم وٱبن عمه';
  const expected = 'احمد وابراهيم في مادبة مع ادم وابن عمه';
  assert.strictEqual(normalizeArabicLevel1(input), expected);
});

runTest('Normalizes Persian/Urdu character variants (ک -> ك, ی -> ي)', () => {
  const input = 'کتاب فی تاریخ';
  const expected = 'كتاب في تاريخ';
  assert.strictEqual(normalizeArabicLevel1(input), expected);
});

runTest('Normalizes Eastern Arabic digits (٠-٩) to Western Latin digits (0-9)', () => {
  const input = 'ولد عام ١٩٧٣ في اليوم ١٥ من شهر ٠٦';
  const expected = 'ولد عام 1973 في اليوم 15 من شهر 06';
  assert.strictEqual(normalizeArabicLevel1(input), expected);
});

runTest('Collapses multiple whitespace and newlines to a single space', () => {
  const input = '  مصر    العربية \n\t القديمة   ';
  const expected = 'مصر العربية القديمة';
  assert.strictEqual(normalizeArabicLevel1(input), expected);
});

runTest('CRITICAL PRESERVATION: Preserves Taa Marbuta (ة) and never converts to Haa (ه)', () => {
  const school = normalizeArabicLevel1('مدرسة');
  const teacher = normalizeArabicLevel1('مدرسه');
  assert.notStrictEqual(school, teacher, 'مدرسة must NOT equal مدرسه');
  assert.strictEqual(school, 'مدرسة');
  assert.strictEqual(teacher, 'مدرسه');

  const face = normalizeArabicLevel1('وجه');
  const typo = normalizeArabicLevel1('وجة');
  assert.notStrictEqual(face, typo, 'وجه must NOT equal وجة');

  const doubt = normalizeArabicLevel1('شبهة');
  const resemblance = normalizeArabicLevel1('شبه');
  assert.notStrictEqual(doubt, resemblance, 'شبهة must NOT equal شبه');
});

runTest('CRITICAL PRESERVATION: Preserves Alef Maqsura (ى) and never converts to Yeh (ي)', () => {
  const on = normalizeArabicLevel1('على');
  const ali = normalizeArabicLevel1('علي');
  assert.notStrictEqual(on, ali, 'على must NOT equal علي');
  assert.strictEqual(on, 'على');
  assert.strictEqual(ali, 'علي');
});

runTest('Handles empty, null, or non-string inputs safely without throwing', () => {
  assert.strictEqual(normalizeArabicLevel1(''), '');
  assert.strictEqual(normalizeArabicLevel1(null), '');
  assert.strictEqual(normalizeArabicLevel1(undefined), '');
});

// ============================================================================
// SUITE 2: SAFE BOUNDED MATHEMATICAL PARSER
// ============================================================================
console.log('\n--- Suite 2: Safe Bounded Mathematical Parser ---');

runTest('Evaluates standard integer arithmetic (+, -, *, /)', () => {
  const res1 = evaluateMathExpression('15 + 27');
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.value, 42);

  const res2 = evaluateMathExpression('100 - 35');
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.value, 65);

  const res3 = evaluateMathExpression('25 * 4');
  assert.strictEqual(res3.success, true);
  assert.strictEqual(res3.value, 100);

  const res4 = evaluateMathExpression('10 / 2');
  assert.strictEqual(res4.success, true);
  assert.strictEqual(res4.value, 5);
});

runTest('Enforces standard operator precedence and parentheses', () => {
  const res1 = evaluateMathExpression('2 + 3 * 4');
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.value, 14);

  const res2 = evaluateMathExpression('(2 + 3) * 4');
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.value, 20);

  const res3 = evaluateMathExpression('10 - (4 - 2)');
  assert.strictEqual(res3.success, true);
  assert.strictEqual(res3.value, 8);
});

runTest('Evaluates Eastern Arabic numerals and Arabic operators (×, ÷)', () => {
  const res1 = evaluateMathExpression('١٥ + ٢٧');
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.value, 42);

  const res2 = evaluateMathExpression('٢٥ × ٤');
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.value, 100);

  const res3 = evaluateMathExpression('١٠ ÷ ٢');
  assert.strictEqual(res3.success, true);
  assert.strictEqual(res3.value, 5);
});

runTest('Evaluates fractions and finite decimals canonically', () => {
  const res1 = evaluateMathExpression('1/2 + 1/4');
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.value, 0.75);
  assert.strictEqual(res1.simplifiedString, '3/4');

  const res2 = evaluateMathExpression('1/3 + 1/6');
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.value, 0.5);
  assert.strictEqual(res2.simplifiedString, '1/2');

  const res3 = evaluateMathExpression('0.25 * 4');
  assert.strictEqual(res3.success, true);
  assert.strictEqual(res3.value, 1);
});

runTest('Evaluates bounded integer exponentiation (base ^ exp)', () => {
  const res1 = evaluateMathExpression('2^3');
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.value, 8);

  const res2 = evaluateMathExpression('3^2 + 1');
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.value, 10);
});

runTest('Evaluates unary minus and negative values correctly', () => {
  const res1 = evaluateMathExpression('-5 + 8');
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.value, 3);

  const res2 = evaluateMathExpression('10 + (-4)');
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.value, 6);
});

runTest('SAFELY REJECTS: Division by zero returns controlled error', () => {
  const res1 = evaluateMathExpression('10 / 0');
  assert.strictEqual(res1.success, false);
  assert.strictEqual(res1.error, 'DIVISION_BY_ZERO');

  const res2 = evaluateMathExpression('5 / (2 - 2)');
  assert.strictEqual(res2.success, false);
  assert.strictEqual(res2.error, 'DIVISION_BY_ZERO');
});

runTest('SAFELY REJECTS: Equations and variables are strictly rejected', () => {
  const resEq = evaluateMathExpression('2x + 4 = 10');
  assert.strictEqual(resEq.success, false);
  assert.strictEqual(resEq.error, 'EQUATIONS_NOT_SUPPORTED');

  const resVar = evaluateMathExpression('2x + 4');
  assert.strictEqual(resVar.success, false);
  assert.strictEqual(resVar.error, 'VARIABLES_NOT_SUPPORTED');

  const resVarAr = evaluateMathExpression('٢س + ٤');
  assert.strictEqual(resVarAr.success, false);
  assert.strictEqual(resVarAr.error, 'VARIABLES_NOT_SUPPORTED');
});

runTest('SAFELY REJECTS: Malicious code injection without arbitrary execution', () => {
  const res1 = evaluateMathExpression('eval("2+2")');
  assert.strictEqual(res1.success, false);

  const res2 = evaluateMathExpression('console.log(process.env)');
  assert.strictEqual(res2.success, false);

  const res3 = evaluateMathExpression('Function("return 1")()');
  assert.strictEqual(res3.success, false);

  const res4 = evaluateMathExpression('__proto__');
  assert.strictEqual(res4.success, false);
});

runTest('SAFELY REJECTS: Malformed syntax, resource limits, and empty inputs', () => {
  const res1 = evaluateMathExpression('2 + * 3');
  assert.strictEqual(res1.success, false);

  const res2 = evaluateMathExpression('(5 + 2');
  assert.strictEqual(res2.success, false);

  const res3 = evaluateMathExpression('');
  assert.strictEqual(res3.success, false);
  assert.strictEqual(res3.error, 'EMPTY_EXPRESSION');

  const longExpr = '1 + '.repeat(50) + '1'; // > 128 chars
  const res4 = evaluateMathExpression(longExpr);
  assert.strictEqual(res4.success, false);
  assert.strictEqual(res4.error, 'INPUT_EXCEEDS_RESOURCE_LIMIT');
});

// ============================================================================
// SUITE 3: CANONICAL FINGERPRINTING & HMAC INTEGRITY
// ============================================================================
console.log('\n--- Suite 3: Canonical Fingerprinting & HMAC Integrity ---');

const TEST_SECRET = 'test-exam-integrity-secret-hex-4f8a9b2c3d1e0f';

const samplePayload = {
  schema_version: 'v1',
  question_text: 'ما هي عاصمة جمهورية مصر العربية؟',
  options: [
    { id: 'opt_1', text: 'القاهرة', order: 1 },
    { id: 'opt_2', text: 'الإسكندرية', order: 2 },
    { id: 'opt_3', text: 'الجيزة', order: 3 },
    { id: 'opt_4', text: 'أسوان', order: 4 }
  ],
  correct_option_id: 'opt_1',
  curriculum_scope: {
    book_id: 'fa2a1525-c46f-4b34-9f48-b762be88e5c5',
    chapter_id: 'c2387de6-beda-4c55-b93b-b65bfced4e45',
    grade_id: 'grade_prep1',
    subject_id: 'subj_social_studies'
  },
  evidence_binding: {
    chunk_id: 'chunk_8b7f_001',
    page_number: 14,
    passage_sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
  },
  verification_audit: {
    verifier_model: 'blind-solver-auditor-v1',
    verified_at: '2026-10-12T18:00:00Z'
  }
};

runTest('Generates deterministic v1: HMAC-SHA256 fingerprint', () => {
  const sig1 = computeCanonicalFingerprint(samplePayload, TEST_SECRET);
  assert(sig1.startsWith('v1:'), 'Signature must start with v1:');
  assert.strictEqual(sig1.length, 67, 'Signature length must be 3 + 64 hex chars');

  const sig2 = computeCanonicalFingerprint(samplePayload, TEST_SECRET);
  assert.strictEqual(sig1, sig2, 'Identical payload must produce identical fingerprint');
});

runTest('Canonical ordering: Payload key order does not affect signature', () => {
  // Scramble top-level and nested key ordering
  const scrambledPayload = {
    verification_audit: {
      verified_at: '2026-10-12T18:00:00Z',
      verifier_model: 'blind-solver-auditor-v1'
    },
    correct_option_id: 'opt_1',
    question_text: 'ما هي عاصمة جمهورية مصر العربية؟',
    schema_version: 'v1',
    evidence_binding: {
      passage_sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      page_number: 14,
      chunk_id: 'chunk_8b7f_001'
    },
    options: [
      { order: 1, text: 'القاهرة', id: 'opt_1' },
      { order: 2, text: 'الإسكندرية', id: 'opt_2' },
      { order: 3, text: 'الجيزة', id: 'opt_3' },
      { order: 4, text: 'أسوان', id: 'opt_4' }
    ],
    curriculum_scope: {
      subject_id: 'subj_social_studies',
      book_id: 'fa2a1525-c46f-4b34-9f48-b762be88e5c5',
      grade_id: 'grade_prep1',
      chapter_id: 'c2387de6-beda-4c55-b93b-b65bfced4e45'
    }
  };

  const sigOriginal = computeCanonicalFingerprint(samplePayload, TEST_SECRET);
  const sigScrambled = computeCanonicalFingerprint(scrambledPayload, TEST_SECRET);
  assert.strictEqual(sigOriginal, sigScrambled, 'Key order scrambling must not alter fingerprint');
});

runTest('Option array order canonicalization: Options sorted by order property', () => {
  const reversedOptionsPayload = {
    ...samplePayload,
    options: [...samplePayload.options].reverse() // Reversed options in array
  };

  const sigNormal = computeCanonicalFingerprint(samplePayload, TEST_SECRET);
  const sigReversed = computeCanonicalFingerprint(reversedOptionsPayload, TEST_SECRET);
  assert.strictEqual(sigNormal, sigReversed, 'Options array order must normalize by order property');
});

runTest('Constant-time verifyCanonicalFingerprint returns true for authentic payload', () => {
  const sig = computeCanonicalFingerprint(samplePayload, TEST_SECRET);
  const isValid = verifyCanonicalFingerprint(samplePayload, sig, TEST_SECRET);
  assert.strictEqual(isValid, true);
});

runTest('TAMPER DETECTION: Changing question text invalidates signature', () => {
  const sig = computeCanonicalFingerprint(samplePayload, TEST_SECRET);
  const tampered = { ...samplePayload, question_text: 'ما هي عاصمة مصر الحديثة؟' };
  assert.strictEqual(verifyCanonicalFingerprint(tampered, sig, TEST_SECRET), false);
});

runTest('TAMPER DETECTION: Changing correct option ID invalidates signature', () => {
  const sig = computeCanonicalFingerprint(samplePayload, TEST_SECRET);
  const tampered = { ...samplePayload, correct_option_id: 'opt_2' };
  assert.strictEqual(verifyCanonicalFingerprint(tampered, sig, TEST_SECRET), false);
});

runTest('TAMPER DETECTION: Changing option text invalidates signature', () => {
  const sig = computeCanonicalFingerprint(samplePayload, TEST_SECRET);
  const tampered = {
    ...samplePayload,
    options: [
      { id: 'opt_1', text: 'القاهرة الكبرى', order: 1 },
      ...samplePayload.options.slice(1)
    ]
  };
  assert.strictEqual(verifyCanonicalFingerprint(tampered, sig, TEST_SECRET), false);
});

runTest('TAMPER DETECTION: Changing passage hash or chunk ID invalidates signature', () => {
  const sig = computeCanonicalFingerprint(samplePayload, TEST_SECRET);
  const tampered = {
    ...samplePayload,
    evidence_binding: {
      ...samplePayload.evidence_binding,
      passage_sha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    }
  };
  assert.strictEqual(verifyCanonicalFingerprint(tampered, sig, TEST_SECRET), false);
});

runTest('TAMPER DETECTION: Changing curriculum scope invalidates signature', () => {
  const sig = computeCanonicalFingerprint(samplePayload, TEST_SECRET);
  const tampered = {
    ...samplePayload,
    curriculum_scope: {
      ...samplePayload.curriculum_scope,
      chapter_id: 'different_chapter_id'
    }
  };
  assert.strictEqual(verifyCanonicalFingerprint(tampered, sig, TEST_SECRET), false);
});

runTest('TAMPER DETECTION: Forged or modified signature fails verification', () => {
  const sig = computeCanonicalFingerprint(samplePayload, TEST_SECRET);
  // Flip last character of signature hex
  const lastChar = sig[sig.length - 1];
  const replacementChar = lastChar === 'a' ? 'b' : 'a';
  const corruptedSig = sig.slice(0, -1) + replacementChar;

  assert.strictEqual(verifyCanonicalFingerprint(samplePayload, corruptedSig, TEST_SECRET), false);
  assert.strictEqual(verifyCanonicalFingerprint(samplePayload, 'invalid_sig', TEST_SECRET), false);
  assert.strictEqual(verifyCanonicalFingerprint(samplePayload, '', TEST_SECRET), false);
});

runTest('SECRET ISOLATION: Wrong secret fails verification', () => {
  const sig = computeCanonicalFingerprint(samplePayload, TEST_SECRET);
  const wrongSecret = 'wrong-secret-key-abcdef1234567890';
  assert.strictEqual(verifyCanonicalFingerprint(samplePayload, sig, wrongSecret), false);
});

runTest('FAIL-CLOSED: Missing secret throws MissingIntegritySecretError', () => {
  const originalEnv = process.env.EXAM_INTEGRITY_SECRET;
  try {
    delete process.env.EXAM_INTEGRITY_SECRET;
    assert.throws(
      () => computeCanonicalFingerprint(samplePayload),
      (err) => err instanceof MissingIntegritySecretError
    );
  } finally {
    if (originalEnv) process.env.EXAM_INTEGRITY_SECRET = originalEnv;
  }
});

runTest('CLASS STATIC METHOD BINDINGS: Accessible on AnswerValidationService class', () => {
  assert.strictEqual(typeof AnswerValidationService.computeCanonicalFingerprint, 'function');
  assert.strictEqual(typeof AnswerValidationService.verifyCanonicalFingerprint, 'function');
  assert.strictEqual(typeof AnswerValidationService.normalizeArabicLevel1, 'function');
  assert.strictEqual(typeof AnswerValidationService.evaluateMathExpression, 'function');

  // Verify calling via class static works identically
  const norm = AnswerValidationService.normalizeArabicLevel1('الْقَاهِرَةُ');
  assert.strictEqual(norm, 'القاهرة');

  const math = AnswerValidationService.evaluateMathExpression('10 * 5');
  assert.strictEqual(math.value, 50);
});

console.log('\n================================================================');
console.log(`PHASE 4G.3A TEST RESULTS: ${passedTests}/${totalTests} PASSED (100%)`);
console.log('Zero Database Mutations | Zero External AI Calls | Strictly Isolated');
console.log('================================================================\n');
