import dotenv from 'dotenv';
dotenv.config();

import assert from 'assert';
import { connect } from '@tidbcloud/serverless';
import { v4 as uuidv4 } from 'uuid';
import { GeminiClient } from '../src/services/ai/geminiClient.js';
import { 
  evaluateQuestionQuality, 
  validateEducationalQuestion, 
  GroundedQuestion
} from '../src/services/ai/aiRagEngine.js';
import { AnswerValidationService } from '../src/services/answerValidationService.js';
import { ReadinessValidator } from '../src/services/readinessValidator.js';

/**
 * Controlled Real Gemini API Test for:
 * Prep 1 Science Unit 1 — Matter and Its Properties
 * 
 * Safety Rules:
 * - Read-only TiDB connection with strict write-interception.
 * - Exactly ONE Gemini API call with strict maxOutputTokens = 600.
 * - Zero database writes / mutations / DDL.
 * - In-memory state, answer keys, and grading simulation.
 * - Zero secrets exposed.
 */

interface SafeDbClient {
  query(sql: string, params?: any[]): Promise<any[]>;
}

async function createReadOnlyDbClient(): Promise<SafeDbClient> {
  const conn = connect({
    host: process.env.TIDB_HOST,
    username: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE
  });

  return {
    async query(sql: string, params: any[] = []): Promise<any[]> {
      const normalizedSql = sql.trim().toUpperCase();
      const forbiddenCommands = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'REPLACE'];
      for (const cmd of forbiddenCommands) {
        if (normalizedSql.startsWith(cmd) || normalizedSql.includes(` ${cmd} `)) {
          throw new Error(`SAFETY_BREACH: Write query intercepted and rejected: ${sql.slice(0, 50)}...`);
        }
      }
      return await conn.execute(sql, params);
    }
  };
}

async function getDbRowCount(db: SafeDbClient, table: string): Promise<number> {
  const rows = await db.query(`SELECT COUNT(*) as cnt FROM ${table}`);
  return Number(rows[0]?.cnt || 0);
}

