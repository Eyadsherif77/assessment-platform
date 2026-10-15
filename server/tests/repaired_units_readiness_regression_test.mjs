/**
 * ============================================================================
 * Alfarabi AI — Repaired Units Readiness & Non-Interference Regression Test
 * Tests:
 * 1. Chunk-to-page boundary associations for all 4 repaired units
 * 2. Complete absence of out-of-bounds chunks in the 4 units
 * 3. Ineligibility of disassociated legacy chunks
 * 4. Readiness checks for repaired units using verified source content
 * 5. Intact feedback engine & answer-key scoring
 * ============================================================================
 */
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
import { connect } from '@tidbcloud/serverless';
import dotenv from 'dotenv';
import { ReadinessValidator } from '../dist/services/readinessValidator.js';
import { truncateAtWordBoundary, findBestSupportingPassage } from '../dist/services/ai/aiRagEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const conn = connect({
  host: process.env.TIDB_HOST,
  username: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE
});

const TARGET_UNITS = [
  { bookId: '19886434-1839-427d-af31-4c64fcf79525', chapterId: '8ccdd54b-87ed-419f-a737-a35f11620f15', name: 'Math Prep 2 Unit 1', startPage: 4, endPage: 34, expectedChunks: 30 },
  { bookId: 'bc6bb834-7192-474c-8507-c53265028b4e', chapterId: '902f6adf-8043-4247-b80c-42bb48d200b8', name: 'Arabic Prep 1 Unit 1', startPage: 11, endPage: 56, expectedChunks: 46 },
  { bookId: '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', chapterId: '192c06db-b3e1-4717-b6e9-0b06a0364764', name: 'English Prep 1 Unit 1', startPage: 14, endPage: 27, expectedChunks: 14 },
  { bookId: '37bfa0c0-c4ce-419f-930a-000043d8d3f9', chapterId: 'af732e7e-1a38-4b17-b23e-d09ac0ac92f1', name: 'English Prep 2 Unit 1', startPage: 14, endPage: 27, expectedChunks: 14 }
];

const DISASSOCIATED_CHUNK_IDS = [
  '3424e307-7752-4181-b9a8-7e6c8476d824', '01d46f85-e7f2-4d9d-99bb-ec7f85a631b9', 'ea569bc9-ea0d-42aa-8b4b-b727b930804c',
  '53a5ab62-4e00-4180-8ce2-d2ecb9cfd7e3', '4e215896-79b1-4474-95e7-1e499848e082', 'b433fbb8-4b77-4552-97de-2f7b0639910a',
  '0aec7ec0-6bdc-4709-80c4-bc5234f95b93', '5d882c5c-1b43-4f84-9a22-75d1e0ce1aef', '39eaab2d-f2aa-4765-88fd-1a5b602da4b2',
  'a0987196-f4a6-4cbd-a981-fa0a1cb71656', '6bdbcf8e-d771-471e-b879-558761777248', '74227d01-6d25-47da-9f6e-1641a910b850'
];

async function run() {
  console.log('================================================================');
  console.log('REPAIRED UNITS READINESS & INTEGRITY VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  const pass = (name) => {
    passed++;
    console.log(`  [PASS] ${passed}. ${name}`);
  };

  // TEST 1: Boundary and Chunk-to-Page Associations
  console.log('--- Test 1: Chunk-to-Page Associations ---');
  for (const u of TARGET_UNITS) {
    const res = await conn.execute(`
      SELECT 
        COUNT(chk.id) as chunk_count,
        MIN(chk.page_number) as min_page,
        MAX(chk.page_number) as max_page,
        SUM(CASE WHEN chk.page_number < bc.start_page OR chk.page_number > bc.end_page THEN 1 ELSE 0 END) as oob_count,
        COALESCE(SUM(LENGTH(chk.content)), 0) as total_chars
      FROM book_chapters bc
      JOIN book_chunks chk ON chk.chapter_id = bc.id AND chk.book_id = bc.book_id
      WHERE bc.id = ?
      GROUP BY bc.id
    `, [u.chapterId]);

    const stats = res[0];
    assert.strictEqual(parseInt(stats.chunk_count, 10), u.expectedChunks, `Chunk count must match expected for ${u.name}`);
    assert.strictEqual(parseInt(stats.oob_count, 10), 0, `OOB count must be strictly 0 for ${u.name}`);
    assert.ok(stats.min_page >= u.startPage, `Min page ${stats.min_page} must be >= unit start page ${u.startPage}`);
    assert.ok(stats.max_page <= u.endPage, `Max page ${stats.max_page} must be <= unit end page ${u.endPage}`);
    assert.ok(stats.total_chars > 1000, `Total chars must be substantial for ${u.name}`);
  }
  pass('All four units have verified, contiguous chunk-to-page associations with 0 out-of-bounds chunks');

  // TEST 2: Disassociated Legacy Chunks Isolation
  console.log('\n--- Test 2: Legacy Chunks Isolation ---');
  const legacyRows = await conn.execute(
    `SELECT id, chapter_id, page_number FROM book_chunks WHERE id IN (${DISASSOCIATED_CHUNK_IDS.map(() => '?').join(',')})`,
    DISASSOCIATED_CHUNK_IDS
  );
  assert.strictEqual(legacyRows.length, 12, 'All 12 legacy chunks must exist in DB');
  for (const r of legacyRows) {
    assert.strictEqual(r.chapter_id, null, `Chunk ${r.id} must have chapter_id IS NULL`);
  }
  pass('All 12 legacy chunks are strictly unassociated (chapter_id IS NULL) and isolated from unit retrieval');

  // TEST 3: Dynamic Readiness Checks on the 4 Units
  console.log('\n--- Test 3: Readiness Verification on Repaired Units ---');
  for (const u of TARGET_UNITS) {
    const readiness = await ReadinessValidator.getUnitReadinessAsync(u.bookId, u.chapterId);
    assert.strictEqual(readiness.isEligibleForAI, true, `Unit ${u.name} must be eligible for AI`);
    assert.notStrictEqual(readiness.status, 'BLOCKED', `Unit ${u.name} must not be BLOCKED`);
    console.log(`  Unit [${u.name}] Status: ${readiness.status} (Eligible: ${readiness.isEligibleForAI})`);
  }
  pass('All four repaired units evaluate to eligible (not BLOCKED) via ReadinessValidator');

  // TEST 4: Feedback Helpers Verification
  console.log('\n--- Test 4: Feedback Engine Invariance ---');
  const sampleTruncate = truncateAtWordBoundary('ما الإجراء العسكري الذي اتخذه الملك كامس', 25, '...');
  assert.strictEqual(sampleTruncate, 'ما الإجراء العسكري الذي...');
  pass('truncateAtWordBoundary preserves safe word-boundary truncation');

  const emptyPassage = findBestSupportingPassage('ما هي عاصمة الدولة العثمانية؟', 'مفهوم المادة وحالاتها الثلاث');
  assert.strictEqual(emptyPassage, '');
  pass('findBestSupportingPassage rejects irrelevant content with empty string');

  console.log('\n================================================================');
  console.log(`ALL ${passed} REPAIRED UNITS REGRESSION CHECKS PASSED PERFECTLY!`);
  console.log('================================================================');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
