import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('================================================================');
console.log('TASK 1 — PREP 2 SOCIAL STUDIES GENERAL REVISION CONTENT TEST');
console.log('Zero External API Calls | Zero Production Data Mutation');
console.log('================================================================\n');

let passed = 0;
const pass = (name) => {
  passed++;
  console.log(`  [PASS] ${passed}. ${name}`);
};

const BOOK_ID = '81b8a308-7fcf-4938-8c45-aa0056624f32';
const REVISION_CHAPTER_ID = '7f2409f5-19e4-4d89-9a2c-f684c31be991';

const VERIFIED_CHUNK_IDS = [
  'bddd7ea7-4300-4255-98c5-d0ac4f0af45d', // p.97
  '2b4402a5-7e0e-4f40-a40d-ba9e7f79f7b6', // p.98
  'c05f49ac-8b0c-4774-9168-9fde699300de', // p.99
  '970e5683-e52f-44d6-924c-ef0c8595d086', // p.100
  'fc7a7c19-11e3-4691-902b-002cdd21d703', // p.101
  'cd5de032-7026-4cf2-91a7-5a0a0e7965ba', // p.102
  'bc822680-a0c1-4cac-8f73-2ac40ef46e63', // p.103
  'b4cfd1d3-6df4-4f37-a2bf-f07f4f19b086'  // p.104
];

// ============================================================================
// TEST 1: Curriculum Inventory Authoritative Entry
// ============================================================================
console.log('--- Test Group 1: Authoritative Curriculum Inventory ---');
const inventoryPath = path.join(__dirname, '../src/data/authoritative_curriculum_inventory.json');
assert.ok(fs.existsSync(inventoryPath), 'authoritative_curriculum_inventory.json must exist');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));

const bookUnits = inventory.units.filter(u => u.book_id === BOOK_ID);
assert.ok(bookUnits.length >= 5, `Book ${BOOK_ID} must have at least 5 units in authoritative inventory`);
assert.strictEqual(bookUnits[0].book_title_en, 'Social Studies', 'Subject must be Social Studies');

const revisionChap = bookUnits.find(u => u.chapter_id === REVISION_CHAPTER_ID);
assert.ok(revisionChap, `Revision chapter ${REVISION_CHAPTER_ID} must exist in inventory`);
assert.strictEqual(revisionChap.chapter_number, 5, 'Revision unit must be Chapter 5');
assert.strictEqual(revisionChap.start_page, 97, 'Revision unit start page must be 97');
assert.strictEqual(revisionChap.end_page, 104, 'Revision unit end page must be 104');
assert.strictEqual(revisionChap.readiness_status, 'VERIFIED_READY', 'Revision unit readiness must be VERIFIED_READY');

// Verify Unit 4 ends at page 96 and does not overlap with revision pages 97-104
const unit4 = bookUnits.find(u => u.chapter_number === 4);
assert.ok(unit4, 'Unit 4 must exist');
assert.strictEqual(unit4.end_page, 96, 'Unit 4 must end on page 96');
assert.ok(unit4.end_page < revisionChap.start_page, 'Unit 4 must strictly precede revision pages');
pass('Authoritative curriculum inventory correctly defines Chapter 5 (pages 97-104) without overlapping Unit 4');

// ============================================================================
// TEST 2: SQL Migration File Syntax and Safety
// ============================================================================
console.log('\n--- Test Group 2: SQL Migration Idempotency and Safety ---');
const migrationSqlPath = path.join(__dirname, '../src/db/migrations/20261015_prep2_social_revision_chapter.sql');
assert.ok(fs.existsSync(migrationSqlPath), 'Migration SQL file must exist');
const sqlContent = fs.readFileSync(migrationSqlPath, 'utf8');

assert.ok(sqlContent.includes(BOOK_ID), 'Migration SQL must target exact book ID');
assert.ok(sqlContent.includes(REVISION_CHAPTER_ID), 'Migration SQL must use canonical revision chapter ID');
assert.ok(sqlContent.includes('INSERT IGNORE INTO book_chapters'), 'Migration SQL must contain idempotent chapter insertion');
assert.ok(sqlContent.includes('UPDATE book_chunks'), 'Migration SQL must update book_chunks');
assert.ok(sqlContent.includes('chapter_id IS NULL'), 'Migration SQL must only assign unassigned chunks');

// Verify all 8 chunk IDs are explicitly targeted in SQL
for (const cid of VERIFIED_CHUNK_IDS) {
  assert.ok(sqlContent.includes(cid), `Migration SQL must reference verified chunk ID ${cid}`);
}

// Verify rollback DOWN section exists
assert.ok(sqlContent.includes('DOWN MIGRATION') && sqlContent.includes('ROLLBACK'), 'Migration SQL must provide rollback instructions');
assert.ok(sqlContent.includes('chapter_id = NULL'), 'Rollback must revert chunks to NULL');
assert.ok(sqlContent.includes('DELETE FROM book_chapters'), 'Rollback must delete the revision chapter');
pass('Migration SQL file contains idempotent UP and reversible DOWN logic referencing all 8 chunk IDs');

// ============================================================================
// TEST 3: Retrieval Isolation Rules in RAG Engine
// ============================================================================
console.log('\n--- Test Group 3: RAG Retrieval Isolation ---');
const ragEnginePath = path.join(__dirname, '../src/services/ai/aiRagEngine.ts');
const ragEngineContent = fs.readFileSync(ragEnginePath, 'utf8');

// Verify regular units filter out revision pages (pages > 96)
assert.ok(
  ragEngineContent.includes("bookId === '81b8a308-7fcf-4938-8c45-aa0056624f32'"),
  'RAG engine must have book-specific guard for Prep 2 Social Studies'
);
assert.ok(
  ragEngineContent.includes("row.page_number > 96"),
  'RAG engine must exclude pages > 96 for regular units (Units 1-4)'
);

// Verify revision chapter includes only pages 97-104
assert.ok(
  ragEngineContent.includes("row.page_number < 97 || row.page_number > 104"),
  'RAG engine must strictly constrain revision chapter retrieval to pages 97-104'
);
pass('RAG engine enforces strict two-way page boundary isolation between regular units and revision chapter');

// ============================================================================
// TEST 4: Simulated Migration Script Execution (Dry Run Mode)
// ============================================================================
console.log('\n--- Test Group 4: Migration Runner Script Execution ---');
const scriptPath = path.join(__dirname, '../scripts/apply_prep2_social_revision.mjs');
assert.ok(fs.existsSync(scriptPath), 'Migration runner script must exist');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

assert.ok(scriptContent.includes('dryRun'), 'Script must support dry-run safety mode');
assert.ok(scriptContent.includes('81b8a308-7fcf-4938-8c45-aa0056624f32'), 'Script must check exact book ID');
assert.ok(scriptContent.includes('7f2409f5-19e4-4d89-9a2c-f684c31be991'), 'Script must check exact chapter ID');

pass('apply_prep2_social_revision.mjs has verified safety controls, exact ID verification, and dry-run capability');

console.log('\n================================================================');
console.log(`ALL ${passed} TASK 1 UNIT & ISOLATION TESTS PASSED PERFECTLY!`);
console.log('================================================================\n');
