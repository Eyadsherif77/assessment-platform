import assert from 'assert';
import {
  sanitizeBlindSolverInput,
  verifyCandidateQuestionWithBlindSolver
} from '../dist/services/ai/aiRagEngine.js';

console.log('================================================================');
console.log('PHASE 4G.3B — INDEPENDENT GENERATOR & BLIND SOLVER AUDITOR TEST');
console.log('Zero Database Connections | Zero External AI Calls | Strictly Mocked');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

// Canonical Valid Fixture
const validCandidate = {
  question_text: 'ما هي عاصمة جمهورية مصر العربية وفقاً للنص الجغرافي؟',
  options: [
    { id: 'opt_1', text: 'القاهرة' },
    { id: 'opt_2', text: 'الإسكندرية' },
    { id: 'opt_3', text: 'الجيزة' },
    { id: 'opt_4', text: 'أسوان' }
  ],
  proposed_correct_option_id: 'opt_1',
  rationale: 'ورد صراحة في النص أن القاهرة هي العاصمة السياسية لجمهورية مصر العربية.',
  evidence: {
    book_id: 'fa2a1525-c46f-4b34-9f48-b762be88e5c5',
    chapter_id: 'c2387de6-beda-4c55-b93b-b65bfced4e45',
    page_number: 14,
    chunk_id: 'chunk_social_p14_01',
    passage_text: 'القاهرة هي العاصمة السياسية لجمهورية مصر العربية وتعد كبرى مدن القارة الإفريقية من حيث الكثافة السكانية ومقراً للحكومة والمؤسسات الدستورية.'
  }
};

