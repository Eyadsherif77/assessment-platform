import assert from 'assert';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { setupDisposableTestDb, assertDatabaseIsDisposable } from './test_isolation_helper.mjs';

console.log('================================================================');
console.log('FARABI AI — STUDENT UNUPLOADED SUBJECTS HIDDEN TEST SUITE');
console.log('All Grades | Zero Unuploaded Leakage | Non-destructive & $0 Spend');
console.log('================================================================\n');

const { tempDir, dbPath } = setupDisposableTestDb('unuploaded_subjects');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_unuploaded_12345';
process.env.EXAM_ATTEMPT_SECRET = process.env.EXAM_ATTEMPT_SECRET || 'test_exam_attempt_secret_unuploaded_12345';

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

async function main() {
  let serverInstance = null;
  try {
    // 1. Initialize DB
    const dbModule = await import('../dist/db/db.js');
    const db = dbModule.db || dbModule.default || dbModule;
    await db.init();
    assertDatabaseIsDisposable(db, dbPath);

    // 2. Fetch seeded stages & grades
    const prepStageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PREPARATORY'`);
    const stagePrepId = prepStageRes.rows[0].id;

    const primStageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PRIMARY'`);
    const stagePrimId = primStageRes.rows[0].id;

    const secStageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'SECONDARY'`);
    const stageSecId = secStageRes.rows[0].id;

    const prep3GradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PREP_3'`);
    const gradePrep3Id = prep3GradeRes.rows[0].id;

    const prim4GradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PRIM_4'`);
    const gradePrim4Id = prim4GradeRes.rows[0].id;

    const sec1GradeRes = await db.query(`SELECT id FROM grades WHERE code = 'SEC_1'`);
    const gradeSec1Id = sec1GradeRes.rows[0].id;

    // 3. Seed subjects for Prep 3: Science (has book), Math (NO book uploaded), Arabic (NO book uploaded)
    const sciSubjPrep3Id = 'subj_prep3_sci_' + Date.now();
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en, sort_order)
       VALUES ($1, $2, 'SCIENCE', 'العلوم', 'Science', 1)`,
      [sciSubjPrep3Id, gradePrep3Id]
    );

    const mathSubjPrep3Id = 'subj_prep3_math_' + Date.now();
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en, sort_order)
       VALUES ($1, $2, 'MATH', 'الرياضيات', 'Mathematics', 2)`,
      [mathSubjPrep3Id, gradePrep3Id]
    );

    const arSubjPrep3Id = 'subj_prep3_ar_' + Date.now();
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en, sort_order)
       VALUES ($1, $2, 'ARABIC', 'اللغة العربية', 'Arabic', 3)`,
      [arSubjPrep3Id, gradePrep3Id]
    );

    // 4. Seed subjects for Primary 4: English (has book), Science (NO book uploaded)
    const engSubjPrim4Id = 'subj_prim4_eng_' + Date.now();
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en, sort_order)
       VALUES ($1, $2, 'ENGLISH', 'اللغة الإنجليزية', 'English', 1)`,
      [engSubjPrim4Id, gradePrim4Id]
    );

    const sciSubjPrim4Id = 'subj_prim4_sci_' + Date.now();
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en, sort_order)
       VALUES ($1, $2, 'SCIENCE', 'العلوم', 'Science', 2)`,
      [sciSubjPrim4Id, gradePrim4Id]
    );

    // 5. Seed subjects for Secondary 1: Chemistry (has book), Physics (NO book uploaded)
    const chemSubjSec1Id = 'subj_sec1_chem_' + Date.now();
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en, sort_order)
       VALUES ($1, $2, 'CHEMISTRY', 'الكيمياء', 'Chemistry', 1)`,
      [chemSubjSec1Id, gradeSec1Id]
    );

    const physSubjSec1Id = 'subj_sec1_phys_' + Date.now();
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en, sort_order)
       VALUES ($1, $2, 'PHYSICS', 'الفيزياء', 'Physics', 2)`,
      [physSubjSec1Id, gradeSec1Id]
    );

    // 6. Create books:
    // Only Science has a book in Prep 3
    const bookPrep3SciId = 'book_prep3_sci_' + Date.now();
    await db.query(
      `INSERT INTO books (id, title_ar, title_en, subject_id, grade_id, academic_stage_id, term, file_url, processing_status, total_pages)
       VALUES ($1, 'كتاب العلوم - الصف الثالث الإعدادي', 'Science - Prep 3', $2, $3, $4, 1, 'https://storage/science.pdf', 'COMPLETED', 120)`,
      [bookPrep3SciId, sciSubjPrep3Id, gradePrep3Id, stagePrepId]
    );

    // Only English has a book in Prim 4
    const bookPrim4EngId = 'book_prim4_eng_' + Date.now();
    await db.query(
      `INSERT INTO books (id, title_ar, title_en, subject_id, grade_id, academic_stage_id, term, file_url, processing_status, total_pages)
       VALUES ($1, 'كتاب اللغة الإنجليزية - الرابع الابتدائي', 'English - Prim 4', $2, $3, $4, 1, 'https://storage/eng.pdf', 'COMPLETED', 90)`,
      [bookPrim4EngId, engSubjPrim4Id, gradePrim4Id, stagePrimId]
    );

    // Only Chemistry has a book in Sec 1
    const bookSec1ChemId = 'book_sec1_chem_' + Date.now();
    await db.query(
      `INSERT INTO books (id, title_ar, title_en, subject_id, grade_id, academic_stage_id, term, file_url, processing_status, total_pages)
       VALUES ($1, 'كتاب الكيمياء - الأول الثانوي', 'Chemistry - Sec 1', $2, $3, $4, 1, 'https://storage/chem.pdf', 'COMPLETED', 150)`,
      [bookSec1ChemId, chemSubjSec1Id, gradeSec1Id, stageSecId]
    );

    // 7. Seed Students
    const { generateToken } = await import('../dist/middleware/auth.js');

    // Student 1: Prep 3
    const studentPrep3Id = 'student_prep3_' + Date.now();
    await db.query(
      `INSERT INTO users (id, username, password_hash, role, full_name, email, is_active)
       VALUES ($1, 'student_prep3_hide', 'hash', 'STUDENT', 'طالب الإعدادي', 'student_prep3_hide@test.local', 1)`,
      [studentPrep3Id]
    );
    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_type)
       VALUES ($1, 'طالب الإعدادي', $2, $3, 'عربي')`,
      [studentPrep3Id, stagePrepId, gradePrep3Id]
    );
    const tokenPrep3 = generateToken({ id: studentPrep3Id, username: 'student_prep3_hide', role: 'STUDENT' });

    // Student 2: Prim 4
    const studentPrim4Id = 'student_prim4_' + Date.now();
    await db.query(
      `INSERT INTO users (id, username, password_hash, role, full_name, email, is_active)
       VALUES ($1, 'student_prim4_hide', 'hash', 'STUDENT', 'طالب الابتدائي', 'student_prim4_hide@test.local', 1)`,
      [studentPrim4Id]
    );
    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_type)
       VALUES ($1, 'طالب الابتدائي', $2, $3, 'عربي')`,
      [studentPrim4Id, stagePrimId, gradePrim4Id]
    );
    const tokenPrim4 = generateToken({ id: studentPrim4Id, username: 'student_prim4_hide', role: 'STUDENT' });

    // Student 3: Sec 1
    const studentSec1Id = 'student_sec1_' + Date.now();
    await db.query(
      `INSERT INTO users (id, username, password_hash, role, full_name, email, is_active)
       VALUES ($1, 'student_sec1_hide', 'hash', 'STUDENT', 'طالب الثانوي', 'student_sec1_hide@test.local', 1)`,
      [studentSec1Id]
    );
    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_type)
       VALUES ($1, 'طالب الثانوي', $2, $3, 'عربي')`,
      [studentSec1Id, stageSecId, gradeSec1Id]
    );
    const tokenSec1 = generateToken({ id: studentSec1Id, username: 'student_sec1_hide', role: 'STUDENT' });

    // 8. Spin up Express app
    const app = express();
    app.use(express.json());

    const booksRouterModule = await import('../dist/routes/books.js');
    const booksRouter = booksRouterModule.default || booksRouterModule;
    app.use('/api/books', booksRouter);

    const examsRouterModule = await import('../dist/routes/exams.js');
    const examsRouter = examsRouterModule.default || examsRouterModule;
    app.use('/api/exams', examsRouter);

    const port = 53890 + Math.floor(Math.random() * 1000);
    serverInstance = app.listen(port);
    const baseUrl = `http://127.0.0.1:${port}`;

    // --- TESTS ---

    await runTest('1. Prep 3 student GET /api/books returns ONLY uploaded subjects (Math & Arabic are hidden)', async () => {
      const res = await fetch(`${baseUrl}/api/books?term=1`, {
        headers: { Authorization: `Bearer ${tokenPrep3}` }
      });
      assert.strictEqual(res.status, 200);
      const books = await res.json();
      assert.ok(Array.isArray(books));
      
      // Should contain Science
      const hasScience = books.some(b => b.subject_id === sciSubjPrep3Id);
      assert.strictEqual(hasScience, true, 'Uploaded Science textbook must be visible');

      // Math and Arabic should be completely hidden (no placeholders, no upcoming items)
      const hasMath = books.some(b => b.subject_id === mathSubjPrep3Id);
      assert.strictEqual(hasMath, false, 'Un-uploaded Math subject must be hidden from student');

      const hasArabic = books.some(b => b.subject_id === arSubjPrep3Id);
      assert.strictEqual(hasArabic, false, 'Un-uploaded Arabic subject must be hidden from student');

      // No placeholder IDs in student response
      const hasPlaceholders = books.some(b => String(b.id).startsWith('placeholder_'));
      assert.strictEqual(hasPlaceholders, false, 'Student response must contain 0 placeholder items');
    });

    await runTest('2. Primary 4 student GET /api/books returns ONLY English (Science is hidden)', async () => {
      const res = await fetch(`${baseUrl}/api/books?term=1`, {
        headers: { Authorization: `Bearer ${tokenPrim4}` }
      });
      assert.strictEqual(res.status, 200);
      const books = await res.json();
      
      const hasEnglish = books.some(b => b.subject_id === engSubjPrim4Id);
      assert.strictEqual(hasEnglish, true, 'Uploaded English textbook must be visible');

      const hasScience = books.some(b => b.subject_id === sciSubjPrim4Id);
      assert.strictEqual(hasScience, false, 'Un-uploaded Science subject in Primary 4 must be hidden');
    });

    await runTest('3. Secondary 1 student GET /api/books returns ONLY Chemistry (Physics is hidden)', async () => {
      const res = await fetch(`${baseUrl}/api/books?term=1`, {
        headers: { Authorization: `Bearer ${tokenSec1}` }
      });
      assert.strictEqual(res.status, 200);
      const books = await res.json();
      
      const hasChem = books.some(b => b.subject_id === chemSubjSec1Id);
      assert.strictEqual(hasChem, true, 'Uploaded Chemistry textbook must be visible');

      const hasPhys = books.some(b => b.subject_id === physSubjSec1Id);
      assert.strictEqual(hasPhys, false, 'Un-uploaded Physics subject in Sec 1 must be hidden');
    });

    await runTest('4. Prep 3 student GET /api/exams/fixed/hierarchy omits subjects with no book and no exams', async () => {
      const res = await fetch(`${baseUrl}/api/exams/fixed/hierarchy?term=1`, {
        headers: { Authorization: `Bearer ${tokenPrep3}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.subjects));

      // Science has an uploaded book -> must be included
      const hasScience = data.subjects.some(s => s.id === sciSubjPrep3Id);
      assert.strictEqual(hasScience, true, 'Science with uploaded book must appear in hierarchy');

      // Math & Arabic have no uploaded book and no exams -> must be excluded for students
      const hasMath = data.subjects.some(s => s.id === mathSubjPrep3Id);
      assert.strictEqual(hasMath, false, 'Math without book or exams must be hidden in hierarchy');

      const hasArabic = data.subjects.some(s => s.id === arSubjPrep3Id);
      assert.strictEqual(hasArabic, false, 'Arabic without book or exams must be hidden in hierarchy');
    });

    await runTest('5. When a textbook is subsequently uploaded for a subject, it becomes visible immediately', async () => {
      // Simulate Admin uploading textbook for Math in Prep 3
      const newMathBookId = 'book_prep3_math_' + Date.now();
      await db.query(
        `INSERT INTO books (id, title_ar, title_en, subject_id, grade_id, academic_stage_id, term, file_url, processing_status, total_pages)
         VALUES ($1, 'كتاب الرياضيات - الثالث الإعدادي', 'Mathematics - Prep 3', $2, $3, $4, 1, 'https://storage/math.pdf', 'COMPLETED', 140)`,
        [newMathBookId, mathSubjPrep3Id, gradePrep3Id, stagePrepId]
      );

      // Student checks /api/books again
      const res = await fetch(`${baseUrl}/api/books?term=1`, {
        headers: { Authorization: `Bearer ${tokenPrep3}` }
      });
      assert.strictEqual(res.status, 200);
      const books = await res.json();

      const hasMathNow = books.some(b => b.subject_id === mathSubjPrep3Id);
      assert.strictEqual(hasMathNow, true, 'Math must now be visible to student after book is uploaded');

      // Arabic still has no book -> remains hidden
      const hasArabic = books.some(b => b.subject_id === arSubjPrep3Id);
      assert.strictEqual(hasArabic, false, 'Arabic still has no uploaded book and must remain hidden');
    });

    console.log(`\n================================================================`);
    console.log(`ALL TESTS PASSED: ${passedTests}/${totalTests}`);
    console.log(`================================================================\n`);
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
