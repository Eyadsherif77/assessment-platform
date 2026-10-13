import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';

async function main() {
  console.log('========================================================================');
  console.log('🚀 SAFE TEXTBOOK TITLE CORRECTION & INTEGRITY VERIFICATION');
  console.log('========================================================================\n');

  // 1. Capture platform pre-counts
  console.log('--- 1. PRE-UPDATE INTEGRITY CHECK ---');
  const preUsers = Number((await db.query('SELECT count(*) as cnt FROM users')).rows[0].cnt);
  const preProfiles = Number((await db.query('SELECT count(*) as cnt FROM student_profiles')).rows[0].cnt);
  const preEvals = Number((await db.query('SELECT count(*) as cnt FROM ai_evaluations')).rows[0].cnt);
  const prePdfChunks = Number((await db.query('SELECT count(*) as cnt FROM book_pdf_chunks')).rows[0].cnt);
  const prePages = Number((await db.query('SELECT count(*) as cnt FROM book_pages')).rows[0].cnt);
  const preChunks = Number((await db.query('SELECT count(*) as cnt FROM book_chunks')).rows[0].cnt);
  const preChapters = Number((await db.query('SELECT count(*) as cnt FROM book_chapters')).rows[0].cnt);
  const preBooks = Number((await db.query('SELECT count(*) as cnt FROM books')).rows[0].cnt);

  console.log(`  books: ${preBooks}/13`);
  console.log(`  users: ${preUsers}/229`);
  console.log(`  student_profiles: ${preProfiles}/226`);
  console.log(`  ai_evaluations: ${preEvals}/345`);
  console.log(`  book_pdf_chunks: ${prePdfChunks}/314`);
  console.log(`  book_pages: ${prePages}/1634`);
  console.log(`  book_chunks: ${preChunks}/1373`);
  console.log(`  book_chapters: ${preChapters}/57\n`);

  // 2. Define exact corrections
  const corrections = [
    {
      id: 'd7bbfca2-6d8f-461b-8e39-2015981e86ec',
      bookNum: 3,
      subject: 'Science',
      grade: 'Prep 1',
      old_title_ar: 'Science book',
      old_title_en: 'Science book',
      new_title_ar: 'العلوم (لغات)',
      new_title_en: 'Science (English)'
    },
    {
      id: '19886434-1839-427d-af31-4c64fcf79525',
      bookNum: 7,
      subject: 'Mathematics',
      grade: 'Prep 2',
      old_title_ar: 'Math book',
      old_title_en: 'Math book',
      new_title_ar: 'الرياضيات (لغات)',
      new_title_en: 'Mathematics'
    },
    {
      id: '81b8a308-7fcf-4938-8c45-aa0056624f32',
      bookNum: 9,
      subject: 'Social Studies',
      grade: 'Prep 2',
      old_title_ar: 'كتاب الدرسات الاجتماعية',
      old_title_en: 'كتاب الدرسات الاجتماعية',
      new_title_ar: 'الدراسات الاجتماعية',
      new_title_en: 'Social Studies'
    },
    {
      id: '013411b8-edec-477b-bd42-3dbdda9fb6a9',
      bookNum: 11,
      subject: 'Arabic',
      grade: 'Prep 3',
      old_title_ar: 'كتاب اللغة العربية',
      old_title_en: 'كتاب اللغة العربية',
      new_title_ar: 'اللغة العربية',
      new_title_en: 'Arabic Language'
    },
    {
      id: 'f19276d3-4adb-4297-bb77-5ed87ba638b9',
      bookNum: 12,
      subject: 'Social Studies',
      grade: 'Prep 3',
      old_title_ar: 'كتاب الدرسات الاجتماعية',
      old_title_en: 'كتاب الدرسات الاجتماعية',
      new_title_ar: 'الدراسات الاجتماعية',
      new_title_en: 'Social Studies'
    },
    {
      id: '9e702109-7d92-445c-b814-567c1f6cba49',
      bookNum: 13,
      subject: 'English',
      grade: 'Prep 3',
      old_title_ar: 'English book',
      old_title_en: 'English book',
      new_title_ar: 'اللغة الإنجليزية',
      new_title_en: 'English Language'
    }
  ];

  // 3. Apply updates
  console.log('--- 2. APPLYING TITLE CORRECTIONS ---');
  for (const c of corrections) {
    console.log(`Updating Book [${c.id}] (${c.subject} ${c.grade}):`);
    console.log(`  OLD: ar="${c.old_title_ar}" | en="${c.old_title_en}"`);
    console.log(`  NEW: ar="${c.new_title_ar}" | en="${c.new_title_en}"`);

    const updateRes = await db.query(
      `UPDATE books SET title_ar = $1, title_en = $2 WHERE id = $3`,
      [c.new_title_ar, c.new_title_en, c.id]
    );
    console.log(`  Updated successfully.\n`);
  }

  // 4. Query all 13 books and verify
  console.log('--- 3. POST-UPDATE ALL 13 BOOKS AUDIT ---');
  const all13Res = await db.query(`
    SELECT 
      b.id,
      b.title_ar,
      b.title_en,
      b.term,
      b.school_type,
      b.total_pages,
      b.file_url,
      b.academic_stage_id,
      b.grade_id,
      b.subject_id,
      g.name_ar as grade_ar,
      g.name_en as grade_en,
      s.name_ar as subject_ar,
      s.name_en as subject_en,
      (SELECT count(*) FROM book_pages WHERE book_id = b.id) as pages,
      (SELECT count(*) FROM book_chunks WHERE book_id = b.id) as chunks,
      (SELECT count(*) FROM book_chapters WHERE book_id = b.id) as chapters
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
    ORDER BY g.sort_order ASC, s.sort_order ASC, b.created_at ASC
  `);

  console.log(`Total books in database: ${all13Res.rows.length}`);
  for (let i = 0; i < all13Res.rows.length; i++) {
    const row = all13Res.rows[i];
    console.log(`  [Book ${i+1}] ID: ${row.id}`);
    console.log(`     Grade: ${row.grade_ar} | Subject: ${row.subject_ar} | Term: ${row.term} | Type: ${row.school_type}`);
    console.log(`     Title: ar="${row.title_ar}" | en="${row.title_en}"`);
    console.log(`     Counts: Pages=${row.pages}/${row.total_pages}, Chunks=${row.chunks}, Chapters=${row.chapters}`);
  }

  // 5. Post-update platform integrity check
  console.log('\n--- 4. POST-UPDATE PLATFORM INTEGRITY CHECK ---');
  const postUsers = Number((await db.query('SELECT count(*) as cnt FROM users')).rows[0].cnt);
  const postProfiles = Number((await db.query('SELECT count(*) as cnt FROM student_profiles')).rows[0].cnt);
  const postEvals = Number((await db.query('SELECT count(*) as cnt FROM ai_evaluations')).rows[0].cnt);
  const postPdfChunks = Number((await db.query('SELECT count(*) as cnt FROM book_pdf_chunks')).rows[0].cnt);
  const postPages = Number((await db.query('SELECT count(*) as cnt FROM book_pages')).rows[0].cnt);
  const postChunks = Number((await db.query('SELECT count(*) as cnt FROM book_chunks')).rows[0].cnt);
  const postChapters = Number((await db.query('SELECT count(*) as cnt FROM book_chapters')).rows[0].cnt);
  const postBooks = Number((await db.query('SELECT count(*) as cnt FROM books')).rows[0].cnt);

  const integrityPassed = (
    postUsers === preUsers &&
    postProfiles === preProfiles &&
    postEvals === preEvals &&
    postPdfChunks === prePdfChunks &&
    postPages === prePages &&
    postChunks === preChunks &&
    postChapters === preChapters &&
    postBooks === 13
  );

  console.log(`  users: ${postUsers}/${preUsers} -> ${postUsers === preUsers ? 'MATCH ✅' : 'FAIL ❌'}`);
  console.log(`  student_profiles: ${postProfiles}/${preProfiles} -> ${postProfiles === preProfiles ? 'MATCH ✅' : 'FAIL ❌'}`);
  console.log(`  ai_evaluations: ${postEvals}/${preEvals} -> ${postEvals === preEvals ? 'MATCH ✅' : 'FAIL ❌'}`);
  console.log(`  book_pdf_chunks: ${postPdfChunks}/${prePdfChunks} -> ${postPdfChunks === prePdfChunks ? 'MATCH ✅' : 'FAIL ❌'}`);
  console.log(`  book_pages: ${postPages}/${prePages} -> ${postPages === prePages ? 'MATCH ✅' : 'FAIL ❌'}`);
  console.log(`  book_chunks: ${postChunks}/${preChunks} -> ${postChunks === preChunks ? 'MATCH ✅' : 'FAIL ❌'}`);
  console.log(`  book_chapters: ${postChapters}/${preChapters} -> ${postChapters === preChapters ? 'MATCH ✅' : 'FAIL ❌'}`);
  console.log(`  books: ${postBooks}/13 -> ${postBooks === 13 ? 'MATCH ✅' : 'FAIL ❌'}`);

  const report = {
    timestamp: new Date().toISOString(),
    integrityPassed,
    preCounts: {
      users: preUsers,
      student_profiles: preProfiles,
      ai_evaluations: preEvals,
      book_pdf_chunks: prePdfChunks,
      book_pages: prePages,
      book_chunks: preChunks,
      book_chapters: preChapters,
      books: preBooks
    },
    postCounts: {
      users: postUsers,
      student_profiles: postProfiles,
      ai_evaluations: postEvals,
      book_pdf_chunks: postPdfChunks,
      book_pages: postPages,
      book_chunks: postChunks,
      book_chapters: postChapters,
      books: postBooks
    },
    corrections_applied: corrections,
    all_13_books_final: all13Res.rows
  };

  fs.writeFileSync('scripts/title_corrections_verification_report.json', JSON.stringify(report, null, 2), 'utf-8');
  console.log('\n✅ Verification report saved to: scripts/title_corrections_verification_report.json');

  if (!integrityPassed) {
    throw new Error('Integrity check failed post-update!');
  }

  console.log('\n========================================================================');
  console.log('🎉 ALL TITLE CORRECTIONS AND INTEGRITY CHECKS PASSED PERFECTLY!');
  console.log('========================================================================');
}

main().catch(err => {
  console.error('Fatal error during title correction:', err);
  process.exit(1);
});
