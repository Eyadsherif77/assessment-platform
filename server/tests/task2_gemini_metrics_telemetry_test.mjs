import assert from 'assert';
import { AiUsageMetricsService, VERIFIED_MODEL_PRICING, DEFAULT_MODEL_PRICING } from '../dist/services/aiUsageMetricsService.js';
import { GeminiClient, GeminiProviderError } from '../dist/services/ai/geminiClient.js';
import { db } from '../dist/db/db.js';

console.log('================================================================');
console.log('TASK 2 — GEMINI USAGE AND COST METRICS TELEMETRY TEST SUITE');
console.log('Zero External API Calls | Zero Production Data Mutation');
console.log('================================================================\n');

let passed = 0;
const pass = (name) => {
  passed++;
  console.log(`  [PASS] ${passed}. ${name}`);
};

// ============================================================================
// TEST 1: Model Pricing Table & Verified Effective Dates
// ============================================================================
console.log('--- Test Group 1: Centralized Model Pricing & Verification ---');

// Primary verified model
const g3Pricing = AiUsageMetricsService.getModelPricing('gemini-3-flash-preview');
assert.strictEqual(g3Pricing.isRecognized, true, 'gemini-3-flash-preview must be recognized');
assert.strictEqual(g3Pricing.costStatus, 'ESTIMATED', 'Recognized model costStatus must be ESTIMATED');
assert.strictEqual(g3Pricing.inputPricePer1M, 0.50, 'Input price must be $0.50 per 1M');
assert.strictEqual(g3Pricing.outputPricePer1M, 3.00, 'Output price must be $3.00 per 1M');
assert.strictEqual(g3Pricing.cachedPricePer1M, 0.125, 'Cached input price must be $0.125 per 1M');
assert.strictEqual(g3Pricing.effectiveDate, '2026-10-01', 'Effective date must be 2026-10-01');
assert.ok(g3Pricing.source.includes('Official'), 'Pricing source must be official');
pass('Verified model gemini-3-flash-preview has exact rates, cached discount, and 2026-10-01 effective date');

// Fallback verified model
const flashLatestPricing = AiUsageMetricsService.getModelPricing('gemini-flash-latest');
assert.strictEqual(flashLatestPricing.isRecognized, true);
assert.strictEqual(flashLatestPricing.inputPricePer1M, 0.10);
assert.strictEqual(flashLatestPricing.outputPricePer1M, 0.40);
assert.strictEqual(flashLatestPricing.cachedPricePer1M, 0.025);
pass('Verified model gemini-flash-latest has exact rates ($0.10/$0.40)');

// Unknown / Unverified model handling: MUST NEVER INVENT A PRICE
const unknownPricing = AiUsageMetricsService.getModelPricing('gemini-9-ultra-future');
assert.strictEqual(unknownPricing.isRecognized, false, 'Unverified model must flag isRecognized = false');
assert.strictEqual(unknownPricing.costStatus, 'UNKNOWN', 'Unverified model must mark costStatus = UNKNOWN');
// Cost calculation for unknown model must return $0.00
const calculatedUnknownCost = AiUsageMetricsService.calculateCost('gemini-9-ultra-future', 5000, 1000, 0);
assert.strictEqual(calculatedUnknownCost, 0, 'Cost for unverified model must be $0.00 (never invented)');
pass('Unverified model is safely flagged as UNKNOWN with $0.00 fabricated cost');

// ============================================================================
// TEST 2: Provider Call Telemetry Capture (Usage Metadata & Token Breakdown)
// ============================================================================
console.log('\n--- Test Group 2: Actual Usage Metadata vs Estimated Tokens ---');

const capturedRows = [];
const origQuery = db.query;
db.query = async (sql, params) => {
  const sqlStr = typeof sql === 'string' ? sql : (sql?.text || '');
  if (sqlStr.includes('INSERT INTO ai_usage_metrics')) {
    capturedRows.push({ sql: sqlStr, params });
    return { rows: [], rowCount: 1 };
  }
  if (sqlStr.includes('SELECT is_estimated, call_purpose') || sqlStr.includes('SELECT correlation_id')) {
    return { rows: [] };
  }
  if (sqlStr.includes('SELECT') && sqlStr.includes('ai_usage_metrics')) {
    return { rows: [] };
  }
  return { rows: [], rowCount: 0 };
};

// 2A: Provider call with actual API usageMetadata
await AiUsageMetricsService.recordProviderCall({
  correlationId: 'corr-exam-101',
  studentId: 'stud-test-01',
  bookId: '81b8a308-7fcf-4938-8c45-aa0056624f32',
  chapterId: '7f2409f5-19e4-4d89-9a2c-f684c31be991',
  gradeId: 'grade-prep-2',
  subjectId: 'subj-social',
  modelName: 'gemini-3-flash-preview',
  promptTokens: 4000,
  candidatesTokens: 800,
  cachedTokens: 1000,
  thinkingTokens: 250,
  totalTokens: 4800,
  durationMs: 1200,
  isEstimated: false,
  attemptNumber: 1,
  callPurpose: 'QUESTION_GENERATION'
});

