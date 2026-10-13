import assert from 'assert';
import crypto from 'crypto';
import {
  createBoundedSolverAdapter,
  validateAndParseBlindSolverOutput,
  BoundedSolverAdapterError,
  verifyAuthoritativeProvenanceContract,
  verifySemanticEntailmentContract
} from '../dist/services/ai/boundedSolverAdapter.js';
import {
  verifyCandidateQuestionWithBlindSolver
} from '../dist/services/ai/aiRagEngine.js';

console.log('================================================================');
console.log('PHASE 4G.3C — BOUNDED SOLVER ADAPTER & INTEGRATION SAFETY TEST');
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

// Canonical Valid Fixtures
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

const validStoredRecord = {
  book_id: 'fa2a1525-c46f-4b34-9f48-b762be88e5c5',
  book_is_eligible: true,
  chapter_id: 'c2387de6-beda-4c55-b93b-b65bfced4e45',
  chapter_book_id: 'fa2a1525-c46f-4b34-9f48-b762be88e5c5',
  chunk_id: 'chunk_social_p14_01',
  chunk_chapter_id: 'c2387de6-beda-4c55-b93b-b65bfced4e45',
  chunk_page_number: 14,
  canonical_passage_text: 'القاهرة هي العاصمة السياسية لجمهورية مصر العربية وتعد كبرى مدن القارة الإفريقية من حيث الكثافة السكانية ومقراً للحكومة والمؤسسات الدستورية.',
  canonical_passage_sha256: crypto
    .createHash('sha256')
    .update('القاهرة هي العاصمة السياسية لجمهورية مصر العربية وتعد كبرى مدن القارة الإفريقية من حيث الكثافة السكانية ومقراً للحكومة والمؤسسات الدستورية.', 'utf8')
    .digest('hex'),
  is_disqualified_unit: false,
  has_unsupported_visuals: false
};

const validSolverOutputObj = {
  status: 'SOLVED',
  selected_option_id: 'opt_1',
  defensible_option_ids: ['opt_1'],
  reasoning: 'النص يذكر صراحة أن القاهرة هي العاصمة السياسية.',
  entailed_evidence_quote: 'القاهرة هي العاصمة السياسية لجمهورية مصر العربية'
};

