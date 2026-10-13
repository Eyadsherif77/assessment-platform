import fs from 'fs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/db.js';
import { generateEmbedding, cosineSimilarity } from './vectorEmbedding.js';
import { cleanArabicText, stripDocumentMetadataAndStructure } from '../../utils/arabicTextNormalizer.js';
import { GeminiClient } from './geminiClient.js';
import { AnswerValidationService, normalizeArabicLevel1 } from '../answerValidationService.js';
import { createBoundedSolverAdapter, RawSolverInvoker } from './boundedSolverAdapter.js';
import { VisualAssetExtractor } from './visualAssetExtractor.js';

export interface RetrievedChunk {
  id: string;
  book_id: string;
  chapter_id: string;
  page_number: number;
  chunk_index: number;
  content: string;
  metadata: any;
  similarity?: number;
}

export interface GroundedQuestion {
  id: string;
  chunk_id: string;
  book_id: string;
  chapter_id: string;
  question_text: string;
  options: { id: string; text: string; is_correct: boolean }[];
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  bloom_level: 'KNOWLEDGE' | 'UNDERSTANDING' | 'APPLICATION' | 'ANALYSIS' | string;
  page_reference: number;
  source_excerpt: string;
  explanation: string;
  // Visual evidence integration (Phase 4G.3J)
  diagram_url?: string;
  diagram_asset_id?: string;
  has_visual_dependency?: boolean;
  // AI Assessment Debug Inspection Fields (Development Only)
  chunk_text?: string;
  similarity_score?: number;
  validation_status?: { isValid: boolean; reason?: string };
}

export interface QualityScoreResult {
  isValid: boolean;
  relevanceScore: number;       // Target: >= 90%
  educationalValue: number;      // Target: >= 90%
  metadataPresence: number;      // Target: 0%
  isDuplicate: boolean;          // Target: false (0% duplicate)
  reason?: string;
}

/**
 * Teacher Quality Score Evaluator:
 * - Relevance Score >= 90%
 * - Educational Value >= 90%
 * - Metadata Presence = 0%
 * - Duplicate Questions = 0%
 * 
 * Rejects any question containing AI boilerplate ("according to the text", "وفقاً للنص"),
 * structural references (page, chapter, unit, lesson), excessive option length (> 12 words),
 * or non-educational content.
 */
export function evaluateQuestionQuality(
  q: GroundedQuestion,
  existingQuestions: GroundedQuestion[] = [],
  contextWords: Set<string> = new Set()
): QualityScoreResult {
  if (!q.question_text || q.question_text.trim().length < 12) {
    return {
      isValid: false,
      relevanceScore: 0,
      educationalValue: 0,
      metadataPresence: 0,
      isDuplicate: false,
      reason: 'Question text is missing or too short'
    };
  }

  // 1. Duplicate check (Duplicate Questions = 0%)
  const qNorm = q.question_text.trim().toLowerCase().replace(/[؟\?\.\!]/g, '');
  const isDup = existingQuestions.some(eq => {
    if (eq.id === q.id) return false;
    const eqNorm = eq.question_text.trim().toLowerCase().replace(/[؟\?\.\!]/g, '');
    return eqNorm === qNorm;
  });

  if (isDup) {
    return {
      isValid: false,
      relevanceScore: 0,
      educationalValue: 0,
      metadataPresence: 0,
      isDuplicate: true,
      reason: 'Duplicate question detected (fails 0% duplicate rule)'
    };
  }

  // 2. Metadata Presence (Target: 0%)
  const forbiddenPatterns: RegExp[] = [
    /\bpage\b/i,
    /\bpages\b/i,
    /\bchapter\b/i,
    /\bchapters\b/i,
    /\blesson\b/i,
    /\blessons\b/i,
    /\bunit\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i,
    /\bunits\s+\d+/i,
    /\bcurriculum\s+unit\b/i,
    /\bsection\b/i,
    /\bsections\b/i,
    /\btitle\b/i,
    /\bheading\b/i,
    /\bheadings\b/i,
    /\bmetadata\b/i,
    /\btable\s+of\s+contents\b/i,
    /\bdocument\s+structure\b/i,
    /\bfile\s+name\b/i,
    // AI-style wording forbidden by Teacher Quality Rules
    /according\s+to\s+the\s+text/i,
    /based\s+on\s+the\s+(?:provided\s+)?content/i,
    /from\s+the\s+passage/i,
    /as\s+mentioned\s+in\s+the\s+lesson/i,
    /as\s+stated\s+above/i,
    /in\s+the\s+text\s+above/i,
    // Arabic structural & metadata tokens
    /صفحة/,
    /صفحات/,
    /رقم\s+الصفحة/,
    /الفصل\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|\d+)/,
    /فصل\s+\d+/,
    /الدرس\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|\d+)/,
    /درس\s+\d+/,
    /الوحدة\s+(?:الأولى|الثانية|الثالثة|الرابعة|\d+)/,
    /وحدة\s+\d+/,
    /المبحث\s+(?:الأول|الثاني|\d+)/,
    /عنوان\s+(?:الدرس|الفصل|الوحدة|الكتاب)/,
    /في\s+أي\s+صفحة/,
    /ما\s+رقم\s+صفحة/,
    /فهرس/,
    /المحتويات/,
    // Arabic AI-style wording forbidden by Teacher Quality Rules
    /وفق(?:اً|ا)?\s+للنص/,
    /بناء(?:ً|ا)?\s+على\s+(?:المحتوى|ما\s+ورد)/,
    /من\s+الفقرة\s+السابقة/,
    /كما\s+ورد\s+في\s+الدرس/,
    /أي\s+من\s+العبارات\s+(?:الآتية|التالية)\s+حقيقة\s+مذكورة/,
    /المذكور\s+أعلاه/,
    /من\s+خلال\s+دراستك\s+للنص/,
    // Colloquial / Slang / Dialect expressions forbidden in official schools (Modern Standard Arabic only)
    /(?:^|\s)(?:جامدة|حلوة|شاطر|شاطرة|كدا|كدة|عشان|علشان|إيه|ايه|ليه|أوي|قوي|بتاع|بتاعة|دلوقتي|برضه|برضو|ازاي|إزاي|مش|أهو|اهو)(?:$|\s|[؟\.\!,])/i
  ];

  const textsToCheck = [
    q.question_text,
    ...(q.options || []).map(o => o.text),
    q.explanation || ''
  ];

  let foundMetadataTerm = '';
  for (const text of textsToCheck) {
    if (!text) continue;
    for (const rx of forbiddenPatterns) {
      if (rx.test(text)) {
        foundMetadataTerm = rx.toString();
        break;
      }
    }
    if (foundMetadataTerm) break;
  }

  const metadataPresence = foundMetadataTerm ? 100 : 0;
  if (metadataPresence > 0) {
    return {
      isValid: false,
      relevanceScore: 80,
      educationalValue: 40,
      metadataPresence: 100,
      isDuplicate: false,
      reason: `Metadata or AI boilerplate detected matching ${foundMetadataTerm}`
    };
  }

  // 3. Educational Value (Target: >= 90%)
  if (!q.options || q.options.length < 2) {
    return {
      isValid: false,
      relevanceScore: 50,
      educationalValue: 0,
      metadataPresence: 0,
      isDuplicate: false,
      reason: 'Question must have at least 2 options'
    };
  }

  const correctCount = q.options.filter(o => o.is_correct).length;
  if (correctCount !== 1) {
    return {
      isValid: false,
      relevanceScore: 50,
      educationalValue: 0,
      metadataPresence: 0,
      isDuplicate: false,
      reason: `Must have exactly 1 correct option, got ${correctCount}`
    };
  }

  let eduScore = 100;

  // Teacher Rule: Options must be concise (max 8 words preferred, penalty if > 12 words)
  let longOptions = 0;
  for (const opt of q.options) {
    const wordCount = opt.text.trim().split(/\s+/).length;
    if (wordCount > 12) longOptions++;
  }
  if (longOptions > 0) {
    eduScore -= 12; // Deduct for verbose options
  }

  // Teacher Rule: Question text must test understanding (definitions, reasoning, cause/effect, problem-solving)
  const normalizedQStem = (q.question_text || '').replace(/[\u064B-\u065F\u0670]/g, '');
  const isTeacherStem = /ما|علل|احسب|متى|أي|لماذا|كيف|وضح|اذكر|إذا|ماذا يحدث|what|why|which|how|calculate|if/i.test(normalizedQStem);
  if (!isTeacherStem) {
    eduScore -= 12;
  }

  // 4. Relevance Score (Target: >= 90%)
  let relScore = 95;
  if (contextWords.size >= 25) {
    const qTokens = q.question_text.toLowerCase().split(/[^\w\u0600-\u06FF]+/).filter(w => w.length > 2);
    const matches = qTokens.filter(w => contextWords.has(w)).length;
    if (qTokens.length > 0 && matches === 0) {
      relScore = 70;
    }
  }

  const isValid = metadataPresence === 0 && eduScore >= 90 && relScore >= 90 && !isDup;

  return {
    isValid,
    relevanceScore: relScore,
    educationalValue: eduScore,
    metadataPresence: 0,
    isDuplicate: false,
    reason: isValid ? undefined : `Failed teacher quality thresholds (Edu: ${eduScore}%, Rel: ${relScore}%, Meta: ${metadataPresence}%)`
  };
}

export function validateEducationalQuestion(q: GroundedQuestion): { isValid: boolean; reason?: string } {
  const result = evaluateQuestionQuality(q);
  return { isValid: result.isValid, reason: result.reason };
}

/**
 * Strict Provenance Validator:
 * Confirms that the question's recorded page_reference exists in book_pages,
 * and that the page's actual extracted text contains supporting evidence (key concepts or correct answer).
 */
