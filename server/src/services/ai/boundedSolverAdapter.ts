import crypto from 'crypto';
import {
  BlindSolverInput,
  BlindSolverOutput,
  BlindSolverFunction,
  CandidateQuestionPayload,
  DISQUALIFIED_GEOMETRY_CHAPTER_IDS,
  VISUAL_INDICATOR_REGEX
} from './aiRagEngine.js';
import { normalizeArabicLevel1 } from '../answerValidationService.js';
import { VisualAssetExtractor } from './visualAssetExtractor.js';

/**
 * Phase 4G.3C — Bounded Solver Adapter, Latency Budgeting, and Integration Safety Design
 * 
 * Strict Architectural Safeguards:
 * 1. Air-Gapped Solver Invocation: Never passes answer keys, rationale, or is_correct markers.
 * 2. Strict Latency Budgets: Bounded per-attempt timeouts and global elapsed deadlines.
 * 3. Bounded Retry Loops: Hard limit on attempts (max 3), zero infinite loops.
 * 4. Fail-Closed Guarantees: Rejects on any timeout, parse error, or unhandled exception.
 * 5. Sanitized Diagnostics: Emits structured telemetry free of student PII or credentials.
 */

// ============================================================================
// 1. ERROR CODES AND DIAGNOSTIC TYPES
// ============================================================================

export type SolverAdapterErrorCode =
  | 'ADAPTER_TIMEOUT'
  | 'TOTAL_BUDGET_EXHAUSTED'
  | 'MAX_ATTEMPTS_EXCEEDED'
  | 'MALFORMED_OUTPUT'
  | 'REMOTE_PROVIDER_ERROR'
  | 'ABORTED';

export class BoundedSolverAdapterError extends Error {
  public readonly code: SolverAdapterErrorCode;
  public readonly attempt: number;
  public readonly elapsedMs: number;
  public readonly diagnostics: Record<string, any>;

  constructor(
    code: SolverAdapterErrorCode,
    message: string,
    attempt: number,
    elapsedMs: number,
    diagnostics: Record<string, any> = {}
  ) {
    super(`[${code}] (Attempt ${attempt}, ${elapsedMs}ms): ${message}`);
    this.name = 'BoundedSolverAdapterError';
    this.code = code;
    this.attempt = attempt;
    this.elapsedMs = elapsedMs;
    this.diagnostics = diagnostics;
  }
}

export interface BoundedSolverConfig {
  maxAttempts: number;            // Upper-bounded: 1 to 3 attempts
  perAttemptTimeoutMs: number;    // Latency limit per individual attempt (e.g. 5000ms)
  totalBudgetTimeoutMs: number;   // Global latency deadline for all attempts combined (e.g. 12000ms)
  backoffBaseMs?: number;         // Inter-attempt backoff delay (e.g. 100ms)
}

export const DEFAULT_BOUNDED_SOLVER_CONFIG: BoundedSolverConfig = {
  maxAttempts: 2,
  perAttemptTimeoutMs: 5000,
  totalBudgetTimeoutMs: 12000,
  backoffBaseMs: 100
};

export interface SolverAttemptDiagnostic {
  attempt: number;
  durationMs: number;
  success: boolean;
  errorCode?: SolverAdapterErrorCode;
  errorMessage?: string;
}

export interface BoundedSolverExecutionReport {
  totalAttempts: number;
  totalDurationMs: number;
  success: boolean;
  attempts: SolverAttemptDiagnostic[];
  finalErrorCode?: SolverAdapterErrorCode;
}

export type RawSolverInvoker = (
  input: BlindSolverInput,
  signal?: AbortSignal
) => Promise<any>;

// ============================================================================
// 2. STRICT STRUCTURED OUTPUT PARSER AND RUNTIME VALIDATION
// ============================================================================

/**
 * Validates raw solver output against the Phase 4G.3B BlindSolverOutput schema.
 * Rejects malformed JSON, missing fields, invalid statuses, non-string quotes,
 * short quotes (<15 chars), or invalid option references.
 */