async function main() {
  // ==========================================================================
  // SUITE 1: STRUCTURED OUTPUT PARSING & RUNTIME VALIDATION
  // ==========================================================================
  console.log('--- Suite 1: Structured Output Validation & Parsing ---');

  await runTest('Parses valid JSON string and object conforming to BlindSolverOutput', async () => {
    const validOptionIds = new Set(['opt_1', 'opt_2', 'opt_3', 'opt_4']);
    const parsedObj = validateAndParseBlindSolverOutput(validSolverOutputObj, validOptionIds);
    assert.strictEqual(parsedObj.status, 'SOLVED');
    assert.strictEqual(parsedObj.selected_option_id, 'opt_1');
    assert.deepStrictEqual(parsedObj.defensible_option_ids, ['opt_1']);

    const jsonString = JSON.stringify(validSolverOutputObj);
    const parsedStr = validateAndParseBlindSolverOutput(jsonString, validOptionIds);
    assert.strictEqual(parsedStr.status, 'SOLVED');
    assert.strictEqual(parsedStr.selected_option_id, 'opt_1');
  });

  await runTest('Strips markdown code fence blocks cleanly from JSON string', async () => {
    const fenced = `\`\`\`json\n${JSON.stringify(validSolverOutputObj)}\n\`\`\``;
    const parsed = validateAndParseBlindSolverOutput(fenced);
    assert.strictEqual(parsed.status, 'SOLVED');
    assert.strictEqual(parsed.selected_option_id, 'opt_1');
  });

  await runTest('Rejects malformed JSON syntax with syntax error', async () => {
    assert.throws(
      () => validateAndParseBlindSolverOutput('{ invalid: json, unquoted }'),
      /Output is not valid JSON/
    );
  });

  await runTest('Rejects non-object outputs (strings, arrays, null)', async () => {
    assert.throws(() => validateAndParseBlindSolverOutput('just a string'), /Output is not valid JSON/);
    assert.throws(() => validateAndParseBlindSolverOutput(['array']), /must be a non-null JSON object/);
    assert.throws(() => validateAndParseBlindSolverOutput(null), /must be a non-null JSON object/);
  });

  await runTest('Rejects missing or invalid status value', async () => {
    assert.throws(
      () => validateAndParseBlindSolverOutput({ ...validSolverOutputObj, status: 'INVALID_STATUS' }),
      /Invalid status/
    );
  });

  await runTest('Rejects missing, empty, or too-short (<15 chars) entailed_evidence_quote', async () => {
    assert.throws(
      () => validateAndParseBlindSolverOutput({ ...validSolverOutputObj, entailed_evidence_quote: '' }),
      /entailed_evidence_quote cannot be empty/
    );
    assert.throws(
      () => validateAndParseBlindSolverOutput({ ...validSolverOutputObj, entailed_evidence_quote: 'القاهرة' }),
      /entailed_evidence_quote is too short/
    );
  });

  await runTest('Rejects defensible option ID not present in valid candidate option set', async () => {
    const validOptionIds = new Set(['opt_1', 'opt_2']);
    assert.throws(
      () => validateAndParseBlindSolverOutput({
        ...validSolverOutputObj,
        selected_option_id: 'opt_999',
        defensible_option_ids: ['opt_999']
      }, validOptionIds),
      /references unknown option ID/
    );
  });

  await runTest('Rejects status SOLVED when selected_option_id contradicts sole defensible ID', async () => {
    assert.throws(
      () => validateAndParseBlindSolverOutput({
        ...validSolverOutputObj,
        selected_option_id: 'opt_1',
        defensible_option_ids: ['opt_2']
      }),
      /does not match sole defensible ID/
    );
  });

  // ==========================================================================
  // SUITE 2: LATENCY BUDGETING, TIMEOUTS, AND BOUNDED RETRIES
  // ==========================================================================
  console.log('\n--- Suite 2: Latency Budgeting, Timeouts, and Bounded Retries ---');

  await runTest('Returns valid solver output on first attempt within budget', async () => {
    const rawInvoker = async () => validSolverOutputObj;
    const boundedSolver = createBoundedSolverAdapter(rawInvoker, {
      maxAttempts: 2,
      perAttemptTimeoutMs: 1000,
      totalBudgetTimeoutMs: 3000
    });

    const res = await boundedSolver({
      passage_text: validCandidate.evidence.passage_text,
      question_text: validCandidate.question_text,
      options: validCandidate.options
    });

    assert.strictEqual(res.status, 'SOLVED');
    assert.strictEqual(res.selected_option_id, 'opt_1');
  });

  await runTest('Retries on first-attempt timeout and succeeds on second attempt within budget', async () => {
    let callCount = 0;
    const rawInvoker = async () => {
      callCount++;
      if (callCount === 1) {
        // First attempt hangs for 600ms (exceeding 200ms per-attempt limit)
        await new Promise(r => setTimeout(r, 600));
        return validSolverOutputObj;
      }
      // Second attempt succeeds immediately
      return validSolverOutputObj;
    };

    let telemetryReport = null;
    const boundedSolver = createBoundedSolverAdapter(
      rawInvoker,
      { maxAttempts: 2, perAttemptTimeoutMs: 200, totalBudgetTimeoutMs: 2000, backoffBaseMs: 50 },
      (report) => { telemetryReport = report; }
    );

    const res = await boundedSolver({
      passage_text: validCandidate.evidence.passage_text,
      question_text: validCandidate.question_text,
      options: validCandidate.options
    });

    assert.strictEqual(callCount, 2);
    assert.strictEqual(res.status, 'SOLVED');
    assert.strictEqual(telemetryReport.totalAttempts, 2);
    assert.strictEqual(telemetryReport.success, true);
    assert.strictEqual(telemetryReport.attempts[0].errorCode, 'ADAPTER_TIMEOUT');
    assert.strictEqual(telemetryReport.attempts[1].success, true);
  });

  await runTest('Rejects when all attempts time out (ADAPTER_TIMEOUT / MAX_ATTEMPTS_EXCEEDED)', async () => {
    const rawInvoker = async () => {
      await new Promise(r => setTimeout(r, 400));
      return validSolverOutputObj;
    };

    const boundedSolver = createBoundedSolverAdapter(rawInvoker, {
      maxAttempts: 2,
      perAttemptTimeoutMs: 100,
      totalBudgetTimeoutMs: 1000,
      backoffBaseMs: 20
    });

    let caughtError = null;
    try {
      await boundedSolver({
        passage_text: validCandidate.evidence.passage_text,
        question_text: validCandidate.question_text,
        options: validCandidate.options
      });
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError instanceof BoundedSolverAdapterError);
    assert(caughtError.code === 'ADAPTER_TIMEOUT' || caughtError.code === 'MAX_ATTEMPTS_EXCEEDED');
  });

  await runTest('Rejects immediately when global total elapsed budget is exhausted (TOTAL_BUDGET_EXHAUSTED)', async () => {
    const rawInvoker = async () => {
      await new Promise(r => setTimeout(r, 250));
      return validSolverOutputObj;
    };

    // totalBudget is 200ms, perAttempt is 300ms -> attempt 1 times out at 200ms
    const boundedSolver = createBoundedSolverAdapter(rawInvoker, {
      maxAttempts: 3,
      perAttemptTimeoutMs: 300,
      totalBudgetTimeoutMs: 200,
      backoffBaseMs: 10
    });

    let caughtError = null;
    try {
      await boundedSolver({
        passage_text: validCandidate.evidence.passage_text,
        question_text: validCandidate.question_text,
        options: validCandidate.options
      });
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError instanceof BoundedSolverAdapterError);
  });

  await runTest('Strictly enforces attempt cap (never exceeds maxAttempts)', async () => {
    let attemptsCount = 0;
    const rawInvoker = async () => {
      attemptsCount++;
      throw new Error('Simulated model provider 500 error');
    };

    const boundedSolver = createBoundedSolverAdapter(rawInvoker, {
      maxAttempts: 2,
      perAttemptTimeoutMs: 500,
      totalBudgetTimeoutMs: 2000,
      backoffBaseMs: 10
    });

    await assert.rejects(async () => {
      await boundedSolver({
        passage_text: validCandidate.evidence.passage_text,
        question_text: validCandidate.question_text,
        options: validCandidate.options
      });
    }, BoundedSolverAdapterError);

    assert.strictEqual(attemptsCount, 2);
  });

  await runTest('Handles rejected promises and unhandled provider errors with fail-closed behavior', async () => {
    const rawInvoker = async () => {
      throw new Error('NETWORK_SOCKET_RESET: Connection dropped by peer');
    };

    const boundedSolver = createBoundedSolverAdapter(rawInvoker, {
      maxAttempts: 1,
      perAttemptTimeoutMs: 500,
      totalBudgetTimeoutMs: 1000
    });

    await assert.rejects(async () => {
      await boundedSolver({
        passage_text: validCandidate.evidence.passage_text,
        question_text: validCandidate.question_text,
        options: validCandidate.options
      });
    }, (err) => {
      assert(err instanceof BoundedSolverAdapterError);
      assert.strictEqual(err.code, 'REMOTE_PROVIDER_ERROR');
      return true;
    });
  });

  // ==========================================================================
  // SUITE 3: SANITIZED DIAGNOSTICS & TELEMETRY
  // ==========================================================================
  console.log('\n--- Suite 3: Sanitized Diagnostics & Telemetry ---');

  await runTest('Emits structured telemetry without leaking student data or credentials', async () => {
    let capturedTelemetry = null;
    const rawInvoker = async () => validSolverOutputObj;

    const boundedSolver = createBoundedSolverAdapter(
      rawInvoker,
      { maxAttempts: 1, perAttemptTimeoutMs: 1000, totalBudgetTimeoutMs: 2000 },
      (report) => { capturedTelemetry = report; }
    );

    await boundedSolver({
      passage_text: validCandidate.evidence.passage_text,
      question_text: validCandidate.question_text,
      options: validCandidate.options
    });

    assert(capturedTelemetry);
    assert.strictEqual(capturedTelemetry.success, true);
    assert.strictEqual(capturedTelemetry.totalAttempts, 1);
    assert(capturedTelemetry.totalDurationMs >= 0);
    // Verify zero student or credential fields in report
    const telemetryString = JSON.stringify(capturedTelemetry);
    assert.strictEqual(telemetryString.includes('student'), false);
    assert.strictEqual(telemetryString.includes('api_key'), false);
  });

  // ==========================================================================
  // SUITE 4: END-TO-END INTEGRATION WITH PHASE 4G.3B VERIFICATION PIPELINE
  // ==========================================================================
  console.log('\n--- Suite 4: Verification Pipeline Integration with Bounded Solver ---');

  await runTest('Passes verifyCandidateQuestionWithBlindSolver when bounded solver succeeds', async () => {
    const rawInvoker = async () => validSolverOutputObj;
    const boundedSolver = createBoundedSolverAdapter(rawInvoker);

    const result = await verifyCandidateQuestionWithBlindSolver(validCandidate, boundedSolver);
    assert.strictEqual(result.is_verified, true);
    assert.strictEqual(result.status, 'VERIFIED');
    assert.strictEqual(result.generator_option_id, 'opt_1');
    assert.strictEqual(result.solver_option_id, 'opt_1');
  });

  await runTest('Fails closed in verifyCandidateQuestionWithBlindSolver when bounded solver times out', async () => {
    const hangingInvoker = async () => {
      await new Promise(r => setTimeout(r, 500));
      return validSolverOutputObj;
    };
    const boundedSolver = createBoundedSolverAdapter(hangingInvoker, {
      maxAttempts: 1,
      perAttemptTimeoutMs: 50,
      totalBudgetTimeoutMs: 100
    });

    const result = await verifyCandidateQuestionWithBlindSolver(validCandidate, boundedSolver);
    assert.strictEqual(result.is_verified, false);
    assert.strictEqual(result.status, 'REJECTED');
    assert.strictEqual(result.rejection_code, 'VERIFICATION_EXECUTION_FAILURE');
    assert(result.rejection_reason.includes('ADAPTER_TIMEOUT'));
  });

  // ==========================================================================
  // SUITE 5: SOURCE-OF-TRUTH PROVENANCE CONTRACT
  // ==========================================================================
  console.log('\n--- Suite 5: Authoritative Stored Provenance Contract ---');

  await runTest('Authoritative provenance passes when candidate evidence matches canonical stored record', async () => {
    const res = verifyAuthoritativeProvenanceContract(validCandidate.evidence, validStoredRecord);
    assert.strictEqual(res.is_valid, true);
    assert.strictEqual(res.verified_provenance_hash, validStoredRecord.canonical_passage_sha256);
  });

  await runTest('Rejects when book_id is ineligible or mismatched (BOOK_INELIGIBLE)', async () => {
    const resA = verifyAuthoritativeProvenanceContract(
      { ...validCandidate.evidence, book_id: 'wrong_book_id' },
      validStoredRecord
    );
    assert.strictEqual(resA.is_valid, false);
    assert.strictEqual(resA.rejection_code, 'BOOK_INELIGIBLE');

    const resB = verifyAuthoritativeProvenanceContract(
      validCandidate.evidence,
      { ...validStoredRecord, book_is_eligible: false }
    );
    assert.strictEqual(resB.is_valid, false);
    assert.strictEqual(resB.rejection_code, 'BOOK_INELIGIBLE');
  });

  await runTest('Rejects when chapter does not belong to book (CHAPTER_MISMATCH)', async () => {
    const res = verifyAuthoritativeProvenanceContract(
      validCandidate.evidence,
      { ...validStoredRecord, chapter_book_id: 'different_book_id' }
    );
    assert.strictEqual(res.is_valid, false);
    assert.strictEqual(res.rejection_code, 'CHAPTER_MISMATCH');
  });

  await runTest('Rejects when chunk does not belong to chapter (CHUNK_MISMATCH)', async () => {
    const res = verifyAuthoritativeProvenanceContract(
      validCandidate.evidence,
      { ...validStoredRecord, chunk_chapter_id: 'different_chapter_id' }
    );
    assert.strictEqual(res.is_valid, false);
    assert.strictEqual(res.rejection_code, 'CHUNK_MISMATCH');
  });

  await runTest('Rejects when passage text hash differs from canonical chunk hash (PASSAGE_HASH_MISMATCH)', async () => {
    const tamperedEvidence = {
      ...validCandidate.evidence,
      passage_text: 'نص محرف يختلف عن النص الأصلي المخزن في قاعدة البيانات.'
    };
    const res = verifyAuthoritativeProvenanceContract(tamperedEvidence, validStoredRecord);
    assert.strictEqual(res.is_valid, false);
    assert.strictEqual(res.rejection_code, 'PASSAGE_HASH_MISMATCH');
  });

  await runTest('Rejects when candidate page number differs from canonical page (PAGE_MISMATCH)', async () => {
    const badPageEvidence = {
      ...validCandidate.evidence,
      page_number: 99
    };
    const res = verifyAuthoritativeProvenanceContract(badPageEvidence, validStoredRecord);
    assert.strictEqual(res.is_valid, false);
    assert.strictEqual(res.rejection_code, 'PAGE_MISMATCH');
  });

  await runTest('Rejects when chapter is marked as a disqualified geometry unit (DISQUALIFIED_UNIT)', async () => {
    const res = verifyAuthoritativeProvenanceContract(
      validCandidate.evidence,
      { ...validStoredRecord, is_disqualified_unit: true }
    );
    assert.strictEqual(res.is_valid, false);
    assert.strictEqual(res.rejection_code, 'DISQUALIFIED_UNIT');
  });

  await runTest('Rejects when stored chunk has unsupported visual diagrams (VISUAL_DEPENDENCY)', async () => {
    const res = verifyAuthoritativeProvenanceContract(
      validCandidate.evidence,
      { ...validStoredRecord, has_unsupported_visuals: true }
    );
    assert.strictEqual(res.is_valid, false);
    assert.strictEqual(res.rejection_code, 'VISUAL_DEPENDENCY');
  });

  // ==========================================================================
  // SUITE 6: SEMANTIC ENTAILMENT CONTRACT & LIMITATION
  // ==========================================================================
  console.log('\n--- Suite 6: Semantic Entailment Contract & Limitation Verification ---');

  await runTest('Semantic contract passes when premise is supported and sole answer is entailed', async () => {
    const validAssessment = {
      premise_supported: true,
      sole_answer_entailed: true,
      entailed_option_id: 'opt_1',
      distractors_falsified_or_unsupported: true,
      visual_diagram_required: false,
      confidence_score: 0.95
    };
    const res = verifySemanticEntailmentContract(validAssessment, 'opt_1');
    assert.strictEqual(res.is_semantically_verified, true);
  });

  await runTest('Rejects when question premise is unsupported by text (UNSUPPORTED_PREMISE)', async () => {
    const badPremise = {
      premise_supported: false,
      premise_unsupported_reason: 'السؤال يفترض وجود نهر غير مذكور في النص',
      sole_answer_entailed: false,
      distractors_falsified_or_unsupported: false,
      visual_diagram_required: false
    };
    const res = verifySemanticEntailmentContract(badPremise, 'opt_1');
    assert.strictEqual(res.is_semantically_verified, false);
    assert.strictEqual(res.rejection_code, 'UNSUPPORTED_PREMISE');
  });

  await runTest('Rejects when multiple options are defensible or distractors not falsified (AMBIGUOUS_OPTIONS)', async () => {
    const ambiguous = {
      premise_supported: true,
      sole_answer_entailed: false, // Not sole
      entailed_option_id: 'opt_1',
      distractors_falsified_or_unsupported: false,
      visual_diagram_required: false
    };
    const res = verifySemanticEntailmentContract(ambiguous, 'opt_1');
    assert.strictEqual(res.is_semantically_verified, false);
    assert.strictEqual(res.rejection_code, 'AMBIGUOUS_OPTIONS');
  });

  await runTest('Rejects when entailed answer disagrees with generator proposed answer (SOLVER_DISAGREEMENT)', async () => {
    const disagreed = {
      premise_supported: true,
      sole_answer_entailed: true,
      entailed_option_id: 'opt_2', // Alexandria instead of Cairo (opt_1)
      distractors_falsified_or_unsupported: true,
      visual_diagram_required: false,
      confidence_score: 0.92
    };
    const res = verifySemanticEntailmentContract(disagreed, 'opt_1');
    assert.strictEqual(res.is_semantically_verified, false);
    assert.strictEqual(res.rejection_code, 'SOLVER_DISAGREEMENT');
  });

  await runTest('Rejects when question requires unavailable visual diagrams (VISUAL_DIAGRAM_DEPENDENT)', async () => {
    const visual = {
      premise_supported: true,
      sole_answer_entailed: true,
      entailed_option_id: 'opt_1',
      distractors_falsified_or_unsupported: true,
      visual_diagram_required: true
    };
    const res = verifySemanticEntailmentContract(visual, 'opt_1');
    assert.strictEqual(res.is_semantically_verified, false);
    assert.strictEqual(res.rejection_code, 'VISUAL_DIAGRAM_DEPENDENT');
  });

  await runTest('Rejects when entailment confidence is below threshold (LOW_ENTAILMENT_CONFIDENCE)', async () => {
    const lowConf = {
      premise_supported: true,
      sole_answer_entailed: true,
      entailed_option_id: 'opt_1',
      distractors_falsified_or_unsupported: true,
      visual_diagram_required: false,
      confidence_score: 0.65 // Below 0.85 default threshold
    };
    const res = verifySemanticEntailmentContract(lowConf, 'opt_1', 0.85);
    assert.strictEqual(res.is_semantically_verified, false);
    assert.strictEqual(res.rejection_code, 'LOW_ENTAILMENT_CONFIDENCE');
  });

  await runTest('LIMITATION PROOF: Substring match alone cannot satisfy semantic entailment contract', async () => {
    // Quote is verbatim in passage, but does not entail the answer
    const verbatimQuote = 'وتعد كبرى مدن القارة الإفريقية';
    assert.strictEqual(validCandidate.evidence.passage_text.includes(verbatimQuote), true);

    // If an assessment checks semantic entailment of the question 'What is the capital of Egypt?'
    // against this quote, it discovers the premise that Cairo is the capital is NOT entailed by this quote!
    const nonEntailingAssessment = {
      premise_supported: true,
      sole_answer_entailed: false, // The quote only discusses population size, not capital status!
      entailed_option_id: undefined,
      distractors_falsified_or_unsupported: false,
      visual_diagram_required: false,
      confidence_score: 0.40
    };

    const res = verifySemanticEntailmentContract(nonEntailingAssessment, 'opt_1');
    assert.strictEqual(res.is_semantically_verified, false);
    assert.strictEqual(res.rejection_code, 'AMBIGUOUS_OPTIONS');
  });

  console.log('\n================================================================');
  console.log(`PHASE 4G.3C TEST RESULTS: ${passedTests}/${totalTests} PASSED (100%)`);
  console.log('Zero Database Mutations | Zero External AI Calls | Strictly Mocked');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