export async function verifyQuestionProvenance(
  q: GroundedQuestion,
  bookId: string
): Promise<{ isVerified: boolean; reason?: string }> {
  if (!bookId) {
    return { isVerified: false, reason: 'Missing bookId' };
  }

  // 1. Authoritative Book Matching: Question must belong to the requested book
  if (q.book_id && q.book_id !== bookId) {
    return { isVerified: false, reason: `BOOK_MISMATCH: Question book_id '${q.book_id}' does not match requested book '${bookId}'` };
  }

  // 2. Page reference must exist and be positive
  if (!q.page_reference || q.page_reference <= 0) {
    return { isVerified: false, reason: 'Missing page_reference' };
  }

  // 3. Chapter scope validation if chapter_id is specified
  if (q.chapter_id) {
    const chRes = await db.query(
      'SELECT id, start_page, end_page FROM book_chapters WHERE id = $1 AND book_id = $2',
      [q.chapter_id, bookId]
    );
    if (chRes.rows.length === 0) {
      return { isVerified: false, reason: `CHAPTER_NOT_FOUND_IN_BOOK: Chapter ${q.chapter_id} does not belong to book ${bookId}` };
    }
  }

  // 4. Source Chunk cross-validation if chunk_id is specified
  let chunkContent = '';
  if (q.chunk_id) {
    const chunkRes = await db.query(
      'SELECT id, book_id, chapter_id, page_number, content FROM book_chunks WHERE id = $1 AND book_id = $2',
      [q.chunk_id, bookId]
    );
    if (chunkRes.rows.length === 0) {
      return { isVerified: false, reason: `CHUNK_NOT_FOUND: Chunk ${q.chunk_id} does not belong to book ${bookId}` };
    }
    const chunkRow = chunkRes.rows[0];
    if (Number(chunkRow.page_number) !== Number(q.page_reference)) {
      return {
        isVerified: false,
        reason: `CONTRADICTORY_PROVENANCE: Question specifies page ${q.page_reference} but referenced chunk ${q.chunk_id} belongs to page ${chunkRow.page_number}`
      };
    }
    if (q.chapter_id && chunkRow.chapter_id && chunkRow.chapter_id !== q.chapter_id) {
      return {
        isVerified: false,
        reason: `CHUNK_CHAPTER_MISMATCH: Chunk ${q.chunk_id} chapter (${chunkRow.chapter_id}) does not match question chapter (${q.chapter_id})`
      };
    }
    chunkContent = chunkRow.content || '';
  }

  // 5. Source Page existence verification
  const pageRes = await db.query(
    'SELECT raw_text FROM book_pages WHERE book_id = $1 AND page_number = $2',
    [bookId, q.page_reference]
  );

  if (pageRes.rows.length === 0 || !pageRes.rows[0].raw_text) {
    return { isVerified: false, reason: `Page ${q.page_reference} does not exist in book_pages for book ${bookId}` };
  }

  const normalizeForProvenance = (s: string) => (s || '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // remove Arabic tashkeel & tatweel
    .replace(/[إأآا]/g, 'ا') // normalize alef variants
    .replace(/ة/g, 'ه') // normalize taa marbuta
    .replace(/ى/g, 'ي') // normalize alef maksura / yaa
    .toLowerCase();

  const rawPageText = pageRes.rows[0].raw_text || '';
  const combinedRaw = `${chunkContent} ${rawPageText}`;
  const pageText = normalizeForProvenance(combinedRaw);

  // Expanded Arabic educational stop-words list
  const stopWords = new Set([
    'what', 'which', 'where', 'when', 'from', 'with', 'that', 'this', 'have', 'does',
    'ماذا', 'لماذا', 'كيف', 'أين', 'متى', 'الذي', 'التي', 'الذين', 'اللاتي', 'منها',
    'إلى', 'على', 'عن', 'في', 'من', 'مع', 'هذا', 'هذه', 'تلك', 'ذلك', 'كذلك', 'أنه',
    'أنها', 'كان', 'كانت', 'يكون', 'تكون', 'منهج', 'الدراسات', 'الاجتماعية', 'العلوم',
    'الصف', 'الثالث', 'الإعدادي', 'الأول', 'الثاني', 'المصري', 'المصرية', 'الوطنية',
    'التعليم', 'الكتاب', 'الوحدة', 'الدرس', 'العام', 'الدراسي', 'سؤال', 'أجب', 'بين',
    'أحد', 'أهم', 'خلال', 'بعد', 'قبل', 'عام', 'عصر', 'أدى', 'ترتب', 'الدولة', 'الدول',
    'الأوروبية', 'الأوروبي', 'البلاد', 'العالم', 'تاريخ', 'جغرافيا', 'الأخرى', 'قامت', 'وقامت'
  ]);

  // 1. Extract significant question keywords (> 2 chars)
  const qWords = normalizeForProvenance(q.question_text || '')
    .split(/[^\w\u0600-\u06FF]+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  const matchedQWords = qWords.filter(w => pageText.includes(w));

  // Also check if any bigram (2 consecutive non-stop words) from question appears in page
  let hasBigramMatch = false;
  for (let i = 0; i < qWords.length - 1; i++) {
    const bigram = `${qWords[i]} ${qWords[i + 1]}`;
    if (pageText.includes(bigram)) {
      hasBigramMatch = true;
      break;
    }
  }

  // 2. Extract correct answer and evaluate its presence on the page
  const correctOpt = q.options?.find(o => o.is_correct)?.text || '';
  if (!correctOpt) {
    return { isVerified: false, reason: 'Question has no correct option defined' };
  }

  const normalizedCorrectOpt = normalizeForProvenance(correctOpt).trim();
  const ansWords = normalizedCorrectOpt
    .split(/[^\w\u0600-\u06FF]+/)
    .filter(w => w.length > 1 && !stopWords.has(w));

  const matchedAnsWords = ansWords.filter(w => pageText.includes(w));
  
  // Exact phrase match or >= 60% of distinctive answer words must appear
  const exactAnswerMatch = pageText.includes(normalizedCorrectOpt);
  const partialAnswerMatch = ansWords.length > 0 && (matchedAnsWords.length / ansWords.length) >= 0.6;
  const isAnswerSupported = exactAnswerMatch || partialAnswerMatch;

  // Rule 1: The correct answer MUST be supported by the page/chunk text
  if (!isAnswerSupported) {
    return {
      isVerified: false,
      reason: `Answer "${correctOpt}" is NOT supported on page ${q.page_reference} (matched words: ${matchedAnsWords.join(', ') || 'none'})`
    };
  }

  // Rule 2: The question's topic/premise MUST have sufficient distinct support:
  // Must either have a verbatim bigram match OR at least 50% keyword match with minimum 2 keywords
  const qCoverageRatio = qWords.length > 0 ? (matchedQWords.length / qWords.length) : 0;
  if (!hasBigramMatch && (matchedQWords.length < 2 || qCoverageRatio < 0.4)) {
    return {
      isVerified: false,
      reason: `Question premise is unsupported on page ${q.page_reference}: matched [${matchedQWords.join(', ') || 'none'}] out of [${qWords.join(', ')}] (coverage: ${Math.round(qCoverageRatio * 100)}%, bigram match: false)`
    };
  }

  // Rule 3: Guard against isolated generic answer words (proximity check)
  // If answer is 1 word/number, it must appear within reasonable proximity of at least one matched question keyword
  if (ansWords.length <= 1) {
    const targetTerm = ansWords[0] || normalizedCorrectOpt;
    const targetIndices: number[] = [];
    let startIdx = 0;
    while (startIdx < pageText.length) {
      const idx = pageText.indexOf(targetTerm, startIdx);
      if (idx === -1) break;
      targetIndices.push(idx);
      startIdx = idx + Math.max(1, targetTerm.length);
    }

    let hasCloseQWord = false;
    const maxProximity = 800; // Allows for multi-line derivations and exercise columns
    for (const qw of matchedQWords) {
      let qStartIdx = 0;
      while (qStartIdx < pageText.length) {
        const qIdx = pageText.indexOf(qw, qStartIdx);
        if (qIdx === -1) break;
        for (const tIdx of targetIndices) {
          if (Math.abs(qIdx - tIdx) <= maxProximity) {
            hasCloseQWord = true;
            break;
          }
        }
        if (hasCloseQWord) break;
        qStartIdx = qIdx + Math.max(1, qw.length);
      }
      if (hasCloseQWord) break;
    }

    if (!hasCloseQWord) {
      return {
        isVerified: false,
        reason: `Answer "${correctOpt}" is disconnected from question subject on page ${q.page_reference} (distance > ${maxProximity} chars)`
      };
    }
  }

  return { isVerified: true };
}

// ============================================================================
// PHASE 4G.3B — INDEPENDENT GENERATOR AND BLIND SOLVER AUDITOR PIPELINE
// ============================================================================

export interface CandidateQuestionPayload {
  id?: string;
  question_text: string;
  options: Array<{ id: string; text: string }>;
  proposed_correct_option_id: string;
  evidence: {
    book_id: string;
    chapter_id: string;
    page_number: number;
    chunk_id: string;
    passage_text: string;
  };
  rationale?: string;
  // Visual evidence integration (Phase 4G.3J)
  diagram_url?: string;
  diagram_asset_id?: string;
  has_visual_dependency?: boolean;
}

export interface BlindSolverInput {
  passage_text: string;
  question_text: string;
  options: Array<{ id: string; text: string }>;
  diagram_url?: string;
  diagram_asset_id?: string;
}

export interface BlindSolverOutput {
  status: 'SOLVED' | 'INSUFFICIENT_EVIDENCE' | 'AMBIGUOUS' | 'UNSUPPORTED_PREMISE' | 'REQUIRES_VISUAL';
  selected_option_id?: string;
  defensible_option_ids: string[];
  reasoning: string;
  entailed_evidence_quote: string;
}

export type BlindSolverFunction = (input: BlindSolverInput) => Promise<BlindSolverOutput>;

export type VerificationRejectionCode =
  | 'INVALID_STRUCTURED_OUTPUT'
  | 'UNSUPPORTED_PREMISE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'AMBIGUOUS_OPTIONS'
  | 'SOLVER_DISAGREEMENT'
  | 'OUT_OF_SCOPE'
  | 'INVALID_SOURCE_BINDING'
  | 'VISUAL_DIAGRAM_DEPENDENT'
  | 'MISSING_VISUAL_ASSET'
  | 'INVALID_VISUAL_ASSET'
  | 'VERIFICATION_EXECUTION_FAILURE';

export interface VerificationResult {
  is_verified: boolean;
  status: 'VERIFIED' | 'REJECTED';
  rejection_code?: VerificationRejectionCode;
  rejection_reason?: string;
  sanitized_blind_input?: BlindSolverInput;
  generator_option_id?: string;
  solver_option_id?: string;
  evidence_hash?: string;
  verified_at?: string;
}

export const DISQUALIFIED_GEOMETRY_CHAPTER_IDS = new Set([
  '1b9f4377-6ae0-4c24-b588-c221900597ec', // Book 2 Ch 4: Prep 1 Math Geometry & Measurement
  'dba6933a-2b80-4d3b-ada4-3ac6acfb58c1'  // Book 7 Ch 3: Prep 2 Math Geometry Theorems & Triangles
]);

export const VISUAL_INDICATOR_REGEX = /(الشكل\s*المقابل|في\s*الرسم\s*الموضح|الخريطة\s*الموضحة|بالاستعانة\s*بالخريطة|الشكل\s*رقم|بالرسم\s*المبين|من\s*الرسم|انظر\s*الشكل|الرسم\s*البياني)/i;

/**
 * Air-gap sanitizer:
 * Strips generator proposed correct answer, correct option IDs, is_correct flags,
 * rationales, explanations, and any order-biasing metadata before passing to the blind solver.
 * Applies a deterministic, unbiased permutation (AUD-04) derived strictly from
 * question and evidence text to eliminate option-position leakage.
 */
export function sanitizeBlindSolverInput(candidate: CandidateQuestionPayload): BlindSolverInput {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('INVALID_CANDIDATE: Payload must be an object');
  }

  const rawOptions = Array.isArray(candidate.options) ? candidate.options : [];
  const sanitizedOptions = rawOptions.map(opt => ({
    id: String(opt.id || '').trim(),
    text: String(opt.text || '').trim()
  }));

  // AUD-04: Deterministic, unbiased permutation derived strictly from question and chunk/passage seeds.
  // Must NOT depend on proposed_correct_option_id, correct option index, rationale, or any answer-revealing field.
  const qSeed = String(candidate.question_text || '').trim();
  const chunkSeed = String(candidate.evidence?.chunk_id || candidate.evidence?.passage_text || '').trim();
  const seedHash = crypto.createHash('sha256').update(`${qSeed}::${chunkSeed}`, 'utf8').digest('hex');

  const permutedOptions = [...sanitizedOptions].sort((a, b) => {
    const keyA = crypto.createHash('sha256').update(`${seedHash}::${a.id}::${a.text}`, 'utf8').digest('hex');
    const keyB = crypto.createHash('sha256').update(`${seedHash}::${b.id}::${b.text}`, 'utf8').digest('hex');
    return keyA.localeCompare(keyB);
  });

  const result: BlindSolverInput = {
    passage_text: String(candidate.evidence?.passage_text || '').trim(),
    question_text: qSeed,
    options: permutedOptions
  };

  if (candidate.diagram_url) {
    result.diagram_url = candidate.diagram_url;
  }
  if (candidate.diagram_asset_id) {
    result.diagram_asset_id = candidate.diagram_asset_id;
  }

  return result;
}

/**
 * Independent Blind Solver Auditor:
 * Evaluates candidate questions through an air-gapped solver that receives zero answer-revealing metadata.
 * Fails closed on any error, ambiguity, or contradiction.
 */
export async function verifyCandidateQuestionWithBlindSolver(
  candidate: CandidateQuestionPayload,
  solver: BlindSolverFunction
): Promise<VerificationResult> {
  // Gate 0: Candidate Structural Schema Validation
  if (!candidate || typeof candidate !== 'object') {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INVALID_STRUCTURED_OUTPUT',
      rejection_reason: 'Candidate payload is null or not an object'
    };
  }

  const qText = String(candidate.question_text || '').trim();
  if (qText.length < 8) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INVALID_STRUCTURED_OUTPUT',
      rejection_reason: 'Question text is missing or too short (< 8 characters)'
    };
  }

  if (!Array.isArray(candidate.options) || candidate.options.length < 2 || candidate.options.length > 6) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INVALID_STRUCTURED_OUTPUT',
      rejection_reason: 'Question must have between 2 and 6 options'
    };
  }

  const seenOptionIds = new Set<string>();
  const seenOptionTexts = new Set<string>();
  for (const opt of candidate.options) {
    const optId = String(opt.id || '').trim();
    const optText = String(opt.text || '').trim();
    if (!optId || !optText) {
      return {
        is_verified: false,
        status: 'REJECTED',
        rejection_code: 'INVALID_STRUCTURED_OUTPUT',
        rejection_reason: 'Options must have non-empty id and text'
      };
    }
    if (seenOptionIds.has(optId)) {
      return {
        is_verified: false,
        status: 'REJECTED',
        rejection_code: 'INVALID_STRUCTURED_OUTPUT',
        rejection_reason: `Duplicate option ID detected: "${optId}"`
      };
    }
    seenOptionIds.add(optId);

    const normText = normalizeArabicLevel1(optText);
    if (seenOptionTexts.has(normText)) {
      return {
        is_verified: false,
        status: 'REJECTED',
        rejection_code: 'INVALID_STRUCTURED_OUTPUT',
        rejection_reason: `Duplicate option text detected after Arabic normalization: "${optText}"`
      };
    }
    seenOptionTexts.add(normText);
  }

  const proposedId = String(candidate.proposed_correct_option_id || '').trim();
  if (!proposedId || !seenOptionIds.has(proposedId)) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INVALID_STRUCTURED_OUTPUT',
      rejection_reason: `Proposed correct option ID "${proposedId}" does not match any valid option`
    };
  }

  // Gate 1: Source Scope and Evidence Binding Validation
  const evidence = candidate.evidence;
  if (!evidence || typeof evidence !== 'object') {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INVALID_SOURCE_BINDING',
      rejection_reason: 'Evidence object is missing'
    };
  }

  const passageText = String(evidence.passage_text || '').trim();
  if (passageText.length < 20) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INVALID_SOURCE_BINDING',
      rejection_reason: 'Supporting passage text is missing or too short (< 20 characters)'
    };
  }

  const bookId = String(evidence.book_id || '').trim();
  const chapterId = String(evidence.chapter_id || '').trim();
  const chunkId = String(evidence.chunk_id || '').trim();
  const pageNum = Number(evidence.page_number);

  if (!bookId || !chapterId || !chunkId || isNaN(pageNum) || pageNum <= 0) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INVALID_SOURCE_BINDING',
      rejection_reason: 'Evidence is missing required book_id, chapter_id, chunk_id, or valid page_number'
    };
  }

  // Gate 2: Visual Asset Validation & Grounding (Phase 4G.3J)
  const hasVisualInQuestion = VISUAL_INDICATOR_REGEX.test(qText) || VISUAL_INDICATOR_REGEX.test(passageText);
  const isGeometryChapter = DISQUALIFIED_GEOMETRY_CHAPTER_IDS.has(chapterId);
  const requiresVisual = isGeometryChapter || hasVisualInQuestion || Boolean(candidate.has_visual_dependency);

  if (candidate.diagram_url) {
    if (!VisualAssetExtractor.isVisualAssetValid(candidate.diagram_url)) {
      return {
        is_verified: false,
        status: 'REJECTED',
        rejection_code: 'INVALID_VISUAL_ASSET',
        rejection_reason: `Diagram URL "${candidate.diagram_url}" is invalid, traversal, or not registered in manifest`
      };
    }

    const manifest = VisualAssetExtractor.loadManifest();
    const cleanDiagramUrl = candidate.diagram_url.split('?')[0];
    const asset = manifest.assets.find(a =>
      a.url_path === cleanDiagramUrl ||
      cleanDiagramUrl.includes(a.asset_id)
    );
    if (asset && asset.book_id !== bookId) {
      return {
        is_verified: false,
        status: 'REJECTED',
        rejection_code: 'INVALID_VISUAL_ASSET',
        rejection_reason: `Diagram asset book_id "${asset.book_id}" does not match question book_id "${bookId}"`
      };
    }
  } else if (requiresVisual) {
    if (isGeometryChapter) {
      return {
        is_verified: false,
        status: 'REJECTED',
        rejection_code: 'OUT_OF_SCOPE',
        rejection_reason: `Chapter ${chapterId} belongs to geometry units requiring visual diagrams, but no verified visual diagram was supplied`
      };
    }
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'VISUAL_DIAGRAM_DEPENDENT',
      rejection_reason: 'Question or supporting text references unprovided visual diagrams, figures, or maps'
    };
  }

  // Gate 4: Air-Gap Sanitization & Blind Solver Execution
  let sanitizedInput: BlindSolverInput;
  try {
    sanitizedInput = sanitizeBlindSolverInput(candidate);
  } catch (err: any) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INVALID_STRUCTURED_OUTPUT',
      rejection_reason: `Sanitization error: ${err.message}`
    };
  }

  let solverOutput: BlindSolverOutput;
  try {
    if (typeof solver !== 'function') {
      return {
        is_verified: false,
        status: 'REJECTED',
        rejection_code: 'VERIFICATION_EXECUTION_FAILURE',
        rejection_reason: 'Blind solver function is not provided or not executable'
      };
    }
    solverOutput = await solver(sanitizedInput);
  } catch (err: any) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'VERIFICATION_EXECUTION_FAILURE',
      rejection_reason: `Blind solver execution failed or timed out: ${err.message || err}`
    };
  }

  // Gate 5: Solver Output Structure Validation
  if (!solverOutput || typeof solverOutput !== 'object') {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INVALID_STRUCTURED_OUTPUT',
      rejection_reason: 'Blind solver returned non-object output'
    };
  }

  const validStatuses = new Set(['SOLVED', 'INSUFFICIENT_EVIDENCE', 'AMBIGUOUS', 'UNSUPPORTED_PREMISE', 'REQUIRES_VISUAL']);
  if (!validStatuses.has(solverOutput.status)) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INVALID_STRUCTURED_OUTPUT',
      rejection_reason: `Blind solver returned invalid status: "${solverOutput.status}"`
    };
  }

  // Gate 6: Solver Status Evaluation (Fail Closed)
  if (solverOutput.status === 'REQUIRES_VISUAL') {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'VISUAL_DIAGRAM_DEPENDENT',
      rejection_reason: solverOutput.reasoning || 'Blind solver identified dependency on visual figures'
    };
  }

  if (solverOutput.status === 'UNSUPPORTED_PREMISE') {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'UNSUPPORTED_PREMISE',
      rejection_reason: solverOutput.reasoning || 'Question premise is unsupported by cited passage'
    };
  }

  if (solverOutput.status === 'INSUFFICIENT_EVIDENCE') {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INSUFFICIENT_EVIDENCE',
      rejection_reason: solverOutput.reasoning || 'Supporting passage contains insufficient evidence to answer'
    };
  }

  // Gate 6: Defensible Options Validation (AUD-02)
  if (!Array.isArray(solverOutput.defensible_option_ids)) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INVALID_STRUCTURED_OUTPUT',
      rejection_reason: 'Blind solver defensible_option_ids must be an array'
    };
  }

  const defensibleSeen = new Set<string>();
  const defensibleIds: string[] = [];
  for (const rawId of solverOutput.defensible_option_ids) {
    if (typeof rawId !== 'string' || !rawId.trim()) {
      return {
        is_verified: false,
        status: 'REJECTED',
        rejection_code: 'INVALID_STRUCTURED_OUTPUT',
        rejection_reason: 'defensible_option_ids contains non-string or empty option ID'
      };
    }
    const cleanId = rawId.trim();
    if (defensibleSeen.has(cleanId)) {
      return {
        is_verified: false,
        status: 'REJECTED',
        rejection_code: 'AMBIGUOUS_OPTIONS',
        rejection_reason: `Duplicate ID in defensible_option_ids: "${cleanId}"`
      };
    }
    if (!seenOptionIds.has(cleanId)) {
      return {
        is_verified: false,
        status: 'REJECTED',
        rejection_code: 'INVALID_STRUCTURED_OUTPUT',
        rejection_reason: `Defensible option ID "${cleanId}" is not among candidate options`
      };
    }
    defensibleSeen.add(cleanId);
    defensibleIds.push(cleanId);
  }

  if (defensibleIds.length === 0) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INSUFFICIENT_EVIDENCE',
      rejection_reason: solverOutput.reasoning || 'No options could be defended based on the supplied passage'
    };
  }

  if (solverOutput.status === 'AMBIGUOUS' || defensibleIds.length > 1) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'AMBIGUOUS_OPTIONS',
      rejection_reason: `Multiple options are defensible from the passage: [${defensibleIds.join(', ')}]`
    };
  }

  const soleDefensibleId = defensibleIds[0];

  // Gate 7: Selected Answer and Agreement Gate (AUD-02)
  const solverSelectedId = typeof solverOutput.selected_option_id === 'string'
    ? solverOutput.selected_option_id.trim()
    : '';

  if (!solverSelectedId || !seenOptionIds.has(solverSelectedId)) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INSUFFICIENT_EVIDENCE',
      rejection_reason: 'Blind solver failed to select a valid option from the supplied set'
    };
  }

  // AUD-02: Selected option must match the sole defensible option
  if (solverSelectedId !== soleDefensibleId) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'AMBIGUOUS_OPTIONS',
      rejection_reason: `Solver selected_option_id "${solverSelectedId}" contradicts sole defensible_option_id "${soleDefensibleId}"`
    };
  }

  // Selected option must match generator's proposed answer
  if (solverSelectedId !== proposedId) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'SOLVER_DISAGREEMENT',
      rejection_reason: `Solver disagreed with generator: generator proposed "${proposedId}", solver selected "${solverSelectedId}"`,
      generator_option_id: proposedId,
      solver_option_id: solverSelectedId
    };
  }

  // Gate 8: Mandatory Evidence Entailment Quote Check (AUD-01)
  const rawQuote = solverOutput.entailed_evidence_quote;
  if (typeof rawQuote !== 'string') {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INSUFFICIENT_EVIDENCE',
      rejection_reason: 'Solver output is missing required entailed_evidence_quote string'
    };
  }

  const trimmedQuote = rawQuote.trim();
  if (trimmedQuote.length === 0) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INSUFFICIENT_EVIDENCE',
      rejection_reason: 'Solver entailed_evidence_quote cannot be empty or whitespace-only'
    };
  }

  const normQuote = normalizeArabicLevel1(trimmedQuote);
  if (normQuote.length < 15) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'INSUFFICIENT_EVIDENCE',
      rejection_reason: `Solver entailed_evidence_quote is too short after normalization (${normQuote.length} < 15 characters)`
    };
  }

  const normPassage = normalizeArabicLevel1(passageText);
  if (!normPassage.includes(normQuote)) {
    return {
      is_verified: false,
      status: 'REJECTED',
      rejection_code: 'UNSUPPORTED_PREMISE',
      rejection_reason: `Solver cited evidence quote "${trimmedQuote.slice(0, 50)}..." is absent from the supporting passage`
    };
  }

  // All 8 verification gates passed!
  const evidenceHash = crypto.createHash('sha256').update(passageText, 'utf8').digest('hex');

  return {
    is_verified: true,
    status: 'VERIFIED',
    sanitized_blind_input: sanitizedInput,
    generator_option_id: proposedId,
    solver_option_id: solverSelectedId,
    evidence_hash: evidenceHash,
    verified_at: new Date().toISOString()
  };
}

