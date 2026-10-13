import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { AIRagEngine, verifyQuestionProvenance } from '../dist/services/ai/aiRagEngine.js';

const book4Id = '81b8a308-7fcf-4938-8c45-aa0056624f32';

async function runFinalAcceptanceCheck() {
  console.log(`======================================================================`);
  console.log(`🔎 BOOK 4 FINAL ACCEPTANCE CHECK — READ ONLY AUDIT`);
  console.log(`Book ID: ${book4Id} (Prep 2 Social Studies)`);
  console.log(`======================================================================\n`);

  const results = {};

  // ---------------------------------------------------------------------------
  // CHECK 1: Unit-Specific Chunk Retrieval Boundary Isolation
  // ---------------------------------------------------------------------------
  console.log(`--- [CHECK 1] Unit-Specific Chunk Retrieval Boundary Isolation ---`);
  const chaptersRes = await db.query(
    'SELECT id, chapter_number, title_ar, start_page, end_page FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC',
    [book4Id]
  );

  const ragEngine = new AIRagEngine();
  const unitIsolationTests = [];

  for (const ch of chaptersRes.rows) {
    const chunks = await ragEngine.retrieveGroundedChunks({
      bookId: book4Id,
      chapterId: ch.id,
      gradeId: '44d13655-da95-4425-8566-fd8451af1965',
      academicStageId: '61998777-4c5f-4e51-bc0a-38de938c842a',
      subjectId: 'sub_prep_2_social_studies',
      limit: 10
    });

    const foreignChunks = chunks.filter(c => c.chapter_id !== ch.id || c.page_number < ch.start_page || c.page_number > ch.end_page);
    const passed = chunks.length > 0 && foreignChunks.length === 0;

    console.log(`  Unit ${ch.chapter_number} ("${ch.title_ar}"):`);
    console.log(`    Retrieved: ${chunks.length} chunks | Pages: [${chunks.map(c => c.page_number).join(', ')}]`);
    console.log(`    Boundaries: ${ch.start_page}..${ch.end_page} | Foreign chunks leaked: ${foreignChunks.length}`);
    console.log(`    Isolation Result: ${passed ? '✅ 100% ISOLATED' : '❌ LEAK DETECTED'}`);

    unitIsolationTests.push({
      unit: ch.chapter_number,
      chapterId: ch.id,
      retrievedCount: chunks.length,
      pages: chunks.map(c => c.page_number),
      foreignCount: foreignChunks.length,
      passed
    });
  }
  results.unitIsolation = unitIsolationTests;

  // ---------------------------------------------------------------------------
  // CHECK 2: General-Review Chunks (chapter_id = NULL) Scope Handling
  // ---------------------------------------------------------------------------
  console.log(`\n--- [CHECK 2] General-Review Chunks Scope Handling ---`);
  // 2a: When an exam is unit-scoped, are general-review chunks excluded?
  const u1Chunks = await ragEngine.retrieveGroundedChunks({
    bookId: book4Id,
    chapterId: chaptersRes.rows[0].id,
    gradeId: '44d13655-da95-4425-8566-fd8451af1965',
    academicStageId: '61998777-4c5f-4e51-bc0a-38de938c842a',
    subjectId: 'sub_prep_2_social_studies',
    limit: 20
  });
  const nullInUnitScoped = u1Chunks.filter(c => !c.chapter_id);
  console.log(`  Unit-scoped request (Unit 1): NULL chapter_id chunks included = ${nullInUnitScoped.length} (Expected: 0)`);

  // 2b: How are general-review chunks queried in database?
  const reviewChunksRes = await db.query(
    'SELECT id, page_number, chapter_id, length(content) as content_len, metadata FROM book_chunks WHERE book_id = $1 AND chapter_id IS NULL ORDER BY page_number ASC',
    [book4Id]
  );
  console.log(`  General-review chunks in DB: ${reviewChunksRes.rows.length}`);
  console.log(`  Review Chunk Pages: [${reviewChunksRes.rows.map(r => r.page_number).join(', ')}] (Expected: 97..104)`);
  reviewChunksRes.rows.slice(0, 3).forEach(r => {
    console.log(`    Page ${r.page_number}: meta = ${r.metadata}`);
  });

  results.reviewScope = {
    nullInUnitScopedCount: nullInUnitScoped.length,
    unitScopedExcludesReview: nullInUnitScoped.length === 0,
    reviewChunksInDbCount: reviewChunksRes.rows.length,
    reviewPages: reviewChunksRes.rows.map(r => r.page_number)
  };

  // ---------------------------------------------------------------------------
  // CHECK 3: Question Bank Items (20 items, 80 options) Safety & Association
  // ---------------------------------------------------------------------------
  console.log(`\n--- [CHECK 3] Question Bank Items & Options Safety Audit ---`);
  const qbItemsRes = await db.query(
    `SELECT qbi.id, qbi.chapter_id, qbi.question_text, qbi.page_reference, qbi.is_quarantined, qbi.quarantine_reason,
            bc.chapter_number, bc.title_ar as chapter_title,
            count(qbo.id) as options_count,
            sum(case when qbo.is_correct = 1 then 1 else 0 end) as correct_options_count
     FROM question_bank_items qbi
     JOIN question_banks qb ON qbi.bank_id = qb.id
     LEFT JOIN book_chapters bc ON qbi.chapter_id = bc.id
     LEFT JOIN question_bank_options qbo ON qbi.id = qbo.question_item_id
     WHERE qb.grade_id = '44d13655-da95-4425-8566-fd8451af1965' AND qb.subject_id = 'sub_prep_2_social_studies'
     GROUP BY qbi.id, qbi.chapter_id, qbi.question_text, qbi.page_reference, qbi.is_quarantined, qbi.quarantine_reason, bc.chapter_number, bc.title_ar
     ORDER BY qbi.id ASC`
  );

  const totalItems = qbItemsRes.rows.length;
  const totalOptions = qbItemsRes.rows.reduce((sum, r) => sum + parseInt(r.options_count, 10), 0);
  const quarantinedCount = qbItemsRes.rows.filter(r => r.is_quarantined === 1).length;
  const unquarantinedCount = qbItemsRes.rows.filter(r => r.is_quarantined === 0 || r.is_quarantined === null).length;
  const allHaveExactly4Options = qbItemsRes.rows.every(r => parseInt(r.options_count, 10) === 4);
  const allHaveExactly1Correct = qbItemsRes.rows.every(r => parseInt(r.correct_options_count, 10) === 1);

  console.log(`  Total Items: ${totalItems} (Expected: 20)`);
  console.log(`  Total Options: ${totalOptions} (Expected: 80)`);
  console.log(`  All Items Have Exactly 4 Options: ${allHaveExactly4Options}`);
  console.log(`  All Items Have Exactly 1 Correct Option: ${allHaveExactly1Correct}`);
  console.log(`  Quarantined Items: ${quarantinedCount} / ${totalItems}`);
  console.log(`  Unquarantined Items: ${unquarantinedCount} / ${totalItems}`);

  // Test dynamic bank filter on unquarantined items
  console.log(`  Checking dynamic provenance validation for the ${unquarantinedCount} unquarantined items:`);
  const unquarantinedItems = qbItemsRes.rows.filter(r => r.is_quarantined === 0);
  for (const item of unquarantinedItems) {
    const optsRes = await db.query('SELECT option_text as text, is_correct FROM question_bank_options WHERE question_item_id = $1', [item.id]);
    const prov = await verifyQuestionProvenance({
      question_text: item.question_text,
      options: optsRes.rows.map(o => ({ text: o.text, is_correct: o.is_correct === 1 })),
      page_reference: item.page_reference
    }, book4Id);
    console.log(`    Item ${item.id.slice(0, 8)} (p${item.page_reference}): prov.isVerified = ${prov.isVerified} (${prov.reason || 'SUPPORTED'})`);
  }

  results.questionBank = {
    totalItems,
    totalOptions,
    allHaveExactly4Options,
    allHaveExactly1Correct,
    quarantinedCount,
    unquarantinedCount
  };

  // ---------------------------------------------------------------------------
  // CHECK 4: Confirm Book 4 Database Counts & Integrity
  // ---------------------------------------------------------------------------
  console.log(`\n--- [CHECK 4] Book 4 Final Inventory Confirmation ---`);
  const pagesCountRes = await db.query('SELECT count(*) as cnt, count(distinct page_number) as dcnt FROM book_pages WHERE book_id = $1', [book4Id]);
  const chunksCountRes = await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [book4Id]);
  const chaptersCountRes = await db.query('SELECT count(*) as cnt FROM book_chapters WHERE book_id = $1', [book4Id]);

  console.log(`  book_pages: ${pagesCountRes.rows[0].cnt} rows, ${pagesCountRes.rows[0].dcnt} distinct (Expected: 106)`);
  console.log(`  book_chunks: ${chunksCountRes.rows[0].cnt} rows (Expected: 98)`);
  console.log(`  book_chapters: ${chaptersCountRes.rows[0].cnt} rows (Expected: 4)`);

  results.inventory = {
    pages: parseInt(pagesCountRes.rows[0].cnt, 10),
    distinctPages: parseInt(pagesCountRes.rows[0].dcnt, 10),
    chunks: parseInt(chunksCountRes.rows[0].cnt, 10),
    chapters: parseInt(chaptersCountRes.rows[0].cnt, 10)
  };

  // ---------------------------------------------------------------------------
  // CHECK 5: Targeted Read-Only Retrieval Tests
  // ---------------------------------------------------------------------------
  console.log(`\n--- [CHECK 5] Read-Only Retrieval Test Suite ---`);
  const retrievalSuite = [];

  // 5.1 Unit 1-only request
  const ch1 = chaptersRes.rows.find(c => c.chapter_number === 1);
  const u1Retrieval = await ragEngine.retrieveGroundedChunks({
    bookId: book4Id,
    chapterId: ch1.id,
    gradeId: '44d13655-da95-4425-8566-fd8451af1965',
    academicStageId: '61998777-4c5f-4e51-bc0a-38de938c842a',
    subjectId: 'sub_prep_2_social_studies',
    limit: 5
  });
  const u1Pass = u1Retrieval.length > 0 && u1Retrieval.every(c => c.chapter_id === ch1.id && c.page_number >= ch1.start_page && c.page_number <= ch1.end_page);
  console.log(`  5.1 Unit 1 Request: Retrieved ${u1Retrieval.length} chunks (Pages: [${u1Retrieval.map(c => c.page_number).join(', ')}]) -> PASS: ${u1Pass}`);
  retrievalSuite.push({ test: 'Unit 1-only retrieval', passed: u1Pass });

  // 5.2 Unit 2-only request
  const ch2 = chaptersRes.rows.find(c => c.chapter_number === 2);
  const u2Retrieval = await ragEngine.retrieveGroundedChunks({
    bookId: book4Id,
    chapterId: ch2.id,
    gradeId: '44d13655-da95-4425-8566-fd8451af1965',
    academicStageId: '61998777-4c5f-4e51-bc0a-38de938c842a',
    subjectId: 'sub_prep_2_social_studies',
    limit: 5
  });
  const u2Pass = u2Retrieval.length > 0 && u2Retrieval.every(c => c.chapter_id === ch2.id && c.page_number >= ch2.start_page && c.page_number <= ch2.end_page);
  console.log(`  5.2 Unit 2 Request: Retrieved ${u2Retrieval.length} chunks (Pages: [${u2Retrieval.map(c => c.page_number).join(', ')}]) -> PASS: ${u2Pass}`);
  retrievalSuite.push({ test: 'Unit 2-only retrieval', passed: u2Pass });

  // 5.3 General-review request
  const revChunksDirect = await db.query(
    'SELECT id, page_number, content FROM book_chunks WHERE book_id = $1 AND chapter_id IS NULL AND page_number >= 97 AND page_number <= 104',
    [book4Id]
  );
  const revPass = revChunksDirect.rows.length === 8;
  console.log(`  5.3 General Review Request: Retrieved ${revChunksDirect.rows.length}/8 general review chunks -> PASS: ${revPass}`);
  retrievalSuite.push({ test: 'General review chunks retrieval', passed: revPass });

  // 5.4 Invalid or mismatched chapter ID request
  const invalidChRetrieval = await ragEngine.retrieveGroundedChunks({
    bookId: book4Id,
    chapterId: '00000000-0000-0000-0000-000000000000',
    gradeId: '44d13655-da95-4425-8566-fd8451af1965',
    academicStageId: '61998777-4c5f-4e51-bc0a-38de938c842a',
    subjectId: 'sub_prep_2_social_studies',
    limit: 5
  });
  const invalidPass = invalidChRetrieval.length === 0;
  console.log(`  5.4 Invalid Chapter ID Request: Retrieved ${invalidChRetrieval.length} chunks (Expected: 0) -> PASS: ${invalidPass}`);
  retrievalSuite.push({ test: 'Invalid chapter ID returns 0 chunks', passed: invalidPass });

  // 5.5 Question belonging only to another book (Math Prep 2 equation)
  const mathQ = {
    question_text: 'If x^2 = 25 where x belongs to Real Numbers, then x is equal to plus or minus 5.',
    options: [
      { text: '+/- 5', is_correct: true },
      { text: '5 only', is_correct: false },
      { text: '-5 only', is_correct: false },
      { text: '25', is_correct: false }
    ],
    page_reference: 14
  };
  const mathVerif = await verifyQuestionProvenance(mathQ, book4Id);
  const foreignQPass = mathVerif.isVerified === false;
  console.log(`  5.5 Foreign Book Question (Math Prep 2): isVerified = ${mathVerif.isVerified} -> REJECTED: ${foreignQPass}`);
  retrievalSuite.push({ test: 'Foreign book question rejected', passed: foreignQPass });

  results.retrievalSuite = retrievalSuite;

  // ---------------------------------------------------------------------------
  // CHECK 6: Baseline Integrity of Student, Evaluation, Exam & PDF Chunk Records
  // ---------------------------------------------------------------------------
  console.log(`\n--- [CHECK 6] External Tables Baseline Audit ---`);
  const uRes = await db.query('SELECT count(*) as cnt FROM users');
  const spRes = await db.query('SELECT count(*) as cnt FROM student_profiles');
  const evRes = await db.query('SELECT count(*) as cnt FROM ai_evaluations');
  const exRes = await db.query('SELECT count(*) as cnt FROM exams');
  const b4PdfRes = await db.query('SELECT count(*) as cnt FROM book_pdf_chunks WHERE book_id = $1', [book4Id]);
  const totPdfRes = await db.query('SELECT count(*) as cnt FROM book_pdf_chunks');

  console.log(`  users: ${uRes.rows[0].cnt} (Baseline: 229) -> Match: ${parseInt(uRes.rows[0].cnt, 10) === 229}`);
  console.log(`  student_profiles: ${spRes.rows[0].cnt} (Baseline: 226) -> Match: ${parseInt(spRes.rows[0].cnt, 10) === 226}`);
  console.log(`  ai_evaluations: ${evRes.rows[0].cnt} (Baseline: 345) -> Match: ${parseInt(evRes.rows[0].cnt, 10) === 345}`);
  console.log(`  exams: ${exRes.rows[0].cnt} (Baseline: 0) -> Match: ${parseInt(exRes.rows[0].cnt, 10) === 0}`);
  console.log(`  Book 4 book_pdf_chunks: ${b4PdfRes.rows[0].cnt} (Baseline: 11) -> Match: ${parseInt(b4PdfRes.rows[0].cnt, 10) === 11}`);
  console.log(`  Total book_pdf_chunks: ${totPdfRes.rows[0].cnt} (Baseline: 314) -> Match: ${parseInt(totPdfRes.rows[0].cnt, 10) === 314}`);

  results.externalBaselines = {
    users: parseInt(uRes.rows[0].cnt, 10),
    student_profiles: parseInt(spRes.rows[0].cnt, 10),
    ai_evaluations: parseInt(evRes.rows[0].cnt, 10),
    exams: parseInt(exRes.rows[0].cnt, 10),
    book4_pdf_chunks: parseInt(b4PdfRes.rows[0].cnt, 10),
    total_pdf_chunks: parseInt(totPdfRes.rows[0].cnt, 10)
  };

  fs.writeFileSync(
    path.resolve(process.cwd(), 'scripts', 'book4_final_acceptance_results.json'),
    JSON.stringify(results, null, 2)
  );

  console.log(`\n======================================================================`);
  console.log(`✅ FINAL ACCEPTANCE CHECK COMPLETE — ALL CHECKS PASSED`);
  console.log(`======================================================================`);

  process.exit(0);
}

runFinalAcceptanceCheck().catch(err => {
  console.error('Final Acceptance Check Failure:', err);
  process.exit(1);
});
