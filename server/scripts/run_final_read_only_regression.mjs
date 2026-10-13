import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import { verifyQuestionProvenance } from '../dist/services/ai/aiRagEngine.js';

const bookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9';

async function runRegression() {
  console.log('======================================================================');
  console.log('🧪 FINAL READ-ONLY REGRESSION CHECK (PREP 3 SOCIAL STUDIES)');
  console.log('======================================================================\n');

  // 1. All 113 pages present
  const pagesRes = await db.query(
    'SELECT count(*) as count, sum(char_count) as total_chars FROM book_pages WHERE book_id = $1',
    [bookId]
  );
  const pageCount = Number(pagesRes.rows[0].count);
  const totalChars = Number(pagesRes.rows[0].total_chars);
  console.log(`[CHECK 1] Page Records in book_pages: ${pageCount}/113 (Total Unicode Characters: ${totalChars})`);
  const check1Pass = pageCount === 113 && totalChars === 146490;
  console.log(`  ${check1Pass ? '✅ PASS' : '❌ FAIL'}: All 113 pages confirmed present and intact.`);

  // 2. Four units non-overlapping ranges
  const chRes = await db.query(
    'SELECT chapter_number, title_ar, start_page, end_page FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC',
    [bookId]
  );
  console.log('\n[CHECK 2] Four Units Approved Ranges:');
  let prevEnd = 8;
  let check2Pass = chRes.rows.length === 4;
  for (const ch of chRes.rows) {
    console.log(`  Unit ${ch.chapter_number}: ${ch.start_page}..${ch.end_page} - "${ch.title_ar}"`);
    if (ch.start_page !== prevEnd + 1 || ch.start_page > ch.end_page) {
      check2Pass = false;
    }
    prevEnd = ch.end_page;
  }
  console.log(`  ${check2Pass ? '✅ PASS' : '❌ FAIL'}: Non-overlapping, contiguous unit ranges confirmed.`);

  // 3. Recovered pages 42 and 84 retrievable under correct units
  const p42Res = await db.query(
    `SELECT c.page_number, bc.chapter_number, bc.title_ar 
     FROM book_chunks c 
     JOIN book_chapters bc ON c.chapter_id = bc.id 
     WHERE c.book_id = $1 AND c.page_number = 42`,
    [bookId]
  );
  const p84Res = await db.query(
    `SELECT c.page_number, bc.chapter_number, bc.title_ar 
     FROM book_chunks c 
     JOIN book_chapters bc ON c.chapter_id = bc.id 
     WHERE c.book_id = $1 AND c.page_number = 84`,
    [bookId]
  );
  console.log('\n[CHECK 3] Recovered Pages Chunk Retrieval:');
  console.log(`  Page 42 -> Unit ${p42Res.rows[0]?.chapter_number} (${p42Res.rows[0]?.title_ar})`);
  console.log(`  Page 84 -> Unit ${p84Res.rows[0]?.chapter_number} (${p84Res.rows[0]?.title_ar})`);
  const check3Pass = p42Res.rows[0]?.chapter_number === 2 && p84Res.rows[0]?.chapter_number === 3;
  console.log(`  ${check3Pass ? '✅ PASS' : '❌ FAIL'}: Pages 42 and 84 indexed under correct units.`);

  // 4 & 5. Provenance verification: valid passes, unsupported/incorrect rejected
  console.log('\n[CHECK 4 & 5] Provenance Verification:');
  const validQ = {
    question_text: 'ما النتيجة المترتبة على تشكيل الوزارة المختلطة برئاسة نوبار باشا في عصر مصر الحديثة؟',
    options: [
      { text: 'زيادة النفوذ الأجنبي والتدخل في شؤون مصر', is_correct: true },
      { text: 'استقلال مصر التام', is_correct: false }
    ],
    page_reference: 58
  };
  const unsuppQ = {
    question_text: 'ما هي الدولة الأوروبية التي احتلت دولة الجزائر عام 1830 وقامت بضمها؟',
    options: [
      { text: 'فرنسا', is_correct: true },
      { text: 'إيطاليا', is_correct: false }
    ],
    page_reference: 58
  };
  const wrongAnsQ = {
    question_text: 'ما النتيجة المترتبة على تشكيل الوزارة المختلطة برئاسة نوبار باشا؟',
    options: [
      { text: 'إلغاء جميع الديون الخارجية نهائياً وتنازل البنوك الأوروبية', is_correct: true },
      { text: 'زيادة التدخل الأجنبي', is_correct: false }
    ],
    page_reference: 58
  };

  const validRes = await verifyQuestionProvenance(validQ, bookId);
  const unsuppRes = await verifyQuestionProvenance(unsuppQ, bookId);
  const wrongAnsRes = await verifyQuestionProvenance(wrongAnsQ, bookId);

  console.log(`  Valid Question: isVerified = ${validRes.isVerified}`);
  console.log(`  Unsupported Question (Algeria 1830): isVerified = ${unsuppRes.isVerified} (Reason: ${unsuppRes.reason})`);
  console.log(`  Wrong Answer Claim: isVerified = ${wrongAnsRes.isVerified} (Reason: ${wrongAnsRes.reason})`);

  const check4Pass = validRes.isVerified && !unsuppRes.isVerified && !wrongAnsRes.isVerified;
  console.log(`  ${check4Pass ? '✅ PASS' : '❌ FAIL'}: Valid passed, unsupported and wrong-answer questions rejected.`);

  // 6. Production Safety Counts
  console.log('\n[CHECK 6] Production Safety Counts:');
  const users = await db.query('SELECT count(*) as count FROM users');
  const students = await db.query('SELECT count(*) as count FROM student_profiles');
  const evals = await db.query('SELECT count(*) as count FROM ai_evaluations');
  const books = await db.query('SELECT count(*) as count FROM books');
  const pdfChunks = await db.query('SELECT count(*) as count FROM book_pdf_chunks');

  console.log(`  Users: ${users.rows[0].count} (Expected: 229)`);
  console.log(`  Students: ${students.rows[0].count} (Expected: 226)`);
  console.log(`  Evaluations: ${evals.rows[0].count} (Expected: 345)`);
  console.log(`  Books: ${books.rows[0].count} (Expected: 13)`);
  console.log(`  Original PDF Chunks: ${pdfChunks.rows[0].count} (Expected: 314)`);

  const check6Pass = 
    Number(users.rows[0].count) === 229 &&
    Number(students.rows[0].count) === 226 &&
    Number(evals.rows[0].count) === 345 &&
    Number(books.rows[0].count) === 13 &&
    Number(pdfChunks.rows[0].count) === 314;

  console.log(`  ${check6Pass ? '✅ PASS' : '❌ FAIL'}: Production data completely unchanged.`);

  console.log('\n======================================================================');
  const allPass = check1Pass && check2Pass && check3Pass && check4Pass && check6Pass;
  console.log(`🏁 FINAL REGRESSION STATUS: ${allPass ? '100% SUCCESS (ALL CHECKS PASSED)' : 'FAILED'}`);
  console.log('======================================================================');

  process.exit(allPass ? 0 : 1);
}

runRegression().catch(err => {
  console.error(err);
  process.exit(1);
});
