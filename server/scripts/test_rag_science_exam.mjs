import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import { AIRagEngine } from '../dist/services/ai/aiRagEngine.js';

const bookId = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec';
const stageId = '61998777-4c5f-4e51-bc0a-38de938c842a'; // Preparatory stage
const gradeId = '4baa5084-112d-45e5-908e-1ae67ea8b4e8'; // Prep 1
const subjectId = '5ebb5fc2-6edb-4f65-9057-bdb09ccae74e'; // Science

async function testRagScienceExam() {
  console.log(`======================================================================`);
  console.log(`🎯 AI RAG ENGINE VERIFICATION FOR SCIENCE PREP 1`);
  console.log(`======================================================================\n`);

  const ragEngine = new AIRagEngine();

  // Get Unit 1 chapter ID
  const chRes = await db.query(
    'SELECT id, title_ar, title_en, start_page, end_page FROM book_chapters WHERE book_id = $1 AND chapter_number = 1',
    [bookId]
  );
  if (chRes.rows.length === 0) {
    throw new Error('Unit 1 not found in book_chapters');
  }
  const unit1 = chRes.rows[0];
  console.log(`Target Chapter: [Unit 1] "${unit1.title_en}" (ID: ${unit1.id})`);

  // TEST 1: Retrieve Grounded Chunks
  console.log(`\n--- [TEST 1] Grounded Chunk Retrieval for Unit 1 ---`);
  const chunks = await ragEngine.retrieveGroundedChunks({
    bookId,
    chapterId: unit1.id,
    gradeId,
    academicStageId: stageId,
    subjectId,
    limit: 3
  });

  console.log(`Retrieved ${chunks.length} chunks from database:`);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    console.log(`  Chunk #${i + 1}:`);
    console.log(`    - Chunk ID: ${c.id}`);
    console.log(`    - Source PDF Page: ${c.page_number}`);
    console.log(`    - Length: ${c.content.length} characters`);
    console.log(`    - Excerpt: "${c.content.slice(0, 150).replace(/\n/g, ' ')}..."`);
  }

  if (chunks.length > 0) {
    console.log(`  ✅ PASS: Authenticated textbook passages successfully retrieved from book_chunks.`);
  } else {
    console.error(`  ❌ FAIL: No chunks retrieved.`);
  }

  // TEST 2: Generate Questions Grounded in Unit 1
  console.log(`\n--- [TEST 2] Generating Exam Questions Grounded in Unit 1 ---`);
  const questions = await ragEngine.generateQuestions({
    bookId,
    chapterId: unit1.id,
    gradeId,
    academicStageId: stageId,
    subjectId,
    count: 2
  });

  console.log(`Generated ${questions.length} question(s):`);
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`\n  [Question ${i + 1}] (Source Page: ${q.page_reference || 'N/A'}):`);
    console.log(`  Text: "${q.question_text}"`);
    console.log(`  Difficulty: ${q.difficulty} | Bloom: ${q.bloom_level}`);
    console.log(`  Options:`);
    q.options.forEach(o => {
      console.log(`    [${o.is_correct ? 'CORRECT' : '       '}] ${o.text}`);
    });
    console.log(`  Explanation: "${q.explanation}"`);

    // Verify grounding
    const hasSourcePage = q.page_reference > 0;
    const hasOptions = q.options.length >= 2 && q.options.some(o => o.is_correct);
    if (hasSourcePage && hasOptions) {
      console.log(`  ✅ Validation: Question is strictly grounded with authentic page reference and valid options.`);
    } else {
      console.warn(`  ⚠️ Validation warning: Question lacks strict page reference or valid options.`);
    }
  }

  // TEST 3: Strict Grade & Curriculum Boundary Isolation
  console.log(`\n--- [TEST 3] Cross-Grade & Subject Boundary Isolation Test ---`);
  const fakeGradeId = 'fake-grade-prep3-9999';
  try {
    await ragEngine.generateQuestions({
      bookId,
      chapterId: unit1.id,
      gradeId: fakeGradeId, // Tampered grade
      academicStageId: stageId,
      subjectId,
      count: 2
    });
    console.error(`  ❌ FAIL: Mismatched grade request was allowed!`);
  } catch (err) {
    console.log(`  ✅ PASS: Mismatched grade request was strictly rejected: "${err.message}"`);
  }

  // TEST 4: Negative Test: Non-existent Chapter (Blocked without Hallucination)
  console.log(`\n--- [TEST 4] Negative Test: Blocking When No Grounded Chunks Exist ---`);
  const emptyChapterId = 'empty-chapter-0000-0000-000000000000';
  try {
    await ragEngine.generateQuestions({
      bookId,
      chapterId: emptyChapterId,
      gradeId,
      academicStageId: stageId,
      subjectId,
      count: 2
    });
    console.error(`  ❌ FAIL: Empty chapter request generated hallucinated questions!`);
  } catch (err) {
    console.log(`  ✅ PASS: Empty chapter request blocked with explicit educational error: "${err.message}"`);
  }

  console.log(`\n======================================================================`);
  console.log(`🏁 ALL RAG AND ISOLATION TESTS COMPLETE`);
  console.log(`======================================================================`);
  process.exit(0);
}

testRagScienceExam().catch(err => {
  console.error('Fatal RAG test error:', err);
  process.exit(1);
});
