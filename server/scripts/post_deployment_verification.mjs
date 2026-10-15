import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connect } from '@tidbcloud/serverless';
import { aiRagEngine } from '../dist/services/ai/aiRagEngine.js';
import { AiUsageMetricsService } from '../dist/services/aiUsageMetricsService.js';
import { db } from '../dist/db/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
if (!process.env.TIDB_HOST) {
  dotenv.config({ path: path.resolve(process.cwd(), 'server', '.env') });
}

function getTiDB() {
  return connect({
    url: `mysql://${process.env.TIDB_USER}:${process.env.TIDB_PASSWORD}@${process.env.TIDB_HOST}/${process.env.TIDB_DATABASE}?ssl={"rejectUnauthorized":true}`
  });
}

const BOOK_ID = '81b8a308-7fcf-4938-8c45-aa0056624f32';
const UNIT4_CHAPTER_ID = 'c4000000-7fcf-4938-8c45-aa0056624f34';
const REVISION_CHAPTER_ID = '7f2409f5-19e4-4d89-9a2c-f684c31be991';

async function main() {
  console.log('================================================================');
  console.log('ALFARABI AI — POST-DEPLOYMENT PRODUCTION VERIFICATION');
  console.log('Target: Live TiDB Cloud & Vercel Backend');
  console.log('================================================================\n');

  const tidb = getTiDB();

  // --------------------------------------------------------------------------
  // SECTION 1: DATABASE STRUCTURE VERIFICATION
  // --------------------------------------------------------------------------
  console.log('--- 1. Database Chapter & Chunk Isolation Verification ---');
  
  // 1A: Verify Chapter 5
  const ch5 = await tidb.execute(
    'SELECT id, book_id, chapter_number, title_ar, title_en, start_page, end_page FROM book_chapters WHERE id = ?',
    [REVISION_CHAPTER_ID]
  );
  console.log(`Chapter 5 in TiDB: ${ch5.length} row(s)`);
  if (ch5.length !== 1) throw new Error(`Expected exactly 1 Chapter 5, found ${ch5.length}`);
  const rChap = ch5[0];
  console.log(`  ID: ${rChap.id} | No: ${rChap.chapter_number} | Title: ${rChap.title_en} | Pages: ${rChap.start_page}-${rChap.end_page}`);

  // 1B: Verify 8 Chunks in Chapter 5
  const ch5Chunks = await tidb.execute(
    'SELECT id, page_number, chunk_index FROM book_chunks WHERE chapter_id = ? ORDER BY page_number ASC',
    [REVISION_CHAPTER_ID]
  );
  console.log(`\nChunks assigned to Chapter 5: ${ch5Chunks.length}`);
  if (ch5Chunks.length !== 8) throw new Error(`Expected exactly 8 chunks for Chapter 5, found ${ch5Chunks.length}`);
  for (const c of ch5Chunks) {
    console.log(`  Chunk ${c.id} | Page: ${c.page_number} | Index: ${c.chunk_index}`);
    if (c.page_number < 97 || c.page_number > 104) {
      throw new Error(`Chunk ${c.id} on page ${c.page_number} is out of revision range (97-104)!`);
    }
  }

  // 1C: Verify 0 unassigned chunks
  const nullChunks = await tidb.execute(
    'SELECT COUNT(*) as cnt FROM book_chunks WHERE book_id = ? AND chapter_id IS NULL',
    [BOOK_ID]
  );
  console.log(`\nRemaining NULL chapter chunks in book: ${nullChunks[0]?.cnt}`);
  if (Number(nullChunks[0]?.cnt) !== 0) throw new Error('Found unexpected NULL chunks!');

  // 1D: Verify Unit 4 has zero contamination
  const u4Chunks = await tidb.execute(
    'SELECT COUNT(*) as total, MIN(page_number) as min_p, MAX(page_number) as max_p FROM book_chunks WHERE chapter_id = ?',
    [UNIT4_CHAPTER_ID]
  );
  console.log(`\nUnit 4 chunks: total=${u4Chunks[0]?.total}, min_page=${u4Chunks[0]?.min_p}, max_page=${u4Chunks[0]?.max_p}`);
  if (Number(u4Chunks[0]?.max_p) > 96) throw new Error(`Unit 4 contains chunks beyond page 96! Max page is ${u4Chunks[0]?.max_p}`);

  // --------------------------------------------------------------------------
  // SECTION 2: RAG RETRIEVAL ISOLATION VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 2. RAG Retrieval Boundary Isolation Verification ---');
  
  // 2A: Retrieve chunks for Unit 4
  const u4Retrieval = await aiRagEngine.retrieveGroundedChunks({
    academicStageId: 'stg-prep',
    gradeId: 'grd-prep-2',
    subjectId: 'sbj-social',
    bookId: BOOK_ID,
    chapterId: UNIT4_CHAPTER_ID,
    limit: 20
  });
  console.log(`Retrieved chunks for Unit 4: ${u4Retrieval.length}`);
  const u4Violations = u4Retrieval.filter(c => c.page_number > 96);
  if (u4Violations.length > 0) throw new Error(`Unit 4 retrieval contaminated with pages > 96: ${JSON.stringify(u4Violations)}`);
  console.log('  ✅ Unit 4 retrieval strictly isolated to pages <= 96 (zero contamination)');

  // 2B: Retrieve chunks for Revision Chapter 5
  const revRetrieval = await aiRagEngine.retrieveGroundedChunks({
    academicStageId: 'stg-prep',
    gradeId: 'grd-prep-2',
    subjectId: 'sbj-social',
    bookId: BOOK_ID,
    chapterId: REVISION_CHAPTER_ID,
    limit: 20
  });
  console.log(`Retrieved chunks for Revision Chapter: ${revRetrieval.length}`);
  const revViolations = revRetrieval.filter(c => c.page_number < 97 || c.page_number > 104);
  if (revViolations.length > 0) throw new Error(`Revision retrieval contains chunks outside pages 97-104: ${JSON.stringify(revViolations)}`);
  console.log('  ✅ Revision Chapter retrieval strictly constrained to pages 97-104');

  // --------------------------------------------------------------------------
  // SECTION 3: CONTROLLED EXAM GENERATION & TOKEN-COST VERIFICATION
  console.log('\n--- 3. Controlled Exam Generation & Telemetry Persistence ---');

  const bookMeta = await tidb.execute(
    'SELECT academic_stage_id, grade_id, subject_id, title_ar FROM books WHERE id = ?',
    [BOOK_ID]
  );
  if (bookMeta.length === 0) throw new Error('Book not found in database');
  const { academic_stage_id, grade_id, subject_id } = bookMeta[0];
  console.log(`Target book foreign keys: stage=${academic_stage_id}, grade=${grade_id}, subject=${subject_id}`);

  const testStudentId = 'test-verifier-' + Date.now();
  const testCorrelationId = 'corr-test-' + Date.now();

  console.log(`Executing controlled exam generation for Revision Unit (count=3)...`);
  const examStartTime = Date.now();
  
  // Call aiRagEngine.generateQuestions (actual live Gemini API call)
  const questions = await aiRagEngine.generateQuestions({
    studentId: testStudentId,
    academicStageId: academic_stage_id,
    gradeId: grade_id,
    subjectId: subject_id,
    bookId: BOOK_ID,
    chapterId: REVISION_CHAPTER_ID,
    count: 3
  });

  const examDurationMs = Date.now() - examStartTime;
  console.log(`\nGenerated ${questions.length} questions in ${examDurationMs}ms`);
  for (let i = 0; i < questions.length; i++) {
    console.log(`  Q${i + 1}: ${questions[i].question_text.slice(0, 75)}...`);
    console.log(`      Difficulty: ${questions[i].difficulty} | Bloom: ${questions[i].bloom_level} | Page: ${questions[i].page_reference}`);
  }

  // --------------------------------------------------------------------------
  // SECTION 4: PERSISTED METRIC AUDIT IN TI DB
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Auditing Persisted ai_usage_metrics in Live TiDB ---');

  const recordedCalls = await tidb.execute(`
    SELECT id, event_type, student_id, book_id, chapter_id, model_name,
           prompt_tokens, candidates_tokens, total_tokens, cached_tokens,
           estimated_cost_usd, duration_ms, is_estimated, call_purpose, correlation_id,
           attempt_number, cost_status, created_at
    FROM ai_usage_metrics
    WHERE student_id LIKE 'test-verifier-%'
    ORDER BY created_at ASC
  `);

  console.log(`Metrics recorded for verifier students (LIKE test-verifier-%): ${recordedCalls.length} row(s)`);
  if (recordedCalls.length === 0) {
    throw new Error('No metric records found in ai_usage_metrics for controlled test exam!');
  }

  let totalTestTokens = 0;
  let totalTestCost = 0;

  for (const m of recordedCalls) {
    totalTestTokens += m.total_tokens;
    totalTestCost += m.estimated_cost_usd;
    console.log(`\n  Record ID: ${m.id}`);
    console.log(`  Event: ${m.event_type} | Purpose: ${m.call_purpose}`);
    console.log(`  Model: ${m.model_name} | Attempt: ${m.attempt_number}`);
    console.log(`  Prompt Tokens: ${m.prompt_tokens} (Actual, is_estimated=${m.is_estimated})`);
    console.log(`  Candidates Tokens: ${m.candidates_tokens}`);
    console.log(`  Cached Tokens: ${m.cached_tokens}`);
    console.log(`  Total Tokens: ${m.total_tokens}`);
    console.log(`  Cost Status: ${m.cost_status} | Estimated Cost: $${m.estimated_cost_usd.toFixed(6)}`);
    console.log(`  Duration: ${m.duration_ms}ms | Created: ${m.created_at}`);

    if (m.event_type === 'PROVIDER_CALL') {
      if (m.is_estimated !== 0) {
        throw new Error(`Expected actual tokens (is_estimated = 0), got is_estimated = ${m.is_estimated}`);
      }
      if (m.prompt_tokens <= 0 || m.candidates_tokens <= 0) {
        throw new Error('Actual token counts must be greater than zero for PROVIDER_CALL!');
      }
      if (m.estimated_cost_usd <= 0) {
        throw new Error('Estimated cost must be greater than zero for actual tokens!');
      }
    } else if (m.event_type === 'PROVIDER_FAILURE') {
      console.log(`  -> Verified PROVIDER_FAILURE record for Attempt ${m.attempt_number} (Model: ${m.model_name}, Duration: ${m.duration_ms}ms)`);
    }
  }

  console.log(`\nSummary for controlled exam:`);
  console.log(`  Total Gemini Invocations: ${recordedCalls.length}`);
  console.log(`  Total Actual Tokens Consumed: ${totalTestTokens}`);
  console.log(`  Total Estimated Provider Cost: $${totalTestCost.toFixed(6)} USD`);

  // --------------------------------------------------------------------------
  // SECTION 5: CACHE HIT ZERO-PROVIDER CALL VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Cache Hit Zero-Provider Call Verification ---');

  const cacheTestId = 'cache-test-' + Date.now();
  await AiUsageMetricsService.recordCacheHit({
    studentId: cacheTestId,
    bookId: BOOK_ID,
    chapterId: REVISION_CHAPTER_ID,
    cachedExamId: 'cached-exam-' + Date.now()
  });

  const cacheMetric = await tidb.execute(`
    SELECT event_type, prompt_tokens, candidates_tokens, total_tokens, estimated_cost_usd
    FROM ai_usage_metrics
    WHERE student_id = ?
  `, [cacheTestId]);

  console.log(`Cache metric row: ${JSON.stringify(cacheMetric[0])}`);
  if (cacheMetric[0]?.event_type !== 'CACHE_HIT') throw new Error('Event type must be CACHE_HIT');
  if (cacheMetric[0]?.total_tokens !== 0) throw new Error('Cache hit must have total_tokens = 0');
  if (cacheMetric[0]?.estimated_cost_usd !== 0) throw new Error('Cache hit must have estimated_cost_usd = 0');
  console.log('  ✅ Cache hit verified: Exactly 0 provider tokens and $0.00 provider cost.');

  // --------------------------------------------------------------------------
  // SECTION 6: AGGREGATED USAGE REPORT VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Aggregated Usage Report Verification ---');
  const report = await AiUsageMetricsService.getAggregatedUsageReport({
    startDate: new Date(Date.now() - 3600000).toISOString(),
    endDate: new Date(Date.now() + 3600000).toISOString()
  });

  console.log(`Aggregated Totals:`);
  console.log(`  Total Calls: ${report.totals.totalCalls}`);
  console.log(`  Successful Calls: ${report.totals.successfulCalls}`);
  console.log(`  Actual Total Tokens: ${report.totals.actualTotalTokens}`);
  console.log(`  Estimated Total Tokens: ${report.totals.estimatedTotalTokens}`);
  console.log(`  Grand Total Tokens: ${report.totals.grandTotalTokens}`);
  console.log(`  Estimated Cost USD: $${report.totals.estimatedCostUsd}`);
  console.log(`  Billing Notice: ${report.totals.billingNotice}`);
  console.log(`  Models Tracked: ${report.byModel.map(m => `${m.modelName} (${m.totalCalls} calls, ${m.totalTokens} tokens, $${m.estimatedCostUsd})`).join(', ')}`);

  console.log('\n================================================================');
  console.log('✅ ALL PRODUCTION POST-DEPLOYMENT VERIFICATION CHECKS PASSED!');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('\n❌ Post-deployment verification failed:', err);
  process.exit(1);
});
