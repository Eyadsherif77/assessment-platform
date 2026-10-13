import crypto from 'crypto';

/**
 * Answer Key and Question Structural Validation Service
 * 
 * Enforces strict separation among:
 * 1. Source Provenance (grounding in authoritative textbook pages/chunks)
 * 2. Structural Question/Option Integrity (format, identifiers, duplicate detection)
 * 3. Independently Verified Answer-Key Correctness (deterministic evaluation)
 * 4. Questions Requiring Teacher Review (semantic / subject-matter judgment)
 */

export class MissingIntegritySecretError extends Error {
  constructor(message = 'EXAM_INTEGRITY_SECRET is required to compute or verify canonical fingerprint') {
    super(message);
    this.name = 'MissingIntegritySecretError';
  }
}

export interface CanonicalQuestionFingerprintPayload {
  schema_version: 'v1';
  question_text: string;
  options: Array<{ id: string; text: string; order: number }>;
  correct_option_id: string;
  curriculum_scope: {
    book_id: string;
    chapter_id: string;
    grade_id?: string;
    subject_id?: string;
  };
  evidence_binding: {
    chunk_id: string;
    page_number: number;
    passage_sha256: string;
  };
  verification_audit: {
    verifier_model: string;
    verified_at: string;
  };
}

export interface MathEvaluationResult {
  success: boolean;
  value?: number;
  simplifiedString?: string;
  isExact?: boolean;
  error?: string;
}

// ============================================================================
// PHASE 4G.3A ISOLATED IN-MEMORY UTILITIES
// ============================================================================

/**
 * Deterministically sort all object keys recursively for canonical JSON serialization.
 */
function deepSortKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(deepSortKeys);
  }
  const sorted: Record<string, any> = {};
  const keys = Object.keys(obj).sort();
  for (const k of keys) {
    sorted[k] = deepSortKeys(obj[k]);
  }
  return sorted;
}

/**
 * Prepare a canonical representation of the question fingerprint payload.
 * Sorts options by order (then ID) and recursively sorts object keys.
 */
function prepareCanonicalPayload(payload: CanonicalQuestionFingerprintPayload): any {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload for canonical fingerprinting');
  }

  const sortedOptions = Array.isArray(payload.options)
    ? [...payload.options].sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return String(a.id).localeCompare(String(b.id));
      })
    : [];

  const normalized = {
    ...payload,
    options: sortedOptions
  };

  return deepSortKeys(normalized);
}

/**
 * Compute an HMAC-SHA256 signature binding the canonical question payload.
 * Format: v1:<hex_digest>
 * Uses secretKey argument if provided, or process.env.EXAM_INTEGRITY_SECRET.
 * Throws MissingIntegritySecretError if no secret is available.
 */
export function computeCanonicalFingerprint(
  payload: CanonicalQuestionFingerprintPayload,
  secretKey?: string
): string {
  const secret = secretKey || process.env.EXAM_INTEGRITY_SECRET;
  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
    throw new MissingIntegritySecretError();
  }

  const canonicalObj = prepareCanonicalPayload(payload);
  const canonicalJson = JSON.stringify(canonicalObj);

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(canonicalJson, 'utf8');
  const signatureHex = hmac.digest('hex');

  return `v1:${signatureHex}`;
}

/**
 * Constant-time verification of a question's HMAC-SHA256 canonical fingerprint.
 * Returns true if valid, false if signature or payload was modified.
 */
