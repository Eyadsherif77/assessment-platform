import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { aiRagEngine } from '../dist/services/ai/aiRagEngine.js';

const book11Id = '808104ec-b861-434b-80c6-579f715d8bdf';

async function runBook11Audit() {
  console.log(`======================================================================`);
  console.log(`🔍 INDEPENDENT ACCEPTANCE AUDIT FOR BOOK 11 (Prep 1 Mathematics)`);
  console.log(`Book ID: ${book11Id}`);
  console.log(`======================================================================\n`);

  const results = {
    bookId: book11Id,
    pageIntegrity: {},
    curriculumIntegrity: {},
    contentFidelity: {},
    retrievalIntegrity: {},
    dataSafety: {}
  };

  // ---------------------------------------------------------------------------
  // A. PAGE INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('--- A. PAGE INTEGRITY AUDIT ---');
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${book11Id}.pdf`);
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const pdfDoc = await PDFDocument.load(pdfBuf);
  const sourcePageCount = pdfDoc.getPageCount();

  const pagesRes = await db.query(
    'SELECT page_number, char_count, SUBSTRING(raw_text, 1, 150) as preview FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC',
    [book11Id]
  );
  const storedPageCount = pagesRes.rows.length;
  console.log(`Source PDF Pages: ${sourcePageCount} | Stored Pages in DB: ${storedPageCount}`);

  // Check contiguity
  const pageNumbers = pagesRes.rows.map(r => Number(r.page_number));
  let isContiguous = true;
  for (let i = 1; i <= sourcePageCount; i++) {
    if (!pageNumbers.includes(i)) {
      isContiguous = false;
      console.log(`  ❌ Missing page number: ${i}`);
    }
  }

  // Check low text or blank pages
  const lowTextPages = pagesRes.rows.filter(r => Number(r.char_count) < 50);
  console.log(`Contiguous (1..${sourcePageCount}): ${isContiguous}`);
  console.log(`Low-text (<50 chars) pages: ${lowTextPages.length}`);
  lowTextPages.forEach(p => console.log(`  - Page ${p.page_number}: ${p.char_count} chars`));

  results.pageIntegrity = {
    sourcePageCount,
    storedPageCount,
    isContiguous,
    lowTextCount: lowTextPages.length,
    lowTextPages: lowTextPages.map(p => ({ page: p.page_number, chars: p.char_count })),
    passed: storedPageCount === sourcePageCount && isContiguous
  };

  // ---------------------------------------------------------------------------
  // B. CURRICULUM INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n--- B. CURRICULUM INTEGRITY AUDIT ---');
  const chapRes = await db.query(
    `SELECT bc.id, bc.chapter_number, bc.title_ar, bc.title_en, bc.start_page, bc.end_page,
            count(c.id) as chunk_count,
            min(c.page_number) as min_page,
            max(c.page_number) as max_page
     FROM book_chapters bc
     LEFT JOIN book_chunks c ON bc.id = c.chapter_id
     WHERE bc.book_id = $1
     GROUP BY bc.id, bc.chapter_number, bc.title_ar, bc.title_en, bc.start_page, bc.end_page
     ORDER BY bc.chapter_number ASC`,
    [book11Id]
  );

  console.log(`Official Chapters in DB (${chapRes.rows.length}):`);
  let totalAssignedChunks = 0;
  const unitAudits = [];
  for (const c of chapRes.rows) {
    const chunkCnt = Number(c.chunk_count);
    totalAssignedChunks += chunkCnt;
    console.log(`  Unit ${c.chapter_number}: "${c.title_en}" (${c.title_ar})`);
    console.log(`    Boundaries: Pages ${c.start_page}..${c.end_page} | Chunks: ${chunkCnt} (min: ${c.min_page}, max: ${c.max_page}) [ID: ${c.id}]`);
    unitAudits.push({
      unit: c.chapter_number,
      title_en: c.title_en,
      title_ar: c.title_ar,
      id: c.id,
      start_page: c.start_page,
      end_page: c.end_page,
      chunk_count: chunkCnt,
      min_page: c.min_page,
      max_page: c.max_page
    });
  }

  const allChunksRes = await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [book11Id]);
  const totalChunks = Number(allChunksRes.rows[0].cnt);
  console.log(`Total book_chunks for Book 11: ${totalChunks} (Assigned to Units 1..4: ${totalAssignedChunks})`);

  results.curriculumIntegrity = {
    chaptersCount: chapRes.rows.length,
    totalChunks,
    totalAssignedChunks,
    unitAudits,
    passed: chapRes.rows.length === 4 && totalChunks > 0 && totalAssignedChunks === totalChunks
  };

  // ---------------------------------------------------------------------------
  // C. CONTENT FIDELITY
  // ---------------------------------------------------------------------------
  console.log('\n--- C. CONTENT FIDELITY AUDIT ---');
  const samplePages = await db.query(
    'SELECT page_number, char_count, SUBSTRING(raw_text, 1, 200) as snippet FROM book_pages WHERE book_id = $1 AND page_number IN (9, 20, 39, 45, 54, 76, 95) ORDER BY page_number ASC',
    [book11Id]
  );
  console.log(`Representative unit opening and internal pages text samples:`);
  samplePages.rows.forEach(p => {
    console.log(`  Page ${p.page_number} (${p.char_count} chars): "${p.snippet.replace(/\n/g, ' ')}..."`);
  });

  results.contentFidelity = {
    samplePages: samplePages.rows,
    passed: samplePages.rows.every(p => Number(p.char_count) > 100)
  };

  // ---------------------------------------------------------------------------
  // D. RETRIEVAL & ISOLATION AUDIT
  // ---------------------------------------------------------------------------
  console.log('\n--- D. RETRIEVAL & PROVENANCE INTEGRITY AUDIT ---');
  const unitIsolationTests = [];
  const testQueries = [
    'Ratio and proportion and operations on rational numbers and sets',
    'Mathematical expressions and formulas and linear equations',
    'Organizing data and arithmetic mean and pie charts in statistics',
    'Parallelism, triangles, quadrilaterals, polygons, and coordinates in geometry'
  ];

  const bookRes = await db.query('SELECT * FROM books WHERE id = $1', [book11Id]);
  const book = bookRes.rows[0];

  for (let idx = 0; idx < unitAudits.length; idx++) {
    const u = unitAudits[idx];
    const testQuery = testQueries[idx] || u.title_en;
    const retrieved = await aiRagEngine.retrieveGroundedChunks({
      academicStageId: book.academic_stage_id,
      gradeId: book.grade_id,
      subjectId: book.subject_id,
      bookId: book11Id,
      chapterId: u.id,
      queryText: testQuery,
      limit: 6
    });

    const foreignChunks = retrieved.filter(c => c.chapter_id && c.chapter_id !== u.id);
    const pagesRetrieved = retrieved.map(c => c.page_number);
    const inBounds = pagesRetrieved.every(p => p >= u.start_page && p <= u.end_page);

    console.log(`  Unit ${u.unit} Retrieval Test ("${testQuery}"):`);
    console.log(`    Retrieved: ${retrieved.length} chunks | Pages: [${pagesRetrieved.join(', ')}] | Foreign: ${foreignChunks.length}`);
    console.log(`    Strict Chapter Boundary Isolation: ${foreignChunks.length === 0 && inBounds ? 'PASSED ✅' : 'FAILED ❌'}`);

    unitIsolationTests.push({
      unit: u.unit,
      chapterId: u.id,
      retrievedCount: retrieved.length,
      pagesRetrieved,
      foreignCount: foreignChunks.length,
      passed: foreignChunks.length === 0 && inBounds
    });
  }

  // Cross-book leakage test
  console.log(`  Cross-Book Fallback & Mismatched Chapter Test:`);
  const mismatchedRes = await aiRagEngine.retrieveGroundedChunks({
    academicStageId: book.academic_stage_id,
    gradeId: book.grade_id,
    subjectId: book.subject_id,
    bookId: book11Id,
    chapterId: 'd8b969af-fa0a-4f96-a54c-bbcf33ddc188', // Book 5 Chapter ID
    queryText: 'Find the value of x in the equation',
    limit: 5
  });
  const crossLeakage = mismatchedRes.some(c => c.book_id !== book11Id);
  console.log(`    Mismatched chapter query returned ${mismatchedRes.length} chunks (Cross-book leakage: ${crossLeakage})`);

  results.retrievalIntegrity = {
    unitIsolationTests,
    crossLeakage,
    passed: unitIsolationTests.every(t => t.passed) && !crossLeakage
  };

  // ---------------------------------------------------------------------------
  // E. DATA SAFETY RECONCILIATION
  // ---------------------------------------------------------------------------
  console.log('\n--- E. DATA SAFETY RECONCILIATION (BOOKS 1-8 BASELINE) ---');
  const baseline = [
    { num: 1, id: 'd7bbfca2-6d8f-461b-8e39-2015981e86ec', p: 102, c: 101 },
    { num: 2, id: 'f19276d3-4adb-4297-bb77-5ed87ba638b9', p: 113, c: 104 },
    { num: 3, id: '19886434-1839-427d-af31-4c64fcf79525', p: 130, c: 128 },
    { num: 4, id: '81b8a308-7fcf-4938-8c45-aa0056624f32', p: 106, c: 98 },
    { num: 5, id: '543f2746-460c-41c1-ba38-0933f479272f', p: 104, c: 97 },
    { num: 6, id: '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', p: 113, c: 87 },
    { num: 7, id: 'bc6bb834-7192-474c-8507-c53265028b4e', p: 162, c: 142 },
    { num: 8, id: '37bfa0c0-c4ce-419f-930a-000043d8d3f9', p: 114, c: 86 }
  ];

  let books1to8Intact = true;
  for (const b of baseline) {
    const pRes = await db.query('SELECT count(*) as cnt FROM book_pages WHERE book_id = $1', [b.id]);
    const cRes = await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [b.id]);
    const p = Number(pRes.rows[0].cnt);
    const c = Number(cRes.rows[0].cnt);
    if (p !== b.p || c !== b.c) {
      books1to8Intact = false;
      console.log(`  ❌ Book ${b.num} changed: Pages ${p}/${b.p}, Chunks ${c}/${b.c}`);
    }
  }

  const usersRes = await db.query('SELECT count(*) as cnt FROM users');
  const profilesRes = await db.query('SELECT count(*) as cnt FROM student_profiles');
  const evalsRes = await db.query('SELECT count(*) as cnt FROM ai_evaluations');
  const pdfChunksRes = await db.query('SELECT count(*) as cnt FROM book_pdf_chunks');

  const tablesIntact = (
    usersRes.rows[0].cnt == 229 &&
    profilesRes.rows[0].cnt == 226 &&
    evalsRes.rows[0].cnt == 345 &&
    pdfChunksRes.rows[0].cnt == 314
  );

  console.log(`Books 1-8 Baseline Intact: ${books1to8Intact ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`Platform User & Exam Tables Intact: ${tablesIntact ? 'PASSED ✅' : 'FAILED ❌'}`);

  results.dataSafety = {
    books1to8Intact,
    tablesIntact,
    passed: books1to8Intact && tablesIntact
  };

  const allPassed = (
    results.pageIntegrity.passed &&
    results.curriculumIntegrity.passed &&
    results.contentFidelity.passed &&
    results.retrievalIntegrity.passed &&
    results.dataSafety.passed
  );

  results.overallStatus = allPassed ? 'PASS' : 'FAIL';
  console.log(`\n======================================================================`);
  console.log(`🏁 BOOK 11 ACCEPTANCE AUDIT OVERALL STATUS: ${results.overallStatus}`);
  console.log(`======================================================================\n`);

  fs.writeFileSync('./scripts/book11_audit_results.json', JSON.stringify(results, null, 2), 'utf-8');
  process.exit(allPassed ? 0 : 1);
}

runBook11Audit().catch(err => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