async function main() {
  // ==========================================================================
  // SUITE 1: AIR-GAP SANITIZATION & LEAKAGE PREVENTION
  // ==========================================================================
  console.log('--- Suite 1: Air-Gap Sanitization & Answer Leakage Prevention ---');

  await runTest('Air-gap sanitizer strictly strips answer keys, flags, and rationales', async () => {
    // Add extra answer-revealing fields to options and candidate
    const leakyCandidate = {
      ...validCandidate,
      options: [
        { id: 'opt_1', text: 'القاهرة', is_correct: true, note: 'correct answer' },
        { id: 'opt_2', text: 'الإسكندرية', is_correct: false, note: 'distractor' }
      ],
      proposed_correct_option_id: 'opt_1',
      rationale: 'Hidden generator secret reason',
      explanation: 'Detailed answer explanation'
    };

    const sanitized = sanitizeBlindSolverInput(leakyCandidate);

    // 1. Check top-level keys: MUST strictly contain passage_text, question_text, options
    const topKeys = Object.keys(sanitized).sort();
    assert.deepStrictEqual(topKeys, ['options', 'passage_text', 'question_text']);

    // 2. Check that proposed answer and rationales are completely absent
    assert.strictEqual('proposed_correct_option_id' in sanitized, false);
    assert.strictEqual('rationale' in sanitized, false);
    assert.strictEqual('explanation' in sanitized, false);

    // 3. Check each option: MUST only contain id and text
    for (const opt of sanitized.options) {
      const optKeys = Object.keys(opt).sort();
      assert.deepStrictEqual(optKeys, ['id', 'text']);
      assert.strictEqual('is_correct' in opt, false);
      assert.strictEqual('note' in opt, false);
    }
  });

  // ==========================================================================
  // SUITE 2: SUCCESSFUL VERIFICATION & AGREEMENT GATE
  // ==========================================================================
  console.log('\n--- Suite 2: Blind Solver Agreement & Entailment Verification ---');

  await runTest('Passes verification when blind solver independently agrees and single defensibility holds', async () => {
    const mockSolver = async (input) => {
      // Assert solver received sanitized input
      assert.strictEqual('proposed_correct_option_id' in input, false);
      return {
        status: 'SOLVED',
        selected_option_id: 'opt_1',
        defensible_option_ids: ['opt_1'],
        reasoning: 'النص يوضح أن القاهرة هي العاصمة السياسية لمصر.',
        entailed_evidence_quote: 'القاهرة هي العاصمة السياسية لجمهورية مصر العربية'
      };
    };

    const result = await verifyCandidateQuestionWithBlindSolver(validCandidate, mockSolver);
    assert.strictEqual(result.is_verified, true);
    assert.strictEqual(result.status, 'VERIFIED');
    assert.strictEqual(result.generator_option_id, 'opt_1');
    assert.strictEqual(result.solver_option_id, 'opt_1');
    assert(result.evidence_hash && result.evidence_hash.length === 64);
    assert(result.verified_at);
  });

  // ==========================================================================
  // SUITE 3: REJECTION MODES & FAIL-CLOSED GATES
  // ==========================================================================
  console.log('\n--- Suite 3: Rejection Modes & Fail-Closed Behavior ---');

  await runTest('REJECTS on Solver Disagreement (Generator says A, Solver chooses B)', async () => {
    const mockSolver = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_2', // Alexandria instead of Cairo
      defensible_option_ids: ['opt_2'],
      reasoning: 'Solver chose Alexandria.',
      entailed_evidence_quote: 'القاهرة هي العاصمة'
    });

    const result = await verifyCandidateQuestionWithBlindSolver(validCandidate, mockSolver);
    assert.strictEqual(result.is_verified, false);
    assert.strictEqual(result.status, 'REJECTED');
    assert.strictEqual(result.rejection_code, 'SOLVER_DISAGREEMENT');
    assert.strictEqual(result.generator_option_id, 'opt_1');
    assert.strictEqual(result.solver_option_id, 'opt_2');
  });

  await runTest('REJECTS on Ambiguous Question with multiple defensible options', async () => {
    const mockSolver = async () => ({
      status: 'AMBIGUOUS',
      selected_option_id: 'opt_1',
      defensible_option_ids: ['opt_1', 'opt_3'], // Both Cairo and Giza are defensible
      reasoning: 'النص يذكر كلاً من القاهرة والجيزة في نفس السياق.',
      entailed_evidence_quote: 'القاهرة هي العاصمة'
    });

    const result = await verifyCandidateQuestionWithBlindSolver(validCandidate, mockSolver);
    assert.strictEqual(result.is_verified, false);
    assert.strictEqual(result.status, 'REJECTED');
    assert.strictEqual(result.rejection_code, 'AMBIGUOUS_OPTIONS');
  });

  await runTest('REJECTS on Unsupported Premise when quote is absent or solver flags premise', async () => {
    // Case A: Solver flags UNSUPPORTED_PREMISE directly
    const mockSolverPremise = async () => ({
      status: 'UNSUPPORTED_PREMISE',
      defensible_option_ids: [],
      reasoning: 'السؤال يفترض معلومة غير مذكورة في النص.'
    });

    const resA = await verifyCandidateQuestionWithBlindSolver(validCandidate, mockSolverPremise);
    assert.strictEqual(resA.is_verified, false);
    assert.strictEqual(resA.status, 'REJECTED');
    assert.strictEqual(resA.rejection_code, 'UNSUPPORTED_PREMISE');

    // Case B: Generator and solver agree, but solver cites a fabricated quote absent from text
    const mockSolverHallucinatedQuote = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_1',
      defensible_option_ids: ['opt_1'],
      reasoning: 'ورد في نص آخر تم اختلاقه.',
      entailed_evidence_quote: 'هذه الجملة غير موجودة إطلاقاً في النص الداعم'
    });

    const resB = await verifyCandidateQuestionWithBlindSolver(validCandidate, mockSolverHallucinatedQuote);
    assert.strictEqual(resB.is_verified, false);
    assert.strictEqual(resB.status, 'REJECTED');
    assert.strictEqual(resB.rejection_code, 'UNSUPPORTED_PREMISE');
  });

  await runTest('REJECTS on Insufficient Evidence when passage cannot establish answer', async () => {
    const mockSolver = async () => ({
      status: 'INSUFFICIENT_EVIDENCE',
      defensible_option_ids: [],
      reasoning: 'الفقرة المتاحة تتناول المناخ فقط ولا تذكر العاصمة.'
    });

    const result = await verifyCandidateQuestionWithBlindSolver(validCandidate, mockSolver);
    assert.strictEqual(result.is_verified, false);
    assert.strictEqual(result.status, 'REJECTED');
    assert.strictEqual(result.rejection_code, 'INSUFFICIENT_EVIDENCE');
  });

  await runTest('REJECTS questions depending on visual diagrams, maps, or figures', async () => {
    // Case A: Question text contains visual indicator
    const visualCandidateQ = {
      ...validCandidate,
      question_text: 'الشكل المقابل يوضح خريطة جمهورية مصر العربية، حدد العاصمة:'
    };

    const mockSolver = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_1',
      defensible_option_ids: ['opt_1'],
      reasoning: 'Pass'
    });

    const resA = await verifyCandidateQuestionWithBlindSolver(visualCandidateQ, mockSolver);
    assert.strictEqual(resA.is_verified, false);
    assert.strictEqual(resA.status, 'REJECTED');
    assert.strictEqual(resA.rejection_code, 'VISUAL_DIAGRAM_DEPENDENT');

    // Case B: Supporting passage references unprovided map
    const visualCandidatePassage = {
      ...validCandidate,
      evidence: {
        ...validCandidate.evidence,
        passage_text: 'بالاستعانة بالخريطة الموضحة أمامك، تقع مدينة القاهرة عند رأس الدلتا وتعتبر عاصمة البلاد.'
      }
    };

    const resB = await verifyCandidateQuestionWithBlindSolver(visualCandidatePassage, mockSolver);
    assert.strictEqual(resB.is_verified, false);
    assert.strictEqual(resB.status, 'REJECTED');
    assert.strictEqual(resB.rejection_code, 'VISUAL_DIAGRAM_DEPENDENT');

    // Case C: Solver returns REQUIRES_VISUAL
    const mockSolverVisual = async () => ({
      status: 'REQUIRES_VISUAL',
      defensible_option_ids: [],
      reasoning: 'يتطلب حل السؤال الاطلاع على الشكل الهندسي غير المتوفر في النص.'
    });

    const resC = await verifyCandidateQuestionWithBlindSolver(validCandidate, mockSolverVisual);
    assert.strictEqual(resC.is_verified, false);
    assert.strictEqual(resC.status, 'REJECTED');
    assert.strictEqual(resC.rejection_code, 'VISUAL_DIAGRAM_DEPENDENT');
  });

  await runTest('REJECTS questions from disqualified geometry curriculum units (Out of Scope)', async () => {
    const geometryCandidate = {
      ...validCandidate,
      evidence: {
        ...validCandidate.evidence,
        chapter_id: '1b9f4377-6ae0-4c24-b588-c221900597ec' // Disqualified Prep 1 Math Geometry Chapter
      }
    };

    const mockSolver = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_1',
      defensible_option_ids: ['opt_1'],
      reasoning: 'Pass'
    });

    const result = await verifyCandidateQuestionWithBlindSolver(geometryCandidate, mockSolver);
    assert.strictEqual(result.is_verified, false);
    assert.strictEqual(result.status, 'REJECTED');
    assert.strictEqual(result.rejection_code, 'OUT_OF_SCOPE');
  });

  await runTest('REJECTS on missing, fabricated, or invalid source evidence binding', async () => {
    // Missing chunk_id
    const badChunk = {
      ...validCandidate,
      evidence: { ...validCandidate.evidence, chunk_id: '' }
    };
    const resA = await verifyCandidateQuestionWithBlindSolver(badChunk, async () => ({}));
    assert.strictEqual(resA.is_verified, false);
    assert.strictEqual(resA.rejection_code, 'INVALID_SOURCE_BINDING');

    // Non-positive page_number
    const badPage = {
      ...validCandidate,
      evidence: { ...validCandidate.evidence, page_number: 0 }
    };
    const resB = await verifyCandidateQuestionWithBlindSolver(badPage, async () => ({}));
    assert.strictEqual(resB.is_verified, false);
    assert.strictEqual(resB.rejection_code, 'INVALID_SOURCE_BINDING');

    // Too short passage text
    const shortPassage = {
      ...validCandidate,
      evidence: { ...validCandidate.evidence, passage_text: 'قصير جداً' }
    };
    const resC = await verifyCandidateQuestionWithBlindSolver(shortPassage, async () => ({}));
    assert.strictEqual(resC.is_verified, false);
    assert.strictEqual(resC.rejection_code, 'INVALID_SOURCE_BINDING');
  });

  await runTest('REJECTS on malformed candidate structure or duplicate options', async () => {
    // Duplicate option ID
    const dupOption = {
      ...validCandidate,
      options: [
        { id: 'opt_1', text: 'القاهرة' },
        { id: 'opt_1', text: 'الجيزة' } // Duplicate ID
      ]
    };
    const resA = await verifyCandidateQuestionWithBlindSolver(dupOption, async () => ({}));
    assert.strictEqual(resA.is_verified, false);
    assert.strictEqual(resA.rejection_code, 'INVALID_STRUCTURED_OUTPUT');

    // Proposed answer does not exist in options
    const orphanAnswer = {
      ...validCandidate,
      proposed_correct_option_id: 'opt_999' // Non-existent
    };
    const resB = await verifyCandidateQuestionWithBlindSolver(orphanAnswer, async () => ({}));
    assert.strictEqual(resB.is_verified, false);
    assert.strictEqual(resB.rejection_code, 'INVALID_STRUCTURED_OUTPUT');

    // Solver returns malformed output (null or invalid status)
    const resC = await verifyCandidateQuestionWithBlindSolver(validCandidate, async () => null);
    assert.strictEqual(resC.is_verified, false);
    assert.strictEqual(resC.rejection_code, 'INVALID_STRUCTURED_OUTPUT');

    const resD = await verifyCandidateQuestionWithBlindSolver(validCandidate, async () => ({ status: 'UNKNOWN_STATUS' }));
    assert.strictEqual(resD.is_verified, false);
    assert.strictEqual(resD.rejection_code, 'INVALID_STRUCTURED_OUTPUT');
  });

  await runTest('REJECTS on Solver Execution Failure, Timeout, or Crash (Fails Closed)', async () => {
    // Solver throws an error
    const crashingSolver = async () => {
      throw new Error('AI_GATEWAY_TIMEOUT: Blind solver took 5000ms');
    };

    const result = await verifyCandidateQuestionWithBlindSolver(validCandidate, crashingSolver);
    assert.strictEqual(result.is_verified, false);
    assert.strictEqual(result.status, 'REJECTED');
    assert.strictEqual(result.rejection_code, 'VERIFICATION_EXECUTION_FAILURE');
    assert(result.rejection_reason.includes('AI_GATEWAY_TIMEOUT'));
  });

  await runTest('PROOF: Zero failure paths can ever evaluate to is_verified === true', async () => {
    // Test a matrix of edge cases and ensure is_verified is strictly false
    const brokenCases = [
      null,
      {},
      { question_text: '' },
      { ...validCandidate, options: [] },
      { ...validCandidate, proposed_correct_option_id: '' }
    ];

    for (const bc of brokenCases) {
      const res = await verifyCandidateQuestionWithBlindSolver(bc, async () => ({ status: 'SOLVED' }));
      assert.strictEqual(res.is_verified, false, 'Broken case must not pass verification');
      assert.strictEqual(res.status, 'REJECTED');
    }
  });

  // ==========================================================================
  // SUITE 4: AUD-01 — MANDATORY EVIDENCE QUOTE VALIDATION
  // ==========================================================================
  console.log('\n--- Suite 4: AUD-01 — Mandatory Evidence Quote Validation ---');

  await runTest('AUD-01: REJECTS when entailed_evidence_quote is completely missing (undefined)', async () => {
    const solverMissingQuote = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_1',
      defensible_option_ids: ['opt_1'],
      reasoning: 'Missing quote field entirely'
    });
    const res = await verifyCandidateQuestionWithBlindSolver(validCandidate, solverMissingQuote);
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.status, 'REJECTED');
    assert.strictEqual(res.rejection_code, 'INSUFFICIENT_EVIDENCE');
    assert(res.rejection_reason.includes('missing required entailed_evidence_quote'));
  });

  await runTest('AUD-01: REJECTS when entailed_evidence_quote is null or non-string', async () => {
    const solverNullQuote = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_1',
      defensible_option_ids: ['opt_1'],
      reasoning: 'Null quote field',
      entailed_evidence_quote: null
    });
    const res = await verifyCandidateQuestionWithBlindSolver(validCandidate, solverNullQuote);
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.status, 'REJECTED');
    assert.strictEqual(res.rejection_code, 'INSUFFICIENT_EVIDENCE');
  });

  await runTest('AUD-01: REJECTS when entailed_evidence_quote is empty or whitespace-only', async () => {
    for (const emptyQuote of ['', '   ', '\t\n ']) {
      const solverEmptyQuote = async () => ({
        status: 'SOLVED',
        selected_option_id: 'opt_1',
        defensible_option_ids: ['opt_1'],
        reasoning: 'Empty quote',
        entailed_evidence_quote: emptyQuote
      });
      const res = await verifyCandidateQuestionWithBlindSolver(validCandidate, solverEmptyQuote);
      assert.strictEqual(res.is_verified, false);
      assert.strictEqual(res.status, 'REJECTED');
      assert.strictEqual(res.rejection_code, 'INSUFFICIENT_EVIDENCE');
    }
  });

  await runTest('AUD-01: REJECTS when normalized quote is shorter than 15 characters (< 15 chars threshold)', async () => {
    const solverShortQuote = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_1',
      defensible_option_ids: ['opt_1'],
      reasoning: 'Too short quote',
      entailed_evidence_quote: 'القَاهِرَةُ' // 7 characters after Level 1 normalization
    });
    const res = await verifyCandidateQuestionWithBlindSolver(validCandidate, solverShortQuote);
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.status, 'REJECTED');
    assert.strictEqual(res.rejection_code, 'INSUFFICIENT_EVIDENCE');
    assert(res.rejection_reason.includes('too short after normalization'));
  });

  await runTest('AUD-01: REJECTS when quote is >= 15 chars but absent from source passage', async () => {
    const solverAbsentQuote = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_1',
      defensible_option_ids: ['opt_1'],
      reasoning: 'Quote not in text',
      entailed_evidence_quote: 'هذه الجملة تتجاوز خمسة عشر حرفا ولكنها غير موجودة'
    });
    const res = await verifyCandidateQuestionWithBlindSolver(validCandidate, solverAbsentQuote);
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.status, 'REJECTED');
    assert.strictEqual(res.rejection_code, 'UNSUPPORTED_PREMISE');
  });

  await runTest('AUD-01: LIMITATION TEST — Substring presence alone does not establish semantic entailment', async () => {
    // Quote is >= 15 chars and literally present in the passage ("وتعد كبرى مدن القارة الإفريقية"),
    // but mentions demographic size, NOT that Cairo is the capital.
    // If the solver erroneously cites it while claiming Alexandria (opt_2), disagreement gate catches it:
    const solverIrrelevantQuoteDisagreed = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_2',
      defensible_option_ids: ['opt_2'],
      reasoning: 'Using quote about Africa to claim Alexandria',
      entailed_evidence_quote: 'وتعد كبرى مدن القارة الإفريقية'
    });
    const res = await verifyCandidateQuestionWithBlindSolver(validCandidate, solverIrrelevantQuoteDisagreed);
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.rejection_code, 'SOLVER_DISAGREEMENT');
  });

  // ==========================================================================
  // SUITE 5: AUD-02 — SELECTED ANSWER MUST MATCH SOLE DEFENSIBLE ANSWER
  // ==========================================================================
  console.log('\n--- Suite 5: AUD-02 — Sole Defensibility and Selected Match Gate ---');

  await runTest('AUD-02: REJECTS when defensible_option_ids is not an array or malformed', async () => {
    const solverMalformedDefensible = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_1',
      defensible_option_ids: 'opt_1', // Not an array
      reasoning: 'Malformed defensible',
      entailed_evidence_quote: 'القاهرة هي العاصمة السياسية لجمهورية مصر العربية'
    });
    const res = await verifyCandidateQuestionWithBlindSolver(validCandidate, solverMalformedDefensible);
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.rejection_code, 'INVALID_STRUCTURED_OUTPUT');
  });

  await runTest('AUD-02: REJECTS when defensible_option_ids has duplicate IDs', async () => {
    const solverDuplicateDefensible = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_1',
      defensible_option_ids: ['opt_1', 'opt_1'], // Duplicate
      reasoning: 'Duplicate defensible',
      entailed_evidence_quote: 'القاهرة هي العاصمة السياسية لجمهورية مصر العربية'
    });
    const res = await verifyCandidateQuestionWithBlindSolver(validCandidate, solverDuplicateDefensible);
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.rejection_code, 'AMBIGUOUS_OPTIONS');
  });

  await runTest('AUD-02: REJECTS when defensible_option_ids references an invalid/unknown option ID', async () => {
    const solverUnknownDefensible = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_1',
      defensible_option_ids: ['opt_unknown_99'],
      reasoning: 'Unknown defensible',
      entailed_evidence_quote: 'القاهرة هي العاصمة السياسية لجمهورية مصر العربية'
    });
    const res = await verifyCandidateQuestionWithBlindSolver(validCandidate, solverUnknownDefensible);
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.rejection_code, 'INVALID_STRUCTURED_OUTPUT');
  });

  await runTest('AUD-02: REJECTS when defensible_option_ids has multiple valid option IDs', async () => {
    const solverMultiDefensible = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_1',
      defensible_option_ids: ['opt_1', 'opt_2'],
      reasoning: 'Two defensible answers',
      entailed_evidence_quote: 'القاهرة هي العاصمة السياسية لجمهورية مصر العربية'
    });
    const res = await verifyCandidateQuestionWithBlindSolver(validCandidate, solverMultiDefensible);
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.rejection_code, 'AMBIGUOUS_OPTIONS');
  });

  await runTest('AUD-02: REJECTS when selected_option_id matches generator answer but differs from sole defensible option', async () => {
    // Critical test: Generator proposed 'opt_1'. Solver selected 'opt_1', BUT defensible was 'opt_2'!
    const solverSelectedContradictsDefensible = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_1',
      defensible_option_ids: ['opt_2'], // Sole defensible is opt_2
      reasoning: 'Solver selected Cairo but defended Alexandria',
      entailed_evidence_quote: 'القاهرة هي العاصمة السياسية لجمهورية مصر العربية'
    });
    const res = await verifyCandidateQuestionWithBlindSolver(validCandidate, solverSelectedContradictsDefensible);
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.status, 'REJECTED');
    assert.strictEqual(res.rejection_code, 'AMBIGUOUS_OPTIONS');
    assert(res.rejection_reason.includes('contradicts sole defensible_option_id'));
  });

  await runTest('AUD-02: REJECTS when selected_option_id is missing, empty, or not among options', async () => {
    const solverBadSelected = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_non_existent',
      defensible_option_ids: ['opt_1'],
      reasoning: 'Invalid selected ID',
      entailed_evidence_quote: 'القاهرة هي العاصمة السياسية لجمهورية مصر العربية'
    });
    const res = await verifyCandidateQuestionWithBlindSolver(validCandidate, solverBadSelected);
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.rejection_code, 'INSUFFICIENT_EVIDENCE');
  });

  // ==========================================================================
  // SUITE 6: AUD-03 — ARABIC-AWARE DUPLICATE OPTION DETECTION
  // ==========================================================================
  console.log('\n--- Suite 6: AUD-03 — Arabic-Aware Duplicate Option Detection ---');

  await runTest('AUD-03: REJECTS options differing only by Tashkeel (diacritics)', async () => {
    const tashkeelCandidate = {
      ...validCandidate,
      options: [
        { id: 'opt_1', text: 'القاهرة' },
        { id: 'opt_2', text: 'القَاهِرَةُ' }, // Identical under Level 1 normalization
        { id: 'opt_3', text: 'الجيزة' },
        { id: 'opt_4', text: 'أسوان' }
      ]
    };
    const res = await verifyCandidateQuestionWithBlindSolver(tashkeelCandidate, async () => ({}));
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.status, 'REJECTED');
    assert.strictEqual(res.rejection_code, 'INVALID_STRUCTURED_OUTPUT');
    assert(res.rejection_reason.includes('Duplicate option text detected after Arabic normalization'));
  });

  await runTest('AUD-03: REJECTS options differing only by Alef variants (أ, إ, آ, ا)', async () => {
    const alefCandidate = {
      ...validCandidate,
      options: [
        { id: 'opt_1', text: 'الإسكندرية' },
        { id: 'opt_2', text: 'الاسكندرية' }, // Alef variant duplicate
        { id: 'opt_3', text: 'الجيزة' },
        { id: 'opt_4', text: 'أسوان' }
      ],
      proposed_correct_option_id: 'opt_1'
    };
    const res = await verifyCandidateQuestionWithBlindSolver(alefCandidate, async () => ({}));
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.status, 'REJECTED');
    assert.strictEqual(res.rejection_code, 'INVALID_STRUCTURED_OUTPUT');
    assert(res.rejection_reason.includes('Duplicate option text detected after Arabic normalization'));
  });

  await runTest('AUD-03: REJECTS options differing only by Eastern vs Western Arabic numerals', async () => {
    const digitsCandidate = {
      ...validCandidate,
      options: [
        { id: 'opt_1', text: '100 كم' },
        { id: 'opt_2', text: '١٠٠ كم' }, // Digits duplicate
        { id: 'opt_3', text: '200 كم' },
        { id: 'opt_4', text: '300 كم' }
      ],
      proposed_correct_option_id: 'opt_1'
    };
    const res = await verifyCandidateQuestionWithBlindSolver(digitsCandidate, async () => ({}));
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.status, 'REJECTED');
    assert.strictEqual(res.rejection_code, 'INVALID_STRUCTURED_OUTPUT');
    assert(res.rejection_reason.includes('Duplicate option text detected after Arabic normalization'));
  });

  await runTest('AUD-03: REJECTS options differing only by internal whitespace / tabs', async () => {
    const spaceCandidate = {
      ...validCandidate,
      options: [
        { id: 'opt_1', text: 'شبه  جزيرة   سيناء' },
        { id: 'opt_2', text: 'شبه جزيرة سيناء' }, // Whitespace collapsed duplicate
        { id: 'opt_3', text: 'الوادي الجديد' },
        { id: 'opt_4', text: 'مطروح' }
      ],
      proposed_correct_option_id: 'opt_1'
    };
    const res = await verifyCandidateQuestionWithBlindSolver(spaceCandidate, async () => ({}));
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.status, 'REJECTED');
    assert.strictEqual(res.rejection_code, 'INVALID_STRUCTURED_OUTPUT');
  });

  await runTest('AUD-03: PASSES distinct Arabic options preserved by conservative Level 1 rules (ة vs ه, ى vs ي)', async () => {
    const distinctCandidate = {
      ...validCandidate,
      options: [
        { id: 'opt_1', text: 'قضاة' }, // Taa marbuta
        { id: 'opt_2', text: 'قضاه' }, // Haa
        { id: 'opt_3', text: 'رمى' },  // Alef Maqsura
        { id: 'opt_4', text: 'رمي' }   // Yaa
      ],
      proposed_correct_option_id: 'opt_1',
      evidence: {
        ...validCandidate.evidence,
        passage_text: 'قضاة المحكمة الدستورية وقضاه في سياق لغوي مختلف، رمى اللاعب الكرة في رمي سليم ومطابق.'
      }
    };
    const mockSolver = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_1',
      defensible_option_ids: ['opt_1'],
      reasoning: 'Distinct options correctly preserved',
      entailed_evidence_quote: 'قضاة المحكمة الدستورية وقضاه في سياق لغوي مختلف'
    });
    const res = await verifyCandidateQuestionWithBlindSolver(distinctCandidate, mockSolver);
    assert.strictEqual(res.is_verified, true);
    assert.strictEqual(res.status, 'VERIFIED');
  });

  // ==========================================================================
  // SUITE 7: AUD-04 — DETERMINISTIC PERMUTATION & POSITION LEAKAGE PREVENTION
  // ==========================================================================
  console.log('\n--- Suite 7: AUD-04 — Deterministic Option Permutation & Position Neutrality ---');

  await runTest('AUD-04: Solver receives permuted options with stable IDs mapped back to canonical set', async () => {
    const candidateToTest = {
      ...validCandidate,
      options: [
        { id: 'opt_1', text: 'القاهرة' },
        { id: 'opt_2', text: 'الإسكندرية' },
        { id: 'opt_3', text: 'الجيزة' },
        { id: 'opt_4', text: 'أسوان' }
      ]
    };

    const sanitized = sanitizeBlindSolverInput(candidateToTest);

    // Assert options set contains all 4 original IDs and texts
    const inputIds = sanitized.options.map(o => o.id);
    assert.strictEqual(inputIds.length, 4);
    assert.deepStrictEqual([...inputIds].sort(), ['opt_1', 'opt_2', 'opt_3', 'opt_4']);

    // Assert options retain exact text
    for (const opt of sanitized.options) {
      const orig = candidateToTest.options.find(o => o.id === opt.id);
      assert.strictEqual(opt.text, orig.text);
    }
  });

  await runTest('AUD-04: Changing only proposed_correct_option_id NEVER alters the option permutation', async () => {
    const candidateKey1 = {
      ...validCandidate,
      proposed_correct_option_id: 'opt_1'
    };

    const candidateKey2 = {
      ...validCandidate,
      proposed_correct_option_id: 'opt_4' // Different answer key!
    };

    const sanitized1 = sanitizeBlindSolverInput(candidateKey1);
    const sanitized2 = sanitizeBlindSolverInput(candidateKey2);

    // Permuted option IDs and texts MUST be 100% identical
    assert.deepStrictEqual(
      sanitized1.options.map(o => o.id),
      sanitized2.options.map(o => o.id)
    );
    assert.deepStrictEqual(
      sanitized1.options.map(o => o.text),
      sanitized2.options.map(o => o.text)
    );
  });

  await runTest('AUD-04: Original candidate object is strictly immutable (not mutated)', async () => {
    const originalCandidate = JSON.parse(JSON.stringify(validCandidate));
    const candidateCopy = JSON.parse(JSON.stringify(validCandidate));

    sanitizeBlindSolverInput(candidateCopy);

    // Candidate object MUST NOT be mutated in any way
    assert.deepStrictEqual(candidateCopy, originalCandidate);
  });

  await runTest('AUD-04: Solver receives zero answer keys, rationales, or is_correct markers', async () => {
    let capturedSolverInput = null;
    const mockSolver = async (input) => {
      capturedSolverInput = input;
      return {
        status: 'SOLVED',
        selected_option_id: 'opt_1',
        defensible_option_ids: ['opt_1'],
        reasoning: 'Pass',
        entailed_evidence_quote: 'القاهرة هي العاصمة السياسية لجمهورية مصر العربية'
      };
    };

    const res = await verifyCandidateQuestionWithBlindSolver(validCandidate, mockSolver);
    assert.strictEqual(res.is_verified, true);
    assert(capturedSolverInput);
    assert.strictEqual('proposed_correct_option_id' in capturedSolverInput, false);
    assert.strictEqual('rationale' in capturedSolverInput, false);
    for (const opt of capturedSolverInput.options) {
      assert.strictEqual('is_correct' in opt, false);
    }
  });

  console.log('\n================================================================');
  console.log(`PHASE 4G.3B TEST RESULTS: ${passedTests}/${totalTests} PASSED (100%)`);
  console.log('Zero Database Mutations | Zero External AI Calls | Strictly Mocked');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
