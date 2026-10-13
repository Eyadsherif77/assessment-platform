import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';

async function main() {
  console.log('========================================================================');
  console.log('🔍 FINAL ALL-13-BOOKS READ-ONLY AUDIT & COMPREHENSIVE VERIFICATION');
  console.log('========================================================================\n');

  // --- 1. VERIFY THE SIX TITLE CORRECTIONS ---
  console.log('--- 1. VERIFYING THE SIX TITLE CORRECTIONS ---');
  const correctedIds = [
    { id: 'd7bbfca2-6d8f-461b-8e39-2015981e86ec', expected_ar: 'العلوم (لغات)', expected_en: 'Science (English)', label: 'Book 3 (Science Prep 1 Languages)' },
    { id: '19886434-1839-427d-af31-4c64fcf79525', expected_ar: 'الرياضيات (لغات)', expected_en: 'Mathematics', label: 'Book 7 (Math Prep 2 Languages)' },
    { id: '81b8a308-7fcf-4938-8c45-aa0056624f32', expected_ar: 'الدراسات الاجتماعية', expected_en: 'Social Studies', label: 'Book 9 (Social Studies Prep 2)' },
    { id: '013411b8-edec-477b-bd42-3dbdda9fb6a9', expected_ar: 'اللغة العربية', expected_en: 'Arabic Language', label: 'Book 11 (Arabic Prep 3)' },
    { id: 'f19276d3-4adb-4297-bb77-5ed87ba638b9', expected_ar: 'الدراسات الاجتماعية', expected_en: 'Social Studies', label: 'Book 12 (Social Studies Prep 3)' },
    { id: '9e702109-7d92-445c-b814-567c1f6cba49', expected_ar: 'اللغة الإنجليزية', expected_en: 'English Language', label: 'Book 13 (English Prep 3)' }
  ];

  let correctionsAllMatch = true;
  for (const item of correctedIds) {
    const res = await db.query('SELECT * FROM books WHERE id = $1', [item.id]);
    const b = res.rows[0];
    const matchAr = b.title_ar === item.expected_ar;
    const matchEn = b.title_en === item.expected_en;
    const ok = matchAr && matchEn;
    if (!ok) correctionsAllMatch = false;
    console.log(`  [${item.label}] ID: ${item.id}`);
    console.log(`     ar: "${b.title_ar}" (Expected: "${item.expected_ar}") -> ${matchAr ? 'MATCH ✅' : 'FAIL ❌'}`);
    console.log(`     en: "${b.title_en}" (Expected: "${item.expected_en}") -> ${matchEn ? 'MATCH ✅' : 'FAIL ❌'}`);
    console.log(`     grade_id: ${b.grade_id}, subject_id: ${b.subject_id}, stage_id: ${b.academic_stage_id}, term: ${b.term}, type: ${b.school_type}`);
  }
  console.log(`  -> Six title corrections verdict: ${correctionsAllMatch ? 'ALL VERIFIED ✅' : 'DISCREPANCY ❌'}\n`);

  // --- 2. CHAPTER COUNT & CURRICULUM UNITS INVESTIGATION ---
  console.log('--- 2. CHAPTER COUNT DIFFERENCE INVESTIGATION (53 vs 54) ---');
  const allBooksRes = await db.query(`
    SELECT 
      b.id, b.title_ar, b.title_en, b.term, b.school_type, b.total_pages,
      g.name_ar as grade_ar, g.name_en as grade_en,
      s.name_ar as subject_ar, s.name_en as subject_en
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
    ORDER BY g.sort_order ASC, s.sort_order ASC, b.created_at ASC
  `);

  let totalChapterRecords = 0;
  const bookChapterSummary = [];

  for (let i = 0; i < allBooksRes.rows.length; i++) {
    const b = allBooksRes.rows[i];
    const chRes = await db.query(
      `SELECT id, chapter_number, title_ar, title_en, start_page, end_page, description 
       FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC`,
      [b.id]
    );

    totalChapterRecords += chRes.rows.length;
    bookChapterSummary.push({
      num: i + 1,
      id: b.id,
      grade_ar: b.grade_ar,
      subject_ar: b.subject_ar,
      title_ar: b.title_ar,
      title_en: b.title_en,
      chapterRecordsCount: chRes.rows.length,
      chapters: chRes.rows
    });
  }

  console.log(`  Total chapter records found across all 13 books: ${totalChapterRecords}`);
  for (const s of bookChapterSummary) {
    console.log(`  Book ${s.num}: [${s.grade_ar} - ${s.subject_ar}] "${s.title_ar}": ${s.chapterRecordsCount} chapter records`);
    for (const c of s.chapters) {
      console.log(`     Unit ${c.chapter_number} [p.${c.start_page}-${c.end_page}]: "${c.title_ar}" | "${c.title_en}"`);
    }
  }

  // --- 3. PAGE & CHUNK CONTINUITY, ORPHANS, CROSS-BOOK INTEGRITY ---
  console.log('\n--- 3. DETAILED VERIFICATION OF ALL 13 BOOKS INTEGRITY ---');
  let integrityIssues = [];

  for (let i = 0; i < allBooksRes.rows.length; i++) {
    const b = allBooksRes.rows[i];
    
    // Page continuity
    const pageRows = (await db.query(
      `SELECT page_number FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC`,
      [b.id]
    )).rows;
    
    const pageCount = pageRows.length;
    const pageNums = pageRows.map(r => r.page_number);
    const minPage = pageNums.length > 0 ? pageNums[0] : 0;
    const maxPage = pageNums.length > 0 ? pageNums[pageNums.length - 1] : 0;
    
    // Check duplicates
    const pageSet = new Set(pageNums);
    const hasDuplicatePages = pageSet.size !== pageNums.length;

    // Check gaps
    let missingPages = [];
    for (let p = minPage; p <= maxPage; p++) {
      if (!pageSet.has(p)) missingPages.push(p);
    }

    // Chunk counts & orphans
    const chunks = (await db.query(
      `SELECT id, chapter_id, page_number, academic_stage_id, grade_id, subject_id 
       FROM book_chunks WHERE book_id = $1`,
      [b.id]
    )).rows;

    const chunkCount = chunks.length;
    const chunksWithoutChapter = chunks.filter(c => !c.chapter_id).length;

    // Valid chapter reference check
    const validChapterIds = new Set(bookChapterSummary[i].chapters.map(c => c.id));
    const chunksWithInvalidChapter = chunks.filter(c => c.chapter_id && !validChapterIds.has(c.chapter_id)).length;

    // Cross-book / cross-curriculum check
    const chunksWithMismatchedCurriculum = chunks.filter(c => 
      c.grade_id !== b.grade_id || c.subject_id !== b.subject_id || c.academic_stage_id !== b.academic_stage_id
    ).length;

    console.log(`  Book ${i + 1} [${b.id.slice(0, 8)}] ${b.grade_ar} - ${b.subject_ar}:`);
    console.log(`     Pages: ${pageCount} (Range: ${minPage}-${maxPage}) | Duplicates: ${hasDuplicatePages ? 'YES ❌' : '0 ✅'} | Gaps: ${missingPages.length === 0 ? '0 ✅' : missingPages.join(',')}`);
    console.log(`     Chunks: ${chunkCount} | Orphans (no chapter): ${chunksWithoutChapter} | Invalid Chapter Ref: ${chunksWithInvalidChapter} | Cross-curriculum: ${chunksWithMismatchedCurriculum}`);

    if (hasDuplicatePages || missingPages.length > 0 || chunksWithInvalidChapter > 0 || chunksWithMismatchedCurriculum > 0) {
      integrityIssues.push(`Book ${i + 1} (${b.id}) has integrity anomaly.`);
    }
  }

  // --- 4. DEEP INSPECTION OF BOOK 10 UNIT 4 ---
  console.log('\n--- 4. INSPECTION OF BOOK 10 UNIT 4 CONTENT/TITLE CONSISTENCY ---');
  // Let's inspect Book 10 from the ordering (both Prep 1 Social Studies and Prep 2 English, and baseline 10)
  // Baseline Book 10 was fa2a1525-c46f-4b34-9f48-b762be88e5c5 (Prep 1 Social Studies)
  // Our list Book 10 is 37bfa0c0-c4ce-419f-930a-000043d8d3f9 (Prep 2 English)
  
  const bSocial1 = await db.query(`SELECT * FROM book_chapters WHERE book_id = 'fa2a1525-c46f-4b34-9f48-b762be88e5c5' AND chapter_number = 4`);
  if (bSocial1.rows.length > 0) {
    const ch = bSocial1.rows[0];
    const chunkSample = await db.query(
      `SELECT content FROM book_chunks WHERE chapter_id = $1 LIMIT 2`,
      [ch.id]
    );
    console.log(`  [Social Studies Prep 1 - fa2a1525] Unit 4:`);
    console.log(`     Title: "${ch.title_ar}" | "${ch.title_en}" (p.${ch.start_page}-${ch.end_page})`);
    console.log(`     Sample chunk 1: ${(chunkSample.rows[0]?.content || '').slice(0, 150).replace(/\s+/g, ' ')}`);
  }

  const bEnglish2 = await db.query(`SELECT * FROM book_chapters WHERE book_id = '37bfa0c0-c4ce-419f-930a-000043d8d3f9' AND chapter_number = 4`);
  if (bEnglish2.rows.length > 0) {
    const ch = bEnglish2.rows[0];
    const chunkSample = await db.query(
      `SELECT content FROM book_chunks WHERE chapter_id = $1 LIMIT 2`,
      [ch.id]
    );
    console.log(`  [English Prep 2 - 37bfa0c0] Unit 4:`);
    console.log(`     Title: "${ch.title_ar}" | "${ch.title_en}" (p.${ch.start_page}-${ch.end_page})`);
    console.log(`     Sample chunk 1: ${(chunkSample.rows[0]?.content || '').slice(0, 150).replace(/\s+/g, ' ')}`);
  }

  // --- 5. PLATFORM INTEGRITY COMPARISON ---
  console.log('\n--- 5. PLATFORM INTEGRITY COUNTS ---');
  const counts = {
    users: Number((await db.query('SELECT count(*) as cnt FROM users')).rows[0].cnt),
    student_profiles: Number((await db.query('SELECT count(*) as cnt FROM student_profiles')).rows[0].cnt),
    ai_evaluations: Number((await db.query('SELECT count(*) as cnt FROM ai_evaluations')).rows[0].cnt),
    book_pdf_chunks: Number((await db.query('SELECT count(*) as cnt FROM book_pdf_chunks')).rows[0].cnt),
    book_pages: Number((await db.query('SELECT count(*) as cnt FROM book_pages')).rows[0].cnt),
    book_chunks: Number((await db.query('SELECT count(*) as cnt FROM book_chunks')).rows[0].cnt),
    book_chapters: Number((await db.query('SELECT count(*) as cnt FROM book_chapters')).rows[0].cnt),
    books: Number((await db.query('SELECT count(*) as cnt FROM books')).rows[0].cnt),
    exams: Number((await db.query('SELECT count(*) as cnt FROM exams')).rows[0].cnt),
    exam_questions: Number((await db.query('SELECT count(*) as cnt FROM exam_questions')).rows[0].cnt),
    exam_attempts: Number((await db.query('SELECT count(*) as cnt FROM exam_attempts')).rows[0].cnt),
    student_answers: Number((await db.query('SELECT count(*) as cnt FROM student_answers')).rows[0].cnt),
    question_banks: Number((await db.query('SELECT count(*) as cnt FROM question_banks')).rows[0].cnt),
    question_bank_items: Number((await db.query('SELECT count(*) as cnt FROM question_bank_items')).rows[0].cnt)
  };

  console.log(`  users: ${counts.users} (Target: 229) -> ${counts.users === 229 ? 'MATCH ✅' : 'FAIL ❌'}`);
  console.log(`  student_profiles: ${counts.student_profiles} (Target: 226) -> ${counts.student_profiles === 226 ? 'MATCH ✅' : 'FAIL ❌'}`);
  console.log(`  ai_evaluations: ${counts.ai_evaluations} (Target: 345) -> ${counts.ai_evaluations === 345 ? 'MATCH ✅' : 'FAIL ❌'}`);
  console.log(`  book_pdf_chunks: ${counts.book_pdf_chunks} (Target: 314) -> ${counts.book_pdf_chunks === 314 ? 'MATCH ✅' : 'FAIL ❌'}`);
  console.log(`  book_pages: ${counts.book_pages} (Target: 1594) -> ${counts.book_pages === 1594 ? 'MATCH ✅' : 'FAIL ❌'}`);
  console.log(`  book_chunks: ${counts.book_chunks} (Target: 1373) -> ${counts.book_chunks === 1373 ? 'MATCH ✅' : 'FAIL ❌'}`);
  console.log(`  book_chapters: ${counts.book_chapters} (Target: 54) -> ${counts.book_chapters === 54 ? 'MATCH ✅' : 'FAIL ❌'}`);
  console.log(`  books: ${counts.books} (Target: 13) -> ${counts.books === 13 ? 'MATCH ✅' : 'FAIL ❌'}`);
  console.log(`  exams: ${counts.exams}`);
  console.log(`  exam_questions: ${counts.exam_questions}`);
  console.log(`  exam_attempts: ${counts.exam_attempts}`);
  console.log(`  student_answers: ${counts.student_answers}`);
  console.log(`  question_banks: ${counts.question_banks}`);
  console.log(`  question_bank_items: ${counts.question_bank_items}`);

  fs.writeFileSync('scripts/final_read_only_audit_result.json', JSON.stringify({
    counts,
    bookChapterSummary,
    correctionsAllMatch,
    integrityIssues
  }, null, 2));

  console.log('\nAudit complete! Result saved to scripts/final_read_only_audit_result.json');
}

main().catch(console.error);