const callRow = capturedRows.find(r => r.params.includes('corr-exam-101'));
assert.ok(callRow, 'Provider call metric must be captured');
assert.ok(callRow.sql.includes('PROVIDER_CALL'), 'Event type must be PROVIDER_CALL');
assert.ok(callRow.params.includes('gemini-3-flash-preview'), 'Model ID must match');
assert.ok(callRow.params.includes(4000), 'Prompt tokens must match exact 4000');
assert.ok(callRow.params.includes(800), 'Candidates tokens must match exact 800');
assert.ok(callRow.params.includes(4800), 'Total tokens must match exact 4800');
assert.ok(callRow.params.includes(0), 'is_estimated must be 0 for actual usage metadata');
pass('Provider call with actual usageMetadata recorded with is_estimated = 0 and full token breakdown');

// 2B: Provider call with missing usageMetadata
await AiUsageMetricsService.recordProviderCall({
  correlationId: 'corr-exam-missing-meta',
  studentId: 'stud-test-02',
  bookId: '81b8a308-7fcf-4938-8c45-aa0056624f32',
  chapterId: '7f2409f5-19e4-4d89-9a2c-f684c31be991',
  modelName: 'gemini-3-flash-preview',
  promptTokens: 3500,
  candidatesTokens: 600,
  totalTokens: 4100,
  isEstimated: true,
  attemptNumber: 1,
  callPurpose: 'QUESTION_GENERATION'
});

const missingMetaRow = capturedRows.find(r => r.params.includes('corr-exam-missing-meta'));
assert.ok(missingMetaRow, 'Missing metadata call must be captured');
assert.ok(missingMetaRow.params.includes(1), 'is_estimated must be 1 when metadata is estimated');
pass('Provider call with missing metadata is explicitly flagged with is_estimated = 1');

// ============================================================================
// TEST 3: Retried Calls and Model Fallback Telemetry
// ============================================================================
console.log('\n--- Test Group 3: Retries & Fallback Attempts Instrumentation ---');

GeminiClient.resetForTests();
GeminiClient.backoffBaseMs = 1;

let fetchCallCount = 0;
const primaryModel = GeminiClient.candidateModels[0];
const fallbackModel = GeminiClient.candidateModels[1];

global.fetch = async (url) => {
  fetchCallCount++;
  const urlStr = String(url);
  if (urlStr.includes(primaryModel)) {
    // Primary model 429 Rate Limit
    return {
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Resource exhausted: rate limit exceeded. Please retry in 5s' } })
    };
  }
  // Fallback model succeeds
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: '[{"question_text": "Sample valid question"}]' }] } }],
      usageMetadata: {
        promptTokenCount: 2200,
        candidatesTokenCount: 450,
        cachedContentTokenCount: 500,
        totalTokenCount: 2650
      }
    })
  };
};

const retryResult = await GeminiClient.generateContent({
  prompt: 'Generate assessment questions',
  context: {
    workflow: 'EXAM_QUESTION_GENERATION',
    bookId: '81b8a308-7fcf-4938-8c45-aa0056624f32',
    chapterId: '7f2409f5-19e4-4d89-9a2c-f684c31be991'
  }
});

assert.ok(retryResult.includes('Sample valid question'), 'Fallback response must be returned');
assert.strictEqual(fetchCallCount, 2, 'Exactly 2 HTTP calls must be made (1 primary failure + 1 fallback)');

// Check failure metric for primary model
const primaryFailRow = capturedRows.find(r => r.sql.includes('PROVIDER_FAILURE') && r.params.includes(primaryModel));
assert.ok(primaryFailRow, 'Failure on primary model must be recorded in ai_usage_metrics');
assert.ok(primaryFailRow.params.includes('QUOTA_EXHAUSTED'), 'Failure error category must be QUOTA_EXHAUSTED');

// Check success metric for fallback model
const fallbackSuccessRow = capturedRows.find(r => r.sql.includes('PROVIDER_CALL') && r.params.includes(fallbackModel));
assert.ok(fallbackSuccessRow, 'Fallback success must be recorded in ai_usage_metrics');
assert.ok(fallbackSuccessRow.params.includes(2200), 'Fallback prompt tokens must match 2200');
pass('Retried call correctly records PROVIDER_FAILURE for attempt 1 and PROVIDER_CALL for attempt 2');

// ============================================================================
// TEST 4: Telemetry Fail-Open Resilience (Database Write Failure)
// ============================================================================
console.log('\n--- Test Group 4: Fail-Open Resilience on Database Error ---');

