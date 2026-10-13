import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';

async function main() {
  console.log('======================================================================');
  console.log('🔍 BATCH 3 COMPREHENSIVE MULTI-BOOK ACCEPTANCE VERIFICATION');
  console.log('======================================================================\n');

  // 1. Verify Books 1 to 8 Baseline
  console.log('--- 1. VERIFYING BOOKS 1-8 BASELINE INTEGRITY ---');
  const baseline = [
    { num: 1, id: 'd7bbfca2-6d8f-461b-8e39-2015981e86ec', p: 102, c: 101, title: 'English Prep 3' },
    { num: 2, id: 'f19276d3-4adb-4297-bb77-5ed87ba638b9', p: 113, c: 104, title: 'Social Studies Prep 3' },
    { num: 3, id: '19886434-1839-427d-af31-4c64fcf79525', p: 130, c: 128, title: 'Science Prep 2' },
    { num: 4, id: '81b8a308-7fcf-4938-8c45-aa0056624f32', p: 106, c: 98, title: 'Social Studies Prep 2' },
    { num: 5, id: '543f2746-460c-41c1-ba38-0933f479272f', p: 104, c: 97, title: 'Math Prep 2' },
    { num: 6, id: '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', p: 113, c: 87, title: 'English Prep 1' },
    { num: 7, id: 'bc6bb834-7192-474c-8507-c53265028b4e', p: 162, c: 142, title: 'Arabic Prep 2' },
    { num: 8, id: '37bfa0c0-c4ce-419f-930a-000043d8d3f9', p: 114, c: 86, title: 'English Prep 2' }
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

  // 2. Batch 3 Books (Books 9, 10, 11)
  console.log('\n--- 2. VERIFYING BATCH 3 BOOKS INTEGRITY ---');
  const batch3 = [
    { num: 9, id: '0758fc7a-c9b2-4e25-a32b-6cacb6bb418d', p: 142, u: 3, title: 'Arabic Prep 1 (اللغة العربية)' },
    { num: 10, id: 'fa2a1525-c46f-4b34-9f48-b762be88e5c5', p: 110, u: 4, title: 'Social Studies Prep 1 (الدراسات الاجتماعية)' },
    { num: 11, id: '808104ec-b861-434b-80c6-579f715d8bdf', p: 122, u: 4, title: 'Mathematics Prep 1 (الرياضيات لغات)' }
  ];

  let batch3Pass = true;
  for (const b of batch3) {
    const pRes = await db.query('SELECT count(*) as cnt FROM book_pages WHERE book_id = $1', [b.id]);
    const cRes = await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [b.id]);
    const uRes = await db.query('SELECT count(*) as cnt FROM book_chapters WHERE book_id = $1', [b.id]);
    const p = Number(pRes.rows[0].cnt);
    const c = Number(cRes.rows[0].cnt);
    const u = Number(uRes.rows[0].cnt);
    const ok = (p === b.p && u === b.u && c > 0);
    if (!ok) batch3Pass = false;
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

  const platformOk = (usersCount === 229 && profilesCount === 226 && evalsCount === 345 && pdfChunksCount === 314);
  console.log(`  users: ${usersCount}/229 -> ${usersCount === 229 ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`  student_profiles: ${profilesCount}/226 -> ${profilesCount === 226 ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`  ai_evaluations: ${evalsCount}/345 -> ${evalsCount === 345 ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`  book_pdf_chunks: ${pdfChunksCount}/314 -> ${pdfChunksCount === 314 ? 'PASSED ✅' : 'FAILED ❌'}`);

  const overall = baselinePass && batch3Pass && platformOk;
  console.log('\n======================================================================');
  console.log(`🏁 BATCH 3 OVERALL REGRESSION STATUS: ${overall ? 'ALL CHECKS PASSED ✅' : 'FAILED ❌'}`);
  console.log('======================================================================');

  process.exit(overall ? 0 : 1);
}

main().catch(console.error);
