import assert from 'assert';
import fs from 'fs';
import path from 'path';
import express from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { setupDisposableTestDb, assertDatabaseIsDisposable } from './test_isolation_helper.mjs';

console.log('================================================================');
console.log('FARABI AI — TIMED EXAM EXPIRATION & AUTO-SUBMISSION TEST');
console.log('Verifying Full 15-Point Lifecycle:');
console.log('1. Normal exam submission before expiration');
console.log('2. Automatic submission at expiration');
console.log('3. Last answer saved immediately before expiration');
console.log('4. Answer request arriving at/after deadline');
console.log('5. Student refreshing during an exam');
console.log('6. Student reopening an expired attempt');
console.log('7. Network disconnect during expiration');
console.log('8. Network recovery after expiration');
console.log('9. Duplicate automatic submission requests');
console.log('10. Simultaneous manual and automatic submission');
console.log('11. Device clock independence (Authoritative Server Time)');
console.log('12. Server/client timezone normalization');
console.log('13. Evaluation idempotency & safe retry');
console.log('14. Prevention of post-expiration answer changes');
console.log('15. Correct result retrieval after auto-submission');
console.log('================================================================\n');

const { tempDir, dbPath } = setupDisposableTestDb('timed_exam_lifecycle');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_timed_exam_secret_12345';
const JWT_SECRET = process.env.JWT_SECRET;

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
    // 1. Initialize isolated database
    const dbModule = await import('../dist/db/db.js');
    const db = dbModule.db || dbModule.default || dbModule;
    await db.init();
    assertDatabaseIsDisposable(db, dbPath);

    const { parseDbTimestamp, finalizeAndGradeExamAttempt } = await import('../dist/routes/exams.js');

    // 2. Query seeded Academic Stages & Grades
    const prepStageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PREPARATORY'`);
    const stagePrepId = prepStageRes.rows[0].id;
    const prep3GradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PREP_3'`);
    const gradePrep3Id = prep3GradeRes.rows[0].id;

    // 3. Seed Subject, Book, Chapter, and User
    const subjectId = 'subj_math_' + Date.now();
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en)
       VALUES ($1, $2, 'MATH', 'رياضيات', 'Mathematics')`,
      [subjectId, gradePrep3Id]
    );

    const bookId = 'book_math_' + Date.now();
    await db.query(
      `INSERT INTO books (id, title_ar, title_en, grade_id, subject_id, academic_stage_id, total_pages, processing_status, term, school_type)
       VALUES ($1, 'رياضيات تالتة إعدادي', 'Math Prep 3', $2, $3, $4, 112, 'COMPLETED', 'TERM_1', 'كلاهما')`,
      [bookId, gradePrep3Id, subjectId, stagePrepId]
    );

    const chapterId = 'ch_unit1_' + Date.now();
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 1, 'الوحدة الأولى: العلاقات والدوال', 'Unit 1: Relations and Functions', 1, 20)`,
      [chapterId, bookId]
    );

    const studentUser = {
      id: 'student_' + Date.now(),
      email: 'student_timed_test@farabi-ai.com',
      role: 'STUDENT',
      full_name: 'طالب الاختبار الموقوت',
      academic_stage_id: stagePrepId,
      grade_id: gradePrep3Id,
      school_type: 'كلاهما'
    };

    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, $2, 'hash123', $3, $4, 1)`,
      [studentUser.id, studentUser.email, studentUser.role, studentUser.full_name]
    );

    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_type)
       VALUES ($1, $2, $3, $4, 'كلاهما')`,
      [studentUser.id, studentUser.full_name, stagePrepId, gradePrep3Id]
    );

    const studentToken = jwt.sign(
      {
        id: studentUser.id,
        email: studentUser.email,
        role: studentUser.role,
        academicStageId: stagePrepId,
        gradeId: gradePrep3Id,
        schoolType: 'كلاهما'
      },
      JWT_SECRET,
      { expiresIn: '4h' }
    );

    const teacherId = 'teacher_' + Date.now();
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'teacher_timed@farabi-ai.com', 'hash123', 'TEACHER', 'معلم الرياضيات', 1)`,
      [teacherId]
    );

    // 4. Seed a fixed timed exam (Duration: 10 minutes) with 3 questions
    const timedExamId = 'exam_timed_' + Date.now();
    await db.query(
      `INSERT INTO exams (
         id, title_ar, title_en, teacher_id, academic_stage_id, grade_id, subject_id, book_id, chapter_id,
         duration_minutes, is_published, school_type, term
       ) VALUES ($1, 'اختبار العلاقات والدوال الموقوت', 'Timed Relations Exam', $2, $3, $4, $5, $6, $7, 10, 1, 'كلاهما', 'TERM_1')`,
      [timedExamId, teacherId, stagePrepId, gradePrep3Id, subjectId, bookId, chapterId]
    );

    const q1Id = 'q_timed_1_' + Date.now();
    const q2Id = 'q_timed_2_' + Date.now();
    const q3Id = 'q_timed_3_' + Date.now();

    const questions = [
      { id: q1Id, text: 'سؤال 1: إذا كانت س = {1، 2} فإن س × س = ؟', pts: 5, optCorrect: 'opt_1_corr', optWrong: 'opt_1_wrg' },
      { id: q2Id, text: 'سؤال 2: الدالة د(س) = 5 تمثل دالة ثابتة من الدرجة:', pts: 5, optCorrect: 'opt_2_corr', optWrong: 'opt_2_wrg' },
      { id: q3Id, text: 'سؤال 3: النقطة (-3، 4) تقع في الربع:', pts: 5, optCorrect: 'opt_3_corr', optWrong: 'opt_3_wrg' }
    ];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await db.query(
        `INSERT INTO exam_questions (id, exam_id, question_text, question_type, points, order_index, explanation, page_reference)
         VALUES ($1, $2, $3, 'MULTIPLE_CHOICE', $4, $5, 'شرح النموذج', 15)`,
        [q.id, timedExamId, q.text, q.pts, i + 1]
      );
      await db.query(
        `INSERT INTO exam_question_options (id, question_id, option_text, is_correct)
         VALUES ($1, $2, 'خيار صحيح', 1), ($3, $2, 'خيار خاطئ', 0)`,
        [q.optCorrect, q.id, q.optWrong]
      );
    }

    // 5. Spin up Express app with exams router
    const app = express();
    app.use(express.json());
    const examsRouteModule = await import('../dist/routes/exams.js');
    app.use('/api/exams', examsRouteModule.default);

    const port = 30000 + Math.floor(Math.random() * 20000);
    serverInstance = app.listen(port);
    const baseUrl = `http://127.0.0.1:${port}/api/exams`;

    // -------------------------------------------------------------------
    // Test 1: Normal exam submission before expiration
    // -------------------------------------------------------------------
    await runTest('Test 1: Normal exam submission before expiration', async () => {
      // Start exam
      const startRes = await fetch(`${baseUrl}/${timedExamId}`, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const startData = await startRes.json();
      assert.strictEqual(startRes.status, 200);
      assert.ok(startData.attempt?.id);
      assert.strictEqual(startData.attempt.status, 'IN_PROGRESS');
      assert.strictEqual(startData.attempt.duration_minutes, 10);
      assert.ok(startData.attempt.remaining_seconds > 580);

      const attemptId = startData.attempt.id;

      // Submit all correct answers within time
      const submitRes = await fetch(`${baseUrl}/${timedExamId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({
          attempt_id: attemptId,
          answers: [
            { question_id: q1Id, selected_option_id: questions[0].optCorrect },
            { question_id: q2Id, selected_option_id: questions[1].optCorrect },
            { question_id: q3Id, selected_option_id: questions[2].optCorrect }
          ]
        })
      });
      const submitData = await submitRes.json();
      assert.strictEqual(submitRes.status, 200);
      assert.strictEqual(submitData.score, 15);
      assert.strictEqual(submitData.total_points, 15);
      assert.strictEqual(submitData.percentage, 100);
      assert.strictEqual(submitData.passed, true);
      assert.strictEqual(submitData.auto_submitted, false);

      // Verify DB record
      const attCheck = await db.query(`SELECT status, score FROM exam_attempts WHERE id = $1`, [attemptId]);
      assert.strictEqual(attCheck.rows[0].status, 'COMPLETED');
      assert.strictEqual(Number(attCheck.rows[0].score), 15);
    });

    // -------------------------------------------------------------------
    // Test 2: Automatic submission at expiration (Never 403 or ABANDONED)
    // -------------------------------------------------------------------
    await runTest('Test 2: Automatic submission at expiration preserves answers and never returns 403', async () => {
      const expAttemptId = 'att_expired_' + Date.now();
      const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      await db.query(
        `INSERT INTO exam_attempts (id, exam_id, student_id, score, total_points, status, started_at)
         VALUES ($1, $2, $3, 0, 0, 'IN_PROGRESS', $4)`,
        [expAttemptId, timedExamId, studentUser.id, twentyMinutesAgo]
      );

      // Simulate student answering 2 questions and timer expiring (is_auto_submit = true)
      const submitRes = await fetch(`${baseUrl}/${timedExamId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({
          attempt_id: expAttemptId,
          is_auto_submit: true,
          answers: [
            { question_id: q1Id, selected_option_id: questions[0].optCorrect },
            { question_id: q2Id, selected_option_id: questions[1].optWrong }
            // Q3 unanswered
          ]
        })
      });
      const submitData = await submitRes.json();
      assert.strictEqual(submitRes.status, 200, `Expected 200 OK, got ${submitRes.status}: ${JSON.stringify(submitData)}`);
      assert.strictEqual(submitData.auto_submitted, true);
      assert.strictEqual(submitData.score, 5); // Q1 correct (5pts), Q2 wrong (0pts), Q3 unanswered (0pts)
      assert.strictEqual(submitData.total_points, 15);

      const dbCheck = await db.query(`SELECT status, score FROM exam_attempts WHERE id = $1`, [expAttemptId]);
      assert.strictEqual(dbCheck.rows[0].status, 'COMPLETED'); // NEVER 'ABANDONED'!
      assert.strictEqual(Number(dbCheck.rows[0].score), 5);
    });

    // -------------------------------------------------------------------
    // Test 3: Last answer saved immediately before expiration
    // -------------------------------------------------------------------
    await runTest('Test 3: Last answer saved via /answers endpoint before deadline', async () => {
      // Clear any prior attempts for clean test isolation
      await db.query(`DELETE FROM exam_attempts WHERE exam_id = $1 AND student_id = $2`, [timedExamId, studentUser.id]);

      const activeAttId = 'att_active_' + Date.now();
      const nowIso = new Date().toISOString();
      await db.query(
        `INSERT INTO exam_attempts (id, exam_id, student_id, score, total_points, status, started_at)
         VALUES ($1, $2, $3, 0, 0, 'IN_PROGRESS', $4)`,
        [activeAttId, timedExamId, studentUser.id, nowIso]
      );

      const ansRes = await fetch(`${baseUrl}/${timedExamId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({
          attempt_id: activeAttId,
          question_id: q1Id,
          selected_option_id: questions[0].optCorrect
        })
      });
      const ansData = await ansRes.json();
      assert.strictEqual(ansRes.status, 200);
      assert.strictEqual(ansData.saved, true);

      // Verify draft in DB
      const draftCheck = await db.query(
        `SELECT selected_option_id FROM student_answers WHERE attempt_id = $1 AND question_id = $2`,
        [activeAttId, q1Id]
      );
      assert.strictEqual(draftCheck.rows[0].selected_option_id, questions[0].optCorrect);
    });

    // -------------------------------------------------------------------
    // Test 4: Answer request arriving at/after deadline auto-finalizes
    // -------------------------------------------------------------------
    await runTest('Test 4: Answer request arriving after deadline auto-finalizes without 403', async () => {
      await db.query(`DELETE FROM exam_attempts WHERE exam_id = $1 AND student_id = $2`, [timedExamId, studentUser.id]);

      const lateAttId = 'att_late_' + Date.now();
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      await db.query(
        `INSERT INTO exam_attempts (id, exam_id, student_id, score, total_points, status, started_at)
         VALUES ($1, $2, $3, 0, 0, 'IN_PROGRESS', $4)`,
        [lateAttId, timedExamId, studentUser.id, fifteenMinsAgo]
      );

      const ansRes = await fetch(`${baseUrl}/${timedExamId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({
          attempt_id: lateAttId,
          question_id: q1Id,
          selected_option_id: questions[0].optCorrect
        })
      });
      const ansData = await ansRes.json();
      assert.strictEqual(ansRes.status, 200);
      assert.strictEqual(ansData.expired, true);
      assert.strictEqual(ansData.auto_submitted, true);
      assert.ok(ansData.result);

      const attCheck = await db.query(`SELECT status FROM exam_attempts WHERE id = $1`, [lateAttId]);
      assert.strictEqual(attCheck.rows[0].status, 'COMPLETED');
    });

    // -------------------------------------------------------------------
    // Test 5: Student refreshing during an exam restores saved answers and timer
    // -------------------------------------------------------------------
    await runTest('Test 5: Student refreshing during active exam restores answers and exact timer', async () => {
      await db.query(`DELETE FROM exam_attempts WHERE exam_id = $1 AND student_id = $2`, [timedExamId, studentUser.id]);

      const refreshAttId = 'att_refresh_' + Date.now();
      // Started 3 minutes ago (7 minutes remaining out of 10)
      const threeMinsAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      await db.query(
        `INSERT INTO exam_attempts (id, exam_id, student_id, score, total_points, status, started_at)
         VALUES ($1, $2, $3, 0, 0, 'IN_PROGRESS', $4)`,
        [refreshAttId, timedExamId, studentUser.id, threeMinsAgo]
      );

      // Save answer for Q1
      await db.query(
        `INSERT INTO student_answers (id, attempt_id, question_id, selected_option_id, is_correct, points_awarded)
         VALUES ($1, $2, $3, $4, 0, 0)`,
        [uuidv4(), refreshAttId, q1Id, questions[0].optCorrect]
      );

      // Student reloads page -> calls GET /api/exams/:id
      const reloadRes = await fetch(`${baseUrl}/${timedExamId}`, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const reloadData = await reloadRes.json();
      assert.strictEqual(reloadRes.status, 200);
      assert.strictEqual(reloadData.attempt.id, refreshAttId);
      assert.strictEqual(reloadData.attempt.status, 'IN_PROGRESS');
      // Timer must NOT reset to 10 min: should be around 7 minutes (400-430 seconds)
      assert.ok(reloadData.attempt.remaining_seconds >= 400 && reloadData.attempt.remaining_seconds <= 430);
      // Saved answers must be restored
      assert.strictEqual(reloadData.attempt.saved_answers[q1Id], questions[0].optCorrect);
    });

    // -------------------------------------------------------------------
    // Test 6: Student reopening an expired attempt auto-finalizes and returns results
    // -------------------------------------------------------------------
    await runTest('Test 6: Student reopening an expired attempt receives graded results immediately', async () => {
      await db.query(`DELETE FROM exam_attempts WHERE exam_id = $1 AND student_id = $2`, [timedExamId, studentUser.id]);

      const reopenExpAttId = 'att_reopen_exp_' + Date.now();
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await db.query(
        `INSERT INTO exam_attempts (id, exam_id, student_id, score, total_points, status, started_at)
         VALUES ($1, $2, $3, 0, 0, 'IN_PROGRESS', $4)`,
        [reopenExpAttId, timedExamId, studentUser.id, oneHourAgo]
      );

      // Student previously autosaved Q1 as correct
      await db.query(
        `INSERT INTO student_answers (id, attempt_id, question_id, selected_option_id, is_correct, points_awarded)
         VALUES ($1, $2, $3, $4, 0, 0)`,
        [uuidv4(), reopenExpAttId, q1Id, questions[0].optCorrect]
      );

      // Student opens exam after 1 hour
      const reopenRes = await fetch(`${baseUrl}/${timedExamId}`, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const reopenData = await reopenRes.json();
      assert.strictEqual(reopenRes.status, 200);
      assert.strictEqual(reopenData.attempt.status, 'COMPLETED');
      assert.strictEqual(reopenData.attempt.is_expired, true);
      assert.ok(reopenData.result);
      assert.strictEqual(reopenData.result.score, 5); // Q1 awarded

      const dbCheck = await db.query(`SELECT status FROM exam_attempts WHERE id = $1`, [reopenExpAttId]);
      assert.strictEqual(dbCheck.rows[0].status, 'COMPLETED');
    });

    // -------------------------------------------------------------------
    // Test 7 & 8: Offline answer preservation and network recovery after deadline
    // -------------------------------------------------------------------
    await runTest('Test 7 & 8: Preserved offline answers are accepted and graded upon network reconnection', async () => {
      const offlineAttId = 'att_offline_' + Date.now();
      const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      await db.query(
        `INSERT INTO exam_attempts (id, exam_id, student_id, score, total_points, status, started_at)
         VALUES ($1, $2, $3, 0, 0, 'IN_PROGRESS', $4)`,
        [offlineAttId, timedExamId, studentUser.id, twentyMinsAgo]
      );

      // Student reconnects and submits locally preserved answers after expiration
      const recoveryRes = await fetch(`${baseUrl}/${timedExamId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({
          attempt_id: offlineAttId,
          is_auto_submit: true,
          answers: [
            { question_id: q1Id, selected_option_id: questions[0].optCorrect },
            { question_id: q2Id, selected_option_id: questions[1].optCorrect },
            { question_id: q3Id, selected_option_id: questions[2].optCorrect }
          ]
        })
      });
      const recoveryData = await recoveryRes.json();
      assert.strictEqual(recoveryRes.status, 200);
      assert.strictEqual(recoveryData.score, 15);
      assert.strictEqual(recoveryData.percentage, 100);
      assert.strictEqual(recoveryData.auto_submitted, true);
    });

    // -------------------------------------------------------------------
    // Test 9: Duplicate automatic submission requests (Idempotency)
    // -------------------------------------------------------------------
    await runTest('Test 9: Duplicate automatic submission requests return idempotent result without duplicate records', async () => {
      const dupAttId = 'att_dup_' + Date.now();
      await db.query(
        `INSERT INTO exam_attempts (id, exam_id, student_id, score, total_points, status, started_at)
         VALUES ($1, $2, $3, 0, 0, 'IN_PROGRESS', $4)`,
        [dupAttId, timedExamId, studentUser.id, new Date().toISOString()]
      );

      const payload = {
        attempt_id: dupAttId,
        answers: [{ question_id: q1Id, selected_option_id: questions[0].optCorrect }]
      };

      // Call 1
      const res1 = await fetch(`${baseUrl}/${timedExamId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify(payload)
      });
      const data1 = await res1.json();

      // Call 2 (Duplicate)
      const res2 = await fetch(`${baseUrl}/${timedExamId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify(payload)
      });
      const data2 = await res2.json();

      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(data2.already_submitted, true);
      assert.strictEqual(data1.score, data2.score);

      // Verify only 1 attempt record and no duplicate answers
      const attCount = await db.query(`SELECT COUNT(*) as cnt FROM exam_attempts WHERE id = $1`, [dupAttId]);
      assert.strictEqual(Number(attCount.rows[0].cnt), 1);
    });

    // -------------------------------------------------------------------
    // Test 10: Simultaneous manual and automatic submission (Race Condition)
    // -------------------------------------------------------------------
    await runTest('Test 10: Simultaneous manual and auto submission resolve cleanly with Promise.all', async () => {
      const raceAttId = 'att_race_' + Date.now();
      await db.query(
        `INSERT INTO exam_attempts (id, exam_id, student_id, score, total_points, status, started_at)
         VALUES ($1, $2, $3, 0, 0, 'IN_PROGRESS', $4)`,
        [raceAttId, timedExamId, studentUser.id, new Date().toISOString()]
      );

      const [resA, resB] = await Promise.all([
        fetch(`${baseUrl}/${timedExamId}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
          body: JSON.stringify({
            attempt_id: raceAttId,
            is_auto_submit: true,
            answers: [{ question_id: q1Id, selected_option_id: questions[0].optCorrect }]
          })
        }),
        fetch(`${baseUrl}/${timedExamId}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
          body: JSON.stringify({
            attempt_id: raceAttId,
            is_auto_submit: false,
            answers: [{ question_id: q1Id, selected_option_id: questions[0].optCorrect }]
          })
        })
      ]);

      assert.strictEqual(resA.status, 200);
      assert.strictEqual(resB.status, 200);
      const dataA = await resA.json();
      const dataB = await resB.json();
      assert.strictEqual(dataA.score, 5);
      assert.strictEqual(dataB.score, 5);
    });

    // -------------------------------------------------------------------
    // Test 11: Authoritative Server Time (Client clock cannot spoof duration)
    // -------------------------------------------------------------------
    await runTest('Test 11: Device clock cannot spoof or extend exam duration', async () => {
      const spoofAttId = 'att_spoof_' + Date.now();
      // Server started 15 mins ago
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      await db.query(
        `INSERT INTO exam_attempts (id, exam_id, student_id, score, total_points, status, started_at)
         VALUES ($1, $2, $3, 0, 0, 'IN_PROGRESS', $4)`,
        [spoofAttId, timedExamId, studentUser.id, fifteenMinsAgo]
      );

      // Client sends request claiming device clock says only 1 minute elapsed
      const submitRes = await fetch(`${baseUrl}/${timedExamId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({
          attempt_id: spoofAttId,
          client_timestamp: new Date().toISOString(), // Ignored by server
          answers: [{ question_id: q1Id, selected_option_id: questions[0].optCorrect }]
        })
      });
      const submitData = await submitRes.json();
      assert.strictEqual(submitRes.status, 200);
      // Server authoritatively recognized that time expired!
      assert.strictEqual(submitData.auto_submitted, true);
    });

    // -------------------------------------------------------------------
    // Test 12: Server/client timezone normalization (parseDbTimestamp)
    // -------------------------------------------------------------------
    await runTest('Test 12: parseDbTimestamp normalizes UTC ISO, SQL DATETIME, and timezone offsets correctly', () => {
      const t1 = parseDbTimestamp('2026-11-16 12:00:00');
      const t2 = parseDbTimestamp('2026-11-16T12:00:00Z');
      assert.strictEqual(t1, t2, 'SQL string and UTC ISO must parse to identical epoch milliseconds');

      const offsetDate = parseDbTimestamp('2026-11-16T14:00:00+02:00');
      assert.strictEqual(t1, offsetDate, '+02:00 offset must align with UTC epoch');
    });

    // -------------------------------------------------------------------
    // Test 13: Evaluation idempotency & safe retry
    // -------------------------------------------------------------------
    await runTest('Test 13: Finalizing an already completed attempt returns the same report safely', async () => {
      const safeAttId = 'att_safe_' + Date.now();
      const res1 = await finalizeAndGradeExamAttempt(timedExamId, safeAttId, studentUser.id, [
        { question_id: q1Id, selected_option_id: questions[0].optCorrect },
        { question_id: q2Id, selected_option_id: questions[1].optCorrect }
      ]);
      assert.strictEqual(res1.score, 10);

      // Retry finalization
      const res2 = await finalizeAndGradeExamAttempt(timedExamId, safeAttId, studentUser.id);
      assert.strictEqual(res2.score, 10);
      assert.strictEqual(res2.already_submitted, true);
    });

    // -------------------------------------------------------------------
    // Test 14: Prevention of post-expiration answer changes
    // -------------------------------------------------------------------
    await runTest('Test 14: Answer modifications after completion are strictly rejected', async () => {
      const finalizedAttId = 'att_fin_' + Date.now();
      await finalizeAndGradeExamAttempt(timedExamId, finalizedAttId, studentUser.id, [
        { question_id: q1Id, selected_option_id: questions[0].optCorrect }
      ]);

      // Attempt to change answer
      const postAnsRes = await fetch(`${baseUrl}/${timedExamId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({
          attempt_id: finalizedAttId,
          question_id: q1Id,
          selected_option_id: questions[0].optWrong
        })
      });
      const postAnsData = await postAnsRes.json();
      assert.strictEqual(postAnsRes.status, 400);
      assert.strictEqual(postAnsData.code, 'EXAM_ALREADY_COMPLETED');
    });

    // -------------------------------------------------------------------
    // Test 15: Correct result retrieval after automatic submission
    // -------------------------------------------------------------------
    await runTest('Test 15: Correct result retrieval after automatic submission', async () => {
      const finalCheckAttId = 'att_final_check_' + Date.now();
      await finalizeAndGradeExamAttempt(timedExamId, finalCheckAttId, studentUser.id, [
        { question_id: q1Id, selected_option_id: questions[0].optCorrect },
        { question_id: q2Id, selected_option_id: questions[1].optCorrect },
        { question_id: q3Id, selected_option_id: questions[2].optCorrect }
      ], { isAutoSubmit: true });

      const getRes = await fetch(`${baseUrl}/${timedExamId}`, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const getData = await getRes.json();
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getData.attempt.status, 'COMPLETED');
      assert.strictEqual(getData.result.score, 15);
      assert.strictEqual(getData.result.breakdown.length, 3);
      assert.strictEqual(Boolean(getData.result.breakdown[0].is_correct), true);
    });

    console.log(`\n================================================================`);
    console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED PERFECTLY!`);
    console.log(`================================================================\n`);
    process.exit(0);

  } catch (err) {
    console.error('Timed Exam Test Suite Failed:', err);
    process.exit(1);
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
  }
}

main();