export interface EvaluationItemResult {
  question_id: string;
  question_text: string;
  selected_option_id: string;
  student_answer_text: string;
  correct_answer_text: string;
  is_correct: boolean;
  points: number;
  authoritative_points: number | null;
  is_authoritatively_scored: boolean;
  answer_key_status: string;
  verification_method: string;
  explanation: string;
  page_reference: number;
  topic_area: string;
  study_recommendation: string;
}

export interface FullDiagnosticReport {
  evaluation_id: string;
  student_id: string;
  book_id: string;
  chapter_id: string;
  subject_id: string;
  // Authoritative scores (only from deterministically verified questions)
  authoritative_score: number;
  authoritative_max_score: number;
  authoritative_percentage: number | null;
  authoritative_mastery_status: 'MASTERED' | 'PROFICIENT' | 'DEVELOPING' | 'NEEDS_WORK' | 'PENDING_REVIEW';
  // Provisional / Formative scores (across all questions for learning guidance)
  provisional_score: number;
  provisional_max_score: number;
  provisional_percentage: number;
  provisional_mastery_status: 'MASTERED' | 'PROFICIENT' | 'DEVELOPING' | 'NEEDS_WORK';
  // Review metadata
  has_unverified_questions: boolean;
  verified_questions_count: number;
  pending_review_count: number;
  overall_review_status: 'FULLY_VERIFIED' | 'PARTIALLY_VERIFIED' | 'PENDING_TEACHER_REVIEW';
  // Legacy backward-compatibility fields
  score: number;
  max_score: number;
  percentage: number;
  mastery_status: 'MASTERED' | 'PROFICIENT' | 'DEVELOPING' | 'NEEDS_WORK';
  items: EvaluationItemResult[];
  weak_topics: string[];
  strong_topics: string[];
  overall_feedback_ar: string;
  overall_feedback_en: string;
  analytics_synced?: boolean;
  synced_at?: string;
  recovered?: boolean;
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

class AIRagEngine {
  // In-memory cache for sanitized educational chunks per chapter (15 min TTL)
  private static chunksMemoryCache = new Map<string, { chunks: RetrievedChunk[]; timestamp: number }>();
  // In-memory cache for validated Question Bank items per chapter & grade (10 min TTL)
  private static bankMemoryCache = new Map<string, { questions: GroundedQuestion[]; timestamp: number }>();

  // Plug-and-play blind solver override for isolated offline testing
  private static blindSolverOverride: BlindSolverFunction | null = null;

  public static setBlindSolverOverride(solver: BlindSolverFunction | null): void {
    this.blindSolverOverride = solver;
  }

  public static clearMemoryCache(): void {
    this.chunksMemoryCache.clear();
    this.bankMemoryCache.clear();
  }

  /**
   * Retrieves or constructs the bounded blind solver adapter.
   * Wraps GeminiClient with strict per-attempt timeouts, budgets, schema checks, and fail-closed handling.
   */
  public getBlindSolver(): BlindSolverFunction {
    if (AIRagEngine.blindSolverOverride) {
      return AIRagEngine.blindSolverOverride;
    }
    const rawInvoker: RawSolverInvoker = async (input: BlindSolverInput, signal?: AbortSignal) => {
      const optionsText = input.options.map(o => `(${o.id}) ${o.text}`).join('\n');
      const prompt = `Solve this multiple-choice question using ONLY the provided passage and any attached visual figure.
Do not assume any facts outside this passage and visual figure.

Passage:
${input.passage_text}

Question:
${input.question_text}

Options:
${optionsText}

Return valid JSON with exact keys:
{
  "status": "SOLVED" | "INSUFFICIENT_EVIDENCE" | "AMBIGUOUS" | "UNSUPPORTED_PREMISE" | "REQUIRES_VISUAL",
  "selected_option_id": "id of correct option if status is SOLVED",
  "defensible_option_ids": ["ids of all options defensible from passage"],
  "reasoning": "brief explanation",
  "entailed_evidence_quote": "exact quote from the passage (min 15 chars)"
}`;

      const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];
      if (input.diagram_url && VisualAssetExtractor.isVisualAssetValid(input.diagram_url)) {
        try {
          const cleanDiagramUrl = input.diagram_url.split('?')[0];
          const asset = VisualAssetExtractor.loadManifest().assets.find(a =>
            a.url_path === cleanDiagramUrl ||
            cleanDiagramUrl.includes(a.asset_id)
          );
          if (asset && fs.existsSync(asset.file_path)) {
            const buf = fs.readFileSync(asset.file_path);
            parts.push({
              inline_data: {
                mime_type: asset.mime_type,
                data: buf.toString('base64')
              }
            });
          }
        } catch (e) {
          console.warn('[BlindSolver] Could not attach visual asset buffer:', e);
        }
      }
      parts.push({ text: prompt });

      const text = await GeminiClient.generateContent({
        parts,
        responseMimeType: 'application/json',
        temperature: 0.1,
        timeoutMs: 10000
      });
      const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    };

    return createBoundedSolverAdapter(rawInvoker, {
      maxAttempts: 2,
      perAttemptTimeoutMs: 10000,
      totalBudgetTimeoutMs: 22000
    });
  }

