import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { aiRagEngine } from '../dist/services/ai/aiRagEngine.js';
import crypto from 'crypto';

const B9_ID = '0758fc7a-c9b2-4e25-a32b-6cacb6bb418d';
const B10_ID = 'fa2a1525-c46f-4b34-9f48-b762be88e5c5';
const B11_ID = '808104ec-b861-434b-80c6-579f715d8bdf';

async function main() {
  console.log('========================================================================');
  console.log('🔬 BATCH 3 — COMPREHENSIVE READ-ONLY DEEP QUALITY REVIEW');
  console.log('========================================================================\n');

  const report = {};

  // ---------------------------------------------------------------------------
  // 1. DATABASE & SNAPSHOT RECONCILIATION (STRICT READ-ONLY)
  // ---------------------------------------------------------------------------
  console.log('--- 1. DATABASE INTEGRITY & SNAPSHOT RECONCILIATION ---');
  const snapFiles = fs.readdirSync('backups').filter(f => f.startsWith('snapshot_'));
  const snap9 = snapFiles.find(f => f.includes(B9_ID));
  const snap10 = snapFiles.find(f => f.includes(B10_ID));
  const snap11 = snapFiles.find(f => f.includes(B11_ID));

  console.log(`Snapshot 9: ${snap9}`);
  console.log(`Snapshot 10: ${snap10}`);
  console.log(`Snapshot 11: ${snap11}`);

  const books1to8Baseline = [
    { num: 1, id: 'd7bbfca2-6d8f-461b-8e39-2015981e86ec', p: 102, c: 101 },
    { num: 2, id: 'f19276d3-4adb-4297-bb77-5ed87ba638b9', p: 113, c: 104 },
    { num: 3, id: '19886434-1839-427d-af31-4c64fcf79525', p: 130, c: 128 },
    { num: 4, id: '81b8a308-7fcf-4938-8c45-aa0056624f32', p: 106, c: 98 },
    { num: 5, id: '543f2746-460c-41c1-ba38-0933f479272f', p: 104, c: 97 },
    { num: 6, id: '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', p: 113, c: 87 },
    { num: 7, id: 'bc6bb834-7192-474c-8507-c53265028b4e', p: 162, c: 142 },
    { num: 8, id: '37bfa0c0-c4ce-419f-930a-000043d8d3f9', p: 114, c: 86 }
  ];

  let b1to8Match = true;
  for (const b of books1to8Baseline) {
    const p = Number((await db.query('SELECT count(*) as cnt FROM book_pages WHERE book_id = $1', [b.id])).rows[0].cnt);
    const c = Number((await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [b.id])).rows[0].cnt);
    if (p !== b.p || c !== b.c) b1to8Match = false;
  }
  console.log(`Books 1-8 Baseline Integrity: ${b1to8Match ? 'UNMODIFIED ✅' : 'MODIFIED ❌'}`);

  const usersCount = Number((await db.query('SELECT count(*) as cnt FROM users')).rows[0].cnt);
  const profilesCount = Number((await db.query('SELECT count(*) as cnt FROM student_profiles')).rows[0].cnt);
  const evalsCount = Number((await db.query('SELECT count(*) as cnt FROM ai_evaluations')).rows[0].cnt);
  const pdfChunksCount = Number((await db.query('SELECT count(*) as cnt FROM book_pdf_chunks')).rows[0].cnt);
  const platformUntouched = (usersCount === 229 && profilesCount === 226 && evalsCount === 345 && pdfChunksCount === 314);
  console.log(`Platform Core Tables: ${platformUntouched ? 'UNTOUCHED ✅' : 'MODIFIED ❌'} (users: ${usersCount}, profiles: ${profilesCount}, evals: ${evalsCount}, pdf_chunks: ${pdfChunksCount})`);

  // ---------------------------------------------------------------------------
  // 2. DETAILED BOOK PAGE & CURRICULUM INSPECTION
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. BOOK 9 (ARABIC PREP 1) CURRICULUM & FIDELITY AUDIT ---');
  const b9Pages = (await db.query('SELECT page_number, char_count, SUBSTRING(raw_text, 1, 150) as snip FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC', [B9_ID])).rows;
  const b9Chunks = (await db.query('SELECT chapter_id, page_number, SUBSTRING(content, 1, 100) as snip FROM book_chunks WHERE book_id = $1 ORDER BY page_number ASC', [B9_ID])).rows;
  const b9Chaps = (await db.query('SELECT id, chapter_number, title_ar, title_en FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC', [B9_ID])).rows;

  console.log(`Book 9 Total Pages: ${b9Pages.length}, Total Chunks: ${b9Chunks.length}, Chapters: ${b9Chaps.length}`);
  const b9LowTextPages = b9Pages.filter(p => Number(p.char_count) < 60);
  console.log(`Book 9 Low-Text Pages (<60 chars): ${b9LowTextPages.length}`);
  b9LowTextPages.forEach(p => console.log(`  Page ${p.page_number} (${p.char_count} chars): "${p.snip.replace(/\n/g, ' ')}"`));

  // Sample specific pages: begin, mid, end of each unit
  const b9SamplePages = [1, 10, 11, 30, 50, 51, 70, 92, 93, 110, 129, 130, 142];
  console.log('Book 9 Inspected Sample Pages:');
  for (const pNum of b9SamplePages) {
    const p = b9Pages.find(x => x.page_number === pNum);
    console.log(`  P.${pNum} [${p?.char_count}c]: "${p?.snip.replace(/\n/g, ' ')}..."`);
  }

  console.log('\n--- 3. BOOK 10 (SOCIAL STUDIES PREP 1) CURRICULUM & FIDELITY AUDIT ---');
  const b10Pages = (await db.query('SELECT page_number, char_count, SUBSTRING(raw_text, 1, 150) as snip FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC', [B10_ID])).rows;
  const b10Chunks = (await db.query('SELECT chapter_id, page_number, SUBSTRING(content, 1, 100) as snip FROM book_chunks WHERE book_id = $1 ORDER BY page_number ASC', [B10_ID])).rows;
  const b10Chaps = (await db.query('SELECT id, chapter_number, title_ar, title_en FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC', [B10_ID])).rows;

  console.log(`Book 10 Total Pages: ${b10Pages.length}, Total Chunks: ${b10Chunks.length}, Chapters: ${b10Chaps.length}`);
  const b10LowTextPages = b10Pages.filter(p => Number(p.char_count) < 60);
  console.log(`Book 10 Low-Text Pages (<60 chars): ${b10LowTextPages.length}`);
  b10LowTextPages.forEach(p => console.log(`  Page ${p.page_number} (${p.char_count} chars): "${p.snip.replace(/\n/g, ' ')}"`));

  const b10SamplePages = [1, 6, 7, 18, 29, 30, 40, 51, 52, 65, 79, 80, 88, 96, 97, 110];
  console.log('Book 10 Inspected Sample Pages:');
  for (const pNum of b10SamplePages) {
    const p = b10Pages.find(x => x.page_number === pNum);
    console.log(`  P.${pNum} [${p?.char_count}c]: "${p?.snip.replace(/\n/g, ' ')}..."`);
  }

  console.log('\n--- 4. BOOK 11 (MATHEMATICS PREP 1) CURRICULUM & MATHEMATICAL FIDELITY AUDIT ---');
  const b11Pages = (await db.query('SELECT page_number, char_count, SUBSTRING(raw_text, 1, 150) as snip FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC', [B11_ID])).rows;
  const b11Chunks = (await db.query('SELECT chapter_id, page_number, SUBSTRING(content, 1, 100) as snip FROM book_chunks WHERE book_id = $1 ORDER BY page_number ASC', [B11_ID])).rows;
  const b11Chaps = (await db.query('SELECT id, chapter_number, title_ar, title_en FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC', [B11_ID])).rows;

  console.log(`Book 11 Total Pages: ${b11Pages.length}, Total Chunks: ${b11Chunks.length}, Chapters: ${b11Chaps.length}`);
  const b11LowTextPages = b11Pages.filter(p => Number(p.char_count) < 60);
  console.log(`Book 11 Low-Text Pages (<60 chars): ${b11LowTextPages.length}`);
  b11LowTextPages.forEach(p => console.log(`  Page ${p.page_number} (${p.char_count} chars): "${p.snip.replace(/\n/g, ' ')}"`));

  const b11SamplePages = [1, 7, 8, 23, 38, 39, 46, 53, 54, 65, 75, 76, 94, 111, 112, 122];
  console.log('Book 11 Inspected Sample Pages:');
  for (const pNum of b11SamplePages) {
    const p = b11Pages.find(x => x.page_number === pNum);
    console.log(`  P.${pNum} [${p?.char_count}c]: "${p?.snip.replace(/\n/g, ' ')}..."`);
  }

  // Math-specific deep inspection on key pages
  console.log('\n--- 5. MATHEMATICS EQUATION & NOTATION DEEP SAMPLES (BOOK 11) ---');
  const mathTargetPages = [9, 15, 20, 27, 41, 45, 50, 54, 62, 76, 85, 95, 103];
  const mathDetailRows = (await db.query(
    `SELECT page_number, raw_text FROM book_pages WHERE book_id = $1 AND page_number IN (${mathTargetPages.join(',')}) ORDER BY page_number ASC`,
    [B11_ID]
  )).rows;

  for (const row of mathDetailRows) {
    console.log(`\n=== PAGE ${row.page_number} MATH SAMPLES ===`);
    const lines = row.raw_text.split('\n').filter(l => l.trim().length > 0).slice(0, 7);
    lines.forEach(l => console.log(`  | ${l.trim()}`));
  }

  // ---------------------------------------------------------------------------
  // 6. AI RETRIEVAL AND GROUNDING EXPERIMENTS (READ-ONLY)
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. AI RETRIEVAL & GROUNDING TESTS ---');

  const b9Row = (await db.query('SELECT * FROM books WHERE id = $1', [B9_ID])).rows[0];
  const b10Row = (await db.query('SELECT * FROM books WHERE id = $1', [B10_ID])).rows[0];
  const b11Row = (await db.query('SELECT * FROM books WHERE id = $1', [B11_ID])).rows[0];

  console.log(`Book 9 Metadata: Stage ${b9Row.academic_stage_id}, Grade ${b9Row.grade_id}, Subject ${b9Row.subject_id}`);
  console.log(`Book 10 Metadata: Stage ${b10Row.academic_stage_id}, Grade ${b10Row.grade_id}, Subject ${b10Row.subject_id}`);
  console.log(`Book 11 Metadata: Stage ${b11Row.academic_stage_id}, Grade ${b11Row.grade_id}, Subject ${b11Row.subject_id}`);

  // Book 9 Retrieval Tests
  console.log('\n>> Book 9 Supported & Negative Tests:');
  const b9Tests = [
    { name: 'Unit 1 Supported: مهد العلم أحمد زويل ومصر', chId: b9Chaps[0].id, q: 'مصر مهد العلم أحمد زويل والبطل أحمد منسي ووجه الوطن' },
    { name: 'Unit 2 Supported: العقاد ومحمد صلاح', chId: b9Chaps[1].id, q: 'أشياء صنعت مني كاتبا للعقاد وبطولات محمد صلاح وشباب اليوم صناع الغد' },
    { name: 'Unit 3 Supported: دروس من الحياة وابن النفيس', chId: b9Chaps[2].id, q: 'دروس من الحياة ورحمة تداوي وعلم يضيء ابن النفيس ودعاء شاعرة' },
    { name: 'Unit 1 Negative: Treaty of Hudaybiyyah (Islamic History Prep 2)', chId: b9Chaps[0].id, q: 'بنود صلح الحديبية وبيعة الرضوان والدروس المستفادة' },
    { name: 'Unit 2 Negative: Newton Laws of Motion (Science)', chId: b9Chaps[1].id, q: 'قانون نيوتن الأول للقصور الذاتي وقوة رد الفعل والتسارع' }
  ];

  for (const t of b9Tests) {
    const res = await aiRagEngine.retrieveGroundedChunks({
      academicStageId: b9Row.academic_stage_id,
      gradeId: b9Row.grade_id,
      subjectId: b9Row.subject_id,
      bookId: B9_ID,
      chapterId: t.chId,
      queryText: t.q,
      limit: 3
    });
    console.log(`  * ${t.name}: Retrieved ${res.length} chunks (Pages: [${res.map(r => r.page_number).join(', ')}])`);
    if (res.length > 0) {
      console.log(`    Sample chunk snippet: "${res[0].content.substring(0, 100).replace(/\n/g, ' ')}..."`);
    }
  }

  // Book 10 Retrieval Tests
  console.log('\n>> Book 10 Supported & Negative Tests:');
  const b10Tests = [
    { name: 'Unit 1 Supported: ملامح إفريقيا الطبيعية ونهر النيل', chId: b10Chaps[0].id, q: 'الموقع والكشوف الجغرافية ومظاهر السطح ونهر النيل في إفريقيا' },
    { name: 'Unit 2 Supported: الدولة القديمة والوسطى وبناة الأهرام', chId: b10Chaps[1].id, q: 'عصر الدولة القديمة وبناة الأهرام والدولة الوسطى والحديثة' },
    { name: 'Unit 3 Supported: النظم البيئية والغابات في إفريقيا', chId: b10Chaps[2].id, q: 'نظم الغابات الاستوائية والمدارية ونظم الحشائش والنظم البيئية المائية في إفريقيا' },
    { name: 'Unit 4 Supported: انتشار الإسلام في إفريقيا ودور مصر', chId: b10Chaps[3].id, q: 'انتشار الإسلام في إفريقيا ودور مصر الحضاري خلال العصور الوسطى' },
    { name: 'Unit 1 Negative: July 1952 Revolution (Prep 3 Social)', chId: b10Chaps[0].id, q: 'قوانين الإصلاح الزراعي وتأميم قناة السويس وحصار قصر عابدين' },
    { name: 'Unit 4 Negative: Battle of Hattin (Prep 2 Islamic History)', chId: b10Chaps[3].id, q: 'معركة حطين وصلاح الدين الأيوبي وتحرير بيت المقدس من الصليبيين' }
  ];

  for (const t of b10Tests) {
    const res = await aiRagEngine.retrieveGroundedChunks({
      academicStageId: b10Row.academic_stage_id,
      gradeId: b10Row.grade_id,
      subjectId: b10Row.subject_id,
      bookId: B10_ID,
      chapterId: t.chId,
      queryText: t.q,
      limit: 3
    });
    console.log(`  * ${t.name}: Retrieved ${res.length} chunks (Pages: [${res.map(r => r.page_number).join(', ')}])`);
    if (res.length > 0) {
      console.log(`    Sample chunk snippet: "${res[0].content.substring(0, 100).replace(/\n/g, ' ')}..."`);
    }
  }

  // Book 11 Retrieval Tests
  console.log('\n>> Book 11 Supported & Negative Tests:');
  const b11Tests = [
    { name: 'Unit 1 Supported: Proportions & Medal Alloys', chId: b11Chaps[0].id, q: 'Ratio and proportion and operations on rational numbers and sets' },
    { name: 'Unit 2 Supported: Algebraic Expressions & Equations', chId: b11Chaps[1].id, q: 'Mathematical expressions and formulas and linear equations' },
    { name: 'Unit 3 Supported: Organizing Data Stem-and-leaf Frequency Table', chId: b11Chaps[2].id, q: 'Organizing data and arithmetic mean and pie charts in statistics' },
    { name: 'Unit 4 Supported: Angles Parallelogram Quadrilateral', chId: b11Chaps[3].id, q: 'Parallelism, triangles, quadrilaterals, polygons, and coordinates in geometry' },
    { name: 'Unit 1 Negative: Pythagorean Theorem (Prep 2)', chId: b11Chaps[0].id, q: 'hypotenuse right angled triangle square of the sides Pythagoras theorem' },
    { name: 'Unit 2 Negative: Quadratic Formula (Prep 3)', chId: b11Chaps[1].id, q: 'quadratic equation roots formula -b plus minus square root b^2 - 4ac over 2a' }
  ];

  for (const t of b11Tests) {
    const res = await aiRagEngine.retrieveGroundedChunks({
      academicStageId: b11Row.academic_stage_id,
      gradeId: b11Row.grade_id,
      subjectId: b11Row.subject_id,
      bookId: B11_ID,
      chapterId: t.chId,
      queryText: t.q,
      limit: 3
    });
    console.log(`  * ${t.name}: Retrieved ${res.length} chunks (Pages: [${res.map(r => r.page_number).join(', ')}])`);
    if (res.length > 0) {
      console.log(`    Sample chunk snippet: "${res[0].content.substring(0, 100).replace(/\n/g, ' ')}..."`);
    }
  }

  // ---------------------------------------------------------------------------
  // 7. QUESTION PROVENANCE VALIDATION TESTS (SUPPORTED VS UNSUPPORTED)
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. STRICT PROVENANCE & QUESTION GROUNDING TESTS ---');
  const { verifyQuestionProvenance } = await import('../dist/services/ai/aiRagEngine.js');

  // Check where Zewail appears in Book 9
  const zewailPageRes = (await db.query(
    "SELECT page_number, SUBSTRING(raw_text, 1, 150) as snip FROM book_pages WHERE book_id = $1 AND raw_text LIKE '%زويل%' LIMIT 3",
    [B9_ID]
  )).rows;
  console.log('Book 9 Zewail Pages:', zewailPageRes);

  const zewailPNum = zewailPageRes[0]?.page_number || 14;

  const provenanceCases = [
    {
      bookId: B9_ID,
      bookName: 'Book 9 (Arabic Prep 1)',
      type: 'SUPPORTED',
      q: {
        page_reference: zewailPNum,
        question_text: 'ما اسم العالم المصري الحائز على نوبل وصاحب إنجاز الفيمتو ثانية والمذكور في درس مهد العلم؟',
        options: [{ id: '1', text: 'أحمد زويل', is_correct: true }, { id: '2', text: 'مجدي يعقوب', is_correct: false }]
      }
    },
    {
      bookId: B9_ID,
      bookName: 'Book 9 (Arabic Prep 1)',
      type: 'UNSUPPORTED (Foreign syllabus - Battle of Ain Jalut)',
      q: {
        page_reference: 12,
        question_text: 'من هو القائد المسلم الذي انتصر على المغول في معركة عين جالوت التاريخية؟',
        options: [{ id: '1', text: 'سيف الدين قطز', is_correct: true }, { id: '2', text: 'صلاح الدين', is_correct: false }]
      }
    },
    {
      bookId: B10_ID,
      bookName: 'Book 10 (Social Prep 1)',
      type: 'SUPPORTED',
      q: {
        page_reference: 40,
        question_text: 'من هو الملك المصري الذي بدأ النضال الحقيقي لتحرير البلاد من الهكسوس وسانده شعبه؟',
        options: [{ id: '1', text: 'الملك سقنن رع الثاني', is_correct: true }, { id: '2', text: 'رمسيس الثاني', is_correct: false }]
      }
    },
    {
      bookId: B10_ID,
      bookName: 'Book 10 (Social Prep 1)',
      type: 'UNSUPPORTED (Foreign syllabus - 1952 Revolution)',
      q: {
        page_reference: 40,
        question_text: 'ما هو التاريخ الدقيق لتوقيع اتفاقية الجلاء للقوات البريطانية عن مصر؟',
        options: [{ id: '1', text: 'أكتوبر 1954', is_correct: true }, { id: '2', text: 'يوليو 1952', is_correct: false }]
      }
    },
    {
      bookId: B11_ID,
      bookName: 'Book 11 (Math Prep 1)',
      type: 'SUPPORTED',
      q: {
        page_reference: 20,
        question_text: 'Medals are made of bronze alloy consisting of copper, tin, and zinc in what ratio for 425 grams mass?',
        options: [{ id: '1', text: '1/5 : 1/18 : 1/45', is_correct: true }, { id: '2', text: '1/2 : 1/3 : 1/4', is_correct: false }]
      }
    },
    {
      bookId: B11_ID,
      bookName: 'Book 11 (Math Prep 1)',
      type: 'UNSUPPORTED (Foreign syllabus - Pythagorean Theorem)',
      q: {
        page_reference: 20,
        question_text: 'Calculate the hypotenuse of a right triangle with legs 3 and 4 using Pythagoras theorem.',
        options: [{ id: '1', text: 'hypotenuse length 5', is_correct: true }, { id: '2', text: 'length 7', is_correct: false }]
      }
    }
  ];

  for (const c of provenanceCases) {
    const prov = await verifyQuestionProvenance(c.q, c.bookId);
    console.log(`  [${c.bookName}] [${c.type}]: Verified = ${prov.isVerified}${prov.reason ? ' (Reason: ' + prov.reason + ')' : ''}`);
  }

  console.log('\n========================================================================');
  console.log('✅ READ-ONLY AUDIT COMPLETE — ZERO MUTATIONS OCCURRED');
  console.log('========================================================================');
}

main().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
