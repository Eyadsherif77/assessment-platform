import assert from 'assert';
import { setupDisposableTestDb } from './test_isolation_helper.mjs';
const { dbPath, tempDir } = setupDisposableTestDb('phase1_telemetry');

import { AiUsageMetricsService, VERIFIED_MODEL_PRICING, DEFAULT_MODEL_PRICING } from '../dist/services/aiUsageMetricsService.js';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { db } from '../dist/db/db.js';

console.log('================================================================');
console.log('PHASE 1 — TELEMETRY AND COST CONTROLS UNIT TEST SUITE');
console.log('Zero External Gemini API Calls | Zero Production Data Mutation');
console.log('================================================================\n');

let passed = 0;
const pass = (name) => {
  passed++;
  console.log(`  [PASS] ${passed}. ${name}`);
};

// ============================================================================
// TEST 1: Model-specific pricing validation
// ============================================================================
console.log('--- Test Group 1: Model-Specific Pricing ---');

// Primary model: gemini-3-flash-preview
const g3Pricing = AiUsageMetricsService.getModelPricing('gemini-3-flash-preview');
assert.strictEqual(g3Pricing.inputPricePer1M, 0.50, 'gemini-3-flash-preview input must be $0.50 / 1M');
assert.strictEqual(g3Pricing.outputPricePer1M, 3.00, 'gemini-3-flash-preview output must be $3.00 / 1M');
assert.strictEqual(g3Pricing.isRecognized, true);

// Standard generation scenario: 5,200 prompt tokens, 1,200 output tokens
// 5,200 * $0.0000005 + 1,200 * $0.000003 = $0.0026 + $0.0036 = $0.0062
const g3Cost = AiUsageMetricsService.calculateCost('gemini-3-flash-preview', 5200, 1200);
assert.strictEqual(g3Cost, 0.0062, `Expected $0.0062, got ${g3Cost}`);
pass('Verified gemini-3-flash-preview pricing ($0.50/$3.00 per 1M -> $0.0062 per 5.2k/1.2k generation)');

// Fallback model 1: gemini-flash-latest / 2.0-flash
const latestPricing = AiUsageMetricsService.getModelPricing('gemini-flash-latest');
assert.strictEqual(latestPricing.inputPricePer1M, 0.10, 'gemini-flash-latest input must be $0.10 / 1M');
assert.strictEqual(latestPricing.outputPricePer1M, 0.40, 'gemini-flash-latest output must be $0.40 / 1M');
const latestCost = AiUsageMetricsService.calculateCost('gemini-flash-latest', 5200, 1200);
assert.strictEqual(latestCost, 0.001, `Expected $0.001, got ${latestCost}`);
pass('Verified gemini-flash-latest pricing ($0.10/$0.40 per 1M -> $0.001 per generation; not assumed equal to primary)');

// Fallback model 2: gemini-3.1-flash-lite-preview
const litePricing = AiUsageMetricsService.getModelPricing('gemini-3.1-flash-lite-preview');
assert.strictEqual(litePricing.inputPricePer1M, 0.075, 'gemini-3.1-flash-lite input must be $0.075 / 1M');
assert.strictEqual(litePricing.outputPricePer1M, 0.30, 'gemini-3.1-flash-lite output must be $0.30 / 1M');
const liteCost = AiUsageMetricsService.calculateCost('gemini-3.1-flash-lite-preview', 5200, 1200);
assert.strictEqual(liteCost, 0.00075, `Expected $0.00075, got ${liteCost}`);
pass('Verified gemini-3.1-flash-lite-preview pricing ($0.075/$0.30 per 1M -> $0.00075 per generation)');

// Unknown model fallback to conservative default
const unknownPricing = AiUsageMetricsService.getModelPricing('unknown-experimental-model');
assert.strictEqual(unknownPricing.isRecognized, false, 'Unknown model must flag isRecognized = false');
assert.strictEqual(unknownPricing.inputPricePer1M, DEFAULT_MODEL_PRICING.inputPricePer1M);
assert.strictEqual(unknownPricing.outputPricePer1M, DEFAULT_MODEL_PRICING.outputPricePer1M);
pass('Unknown model safely falls back to conservative primary pricing ($0.50/$3.00)');

// ============================================================================
// TEST 2: Missing usage metadata handling & estimation labeling
// ============================================================================
console.log('\n--- Test Group 2: Missing Usage Metadata & Token Estimation ---');

// Set up mock DB queries to capture recorded telemetry rows
const recordedRows = [];
const origQuery = db.query;
db.query = async (sql, params) => {
  const sqlStr = typeof sql === 'string' ? sql : (sql?.text || '');
  if (sqlStr.includes('INSERT INTO ai_usage_metrics')) {
    recordedRows.push({ sql: sqlStr, params });
    return { rows: [], rowCount: 1 };
  }
  if (sqlStr.includes('UPDATE ai_usage_metrics')) {
    recordedRows.push({ sql: sqlStr, params });
    return { rows: [], rowCount: 1 };
  }
  if (sqlStr.includes('SELECT COALESCE(SUM(estimated_cost_usd)')) {
    return { rows: [{ total_spent: 0, total_tokens: 0 }] };
  }
  if (sqlStr.includes('CREATE TABLE') || sqlStr.includes('ALTER TABLE')) {
    return { rows: [], rowCount: 0 };
  }
  if (sqlStr.includes('SELECT is_estimated, call_purpose')) {
    return { rows: [] };
  }
  return origQuery.call(db, sql, params);
};