export function validateAndParseBlindSolverOutput(
  raw: any,
  validOptionIds?: Set<string>
): BlindSolverOutput {
  let parsed = raw;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    // Strip markdown code fence blocks if present
    const cleanJson = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    try {
      parsed = JSON.parse(cleanJson);
    } catch (err: any) {
      throw new Error(`Output is not valid JSON: ${err.message}`);
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Solver output must be a non-null JSON object');
  }

  const validStatuses = new Set([
    'SOLVED',
    'INSUFFICIENT_EVIDENCE',
    'AMBIGUOUS',
    'UNSUPPORTED_PREMISE',
    'REQUIRES_VISUAL'
  ]);

  if (!validStatuses.has(parsed.status)) {
    throw new Error(`Invalid status: "${parsed.status}". Must be one of [${[...validStatuses].join(', ')}]`);
  }

  if (typeof parsed.reasoning !== 'string' || !parsed.reasoning.trim()) {
    throw new Error('Missing or empty reasoning string');
  }

  // AUD-01: Mandatory entailed_evidence_quote
  if (typeof parsed.entailed_evidence_quote !== 'string') {
    throw new Error('Missing required entailed_evidence_quote string');
  }

  const trimmedQuote = parsed.entailed_evidence_quote.trim();
  if (trimmedQuote.length === 0) {
    throw new Error('entailed_evidence_quote cannot be empty or whitespace');
  }

  const normQuote = normalizeArabicLevel1(trimmedQuote);
  if (normQuote.length < 15) {
    throw new Error(`entailed_evidence_quote is too short (${normQuote.length} < 15 normalized chars)`);
  }

  // AUD-02: Defensible option IDs validation
  if (!Array.isArray(parsed.defensible_option_ids)) {
    throw new Error('defensible_option_ids must be an array');
  }

  const seenDefensible = new Set<string>();
  const cleanDefensibleIds: string[] = [];
  for (const rawId of parsed.defensible_option_ids) {
    if (typeof rawId !== 'string' || !rawId.trim()) {
      throw new Error('defensible_option_ids contains empty or non-string ID');
    }
    const cleanId = rawId.trim();
    if (seenDefensible.has(cleanId)) {
      throw new Error(`defensible_option_ids contains duplicate ID: "${cleanId}"`);
    }
    if (validOptionIds && validOptionIds.size > 0 && !validOptionIds.has(cleanId)) {
      throw new Error(`defensible_option_ids references unknown option ID: "${cleanId}"`);
    }
    seenDefensible.add(cleanId);
    cleanDefensibleIds.push(cleanId);
  }

  let cleanSelectedId: string | undefined = undefined;
  if (parsed.selected_option_id !== undefined && parsed.selected_option_id !== null) {
    if (typeof parsed.selected_option_id !== 'string' || !parsed.selected_option_id.trim()) {
      throw new Error('selected_option_id must be a non-empty string when provided');
    }
    const trimmedSelected = parsed.selected_option_id.trim();
    if (validOptionIds && validOptionIds.size > 0 && !validOptionIds.has(trimmedSelected)) {
      throw new Error(`selected_option_id "${trimmedSelected}" not among valid option IDs`);
    }
    cleanSelectedId = trimmedSelected;
  }

  if (parsed.status === 'SOLVED') {
    if (!cleanSelectedId) {
      throw new Error('Status SOLVED requires a valid selected_option_id');
    }
    if (cleanDefensibleIds.length !== 1) {
      throw new Error(`Status SOLVED requires exactly one defensible option, found ${cleanDefensibleIds.length}`);
    }
    if (cleanSelectedId !== cleanDefensibleIds[0]) {
      throw new Error(`selected_option_id "${cleanSelectedId}" does not match sole defensible ID "${cleanDefensibleIds[0]}"`);
    }
  }

  return {
    status: parsed.status,
    selected_option_id: cleanSelectedId,
    defensible_option_ids: cleanDefensibleIds,
    reasoning: parsed.reasoning.trim(),
    entailed_evidence_quote: trimmedQuote
  };
}

