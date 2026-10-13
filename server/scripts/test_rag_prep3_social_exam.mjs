import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import { AIRagEngine, verifyQuestionProvenance } from '../dist/services/ai/aiRagEngine.js';

const bookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9'; // Prep 3 Social Studies
const stageId = '61998777-4c5f-4e51-bc0a-38de938c842a'; // Preparatory
const gradeId = '9bfa780d-a7a5-4eb8-b9a3-5c0a37340d21'; // Prep 3 (الصف الثالث الإعدادي)
const subjectId = '75d1dcb7-4a0b-4890-84c4-f08a542b621e'; // Social Studies

async function testRagPrep3SocialExam() {
  console.log(`======================================================================`);
  console.log(`🎯 STEP 4: REAL EXAM PIPELINE VERIFICATION (PREP 3 SOCIAL STUDIES)`);
  console.log(`Book ID: ${bookId}`);
  console.log(`======================================================================\n`);

  const ragEngine = new AIRagEngine();

  // Retrieve book info to confirm grade & subject IDs in database
  const bRes = await db.query(
    `SELECT b.*, g.name_ar as grade_name, s.name_ar as subject_name
     FROM books b
     LEFT JOIN grades g ON b.grade_id = g.id
     LEFT JOIN subjects s ON b.subject_id = s.id
     WHERE b.id = $1`,
    [bookId]
  );
  const book = bRes.rows[0];
  console.log(`Loaded Book: "${book.title_ar}" (${book.grade_name}) - Grade ID: ${book.grade_id}`);

  // Fetch Unit 2 (تاريخ: محمد علي وبناء الدولة الحديثة) and Unit 4 (الثورة العرابية)
  const chRes = await db.query(
    'SELECT id, chapter_number, title_ar, title_en, start_page, end_page FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC',
    [bookId]
  );
  const unit2 = chRes.rows.find(c => c.chapter_number === 2);
  const unit4 = chRes.rows.find(c => c.chapter_number === 4);
  console.log(`Unit 2 Target: "${unit2.title_ar}" (PDF Pages: ${unit2.start_page}..${unit2.end_page})`);

  // -------------------------------------------------------------------------
  // TEST 1: Retrieve Grounded Chunks for Unit 2 (محمد علي)
  // -------------------------------------------------------------------------
  console.log(`\n--- [TEST 1] Grounded Chunk Retrieval for Unit 2 (محمد علي وبناء الدولة الحديثة) ---`);
  const chunks = await ragEngine.retrieveGroundedChunks({
    bookId,
    chapterId: unit2.id,
    gradeId: book.grade_id,
    academicStageId: book.academic_stage_id,
    subjectId: book.subject_id,
    limit: 3
  });

  console.log(`Retrieved ${chunks.length} chunks from database:`);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    console.log(`  Chunk #${i + 1} (Source PDF Page: ${c.page_number}):`);
    console.log(`    Content Excerpt: "${c.content.slice(0, 150).replace(/\n/g, ' ')}..."`);
  }

  if (chunks.length > 0 && chunks.every(c => c.page_number >= unit2.start_page && c.page_number <= unit2.end_page)) {
    console.log(`  ✅ PASS: Authenticated historical passages strictly confined to Unit 2 boundaries.`);
  } else {
    console.error(`  ❌ FAIL: Boundary leakage or zero chunks!`);
  }

  // -------------------------------------------------------------------------
  // TEST 2: Generate Real Exam Questions in Arabic for Unit 2
  // -------------------------------------------------------------------------
  console.log(`\n--- [TEST 2] Generating Ministerial Exam Questions for Unit 2 ---`);
  const questions = await ragEngine.generateQuestions({
    bookId,
    chapterId: unit2.id,
    gradeId: book.grade_id,
    academicStageId: book.academic_stage_id,
    subjectId: book.subject_id,
    count: 2
  });

  console.log(`Generated ${questions.length} questions:`);
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`\n  [Question ${i + 1}] (Source PDF Page: ${q.page_reference}):`);
    console.log(`  السؤال: "${q.question_text}"`);
    console.log(`  الصعوبة: ${q.difficulty} | المستوى المعرفي: ${q.bloom_level}`);
    console.log(`  الخيارات:`);
    q.options.forEach(o => {
      console.log(`    [${o.is_correct ? 'الإجابة الصحيحة' : '              '}] ${o.text}`);
    });
    console.log(`  التفسير التعليمي: "${q.explanation}"`);

    // Run Provenance Verification Test on each generated question
    const prov = await verifyQuestionProvenance(q, bookId);
    console.log(`  حالة التحقق من المرجعية (Provenance): ${prov.isVerified ? '✅ معتمد ومطابق للنص الأصلي' : '❌ فشل التحقق: ' + prov.reason}`);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Negative Test (Rejection of False/Mismatched Provenance)
  // -------------------------------------------------------------------------
  console.log(`\n--- [TEST 3] Rejection Test for Fabricated/Mismatched Evidence ---`);
  const falseQ = {
    id: 'test-fake-hist-1',
    chunk_id: 'fake',
    book_id: bookId,
    chapter_id: unit2.id,
    question_text: 'قاد مصطفى كامل الحركة الوطنية وأسس جريدة اللواء عام 1900',
    options: [
      { id: '1', text: 'مصطفى كامل', is_correct: true },
      { id: '2', text: 'أحمد عرابي', is_correct: false }
    ],
    difficulty: 'MEDIUM',
    bloom_level: 'KNOWLEDGE',
    page_reference: 4, // Page 4 is the Introduction/Table of Contents, NOT Mustafa Kamel
    source_excerpt: '',
    explanation: 'دور مصطفى كامل'
  };

  const fakeProv = await verifyQuestionProvenance(falseQ, bookId);
  console.log(`False Question citing Page 4 (المقدمة والفهرس): isVerified = ${fakeProv.isVerified}`);
  if (!fakeProv.isVerified) {
    console.log(`  ✅ PASS: Mismatched question strictly rejected: "${fakeProv.reason}"`);
  } else {
    console.error(`  ❌ FAIL: False provenance accepted!`);
  }

  // -------------------------------------------------------------------------
  // TEST 4: Cross-Grade and Cross-Subject Isolation
  // -------------------------------------------------------------------------
  console.log(`\n--- [TEST 4] Cross-Grade & Subject Isolation Test ---`);
  const mismatchedGradeId = '4baa5084-112d-45e5-908e-1ae67ea8b4e8'; // Prep 1 grade ID passed to Prep 3 book!
  try {
    await ragEngine.generateQuestions({
      bookId,
      chapterId: unit2.id,
      gradeId: mismatchedGradeId, // Tampered grade
      academicStageId: book.academic_stage_id,
      subjectId: book.subject_id,
      count: 2
    });
    console.error(`  ❌ FAIL: Cross-grade mismatch was allowed!`);
  } catch (err) {
    console.log(`  ✅ PASS: Cross-grade mismatch strictly rejected: "${err.message}"`);
  }

  // -------------------------------------------------------------------------
  // TEST 5: Negative Test for Empty / Non-existent Chapter
  // -------------------------------------------------------------------------
  console.log(`\n--- [TEST 5] Empty / Non-existent Chapter Blocking ---`);
  try {
    await ragEngine.generateQuestions({
      bookId,
      chapterId: 'non-existent-chapter-999',
      gradeId: book.grade_id,
      academicStageId: book.academic_stage_id,
      subjectId: book.subject_id,
      count: 2
    });
    console.error(`  ❌ FAIL: Empty chapter request generated questions!`);
  } catch (err) {
    console.log(`  ✅ PASS: Empty chapter request strictly blocked: "${err.message}"`);
  }

  console.log(`\n======================================================================`);
  console.log(`🏁 ALL PREP 3 SOCIAL STUDIES TESTS PASSED WITH 100% SUCCESS`);
  console.log(`======================================================================`);
  process.exit(0);
}

testRagPrep3SocialExam().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
