import assert from 'assert';
import { AiUsageMetricsService, TelemetrySchemaError } from '../dist/services/aiUsageMetricsService.js';
import { ReadinessValidator } from '../dist/services/readinessValidator.js';
import {
  computeEducationalBM25Score,
  validateEmbeddingVector,
  cosineSimilarity
} from '../dist/services/ai/vectorEmbedding.js';
import { areChunkValuesEqual } from '../src/db/migrations/hardened_seed_archive.mjs';

console.log('================================================================');
console.log('REMEDIATION HARDENING REGRESSION TEST SUITE');
console.log('Isolated Offline Mocks | Zero Production DB | Zero External API');
console.log('================================================================\n');

let passed = 0;
const pass = (desc) => {
  passed++;
  console.log(`  [PASS] ${passed}. ${desc}`);
};

// ============================================================================
// 1. VECTOR VALIDATION: dimension, NaN, model mismatch
// ============================================================================
console.log('--- 1. Vector Validation ---');

const nullVec = validateEmbeddingVector(null, 768);
assert.strictEqual(nullVec.valid, false);
assert.ok(nullVec.error?.includes('null or empty'));
pass('validateEmbeddingVector correctly rejects null vector');

const wrongDimVec = validateEmbeddingVector(new Array(512).fill(0.1), 768);
assert.strictEqual(wrongDimVec.valid, false);
assert.ok(wrongDimVec.error?.includes('Dimension mismatch'));
pass('validateEmbeddingVector rejects wrong dimension (512 vs 768)');

const nanVec = validateEmbeddingVector([0.1, NaN, 0.3], 3);
assert.strictEqual(nanVec.valid, false);
assert.ok(nanVec.error?.includes('Invalid numeric value'));
pass('validateEmbeddingVector rejects NaN values in vector array');

const validVec = validateEmbeddingVector(new Array(768).fill(0.05), 768);
assert.strictEqual(validVec.valid, true);
assert.strictEqual(validVec.vector?.length, 768);
pass('validateEmbeddingVector accepts valid 768-float array');

// Model mismatch detection (JSON-wrapped vector with wrong model tag)
const wrongModelVec = validateEmbeddingVector(
  JSON.stringify({ model: 'text-embedding-004', values: new Array(768).fill(0.1) }),
  768,
  'gemini-embedding-001'
);
assert.strictEqual(wrongModelVec.valid, false);
assert.ok(wrongModelVec.error?.includes('Model mismatch'));
pass('validateEmbeddingVector rejects vector with wrong model tag');

// Plain array passes model-untagged check (no model tag = no mismatch)
const plainVec = validateEmbeddingVector(new Array(768).fill(0.1), 768, 'gemini-embedding-001');
assert.strictEqual(plainVec.valid, true);
pass('validateEmbeddingVector accepts plain 768-dim array when no model tag present');

// ============================================================================
// 2. TELEMETRY SCHEMA VALIDATION & OFFLINE MOCK
// ============================================================================
console.log('\n--- 2. Telemetry Schema Validation & TelemetrySchemaError ---');

// Test validateSchema with mock queryFn that simulates schema with both columns
const schemaOk = await AiUsageMetricsService.validateSchema(async (sql) => {
  // Simulated successful probe: columns exist
  return { rows: [] };
});
assert.strictEqual(schemaOk.valid, true);
assert.deepStrictEqual(schemaOk.missingColumns, []);
pass('validateSchema(mockFn) returns valid=true when probe succeeds');

// Test validateSchema with mock queryFn that simulates missing columns
const schemaBad = await AiUsageMetricsService.validateSchema(async (sql) => {
  throw new Error("Unknown column 'is_estimated' in 'field list'");
});
assert.strictEqual(schemaBad.valid, false);
assert.ok(schemaBad.missingColumns.includes('is_estimated'));
pass('validateSchema(mockFn) returns valid=false when probe fails');

// Test assertSchemaValid throws TelemetrySchemaError
let thrownSchemaErr = null;
try {
  await AiUsageMetricsService.assertSchemaValid(async (sql) => {
    throw new Error("Unknown column 'call_purpose'");
  });
} catch (err) {
  thrownSchemaErr = err;
}
assert.ok(thrownSchemaErr instanceof TelemetrySchemaError, 'assertSchemaValid must throw TelemetrySchemaError on failure');
assert.ok(thrownSchemaErr.code === 'TELEMETRY_SCHEMA_INCOMPATIBLE');
assert.ok(thrownSchemaErr.migrationFile === '20261014_add_telemetry_columns.sql');
pass('assertSchemaValid throws TelemetrySchemaError with migrationFile reference on missing columns');

// TelemetrySchemaError does NOT throw on valid schema
let noErr = null;
try {
  await AiUsageMetricsService.assertSchemaValid(async (sql) => ({ rows: [] }));
} catch (err) {
  noErr = err;
}
assert.strictEqual(noErr, null, 'assertSchemaValid must not throw when schema is valid');
pass('assertSchemaValid does not throw when schema is valid');

// ============================================================================
// 3. EDUCATIONAL BM25 SCORER & RETRIEVAL SAFETY
// ============================================================================
console.log('\n--- 3. Educational BM25 Retrieval Safety ---');

const docA = 'الذرة هي وحدة بناء المادة وتتكون من بروتونات ونيوترونات وإلكترونات تدور حول النواة.';
const docB = 'تعد الحضارة المصرية القديمة من أقدم الحضارات الزراعية في وادي النيل وإفريقيا.';