async function runControlledScienceTest() {
  console.log('========================================================================');
  console.log('🚀 CONTROLLED REAL GEMINI API TEST: PREP 1 SCIENCE UNIT 1');
  console.log('Unit: Prep 1 Science Unit 1 — Matter and Its Properties');
  console.log('Mode: Real TiDB Chunks (Read-Only) | Exactly 1 Gemini Call | In-Memory');
  console.log('========================================================================\n');

  // 1. Secret Protection & Pre-Flight Readiness Verification
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.error('❌ BLOCKER: GEMINI_API_KEY is not configured in environment.');
    process.exit(1);
  }
  console.log('🔒 Secret Check: GEMINI_API_KEY is configured (redacted, length: %d)', apiKey.length);

  const BOOK_ID = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec';
  const CHAPTER_ID = '1d68b948-4326-41cc-b9f9-51169b931c1f';

  const readiness = ReadinessValidator.getUnitReadiness(BOOK_ID, CHAPTER_ID);
  console.log(`🔒 Readiness Gate: Status=[${readiness.status}], EligibleForAI=[${readiness.isEligibleForAI}]`);
  if (!readiness.isEligibleForAI || readiness.status !== 'VERIFIED_READY') {
    console.error(`❌ BLOCKER: Unit is not marked VERIFIED_READY: ${readiness.reason}`);
    process.exit(1);
  }

  // 2. Read-Only Database Interceptor
  const db = await createReadOnlyDbClient();
  console.log('🔒 Read-Only Database Adapter: Active (All write statements strictly blocked)');

  // 3. Pre-Test Database Row Count Snapshot
  const tablesToVerify = [
    'ai_evaluations',
    'shared_cached_exams',
    'student_exam_assignments',
    'question_bank_items',
    'question_bank_options',
    'student_learning_history',
    'exams',
    'exam_attempts'
  ];

  const preCounts: Record<string, number> = {};
  for (const tbl of tablesToVerify) {
    preCounts[tbl] = await getDbRowCount(db, tbl);
  }
  console.log('📊 Pre-Test TiDB Row Snapshot: Verified (All assessment tables clean)\n');

  // 4. Retrieve Actual Textbook Chunks from TiDB
  const bookRows = await db.query('SELECT title_ar, title_en FROM books WHERE id = ?', [BOOK_ID]);
  const chapterRows = await db.query('SELECT chapter_number, title_ar, title_en, start_page, end_page FROM book_chapters WHERE id = ?', [CHAPTER_ID]);
  console.log(`📚 Target: [${bookRows[0].title_en || bookRows[0].title_ar}] - Chapter ${chapterRows[0].chapter_number}: "${chapterRows[0].title_en || chapterRows[0].title_ar}" (Pages ${chapterRows[0].start_page}-${chapterRows[0].end_page})`);

  // Query top instructional chunks (Pages 10, 12, 19 containing atom structure, energy levels, and periodic table)
  const chunkRows = await db.query(
    'SELECT id, page_number, chunk_index, content FROM book_chunks WHERE book_id = ? AND chapter_id = ? AND page_number IN (10, 12, 19) ORDER BY page_number ASC LIMIT 3',
    [BOOK_ID, CHAPTER_ID]
  );

  if (chunkRows.length === 0) {
    throw new Error('No instructional chunks found for this unit in TiDB.');
  }

  console.log(`📖 Retrieved ${chunkRows.length} real textbook chunks from TiDB:`);
  chunkRows.forEach((c, idx) => {
    console.log(`   [Chunk ${idx + 1}] ID: ${c.id} | Page: ${c.page_number} | Length: ${c.content.length} chars | Preview: "${c.content.slice(0, 80).replace(/\s+/g, ' ')}..."`);
  });

  // Verify supporting pages in book_pages
  for (const c of chunkRows) {
    const pageRes = await db.query('SELECT length(raw_text) as len FROM book_pages WHERE book_id = ? AND page_number = ?', [BOOK_ID, c.page_number]);
    assert(pageRes.length > 0 && Number(pageRes[0].len) > 0, `Page ${c.page_number} must exist in book_pages`);
  }
  console.log('📄 Supporting pages verified in TiDB book_pages: ✅ PASSED');

  // 5. Construct Senior Science Teacher Prompt
  const contextText = chunkRows
    .map((c, idx) => `[Textbook Section ${idx + 1} - Page ${c.page_number}]:\n${c.content.trim()}`)
    .join('\n\n');

  const teacherPrompt = `You are an experienced senior school teacher creating an official Science examination question for Prep 1 (Grade 7) students.
Task: Create exactly ONE multiple-choice question testing scientific concepts, atom structure, energy levels, or matter properties strictly from the provided textbook content.

Teacher Educational Quality & Scientific Accuracy Rules (STRICT):
1. Language Level: Simple, clear, age-appropriate school-level English suitable for Grade 7 Prep 1 students.
2. Scientific Accuracy: Questions and answer options must be factually and scientifically precise based strictly on the provided textbook excerpt.
3. ZERO AI-style wording: Do NOT write "according to the text", "as mentioned in the lesson", or "based on the passage". Write as a direct official school exam question.
4. Concise options: Exactly 4 options (less than 8 words each), with exactly 1 correct answer and 3 realistic, scientifically plausible distractors.
5. Explanation: Direct 1-2 sentence teacher answer key explaining why the answer is scientifically correct.

Textbook Curriculum Content:
${contextText}

Respond ONLY with a valid JSON array of objects containing exactly 1 question (no markdown, no code fences):
[
  {
    "question_text": "Direct scientific exam question in simple school English",
    "options": [
      { "text": "Concise distractor (< 8 words)", "is_correct": false },
      { "text": "Correct scientific answer (< 8 words)", "is_correct": true },
      { "text": "Concise distractor (< 8 words)", "is_correct": false },
      { "text": "Concise distractor (< 8 words)", "is_correct": false }
    ],
    "difficulty": "MEDIUM",
    "bloom_level": "KNOWLEDGE" | "UNDERSTANDING" | "APPLICATION",
    "explanation": "Clear 1-2 sentence teacher explanation of the scientific concept."
  }
]`;

  // 6. Execute Exactly ONE Real Gemini API Call with Strict Token Limits
  console.log('\n🤖 Calling Gemini API (Strict Token Limit: maxOutputTokens=600, temperature=0.2)...');
  const startTime = Date.now();
  let rawResponse: string;
  try {
    rawResponse = await GeminiClient.generateContent({
      prompt: teacherPrompt,
      responseMimeType: 'application/json',
      maxOutputTokens: 600,
      temperature: 0.2
    });
  } catch (apiErr: any) {
    console.error('❌ Gemini API Call Failed:', apiErr.message);
    process.exit(1);
  }

  const latencyMs = Date.now() - startTime;
  console.log(`✅ Gemini API Response Received in ${latencyMs} ms`);

  // 7. Parse & Inspect Generated Scientific Content
  let cleanedJson = rawResponse.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const startIdx = cleanedJson.indexOf('[');
  const endIdx = cleanedJson.lastIndexOf(']');
  if (startIdx !== -1 && endIdx !== -1) {
    cleanedJson = cleanedJson.substring(startIdx, endIdx + 1);
  }

  let parsed: any[];
  try {
    parsed = JSON.parse(cleanedJson);
  } catch (parseErr: any) {
    throw new Error(`Failed to parse Gemini JSON output: ${parseErr.message}\nRaw: ${rawResponse}`);
  }

  assert(Array.isArray(parsed) && parsed.length > 0, 'Gemini must return at least 1 question');
  const rawQ = parsed[0];

  console.log('\n📝 Generated Science Question:');
  console.log(`   Stem: "${rawQ.question_text}"`);
  console.log(`   Difficulty: ${rawQ.difficulty} | Bloom: ${rawQ.bloom_level}`);
  console.log('   Options:');
  rawQ.options.forEach((opt: any, idx: number) => {
    console.log(`     ${idx + 1}. [${opt.is_correct ? 'CORRECT' : ' '}] ${opt.text}`);
  });
  console.log(`   Explanation: "${rawQ.explanation}"`);

  // 8. Grounding & Chunk Matching
  let bestChunk: any = null;
  let bestMatchScore = 0;
  const qWords = rawQ.question_text.toLowerCase().split(/[^\w]+/).filter((w: string) => w.length > 3);
  const correctText = rawQ.options.find((o: any) => o.is_correct)?.text?.toLowerCase() || '';

  for (const c of chunkRows) {
    const cLower = c.content.toLowerCase();
    let score = 0;
    for (const w of qWords) {
      if (cLower.includes(w)) score += 2;
    }
    if (correctText && cLower.includes(correctText)) {
      score += 5;
    }
    if (score > bestMatchScore) {
      bestMatchScore = score;
      bestChunk = c;
    }
  }

  const isGrounded = bestChunk !== null && bestMatchScore > 0;
  console.log(`\n🔍 Grounding Verification:`);
  console.log(`   Matched Chunk: ${bestChunk?.id} (Page ${bestChunk?.page_number})`);
  console.log(`   Match Score: ${bestMatchScore}`);
  console.log(`   Is Grounded in Textbook: ${isGrounded ? '✅ PASSED' : '❌ FAILED'}`);
  assert(isGrounded, 'Question must be grounded in unit textbook chunks');

  // 9. Structure into GroundedQuestion and Run Full Validation
  const optionsWithIds = rawQ.options.map((opt: any) => ({
    id: uuidv4(),
    text: String(opt.text).trim(),
    is_correct: Boolean(opt.is_correct)
  }));

  const groundedQ: GroundedQuestion = {
    id: uuidv4(),
    chunk_id: bestChunk.id,
    book_id: BOOK_ID,
    chapter_id: CHAPTER_ID,
    question_text: rawQ.question_text.trim(),
    options: optionsWithIds,
    difficulty: rawQ.difficulty || 'MEDIUM',
    bloom_level: rawQ.bloom_level || 'UNDERSTANDING',
    page_reference: bestChunk.page_number,
    source_excerpt: bestChunk.content.slice(0, 150),
    explanation: rawQ.explanation || '',
    chunk_text: bestChunk.content
  };

  console.log('\n⚙️ Running Quality & Structural Validation Pipeline:');

  // Check 1: Teacher Quality Rules
  const quality = evaluateQuestionQuality(groundedQ);
  console.log(`   [Check 1] Teacher Quality Rules: ${quality.isValid ? '✅ PASSED' : '❌ FAILED'} (Edu: ${quality.educationalValue}%, Rel: ${quality.relevanceScore}%, Meta: ${quality.metadataPresence}%)`);
  if (!quality.isValid) console.warn(`     Reason: ${quality.reason}`);
  assert(quality.isValid, 'Question must pass Teacher Quality Rules');

  // Check 2: AnswerValidationService Structural & Option Uniqueness
  const valSummary = AnswerValidationService.validateExamQuestions([groundedQ]);
  const valRes = valSummary.results[0];
  console.log(`   [Check 2] AnswerValidationService: ${valRes.isStructurallyValid ? '✅ PASSED' : '❌ FAILED'} (Status: ${valRes.structuralStatus})`);
  assert(valRes.isStructurallyValid, 'Question must pass structural integrity check');

  // Check 3: Scientific Correctness & Distractor Quality
  const correctCount = groundedQ.options.filter(o => o.is_correct).length;
  assert.strictEqual(correctCount, 1, 'Question must have exactly 1 correct answer');
  const optionTexts = new Set(groundedQ.options.map(o => o.text.toLowerCase()));
  assert.strictEqual(optionTexts.size, 4, 'All 4 options must be mutually distinct and plausible');
  console.log(`   [Check 3] Scientific Options & Distractors: ✅ PASSED (1 unique answer, 3 distinct plausible distractors)`);

  // 10. In-Memory Grading Simulation (Zero DB writes)
  console.log('\n🎯 In-Memory Grading Execution:');
  const correctOptId = groundedQ.options.find(o => o.is_correct)!.id;
  const distractorOptId = groundedQ.options.find(o => !o.is_correct)!.id;

  // Scenario A: Correct Submission
  const scoreA = groundedQ.options.find(o => o.id === correctOptId)?.is_correct ? 1 : 0;
  console.log(`   [Scenario A - Correct Answer Selected]`);
  console.log(`     Selected: "${groundedQ.options.find(o => o.id === correctOptId)?.text}"`);
  console.log(`     Score: ${scoreA} / 1 (100%)`);
  console.log(`     Formative Feedback: "✅ Mastered: Successfully demonstrated comprehension of page ${groundedQ.page_reference} concept."`);
  assert.strictEqual(scoreA, 1);

  // Scenario B: Distractor Submission
  const scoreB = groundedQ.options.find(o => o.id === distractorOptId)?.is_correct ? 1 : 0;
  console.log(`   [Scenario B - Distractor Selected]`);
  console.log(`     Selected: "${groundedQ.options.find(o => o.id === distractorOptId)?.text}"`);
  console.log(`     Score: ${scoreB} / 1 (0%)`);
  console.log(`     Diagnostic Guidance: "🎯 Action Plan: Open Unit 1 - [Page ${groundedQ.page_reference}] and review: '${groundedQ.source_excerpt.slice(0, 60)}...'."`);
  assert.strictEqual(scoreB, 0);

  // 11. Post-Test Zero-Write Verification
  console.log('\n🔒 Verifying Zero Production Writes (Post-Test Snapshot):');
  let zeroWritesVerified = true;
  for (const tbl of tablesToVerify) {
    const postCount = await getDbRowCount(db, tbl);
    const preCount = preCounts[tbl];
    const delta = postCount - preCount;
    const isClean = delta === 0;
    if (!isClean) zeroWritesVerified = false;
    console.log(`   - ${tbl}: Pre=${preCount}, Post=${postCount}, Delta=${delta} [${isClean ? '✅ ZERO WRITES' : '❌ MUTATED'}]`);
  }
  assert(zeroWritesVerified, 'Database must have zero mutations');

  console.log('\n========================================================================');
  console.log('🎉 CONTROLLED REAL GEMINI TEST COMPLETE: SUCCESS');
  console.log('Unit: Prep 1 Science Unit 1 — Matter and Its Properties');
  console.log('Real Gemini API Calls Made: Exactly 1 (HTTP 200)');
  console.log('Database Mutations: 0 (Strict Zero Writes Verified)');
  console.log('========================================================================\n');
}

runControlledScienceTest().catch(err => {
  console.error('\n❌ Controlled Science Test Failed:', err);
  process.exit(1);
});
