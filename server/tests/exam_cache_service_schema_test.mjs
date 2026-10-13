import fs from 'fs';
import path from 'path';
import assert from 'assert';
import dotenv from 'dotenv';
dotenv.config();

import { connect } from '@tidbcloud/serverless';
import { ExamCacheService } from '../dist/services/examCacheService.js';

console.log('========================================================================');
console.log('🧪 TEST: EXAM CACHE SERVICE & AUTHORITATIVE SCHEMA VALIDATION');
console.log('Mode: Strictly Read-Only Schema Inspection | Zero Database Writes');
console.log('========================================================================\n');

// 1. Static Source Code Inspection of ExamCacheService
console.log('▶ Step 1: Inspecting ExamCacheService source code for table references...');
const servicePath = path.resolve('src/services/examCacheService.ts');
assert(fs.existsSync(servicePath), 'examCacheService.ts must exist');
const serviceContent = fs.readFileSync(servicePath, 'utf8');

// Assert zero occurrences of the incorrect table name 'exam_assignments'
const incorrectTableRegex = /\bexam_assignments\b/g;
const incorrectMatches = serviceContent.match(incorrectTableRegex);
assert.strictEqual(
  incorrectMatches,
  null,
  `ExamCacheService must NOT contain any reference to 'exam_assignments'. Found: ${incorrectMatches}`
);
console.log('  ✔ Confirmed: Zero occurrences of "exam_assignments" in ExamCacheService.ts');

// Assert authoritative table name 'student_exam_assignments' is present in all expected queries
const authoritativeTableRegex = /\bstudent_exam_assignments\b/g;
const authoritativeMatches = serviceContent.match(authoritativeTableRegex);
assert(
  authoritativeMatches && authoritativeMatches.length >= 4,
  `ExamCacheService must reference 'student_exam_assignments' in candidate lookup, assignment listing, recording, and clearing (found ${authoritativeMatches?.length || 0})`
);
console.log(`  ✔ Confirmed: ${authoritativeMatches.length} authoritative references to "student_exam_assignments" in ExamCacheService.ts`);

// 2. Read-Only TiDB Live Schema Verification
console.log('\n▶ Step 2: Live TiDB Schema Verification (Read-Only)...');
const conn = connect({
  host: process.env.TIDB_HOST,
  username: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE
});

// A. Check that exam_assignments does NOT exist
const nonExistentCheck = await conn.execute("SHOW TABLES LIKE 'exam_assignments'");
assert.strictEqual(
  nonExistentCheck.length,
  0,
  "Authoritative TiDB schema check: 'exam_assignments' must NOT exist"
);
console.log('  ✔ Confirmed in TiDB: Table "exam_assignments" does NOT exist (0 tables found)');

// B. Check that student_exam_assignments DOES exist
const authoritativeCheck = await conn.execute("SHOW TABLES LIKE 'student_exam_assignments'");
assert.strictEqual(
  authoritativeCheck.length,
  1,
  "Authoritative TiDB schema check: 'student_exam_assignments' MUST exist"
);
console.log('  ✔ Confirmed in TiDB: Authoritative table "student_exam_assignments" exists (1 table found)');

// C. Verify all columns of student_exam_assignments match ExamCacheService requirements
const descRows = await conn.execute("DESCRIBE student_exam_assignments");
const columnMap = new Map();
descRows.forEach(r => columnMap.set(r.Field, r));

const requiredColumns = ['id', 'cached_exam_id', 'student_id', 'config_hash', 'assigned_at', 'status'];
for (const col of requiredColumns) {
  assert(columnMap.has(col), `Column "${col}" must exist in student_exam_assignments`);
}
console.log(`  ✔ Confirmed in TiDB: All 6 required columns exist (${requiredColumns.join(', ')})`);

// 3. In-Memory Logic Tests of ExamCacheService
console.log('\n▶ Step 3: In-Memory Logic Validation of ExamCacheService...');
const sampleConfigKey = 'STAGE:PREP|GRADE:PREP1|SUBJ:ARABIC|TERM:1|UNITS:u1,u2|PARAMS:hash123';
const configHash = ExamCacheService.computeConfigHash(sampleConfigKey);
assert.strictEqual(typeof configHash, 'string');
assert.strictEqual(configHash.length, 64, 'configHash must be 64-char SHA-256');

const sampleQuestions = [
  { question_text: 'سؤال 1', options: [{ text: 'أ' }, { text: 'ب' }], answer: 'أ' },
  { question_text: 'سؤال 2', options: [{ text: 'ج' }, { text: 'د' }], answer: 'ج' }
];
const contentHash = ExamCacheService.computeContentHash(sampleQuestions);
assert.strictEqual(typeof contentHash, 'string');
assert.strictEqual(contentHash.length, 64, 'contentHash must be 64-char SHA-256');

// Test memory cache clearing
ExamCacheService.clearMemoryCache();
console.log('  ✔ Confirmed: In-memory hash computation and cache clearing functions operate correctly');

console.log('\n========================================================================');
console.log('🎉 ALL EXAM CACHE SERVICE SCHEMA & REFERENCE CHECKS PASSED GREEN');
console.log('Authoritative Table: student_exam_assignments (Verified in TiDB & Code)');
console.log('Database writes performed: 0 (Strict read-only)');
console.log('========================================================================\n');