  /**
   * Strictly retrieve textbook chunks belonging ONLY to the student's stage, grade, subject, book, and chapter.
   * Optimized to select only top high-density educational chunks, ignoring document metadata.
   */
  public async retrieveGroundedChunks(params: {
    academicStageId: string;
    gradeId: string;
    subjectId: string;
    bookId: string;
    chapterId: string;
    queryText?: string;
    limit?: number;
  }): Promise<RetrievedChunk[]> {
    const { academicStageId, gradeId, subjectId, bookId, chapterId, queryText, limit = 3 } = params;

    // Fast-path: In-memory cache lookup
    const cachedEntry = AIRagEngine.chunksMemoryCache.get(chapterId);
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < 15 * 60 * 1000) && !queryText) {
      const shuffled = [...cachedEntry.chunks].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, limit);
    }

    // Dedicated Revision Pathway vs Unit Retrieval Isolation (Phase 4G.3J)
    // Book ID 81b8a308-7fcf-4938-8c45-aa0056624f32 (Prep 2 Social Studies)
    const isPrep2Social = bookId === '81b8a308-7fcf-4938-8c45-aa0056624f32';
    const isPrep2RevisionChapter = chapterId === 'PREP2_SOC_REVISION' || chapterId === '7f2409f5-19e4-4d89-9a2c-f684c31be991';

    let res: any;
    if (isPrep2Social && isPrep2RevisionChapter) {
      // Dedicated general revision pathway: retrieves pages 97-106 without modifying live schema
      res = await db.query(
        `SELECT id, book_id, chapter_id, page_number, chunk_index, content, metadata, embedding
         FROM book_chunks
         WHERE book_id = $1 AND page_number BETWEEN 97 AND 106
         ORDER BY chunk_index ASC`,
        [bookId]
      );
    } else {
      res = await db.query(
        `SELECT id, book_id, chapter_id, page_number, chunk_index, content, metadata, embedding
         FROM book_chunks
         WHERE academic_stage_id = $1 
           AND grade_id = $2 
           AND subject_id = $3 
           AND book_id = $4 
           AND chapter_id = $5
         ORDER BY chunk_index ASC`,
        [academicStageId, gradeId, subjectId, bookId, chapterId]
      );
    }

    if (res.rows.length === 0) {
      return [];
    }

    // 1. Sanitize all chunks (stripping page numbers, headers, footers, labels, TOC, publisher boilerplate)
    // Prep 2 Social Studies Unit 4 (16d3a51f-5026-4445-9856-788c00aa1652) ends at page 96.
    // Strictly filter out any chunks beyond page 96 to prevent revision leakage.
    const sanitizedRows: RetrievedChunk[] = res.rows
      .filter((row: any) => {
        if (isPrep2Social && chapterId === '16d3a51f-5026-4445-9856-788c00aa1652' && row.page_number > 96) {
          return false;
        }
        return true;
      })
      .map((row: any) => ({
        id: row.id,
        book_id: row.book_id,
        chapter_id: row.chapter_id,
        page_number: row.page_number,
        chunk_index: row.chunk_index,
        content: stripDocumentMetadataAndStructure(row.content),
        metadata: row.metadata,
        embedding: row.embedding
      }));

    // Filter out boilerplate chunks (indexes, table of contents, copyright, committee info)
    const isBoilerplateChunk = (text: string): boolean => {
      if (!text || text.trim().length < 25) return true;
      const lower = text.toLowerCase();
      const boilerplateKeywords = [
        'الفهرس', 'المحتويات', 'قائمة المحتويات', 'فهرس الكتاب',
        'لجنة الإعداد', 'لجنة التأليف', 'المراجعة والتطوير', 'مستشار المادة',
        'حقوق الطبع', 'حقوق النشر', 'رقم الإيداع', 'دار الكتب', 'isbn',
        'طبعة 202', 'وزارة التربية والتعليم والتعليم الفني', 'مقدمة الناشر',
        'دليل المعلم وولي الأمر', 'أهداف الوحدة العامة'
      ];
      const dotCount = (text.match(/\.{3,}/g) || []).length;
      if (dotCount >= 3) return true;
      return boilerplateKeywords.some(kw => lower.includes(kw));
    };

    // Filter to educational content chunks (definitions, concepts, explanations, examples, experiments, procedures, formulas, learning objectives)
    const isEducationalChunk = (text: string): boolean => {
      if (!text || text.trim().length < 35) return false;
      if (isBoilerplateChunk(text)) return false;

      const hasDefinition = /تعريف|يقصد بـ|هو عبارة عن|هي عبارة عن|هو كل ما|هي كل ما|يُعرف بـ|يُقصد به|المصطلح العلمي|definition|defined as|means/i.test(text);
      const hasConcept = /مفهوم|خاصية|خصائص|ظاهرة|علاقة|الكثافة|الكتلة|الحجم|المادة|الذرة|العنصر|المركب|الطاقة|السرعة|الحركة|القوة|الحرارة|التفاعل|concept|property|matter|mass|volume|density/i.test(text);
      const hasExplanation = /علل|تفسير|السبب|يرجع ذلك إلى|نستنتج أن|نستدل على|بسبب|لأن|يؤدي إلى|يترتب على|explanation|because|causes|results in|therefore/i.test(text);
      const hasExample = /مثال|أمثلة|على سبيل المثال|مثل:|كمثال|example|for instance/i.test(text);
      const hasExperimentOrProcedure = /تجربة|نشاط|ملاحظة|استنتاج|أدوات|خطوات|طريقة العمل|نلاحظ أن|experiment|activity|observation|procedure|steps/i.test(text);
      const hasFormulaOrCalc = /قانون|معادلة|العلاقة الرياضية|تُحسب من العلاقة|جرام\/سم|كجم\/م|كيلوجرام|نيوتن|متر\/ثانية|formula|equation|\/|×|\+|\-|=/i.test(text);
      const hasObjectives = /أهداف التعلم|نواتج التعلم|يتوقع في نهاية|أن يتعرف الطالب|أن يستنتج الطالب|learning objectives/i.test(text);

      const words = text.trim().split(/\s+/).length;
      return hasDefinition || hasConcept || hasExplanation || hasExample || hasExperimentOrProcedure || hasFormulaOrCalc || hasObjectives || words >= 25;
    };

    const educationalChunks = sanitizedRows.filter((row: RetrievedChunk) => isEducationalChunk(row.content));
    const candidateChunks = educationalChunks.length > 0 ? educationalChunks : sanitizedRows.filter((r: RetrievedChunk) => !isBoilerplateChunk(r.content));

    // Save in memory cache for 15 minutes
    AIRagEngine.chunksMemoryCache.set(chapterId, {
      chunks: candidateChunks,
      timestamp: Date.now()
    });

    if (!queryText) {
      // Pick random chunks from candidateChunks so questions are diverse across the entire chapter
      const shuffled = [...candidateChunks].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, limit);
    }

    // Perform vector ranking using query embedding
    const queryVec = await generateEmbedding(queryText);
    const scoredChunks = candidateChunks.map((row: any) => {
      let sim = 0;
      if (row.embedding) {
        try {
          const chunkVec = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
          sim = cosineSimilarity(queryVec, chunkVec);
        } catch (e) {
          sim = 0;
        }
      }
      return {
        ...row,
        similarity: sim
      };
    });

    scoredChunks.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
    return scoredChunks.slice(0, limit);
  }

  /**
   * Detects the educational language of the textbook/chapter based on chunk content and metadata.
   */
  public detectLanguage(chunks: { content?: string }[], book?: any): 'ar' | 'en' {
    const combinedContent = chunks.map(c => c.content || '').join(' ');
    const arChars = (combinedContent.match(/[\u0600-\u06FF]/g) || []).length;
    const enChars = (combinedContent.match(/[a-zA-Z]/g) || []).length;

    if (enChars > arChars && enChars > 25) {
      return 'en';
    }
    if (arChars > enChars && arChars > 25) {
      return 'ar';
    }

    const fileUrl = (book?.file_url || '').toLowerCase();
    const titleEn = (book?.title_en || '').toLowerCase();
    const titleAr = (book?.title_ar || '').toLowerCase();
    const bookLanguage = (book?.language || '').toLowerCase();
    const schoolType = (book?.school_type || '').toLowerCase();

    if (bookLanguage === 'en' || bookLanguage === 'english') {
      return 'en';
    }
    if (bookLanguage === 'ar' || bookLanguage === 'arabic') {
      return 'ar';
    }

    const isEnglishMetadata =
      fileUrl.includes('_en_') ||
      fileUrl.includes('math_en') ||
      fileUrl.includes('science_en') ||
      titleEn.includes('math') ||
      titleEn.includes('english') ||
      titleEn.includes('science') ||
      titleEn.includes('physics') ||
      titleEn.includes('chemistry') ||
      titleEn.includes('biology') ||
      titleAr.includes('math') ||
      titleAr.includes('english') ||
      titleAr.includes('science') ||
      (schoolType === 'لغات' && (titleAr.includes('رياضيات') || titleAr.includes('علوم')));

    if (isEnglishMetadata && arChars < 60) {
      return 'en';
    }

    if (isEnglishMetadata && enChars > 15) {
      return 'en';
    }

    return 'ar';
  }

  /**
   * Check if questions already exist in the Question Bank in TiDB.
   * Single-query fast join with in-memory caching for sub-second retrieval (< 1s target).
   */
  private async getQuestionsFromBank(params: {
    bookId: string;
    chapterId: string;
    gradeId?: string;
    count: number;
    studentId?: string;
    expectedLanguage?: 'ar' | 'en';
  }): Promise<GroundedQuestion[] | null> {
    const { bookId, chapterId, gradeId, count, studentId, expectedLanguage = 'ar' } = params;
    const cacheKey = `${gradeId || 'any'}:${bookId}:${chapterId}:${expectedLanguage}`;

    try {
      // 1. If studentId is provided, fetch all question IDs and normalized texts the student has already seen
      const seenIds = new Set<string>();
      const seenTexts = new Set<string>();

      if (studentId) {
        try {
          const evalRes = await db.query(
            `SELECT questions_data FROM ai_evaluations WHERE student_id = $1 AND chapter_id = $2`,
            [studentId, chapterId]
          );
          for (const row of evalRes.rows) {
            try {
              const qList = typeof row.questions_data === 'string' ? JSON.parse(row.questions_data) : row.questions_data;
              if (Array.isArray(qList)) {
                qList.forEach((q: any) => {
                  if (q.id) seenIds.add(q.id);
                  if (q.question_text) {
                    seenTexts.add(q.question_text.trim().toLowerCase().replace(/[؟\?\.\!\s]+/g, ' '));
                  }
                });
              }
            } catch (_) {}
          }
        } catch (_) {}
      }

      const isUnseenForStudent = (q: GroundedQuestion) => {
        if (studentId) {
          if (seenIds.has(q.id)) return false;
          const norm = q.question_text.trim().toLowerCase().replace(/[؟\?\.\!\s]+/g, ' ');
          if (seenTexts.has(norm)) return false;
        }
        return true;
      };

      // 2. Fast in-memory cache check (< 5ms)
      const memCached = AIRagEngine.bankMemoryCache.get(cacheKey);
      if (memCached && (Date.now() - memCached.timestamp < 10 * 60 * 1000)) {
        let validMem = memCached.questions
          .filter(q => evaluateQuestionQuality(q).isValid)
          .filter(isUnseenForStudent);

        if (validMem.length >= count) {
          return shuffleArray(validMem).slice(0, count);
        }
      }

      // 3. Single-query fast join from TiDB (retrieves items + options in 1 query strictly matching book of current term)
      const rowsRes = await db.query(
        `SELECT 
           qi.id, qi.question_text, qi.difficulty, qi.bloom_level, qi.explanation, qi.page_reference, qi.source_chunk_id,
           qo.id as opt_id, qo.option_text, qo.is_correct
         FROM question_bank_items qi
         JOIN question_bank_options qo ON qi.id = qo.question_item_id
         JOIN book_chapters bc ON qi.chapter_id = bc.id
         WHERE qi.chapter_id = $1 AND bc.book_id = $2
           AND (qi.is_quarantined = 0 OR qi.is_quarantined IS NULL)
         ORDER BY qi.id ASC`,
        [chapterId, bookId]
      );

      if (rowsRes.rows.length === 0) return null;

      // Group rows by question_item_id
      const itemsMap = new Map<string, any>();
      for (const row of rowsRes.rows) {
        if (!itemsMap.has(row.id)) {
          itemsMap.set(row.id, {
            id: row.id,
            question_text: row.question_text,
            difficulty: row.difficulty,
            bloom_level: row.bloom_level,
            explanation: row.explanation,
            page_reference: row.page_reference,
            source_chunk_id: row.source_chunk_id,
            options: []
          });
        }
        itemsMap.get(row.id).options.push({
          id: row.opt_id,
          text: row.option_text,
          is_correct: row.is_correct === 1 || row.is_correct === true || row.is_correct === '1'
        });
      }

      const allItems = Array.from(itemsMap.values());
      const candidateQuestions: GroundedQuestion[] = [];

      for (const item of allItems) {
        const qText = item.question_text || '';
        const arCount = (qText.match(/[\u0600-\u06FF]/g) || []).length;
        const enCount = (qText.match(/[a-zA-Z]/g) || []).length;

        // Ensure language sovereignty
        if (expectedLanguage === 'en' && arCount > enCount) continue;
        if (expectedLanguage === 'ar' && enCount > arCount && arCount < 5) continue;

        const groundedQ: GroundedQuestion = {
          id: item.id,
          chunk_id: item.source_chunk_id || '',
          book_id: bookId,
          chapter_id: chapterId,
          question_text: item.question_text,
          options: shuffleArray(item.options),
          difficulty: item.difficulty || 'MEDIUM',
          bloom_level: item.bloom_level || 'UNDERSTANDING',
          page_reference: item.page_reference || 1,
          source_excerpt: '',
          explanation: item.explanation || ''
        };

        const quality = evaluateQuestionQuality(groundedQ, candidateQuestions);
        if (quality.isValid) {
          const prov = await verifyQuestionProvenance(groundedQ, bookId);
          if (prov.isVerified) {
            const val = AnswerValidationService.validateQuestion(groundedQ);
            if (val.answerKeyStatus !== 'REJECTED') {
              // Objective 2: Enforce blind solver verification on bank questions
              // Legacy items lacking blind solver verification against supporting chunks cannot enter approved exams
              if (!groundedQ.chunk_id) {
                console.warn(`[Bank Isolation] Skipping legacy bank question lacking supporting chunk_id: "${groundedQ.question_text}"`);
                continue;
              }

              const chunkRes = await db.query(
                `SELECT content FROM book_chunks WHERE id = $1`,
                [groundedQ.chunk_id]
              );

              if (chunkRes.rows.length === 0 || !chunkRes.rows[0].content || chunkRes.rows[0].content.trim().length < 20) {
                console.warn(`[Bank Isolation] Skipping legacy bank question with missing or empty supporting chunk: "${groundedQ.question_text}"`);
                continue;
              }

              const correctOpt = groundedQ.options.find(o => o.is_correct);
              if (!correctOpt) {
                console.warn(`[Bank Isolation] Skipping legacy bank question without identified correct option: "${groundedQ.question_text}"`);
                continue;
              }

              const candidatePayload: CandidateQuestionPayload = {
                id: groundedQ.id,
                question_text: groundedQ.question_text,
                options: groundedQ.options.map(o => ({ id: o.id, text: o.text })),
                proposed_correct_option_id: correctOpt.id,
                evidence: {
                  book_id: bookId,
                  chapter_id: chapterId,
                  page_number: groundedQ.page_reference || 1,
                  chunk_id: groundedQ.chunk_id,
                  passage_text: chunkRes.rows[0].content
                },
                diagram_url: groundedQ.diagram_url,
                diagram_asset_id: groundedQ.diagram_asset_id,
                has_visual_dependency: groundedQ.has_visual_dependency
              };

              const solver = this.getBlindSolver();
              const verification = await verifyCandidateQuestionWithBlindSolver(candidatePayload, solver);

              if (!verification.is_verified) {
                console.warn(`[Bank Isolation] Skipping legacy unverified bank question failing blind solver: "${groundedQ.question_text}" [${verification.rejection_code}] (${verification.rejection_reason})`);
                continue;
              }

              groundedQ.validation_status = { isValid: true, reason: 'VERIFIED_BY_BLIND_SOLVER' };
              candidateQuestions.push(groundedQ);
            } else {
              console.warn(`[Bank Cache Filter] Skipping bank question with rejected answer key: "${groundedQ.question_text}" (${val.reason})`);
            }
          } else {
            console.warn(`[Bank Cache Filter] Skipping unverified bank question: "${groundedQ.question_text}" (${prov.reason})`);
          }
        }
      }

      if (candidateQuestions.length === 0) return null;

      // Update in-memory cache
      AIRagEngine.bankMemoryCache.set(cacheKey, {
        questions: candidateQuestions,
        timestamp: Date.now()
      });

      // Strict Student Deduplication: Filter out any question previously seen by the student
      const unseenForStudent = candidateQuestions.filter(isUnseenForStudent);

      if (unseenForStudent.length >= count) {
        console.log(`⚡ [Instant Bank Cache] Served ${count} unseen validated teacher questions for student ${studentId || 'guest'} (< 1s, $0.00)`);
        return shuffleArray(unseenForStudent).slice(0, count);
      } else if (unseenForStudent.length > 0) {
        console.log(`⚡ [Partial Bank Cache] Reusing ${unseenForStudent.length} existing unseen questions, generating ${count - unseenForStudent.length} fresh`);
        return shuffleArray(unseenForStudent);
      } else {
        console.log(`🔄 Student ${studentId} completed existing bank questions for chapter ${chapterId}. Triggering fresh generation for 0% duplicate guarantee.`);
        return null; // Return null so generateQuestions creates 100% brand-new questions!
      }
    } catch (err) {
      console.warn('⚠️ Question bank cache lookup error:', err);
      return null;
    }
    return null;
  }

  /**
   * Save validated teacher questions to the Question Bank in TiDB.
   */
  private async saveQuestionsToBank(params: {
    academicStageId: string;
    gradeId: string;
    subjectId: string;
    chapterId: string;
  }, questions: GroundedQuestion[]): Promise<void> {
    try {
      let bankRes = await db.query(
        `SELECT id FROM question_banks WHERE subject_id = $1 AND grade_id = $2 LIMIT 1`,
        [params.subjectId, params.gradeId]
      );

      let bankId: string;
      if (bankRes.rows.length === 0) {
        bankId = uuidv4();
        await db.query(
          `INSERT INTO question_banks (id, subject_id, academic_stage_id, grade_id, title, description)
           VALUES ($1, $2, $3, $4, 'بنك الأسئلة الذكي المعتمد', 'بنك الأسئلة المعتمد من المناهج المدرسية الرسمية')`,
          [bankId, params.subjectId, params.academicStageId, params.gradeId]
        );
      } else {
        bankId = bankRes.rows[0].id;
      }

      for (const q of questions) {
        const quality = evaluateQuestionQuality(q);
        if (!quality.isValid || q.validation_status?.reason !== 'VERIFIED_BY_BLIND_SOLVER') {
          // Do not persist unverified questions into the question bank
          continue;
        }

        const dupCheck = await db.query(
          `SELECT id FROM question_bank_items WHERE chapter_id = $1 AND question_text = $2`,
          [params.chapterId, q.question_text]
        );
        if (dupCheck.rows.length === 0) {
          await db.query(
            `INSERT INTO question_bank_items (
               id, bank_id, chapter_id, question_text, question_type, difficulty, 
               bloom_level, explanation, source_chunk_id, page_reference
             ) VALUES ($1, $2, $3, $4, 'MULTIPLE_CHOICE', $5, $6, $7, $8, $9)`,
            [
              q.id,
              bankId,
              params.chapterId,
              q.question_text,
              q.difficulty,
              q.bloom_level,
              q.explanation,
              q.chunk_id || null,
              q.page_reference
            ]
          );

          for (const opt of q.options) {
            await db.query(
              `INSERT INTO question_bank_options (id, question_item_id, option_text, is_correct)
               VALUES ($1, $2, $3, $4)`,
              [opt.id, q.id, opt.text, opt.is_correct ? 1 : 0]
            );
          }
        }
      }
      console.log(`💾 [Smart Question Bank] Cached ${questions.length} validated teacher questions in TiDB for chapter ${params.chapterId}`);
    } catch (err) {
      console.warn('⚠️ Error saving questions to bank cache:', err);
    }
  }

  /**
   * Main assessment generator:
   * 1. Validates stage & grade.
   * 2. Instant check in Question Bank (< 1s target).
   * 3. If cache miss, retrieves top 3 educational chunks.
   * 4. Calls Gemini with Senior School Teacher Persona & Teacher Quality Rules (< 3s target).
   * 5. Validates against Quality Score (Relevance >= 90%, Edu Value >= 90%, Metadata = 0%, Duplicate = 0%).
   * 6. Caches in memory & database.
   */
  public async generateQuestions(params: {
    studentId?: string;
    academicStageId: string;
    gradeId: string;
    subjectId: string;
    bookId: string;
    chapterId: string;
    count?: number;
  }): Promise<GroundedQuestion[]> {
    const requiredCount = params.count || 3;

    // Student Safety Rule: Server-side validation
    const bookCheck = await db.query(
      `SELECT b.id, b.academic_stage_id, b.grade_id, b.title_ar, b.title_en, b.file_url, b.school_type,
              s.code as subject_code, s.name_ar as subject_name_ar, s.name_en as subject_name_en,
              g.name_ar as grade_name_ar, g.name_en as grade_name_en,
              st.name_ar as stage_name_ar, st.name_en as stage_name_en
       FROM books b
       LEFT JOIN subjects s ON b.subject_id = s.id
       LEFT JOIN grades g ON b.grade_id = g.id
       LEFT JOIN academic_stages st ON b.academic_stage_id = st.id
       WHERE b.id = $1`,
      [params.bookId]
    );
    if (bookCheck.rows.length === 0) {
      throw new Error('الكتاب المدرسي غير موجود بالمنصة.');
    }
    const book = bookCheck.rows[0];
    if (book.academic_stage_id !== params.academicStageId || book.grade_id !== params.gradeId) {
      throw new Error('غير مصرح: لا يمكن توليد أسئلة لكتاب خارج مرحلتك وصفك الدراسي المعتمد.');
    }

    const subjectCode = (book.subject_code || '').toUpperCase();
    const subjectNameAr = (book.subject_name_ar || '').trim();
    const subjectNameEn = (book.subject_name_en || '').trim();

    const detectedLanguage = this.detectLanguage([], book);

    // 1. Instant Question Bank Check (< 1s Target)
    // If validated questions already exist for book_id, chapter_id, grade_id, return immediately!
    const cachedQuestions = await this.getQuestionsFromBank({
      bookId: params.bookId,
      chapterId: params.chapterId,
      gradeId: params.gradeId,
      count: requiredCount,
      studentId: params.studentId,
      expectedLanguage: detectedLanguage
    });

    if (cachedQuestions && cachedQuestions.length >= requiredCount) {
      return cachedQuestions.slice(0, requiredCount);
    }

    // 2. Retrieve grounded educational textbook chunks for comprehensive unit coverage
    const chunkLimit = Math.min(8, Math.max(5, requiredCount + 2));
    let chunks = await this.retrieveGroundedChunks({
      ...params,
      limit: chunkLimit
    });

    if (chunks.length === 0) {
      console.warn(`[AIRagEngine] No verified textbook chunks found for book ${params.bookId}, chapter ${params.chapterId}`);
      throw new Error('لا توجد مقتطفات تعليمية معتمدة من كتاب الوزارة لهذه الوحدة بعد. يرجى التأكد من استخراج محتوى الكتاب أولاً.');
    }

    // Extract vocabulary for relevance verification
    const contextWords = new Set<string>();
    chunks.forEach(c => {
      c.content.toLowerCase().split(/[^\w\u0600-\u06FF]+/).forEach(w => {
        if (w.length > 2) contextWords.add(w);
      });
    });

    // Extract all previously seen questions for this student on this chapter
    const seenTexts = new Set<string>();
    const seenIds = new Set<string>();
    if (params.studentId) {
      try {
        const pastRes = await db.query(
          `SELECT questions_data FROM ai_evaluations WHERE student_id = $1 AND chapter_id = $2`,
          [params.studentId, params.chapterId]
        );
        for (const row of pastRes.rows) {
          try {
            const qs = typeof row.questions_data === 'string' ? JSON.parse(row.questions_data) : row.questions_data;
            if (Array.isArray(qs)) {
              for (const q of qs) {
                if (q.id) seenIds.add(q.id);
                if (q.question_text) {
                  const norm = q.question_text.trim().toLowerCase().replace(/[؟\?\.\!\s]+/g, ' ');
                  seenTexts.add(norm);
                }
              }
            }
          } catch (e) {}
        }
      } catch (err) {
        console.warn('Could not query past student evaluations:', err);
      }
    }

    const isSeenByStudent = (q: GroundedQuestion) => {
      if (params.studentId) {
        if (seenIds.has(q.id)) return true;
        const norm = q.question_text.trim().toLowerCase().replace(/[؟\?\.\!\s]+/g, ' ');
        if (seenTexts.has(norm)) return true;
      }
      return false;
    };

    let validQuestions: GroundedQuestion[] = cachedQuestions && cachedQuestions.length > 0 ? [...cachedQuestions] : [];

    // 3. Call Gemini with Senior Teacher Persona & Teacher Quality Rules
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        // Over-generate candidate questions to guarantee requiredCount is comfortably achieved
        // after strict quality, provenance, and blind solver validation
        const candidateBuffer = Math.max(3, Math.ceil(requiredCount * 0.6));
        const requestCount = Math.min(10, requiredCount + candidateBuffer);
        const rawAiQuestions = await this.callGeminiForQuestions(
          chunks, 
          requestCount, 
          params.bookId, 
          params.chapterId, 
          detectedLanguage,
          Array.from(seenTexts).slice(0, 15), // Pass sample of previously seen questions to guide Gemini
          {
            gradeNameAr: book.grade_name_ar,
            gradeNameEn: book.grade_name_en,
            stageNameAr: book.stage_name_ar,
            stageNameEn: book.stage_name_en,
            subjectCode,
            subjectNameAr,
            subjectNameEn
          }
        );
        if (rawAiQuestions && rawAiQuestions.length > 0) {
          const t1 = Date.now();
          const accepted = await this.verifyCandidateBatch({
            rawQuestions: rawAiQuestions,
            bookId: params.bookId,
            chapterId: params.chapterId,
            chunks,
            existing: validQuestions,
            contextWords,
            needed: requiredCount - validQuestions.length,
            isSeenByStudent,
            label: 'Pass 1'
          });
          validQuestions.push(...accepted);
          console.log(`⏱️ [ExamTiming] pass1_verify_ms=${Date.now() - t1} candidates=${rawAiQuestions.length} verified=${accepted.length}`);
        }

        // Bounded Pass 2 (Top-up): If Pass 1 yielded fewer than requiredCount after strict rejections,
        // attempt a single bounded top-up with remaining/alternative chunks from the same chapter.
        if (validQuestions.length < requiredCount && geminiKey) {
          const needed = requiredCount - validQuestions.length;
          console.log(`🔄 [AIRagEngine] Pass 1 yielded ${validQuestions.length}/${requiredCount} verified questions. Running bounded top-up for ${needed} missing questions...`);

          const currentSeenTexts = [
            ...Array.from(seenTexts),
            ...validQuestions.map(q => q.question_text.trim().toLowerCase().replace(/[؟\?\.\!\s]+/g, ' '))
          ];

          // Phase 4G.3AO: top-up draws on DIFFERENT chunks of the SAME unit (never other units) to widen coverage
          const usedChunkIds = new Set(chunks.map(c => c.id));
          let topUpChunks: RetrievedChunk[] = chunks.length > 2 ? chunks.slice(1) : chunks;
          try {
            const allUnitChunks = await this.retrieveGroundedChunks({ ...params, limit: 200 });
            const fresh = allUnitChunks.filter(c => !usedChunkIds.has(c.id) && c.book_id === params.bookId && c.chapter_id === params.chapterId);
            if (fresh.length >= 2) topUpChunks = fresh.slice(0, 6);
          } catch (e) { /* fall back to the pass-1 chunk subset */ }
          const topUpRequestCount = Math.min(6, needed + 2);

          try {
            const rawTopUpQuestions = await this.callGeminiForQuestions(
              topUpChunks,
              topUpRequestCount,
              params.bookId,
              params.chapterId,
              detectedLanguage,
              currentSeenTexts.slice(0, 20),
              {
                gradeNameAr: book.grade_name_ar,
                gradeNameEn: book.grade_name_en,
                stageNameAr: book.stage_name_ar,
                stageNameEn: book.stage_name_en,
                subjectCode,
                subjectNameAr,
                subjectNameEn
              }
            );

            if (rawTopUpQuestions && rawTopUpQuestions.length > 0) {
              const t2 = Date.now();
              topUpChunks.forEach(c => c.content.toLowerCase().split(/[^\w\u0600-\u06FF]+/).forEach(w => { if (w.length > 2) contextWords.add(w); }));
              const accepted2 = await this.verifyCandidateBatch({
                rawQuestions: rawTopUpQuestions,
                bookId: params.bookId,
                chapterId: params.chapterId,
                chunks: topUpChunks,
                existing: validQuestions,
                contextWords,
                needed: requiredCount - validQuestions.length,
                isSeenByStudent,
                label: 'Pass 2'
              });
              validQuestions.push(...accepted2);
              console.log(`⏱️ [ExamTiming] pass2_verify_ms=${Date.now() - t2} candidates=${rawTopUpQuestions.length} verified=${accepted2.length}`);
            }
          } catch (topUpErr: any) {
            console.warn('⚠️ [AIRagEngine] Pass 2 top-up error:', topUpErr.message || topUpErr);
          }
        }
      } catch (err: any) {
        console.warn('⚠️ Gemini generation error:', err.message || err);
      }
    }

    // 4. Fail-closed: If verified questions cannot satisfy the required count, never fabricate or substitute generic questions
    if (validQuestions.length < requiredCount) {
      if (validQuestions.length >= 3) {
        console.log(`ℹ️ [AIRagEngine] Serving ${validQuestions.length} rigorously verified questions for chapter ${params.chapterId} (requested ${requiredCount})`);
      } else {
        throw new Error(`EXAM_GENERATION_FAILED: Insufficient verified educational questions could be generated from the selected textbook content (requested ${requiredCount}, obtained ${validQuestions.length})`);
      }
    }

    const finalQuestions = validQuestions.slice(0, Math.min(requiredCount, validQuestions.length));

    // 5. Cache validated questions in TiDB and in-memory cache for instant 0$ reuse
    try {
      await this.saveQuestionsToBank(params, finalQuestions);
      const cacheKey = `${params.gradeId}:${params.bookId}:${params.chapterId}:${detectedLanguage}`;
      AIRagEngine.bankMemoryCache.set(cacheKey, {
        questions: finalQuestions,
        timestamp: Date.now()
      });
    } catch (e) {
      console.warn('Cache save note:', e);
    }

    return finalQuestions;
  }


  /**
   * Phase 4G.3AO: Verifies candidate questions (quality -> provenance -> blind solver) with bounded concurrency.
   * All guarantees are unchanged; only the execution is parallelised (and stops early once enough are verified).
   * Candidates are accepted in their original order, never exceeding `needed`.
   */
  private async verifyCandidateBatch(params: {
    rawQuestions: GroundedQuestion[];
    bookId: string;
    chapterId: string;
    chunks: RetrievedChunk[];
    existing: GroundedQuestion[];
    contextWords: Set<string>;
    needed: number;
    isSeenByStudent: (q: GroundedQuestion) => boolean;
    label: string;
    concurrency?: number;
  }): Promise<GroundedQuestion[]> {
    const { rawQuestions, bookId, chapterId, chunks, existing, contextWords, needed, isSeenByStudent, label } = params;
    const concurrency = Math.max(1, params.concurrency ?? 4);
    const norm = (t: string) => t.trim().toLowerCase().replace(/[؟\?\.\!\s]+/g, ' ');
    const taken = new Set<string>(existing.map(q => norm(q.question_text)));
    const takenIds = new Set<string>(existing.map(q => q.id));

    // Stage A (cheap, sequential): student-history, duplicate and lexical-quality filters
    const prefiltered: GroundedQuestion[] = [];
    for (const q of rawQuestions) {
      if (isSeenByStudent(q)) continue;
      const n = norm(q.question_text);
      if (taken.has(n) || takenIds.has(q.id)) {
        console.log(`🔄 [${label}] Skipping duplicate question: "${q.question_text.slice(0, 40)}"`);
        continue;
      }
      const score = evaluateQuestionQuality(q, [...existing, ...prefiltered], contextWords);
      if (!score.isValid) {
        console.warn(`⚠️ [${label}] Rejected question failing quality: ${score.reason} (Question: "${q.question_text.slice(0, 50)}")`);
        continue;
      }
      taken.add(n);
      prefiltered.push(q);
    }

    // Stage B (expensive, bounded-parallel): strict provenance + independent blind solver
    const solver = this.getBlindSolver();
    const verdicts: boolean[] = new Array(prefiltered.length).fill(false);
    let verifiedSoFar = 0;
    let cursor = 0;
    const worker = async () => {
      while (true) {
        if (verifiedSoFar >= needed) return;
        const idx = cursor++;
        if (idx >= prefiltered.length) return;
        const q = prefiltered[idx];
        try {
          const prov = await verifyQuestionProvenance(q, bookId);
          if (!prov.isVerified) {
            console.warn(`⚠️ [${label}] Rejected question failing strict provenance: ${prov.reason} (Question: "${q.question_text.slice(0, 50)}")`);
            continue;
          }
          const correctOpt = q.options.find(o => o.is_correct);
          const candidatePayload: CandidateQuestionPayload = {
            id: q.id,
            question_text: q.question_text,
            options: q.options.map(o => ({ id: o.id, text: o.text })),
            proposed_correct_option_id: correctOpt?.id || '',
            evidence: {
              book_id: q.book_id || bookId,
              chapter_id: q.chapter_id || chapterId,
              page_number: q.page_reference || 1,
              chunk_id: q.chunk_id || '',
              passage_text: q.chunk_text || chunks.find((c: any) => c.id === q.chunk_id || c.id === (q as any).source_chunk_id)?.content || ''
            },
            diagram_url: q.diagram_url,
            diagram_asset_id: q.diagram_asset_id,
            has_visual_dependency: q.has_visual_dependency
          };
          const verification = await verifyCandidateQuestionWithBlindSolver(candidatePayload, solver);
          if (!verification.is_verified) {
            console.warn(`⚠️ [${label}] Rejected question failing blind solver verification: [${verification.rejection_code}] ${verification.rejection_reason} (Question: "${q.question_text.slice(0, 50)}")`);
            continue;
          }
          verdicts[idx] = true;
          verifiedSoFar++;
        } catch (e: any) {
          console.warn(`⚠️ [${label}] Candidate verification error (fail-closed): ${e?.message || e}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, prefiltered.length) }, () => worker()));

    const accepted: GroundedQuestion[] = [];
    prefiltered.forEach((q, i) => {
      if (verdicts[i] && accepted.length < needed) {
        q.validation_status = { isValid: true, reason: 'VERIFIED_BY_BLIND_SOLVER' };
        accepted.push(q);
      }
    });
    return accepted;
  }

  private async callGeminiForQuestions(
    chunks: RetrievedChunk[],
    count: number,
    bookId: string,
    chapterId: string,
    language: 'ar' | 'en' = 'ar',
    previouslySeenQuestions: string[] = [],
    stageGradeInfo?: {
      gradeNameAr?: string;
      gradeNameEn?: string;
      stageNameAr?: string;
      stageNameEn?: string;
      subjectCode?: string;
      subjectNameAr?: string;
      subjectNameEn?: string;
    }
  ): Promise<GroundedQuestion[] | null> {
    const isEn = language === 'en';
    const subjTitleAr = stageGradeInfo?.subjectNameAr || stageGradeInfo?.subjectCode || 'المادة الدراسية';
    const subjTitleEn = stageGradeInfo?.subjectNameEn || stageGradeInfo?.subjectCode || 'the subject';

    // Dynamic educational level indicators
    const stageInfoAr = stageGradeInfo?.gradeNameAr
      ? `${stageGradeInfo.gradeNameAr}${stageGradeInfo.stageNameAr ? ` - ${stageGradeInfo.stageNameAr}` : ''}`
      : 'المرحلة والصف الدراسي المقرر';
    const stageInfoEn = stageGradeInfo?.gradeNameEn
      ? `${stageGradeInfo.gradeNameEn}${stageGradeInfo.stageNameEn ? ` - ${stageGradeInfo.stageNameEn}` : ''}`
      : 'the target school grade level';

    // 40% Knowledge, 30% Understanding, 20% Application, 10% Analysis
    const knowledgeCount = Math.max(1, Math.round(count * 0.4));
    const understandingCount = Math.max(1, Math.round(count * 0.3));
    const applicationCount = Math.max(1, Math.round(count * 0.2));
    const analysisCount = Math.max(1, count - knowledgeCount - understandingCount - applicationCount);

    // Format educational chunks without any page numbers or structural headers
    const contextText = chunks
      .slice(0, Math.min(chunks.length, 6))
      .map((c, idx) => `[المحتوى التعليمي ${idx + 1}]:\n${c.content.trim()}`)
      .join('\n\n');

    const avoidanceNotice = previouslySeenQuestions.length > 0
      ? (isEn
          ? `\nIMPORTANT: The student has already answered these questions in past exams. You MUST generate totally different questions testing other concepts and definitions in this lesson without repeating:\n${previouslySeenQuestions.slice(0, 10).map(t => `- ${t}`).join('\n')}\n`
          : `\nتنبيه هام جداً: خاض هذا الطالب سابقاً امتحانات تضمنت الأسئلة التالية. يجب عليك صياغة أسئلة جديدة ومختلفة تماماً تغطي مفاهيم وجوانب أخرى في الدرس دون أي تكرار:\n${previouslySeenQuestions.slice(0, 10).map(t => `- ${t}`).join('\n')}\n`)
      : '';

    const prompt = isEn ? `You are an experienced senior school teacher creating an official school examination in ${subjTitleEn} for students (${stageInfoEn}).
Task: Create exactly ${count} multiple-choice questions strictly testing educational concepts, definitions, formulas, and scientific reasoning from the provided textbook content of ${subjTitleEn}.

CRITICAL SUBJECT ISOLATION & CURRICULUM ACCURACY (STRICT):
1. You MUST generate questions derived strictly from ${subjTitleEn}.
2. If ${subjTitleEn} is Science or Mathematics, generate questions testing scientific laws, mathematical equations, chemical formulas, calculations, and exact units (e.g. D = M / V, v = d / t, 2x + 6 = 18, CaCO3, H2O, m/s).
3. NEVER generate questions belonging to another subject (e.g. DO NOT generate English grammar for Science or Math).

Teacher Language & Educational Quality Rules (STRICT):
1. Language Level & Vocabulary (STRICT REQUIREMENT):
   - Use simple, age-appropriate, school-level English vocabulary suitable for students at this educational stage (${stageInfoEn}).
   - Prefer common, clear words that students and teachers regularly use in school educational environments.
   - Do NOT use advanced, obscure, overly academic, uncommon, complex, or university-level vocabulary unless the curriculum concept explicitly requires that specific technical term.
   - Always match the language level to the student's educational stage while maintaining clarity, grammatical correctness, and high educational quality.
2. Write questions exactly as a real teacher writes official exams:
   - Definitions: "What is defined as...?" or "Which scientific term denotes...?"
   - Scientific reasoning: "Why does...?" or "What is the scientific explanation for...?"
   - Cause and effect: "What happens when...?" or "If ... increases, then...?"
   - Problem solving / Calculations: "Calculate the value of..." or "If a body moves with... then...?"
   - Real-life applications: "Which of the following is an application of...?"
3. ZERO AI-style wording. STRICTLY FORBIDDEN:
   - "According to the text"
   - "Based on the provided content"
   - "From the passage above"
   - "As mentioned in the lesson"
   - "Which of the following is a fact mentioned in the text"
4. Focus on deep understanding, not rote verbatim recall. Do NOT copy entire textbook sentences.
5. Concise options:
   - Maximum 8 words per option using simple, standard school vocabulary.
   - Exactly 1 correct option and 3 realistic distractors.
6. Explanation:
   - Maximum 1–2 short sentences written as a teacher's direct answer key using clear, simple school-level English.
7. ZERO document structure: Never mention page numbers, chapters, lessons, units, headings, or publisher info.
8. MANDATORY GROUNDING: The correct answer (or its key terms) must appear explicitly in the provided content. Do not ask questions whose answers must come from outside the provided content.
${avoidanceNotice}
Educational Textbook Content:
${contextText}

Respond ONLY with a valid JSON array of objects (no markdown, no code fences, no extra text):
[
  {
    "question_text": "Direct teacher-style exam question in simple school English",
    "options": [
      { "text": "Concise option (< 8 words)", "is_correct": false },
      { "text": "Correct concise option", "is_correct": true },
      { "text": "Concise distractor", "is_correct": false },
      { "text": "Concise distractor", "is_correct": false }
    ],
    "difficulty": "EASY" | "MEDIUM" | "HARD",
    "bloom_level": "KNOWLEDGE" | "UNDERSTANDING" | "APPLICATION" | "ANALYSIS",
    "explanation": "Direct 1-2 sentence teacher explanation in simple, clear educational English."
  }
]` : `أنت معلم تربوي أول وخبير في إعداد الامتحانات المدرسية الرسمية لمادة (${subjTitleAr}) لطلاب (${stageInfoAr}).
مهمتك: صياغة ${count} أسئلة اختيار من متعدد موضوعية ودقيقة مبنية حصرياً على المفاهيم العلمية والقوانين والتعريفات الموجودة في المحتوى المرفق لمادة (${subjTitleAr}).

ضوابط المادة التخصصية والأسئلة العلمية (صارمة وإلزامية):
1. الالتزام الحصري بمادة (${subjTitleAr}): لا تولد أسئلة من مواد أخرى إطلاقاً.
2. إذا كانت المادة هي العلوم أو الرياضيات، يجب أن تتضمن الأسئلة والخيارات القوانين العلمية والمعادلات الرياضية والصيغ الكيميائية ووحدات القياس والمسائل الحسابية الدقيقة (مثل: ث = ك / ح، سرعة = مسافة / زمن، 2س + 6 = 18، NaCl، طاقة الحركة، الكثافة).
3. إذا كانت المادة هي اللغة العربية، يجب أن تتضمن أسئلة النحو والإعراب التشكيل الكامل (الحركات الإعرابية: الفتحة، الضمة، الكسرة، السكون) لضبط القواعد بدقة.
4. يُمنع منعاً باتاً خلط المواد (مثال: يمنع تماماً وضع أسئلة لغة إنجليزية في مادة العلوم أو الرياضيات، أو وضع أسئلة علوم في اللغة العربية).

ضوابط لغة المعلم وقواعد الصياغة التربوية (إلزامية وصارمة):
1. الالتزام الكامل باللغة العربية الفصحى (Modern Standard Arabic):
   - استخدم اللغة العربية الفصحى السليمة فقط في جميع الأسئلة والخيارات والشروح والتعليمات.
   - يُمنع منعاً باتاً ومطلقاً استخدام أي تعبيرات عامية، أو لهجات دارجة، أو ألفاظ غير رسمية، أو عبارات شوارع أو اصطلاحات إقليمية (مثل: "جامدة"، "حلوة"، "شاطر"، "أوي"، "كدا"، وغيرها).
   - احرص على أن تكون جميع الأسئلة والخيارات والشروح مصوغة بلغة تعليمية تربوية رصينة وواضحة ومناسبة تماماً للمدارس والبيئة التعليمية.
   - طابق المستوى اللغوي بدقة مع المرحلة والصف الدراسي للطلاب (${stageInfoAr}) مع الحفاظ التام على الوضوح وصحة التعبير وجودة المحتوى التربوي.
2. صياغة الأسئلة كمعلم حقيقي في امتحان وزاري مدرسي:
   - التعريفات والمصطلحات: "ما المقصود بـ..." أو "المصطلح العلمي الذي يعبر عن..."
   - التعليل والتفسير العلمي: "علل لما يأتي: ..." أو "ما التفسير العلمي لـ..."
   - السبب والنتيجة: "ماذا يحدث عند...؟" أو "إذا تغيرت... فإن..."
   - المسائل والقوانين: "احسب قيمة..." أو "إذا كانت... فإن..."
   - المقارنات والتطبيقات الحياتية: "أي مما يلي يعتبر تطبيقاً على..."
3. ممنوع منعاً باتاً أسلوب الذكاء الاصطناعي:
   - لا تبدأ أبداً بـ: "وفقاً للنص"، "بناءً على ما ورد"، "من الفقرة السابقة"، "كما ذكر في الدرس"، "أي من العبارات حقيقة مذكورة".
4. ركز على الفهم الحقيقي وتطبيق القوانين، وتجنب نسخ نصوص كاملة من الكتاب.
5. الخيارات الأربعة:
   - يجب أن تكون موجزة جداً (أقل من 8 كلمات لكل خيار) بلغة عربية فصحى نقية.
   - إجابة واحدة فقط صحيحة وثلاثة مشتتات ذكية.
6. التفسير/شرح الإجابة (explanation):
   - جملة أو جملتان قصيرتان كنموذج إجابة معلم (مباشر ومحدد بلغة فصحى تعليمية واضحة ورصينة).
7. ممنوع تماماً ذكر أرقام الصفحات أو الفصول أو الوحدات أو أي معلومات وصفية.
8. التوثيق الإلزامي: يجب أن تكون الإجابة الصحيحة (أو مصطلحها/كلماتها الأساسية) واردة صراحةً في المحتوى المرفق، وأن تُبنى أسئلة النحو والإعراب والصرف على كلمات وجمل وقواعد وردت فعلاً في المحتوى. يُمنع طرح أسئلة تتطلب إجابات من خارج المحتوى (مثل أوزان أو إعراب كلمات لم ترد فيه)، ويُمنع أن تختلف خيارات السؤال عن بعضها بالتشكيل فقط.
${avoidanceNotice}
المحتوى التعليمي المقرر لمادة (${subjTitleAr}):
${contextText}

أجب بصيغة JSON فقط مصفوفة كائنات دون أي نصوص إضافية:
[
  {
    "question_text": "نص السؤال الامتحاني المباشر بلغة فصحى سليمة",
    "options": [
      { "text": "خيار موجز بالفصحى (أقل من 8 كلمات)", "is_correct": false },
      { "text": "خيار صحيح موجز بالفصحى", "is_correct": true },
      { "text": "خيار مشتت موجز بالفصحى", "is_correct": false },
      { "text": "خيار مشتت موجز بالفصحى", "is_correct": false }
    ],
    "difficulty": "EASY" | "MEDIUM" | "HARD",
    "bloom_level": "KNOWLEDGE" | "UNDERSTANDING" | "APPLICATION" | "ANALYSIS",
    "explanation": "شرح مباشر من جملة واحدة كنموذج إجابة بالفصحى."
  }
]`;

    try {
      let rawText = await GeminiClient.generateContent({
        prompt,
        responseMimeType: 'application/json',
        temperature: 0.2
      });

      if (rawText) {
        if (rawText.includes('Insufficient educational content for assessment generation.')) {
          throw new Error('Insufficient educational content for assessment generation.');
        }

        rawText = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
        const jsonStart = rawText.indexOf('[');
        const jsonEnd = rawText.lastIndexOf(']');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          rawText = rawText.substring(jsonStart, jsonEnd + 1);
        }

        let parsed: any = null;
        try {
          parsed = JSON.parse(rawText);
        } catch (pErr) {
          try {
            const repaired = rawText.trim().replace(/,\s*$/, '') + ']';
            parsed = JSON.parse(repaired);
          } catch (pErr2) {
            const objMatches = rawText.match(/\{[\s\S]*?"question_text"[\s\S]*?\}/g);
            if (objMatches && objMatches.length > 0) {
              parsed = [];
              for (const objStr of objMatches) {
                try { parsed.push(JSON.parse(objStr)); } catch (e) {}
              }
            }
          }
        }

        if (Array.isArray(parsed) && parsed.length > 0) {
          const generatedList = parsed.map((q: any) => {
            const qWords = String(q.question_text || '').toLowerCase().split(/[^\w\u0600-\u06FF]+/).filter(w => w.length > 3);
            const correctOpt = (Array.isArray(q.options) ? q.options : []).find((o: any) => o.is_correct)?.text?.toLowerCase() || '';

            let bestChunk: RetrievedChunk | null = null;
            let bestScore = 0;
            for (const chunk of chunks) {
              const cLower = (chunk.content || '').toLowerCase();
              let score = 0;
              for (const w of qWords) {
                if (cLower.includes(w)) score += 2;
              }
              if (correctOpt && cLower.includes(correctOpt)) {
                score += 5;
              }
              if (score > bestScore) {
                bestScore = score;
                bestChunk = chunk;
              }
            }

            if (!bestChunk || bestScore <= 0) {
              // Reject: Question has no grounding in any of the retrieved textbook chunks
              return null;
            }

            const assignedChunk = bestChunk;
            const sanitizedQText = String(q.question_text || '').replace(/صفحة\s*\d+/g, '').replace(/\bpage\s*\d+/gi, '').trim();
            const optionsList: { id: string; text: string; is_correct: boolean }[] = shuffleArray<{ id: string; text: string; is_correct: boolean }>(
              (Array.isArray(q.options) ? q.options : []).map((opt: any) => ({
                id: uuidv4(),
                text: String(opt?.text || '').trim(),
                is_correct: !!opt?.is_correct
              }))
            );

            // Multimodal Asset Binding: lookup verified visual assets for page or chapter
            const isGeom = DISQUALIFIED_GEOMETRY_CHAPTER_IDS.has(chapterId);
            const hasVisualMarker = VISUAL_INDICATOR_REGEX.test(sanitizedQText) || VISUAL_INDICATOR_REGEX.test(assignedChunk.content || '');
            const pageAssets = VisualAssetExtractor.getAssetsForPage(bookId, assignedChunk.page_number || 1);
            const chapterAssets = VisualAssetExtractor.getAssetsForChapter(bookId, chapterId);
            const verifiedAsset = pageAssets.find(a => a.asset_type === 'diagram') ||
                                  pageAssets[0] ||
                                  (isGeom || hasVisualMarker ? chapterAssets[0] : undefined);

            const resultQ: GroundedQuestion = {
              id: uuidv4(),
              chunk_id: assignedChunk.id,
              book_id: bookId,
              chapter_id: chapterId,
              question_text: sanitizedQText,
              options: optionsList,
              difficulty: q.difficulty || 'MEDIUM',
              bloom_level: (q.bloom_level || 'UNDERSTANDING').toUpperCase(),
              page_reference: assignedChunk.page_number || 1,
              source_excerpt: assignedChunk.content?.slice(0, 150) || '',
              explanation: q.explanation || '',
              chunk_text: assignedChunk.content || '',
              similarity_score: Number((assignedChunk.similarity ?? 1.0).toFixed(4)),
              diagram_url: verifiedAsset ? VisualAssetExtractor.getAssetApiUrl(verifiedAsset) : (q.diagram_url || undefined),
              diagram_asset_id: verifiedAsset ? verifiedAsset.asset_id : (q.diagram_asset_id || undefined),
              has_visual_dependency: Boolean(verifiedAsset || q.has_visual_dependency || hasVisualMarker || isGeom)
            };
            resultQ.validation_status = validateEducationalQuestion(resultQ);
            return resultQ;
          }).filter((q): q is GroundedQuestion => q !== null);

          return generatedList.length > 0 ? generatedList : null;
        }
      }
    } catch (mErr: any) {
      if (mErr.message === 'Insufficient educational content for assessment generation.') {
        throw mErr;
      }
      console.warn('GeminiClient generation warning:', mErr);
    }
    return null;
  }


  /**
   * Evaluates student answers with grounded RAG, diagnoses mistakes,
   * generates targeted study guidance, and updates student topic analytics.
   */
  public async evaluateSubmission(params: {
    studentId: string;
    academicStageId: string;
    gradeId: string;
    subjectId: string;
    bookId: string;
    chapterId: string;
    attemptId?: string;
    questions: GroundedQuestion[];
    studentAnswers: { question_id: string; selected_option_id: string }[];
  }): Promise<FullDiagnosticReport> {
    const { studentId, academicStageId, gradeId, subjectId, bookId, chapterId, attemptId, questions, studentAnswers } = params;

    // Fetch chapter title
    const chRes = await db.query(`SELECT title_ar, title_en, chapter_number FROM book_chapters WHERE id = $1`, [chapterId]);
    const firstQText = (questions[0]?.question_text || '') + ' ' + (questions[0]?.explanation || '');
    const isEnEvaluation = (firstQText.match(/[a-zA-Z]/g) || []).length > (firstQText.match(/[\u0600-\u06FF]/g) || []).length;
    const chapterName = isEnEvaluation 
      ? (chRes.rows[0]?.title_en || chRes.rows[0]?.title_ar || 'Chapter') 
      : (chRes.rows[0]?.title_ar || 'الفصل الدراسي المقبول');

    let authoritativeScore = 0;
    let authoritativeMaxScore = 0;
    let provisionalScore = 0;
    const provisionalMaxScore = questions.length;
    const items: EvaluationItemResult[] = [];
    const weakTopics: string[] = [];
    const strongTopics: string[] = [];
    const authoritativeWeakTopics: string[] = [];
    const authoritativeStrongTopics: string[] = [];

    let pendingReviewCount = 0;
    let deterministicallyVerifiedCount = 0;

    for (const q of questions) {
      const submission = studentAnswers.find(a => a.question_id === q.id);
      const selectedOptId = submission?.selected_option_id || '';
      const selectedOpt = q.options.find(o => o.id === selectedOptId);
      const correctOpt = q.options.find(o => o.is_correct);

      const isCorrect = selectedOpt ? !!selectedOpt.is_correct : false;
      const provPoints = isCorrect ? 1 : 0;
      provisionalScore += provPoints;

      // Validate answer key status deterministically
      const valResult = AnswerValidationService.validateQuestion(q);
      const answerKeyStatus = valResult.answerKeyStatus;
      const isAuthoritativeEligible = answerKeyStatus === 'DETERMINISTICALLY_VERIFIED';

      let authPoints: number | null = null;
      if (isAuthoritativeEligible) {
        deterministicallyVerifiedCount++;
        authoritativeMaxScore += 1;
        authPoints = isCorrect ? 1 : 0;
        authoritativeScore += authPoints;
      } else {
        pendingReviewCount++;
      }

      let studyRec = '';
      if (isEnEvaluation) {
        if (!isCorrect) {
          studyRec = `🎯 Action Plan: Open ${chapterName} - [Page ${q.page_reference}] and review: "${(q.source_excerpt || '').slice(0, 80)}...". Bloom Level: ${q.bloom_level}.`;
          weakTopics.push(`Page ${q.page_reference} Concept: ${q.question_text.slice(0, 45)}`);
          if (isAuthoritativeEligible) {
            authoritativeWeakTopics.push(`Page ${q.page_reference} Concept: ${q.question_text.slice(0, 45)}`);
          }
        } else {
          studyRec = `✅ Mastered: Successfully demonstrated comprehension of page ${q.page_reference} concept.`;
          strongTopics.push(`Mastered Page ${q.page_reference} Concept`);
          if (isAuthoritativeEligible) {
            authoritativeStrongTopics.push(`Mastered Page ${q.page_reference} Concept`);
          }
        }
      } else {
        if (!isCorrect) {
          studyRec = `🎯 خطة المراجعة: راجع ${chapterName} - [صفحة ${q.page_reference}] وراجع بعناية: "${(q.source_excerpt || '').slice(0, 80)}...". مفهوم: ${q.bloom_level}.`;
          weakTopics.push(`مفهوم صفحة ${q.page_reference}: ${q.question_text.slice(0, 45)}`);
          if (isAuthoritativeEligible) {
            authoritativeWeakTopics.push(`مفهوم صفحة ${q.page_reference}: ${q.question_text.slice(0, 45)}`);
          }
        } else {
          studyRec = `✅ إتقان تام: تم استيعاب مفهوم صفحة ${q.page_reference} بنجاح.`;
          strongTopics.push(`إتقان مفهوم صفحة ${q.page_reference}`);
          if (isAuthoritativeEligible) {
            authoritativeStrongTopics.push(`إتقان مفهوم صفحة ${q.page_reference}`);
          }
        }
      }

      items.push({
        question_id: q.id,
        question_text: q.question_text,
        selected_option_id: selectedOptId,
        student_answer_text: selectedOpt?.text || (isEnEvaluation ? 'No answer selected' : 'لم يتم اختيار إجابة'),
        correct_answer_text: correctOpt?.text || '',
        is_correct: isCorrect,
        points: isAuthoritativeEligible ? provPoints : 0,
        authoritative_points: authPoints,
        is_authoritatively_scored: isAuthoritativeEligible,
        answer_key_status: answerKeyStatus,
        verification_method: valResult.verificationMethod,
        explanation: q.explanation,
        page_reference: q.page_reference,
        topic_area: isEnEvaluation ? `${chapterName} (p. ${q.page_reference})` : `${chapterName} (ص ${q.page_reference})`,
        study_recommendation: studyRec
      });
    }

    const provisionalPercentage = Number(((provisionalScore / (provisionalMaxScore || 1)) * 100).toFixed(1));
    const authoritativePercentage = authoritativeMaxScore > 0
      ? Number(((authoritativeScore / authoritativeMaxScore) * 100).toFixed(1))
      : null;

    let authoritativeMasteryStatus: 'MASTERED' | 'PROFICIENT' | 'DEVELOPING' | 'NEEDS_WORK' | 'PENDING_REVIEW' = 'PENDING_REVIEW';
    if (authoritativePercentage !== null) {
      if (authoritativePercentage >= 85) authoritativeMasteryStatus = 'MASTERED';
      else if (authoritativePercentage >= 70) authoritativeMasteryStatus = 'PROFICIENT';
      else if (authoritativePercentage >= 50) authoritativeMasteryStatus = 'DEVELOPING';
      else authoritativeMasteryStatus = 'NEEDS_WORK';
    }

    let provisionalMasteryStatus: 'MASTERED' | 'PROFICIENT' | 'DEVELOPING' | 'NEEDS_WORK' = 'NEEDS_WORK';
    if (provisionalPercentage >= 85) provisionalMasteryStatus = 'MASTERED';
    else if (provisionalPercentage >= 70) provisionalMasteryStatus = 'PROFICIENT';
    else if (provisionalPercentage >= 50) provisionalMasteryStatus = 'DEVELOPING';

    const reportId = attemptId || uuidv4();

    const fullReport: FullDiagnosticReport = {
      evaluation_id: reportId,
      student_id: studentId,
      book_id: bookId,
      chapter_id: chapterId,
      subject_id: subjectId,
      // Authoritative scores (only from deterministically verified questions)
      authoritative_score: authoritativeScore,
      authoritative_max_score: authoritativeMaxScore,
      authoritative_percentage: authoritativePercentage,
      authoritative_mastery_status: authoritativeMasteryStatus,
      // Provisional formative scores (for complete learning guidance)
      provisional_score: provisionalScore,
      provisional_max_score: provisionalMaxScore,
      provisional_percentage: provisionalPercentage,
      provisional_mastery_status: provisionalMasteryStatus,
      // Metadata
      has_unverified_questions: pendingReviewCount > 0,
      verified_questions_count: deterministicallyVerifiedCount,
      pending_review_count: pendingReviewCount,
      overall_review_status: pendingReviewCount === 0
        ? 'FULLY_VERIFIED'
        : deterministicallyVerifiedCount > 0
          ? 'PARTIALLY_VERIFIED'
          : 'PENDING_TEACHER_REVIEW',
      // Legacy backward-compatible fields
      score: authoritativeMaxScore > 0 ? authoritativeScore : provisionalScore,
      max_score: authoritativeMaxScore > 0 ? authoritativeMaxScore : provisionalMaxScore,
      percentage: authoritativePercentage !== null ? authoritativePercentage : provisionalPercentage,
      mastery_status: authoritativeMaxScore > 0 ? (authoritativeMasteryStatus as any) : provisionalMasteryStatus,
      items: items,
      weak_topics: weakTopics,
      strong_topics: strongTopics,
      overall_feedback_ar: provisionalPercentage >= 85
        ? 'أداء متميز واستيعاب عالي لنصوص وأفكار الكتاب المدرسي.'
        : provisionalPercentage >= 60
        ? 'مستوى جيد، ولكن توجد نقاط محددة تحتاج لإعادة مراجعة من صفحات الكتاب الموضحة بالتقرير.'
        : 'بحاجة إلى تركيز وإعادة قراءة الصفحات المحددة في خطة المراجعة قبل المحاولة التالية.',
      overall_feedback_en: provisionalPercentage >= 85
        ? 'Excellent performance with strong mastery of textbook concepts.'
        : provisionalPercentage >= 60
        ? 'Good progress, but specific concepts need review from the cited textbook pages.'
        : 'Requires focused review of the cited textbook sections before re-evaluating.'
    };

    fullReport.analytics_synced = false;

    // Save to ai_evaluations
    await db.query(
      `INSERT INTO ai_evaluations (
         id, student_id, book_id, chapter_id, subject_id, score, total_questions,
         questions_data, student_answers_data, evaluation_report
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        reportId,
        studentId,
        bookId,
        chapterId,
        subjectId,
        authoritativeMaxScore > 0 ? authoritativeScore : 0,
        authoritativeMaxScore,
        JSON.stringify(questions),
        JSON.stringify(studentAnswers),
        JSON.stringify(fullReport)
      ]
    );

    // Update student topic mastery analytics ONLY IF there are authoritative verified questions!
    if (authoritativeMaxScore > 0 && authoritativePercentage !== null) {
      await this.updateTopicMastery({
        studentId,
        subjectId,
        chapterId,
        totalAttempted: authoritativeMaxScore,
        totalCorrect: authoritativeScore,
        weakTopics: authoritativeWeakTopics,
        strongTopics: authoritativeStrongTopics
      });

      // Record into student learning history ONLY for authoritative results
      await db.query(
        `INSERT INTO student_learning_history (
           id, student_id, event_type, reference_id, subject_id, chapter_id,
           score_percentage, weak_areas
         ) VALUES ($1, $2, 'AI_ASSESSMENT', $3, $4, $5, $6, $7)`,
        [
          uuidv4(),
          studentId,
          reportId,
          subjectId,
          chapterId,
          authoritativePercentage,
          JSON.stringify(authoritativeWeakTopics)
        ]
      );

      fullReport.analytics_synced = true;
      fullReport.synced_at = new Date().toISOString();
      await db.query(
        `UPDATE ai_evaluations SET evaluation_report = $1 WHERE id = $2`,
        [JSON.stringify(fullReport), reportId]
      );
    } else {
      fullReport.analytics_synced = true;
      console.log(`ℹ️ [AI Evaluation] Submission for chapter ${chapterId} contains 0 deterministically verified questions (${pendingReviewCount} pending review). Authoritative mastery and learning history left uncorrupted.`);
    }

    return fullReport;
  }

  /**
   * Safe, idempotent recovery of missing analytics for an existing evaluation.
   * Ensures topic mastery and learning history are recorded without double-counting.
   */
  public async recoverEvaluationAnalytics(params: {
    attemptId: string;
    studentId: string;
    subjectId: string;
    chapterId: string;
    report: FullDiagnosticReport;
  }): Promise<void> {
    const { attemptId, studentId, subjectId, chapterId, report } = params;

    // 1. Check if learning history is already recorded
    const historyCheck = await db.query(
      `SELECT id FROM student_learning_history WHERE reference_id = $1`,
      [attemptId]
    );

    if (historyCheck.rows.length === 0 && (report.authoritative_max_score || 0) > 0 && report.authoritative_percentage !== null) {
      // 2. Safe topic mastery update
      await this.updateTopicMastery({
        studentId,
        subjectId,
        chapterId,
        totalAttempted: report.authoritative_max_score,
        totalCorrect: report.authoritative_score || 0,
        weakTopics: (report.items || []).filter(i => i.is_authoritatively_scored && !i.is_correct).map(i => i.question_text.slice(0, 45)),
        strongTopics: (report.items || []).filter(i => i.is_authoritatively_scored && i.is_correct).map(i => i.question_text.slice(0, 45))
      });

      // 3. Record into student learning history
      await db.query(
        `INSERT INTO student_learning_history (
           id, student_id, event_type, reference_id, subject_id, chapter_id,
           score_percentage, weak_areas
         ) VALUES ($1, $2, 'AI_ASSESSMENT', $3, $4, $5, $6, $7)`,
        [
          uuidv4(),
          studentId,
          attemptId,
          subjectId,
          chapterId,
          report.authoritative_percentage,
          JSON.stringify(report.weak_topics || [])
        ]
      );
    }

    // 4. Update ai_evaluations report with synced state
    report.analytics_synced = true;
    report.synced_at = new Date().toISOString();
    await db.query(
      `UPDATE ai_evaluations SET evaluation_report = $1 WHERE id = $2`,
      [JSON.stringify(report), attemptId]
    );
  }

  private async updateTopicMastery(params: {
    studentId: string;
    subjectId: string;
    chapterId: string;
    totalAttempted: number;
    totalCorrect: number;
    weakTopics: string[];
    strongTopics: string[];
  }): Promise<void> {
    const { studentId, subjectId, chapterId, totalAttempted, totalCorrect, weakTopics, strongTopics } = params;

    const existing = await db.query(
      `SELECT * FROM student_topic_mastery WHERE student_id = $1 AND subject_id = $2 AND chapter_id = $3`,
      [studentId, subjectId, chapterId]
    );

    if (existing.rows.length > 0) {
      const prev = existing.rows[0];
      const newAttempted = prev.total_attempted + totalAttempted;
      const newCorrect = prev.total_correct + totalCorrect;
      const newPct = Number(((newCorrect / (newAttempted || 1)) * 100).toFixed(1));

      let newStatus: 'MASTERED' | 'PROFICIENT' | 'DEVELOPING' | 'NEEDS_WORK' = 'NEEDS_WORK';
      if (newPct >= 85) newStatus = 'MASTERED';
      else if (newPct >= 70) newStatus = 'PROFICIENT';
      else if (newPct >= 50) newStatus = 'DEVELOPING';

      await db.query(
        `UPDATE student_topic_mastery SET 
           total_attempted = $4,
           total_correct = $5,
           mastery_percentage = $6,
           status = $7,
           weak_subtopics = $8,
           strong_subtopics = $9,
           last_assessed_at = NOW()
         WHERE student_id = $1 AND subject_id = $2 AND chapter_id = $3`,
        [
          studentId, subjectId, chapterId,
          newAttempted, newCorrect, newPct, newStatus,
          JSON.stringify(weakTopics), JSON.stringify(strongTopics)
        ]
      );
    } else {
      const pct = Number(((totalCorrect / (totalAttempted || 1)) * 100).toFixed(1));
      let status: 'MASTERED' | 'PROFICIENT' | 'DEVELOPING' | 'NEEDS_WORK' = 'NEEDS_WORK';
      if (pct >= 85) status = 'MASTERED';
      else if (pct >= 70) status = 'PROFICIENT';
      else if (pct >= 50) status = 'DEVELOPING';

      await db.query(
        `INSERT INTO student_topic_mastery (
           id, student_id, subject_id, chapter_id, total_attempted, total_correct,
           mastery_percentage, status, weak_subtopics, strong_subtopics
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          uuidv4(),
          studentId,
          subjectId,
          chapterId,
          totalAttempted,
          totalCorrect,
          pct,
          status,
          JSON.stringify(weakTopics),
          JSON.stringify(strongTopics)
        ]
      );
    }
  }
}

export { AIRagEngine };
export const aiRagEngine = new AIRagEngine();