export function verifyCanonicalFingerprint(
  payload: CanonicalQuestionFingerprintPayload,
  signature: string,
  secretKey?: string
): boolean {
  try {
    if (!signature || typeof signature !== 'string' || !signature.startsWith('v1:')) {
      return false;
    }
    const expectedSig = computeCanonicalFingerprint(payload, secretKey);
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');

    if (sigBuf.length !== expBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch (err) {
    if (err instanceof MissingIntegritySecretError) {
      throw err;
    }
    return false;
  }
}

// ============================================================================
// PHASE 4G.3E SERVER-AUTHORITATIVE EXAM ATTEMPT TOKEN UTILITIES
// ============================================================================

export interface ExamAttemptTokenPayload {
  schema_version: 'v1';
  attempt_id: string;
  student_id: string;
  cached_exam_id: string;
  config_hash: string;
  content_hash: string;
  version_number: number;
  question_ids: string[];
  issued_at: number;
  expires_at: number;
}

function getExamAttemptSecret(customSecret?: string): string {
  const secret = customSecret || process.env.EXAM_ATTEMPT_SECRET || process.env.EXAM_INTEGRITY_SECRET || process.env.JWT_SECRET;
  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
    throw new MissingIntegritySecretError('A valid non-empty secret (EXAM_ATTEMPT_SECRET / EXAM_INTEGRITY_SECRET / JWT_SECRET) is required to sign or verify exam attempt tokens');
  }
  return secret.trim();
}

/**
 * Signs an authoritative student exam attempt session payload into a tamper-proof token.
 * Uses HMAC-SHA256 with base64url encoding and canonical sorted keys.
 * Format: v1.<payload_b64url>.<signature_b64url>
 */
export function signExamAttemptToken(
  payload: ExamAttemptTokenPayload,
  secretKey?: string
): string {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid attempt token payload: must be an object');
  }
  if (!payload.attempt_id || !payload.student_id || !payload.cached_exam_id || !payload.content_hash) {
    throw new Error('Attempt token payload missing required security fields (attempt_id, student_id, cached_exam_id, content_hash)');
  }

  const secret = getExamAttemptSecret(secretKey);
  const canonicalObj = deepSortKeys(payload);
  const jsonStr = JSON.stringify(canonicalObj);
  const payloadB64 = Buffer.from(jsonStr, 'utf8').toString('base64url');

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`v1.${payloadB64}`, 'utf8');
  const signatureB64 = hmac.digest('base64url');

  return `v1.${payloadB64}.${signatureB64}`;
}

/**
 * Validates and verifies an authoritative student exam attempt token using constant-time HMAC check.
 * Checks signature, format, required fields, and expiration timestamp.
 */
export function verifyExamAttemptToken(
  token: string,
  secretKey?: string
): { valid: boolean; payload?: ExamAttemptTokenPayload; error?: string } {
  try {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'TOKEN_EMPTY' };
    }
    const trimmed = token.trim();
    const parts = trimmed.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') {
      return { valid: false, error: 'TOKEN_FORMAT_INVALID' };
    }

    const [, payloadB64, signatureB64] = parts;
    const secret = getExamAttemptSecret(secretKey);

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`v1.${payloadB64}`, 'utf8');
    const expectedSigB64 = hmac.digest('base64url');

    const sigBuf = Buffer.from(signatureB64, 'utf8');
    const expBuf = Buffer.from(expectedSigB64, 'utf8');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, error: 'TOKEN_SIGNATURE_MISMATCH' };
    }

    const jsonStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const parsed = JSON.parse(jsonStr) as ExamAttemptTokenPayload;

    if (
      !parsed ||
      parsed.schema_version !== 'v1' ||
      !parsed.attempt_id ||
      !parsed.student_id ||
      !parsed.cached_exam_id ||
      !parsed.content_hash
    ) {
      return { valid: false, error: 'TOKEN_PAYLOAD_MALFORMED' };
    }

    if (typeof parsed.expires_at === 'number' && Date.now() > parsed.expires_at) {
      return { valid: false, error: 'TOKEN_EXPIRED' };
    }

    return { valid: true, payload: parsed };
  } catch (err: any) {
    if (err instanceof MissingIntegritySecretError) {
      throw err;
    }
    return { valid: false, error: 'TOKEN_PARSING_ERROR' };
  }
}