// ============================================================================
// 3. BOUNDED SOLVER ADAPTER (LATENCY BUDGETING & FAIL-CLOSED EXECUTION)
// ============================================================================

/**
 * Creates an air-gapped, bounded blind solver function.
 * Wraps any raw model invoker with strict per-attempt timeouts, global elapsed budgets,
 * retry caps, schema validation, and fail-closed error handling.
 * 
 * LIMITATION WARNING:
 * A client-side timeout rejects the local Promise and aborts downstream execution.
 * It DOES NOT guarantee that a remote cloud AI provider stops server-side GPU execution
 * or ceases billing for tokens generated after client disconnection.
 */
export function createBoundedSolverAdapter(
  rawInvoker: RawSolverInvoker,
  configOverrides?: Partial<BoundedSolverConfig>,
  onTelemetry?: (report: BoundedSolverExecutionReport) => void
): BlindSolverFunction {
  const config: BoundedSolverConfig = {
    maxAttempts: Math.min(Math.max(1, configOverrides?.maxAttempts ?? DEFAULT_BOUNDED_SOLVER_CONFIG.maxAttempts), 3),
    perAttemptTimeoutMs: Math.max(10, configOverrides?.perAttemptTimeoutMs ?? DEFAULT_BOUNDED_SOLVER_CONFIG.perAttemptTimeoutMs),
    totalBudgetTimeoutMs: Math.max(10, configOverrides?.totalBudgetTimeoutMs ?? DEFAULT_BOUNDED_SOLVER_CONFIG.totalBudgetTimeoutMs),
    backoffBaseMs: configOverrides?.backoffBaseMs ?? DEFAULT_BOUNDED_SOLVER_CONFIG.backoffBaseMs
  };

  return async function boundedBlindSolver(input: BlindSolverInput): Promise<BlindSolverOutput> {
    const globalStart = Date.now();
    const attemptsDiagnostics: SolverAttemptDiagnostic[] = [];
    const validOptionIds = new Set((input.options || []).map(o => o.id));

    let lastError: BoundedSolverAdapterError | null = null;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      const elapsedSoFar = Date.now() - globalStart;
      const remainingGlobalBudget = config.totalBudgetTimeoutMs - elapsedSoFar;

      if (remainingGlobalBudget <= 0) {
        lastError = new BoundedSolverAdapterError(
          'TOTAL_BUDGET_EXHAUSTED',
          `Total execution budget of ${config.totalBudgetTimeoutMs}ms exhausted before attempt ${attempt}`,
          attempt,
          elapsedSoFar,
          { totalBudgetTimeoutMs: config.totalBudgetTimeoutMs, attemptsCompleted: attempt - 1 }
        );
        break;
      }

      const attemptBudget = Math.min(config.perAttemptTimeoutMs, remainingGlobalBudget);
      const attemptStart = Date.now();
      const abortController = new AbortController();

      let timeoutHandle: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          abortController.abort();
          reject(new BoundedSolverAdapterError(
            'ADAPTER_TIMEOUT',
            `Attempt ${attempt} timed out after ${attemptBudget}ms (per-attempt limit: ${config.perAttemptTimeoutMs}ms)`,
            attempt,
            Date.now() - attemptStart,
            { attemptBudget, perAttemptTimeoutMs: config.perAttemptTimeoutMs }
          ));
        }, attemptBudget);
      });

      try {
        const rawResult = await Promise.race([
          rawInvoker(input, abortController.signal),
          timeoutPromise
        ]);

        if (timeoutHandle) clearTimeout(timeoutHandle);

        const parsedOutput = validateAndParseBlindSolverOutput(rawResult, validOptionIds);
        const attemptDuration = Date.now() - attemptStart;

        attemptsDiagnostics.push({
          attempt,
          durationMs: attemptDuration,
          success: true
        });

        if (onTelemetry) {
          onTelemetry({
            totalAttempts: attempt,
            totalDurationMs: Date.now() - globalStart,
            success: true,
            attempts: attemptsDiagnostics
          });
        }

        return parsedOutput;
      } catch (err: any) {
        if (timeoutHandle) clearTimeout(timeoutHandle);

        const attemptDuration = Date.now() - attemptStart;
        let mappedCode: SolverAdapterErrorCode = 'REMOTE_PROVIDER_ERROR';

        if (err instanceof BoundedSolverAdapterError) {
          mappedCode = err.code;
        } else if (err.name === 'AbortError' || abortController.signal.aborted) {
          mappedCode = 'ADAPTER_TIMEOUT';
        } else if (String(err.message || '').includes('JSON') || String(err.message || '').includes('status') || String(err.message || '').includes('quote')) {
          mappedCode = 'MALFORMED_OUTPUT';
        }

        const diagnosticError = new BoundedSolverAdapterError(
          mappedCode,
          err.message || 'Unknown solver invocation error',
          attempt,
          attemptDuration,
          { rawErrorMessage: err.message, attempt }
        );

        attemptsDiagnostics.push({
          attempt,
          durationMs: attemptDuration,
          success: false,
          errorCode: mappedCode,
          errorMessage: err.message
        });

        lastError = diagnosticError;

        // If overall budget is exhausted or this was the last attempt, do not retry
        const totalElapsed = Date.now() - globalStart;
        if (attempt >= config.maxAttempts || (config.totalBudgetTimeoutMs - totalElapsed) <= 200) {
          break;
        }

        // Bounded inter-attempt backoff delay
        const backoffMs = Math.min((config.backoffBaseMs || 100) * attempt, 300);
        await new Promise(res => setTimeout(res, backoffMs));
      }
    }

    const finalReport: BoundedSolverExecutionReport = {
      totalAttempts: attemptsDiagnostics.length,
      totalDurationMs: Date.now() - globalStart,
      success: false,
      attempts: attemptsDiagnostics,
      finalErrorCode: lastError?.code || 'MAX_ATTEMPTS_EXCEEDED'
    };

    if (onTelemetry) {
      onTelemetry(finalReport);
    }

    throw (
      lastError ||
      new BoundedSolverAdapterError(
        'MAX_ATTEMPTS_EXCEEDED',
        `Solver failed all ${config.maxAttempts} attempts without producing a valid defensible answer`,
        config.maxAttempts,
        Date.now() - globalStart,
        { attemptsDiagnostics }
      )
    );
  };
}

