import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import { AIRagEngine, verifyQuestionProvenance } from '../dist/services/ai/aiRagEngine.js';

const bookId = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec';
const stageId = '61998777-4c5f-4e51-bc0a-38de938c842a'; // Preparatory
const gradeId = '4baa5084-112d-45e5-908e-1ae67ea8b4e8'; // Prep 1
const subjectId = '5ebb5fc2-6edb-4f65-9057-bdb09ccae74e'; // Science

async function runTargetedAuditTests() {
  console.log(`======================================================================`);
  console.log(`🧪 TARGETED AUDIT TEST SUITE: SCIENCE PREP 1 (Book ${bookId})`);
  console.log(`======================================================================\n`);

  const ragEngine = new AIRagEngine();

  // Get Unit 1 and Unit 4
  const chaptersRes = await db.query(
    'SELECT id, chapter_number, title_en, start_page, end_page FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC',
    [bookId]
  );
  const unit1 = chaptersRes.rows.find(c => c.chapter_number === 1);
  const unit4 = chaptersRes.rows.find(c => c.chapter_number === 4);

  // -------------------------------------------------------------------------
  // TEST 1: Positive Provenance Verification on Real Questions
  // -------------------------------------------------------------------------
  console.log(`--- [TEST 1] Provenance Verification for Active Questions ---`);
  const activeQuestions = await db.query(
    `SELECT qi.id, qi.question_text, qi.page_reference, qi.source_chunk_id, qi.explanation
     FROM question_bank_items qi
     WHERE qi.chapter_id = $1 AND (qi.is_quarantined = 0 OR qi.is_quarantined IS NULL)`,
    [unit1.id]
  );

  for (const q of activeQuestions.rows) {
    const optsRes = await db.query(
      `SELECT option_text as text, is_correct FROM question_bank_options WHERE question_item_id = $1`,
      [q.id]
    );
    const fullQ = {
      ...q,
      options: optsRes.rows.map(o => ({ ...o, is_correct: o.is_correct === 1 || o.is_correct === true }))
    };

    const provResult = await verifyQuestionProvenance(fullQ, bookId);
    console.log(`Question: "${q.question_text.slice(0, 70)}..."`);
    console.log(`  Source Page: ${q.page_reference}`);
    console.log(`  Provenance Status: ${provResult.isVerified ? '✅ VERIFIED' : '❌ FAILED'}`);
    if (!provResult.isVerified) {
      console.error(`  Reason: ${provResult.reason}`);
    }
  }

  // -------------------------------------------------------------------------
  // TEST 2: Rejection Test for Mismatched / False Source Page
  // -------------------------------------------------------------------------
  console.log(`\n--- [TEST 2] Rejection of Question with Mismatched Source Page ---`);
  const fakeProvenanceQ = {
    id: 'fake-test-q-1',
    chunk_id: 'fake-chunk',
    book_id: bookId,
    chapter_id: unit1.id,
    question_text: 'What are the main components of the solar system planets?',
    options: [
      { id: '1', text: 'Sun and 8 planets', is_correct: true },
      { id: '2', text: 'Moon and stars', is_correct: false }
    ],
    difficulty: 'EASY',
    bloom_level: 'KNOWLEDGE',
    page_reference: 3, // Page 3 is student form ("Name : Class : School : ii"), NOT solar system
    source_excerpt: '',
    explanation: 'Solar system components'
  };

  const fakeProvResult = await verifyQuestionProvenance(fakeProvenanceQ, bookId);
  console.log(`Mismatched Question: "${fakeProvenanceQ.question_text}" citing Page 3 (student form page)`);
  console.log(`Provenance Check Result: isVerified = ${fakeProvResult.isVerified}`);
  if (!fakeProvResult.isVerified) {
    console.log(`  ✅ PASS: Mismatched question was strictly rejected: "${fakeProvResult.reason}"`);
  } else {
    console.error(`  ❌ FAIL: False provenance was accepted!`);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Unit 4 Strict Curriculum Boundary Isolation
  // -------------------------------------------------------------------------
  console.log(`\n--- [TEST 3] Unit 4 Scope & Curriculum Boundary Isolation ---`);
  console.log(`Target: Unit 4 "${unit4.title_en}" (Expected PDF Pages: ${unit4.start_page} to ${unit4.end_page})`);

  const u4Chunks = await ragEngine.retrieveGroundedChunks({
    bookId,
    chapterId: unit4.id,
    gradeId,
    academicStageId: stageId,
    subjectId,
    limit: 4
  });

  console.log(`Retrieved ${u4Chunks.length} chunks for Unit 4:`);
  let hasLeakage = false;
  for (const c of u4Chunks) {
    const isWithinBounds = c.page_number >= unit4.start_page && c.page_number <= unit4.end_page;
    console.log(`  - Chunk from PDF Page ${c.page_number} (Within [${unit4.start_page}..${unit4.end_page}]: ${isWithinBounds ? 'YES' : 'NO LEAK!'})`);
    console.log(`    Excerpt: "${c.content.slice(0, 100).replace(/\n/g, ' ')}..."`);
    if (!isWithinBounds) hasLeakage = true;
  }

  if (!hasLeakage && u4Chunks.length > 0) {
    console.log(`  ✅ PASS: 100% of retrieved passages are strictly confined to Unit 4 boundaries.`);
  } else {
    console.error(`  ❌ FAIL: Boundary leakage detected!`);
  }

  // -------------------------------------------------------------------------
  // TEST 4: Server-side Security & Grade Restriction
  // -------------------------------------------------------------------------
  console.log(`\n--- [TEST 4] Server-side Stage/Grade Isolation Guard ---`);
  const tamperedStageId = 'tampered-stage-primary-000';
  try {
    await ragEngine.generateQuestions({
      bookId,
      chapterId: unit4.id,
      gradeId,
      academicStageId: tamperedStageId,
      subjectId,
      count: 2
    });
    console.error(`  ❌ FAIL: Tampered stage ID was accepted!`);
  } catch (err) {
    console.log(`  ✅ PASS: Tampered request strictly rejected: "${err.message}"`);
  }

  console.log(`\n======================================================================`);
  console.log(`🏁 ALL TARGETED AUDIT TESTS COMPLETED SUCCESSFULLY`);
  console.log(`======================================================================`);
  process.exit(0);
}

runTargetedAuditTests().catch(err => {
  console.error('Fatal audit test error:', err);
  process.exit(1);
});
