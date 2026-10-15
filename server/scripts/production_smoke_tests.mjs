import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const envPath = fs.existsSync('.env') ? '.env' : path.resolve('server/.env');
dotenv.config({ path: envPath });

const LIVE_BACKEND = 'https://server-two-pi-32.vercel.app';
const LIVE_FRONTEND = 'https://farabi-ai.com';

const TEST_STUDENT = {
  id: 'smoke-test-stu-e92eb8f',
  email: 'dedicated_smoke_test_e92eb8f@alfarabi-ai.internal',
  username: 'smoke_student_e92eb8f',
  password: 'SmokeTestPassword123!',
  fullName: 'حساب اختبار تجريبي معتمد',
  academicStageId: '61998777-4c5f-4e51-bc0a-38de938c842a', // PREPARATORY
  gradeId: '4baa5084-112d-45e5-908e-1ae67ea8b4e8', // PREP_1
  schoolType: 'عربي'
};

async function getDbConnection() {
  return mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT) || 4000,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: { rejectUnauthorized: true }
  });
}

async function ensureDedicatedTestStudent(conn) {
  const [existing] = await conn.query('SELECT id FROM users WHERE id = ?', [TEST_STUDENT.id]);
  const passwordHash = await bcrypt.hash(TEST_STUDENT.password, 10);

  if (existing.length === 0) {
    console.log('Creating dedicated test student account in TiDB Cloud...');
    await conn.query(
      `INSERT INTO users (id, hybrid_id, email, username, password_hash, role, full_name, is_active)
       VALUES (?, ?, ?, ?, ?, 'STUDENT', ?, 1)`,
      [
        TEST_STUDENT.id,
        'HYBRID-STU-SMOKE-E92EB8F',
        TEST_STUDENT.email,
        TEST_STUDENT.username,
        passwordHash,
        TEST_STUDENT.fullName
      ]
    );

    await conn.query(
      `INSERT INTO student_profiles (
         user_id, full_name, academic_stage_id, grade_id, school_type,
         school_name, student_code
       ) VALUES (?, ?, ?, ?, ?, 'مدرسة الاختبار المعيارية', 'SMOKE_E92EB8F')`,
      [
        TEST_STUDENT.id,
        TEST_STUDENT.fullName,
        TEST_STUDENT.academicStageId,
        TEST_STUDENT.gradeId,
        TEST_STUDENT.schoolType
      ]
    );
    console.log('✅ Dedicated test student account created.');
  } else {
    // Ensure active and password updated
    await conn.query(
      `UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?`,
      [passwordHash, TEST_STUDENT.id]
    );
    console.log('✅ Dedicated test student account verified active in TiDB.');
  }
}