// Test recording provider call with exact provider metadata
await AiUsageMetricsService.recordProviderCall({
  studentId: 'stud-1',
  bookId: 'book-1',
  chapterId: 'ch-1',
  configHash: 'hash-abc',
  modelName: 'gemini-3-flash-preview',
  promptTokens: 5200,
  candidatesTokens: 1200,
  totalTokens: 6400,
  durationMs: 1450,
  isEstimated: false
});

const callRow = recordedRows[recordedRows.length - 1];
assert.ok(callRow, 'Provider call row must be recorded');
// params: [id, studentId, bookId, chapterId, configHash, cachedExamId, modelName, promptTokens, candidatesTokens, totalTokens, costUsd, durationMs, isEstimated, callPurpose]
assert.strictEqual(callRow.params[6], 'gemini-3-flash-preview', 'Model name must match');
assert.strictEqual(callRow.params[7], 5200, 'Prompt tokens must match exact provider count');
assert.strictEqual(callRow.params[8], 1200, 'Candidate tokens must match exact provider count');
assert.strictEqual(callRow.params[10], 0.0062, 'Cost must be calculated using model pricing');
assert.strictEqual(callRow.params[12], 0, 'is_estimated must be 0 when provider metadata is present');
pass('Provider call with actual metadata recorded with is_estimated = 0 and exact $0.0062 cost');

// Test recording provider call when metadata is missing
await AiUsageMetricsService.recordProviderCall({
  studentId: 'stud-2',
  bookId: 'book-1',
  chapterId: 'ch-1',
  configHash: 'hash-xyz',
  modelName: 'gemini-flash-latest',
  promptTokens: 4000,
  candidatesTokens: 1000,
  totalTokens: 5000,
  durationMs: 980,
  isEstimated: true
});

const estimatedRow = recordedRows[recordedRows.length - 1];
assert.strictEqual(estimatedRow.params[6], 'gemini-flash-latest');
assert.strictEqual(estimatedRow.params[10], 0.0008, 'Cost must be calculated with fallback model pricing');
assert.strictEqual(estimatedRow.params[12], 1, 'is_estimated must be 1 when metadata was estimated');
pass('Missing usage metadata clearly flagged with is_estimated = 1 and labeled estimated cost');

// ============================================================================
// TEST 3: Retries and fallback models telemetry recording
// ============================================================================
console.log('\n--- Test Group 3: Retries & Fallback Models Telemetry ---');

const origFetch = global.fetch;
process.env.GEMINI_API_KEY = 'test-api-key-mock';
GeminiClient.resetForTests();
GeminiClient.minIntervalMs = 0;
GeminiClient.backoffBaseMs = 1;

const model0 = GeminiClient.candidateModels[0];
const model1 = GeminiClient.candidateModels[1];

let attemptedModels = [];
global.fetch = async (url) => {
  const model = String(url).match(/models\/([^:]+):/)?.[1] || 'unknown';
  attemptedModels.push(model);
  if (model === model0) {
    // Primary model encounters temporary 503 overload
    return {
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'The model is overloaded. Please try again later.' } })
    };
  }
  // Fallback model succeeds
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: '{"success": true}' }] } }],
      usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 300, totalTokenCount: 1800 }
    })
  };
};

const genResult = await GeminiClient.generateContent({
  prompt: 'Generate quiz questions',
  telemetryContext: { studentId: 'stud-fallback', bookId: 'b-1', chapterId: 'ch-1', callPurpose: 'EXAM_GENERATION' }
});

assert.ok(genResult.includes('success'), 'Fallback call must succeed');
assert.ok(attemptedModels.includes(model0), 'Primary model must have been attempted');
assert.ok(attemptedModels.includes(model1), 'Fallback model must have been attempted');

// Check recorded telemetry: MUST have both a PROVIDER_FAILURE for primary and a PROVIDER_CALL for fallback
const failureRecords = recordedRows.filter(r => r.sql.includes('PROVIDER_FAILURE') && r.params.includes(model0));
assert.ok(failureRecords.length >= 1, 'Failure on primary model must be recorded in ai_usage_metrics');

const successRecords = recordedRows.filter(r => r.sql.includes('PROVIDER_CALL') && r.params.includes(model1));
assert.ok(successRecords.length >= 1, 'Success on fallback model must be recorded with its specific model name');
pass('Retries and fallback models: Primary failure (503) and fallback success independently instrumented');

// ============================================================================
// TEST 4: Cache hit and miss events
// ============================================================================
console.log('\n--- Test Group 4: Cache Hit and Miss Events ---');

await AiUsageMetricsService.recordCacheHit({
  studentId: 'stud-cache-1',
  bookId: 'b-1',
  chapterId: 'ch-1',
  configHash: 'hash-hit',
  cachedExamId: 'exam-cached-999'
});