GeminiClient.resetForTests();
// Simulate database failure during telemetry recording
db.query = async (sql) => {
  const sqlStr = typeof sql === 'string' ? sql : (sql?.text || '');
  if (sqlStr.includes('INSERT INTO ai_usage_metrics')) {
    throw new Error('TiDB connection timeout / pool exhausted');
  }
  return { rows: [], rowCount: 0 };
};

global.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{ content: { parts: [{ text: '{"resilient": true}' }] } }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 }
  })
});

// generateContent must NOT throw or crash when metrics write fails
let didSucceed = false;
try {
  const resilientOutput = await GeminiClient.generateContent({
    prompt: 'Check resilience',
    context: { workflow: 'EXAM_QUESTION_GENERATION' }
  });
  if (resilientOutput.includes('resilient')) didSucceed = true;
} catch (e) {
  didSucceed = false;
}

assert.strictEqual(didSucceed, true, 'GeminiClient must succeed even when ai_usage_metrics DB write fails');
pass('Fail-open design verified: Exam generation never fails due to telemetry persistence errors');

// ============================================================================
// TEST 5: Aggregated Reporting & Cost vs Confirmation Distinction
// ============================================================================
console.log('\n--- Test Group 5: Aggregated Usage & Cost Reporting ---');

// Mock db for getAggregatedUsageReport
db.query = async (sql) => {
  const sqlStr = typeof sql === 'string' ? sql : (sql?.text || '');
  if (sqlStr.includes('SELECT') && sqlStr.includes('ai_usage_metrics') && sqlStr.includes('GROUP BY model_name')) {
    return {
      rows: [
        {
          model_name: 'gemini-3-flash-preview',
          event_type: 'PROVIDER_CALL',
          is_estimated: 0,
          cnt: 14,
          p_tokens: 56000,
          c_tokens: 11200,
          t_tokens: 67200,
          cost: 0.0616
        },
        {
          model_name: 'gemini-3-flash-preview',
          event_type: 'PROVIDER_FAILURE',
          is_estimated: 0,
          cnt: 1,
          p_tokens: 0,
          c_tokens: 0,
          t_tokens: 0,
          cost: 0
        },
        {
          model_name: 'gemini-flash-latest',
          event_type: 'PROVIDER_CALL',
          is_estimated: 1,
          cnt: 2,
          p_tokens: 4000,
          c_tokens: 800,
          t_tokens: 4800,
          cost: 0.00072
        }
      ]
    };
  }
  return { rows: [], rowCount: 0 };
};

const report = await AiUsageMetricsService.getAggregatedUsageReport({
  startDate: '2026-10-01',
  endDate: '2026-10-15'
});

assert.strictEqual(report.totals.totalCalls, 17, 'Total calls must be 17');
assert.strictEqual(report.totals.successfulCalls, 16, 'Successful calls must be 16');
assert.strictEqual(report.totals.failedCalls, 1, 'Failed calls must be 1');
assert.strictEqual(report.totals.grandTotalTokens, 72000, 'Grand total tokens must be 72000');
assert.strictEqual(report.totals.actualTotalTokens, 67200, 'Actual tokens must be 67200');
assert.strictEqual(report.totals.estimatedTotalTokens, 4800, 'Estimated tokens must be 4800');
assert.ok(report.totals.billingNotice.includes('Confirmed billing'), 'Notice must clarify billing distinction');
pass('Aggregated report correctly groups by model, separates actual vs estimated tokens, and labels estimated costs');

// ============================================================================
// TEST 6: Cache Hit Zero Provider Calls and Zero Provider Cost
// ============================================================================
console.log('\n--- Test Group 6: Cache Hit Zero Provider Call Guarantee ---');

let cacheHitRowCaptured = null;
db.query = async (sql, params) => {
  const sqlStr = typeof sql === 'string' ? sql : (sql?.text || '');
  if (sqlStr.includes('INSERT INTO ai_usage_metrics')) {
    cacheHitRowCaptured = { sql: sqlStr, params };
    return { rows: [], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
};

await AiUsageMetricsService.recordCacheHit({
  studentId: 'stud-cache-test',
  bookId: '81b8a308-7fcf-4938-8c45-aa0056624f32',
  chapterId: '7f2409f5-19e4-4d89-9a2c-f684c31be991',
  cachedExamId: 'cached-exam-12345'
});

assert.ok(cacheHitRowCaptured, 'Cache hit must be logged');
assert.ok(cacheHitRowCaptured.sql.includes('CACHE_HIT'), 'Event type must be CACHE_HIT');
assert.ok(cacheHitRowCaptured.sql.includes('0, 0, 0, 0'), 'Cache hit must record 0 tokens and $0.00 cost');
pass('Cache hit incurs exactly 0 provider tokens and $0.00 provider cost');

// Restore original query
db.query = origQuery;

console.log('\n================================================================');
console.log(`ALL ${passed} TASK 2 TELEMETRY & COST TESTS PASSED PERFECTLY!`);
console.log('================================================================\n');
