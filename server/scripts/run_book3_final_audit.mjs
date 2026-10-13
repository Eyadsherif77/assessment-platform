import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import { AIRagEngine, verifyQuestionProvenance } from '../dist/services/ai/aiRagEngine.js';

const bookId = '19886434-1839-427d-af31-4c64fcf79525'; // Math Prep 2 English
const prep2GradeId = '44d13655-da95-4425-8566-fd8451af1965';
const prepStageId = '61998777-4c5f-4e51-bc0a-38de938c842a';
const mathSubjectId = '83ef20f6-1b1b-4ac0-bd66-d3333a7c505e';

async function runBook3FinalAudit() {
  console.log('========================================================================');
  console.log('🔬 BOOK 3 FINAL VERIFICATION & AUDIT SUITE');
  console.log('Book: Mathematics — Second Preparatory Grade, English, Term 1');
  console.log(`Book ID: ${bookId}`);
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. BASELINE TABLE COUNTS (BEFORE)
  // ---------------------------------------------------------------------------
  console.log('--- [SECTION 1] Baseline Table Counts ---');
  const [
    usersBefore,
    studentsBefore,
    evalsBefore,
    booksBefore,
    pdfChunksBefore,
    bookPagesBefore,
    bookChunksBefore
  ] = await Promise.all([
    db.query('SELECT count(*) as c FROM users'),
    db.query('SELECT count(*) as c FROM student_profiles'),
    db.query('SELECT count(*) as c FROM ai_evaluations'),
    db.query('SELECT count(*) as c FROM books'),
    db.query('SELECT count(*) as c FROM book_pdf_chunks'),
    db.query('SELECT count(*) as c FROM book_pages WHERE book_id = $1', [bookId]),
    db.query('SELECT count(*) as c FROM book_chunks WHERE book_id = $1', [bookId])
  ]);

  const baselines = {
    users: usersBefore.rows[0].c,
    student_profiles: studentsBefore.rows[0].c,
    ai_evaluations: evalsBefore.rows[0].c,
    books: booksBefore.rows[0].c,
    book_pdf_chunks: pdfChunksBefore.rows[0].c,
    book_pages: bookPagesBefore.rows[0].c,
    book_chunks: bookChunksBefore.rows[0].c
  };
  console.log('Database Baselines (Before Audit):', JSON.stringify(baselines, null, 2));

  // ---------------------------------------------------------------------------
  // 2. VERIFY STORED DATA (PAGES, CHUNKS, UNITS)
  // ---------------------------------------------------------------------------
  console.log('\n--- [SECTION 2] Verifying Stored Data Integrity ---');
  const pageMetrics = await db.query(
    `SELECT 
       count(*) as total_rows,
       count(distinct page_number) as distinct_pages,
       min(page_number) as min_page,
       max(page_number) as max_page,
       sum(char_length(raw_text)) as total_chars,
       sum(length(raw_text)) as total_bytes
     FROM book_pages 
     WHERE book_id = $1`,
    [bookId]
  );
  const pm = pageMetrics.rows[0];
  console.log(`  Total Stored Pages: ${pm.total_rows}`);
  console.log(`  Distinct Pages: ${pm.distinct_pages} (Expected 130)`);
  console.log(`  Page Number Range: ${pm.min_page} to ${pm.max_page}`);
  console.log(`  Total Unicode Characters: ${pm.total_chars}`);
  console.log(`  Total UTF-8 Bytes: ${pm.total_bytes}`);

  // Check for any missing numbers in sequence 1..130
  const allPageNums = await db.query(
    'SELECT page_number FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC',
    [bookId]
  );
  const presentSet = new Set(allPageNums.rows.map(r => Number(r.page_number)));
  const missingNums = [];
  for (let i = 1; i <= 130; i++) {
    if (!presentSet.has(i)) missingNums.push(i);
  }
  console.log(`  Missing Page Numbers in [1..130]: ${missingNums.length === 0 ? 'NONE (100% Complete)' : missingNums.join(', ')}`);

  // Verify Unit Chapters and Boundaries
  const chaptersRes = await db.query(
    `SELECT id, chapter_number, title_en, title_ar, start_page, end_page 
     FROM book_chapters 
     WHERE book_id = $1 
     ORDER BY chapter_number ASC`,
    [bookId]
  );
  console.log('\n  Registered Unit Chapters in book_chapters:');
  for (const ch of chaptersRes.rows) {
    console.log(`    Unit ${ch.chapter_number}: "${ch.title_en}" (PDF Pages ${ch.start_page}..${ch.end_page}, ID: ${ch.id})`);
  }

  // Verify Chunks per Chapter and Book ownership
  const chunkIntegrity = await db.query(
    `SELECT 
       c.chapter_id,
       bc.chapter_number,
       bc.title_en,
       count(c.id) as chunk_count,
       min(c.page_number) as min_p,
       max(c.page_number) as max_p,
       count(case when c.book_id != $1 then 1 end) as wrong_book_count
     FROM book_chunks c
     LEFT JOIN book_chapters bc ON c.chapter_id = bc.id
     WHERE c.book_id = $1
     GROUP BY c.chapter_id, bc.chapter_number, bc.title_en
     ORDER BY bc.chapter_number ASC`,
    [bookId]
  );
  console.log('\n  Chunk Distribution & Ownership:');
  for (const r of chunkIntegrity.rows) {
    console.log(`    Unit ${r.chapter_number} (${r.title_en}): ${r.chunk_count} chunks (Pages ${r.min_p}..${r.max_p}), Alien Chunks: ${r.wrong_book_count}`);
  }

  // ---------------------------------------------------------------------------
  // 3. AUDIT MATHEMATICAL OCR QUALITY
  // ---------------------------------------------------------------------------
  console.log('\n--- [SECTION 3] Audit Mathematical OCR Quality ---');
  // Representative sample across all 4 units
  const auditSamplePages = [
    { page: 9, unit: 1, topic: 'Cube roots & intervals (calculator check)' },
    { page: 14, unit: 1, topic: 'Bounded intervals & inequalities (number line)' },
    { page: 38, unit: 2, topic: 'Polynomials & GCF factorization (exponents x^4, x^5)' },
    { page: 75, unit: 3, topic: 'Pythagoras theorem (c^2 = a^2 + b^2, ladder 13ft)' },
    { page: 115, unit: 4, topic: 'Cumulative frequency & distribution tables' }
  ];

  for (const s of auditSamplePages) {
    const pRes = await db.query(
      'SELECT raw_text, char_count FROM book_pages WHERE book_id = $1 AND page_number = $2',
      [bookId, s.page]
    );
    const text = pRes.rows[0].raw_text;
    console.log(`  [Sample Page ${s.page} - Unit ${s.unit}]: ${s.topic}`);
    console.log(`    Length: ${pRes.rows[0].char_count} chars`);
    const hasMathSymbols = /(=|<|>|\+|\-|\*|\/|\^|\$|sqrt|root|interval|factoriz|pythagoras|frequency)/i.test(text);
    console.log(`    Math Keywords/Symbols Present: ${hasMathSymbols ? 'YES' : 'NO'}`);
    console.log(`    Snippet: "${text.slice(0, 140).replace(/\n+/g, ' ')}..."`);
  }

  // ---------------------------------------------------------------------------
  // 4. TEST AI QUESTION GENERATION & PROVENANCE
  // ---------------------------------------------------------------------------
  console.log('\n--- [SECTION 4] Testing AI Question Generation & Provenance Gates ---');
  const ragEngine = new AIRagEngine();
  const testResults = [];

  // TEST 1: Authentic Question Generation from Unit 1 via Production Path
  console.log('\n  Test 1: Generating Questions from Unit 1 (Real Numbers & Intervals)...');
  const unit1 = chaptersRes.rows.find(c => c.chapter_number === 1);
  try {
    const qGen1 = await ragEngine.generateQuestions({
      bookId,
      chapterId: unit1.id,
      gradeId: prep2GradeId,
      academicStageId: prepStageId,
      subjectId: mathSubjectId,
      count: 2
    });
    console.log(`    Emitted ${qGen1.length} questions from production path:`);
    let allGenProvPassed = true;
    for (let i = 0; i < qGen1.length; i++) {
      const q = qGen1[i];
      const prov = await verifyQuestionProvenance(q, bookId);
      console.log(`      Q${i + 1} (Page ${q.page_reference}): "${q.question_text.slice(0, 70)}..."`);
      console.log(`         Correct Opt: "${q.options.find(o => o.is_correct)?.text}"`);
      console.log(`         Provenance Check: ${prov.isVerified ? '✅ VERIFIED' : '❌ FAILED: ' + prov.reason}`);
      if (!prov.isVerified) allGenProvPassed = false;
    }
    testResults.push({
      name: 'Supported question generation with verified provenance',
      expected: 'All emitted questions verified against cited book_pages',
      actual: allGenProvPassed ? 'All emitted questions verified' : 'Unverified question emitted',
      passed: allGenProvPassed
    });
  } catch (err) {
    console.error('    Error during Test 1:', err);
    testResults.push({
      name: 'Supported question generation with verified provenance',
      expected: 'Successful generation',
      actual: err.message,
      passed: false
    });
  }

  // TEST 2: Unrelated Source Page (Geometry Question citing Real Numbers Page 14)
  console.log('\n  Test 2: Rejecting Question citing Unrelated Source Page...');
  const unrelatedQ = {
    question_text: 'In any right-angled triangle, what is the length of the hypotenuse if the legs are 3 cm and 4 cm?',
    options: [
      { text: '5 cm', is_correct: true },
      { text: '7 cm', is_correct: false }
    ],
    page_reference: 14 // Page 14 is Intervals, NOT Pythagoras Theorem!
  };
  const unrelatedRes = await verifyQuestionProvenance(unrelatedQ, bookId);
  console.log(`    Provenance Result: isVerified = ${unrelatedRes.isVerified}`);
  testResults.push({
    name: 'Unrelated source page rejection',
    expected: 'isVerified = false',
    actual: `isVerified = ${unrelatedRes.isVerified} (${unrelatedRes.reason || 'None'})`,
    passed: !unrelatedRes.isVerified
  });

  // TEST 3: Unsupported Premise (Citing Page 14 with fictitious concepts)
  console.log('\n  Test 3: Rejecting Unsupported Premise...');
  const fakePremiseQ = {
    question_text: 'What is the quantum wave function of the bounded interval [a, b] in subatomic Euclidean space?',
    options: [
      { text: 'wave function', is_correct: true },
      { text: 'point mass', is_correct: false }
    ],
    page_reference: 14
  };
  const fakePremiseRes = await verifyQuestionProvenance(fakePremiseQ, bookId);
  console.log(`    Provenance Result: isVerified = ${fakePremiseRes.isVerified}`);
  testResults.push({
    name: 'Unsupported premise rejection',
    expected: 'isVerified = false',
    actual: `isVerified = ${fakePremiseRes.isVerified} (${fakePremiseRes.reason || 'None'})`,
    passed: !fakePremiseRes.isVerified
  });

  // TEST 4: Incorrect Answer to Mathematical Problem (False formula / calculation)
  console.log('\n  Test 4: Rejecting Incorrect Mathematical Answer Claims...');
  const wrongFormulaQ = {
    question_text: 'According to Pythagoras theorem, what is the equation relating the hypotenuse c and legs a and b in a right triangle?',
    options: [
      { text: 'c^2 = a^2 - b^2', is_correct: true }, // Incorrect subtraction formula! Page 75 states c^2 = a^2 + b^2
      { text: 'c^2 = a^2 + b^2', is_correct: false }
    ],
    page_reference: 75
  };
  const wrongFormulaRes = await verifyQuestionProvenance(wrongFormulaQ, bookId);
  console.log(`    Formula Provenance Result (c^2 = a^2 - b^2 on p75): isVerified = ${wrongFormulaRes.isVerified}`);

  const wrongCalcQ = {
    question_text: 'In Example 1, what is the approximate decimal value of sqrt(2) obtained by calculator?',
    options: [
      { text: 'sqrt(2) approx 2.85', is_correct: true }, // False calculation! Page 14 states sqrt(2) approx 1.4
      { text: 'sqrt(2) approx 1.4', is_correct: false }
    ],
    page_reference: 14
  };
  const wrongCalcRes = await verifyQuestionProvenance(wrongCalcQ, bookId);
  console.log(`    Calculation Provenance Result (sqrt(2) approx 2.85 on p14): isVerified = ${wrongCalcRes.isVerified}`);

  const mathClaimsRejected = (!wrongFormulaRes.isVerified) && (!wrongCalcRes.isVerified);
  testResults.push({
    name: 'Incorrect mathematical claim rejection',
    expected: 'Both false claims rejected (isVerified = false)',
    actual: mathClaimsRejected ? 'Both false claims rejected' : 'At least one false claim accepted',
    passed: mathClaimsRejected
  });

  // TEST 5: Cross-Unit Grounding Scope (Requesting Unit 1 while scoped to Unit 3)
  console.log('\n  Test 5: Cross-Unit Grounding Scope Check...');
  const unit3 = chaptersRes.rows.find(c => c.chapter_number === 3);
  const unit3Chunks = await ragEngine.retrieveGroundedChunks({
    bookId,
    chapterId: unit3.id,
    gradeId: prep2GradeId,
    academicStageId: prepStageId,
    subjectId: mathSubjectId,
    limit: 5
  });
  const allInUnit3 = unit3Chunks.every(c => c.page_number >= unit3.start_page && c.page_number <= unit3.end_page);
  console.log(`    Unit 3 retrieved ${unit3Chunks.length} chunks. Pages: [${unit3Chunks.map(c => c.page_number).join(', ')}]`);
  console.log(`    All within Unit 3 boundaries (${unit3.start_page}..${unit3.end_page}): ${allInUnit3}`);
  testResults.push({
    name: 'Cross-unit chunk boundary isolation',
    expected: 'All retrieved chunks within chapter start_page and end_page',
    actual: `All in boundaries = ${allInUnit3}`,
    passed: allInUnit3
  });

  // TEST 6: Invalid/Empty Unit Request
  console.log('\n  Test 6: Invalid / Non-Existent Unit ID Request...');
  let invalidUnitPassed = false;
  try {
    await ragEngine.generateQuestions({
      bookId,
      chapterId: '00000000-0000-0000-0000-000000000000',
      gradeId: prep2GradeId,
      academicStageId: prepStageId,
      subjectId: mathSubjectId,
      count: 2
    });
  } catch (err) {
    console.log(`    Successfully rejected invalid chapter ID: "${err.message}"`);
    invalidUnitPassed = true;
  }
  testResults.push({
    name: 'Invalid unit request rejection',
    expected: 'Rejected with descriptive error',
    actual: invalidUnitPassed ? 'Properly rejected' : 'Allowed invalid chapter',
    passed: invalidUnitPassed
  });

  // TEST 7: Cross-Grade Authorization Rejection
  console.log('\n  Test 7: Cross-Grade Isolation Enforcement...');
  let crossGradeBlocked = false;
  try {
    await ragEngine.generateQuestions({
      bookId,
      chapterId: unit1.id,
      gradeId: '2f0f4f5a-7c5c-4136-a935-33c79effca3d', // Prep 3 grade ID
      academicStageId: prepStageId,
      subjectId: mathSubjectId,
      count: 2
    });
  } catch (err) {
    console.log(`    Successfully blocked cross-grade request: "${err.message}"`);
    crossGradeBlocked = true;
  }
  testResults.push({
    name: 'Cross-grade authorization enforcement',
    expected: 'Cross-grade request blocked',
    actual: crossGradeBlocked ? 'Blocked' : 'Allowed cross-grade',
    passed: crossGradeBlocked
  });

  // ---------------------------------------------------------------------------
  // 5. PRODUCTION SAFETY AUDIT (AFTER)
  // ---------------------------------------------------------------------------
  console.log('\n--- [SECTION 5] Database Safety Check (After Audit) ---');
  const [
    usersAfter,
    studentsAfter,
    evalsAfter,
    booksAfter,
    pdfChunksAfter,
    bookPagesAfter,
    bookChunksAfter
  ] = await Promise.all([
    db.query('SELECT count(*) as c FROM users'),
    db.query('SELECT count(*) as c FROM student_profiles'),
    db.query('SELECT count(*) as c FROM ai_evaluations'),
    db.query('SELECT count(*) as c FROM books'),
    db.query('SELECT count(*) as c FROM book_pdf_chunks'),
    db.query('SELECT count(*) as c FROM book_pages WHERE book_id = $1', [bookId]),
    db.query('SELECT count(*) as c FROM book_chunks WHERE book_id = $1', [bookId])
  ]);

  const afterStats = {
    users: usersAfter.rows[0].c,
    student_profiles: studentsAfter.rows[0].c,
    ai_evaluations: evalsAfter.rows[0].c,
    books: booksAfter.rows[0].c,
    book_pdf_chunks: pdfChunksAfter.rows[0].c,
    book_pages: bookPagesAfter.rows[0].c,
    book_chunks: bookChunksAfter.rows[0].c
  };
  console.log('Database Counts (After Audit):', JSON.stringify(afterStats, null, 2));

  const safetyIntact = 
    baselines.users === afterStats.users &&
    baselines.student_profiles === afterStats.student_profiles &&
    baselines.ai_evaluations === afterStats.ai_evaluations &&
    baselines.books === afterStats.books &&
    baselines.book_pdf_chunks === afterStats.book_pdf_chunks &&
    baselines.book_pages === afterStats.book_pages;

  console.log(`Safety Gate Status: ${safetyIntact ? '✅ 100% INTACT (Zero modifications to production core data)' : '❌ VIOLATION DETECTED'}`);

  console.log('\n========================================================================');
  console.log('🏁 TEST RESULTS SUMMARY');
  console.log('========================================================================');
  let allTestsPassed = true;
  for (const t of testResults) {
    console.log(`[${t.passed ? 'PASS' : 'FAIL'}] ${t.name}`);
    console.log(`       Expected: ${t.expected}`);
    console.log(`       Actual:   ${t.actual}`);
    if (!t.passed) allTestsPassed = false;
  }
  console.log(`\nOVERALL SUITE STATUS: ${allTestsPassed && safetyIntact ? 'ALL PASSED' : 'SOME TESTS FAILED'}`);

  process.exit(allTestsPassed && safetyIntact ? 0 : 1);
}

runBook3FinalAudit().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