/**
 * Conservative Arabic Level 1 Normalization.
 * 
 * Rules:
 * - Strips Harakat / Tashkeel diacritics.
 * - Strips Tatweel (Kashida).
 * - Normalizes Alef variants (أ, إ, آ, ٱ -> ا).
 * - Normalizes Persian/Urdu character variants (ک -> ك, ی -> ي).
 * - Normalizes Eastern Arabic numerals (٠-٩ -> 0-9).
 * - Collapses multiple whitespace characters to a single space.
 * 
 * STRICT PRESERVATIONS:
 * - Does NOT convert ة to ه (preserves lexical and morphological distinctions).
 * - Does NOT convert ى to ي (preserves Alef Maqsura distinctions).
 * - No word stemming or character deletions.
 */
export function normalizeArabicLevel1(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let normalized = text;

  // 1. Strip Harakat / Tashkeel diacritics (\u064B to \u0652, \u0670, \u0653-\u0655)
  normalized = normalized.replace(/[\u064B-\u0652\u0670\u0653-\u0655]/g, '');

  // 2. Strip Tatweel / Kashida (\u0640)
  normalized = normalized.replace(/\u0640/g, '');

  // 3. Normalize Alef variants (أ, إ, آ, ٱ -> ا)
  normalized = normalized.replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627');

  // 4. Normalize Persian/Urdu variants (ک -> ك, ی -> ي)
  normalized = normalized.replace(/\u06A9/g, '\u0643');
  normalized = normalized.replace(/\u06CC/g, '\u064A');

  // 5. Normalize Eastern Arabic numerals (٠-٩ -> 0-9)
  const easternDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  for (let i = 0; i < 10; i++) {
    normalized = normalized.replace(new RegExp(easternDigits[i], 'g'), String(i));
  }

  // 6. Normalize Whitespace
  normalized = normalized.replace(/[\t\r\n\v\f\u00A0\u200B\u200C\u200D]+/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

// ----------------------------------------------------------------------------
// SAFE RATIONAL ARITHMETIC AST PARSER
// ----------------------------------------------------------------------------

interface Rational {
  num: number;
  den: number;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

function simplifyRational(r: Rational): Rational {
  if (r.den === 0) throw new Error('DIVISION_BY_ZERO');
  if (r.num === 0) return { num: 0, den: 1 };
  const d = gcd(r.num, r.den);
  let num = r.num / d;
  let den = r.den / d;
  if (den < 0) {
    num = -num;
    den = -den;
  }
  return { num, den };
}

function addR(a: Rational, b: Rational): Rational {
  return simplifyRational({ num: a.num * b.den + b.num * a.den, den: a.den * b.den });
}

function subR(a: Rational, b: Rational): Rational {
  return simplifyRational({ num: a.num * b.den - b.num * a.den, den: a.den * b.den });
}

function mulR(a: Rational, b: Rational): Rational {
  return simplifyRational({ num: a.num * b.num, den: a.den * b.den });
}

function divR(a: Rational, b: Rational): Rational {
  if (b.num === 0) throw new Error('DIVISION_BY_ZERO');
  return simplifyRational({ num: a.num * b.den, den: a.den * b.num });
}

function powR(a: Rational, exp: number): Rational {
  if (!Number.isInteger(exp)) throw new Error('NON_INTEGER_EXPONENT');
  if (Math.abs(exp) > 10) throw new Error('EXPONENT_OUT_OF_BOUNDS');
  if (exp === 0) return { num: 1, den: 1 };
  if (exp > 0) {
    return simplifyRational({ num: Math.pow(a.num, exp), den: Math.pow(a.den, exp) });
  } else {
    if (a.num === 0) throw new Error('DIVISION_BY_ZERO');
    return simplifyRational({ num: Math.pow(a.den, -exp), den: Math.pow(a.num, -exp) });
  }
}

type TokenType = 'NUMBER' | 'PLUS' | 'MINUS' | 'MUL' | 'DIV' | 'POW' | 'LPAREN' | 'RPAREN' | 'EOF';

interface Token {
  type: TokenType;
  value?: Rational;
  text: string;
}

/**
 * Tokenize a mathematical expression string safely without eval().
 */
function tokenizeMath(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    // Skip whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '+') { tokens.push({ type: 'PLUS', text: '+' }); i++; continue; }
    if (ch === '-') { tokens.push({ type: 'MINUS', text: '-' }); i++; continue; }
    if (ch === '*' || ch === '×' || ch === '·') { tokens.push({ type: 'MUL', text: '*' }); i++; continue; }
    if (ch === '/' || ch === '÷') { tokens.push({ type: 'DIV', text: '/' }); i++; continue; }
    if (ch === '^') { tokens.push({ type: 'POW', text: '^' }); i++; continue; }
    if (ch === '(') { tokens.push({ type: 'LPAREN', text: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN', text: ')' }); i++; continue; }

    // Numbers (integer, float)
    if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < len && /[0-9]/.test(input[i + 1]))) {
      let numStr = '';
      let hasDot = false;
      while (i < len && (/[0-9]/.test(input[i]) || input[i] === '.')) {
        if (input[i] === '.') {
          if (hasDot) throw new Error('MALFORMED_NUMBER');
          hasDot = true;
        }
        numStr += input[i];
        i++;
      }
      if (hasDot) {
        const parts = numStr.split('.');
        const decPlaces = parts[1].length;
        const den = Math.pow(10, decPlaces);
        const num = Math.round(parseFloat(numStr) * den);
        tokens.push({ type: 'NUMBER', value: simplifyRational({ num, den }), text: numStr });
      } else {
        const num = parseInt(numStr, 10);
        tokens.push({ type: 'NUMBER', value: { num, den: 1 }, text: numStr });
      }
      continue;
    }

    // Check for unsupported characters
    if (ch === '=') throw new Error('EQUATIONS_NOT_SUPPORTED');
    if (/[a-zA-Z\u0621-\u064A]/.test(ch)) throw new Error('VARIABLES_NOT_SUPPORTED');
    throw new Error(`UNSUPPORTED_SYNTAX: ${ch}`);
  }

  tokens.push({ type: 'EOF', text: '' });
  return tokens;
}

/**
 * Recursive descent parser for safe rational arithmetic.
 */
class MathParser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private consume(expected?: TokenType): Token {
    const tok = this.tokens[this.pos];
    if (expected && tok.type !== expected) {
      throw new Error(`SYNTAX_ERROR: expected ${expected}, got ${tok.type}`);
    }
    this.pos++;
    return tok;
  }

  public parse(): Rational {
    const result = this.parseExpr(0);
    if (this.peek().type !== 'EOF') {
      throw new Error(`SYNTAX_ERROR: unexpected token "${this.peek().text}"`);
    }
    return result;
  }

  private parseExpr(depth: number): Rational {
    if (depth > 8) throw new Error('RECURSION_DEPTH_EXCEEDED');
    let left = this.parseTerm(depth + 1);

    while (this.peek().type === 'PLUS' || this.peek().type === 'MINUS') {
      const op = this.consume().type;
      const right = this.parseTerm(depth + 1);
      left = op === 'PLUS' ? addR(left, right) : subR(left, right);
    }
    return left;
  }

  private parseTerm(depth: number): Rational {
    if (depth > 8) throw new Error('RECURSION_DEPTH_EXCEEDED');
    let left = this.parsePower(depth + 1);

    while (this.peek().type === 'MUL' || this.peek().type === 'DIV') {
      const op = this.consume().type;
      const right = this.parsePower(depth + 1);
      left = op === 'MUL' ? mulR(left, right) : divR(left, right);
    }
    return left;
  }

  private parsePower(depth: number): Rational {
    if (depth > 8) throw new Error('RECURSION_DEPTH_EXCEEDED');
    const base = this.parseFactor(depth + 1);

    if (this.peek().type === 'POW') {
      this.consume('POW');
      // Handle optional unary sign on exponent
      let sign = 1;
      if (this.peek().type === 'PLUS') {
        this.consume('PLUS');
      } else if (this.peek().type === 'MINUS') {
        this.consume('MINUS');
        sign = -1;
      }
      const expTok = this.consume('NUMBER');
      const expVal = expTok.value!;
      if (expVal.den !== 1) throw new Error('NON_INTEGER_EXPONENT');
      return powR(base, sign * expVal.num);
    }
    return base;
  }

  private parseFactor(depth: number): Rational {
    if (depth > 8) throw new Error('RECURSION_DEPTH_EXCEEDED');
    const tok = this.peek();

    if (tok.type === 'PLUS') {
      this.consume('PLUS');
      return this.parseFactor(depth + 1);
    }
    if (tok.type === 'MINUS') {
      this.consume('MINUS');
      const factor = this.parseFactor(depth + 1);
      return { num: -factor.num, den: factor.den };
    }
    if (tok.type === 'LPAREN') {
      this.consume('LPAREN');
      const val = this.parseExpr(depth + 1);
      this.consume('RPAREN');
      return val;
    }
    if (tok.type === 'NUMBER') {
      this.consume('NUMBER');
      return tok.value!;
    }
    throw new Error(`SYNTAX_ERROR: unexpected token "${tok.text}"`);
  }
}

/**
 * Safely parse and evaluate a mathematical expression.
 * Returns structured MathEvaluationResult. Never executes arbitrary JavaScript.
 */
export function evaluateMathExpression(expr: string): MathEvaluationResult {
  if (!expr || typeof expr !== 'string') {
    return { success: false, error: 'EMPTY_EXPRESSION' };
  }

  const trimmed = expr.trim();
  if (trimmed.length === 0) {
    return { success: false, error: 'EMPTY_EXPRESSION' };
  }
  if (trimmed.length > 128) {
    return { success: false, error: 'INPUT_EXCEEDS_RESOURCE_LIMIT' };
  }

  // Normalize Eastern digits
  const easternDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let cleaned = trimmed;
  for (let i = 0; i < 10; i++) {
    cleaned = cleaned.replace(new RegExp(easternDigits[i], 'g'), String(i));
  }

  // Reject equations immediately
  if (cleaned.includes('=')) {
    return { success: false, error: 'EQUATIONS_NOT_SUPPORTED' };
  }

  try {
    const tokens = tokenizeMath(cleaned);
    const parser = new MathParser(tokens);
    const rational = parser.parse();

    const value = rational.num / rational.den;
    const simplifiedString = rational.den === 1
      ? String(rational.num)
      : `${rational.num}/${rational.den}`;

    return {
      success: true,
      value: Math.round(value * 1e9) / 1e9,
      simplifiedString,
      isExact: rational.den === 1 || Number.isInteger(Math.log10(rational.den))
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'MATH_EVALUATION_ERROR'
    };
  }
}

export type AnswerKeyStatus =
  | 'DETERMINISTICALLY_VERIFIED'
  | 'PENDING_REVIEW'
  | 'ANSWER_KEY_UNVERIFIED'
  | 'REJECTED';

export type QuestionStructuralStatus =
  | 'VALID'
  | 'INVALID_STRUCTURE'
  | 'DUPLICATE_OPTIONS'
  | 'MISSING_OPTIONS'
  | 'ORPHAN_CORRECT_ANSWER';

export interface QuestionValidationResult {
  questionId: string;
  structuralStatus: QuestionStructuralStatus;
  isStructurallyValid: boolean;
  answerKeyStatus: AnswerKeyStatus;
  isAnswerKeyVerified: boolean;
  verificationMethod: 'DETERMINISTIC_MATH' | 'SEMANTIC_REVIEW_REQUIRED' | 'STRUCTURE_ONLY' | 'REJECTED';
  requiresTeacherReview: boolean;
  reason?: string;
  deterministicCalculation?: {
    expression?: string;
    expectedValue?: number;
    actualOptionValue?: number | string;
    isMatch?: boolean;
  };
}

export interface ExamValidationSummary {
  totalQuestions: number;
  allStructurallyValid: boolean;
  allDeterministicallyVerified: boolean;
  hasRejectedAnswers: boolean;
  hasUncertainQuestions: boolean;
  overallAnswerReviewState: 'FULLY_VERIFIED' | 'PENDING_TEACHER_REVIEW' | 'REJECTED' | 'UNVERIFIED';
  results: QuestionValidationResult[];
}

export class AnswerValidationService {
  public static computeCanonicalFingerprint = computeCanonicalFingerprint;
  public static verifyCanonicalFingerprint = verifyCanonicalFingerprint;
  public static normalizeArabicLevel1 = normalizeArabicLevel1;
  public static evaluateMathExpression = evaluateMathExpression;
  public static signExamAttemptToken = signExamAttemptToken;
  public static verifyExamAttemptToken = verifyExamAttemptToken;

  /**
   * Normalize Arabic and Eastern Arabic digits to standard Latin digits.
   */
  public static normalizeDigits(str: string): string {
    const easternDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    let result = str;
    for (let i = 0; i < 10; i++) {
      result = result.replace(new RegExp(easternDigits[i], 'g'), String(i));
    }
    return result;
  }

  /**
   * Safely evaluate simple arithmetic expressions without eval().
   * Supports +, -, *, /, ×, ÷
   */
  public static evaluateArithmeticExpression(expr: string): number | null {
    const cleaned = this.normalizeDigits(expr)
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/\s+/g, '');

    // Match binary arithmetic: A [op] B
    const match = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*([\+\-\*\/])\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) return null;

    const num1 = parseFloat(match[1]);
    const op = match[2];
    const num2 = parseFloat(match[3]);

    if (isNaN(num1) || isNaN(num2)) return null;

    switch (op) {
      case '+': return num1 + num2;
      case '-': return num1 - num2;
      case '*': return num1 * num2;
      case '/': return num2 !== 0 ? num1 / num2 : null;
      default: return null;
    }
  }

  /**
   * Extract potential arithmetic expression from question text.
   * e.g., "ما ناتج 15 + 27؟" -> "15 + 27"
   * e.g., "Calculate 25 * 4 = ?" -> "25 * 4"
   */
  public static extractMathExpression(text: string): string | null {
    const norm = this.normalizeDigits(text)
      .replace(/×/g, '*')
      .replace(/÷/g, '/');

    // Look for patterns like "15 + 27" or "25 * 4" or "100 - 35"
    const match = norm.match(/(\d+(?:\.\d+)?\s*[\+\-\*\/]\s*\d+(?:\.\d+)?)/);
    return match ? match[1] : null;
  }

  /**
   * Validate a single question for structural integrity and answer correctness.
   */
  public static validateQuestion(q: any): QuestionValidationResult {
    const qId = q.id || q.question_id || 'unknown';

    // 1. Structural check: question text
    if (!q || typeof q !== 'object' || !q.question_text || typeof q.question_text !== 'string' || q.question_text.trim().length === 0) {
      return {
        questionId: qId,
        structuralStatus: 'INVALID_STRUCTURE',
        isStructurallyValid: false,
        answerKeyStatus: 'REJECTED',
        isAnswerKeyVerified: false,
        verificationMethod: 'STRUCTURE_ONLY',
        requiresTeacherReview: true,
        reason: 'Question text is missing or empty'
      };
    }

    // 2. Options check
    const rawOptions = q.options;
    if (!rawOptions || !Array.isArray(rawOptions) || rawOptions.length < 2) {
      return {
        questionId: qId,
        structuralStatus: 'MISSING_OPTIONS',
        isStructurallyValid: false,
        answerKeyStatus: 'REJECTED',
        isAnswerKeyVerified: false,
        verificationMethod: 'STRUCTURE_ONLY',
        requiresTeacherReview: true,
        reason: 'Question must have at least 2 distinct answer options'
      };
    }

    // Check for duplicate options (by text)
    const seenTexts = new Set<string>();
    const seenIds = new Set<string>();
    for (const opt of rawOptions) {
      const optText = (opt.text || opt.option_text || '').toString().trim().toLowerCase();
      if (!optText) {
        return {
          questionId: qId,
          structuralStatus: 'INVALID_STRUCTURE',
          isStructurallyValid: false,
          answerKeyStatus: 'REJECTED',
          isAnswerKeyVerified: false,
          verificationMethod: 'STRUCTURE_ONLY',
          requiresTeacherReview: true,
          reason: 'Option has empty or missing text'
        };
      }
      if (seenTexts.has(optText)) {
        return {
          questionId: qId,
          structuralStatus: 'DUPLICATE_OPTIONS',
          isStructurallyValid: false,
          answerKeyStatus: 'REJECTED',
          isAnswerKeyVerified: false,
          verificationMethod: 'STRUCTURE_ONLY',
          requiresTeacherReview: true,
          reason: `Duplicate option text detected: "${optText}"`
        };
      }
      seenTexts.add(optText);

      const optId = opt.id || opt.key || opt.label;
      if (optId) {
        if (seenIds.has(optId)) {
          return {
            questionId: qId,
            structuralStatus: 'DUPLICATE_OPTIONS',
            isStructurallyValid: false,
            answerKeyStatus: 'REJECTED',
            isAnswerKeyVerified: false,
            verificationMethod: 'STRUCTURE_ONLY',
            requiresTeacherReview: true,
            reason: `Duplicate option identifier detected: "${optId}"`
          };
        }
        seenIds.add(optId);
      }
    }

    // 3. Identify correct answer
    let correctOption: any = null;
    let correctIdentifier = (q.correct_answer || q.answer || '').toString().trim();

    // Check if an option has is_correct = true
    const flagCorrectOptions = rawOptions.filter(o => o.is_correct === true || o.is_correct === 1);
    if (flagCorrectOptions.length === 1) {
      correctOption = flagCorrectOptions[0];
    } else if (flagCorrectOptions.length > 1) {
      return {
        questionId: qId,
        structuralStatus: 'INVALID_STRUCTURE',
        isStructurallyValid: false,
        answerKeyStatus: 'REJECTED',
        isAnswerKeyVerified: false,
        verificationMethod: 'STRUCTURE_ONLY',
        requiresTeacherReview: true,
        reason: 'Multiple contradictory options are flagged as correct'
      };
    }

    if (!correctOption && correctIdentifier) {
      // Find matching option by ID, key, label, or exact text
      correctOption = rawOptions.find(o => 
        (o.id && o.id.toString() === correctIdentifier) ||
        (o.key && o.key.toString() === correctIdentifier) ||
        (o.label && o.label.toString() === correctIdentifier) ||
        (o.text && o.text.toString().trim() === correctIdentifier) ||
        (o.option_text && o.option_text.toString().trim() === correctIdentifier)
      );
    }

    if (!correctOption) {
      return {
        questionId: qId,
        structuralStatus: 'ORPHAN_CORRECT_ANSWER',
        isStructurallyValid: false,
        answerKeyStatus: 'REJECTED',
        isAnswerKeyVerified: false,
        verificationMethod: 'STRUCTURE_ONLY',
        requiresTeacherReview: true,
        reason: `Correct answer identifier "${correctIdentifier}" does not match any existing option`
      };
    }

    // Structural checks passed!
    const correctOptText = (correctOption.text || correctOption.option_text || '').toString().trim();

    // 4. Deterministic Answer-Key Validation Layer
    // Check if question contains a deterministically evaluable math expression
    const mathExpr = this.extractMathExpression(q.question_text);
    if (mathExpr) {
      const expectedVal = this.evaluateArithmeticExpression(mathExpr);
      if (expectedVal !== null) {
        const normOptText = this.normalizeDigits(correctOptText).trim();
        const actualVal = parseFloat(normOptText);

        if (!isNaN(actualVal) && Math.abs(actualVal - expectedVal) < 0.0001) {
          return {
            questionId: qId,
            structuralStatus: 'VALID',
            isStructurallyValid: true,
            answerKeyStatus: 'DETERMINISTICALLY_VERIFIED',
            isAnswerKeyVerified: true,
            verificationMethod: 'DETERMINISTIC_MATH',
            requiresTeacherReview: false,
            deterministicCalculation: {
              expression: mathExpr,
              expectedValue: expectedVal,
              actualOptionValue: actualVal,
              isMatch: true
            }
          };
        } else {
          // Mathematical contradiction detected in the answer key!
          return {
            questionId: qId,
            structuralStatus: 'VALID',
            isStructurallyValid: true,
            answerKeyStatus: 'REJECTED',
            isAnswerKeyVerified: false,
            verificationMethod: 'REJECTED',
            requiresTeacherReview: true,
            reason: `DETERMINISTIC_MATH_MISMATCH: Expression "${mathExpr}" evaluates to ${expectedVal}, but selected correct option is "${correctOptText}" (${actualVal})`,
            deterministicCalculation: {
              expression: mathExpr,
              expectedValue: expectedVal,
              actualOptionValue: isNaN(actualVal) ? normOptText : actualVal,
              isMatch: false
            }
          };
        }
      }
    }

    // 5. Semantic / Subject-Matter Questions
    // Correctness CANNOT be verified deterministically without AI or manual review.
    // Must fail closed to PENDING_REVIEW rather than pretending to be verified.
    return {
      questionId: qId,
      structuralStatus: 'VALID',
      isStructurallyValid: true,
      answerKeyStatus: 'PENDING_REVIEW',
      isAnswerKeyVerified: false,
      verificationMethod: 'SEMANTIC_REVIEW_REQUIRED',
      requiresTeacherReview: true,
      reason: 'Semantic/subject-matter question requires teacher review; answer key cannot be verified deterministically'
    };
  }

  /**
   * Validate an entire exam question array.
   */
  public static validateExamQuestions(questions: any[]): ExamValidationSummary {
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return {
        totalQuestions: 0,
        allStructurallyValid: false,
        allDeterministicallyVerified: false,
        hasRejectedAnswers: false,
        hasUncertainQuestions: false,
        overallAnswerReviewState: 'UNVERIFIED',
        results: []
      };
    }

    const results = questions.map(q => this.validateQuestion(q));
    const allStructurallyValid = results.every(r => r.isStructurallyValid);
    const hasRejectedAnswers = results.some(r => r.answerKeyStatus === 'REJECTED');
    const allDeterministicallyVerified = results.every(r => r.answerKeyStatus === 'DETERMINISTICALLY_VERIFIED');
    const hasUncertainQuestions = results.some(r => r.answerKeyStatus === 'PENDING_REVIEW' || r.answerKeyStatus === 'ANSWER_KEY_UNVERIFIED');

    let overallAnswerReviewState: 'FULLY_VERIFIED' | 'PENDING_TEACHER_REVIEW' | 'REJECTED' | 'UNVERIFIED' = 'UNVERIFIED';

    if (hasRejectedAnswers || !allStructurallyValid) {
      overallAnswerReviewState = 'REJECTED';
    } else if (allDeterministicallyVerified) {
      overallAnswerReviewState = 'FULLY_VERIFIED';
    } else if (hasUncertainQuestions) {
      overallAnswerReviewState = 'PENDING_TEACHER_REVIEW';
    }

    return {
      totalQuestions: questions.length,
      allStructurallyValid,
      allDeterministicallyVerified,
      hasRejectedAnswers,
      hasUncertainQuestions,
      overallAnswerReviewState,
      results
    };
  }
}