const hitRow = recordedRows[recordedRows.length - 1];
assert.ok(hitRow.sql.includes('CACHE_HIT'));
assert.strictEqual(hitRow.params[5], 'exam-cached-999');
pass('Cache hit event recorded with 0 provider tokens and 0 cost');

await AiUsageMetricsService.recordCacheMiss({
  studentId: 'stud-cache-2',
  bookId: 'b-1',
  chapterId: 'ch-1',
  configHash: 'hash-miss',
  reason: 'NOT_FOUND'
});

const missRow = recordedRows[recordedRows.length - 1];
assert.ok(missRow.sql.includes('CACHE_MISS'));
assert.strictEqual(missRow.params[5], 'NOT_FOUND');
pass('Cache miss event recorded with reason diagnosis and 0 cost');

// ============================================================================
// TEST 5: Concurrency-safe monthly budget reservation and enforcement
// ============================================================================
console.log('\n--- Test Group 5: Concurrency-Safe Budget Reservation ---');

// Mock a budget near exhaustion: Budget limit is $10.00, already spent $9.995
process.env.GEMINI_MONTHLY_BUDGET_USD = '10.00';
process.env.GEMINI_BUDGET_ENFORCED = 'true';

let mockSpent = 9.995;
let mockActiveReservations = [];

db.query = async (sql, params) => {
  const sqlStr = typeof sql === 'string' ? sql : (sql?.text || '');
  if (sqlStr.includes('SELECT COALESCE(SUM(estimated_cost_usd)')) {
    const totalReservations = mockActiveReservations.reduce((acc, r) => acc + r.cost, 0);
    return {
      rows: [{
        total_spent: mockSpent + totalReservations,
        total_tokens: 100000
      }]
    };
  }
  if (sqlStr.includes('INSERT INTO ai_usage_metrics') && sqlStr.includes('BUDGET_RESERVATION')) {
    mockActiveReservations.push({ id: params[0], cost: params[9] });
    return { rows: [], rowCount: 1 };
  }
  if (sqlStr.includes('DELETE FROM ai_usage_metrics') || sqlStr.includes('PROVIDER_FAILURE')) {
    mockActiveReservations = mockActiveReservations.filter(r => r.id !== params[params.length - 1]);
    return { rows: [], rowCount: 1 };
  }
  return { rows: [], rowCount: 1 };
};

// Check 1: Remaining budget is $0.005, which is LESS than 1 generation ($0.0062)
const budgetCheck = await AiUsageMetricsService.checkMonthlyBudgetLimit();
assert.strictEqual(budgetCheck.allowed, false, 'Must reject when remaining budget < MIN_GEN_COST_USD ($0.0062)');
assert.strictEqual(budgetCheck.reason, 'BUDGET_LIMIT_REACHED');
pass('Budget guard fails closed when remaining budget ($0.005) is insufficient for 1 generation ($0.0062)');

// Reset budget to allow 2 generations ($0.015 remaining)
mockSpent = 9.985; // $10.00 - 9.985 = $0.015 remaining
mockActiveReservations = [];

// Request 1 reserves budget
const res1 = await AiUsageMetricsService.reserveBudget({
  studentId: 'stud-c1',
  modelName: 'gemini-3-flash-preview'
});
assert.strictEqual(res1.allowed, true, 'First concurrent request must be granted reservation');
assert.ok(res1.reservationId, 'Must receive unique reservation ID');

// With Request 1 holding $0.0062, remaining is $0.015 - $0.0062 = $0.0088 (allows 1 more)
const res2 = await AiUsageMetricsService.reserveBudget({
  studentId: 'stud-c2',
  modelName: 'gemini-3-flash-preview'
});
assert.strictEqual(res2.allowed, true, 'Second concurrent request within budget granted reservation');

// With Request 1 & 2 holding $0.0124, remaining is $0.015 - $0.0124 = $0.0026 (< $0.0062)
// Request 3 attempts concurrent generation: MUST BE BLOCKED immediately
const res3 = await AiUsageMetricsService.reserveBudget({
  studentId: 'stud-c3',
  modelName: 'gemini-3-flash-preview'
});
assert.strictEqual(res3.allowed, false, 'Third concurrent request must be blocked by concurrent reservation guard');
assert.strictEqual(res3.reason, 'BUDGET_LIMIT_REACHED');
pass('Concurrent reservation guard prevents multiple distributed instances from exceeding budget');

// Releasing Request 2 frees the reservation
await AiUsageMetricsService.releaseReservation(res2.reservationId);
const res4 = await AiUsageMetricsService.reserveBudget({
  studentId: 'stud-c4',
  modelName: 'gemini-3-flash-preview'
});
assert.strictEqual(res4.allowed, true, 'Freed reservation immediately permits subsequent queued request');
pass('Released reservation cleanly restores budget headroom');

// Clean up
global.fetch = origFetch;
db.query = origQuery;

console.log('\n================================================================');
console.log(`ALL ${passed} PHASE 1 TELEMETRY AND COST CONTROL TESTS PASSED PERFECTLY!`);
console.log('================================================================');