// ============================================================================
// 4. SOURCE-OF-TRUTH INTEGRATION CONTRACT
// ============================================================================

/**
 * Authoritative Canonical Textbook Record.
 * Represents verified ground-truth stored in the database.
 * The candidate's evidence MUST be strictly validated against this record
 * before the verifier can authoritatively approve an exam question.
 */
export interface AuthoritativeStoredSourceRecord {
  book_id: string;
  book_is_eligible: boolean;
  chapter_id: string;
  chapter_book_id: string;
  chunk_id: string;
  chunk_chapter_id: string;
  chunk_page_number: number;
  canonical_passage_text: string;
  canonical_passage_sha256: string;
  is_disqualified_unit: boolean;
  has_unsupported_visuals: boolean;
}

export type AuthoritativeProvenanceRejectionCode =
  | 'BOOK_INELIGIBLE'
  | 'CHAPTER_MISMATCH'
  | 'CHUNK_MISMATCH'
  | 'PASSAGE_HASH_MISMATCH'
  | 'PAGE_MISMATCH'
  | 'DISQUALIFIED_UNIT'
  | 'VISUAL_DEPENDENCY';

export interface AuthoritativeProvenanceVerificationResult {
  is_valid: boolean;
  rejection_code?: AuthoritativeProvenanceRejectionCode;
  rejection_reason?: string;
  verified_provenance_hash?: string;
}

/**
 * Validates candidate evidence against canonical stored database records.
 * Fails closed on any inconsistency between candidate claims and stored truth.
 * 
 * NOTE: Structural checks on candidate payload alone DO NOT constitute provenance verification.
 * True provenance verification requires comparing candidate claims with this authoritative contract.
 */
