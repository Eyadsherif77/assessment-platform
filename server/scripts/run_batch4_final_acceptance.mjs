import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  console.log('======================================================================');
  console.log('🔍 BATCH 4 COMPREHENSIVE MULTI-BOOK ACCEPTANCE VERIFICATION');
  console.log('======================================================================\n');

  // 1. Verify Books 1 to 11 Baseline
  console.log('--- 1. VERIFYING BOOKS 1-11 BASELINE INTEGRITY ---');
  const baseline = [
    { num: 1, id: 'd7bbfca2-6d8f-461b-8e39-2015981e86ec', p: 102, c: 101, title: 'English Prep 3' },
    { num: 2, id: 'f19276d3-4adb-4297-bb77-5ed87ba638b9', p: 113, c: 104, title: 'Social Studies Prep 3' },
    { num: 3, id: '19886434-1839-427d-af31-4c64fcf79525', p: 130, c: 128, title: 'Science Prep 2' },
    { num: 4, id: '81b8a308-7fcf-4938-8c45-aa0056624f32', p: 106, c: 98, title: 'Social Studies Prep 2' },
    { num: 5, id: '543f2746-460c-41c1-ba38-0933f479272f', p: 104, c: 97, title: 'Math Prep 2' },
    { num: 6, id: '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', p: 113, c: 87, title: 'English Prep 1' },
    { num: 7, id: 'bc6bb834-7192-474c-8507-c53265028b4e', p: 162, c: 142, title: 'Arabic Prep 2' },
    { num: 8, id: '37bfa0c0-c4ce-419f-930a-000043d8d3f9', p: 114, c: 86, title: 'English Prep 2' },
    { num: 9, id: '0758fc7a-c9b2-4e25-a32b-6cacb6bb418d', p: 142, c: 119, title: 'Arabic Prep 1' },
    { num: 10, id: 'fa2a1525-c46f-4b34-9f48-b762be88e5c5', p: 110, c: 90, title: 'Social Studies Prep 1' },
    { num: 11, id: '808104ec-b861-434b-80c6-579f715d8bdf', p: 122, c: 104, title: 'Math Prep 1' }
  ];

  let baselinePass = true;
  for (const b of baseline) {
    const pRes = await db.query('SELECT count(*) as cnt FROM book_pages WHERE book_id = $1', [b.id]);
    const cRes = await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [b.id]);
    const p = Number(pRes.rows[0].cnt);
    const c = Number(cRes.rows[0].cnt);
    const ok = (p === b.p && c === b.c);
    if (!ok) baselinePass = false;
    console.log(`  Book ${b.num} [${b.title}]: Pages ${p}/${b.p}, Chunks ${c}/${b.c} -> ${ok ? 'PASSED ✅' : 'FAILED ❌'}`);
  }

  // 2. Batch 4 Books (Books 12 and 13)
  console.log('\n--- 2. VERIFYING BATCH 4 BOOKS INTEGRITY ---');
  const batch4 = [
    { num: 12, id: '013411b8-edec-477b-bd42-3dbdda9fb6a9', p: 162, u: 3, c: 134, title: 'Arabic Prep 3 (اللغة العربية)' },
    { num: 13, id: '9e702109-7d92-445c-b814-567c1f6cba49', p: 114, u: 6, title: 'English Prep 3 (New Hello)' }
  ];

  let batch4Pass = true;
  for (const b of batch4) {
    const pRes = await db.query('SELECT count(*) as cnt FROM book_pages WHERE book_id = $1', [b.id]);
    const cRes = await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [b.id]);
    const uRes = await db.query('SELECT count(*) as cnt FROM book_chapters WHERE book_id = $1', [b.id]);
    const p = Number(pRes.rows[0].cnt);
    const c = Number(cRes.rows[0].cnt);
    const u = Number(uRes.rows[0].cnt);
    const ok = (p === b.p && u === b.u && c > 0);
    if (!ok) batch4Pass = false;
    console.log(`  Book ${b.num} [${b.title}]: Pages ${p}/${b.p}, Units ${u}/${b.u}, Chunks ${c} -> ${ok ? 'PASSED ✅' : 'FAILED ❌'}`);
  }

  // 3. User & Assessment Integrity
  console.log('\n--- 3. VERIFYING PLATFORM DATA INTEGRITY ---');
  const usersRes = await db.query('SELECT count(*) as cnt FROM users');
  const profilesRes = await db.query('SELECT count(*) as cnt FROM student_profiles');
  const evalsRes = await db.query('SELECT count(*) as cnt FROM ai_evaluations');
  const pdfChunksRes = await db.query('SELECT count(*) as cnt FROM book_pdf_chunks');

  const usersCount = Number(usersRes.rows[0].cnt);
  const profilesCount = Number(profilesRes.rows[0].cnt);
  const evalsCount = Number(evalsRes.rows[0].cnt);
  const pdfChunksCount = Number(pdfChunksRes.rows[0].cnt);

  const platformOk = (usersCount === 229 && profilesCount === 226 && evalsCount === 0 && pdfChunksCount === 314);
  console.log(`  users: ${usersCount}/229 -> ${usersCount === 229 ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`  student_profiles: ${profilesCount}/226 -> ${profilesCount === 226 ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`  ai_evaluations: ${evalsCount}/0 (clean-slate reset) -> ${evalsCount === 0 ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`  book_pdf_chunks: ${pdfChunksCount}/314 -> ${pdfChunksCount === 314 ? 'PASSED ✅' : 'FAILED ❌'}`);

  // 4. Scope verification: total books in platform is exactly 13
  console.log('\n--- 4. SCOPE BOUNDARY VERIFICATION ---');
  const totalBooksRes = await db.query('SELECT count(*) as cnt FROM books');
  const totalBooks = Number(totalBooksRes.rows[0].cnt);
  console.log(`  Total books in platform: ${totalBooks}/13 -> ${totalBooks === 13 ? 'VERIFIED (No Book 14 exists) ✅' : 'FAILED ❌'}`);

  const overall = baselinePass && batch4Pass && platformOk && (totalBooks === 13);
  console.log('\n======================================================================');
  console.log(`🏁 BATCH 4 OVERALL REGRESSION STATUS: ${overall ? 'ALL CHECKS PASSED ✅' : 'FAILED ❌'}`);
  console.log('======================================================================');

  process.exit(overall ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal regression check error:', err);
  process.exit(1);
});
