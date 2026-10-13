import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import { AIRagEngine, verifyQuestionProvenance } from '../dist/services/ai/aiRagEngine.js';

const bookId = '19886434-1839-427d-af31-4c64fcf79525'; // Math Prep 2

async function testMathPipeline() {
  console.log('======================================================================');
  console.log('🎯 STEP 4: VERIFY EXTRACTION & EXAM PIPELINE FOR MATH PREP 2');
  console.log(`Book ID: ${bookId}`);
  console.log('======================================================================\n');

  // 1. Reconcile pages & characters
  console.log('--- [VERIFICATION 1] Page Count & Character Reconciliation ---');
  const metrics = await db.query(
    `SELECT 
       count(*) as page_count,
       sum(char_count) as stored_char_count,
       sum(char_length(raw_text)) as unicode_chars,
       sum(length(raw_text)) as utf8_bytes
     FROM book_pages 
     WHERE book_id = $1`,
    [bookId]
  );
  console.log(`  Total Pages in DB: ${metrics.rows[0].page_count} / 130`);
  console.log(`  Total Stored char_count: ${metrics.rows[0].stored_char_count}`);
  console.log(`  Total Unicode Characters: ${metrics.rows[0].unicode_chars}`);
  console.log(`  Total UTF-8 Bytes: ${metrics.rows[0].utf8_bytes}`);

  // 2. Reconcile chunks and chapter associations
  console.log('\n--- [VERIFICATION 2] Chunk Distribution by Approved Chapter ---');
  const chunkDist = await db.query(
    `SELECT 
       bc.chapter_number, 
       bc.title_en, 
       bc.start_page, 
       bc.end_page, 
       count(c.id) as chunk_count,
       min(c.page_number) as min_p,
       max(c.page_number) as max_p
     FROM book_chapters bc
     LEFT JOIN book_chunks c ON bc.id = c.chapter_id
     WHERE bc.book_id = $1
     GROUP BY bc.id, bc.chapter_number, bc.title_en, bc.start_page, bc.end_page
     ORDER BY bc.chapter_number ASC`,
    [bookId]
  );
  for (const ch of chunkDist.rows) {
    console.log(`  Unit ${ch.chapter_number} [${ch.title_en}]: ${ch.chunk_count} chunks (PDF Pages: ${ch.min_p}..${ch.max_p})`);
  }

  // 3. Grounded Chunk Retrieval for Unit 1 (Real Numbers & Intervals)
  console.log('\n--- [VERIFICATION 3] Grounded Retrieval for Unit 1 (Real Numbers) ---');
  const ragEngine = new AIRagEngine();
  const ch1Res = await db.query('SELECT * FROM book_chapters WHERE book_id = $1 AND chapter_number = 1', [bookId]);
  const unit1 = ch1Res.rows[0];

  const retrievedChunks = await ragEngine.retrieveGroundedChunks({
    bookId,
    chapterId: unit1.id,
    gradeId: '44d13655-da95-4425-8566-fd8451af1965',
    academicStageId: '61998777-4c5f-4e51-bc0a-38de938c842a',
    subjectId: '83ef20f6-1b1b-4ac0-bd66-d3333a7c505e',
    limit: 3
  });

  console.log(`  Retrieved ${retrievedChunks.length} chunks for Unit 1:`);
  for (let i = 0; i < retrievedChunks.length; i++) {
    const c = retrievedChunks[i];
    console.log(`    Chunk #${i + 1} (PDF Page: ${c.page_number}): "${c.content.slice(0, 100).replace(/\n/g, ' ')}..."`);
  }

  // 4. Test Generating Questions via AIRagEngine
  console.log('\n--- [VERIFICATION 4] Generating Mathematics Exam Questions ---');
  const genQuestions = await ragEngine.generateQuestions({
    bookId,
    chapterId: unit1.id,
    gradeId: '44d13655-da95-4425-8566-fd8451af1965',
    academicStageId: '61998777-4c5f-4e51-bc0a-38de938c842a',
    subjectId: '83ef20f6-1b1b-4ac0-bd66-d3333a7c505e',
    count: 2
  });

  console.log(`  Generated ${genQuestions.length} Questions for Unit 1:`);
  for (let i = 0; i < genQuestions.length; i++) {
    const q = genQuestions[i];
    console.log(`\n  [Question ${i + 1}] (Source PDF Page: ${q.page_reference}):`);
    console.log(`  Text: "${q.question_text}"`);
    console.log(`  Options:`);
    q.options.forEach(o => console.log(`    [${o.is_correct ? 'CORRECT' : '       '}] ${o.text}`));
    console.log(`  Explanation: "${q.explanation}"`);

    // Verify Provenance
    const prov = await verifyQuestionProvenance(q, bookId);
    console.log(`  Provenance Verification: ${prov.isVerified ? '✅ VERIFIED & MATCHED' : '❌ FAILED: ' + prov.reason}`);
  }

  // 5. Controlled Provenance Negative Tests
  console.log('\n--- [VERIFICATION 5] Controlled Provenance Rejection Tests ---');
  // Negative A: Unsupported topic citing real page
  const falseQ1 = {
    question_text: 'In the isosceles triangle ABC, if AB = AC, then the base angles are congruent',
    options: [
      { text: 'congruent', is_correct: true },
      { text: 'complementary', is_correct: false }
    ],
    page_reference: 6 // Page 6 is Real Numbers, NOT Isosceles Triangles
  };
  const negRes1 = await verifyQuestionProvenance(falseQ1, bookId);
  console.log(`  Unsupported Topic (Geometry citing Real Numbers page): isVerified = ${negRes1.isVerified}`);
  if (!negRes1.isVerified) {
    console.log(`    ✅ PASS: Correctly rejected: "${negRes1.reason}"`);
  } else {
    console.error(`    ❌ FAIL: Accepted unsupported question!`);
  }

  // Negative B: Wrong answer claim on correct topic
  const falseQ2 = {
    question_text: 'The set of real numbers R is the union of rational numbers Q and irrational numbers',
    options: [
      { text: 'empty set phi', is_correct: true }, // False claim
      { text: 'irrational numbers Q prime', is_correct: false }
    ],
    page_reference: 6
  };
  const negRes2 = await verifyQuestionProvenance(falseQ2, bookId);
  console.log(`  False Answer Claim: isVerified = ${negRes2.isVerified}`);
  if (!negRes2.isVerified) {
    console.log(`    ✅ PASS: Correctly rejected: "${negRes2.reason}"`);
  } else {
    console.error(`    ❌ FAIL: Accepted false answer!`);
  }

  // 6. Cross-Grade and Cross-Stage Boundary Isolation
  console.log('\n--- [VERIFICATION 6] Cross-Grade Isolation Test ---');
  const mismatchedGradeId = '2f0f4f5a-7c5c-4136-a935-33c79effca3d'; // Prep 3 grade ID passed to Prep 2 book
  try {
    await ragEngine.generateQuestions({
      bookId,
      chapterId: unit1.id,
      gradeId: mismatchedGradeId,
      academicStageId: '61998777-4c5f-4e51-bc0a-38de938c842a',
      subjectId: '83ef20f6-1b1b-4ac0-bd66-d3333a7c505e',
      count: 2
    });
    console.error(`  ❌ FAIL: Cross-grade mismatch was allowed!`);
  } catch (err) {
    console.log(`  ✅ PASS: Cross-grade access strictly blocked: "${err.message}"`);
  }

  // 7. Subject-Specific Math Notation Quality Check
  console.log('\n--- [VERIFICATION 7] Math Notation & Formula Integrity Check ---');
  const sampleMathPages = [6, 15, 36, 75];
  for (const p of sampleMathPages) {
    const res = await db.query(
      'SELECT page_number, char_count, raw_text FROM book_pages WHERE book_id = $1 AND page_number = $2',
      [bookId, p]
    );
    if (res.rows.length > 0) {
      const text = res.rows[0].raw_text;
      const hasEquations = /(=|<|>|\+|\-|\*|\/|\^|\$|\bset\b|\bsqrt\b|\broot\b|\bangle\b|\btriangle\b)/i.test(text);
      console.log(`  Page ${p} (${res.rows[0].char_count} chars): Math/Notation symbols detected: ${hasEquations ? 'YES' : 'NO'}`);
      console.log(`  Sample: "${text.slice(0, 150).replace(/\n+/g, ' ')}..."`);
    }
  }

  console.log('\n======================================================================');
  console.log('🏁 ALL MATH PREP 2 PIPELINE CHECKS COMPLETED');
  console.log('======================================================================');
  process.exit(0);
}

testMathPipeline().catch(err => {
  console.error('Fatal Pipeline Test Error:', err);
  process.exit(1);
});