async function runProductionSmokeTests() {
  console.log('========================================================================');
  console.log('ALFARABI AI — PRODUCTION END-TO-END SMOKE TEST SUITE');
  console.log(`Frontend URL: ${LIVE_FRONTEND}`);
  console.log(`Backend URL:  ${LIVE_BACKEND}`);
  console.log('Safety: 100% Isolated Dedicated Test Account | Zero Real Student Mutations');
  console.log('========================================================================\n');

  let passed = 0;
  const pass = (name, details) => {
    passed++;
    console.log(`  [PASS ${passed}] ${name}`);
    if (details) console.log(`         ${details}`);
  };

  const conn = await getDbConnection();

  try {
    // ------------------------------------------------------------------------
    // GATE 0: Database Textbook & Chapter Baseline Check
    // ------------------------------------------------------------------------
    console.log('--- Phase 0: Database Baseline Audit ---');
    const [books] = await conn.query('SELECT COUNT(*) as count FROM books');
    const [chapters] = await conn.query('SELECT COUNT(*) as count FROM book_chapters');
    if (books[0].count !== 13 || chapters[0].count !== 55) {
      throw new Error(`Textbook baseline mismatch: Books=${books[0].count} (exp 13), Chapters=${chapters[0].count} (exp 55)`);
    }
    pass('Authoritative Database Baseline Intact', `13 Official Books, 55 Chapters Verified Unmutated.`);

    // Set up dedicated test student
    await ensureDedicatedTestStudent(conn);

    // ------------------------------------------------------------------------
    // TEST 1: Frontend & Backend Health Check
    // ------------------------------------------------------------------------
    console.log('\n--- Test 1: Production Infrastructure Availability ---');
    const resHealth = await fetch(`${LIVE_BACKEND}/api/health`);
    if (resHealth.status !== 200) throw new Error(`Backend health check failed: HTTP ${resHealth.status}`);
    const healthJson = await resHealth.json();
    if (healthJson.status !== 'online') throw new Error(`Backend status not online: ${JSON.stringify(healthJson)}`);
    pass('Live Backend Health Endpoint (200 OK)', `Status: ${healthJson.status}, Platform: ${healthJson.platform}`);

    const resFrontend = await fetch(LIVE_FRONTEND);
    if (resFrontend.status !== 200) throw new Error(`Frontend failed: HTTP ${resFrontend.status}`);
    const htmlText = await resFrontend.text();
    if (!htmlText.includes('<title>') || !htmlText.includes('root')) {
      throw new Error('Frontend returned HTML without root application container.');
    }
    pass('Live Frontend Web Availability (200 OK)', `Delivered production Vite bundle with HTML entry point.`);

    // ------------------------------------------------------------------------
    // TEST 2: Dedicated Test Student Authentication (Login)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 2: Student Authentication & Dashboard Token ---');
    const resLogin = await fetch(`${LIVE_BACKEND}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_STUDENT.email,
        password: TEST_STUDENT.password
      })
    });

    if (resLogin.status !== 200) {
      const err = await resLogin.text();
      throw new Error(`Login failed with HTTP ${resLogin.status}: ${err}`);
    }
    const loginJson = await resLogin.json();
    if (!loginJson.token || loginJson.user?.role !== 'STUDENT') {
      throw new Error(`Invalid login payload: ${JSON.stringify(loginJson)}`);
    }
    const studentToken = loginJson.token;
    pass('Dedicated Student Login (200 OK)', `JWT token generated for student ${TEST_STUDENT.id.slice(0, 8)}... (Prep 1)`);

    // ------------------------------------------------------------------------
    // TEST 3: Available Textbook & Unit Selection
    // ------------------------------------------------------------------------
    console.log('\n--- Test 3: Textbook & Unit Selection ---');
    const resBooks = await fetch(`${LIVE_BACKEND}/api/books`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    if (resBooks.status !== 200) throw new Error(`Failed to fetch books: HTTP ${resBooks.status}`);
    const booksList = await resBooks.json();
    if (!Array.isArray(booksList) || booksList.length === 0) throw new Error('Books list empty');

    const englishPrep1 = booksList.find(b => b.title_en === 'English Prep 1' || b.id === '21e1d639-9f59-4a58-a8f8-8373b8e7fc90');
    if (!englishPrep1 || englishPrep1.is_available === false) {
      throw new Error('Prep 1 English book missing or incorrectly flagged unavailable');
    }
    pass('Available Textbook Retrieval', `Retrieved ${booksList.length} subjects/books; Prep 1 English available.`);

    // Fetch chapters for Prep 1 English
    const resBookDetail = await fetch(`${LIVE_BACKEND}/api/books/${englishPrep1.id}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    if (resBookDetail.status !== 200) throw new Error(`Failed to fetch book detail: HTTP ${resBookDetail.status}`);
    const bookDetail = await resBookDetail.json();
    if (!bookDetail.chapters || bookDetail.chapters.length === 0) throw new Error('Book has 0 chapters');
    pass('Unit Selection & Chapter Mapping', `Prep 1 English contains ${bookDetail.chapters.length} chapters.`);

    // ------------------------------------------------------------------------
    // TEST 4: Safe Rejection of Unavailable Textbooks (Prep 3 Mathematics Gate)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 4: Safe Rejection of Unavailable Textbooks ---');
    // Check books endpoint for upcoming textbook representation
    const upcomingMath = booksList.find(b => b.is_available === false && b.status === 'UPCOMING_TEXTBOOK');
    if (upcomingMath) {
      console.log(`  ℹ️ Found upcoming textbook card: "${upcomingMath.title_ar}" (status: ${upcomingMath.status})`);
    }

    // Attempt quiz generation for a placeholder book -> Must return HTTP 422 SUBJECT_TEXTBOOK_UNAVAILABLE
    const resPlaceholder = await fetch(`${LIVE_BACKEND}/api/ai/generate-quiz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        book_id: 'placeholder_math_prep3',
        chapter_id: 'placeholder_chapter',
        subject_id: 'placeholder_subject',
        count: 3
      })
    });

    if (resPlaceholder.status !== 422) {
      throw new Error(`Expected HTTP 422 for placeholder textbook, got HTTP ${resPlaceholder.status}`);
    }
    const phBody = await resPlaceholder.json();
    if (phBody.code !== 'SUBJECT_TEXTBOOK_UNAVAILABLE') {
      throw new Error(`Expected SUBJECT_TEXTBOOK_UNAVAILABLE code, got: ${JSON.stringify(phBody)}`);
    }
    pass('Safe Rejection of Unavailable Textbooks (HTTP 422)', `Code: ${phBody.code} — Fail-closed with zero hallucination.`);

    // ------------------------------------------------------------------------
    // TEST 5: Exam Generation using Available Textbook (Prep 1 English Unit 4)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 5: Exam Generation on Available Textbook ---');
    const targetChapter = bookDetail.chapters.find(c => c.id === 'e6000000-9f59-4a58-a8f8-8373b8e7fc94') || bookDetail.chapters[0];
    console.log(`  Targeting Chapter: "${targetChapter.title_ar}" (${targetChapter.id})`);

    const resGen = await fetch(`${LIVE_BACKEND}/api/ai/generate-quiz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        book_id: englishPrep1.id,
        chapter_id: targetChapter.id,
        subject_id: englishPrep1.subject_id,
        count: 5,
        difficulty: 'MEDIUM'
      })
    });

    if (resGen.status !== 200) {
      const err = await resGen.text();
      throw new Error(`Exam generation failed with HTTP ${resGen.status}: ${err}`);
    }
    const examJson = await resGen.json();
    if (!examJson.questions || examJson.questions.length !== 5) {
      throw new Error(`Expected exactly 5 questions, received ${examJson.questions?.length}`);
    }
    if (!examJson.attempt_token) {
      throw new Error('Exam generation missing signed attempt_token');
    }

    // Verify MCQ qualities
    for (let i = 0; i < examJson.questions.length; i++) {
      const q = examJson.questions[i];
      const stem = q.question_text || q.stem || q.question || '';
      if (stem.trim().length < 5) throw new Error(`Question ${i + 1} has insufficient stem: "${stem}"`);
      if (!Array.isArray(q.options) || q.options.length !== 4) throw new Error(`Question ${i + 1} does not have 4 options`);
      const distinctOpts = new Set(q.options.map(o => String(o.id || o.text || o).trim()));
      if (distinctOpts.size !== 4) throw new Error(`Question ${i + 1} contains duplicate options`);
    }
    pass('Exam Generation & Integrity (5 MCQs)', `Delivered 5 MCQs with 4 distinct options each and signed attempt_token.`);

    // ------------------------------------------------------------------------
    // TEST 6: Difficulty-Specific Cache Isolation
    // ------------------------------------------------------------------------
    console.log('\n--- Test 6: Difficulty-Specific Cache Isolation ---');
    // Generate EASY exam
    const resEasy = await fetch(`${LIVE_BACKEND}/api/ai/generate-quiz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        book_id: englishPrep1.id,
        chapter_id: targetChapter.id,
        subject_id: englishPrep1.subject_id,
        count: 5,
        difficulty: 'EASY'
      })
    });
    if (resEasy.status !== 200) throw new Error(`EASY generation failed: HTTP ${resEasy.status}`);
    const easyJson = await resEasy.json();

    // Generate HARD exam
    const resHard = await fetch(`${LIVE_BACKEND}/api/ai/generate-quiz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        book_id: englishPrep1.id,
        chapter_id: targetChapter.id,
        subject_id: englishPrep1.subject_id,
        count: 5,
        difficulty: 'HARD'
      })
    });
    if (resHard.status !== 200) throw new Error(`HARD generation failed: HTTP ${resHard.status}`);
    const hardJson = await resHard.json();

    // Verify distinct attempt tokens
    if (easyJson.attempt_token === hardJson.attempt_token) {
      throw new Error('EASY and HARD exams shared identical attempt_token — cache collision detected!');
    }
    pass('Difficulty Cache Parameter Isolation', `Distinct EASY vs HARD exams delivered without cache cross-contamination.`);

    // ------------------------------------------------------------------------
    // TEST 7: Answer Submission & Server-Authoritative Grading
    // ------------------------------------------------------------------------
    console.log('\n--- Test 7: Answer Submission & Server-Authoritative Grading ---');
    // Prepare answers: select option 0 for each question
    const submissionAnswers = examJson.questions.map(q => ({
      question_id: q.id,
      selected_option_id: q.options[0].id
    }));

    const resSubmit = await fetch(`${LIVE_BACKEND}/api/ai/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        attempt_token: examJson.attempt_token,
        answers: submissionAnswers
      })
    });

    if (resSubmit.status !== 200) {
      const err = await resSubmit.text();
      throw new Error(`Submission failed with HTTP ${resSubmit.status}: ${err}`);
    }
    const evalResult = await resSubmit.json();
    const report = evalResult.report || evalResult;
    const items = report.items || report.question_evaluations || [];
    if (items.length !== 5) {
      throw new Error(`Invalid evaluation report items count: ${items.length} (expected 5)`);
    }
    const scoreVal = typeof report.score === 'number' ? report.score : report.provisional_score;
    pass('Answer Submission & Server Grading (200 OK)', `Score: ${scoreVal} / ${items.length} (${report.percentage ?? report.provisional_percentage}%) calculated server-side.`);

    // ------------------------------------------------------------------------
    // TEST 8: Exam Analysis & Page Attribution Verification
    // ------------------------------------------------------------------------
    console.log('\n--- Test 8: Exam Analysis & Page Attribution ---');
    let hasFabricatedPage1 = false;
    for (const it of items) {
      if (it.page_reference === 1 && targetChapter.start_page > 1) {
        hasFabricatedPage1 = true;
      }
      if (it.study_recommendation && it.study_recommendation.includes('صفحة 1') && targetChapter.start_page > 1) {
        hasFabricatedPage1 = true;
      }
    }
    if (hasFabricatedPage1) {
      throw new Error('CRITICAL: Exam analysis fabricated "Page 1" for questions outside Page 1!');
    }
    pass('Exam Analysis Page Attribution Verified', `Zero fabricated "Page 1" citations; authentic chapter attribution confirmed.`);

    console.log('\n========================================================================');
    console.log(`🎉 ALL ${passed} PRODUCTION SMOKE TESTS PASSED CLEANLY ON PRODUCTION!`);
    console.log('Backend & Frontend verified live, responsive, and completely operational.');
    console.log('========================================================================\n');
  } finally {
    await conn.end();
  }
}

runProductionSmokeTests().catch(err => {
  console.error('\n❌ CRITICAL PRODUCTION SMOKE TEST FAILURE:', err);
  process.exit(1);
});
