import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { aiRagEngine } from '../dist/services/ai/aiRagEngine.js';

const book13Id = '9e702109-7d92-445c-b814-567c1f6cba49';

async function runBook13Audit() {
  console.log(`======================================================================`);
  console.log(`🔍 INDEPENDENT ACCEPTANCE AUDIT FOR BOOK 13 (Prep 3 English)`);
  console.log(`Book ID: ${book13Id}`);
  console.log(`======================================================================\n`);

  const results = {
    bookId: book13Id,
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
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${book13Id}.pdf`);
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const pdfDoc = await PDFDocument.load(pdfBuf);
  const sourcePageCount = pdfDoc.getPageCount();

  const pagesRes = await db.query(
    'SELECT page_number, char_count, SUBSTRING(raw_text, 1, 150) as preview FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC',
    [book13Id]
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

  const lowTextPages = pagesRes.rows.filter(r => Number(r.char_count) < 50);
  console.log(`Contiguous (1..${sourcePageCount}): ${isContiguous}`);
  console.log(`Low-text (<50 chars) pages: ${lowTextPages.length}`);
  lowTextPages.forEach(p => console.log(`  - Page ${p.page_number}: ${p.char_count} chars`));

  results.pageIntegrity = {
    sourcePageCount,
    storedPageCount,
    isContiguous,
    lowTextCount: lowTextPages.length,
    passed: isContiguous && storedPageCount === sourcePageCount
  };

  // ---------------------------------------------------------------------------
  // B. CURRICULUM INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n--- B. CURRICULUM INTEGRITY AUDIT ---');
  const chapRes = await db.query(
    `SELECT c.id, c.chapter_number, c.title_ar, c.title_en, c.start_page, c.end_page,
            COUNT(k.id) as chunk_count,
            MIN(k.page_number) as min_page,
            MAX(k.page_number) as max_page
     FROM book_chapters c
     LEFT JOIN book_chunks k ON k.chapter_id = c.id
     WHERE c.book_id = $1
     GROUP BY c.id, c.chapter_number, c.title_ar, c.title_en, c.start_page, c.end_page
     ORDER BY c.chapter_number ASC`,
    [book13Id]
  );

  console.log(`Official Chapters in DB (${chapRes.rows.length}):`);
  const unitAudits = [];
  let totalAssignedChunks = 0;
  for (const c of chapRes.rows) {
    const chunkCount = Number(c.chunk_count);
    totalAssignedChunks += chunkCount;
    console.log(`  Unit ${c.chapter_number}: "${c.title_en}"`);
    console.log(`    Boundaries: Pages ${c.start_page}..${c.end_page} | Chunks: ${chunkCount} (min: ${c.min_page}, max: ${c.max_page}) [ID: ${c.id}]`);
    unitAudits.push({
      chapter_number: c.chapter_number,
      id: c.id,
      title_ar: c.title_ar,
      title_en: c.title_en,
      start_page: Number(c.start_page),
      end_page: Number(c.end_page),
      chunk_count: chunkCount,
      min_page: c.min_page,
      max_page: c.max_page
    });
  }

  const allChunksRes = await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [book13Id]);
  const totalChunks = Number(allChunksRes.rows[0].cnt);
  console.log(`Total book_chunks for Book 13: ${totalChunks} (Assigned to Units 1..6: ${totalAssignedChunks})`);

  results.curriculumIntegrity = {
    chaptersCount: chapRes.rows.length,
    totalChunks,
    totalAssignedChunks,
    unitAudits,
    passed: chapRes.rows.length === 6 && totalChunks > 0 && totalAssignedChunks === totalChunks
  };

  // ---------------------------------------------------------------------------
  // C. CONTENT FIDELITY
  // ---------------------------------------------------------------------------
  console.log('\n--- C. CONTENT FIDELITY AUDIT ---');
  const samplePages = await db.query(
    'SELECT page_number, char_count, SUBSTRING(raw_text, 1, 200) as snippet FROM book_pages WHERE book_id = $1 AND page_number IN (14, 20, 28, 35, 42, 50, 60, 73, 86, 95) ORDER BY page_number ASC',
    [book13Id]
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
    'Personal identity, personality, character, Present Perfect active and passive since for',
    'Communication with family and friends, active listening, body language, relationships',
    'Artificial Intelligence, machine learning, robots, smart future technology, Future Simple Passive',
    'Screen time, digital habits, social media balance, wellbeing and device use',
    'Design thinking, problem solving, prototype, brainstorming, creativity, testing',
    'Why do we like stories, traditional tales, morals, narrative elements, storytelling'
  ];

  const bookRes = await db.query('SELECT * FROM books WHERE id = $1', [book13Id]);
  const book = bookRes.rows[0];

  for (let idx = 0; idx < unitAudits.length; idx++) {
    const u = unitAudits[idx];
    const testQuery = testQueries[idx] || u.title_en;
    const retrieved = await aiRagEngine.retrieveGroundedChunks({
      academicStageId: book.academic_stage_id,
      gradeId: book.grade_id,
      subjectId: book.subject_id,
      bookId: book13Id,
      chapterId: u.id,
      queryText: testQuery,
      limit: 6
    });

    const foreignChunks = retrieved.filter(c => c.chapter_id && c.chapter_id !== u.id);
    const pagesRetrieved = retrieved.map(c => c.page_number);
    const inBounds = pagesRetrieved.every(p => p >= u.start_page && p <= u.end_page);

    console.log(`  Unit ${u.chapter_number} Retrieval Test ("${testQuery.substring(0, 45)}..."):`);
    console.log(`    Retrieved: ${retrieved.length} chunks | Pages: [${pagesRetrieved.join(', ')}] | Foreign: ${foreignChunks.length}`);
    console.log(`    Strict Chapter Boundary Isolation: ${inBounds && foreignChunks.length === 0 ? 'PASSED ✅' : 'FAILED ❌'}`);

    unitIsolationTests.push({
      unit: u.chapter_number,
      chapterId: u.id,
      retrievedCount: retrieved.length,
      pagesRetrieved,
      foreignChunksCount: foreignChunks.length,
      isolated: inBounds && foreignChunks.length === 0
    });
  }

  // Cross-book / Mismatched chapter negative test
  const fakeChapterId = '00000000-0000-0000-0000-000000000000';
  const negativeRetrieval = await aiRagEngine.retrieveGroundedChunks({
    academicStageId: book.academic_stage_id,
    gradeId: book.grade_id,
    subjectId: book.subject_id,
    bookId: book13Id,
    chapterId: fakeChapterId,
    queryText: 'Photosynthesis in green plants chlorophyll',
    limit: 6
  });

  const crossBookLeak = negativeRetrieval.some(c => c.book_id !== book13Id);
  console.log(`  Cross-Book Fallback & Mismatched Chapter Test:`);
  console.log(`    Mismatched chapter query returned ${negativeRetrieval.length} chunks (Cross-book leakage: ${crossBookLeak})`);

  results.retrievalIntegrity = {
    unitIsolationTests,
    negativeRetrievalCount: negativeRetrieval.length,
    crossBookLeak,
    passed: unitIsolationTests.every(t => t.isolated && t.retrievedCount > 0) && !crossBookLeak
  };

  // ---------------------------------------------------------------------------
  // E. DATA SAFETY RECONCILIATION
  // ---------------------------------------------------------------------------
  console.log('\n--- E. DATA SAFETY RECONCILIATION (BOOKS 1-12 BASELINE) ---');
  const baseline = [
    { num: 1, id: 'd7bbfca2-6d8f-461b-8e39-2015981e86ec', p: 102, c: 101 },
    { num: 2, id: 'f19276d3-4adb-4297-bb77-5ed87ba638b9', p: 113, c: 104 },
    { num: 3, id: '19886434-1839-427d-af31-4c64fcf79525', p: 130, c: 128 },
    { num: 4, id: '81b8a308-7fcf-4938-8c45-aa0056624f32', p: 106, c: 98 },
    { num: 5, id: '543f2746-460c-41c1-ba38-0933f479272f', p: 104, c: 97 },
    { num: 6, id: '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', p: 113, c: 87 },
    { num: 7, id: 'bc6bb834-7192-474c-8507-c53265028b4e', p: 162, c: 142 },
    { num: 8, id: '37bfa0c0-c4ce-419f-930a-000043d8d3f9', p: 114, c: 86 },
    { num: 9, id: '0758fc7a-c9b2-4e25-a32b-6cacb6bb418d', p: 142, c: 119 },
    { num: 10, id: 'fa2a1525-c46f-4b34-9f48-b762be88e5c5', p: 110, c: 90 },
    { num: 11, id: '808104ec-b861-434b-80c6-579f715d8bdf', p: 122, c: 104 },
    { num: 12, id: '013411b8-edec-477b-bd42-3dbdda9fb6a9', p: 162, c: 134 }
  ];

  let baselinePass = true;
  for (const b of baseline) {
    const p = Number((await db.query('SELECT count(*) as cnt FROM book_pages WHERE book_id = $1', [b.id])).rows[0].cnt);
    const c = Number((await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [b.id])).rows[0].cnt);
    if (p !== b.p || c !== b.c) baselinePass = false;
  }
  console.log(`Books 1-12 Baseline Intact: ${baselinePass ? 'PASSED ✅' : 'FAILED ❌'}`);

  const usersCount = Number((await db.query('SELECT count(*) as cnt FROM users')).rows[0].cnt);
  const profilesCount = Number((await db.query('SELECT count(*) as cnt FROM student_profiles')).rows[0].cnt);
  const evalsCount = Number((await db.query('SELECT count(*) as cnt FROM ai_evaluations')).rows[0].cnt);
  const pdfChunksCount = Number((await db.query('SELECT count(*) as cnt FROM book_pdf_chunks')).rows[0].cnt);
  const platformPass = (usersCount === 229 && profilesCount === 226 && evalsCount === 345 && pdfChunksCount === 314);
  console.log(`Platform User & Exam Tables Intact: ${platformPass ? 'PASSED ✅' : 'FAILED ❌'}`);

  results.dataSafety = {
    baselinePass,
    platformPass,
    passed: baselinePass && platformPass
  };

  const overall = results.pageIntegrity.passed &&
                  results.curriculumIntegrity.passed &&
                  results.contentFidelity.passed &&
                  results.retrievalIntegrity.passed &&
                  results.dataSafety.passed;

  console.log('\n======================================================================');
  console.log(`🏁 BOOK 13 ACCEPTANCE AUDIT OVERALL STATUS: ${overall ? 'PASS' : 'FAIL'}`);
  console.log('======================================================================\n');

  fs.writeFileSync('scripts/book13_audit_results.json', JSON.stringify(results, null, 2));
  process.exit(overall ? 0 : 1);
}

runBook13Audit().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
