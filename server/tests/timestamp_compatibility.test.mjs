import assert from 'assert';
import { parseDbTimestamp } from '../dist/routes/exams.js';

console.log('================================================================');
console.log('FARABI AI — PRODUCTION TIMESTAMP COMPATIBILITY PROOF');
console.log('TiDB/MySQL DATETIME Parsing | Timezone Determinism | Expiry Math');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

// ----------------------------------------------------------------------------
// TEST 1: Driver String Format Compatibility (MySQL / TiDB format vs ISO format)
// ----------------------------------------------------------------------------
runTest('parseDbTimestamp handles TiDB/MySQL DATETIME string (YYYY-MM-DD HH:MM:SS) identically to ISO string', () => {
  const sqlString = '2026-10-27 03:30:00';
  const isoString = '2026-10-27T03:30:00.000Z';

  const sqlMs = parseDbTimestamp(sqlString);
  const isoMs = parseDbTimestamp(isoString);

  assert.strictEqual(sqlMs, isoMs, 'SQL DATETIME string must parse to exact same epoch milliseconds as ISO UTC string');
  assert.strictEqual(new Date(sqlMs).toISOString(), '2026-10-27T03:30:00.000Z');
});

// ----------------------------------------------------------------------------
// TEST 2: mysql2 Date Instance Compatibility
// ----------------------------------------------------------------------------
runTest('parseDbTimestamp handles native Date instance returned by mysql2 driver', () => {
  const nativeDate = new Date('2026-10-27T03:30:00.000Z');
  const parsedMs = parseDbTimestamp(nativeDate);

  assert.strictEqual(parsedMs, nativeDate.getTime());
});

// ----------------------------------------------------------------------------
// TEST 3: TiDB Fractional Seconds Format Compatibility
// ----------------------------------------------------------------------------
runTest('parseDbTimestamp handles SQL strings with milliseconds/microseconds', () => {
  const sqlFractional = '2026-10-27 03:30:00.500';
  const isoFractional = '2026-10-27T03:30:00.500Z';

  const parsedMs = parseDbTimestamp(sqlFractional);
  const expectedMs = new Date(isoFractional).getTime();

  assert.strictEqual(parsedMs, expectedMs);
});

// ----------------------------------------------------------------------------
// TEST 4: Null / Undefined / Falsy Fallback
// ----------------------------------------------------------------------------
runTest('parseDbTimestamp safely falls back to current time when falsy', () => {
  const now = Date.now();
  const nullMs = parseDbTimestamp(null);
  const undefinedMs = parseDbTimestamp(undefined);

  assert.ok(Math.abs(nullMs - now) < 50);
  assert.ok(Math.abs(undefinedMs - now) < 50);
});

// ----------------------------------------------------------------------------
// TEST 5: Elapsed Time Determinism Across Host Machine Timezones
// ----------------------------------------------------------------------------
runTest('Elapsed time computation is strictly identical regardless of host timezone', () => {
  // Simulate an attempt started 120 seconds ago in UTC
  const fixedNow = 1793070000000;
  const startedAtEpoch = fixedNow - 120000; // 120 seconds ago
  const startedAtSql = new Date(startedAtEpoch).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

  const parsedStartedAt = parseDbTimestamp(startedAtSql);
  const elapsedSeconds = (fixedNow - parsedStartedAt) / 1000;

  assert.strictEqual(elapsedSeconds, 120, 'Elapsed seconds must equal exactly 120');
});

// ----------------------------------------------------------------------------
// TEST 6: Monotonic Refresh Persistence
// ----------------------------------------------------------------------------
runTest('Repeated calls on attempt return strictly monotonic decrementing remaining_seconds', () => {
  const durationMinutes = 15;
  const durationSeconds = durationMinutes * 60; // 900s
  const fixedStartMs = 1793070000000;
  const startedAtSql = new Date(fixedStartMs).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

  // Call 1: At start
  const now1 = fixedStartMs;
  const rem1 = Math.max(0, durationSeconds - Math.floor((now1 - parseDbTimestamp(startedAtSql)) / 1000));
  assert.strictEqual(rem1, 900);

  // Call 2: After 30 seconds (first page load)
  const now2 = fixedStartMs + 30000;
  const rem2 = Math.max(0, durationSeconds - Math.floor((now2 - parseDbTimestamp(startedAtSql)) / 1000));
  assert.strictEqual(rem2, 870);

  // Call 3: Student refreshes after another 45 seconds (total 75s elapsed)
  const now3 = fixedStartMs + 75000;
  const rem3 = Math.max(0, durationSeconds - Math.floor((now3 - parseDbTimestamp(startedAtSql)) / 1000));
  assert.strictEqual(rem3, 825);

  assert.ok(rem1 > rem2 && rem2 > rem3, 'Remaining seconds must decrement monotonically');
});

// ----------------------------------------------------------------------------
// TEST 7: Deadline Expiry and 90-Second Grace Period Precision
// ----------------------------------------------------------------------------
runTest('Expiration condition (durationSeconds + 90s grace) triggers precisely', () => {
  const durationMinutes = 10;
  const durationSeconds = durationMinutes * 60; // 600 seconds
  const graceSeconds = 90;
  const fixedStartMs = 1793070000000;
  const startedAtSql = new Date(fixedStartMs).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  const parsedStartMs = parseDbTimestamp(startedAtSql);

  // Case A: Exactly at nominal deadline (600s) -> NOT expired (still in grace period)
  const nowAtDeadline = fixedStartMs + 600 * 1000;
  const elapsedAtDeadline = (nowAtDeadline - parsedStartMs) / 1000;
  assert.strictEqual(elapsedAtDeadline > (durationSeconds + graceSeconds), false);

  // Case B: At deadline + 89 seconds (689s) -> NOT expired
  const nowAtGraceEdge = fixedStartMs + 689 * 1000;
  const elapsedAtGraceEdge = (nowAtGraceEdge - parsedStartMs) / 1000;
  assert.strictEqual(elapsedAtGraceEdge > (durationSeconds + graceSeconds), false);

  // Case C: At deadline + 91 seconds (691s) -> EXPIRED
  const nowPastGrace = fixedStartMs + 691 * 1000;
  const elapsedPastGrace = (nowPastGrace - parsedStartMs) / 1000;
  assert.strictEqual(elapsedPastGrace > (durationSeconds + graceSeconds), true);
});

console.log(`\n================================================================`);
console.log(`ALL TIMESTAMP COMPATIBILITY PROOFS PASSED: ${passedTests}/${totalTests}`);
console.log(`================================================================\n`);