export function verifyAuthoritativeProvenanceContract(
  candidateEvidence: CandidateQuestionPayload['evidence'],
  storedRecord: AuthoritativeStoredSourceRecord
): AuthoritativeProvenanceVerificationResult {
  if (!candidateEvidence || typeof candidateEvidence !== 'object') {
    return {
      is_valid: false,
      rejection_code: 'CHUNK_MISMATCH',
      rejection_reason: 'Evidence object is missing from candidate payload'
    };
  }

  // 1. Book Existence and Eligibility
  if (candidateEvidence.book_id !== storedRecord.book_id || !storedRecord.book_is_eligible) {
    return {
      is_valid: false,
      rejection_code: 'BOOK_INELIGIBLE',
      rejection_reason: `Book "${candidateEvidence.book_id}" is ineligible or does not match stored record "${storedRecord.book_id}"`
    };
  }

  // 2. Chapter Membership in Selected Book
  if (
    candidateEvidence.chapter_id !== storedRecord.chapter_id ||
    storedRecord.chapter_book_id !== storedRecord.book_id
  ) {
    return {
      is_valid: false,
      rejection_code: 'CHAPTER_MISMATCH',
      rejection_reason: `Chapter "${candidateEvidence.chapter_id}" does not belong to book "${storedRecord.book_id}"`
    };
  }

  // 3. Chunk Membership in Selected Chapter
  if (
    candidateEvidence.chunk_id !== storedRecord.chunk_id ||
    storedRecord.chunk_chapter_id !== storedRecord.chapter_id
  ) {
    return {
      is_valid: false,
      rejection_code: 'CHUNK_MISMATCH',
      rejection_reason: `Chunk "${candidateEvidence.chunk_id}" does not belong to chapter "${storedRecord.chapter_id}"`
    };
  }

  // 4. Disqualified Unit Check
  const hasVerifiedAssets = VisualAssetExtractor.getAssetsForChapter(candidateEvidence.book_id, candidateEvidence.chapter_id).length > 0;
  if (storedRecord.is_disqualified_unit || (DISQUALIFIED_GEOMETRY_CHAPTER_IDS.has(candidateEvidence.chapter_id) && !hasVerifiedAssets)) {
    return {
      is_valid: false,
      rejection_code: 'DISQUALIFIED_UNIT',
      rejection_reason: `Chapter "${candidateEvidence.chapter_id}" is marked as a disqualified curriculum unit`
    };
  }

  // 5. Canonical Page Number Consistency
  if (Number(candidateEvidence.page_number) !== storedRecord.chunk_page_number) {
    return {
      is_valid: false,
      rejection_code: 'PAGE_MISMATCH',
      rejection_reason: `Candidate page ${candidateEvidence.page_number} does not match canonical page ${storedRecord.chunk_page_number}`
    };
  }

  // 6. Passage Text Correspondence (SHA-256 Hash Matching)
  const candidatePassageHash = crypto
    .createHash('sha256')
    .update(String(candidateEvidence.passage_text || '').trim(), 'utf8')
    .digest('hex');

  if (candidatePassageHash !== storedRecord.canonical_passage_sha256) {
    return {
      is_valid: false,
      rejection_code: 'PASSAGE_HASH_MISMATCH',
      rejection_reason: 'Candidate passage text hash does not match canonical stored chunk passage hash'
    };
  }

  // 7. Visual Dependency Check
  if (
    storedRecord.has_unsupported_visuals ||
    VISUAL_INDICATOR_REGEX.test(storedRecord.canonical_passage_text)
  ) {
    return {
      is_valid: false,
      rejection_code: 'VISUAL_DEPENDENCY',
      rejection_reason: 'Stored chunk references visual diagrams, figures, or maps not available for blind evaluation'
    };
  }

  return {
    is_valid: true,
    verified_provenance_hash: candidatePassageHash
  };
}

// ============================================================================
// 5. SEMANTIC ENTAILMENT VERIFICATION CONTRACT
// ============================================================================