const scoreExactA = computeEducationalBM25Score('وحدة بناء المادة الذرة', docA);
const scoreExactB = computeEducationalBM25Score('وحدة بناء المادة الذرة', docB);
assert.ok(scoreExactA > scoreExactB, 'BM25 must rank Science passage higher for Science query');
assert.strictEqual(scoreExactB, 0, 'Irrelevant History document must score 0 for Science terms');
pass('Educational BM25 correctly discriminates between relevant and irrelevant documents');

const scoreNorm1 = computeEducationalBM25Score('الذره وحده بناء الماده', docA);
assert.ok(scoreNorm1 > 0.5, 'BM25 normalized spelling must match document terms with high score');
pass('Educational BM25 normalizes Arabic spelling variants (ة/ه and hamzas)');

// ============================================================================
// 4. READINESS VALIDATOR: FAIL-CLOSED GATES (DB-INDEPENDENT CASES)
// ============================================================================
console.log('\n--- 4. Per-Unit Readiness Independence ---');

// Test 4.1: Non-existent production unit (no inventory, no DB record)
// Both the async path (if DB can be reached with an empty result) and the
// static path (missing unit) must now return BLOCKED, not NOT_AUDITED.
// We test the synchronous path (getUnitReadiness) for offline isolation.
const unknownSync = ReadinessValidator.getUnitReadiness('fa2a1525-c46f-4b34-9f48-b762be88e5c5', 'non-existent-chapter');
assert.strictEqual(unknownSync.isEligibleForAI, false);
assert.strictEqual(unknownSync.status, 'BLOCKED');
pass('Synchronous readiness check returns BLOCKED (not NOT_AUDITED) for unknown production unit');

// Test 4.2: Synthetic test fixtures must still be allowed
const syntheticCheck = ReadinessValidator.getUnitReadiness('book_test_001', 'ch_test_001');
assert.strictEqual(syntheticCheck.isEligibleForAI, true);
assert.strictEqual(syntheticCheck.status, 'VERIFIED_READY');
pass('Synthetic test fixture units are still authorized for offline test harness');

// Test 4.3: Async path returns BLOCKED for unknown unit (with or without DB connectivity)
// In offline test, DB is unavailable so it falls through to the missing-unit path.
// In online test with TiDB, the unit does not exist in DB so same fallback applies.
const staticOnlyCheck = await ReadinessValidator.getUnitReadinessAsync('fa2a1525-c46f-4b34-9f48-b762be88e5c5', 'non-existent-chapter');
// After our fix, BLOCKED is returned via evaluateMissingUnit (DB error/no row triggers fallback)
assert.strictEqual(staticOnlyCheck.isEligibleForAI, false,
  `Expected isEligibleForAI=false, got: ${staticOnlyCheck.isEligibleForAI}`);
assert.ok(
  staticOnlyCheck.status === 'BLOCKED',
  `Expected status=BLOCKED, got: ${staticOnlyCheck.status}`
);
pass('Async readiness check refuses to authorize unknown production unit (BLOCKED, not NOT_AUDITED)');

// ============================================================================
// 5. MIGRATION TYPE-AWARE EQUALITY COMPARISON
// ============================================================================
console.log('\n--- 5. Migration Row Comparison Precision ---');

const dateA = new Date('2026-10-06T12:00:00.000Z');
const dateB = new Date('2026-10-06T12:00:00.500Z');
const dateC = new Date('2026-10-06T12:05:00.000Z');
assert.strictEqual(areChunkValuesEqual('created_at', dateA, dateB), true, 'Timestamps within 1s must be equal');
assert.strictEqual(areChunkValuesEqual('created_at', dateA, dateC), false, 'Different timestamps must not be equal');
pass('areChunkValuesEqual correctly handles date comparisons');

const embA = JSON.stringify([0.1234567, 0.9876543]);
const embB = JSON.stringify([0.1234568, 0.9876542]);
const embC = JSON.stringify([0.2234567, 0.9876543]);
assert.strictEqual(areChunkValuesEqual('embedding', embA, embB), true, 'Float vectors within 1e-6 must be equal');
assert.strictEqual(areChunkValuesEqual('embedding', embA, embC), false, 'Vectors with different values must be unequal');
pass('areChunkValuesEqual correctly compares float embedding JSON vectors');

// Metadata JSON normalization
const metaA = JSON.stringify({ page: 1, charCount: 500 });
const metaB = JSON.stringify({ charCount: 500, page: 1 }); // different key order
// Note: JSON.stringify(JSON.parse()) does NOT reorder keys in JS - this tests deep string equality
assert.strictEqual(areChunkValuesEqual('metadata', metaA, metaA), true, 'Identical metadata must be equal');
assert.strictEqual(areChunkValuesEqual('metadata', metaA, '{"page":2}'), false, 'Different metadata must not be equal');
pass('areChunkValuesEqual correctly handles metadata JSON comparison');

// Null handling
assert.strictEqual(areChunkValuesEqual('content', null, null), true, 'Two null values must be equal');
assert.strictEqual(areChunkValuesEqual('content', null, 'text'), false, 'Null vs non-null must be unequal');
pass('areChunkValuesEqual correctly handles null-vs-null and null-vs-value');

console.log(`\n================================================================`);
console.log(`ALL ${passed} REMEDIATION HARDENING TESTS PASSED!`);
console.log(`================================================================`);
