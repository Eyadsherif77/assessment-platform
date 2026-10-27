import assert from 'assert';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { setupDisposableTestDb, assertDatabaseIsDisposable, teardownDisposableTestDb } from './test_isolation_helper.mjs';

console.log('================================================================');
console.log('FARABI AI — SERVER-ENFORCED EXAM DEADLINE TEST SUITE');
console.log('Authoritative Timestamps | Refresh Resilience | Clock Immunity');
console.log('================================================================\n');

const { tempDir, dbPath } = setupDisposableTestDb('server_enforced_deadline');

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
  let db = null;

  try {
    // 1. Initialize Disposable Database
    const dbModule = await import('../dist/db/db.js');
    db = dbModule.db || dbModule.default || dbModule;
    await db.init();
    assertDatabaseIsDisposable(db, dbPath);

    const { generateToken } = await import('../dist/middleware/auth.js');
    const examsRouterModule = await import('../dist/routes/exams.js');
    const examsRouter = examsRouterModule.default || examsRouterModule;

    // 2. Seed Academic Stage, Grade, and Subject
    const stageId = 'stage_' + uuidv4();
    await db.query(`INSERT INTO academic_stages (id, code, name_ar, name_en, sort_order) VALUES ($1, $2, $3, $4, 1)`,
      [stageId, 'PREP_' + uuidv4(), 'المرحلة الإعدادية', 'Preparatory']);

    const gradeId = 'grade_' + uuidv4();
    await db.query(`INSERT INTO grades (id, stage_id, code, name_ar, name_en, sort_order) VALUES ($1, $2, $3, $4, $5, 1)`,
      [gradeId, stageId, 'PREP_3_' + uuidv4(), 'الصف الثالث الإعدادي', 'Prep 3']);

    const subjectId = 'subj_' + uuidv4();
    await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'SCIENCE', 'العلوم', 'Science')`,
      [subjectId, gradeId]);

    // 3. Seed Student User and Profile
    const studentId = 'student_' + uuidv4();
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'student_deadline@farabi.edu', 'hash', 'STUDENT', 'طالب اختبار المهل', 1)`,
      [studentId]
    );

    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_name, school_type)
       VALUES ($1, 'طالب اختبار المهل', $2, $3, 'مدرسة النخبة', 'عربي')`,
      [studentId, stageId, gradeId]
    );

    const studentToken = generateToken({
      id: studentId,
      email: 'student_deadline@farabi.edu',
      role: 'STUDENT',
      fullName: 'طالب اختبار المهل',
      academicStageId: stageId,
      gradeId: gradeId,
      schoolType: 'عربي'
    });

    // 3b. Seed Teacher User
    const teacherId = 'teacher_' + uuidv4();
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'teacher_deadline@farabi.edu', 'hash', 'TEACHER', 'أستاذ العلوم', 1)`,
      [teacherId]
    );

    // 4. Seed Exam with 2 Questions (Duration: 5 minutes = 300 seconds)
    const examId = 'exam_' + uuidv4();
    await db.query(
      `INSERT INTO exams (id, teacher_id, academic_stage_id, grade_id, subject_id, term, title_ar, title_en, duration_minutes, is_published, school_type)
       VALUES ($1, $2, $3, $4, $5, 1, 'امتحان الفيزياء الدورية', 'Physics Periodic Exam', 5, 1, 'كلاهما')`,
      [examId, teacherId, stageId, gradeId, subjectId]
    );

    const q1Id = 'q1_' + uuidv4();
    const q1OptA = 'opt1a_' + uuidv4();
    const q1OptB = 'opt1b_' + uuidv4();
    await db.query(
      `INSERT INTO exam_questions (id, exam_id, question_text, points, explanation, page_reference, order_index)
       VALUES ($1, $2, 'ما هي وحدة قياس القوة؟', 10, 'القوة تقاس بوحدة النيوتن طبقاً لقانون نيوتن الثاني', 24, 1)`,
      [q1Id, examId]
    );
    await db.query(
      `INSERT INTO exam_question_options (id, question_id, option_text, is_correct)
       VALUES ($1, $2, 'النيوتن', 1), ($3, $2, 'الجول', 0)`,
      [q1OptA, q1Id, q1OptB]
    );

    const q2Id = 'q2_' + uuidv4();
    const q2OptA = 'opt2a_' + uuidv4();
    const q2OptB = 'opt2b_' + uuidv4();
    await db.query(
      `INSERT INTO exam_questions (id, exam_id, question_text, points, explanation, page_reference, order_index)
       VALUES ($1, $2, 'السرعة هي الإزاحة مقسومة على:', 10, 'السرعة المتجهة = الإزاحة / الزمن', 15, 2)`,
      [q2Id, examId]
    );
    await db.query(
      `INSERT INTO exam_question_options (id, question_id, option_text, is_correct)
       VALUES ($1, $2, 'الزمن', 1), ($3, $2, 'الكتلة', 0)`,
      [q2OptA, q2Id, q2OptB]
    );

    // 5. Setup Express app
    const app = express();
    app.use(express.json());
    app.use('/api/exams', examsRouter);

    serverInstance = app.listen(0);
    const port = serverInstance.address().port;
    const baseUrl = `http://localhost:${port}`;

    let activeAttemptId = null;
    let initialStartedAt = null;

    // ------------------------------------------------------------------------
    // TEST 1: Initial Attempt Creation & Authoritative Timing
    // ------------------------------------------------------------------------
    await runTest('GET /api/exams/:id initializes authoritative attempt with started_at and deadline', async () => {
      const res = await fetch(`${baseUrl}/api/exams/${examId}`, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.ok(data.attempt, 'Response must include attempt object');
      assert.strictEqual(data.attempt.status, 'IN_PROGRESS');
      assert.strictEqual(data.attempt.duration_minutes, 5);
      assert.ok(data.attempt.remaining_seconds > 290 && data.attempt.remaining_seconds <= 300);
      assert.ok(data.attempt.started_at, 'started_at timestamp must be populated');
      assert.ok(data.attempt.deadline, 'deadline ISO string must be populated');

      activeAttemptId = data.attempt.id;
      initialStartedAt = data.attempt.started_at;

      // Verify in DB
      const dbAttempt = (await db.query(`SELECT * FROM exam_attempts WHERE id = $1`, [activeAttemptId])).rows[0];
      assert.ok(dbAttempt, 'DB record must exist');
      assert.strictEqual(dbAttempt.status, 'IN_PROGRESS');
      assert.strictEqual(dbAttempt.student_id, studentId);
    });

    // ------------------------------------------------------------------------
    // TEST 2: Correct Answers Remain Hidden During Exam
    // ------------------------------------------------------------------------
    await runTest('GET /api/exams/:id hides is_correct and explanation from students', async () => {
      const res = await fetch(`${baseUrl}/api/exams/${examId}`, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const data = await res.json();

      for (const q of data.questions) {
        assert.strictEqual(q.explanation, undefined, 'Student must not see question explanation');
        for (const opt of q.options) {
          assert.strictEqual(opt.is_correct, undefined, 'Student must not see is_correct flag');
        }
      }
    });

    // ------------------------------------------------------------------------
    // TEST 3: Refreshing Page Does NOT Reset Deadline
    // ------------------------------------------------------------------------
    await runTest('Refreshing student exam page retains original started_at and counts down monotonically', async () => {
      // Simulate small passage of time (100ms)
      await new Promise(r => setTimeout(r, 150));

      const res = await fetch(`${baseUrl}/api/exams/${examId}`, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      const data = await res.json();

      assert.strictEqual(data.attempt.id, activeAttemptId, 'Attempt ID must remain identical on refresh');
      assert.strictEqual(data.attempt.started_at, initialStartedAt, 'started_at must NOT be reset on refresh');
      assert.ok(data.attempt.remaining_seconds <= 300, 'Remaining seconds must be <= original duration');
    });

    // ------------------------------------------------------------------------
    // TEST 4: Changing Device Clock Does Not Extend Attempt
    // ------------------------------------------------------------------------
    await runTest('Device clock alteration cannot extend remaining time (server calculates elapsed time)', async () => {
      // Client sending headers or local time changes has zero effect
      const res = await fetch(`${baseUrl}/api/exams/${examId}`, {
        headers: {
          Authorization: `Bearer ${studentToken}`,
          'Date': new Date(Date.now() - 3600000).toUTCString() // Spoofed client clock
        }
      });
      const data = await res.json();
      assert.strictEqual(data.attempt.started_at, initialStartedAt);
      assert.ok(data.attempt.remaining_seconds <= 300);
    });

    // ------------------------------------------------------------------------
    // TEST 5: Answer Mutation Endpoint Works Within Deadline
    // ------------------------------------------------------------------------
    await runTest('POST /api/exams/:id/answers mutates student answer while attempt is in progress', async () => {
      const res = await fetch(`${baseUrl}/api/exams/${examId}/answers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`
        },
        body: JSON.stringify({
          attempt_id: activeAttemptId,
          question_id: q1Id,
          selected_option_id: q1OptA
        })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.saved, true);

      // Verify answer recorded in DB
      const ansDb = (await db.query(
        `SELECT * FROM student_answers WHERE attempt_id = $1 AND question_id = $2`,
        [activeAttemptId, q1Id]
      )).rows[0];
      assert.ok(ansDb);
      assert.strictEqual(ansDb.selected_option_id, q1OptA);
    });

    // ------------------------------------------------------------------------
    // TEST 5b: Answer Mutation Validates Question ID Ownership
    // ------------------------------------------------------------------------
    await runTest('POST /api/exams/:id/answers rejects foreign question_id with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/exams/${examId}/answers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`
        },
        body: JSON.stringify({
          attempt_id: activeAttemptId,
          question_id: 'fake_question_' + uuidv4(),
          selected_option_id: q1OptA
        })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('غير تابع لهذا الاختبار'));
    });

    // ------------------------------------------------------------------------
    // TEST 5c: Answer Mutation Validates Option ID Ownership
    // ------------------------------------------------------------------------
    await runTest('POST /api/exams/:id/answers rejects non-belonging selected_option_id with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/exams/${examId}/answers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`
        },
        body: JSON.stringify({
          attempt_id: activeAttemptId,
          question_id: q1Id,
          selected_option_id: 'fake_opt_' + uuidv4()
        })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('غير تابع لهذا السؤال'));
    });

    // ------------------------------------------------------------------------
    // TEST 6: Submissions After Expiration Are Rejected (HTTP 403)
    // ------------------------------------------------------------------------
    await runTest('Submissions after deadline expiration are rejected with HTTP 403 and marked ABANDONED', async () => {
      // Seed an expired attempt (started 15 minutes ago on a 5-minute exam)
      const expiredAttemptId = 'expired_att_' + uuidv4();
      const expiredStartTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();

      await db.query(
        `INSERT INTO exam_attempts (id, exam_id, student_id, score, total_points, status, started_at)
         VALUES ($1, $2, $3, 0, 0, 'IN_PROGRESS', $4)`,
        [expiredAttemptId, examId, studentId, expiredStartTime]
      );

      const submitRes = await fetch(`${baseUrl}/api/exams/${examId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`
        },
        body: JSON.stringify({
          attempt_id: expiredAttemptId,
          answers: [
            { question_id: q1Id, selected_option_id: q1OptA },
            { question_id: q2Id, selected_option_id: q2OptA }
          ]
        })
      });

      assert.strictEqual(submitRes.status, 403, 'Must reject expired attempt with HTTP 403');
      const errData = await submitRes.json();
      assert.strictEqual(errData.code, 'EXAM_TIME_EXPIRED');

      // Verify attempt is marked ABANDONED in DB
      const attemptDb = (await db.query(`SELECT status FROM exam_attempts WHERE id = $1`, [expiredAttemptId])).rows[0];
      assert.strictEqual(attemptDb.status, 'ABANDONED', 'Expired attempt must be marked ABANDONED');
    });

    // ------------------------------------------------------------------------
    // TEST 7: Answer Mutations After Expiration Are Rejected (HTTP 403)
    // ------------------------------------------------------------------------
    await runTest('Answer mutations after deadline expiration are rejected with HTTP 403', async () => {
      const expiredAttemptId2 = 'expired_att2_' + uuidv4();
      const expiredStartTime = new Date(Date.now() - 12 * 60 * 1000).toISOString();

      await db.query(
        `INSERT INTO exam_attempts (id, exam_id, student_id, score, total_points, status, started_at)
         VALUES ($1, $2, $3, 0, 0, 'IN_PROGRESS', $4)`,
        [expiredAttemptId2, examId, studentId, expiredStartTime]
      );

      const res = await fetch(`${baseUrl}/api/exams/${examId}/answers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`
        },
        body: JSON.stringify({
          attempt_id: expiredAttemptId2,
          question_id: q1Id,
          selected_option_id: q1OptB
        })
      });

      assert.strictEqual(res.status, 403);
      const errData = await res.json();
      assert.strictEqual(errData.code, 'EXAM_TIME_EXPIRED');
    });

    // ------------------------------------------------------------------------
    // TEST 8: Successful Submission Within Deadline
    // ------------------------------------------------------------------------
    let initialSubmitResult = null;
    await runTest('Successful submission within deadline scores answers, updates attempt to COMPLETED, and releases results', async () => {
      const res = await fetch(`${baseUrl}/api/exams/${examId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`
        },
        body: JSON.stringify({
          attempt_id: activeAttemptId,
          answers: [
            { question_id: q1Id, selected_option_id: q1OptA }, // Correct (10 pts)
            { question_id: q2Id, selected_option_id: q2OptA }  // Correct (10 pts)
          ]
        })
      });

      assert.strictEqual(res.status, 200);
      initialSubmitResult = await res.json();

      assert.strictEqual(initialSubmitResult.score, 20);
      assert.strictEqual(initialSubmitResult.total_points, 20);
      assert.strictEqual(initialSubmitResult.percentage, 100);
      assert.strictEqual(initialSubmitResult.passed, true);
      assert.strictEqual(initialSubmitResult.breakdown.length, 2);

      // Verify DB attempt status is now COMPLETED
      const dbAttempt = (await db.query(`SELECT * FROM exam_attempts WHERE id = $1`, [activeAttemptId])).rows[0];
      assert.strictEqual(dbAttempt.status, 'COMPLETED');
      assert.strictEqual(dbAttempt.score, 20);
      assert.ok(dbAttempt.completed_at);
    });

    // ------------------------------------------------------------------------
    // TEST 9: Duplicate Submissions Do NOT Create Duplicate Records
    // ------------------------------------------------------------------------
    await runTest('Duplicate submission returns existing result idempotently without inserting duplicate records', async () => {
      const countBefore = Number((await db.query(
        `SELECT COUNT(*) as c FROM exam_attempts WHERE student_id = $1 AND exam_id = $2`,
        [studentId, examId]
      )).rows[0].c);

      const answersCountBefore = Number((await db.query(
        `SELECT COUNT(*) as c FROM student_answers sa JOIN exam_attempts ea ON sa.attempt_id = ea.id WHERE ea.student_id = $1`,
        [studentId]
      )).rows[0].c);

      // Resubmit the exact same exam
      const res = await fetch(`${baseUrl}/api/exams/${examId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`
        },
        body: JSON.stringify({
          attempt_id: activeAttemptId,
          answers: [
            { question_id: q1Id, selected_option_id: q1OptB }, // Try different answer on resubmit
            { question_id: q2Id, selected_option_id: q2OptB }
          ]
        })
      });

      assert.strictEqual(res.status, 200);
      const duplicateData = await res.json();

      assert.strictEqual(duplicateData.already_submitted, true);
      assert.strictEqual(duplicateData.score, 20, 'Original score must be preserved');
      assert.strictEqual(duplicateData.attempt_id, activeAttemptId);

      // Verify NO new attempts or student_answers were added
      const countAfter = Number((await db.query(
        `SELECT COUNT(*) as c FROM exam_attempts WHERE student_id = $1 AND exam_id = $2`,
        [studentId, examId]
      )).rows[0].c);
      const answersCountAfter = Number((await db.query(
        `SELECT COUNT(*) as c FROM student_answers sa JOIN exam_attempts ea ON sa.attempt_id = ea.id WHERE ea.student_id = $1`,
        [studentId]
      )).rows[0].c);

      assert.strictEqual(countAfter, countBefore, 'Total attempt count must remain unchanged');
      assert.strictEqual(answersCountAfter, answersCountBefore, 'Total answers count must remain unchanged');
    });

    // ------------------------------------------------------------------------
    // TEST 10: Backward Compatibility: Direct Submit Without Prior GET
    // ------------------------------------------------------------------------
    await runTest('Backward compatibility: direct submission without prior GET succeeds', async () => {
      const legacyStudentId = 'legacy_stud_' + uuidv4();
      await db.query(
        `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
         VALUES ($1, 'legacy@farabi.edu', 'hash', 'STUDENT', 'طالب قديم', 1)`,
        [legacyStudentId]
      );
      await db.query(
        `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_name, school_type)
         VALUES ($1, 'طالب قديم', $2, $3, 'مدرسة النخبة', 'عربي')`,
        [legacyStudentId, stageId, gradeId]
      );
      const legacyToken = generateToken({
        id: legacyStudentId,
        email: 'legacy@farabi.edu',
        role: 'STUDENT',
        fullName: 'طالب قديم',
        academicStageId: stageId,
        gradeId: gradeId,
        schoolType: 'عربي'
      });

      const res = await fetch(`${baseUrl}/api/exams/${examId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${legacyToken}`
        },
        body: JSON.stringify({
          answers: [{ question_id: q1Id, selected_option_id: q1OptA }]
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.score, 10);
      assert.strictEqual(data.total_points, 20);
      assert.ok(data.attempt_id);
    });

    console.log(`\n================================================================`);
    console.log(`ALL DEADLINE ENFORCEMENT TESTS PASSED: ${passedTests}/${totalTests}`);
    console.log(`================================================================\n`);
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exitCode = 1;
  } finally {
    if (serverInstance) serverInstance.close();
    if (db) await teardownDisposableTestDb(db, tempDir);
  }
}

main();