/**
 * Structured assessment of semantic entailment between source passage and question.
 * Addresses the critical limitation that substring quote presence is not semantic proof.
 */
export interface SemanticEntailmentAssessment {
  premise_supported: boolean;
  premise_unsupported_reason?: string;
  sole_answer_entailed: boolean;
  entailed_option_id?: string;
  distractors_falsified_or_unsupported: boolean;
  visual_diagram_required: boolean;
  confidence_score?: number; // Normalized 0.0 - 1.0
  entailment_notes?: string;
}

export type SemanticRejectionCode =
  | 'UNSUPPORTED_PREMISE'
  | 'AMBIGUOUS_OPTIONS'
  | 'SOLVER_DISAGREEMENT'
  | 'VISUAL_DIAGRAM_DEPENDENT'
  | 'LOW_ENTAILMENT_CONFIDENCE';

export interface SemanticVerificationResult {
  is_semantically_verified: boolean;
  rejection_code?: SemanticRejectionCode;
  rejection_reason?: string;
}

/**
 * Evaluates semantic entailment assessment against proposed correct answer.
 * Rejects questions containing unsupported assumptions, multiple defensible answers,
 * visual dependencies, or insufficient entailment confidence.
 * 
 * CORRELATED MODEL ERROR WARNING:
 * A second LLM is not an infallible ground truth. Two LLMs can share identical inductive
 * biases, background training corpus artifacts, or hallucination patterns.
 * High agreement between two models DOES NOT replace an independently labeled human benchmark.
 */
export function verifySemanticEntailmentContract(
  assessment: SemanticEntailmentAssessment,
  proposedCorrectOptionId: string,
  minConfidenceThreshold: number = 0.85
): SemanticVerificationResult {
  if (!assessment || typeof assessment !== 'object') {
    return {
      is_semantically_verified: false,
      rejection_code: 'UNSUPPORTED_PREMISE',
      rejection_reason: 'Semantic entailment assessment object is missing'
    };
  }

  // 1. Diagram Dependency Check
  if (assessment.visual_diagram_required) {
    return {
      is_semantically_verified: false,
      rejection_code: 'VISUAL_DIAGRAM_DEPENDENT',
      rejection_reason: 'Question requires unavailable visual diagrams or maps'
    };
  }

  // 2. Question Premise Support
  if (!assessment.premise_supported) {
    return {
      is_semantically_verified: false,
      rejection_code: 'UNSUPPORTED_PREMISE',
      rejection_reason: assessment.premise_unsupported_reason || 'Question premise relies on assumptions unsupported by the passage'
    };
  }

  // 3. Sole Answer Entailment
  if (!assessment.sole_answer_entailed || !assessment.entailed_option_id) {
    return {
      is_semantically_verified: false,
      rejection_code: 'AMBIGUOUS_OPTIONS',
      rejection_reason: 'Passage does not definitively entail exactly one single option'
    };
  }

  // 4. Distractor Non-Entailment Check
  if (!assessment.distractors_falsified_or_unsupported) {
    return {
      is_semantically_verified: false,
      rejection_code: 'AMBIGUOUS_OPTIONS',
      rejection_reason: 'One or more distractors could be defensible based on the text'
    };
  }

  // 5. Entailed Answer Agreement with Generator
  if (assessment.entailed_option_id !== proposedCorrectOptionId) {
    return {
      is_semantically_verified: false,
      rejection_code: 'SOLVER_DISAGREEMENT',
      rejection_reason: `Entailed option "${assessment.entailed_option_id}" does not match proposed answer "${proposedCorrectOptionId}"`
    };
  }

  // 6. Entailment Confidence Threshold
  if (assessment.confidence_score !== undefined && assessment.confidence_score < minConfidenceThreshold) {
    return {
      is_semantically_verified: false,
      rejection_code: 'LOW_ENTAILMENT_CONFIDENCE',
      rejection_reason: `Entailment confidence ${assessment.confidence_score} is below threshold ${minConfidenceThreshold}`
    };
  }

  return {
    is_semantically_verified: true
  };
}
