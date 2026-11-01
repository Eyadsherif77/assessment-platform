import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { setupDisposableTestDb, assertDatabaseIsDisposable } from './test_isolation_helper.mjs';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import http from 'http';

const { tempDir, dbPath } = setupDisposableTestDb('student_analytics_calc');

console.log('================================================================');
console.log('FARABI AI — STUDENT LIVE ANALYTICS & MASTERY CALCULATIONS TEST SUITE');
console.log('Zero Mock/Static Values | Connected Live Numbers | $0 AI Spend');
console.log('================================================================\n');

async function main() {
  let serverInstance = null;
  try {
    // 1. Initialize disposable DB
    const dbModule = await import('../dist/db/db.js');
    const db = dbModule.db || dbModule.default || dbModule;
    await db.init();
    assertDatabaseIsDisposable(db, dbPath);

    // 2. Fetch seeded Stage & Grade
    const prepStageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PREPARATORY'`);
    const stagePrepId = prepStageRes.rows[0].id;

    const prep3GradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PREP_3'`);
    const gradePrep3Id = prep3GradeRes.rows[0].id;

    // 3. Seed Science Subject
    const sciSubjId = 'subj_sci_calc_' + Date.now();
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en, sort_order)
       VALUES ($1, $2, 'SCIENCE', 'العلوم', 'Science', 1)`,
      [sciSubjId, gradePrep3Id]
    );

    // 4. Seed Book & Chapter
    const bookId = 'book_sci_calc_' + Date.now();
    await db.query(
      `INSERT INTO books (id, title_ar, title_en, subject_id, grade_id, academic_stage_id, term, file_url, processing_status, total_pages)
       VALUES ($1, 'كتاب العلوم - الصف الثالث الإعدادي', 'Science - Prep 3', $2, $3, $4, 1, 'https://storage/science.pdf', 'COMPLETED', 120)`,
      [bookId, sciSubjId, gradePrep3Id, stagePrepId]
    );

    const chapterId = 'ch_sci_calc_' + Date.now();
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 1, 'الوحدة الأولى: القوى والحركة', 'Unit 1: Force and Motion', 1, 30)`,
      [chapterId, bookId]
    );

    // 5. Seed Users
    const { generateToken } = await import('../dist/middleware/auth.js');

    const studentId = 'student_calc_' + Date.now();
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, role)
       VALUES ($1, 'ali.calc@farabi.edu', 'hash', 'علي محمد أحمد', 'STUDENT')`,
      [studentId]
    );
    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_type, student_code)
       VALUES ($1, 'علي محمد أحمد', $2, $3, 'عربي', 'FAR-STD-001')`,
      [studentId, stagePrepId, gradePrep3Id]
    );

    const teacherId = 'teacher_calc_' + Date.now();
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, role)
       VALUES ($1, 'teacher.calc@farabi.edu', 'hash', 'أحمد سامي - معلم العلوم', 'TEACHER')`,
      [teacherId]
    );
    await db.query(
      `INSERT INTO teacher_profiles (user_id, full_name, specialization, grade_id, subject_id, academic_stage_id)
       VALUES ($1, 'أحمد سامي', 'العلوم', $2, $3, $4)`,
      [teacherId, gradePrep3Id, sciSubjId, stagePrepId]
    );

    const adminId = 'admin_calc_' + Date.now();
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, role)
       VALUES ($1, 'admin.calc@farabi.edu', 'hash', 'مدير النظام', 'ADMIN')`,
      [adminId]
    );

    const studentToken = generateToken({ id: studentId, email: 'ali.calc@farabi.edu', role: 'STUDENT' });
    const teacherToken = generateToken({ id: teacherId, email: 'teacher.calc@farabi.edu', role: 'TEACHER' });
    const adminToken = generateToken({ id: adminId, email: 'admin.calc@farabi.edu', role: 'ADMIN' });

    // 6. Launch Test Server
    const analyticsRouter = (await import('../dist/routes/analytics.js')).default;
    const examsRouter = (await import('../dist/routes/exams.js')).default;
    const adminRouter = (await import('../dist/routes/admin.js')).default;

    const app = express();
    app.use(express.json());
    app.use('/api/analytics', analyticsRouter);
    app.use('/api/exams', examsRouter);
    app.use('/api/admin', adminRouter);

    serverInstance = http.createServer(app);
    await new Promise(r => serverInstance.listen(0, r));
    const port = serverInstance.address().port;
    const BASE_URL = `http://127.0.0.1:${port}`;

    let passedTests = 0;

    // -----------------------------------------------------------------------
    // TEST 1: Initial Empty Baseline
    // -----------------------------------------------------------------------
    console.log('▶ Test 1: Initial empty state returns 0% cumulative mastery and empty lists');
    const resInit = await fetch(`${BASE_URL}/api/analytics/student`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert.strictEqual(resInit.status, 200);
    const dataInit = await resInit.json();
    assert.strictEqual(dataInit.summary.overall_mastery_percentage, 0, 'New student overall mastery must be 0');
    assert.strictEqual(dataInit.summary.total_exams_taken, 0, 'Total exams taken must be 0');
    assert.strictEqual(dataInit.summary.mastered_topics_count, 0, 'Mastered topics count must be 0');
    assert.strictEqual(dataInit.completed_exams.length, 0, 'Completed exams must be empty');
    console.log('  ✔ Passed: Baseline student analytics correctly initialized with 0%\n');
    passedTests++;

    // -----------------------------------------------------------------------
    // TEST 2: AI Diagnostic Assessment with evaluation_report recovery
    // -----------------------------------------------------------------------
    console.log('▶ Test 2: AI Diagnostic Assessment is immediately reflected in completed_exams and cumulative mastery');
    const evalId = uuidv4();
    const evaluationReport = {
      evaluation_id: evalId,
      score: 4,
      max_score: 5,
      percentage: 80,
      provisional_score: 4,
      provisional_max_score: 5,
      provisional_percentage: 80,
      items: [
        { question_text: 'ما هي وحدة قياس السرعة؟', is_correct: true },
        { question_text: 'ما هو تعريف السرعة النسبية؟', is_correct: true },
        { question_text: 'السرعة القياسية كمية قياسية؟', is_correct: true },
        { question_text: 'حساب العجلة من القانون ع/ز', is_correct: true },
        { question_text: 'حركة قطار بسرعة منتظمة', is_correct: false }
      ],
      weak_topics: ['حركة قطار بسرعة منتظمة'],
      strong_topics: ['وحدة قياس السرعة', 'تعريف السرعة النسبية']
    };

    // Insert AI evaluation with report
    await db.query(
      `INSERT INTO ai_evaluations (
        id, student_id, book_id, chapter_id, subject_id, score, total_questions,
        questions_data, student_answers_data, evaluation_report, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        evalId, studentId, bookId, chapterId, sciSubjId, 0, 0,
        '[]', '[]', JSON.stringify(evaluationReport), new Date().toISOString()
      ]
    );

    const resAfterAi = await fetch(`${BASE_URL}/api/analytics/student`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert.strictEqual(resAfterAi.status, 200);
    const dataAfterAi = await resAfterAi.json();

    assert.strictEqual(dataAfterAi.completed_exams.length, 1, 'Should have 1 completed exam');
    const aiExam = dataAfterAi.completed_exams[0];
    assert.strictEqual(aiExam.score, 4, 'Recovered score must be 4');
    assert.strictEqual(aiExam.total, 5, 'Recovered total questions must be 5');
    assert.strictEqual(aiExam.percentage, 80, 'Percentage must be 80%');
    assert.strictEqual(aiExam.status, 'MASTERED', 'Status must be MASTERED');
    assert.strictEqual(aiExam.type, 'AI_DIAGNOSTIC');
    assert.strictEqual(aiExam.subject_name_ar, 'العلوم');
    assert.strictEqual(aiExam.chapter_title_ar, 'الوحدة الأولى: القوى والحركة');

    assert.strictEqual(dataAfterAi.summary.overall_mastery_percentage, 80, 'Overall mastery must be exactly 80%');
    assert.strictEqual(dataAfterAi.summary.total_exams_taken, 1, 'Total exams taken must be 1');
    assert.strictEqual(dataAfterAi.summary.mastered_topics_count, 1, 'Mastered units count must be 1');
    assert.strictEqual(dataAfterAi.summary.study_streak_days >= 1, true, 'Streak days must be at least 1');
    assert.strictEqual(dataAfterAi.topics.length, 1, 'Topics breakdown must have 1 unit');
    assert.strictEqual(dataAfterAi.topics[0].mastery_percentage, 80, 'Unit mastery percentage must be 80%');

    console.log('  ✔ Passed: AI Diagnostic Assessment dynamic calculation and unit breakdown verified (80%)\n');
    passedTests++;

    // -----------------------------------------------------------------------
    // TEST 3: Timed Exam Submission & Cumulative Average Calculation
    // -----------------------------------------------------------------------
    console.log('▶ Test 3: Timed Exam Submission updates student_topic_mastery and calculates live weighted average');
    const examId = uuidv4();
    await db.query(
      `INSERT INTO exams (
        id, title_ar, title_en, teacher_id, academic_stage_id, grade_id, subject_id, chapter_id, duration_minutes, is_published
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        examId, 'اختبار تجريبي في الوحدة الأولى', 'Unit 1 Practice Exam',
        teacherId, stagePrepId, gradePrep3Id, sciSubjId, chapterId, 30, 1
      ]
    );

    const q1Id = uuidv4();
    const q2Id = uuidv4();
    await db.query(`INSERT INTO exam_questions (id, exam_id, question_text, points, order_index) VALUES ($1, $2, $3, $4, $5)`, [
      q1Id, examId, 'علل: تعتبر حركة المترو من أمثلة الحركة في اتجاه واحد؟', 10, 1
    ]);
    await db.query(`INSERT INTO exam_questions (id, exam_id, question_text, points, order_index) VALUES ($1, $2, $3, $4, $5)`, [
      q2Id, examId, 'ما هي السرعة المتوسطة لجسم يقطع 100م في 10ث؟', 10, 2
    ]);

    const opt1Id = uuidv4();
    const opt2Id = uuidv4();
    await db.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, $3, $4)`, [
      opt1Id, q1Id, 'لأنه يتحرك للأمام أو للخلف في مسار مستقيم أو منحنٍ', 1
    ]);
    await db.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, $3, $4)`, [
      opt2Id, q2Id, '10 م/ث', 1
    ]);
    const opt2WrongId = uuidv4();
    await db.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, $3, $4)`, [
      opt2WrongId, q2Id, '20 م/ث', 0
    ]);

    // Submit: 1 correct (opt1), 1 wrong (score 10/20 = 50%)
    const resSubmit = await fetch(`${BASE_URL}/api/exams/${examId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        answers: {
          [q1Id]: opt1Id,
          [q2Id]: opt2WrongId
        }
      })
    });
    assert.strictEqual(resSubmit.status, 200, `Submit failed: ${resSubmit.status}`);
    const submitData = await resSubmit.json();
    assert.strictEqual(submitData.score, 10);
    assert.strictEqual(submitData.total_points, 20);
    assert.strictEqual(submitData.percentage, 50);

    // Verify student analytics now has BOTH exams:
    // Exam 1: 80%, Exam 2: 50% -> Average = Math.round((80 + 50) / 2) = 65%
    const resAfterExam = await fetch(`${BASE_URL}/api/analytics/student`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert.strictEqual(resAfterExam.status, 200);
    const dataAfterExam = await resAfterExam.json();

    assert.strictEqual(dataAfterExam.completed_exams.length, 2, 'Should have 2 completed exams');
    assert.strictEqual(dataAfterExam.summary.total_exams_taken, 2, 'Total exams taken must be 2');
    assert.strictEqual(dataAfterExam.summary.overall_mastery_percentage, 65, 'Overall mastery must be exactly 65% ((80 + 50) / 2)');
    console.log('  ✔ Passed: Cumulative overall mastery correctly averaged: (80% + 50%) / 2 = 65%\n');
    passedTests++;

    // -----------------------------------------------------------------------
    // TEST 4: Teacher Analytics Consistency
    // -----------------------------------------------------------------------
    console.log('▶ Test 4: Teacher Analytics is live and 100% consistent with student exams');
    const resTeacher = await fetch(`${BASE_URL}/api/analytics/teacher?subject_id=${sciSubjId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    assert.strictEqual(resTeacher.status, 200);
    const dataTeacher = await resTeacher.json();

    assert.strictEqual(dataTeacher.recent_attempts.length >= 2, true, 'Teacher should see at least 2 attempts');
    const aliAttempt = dataTeacher.recent_attempts.find(a => a.student_name === 'علي محمد أحمد');
    assert(aliAttempt, 'Teacher must see Ali in recent attempts');
    assert.strictEqual(dataTeacher.stats.avg_score, 65, 'Teacher class average must match student average of 65%');
    console.log('  ✔ Passed: Teacher analytics reflects exact live attempts and 65% average\n');
    passedTests++;

    // -----------------------------------------------------------------------
    // TEST 5: Admin Student Details Consistency
    // -----------------------------------------------------------------------
    console.log('▶ Test 5: Admin Student Details inspection returns identical live attempts and topic mastery');
    const resAdmin = await fetch(`${BASE_URL}/api/admin/students/${studentId}/details`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(resAdmin.status, 200);
    const dataAdmin = await resAdmin.json();

    assert.strictEqual(dataAdmin.student.full_name, 'علي محمد أحمد');
    assert.strictEqual(dataAdmin.attempts.length, 2, 'Admin must see both completed attempts');
    assert.strictEqual(dataAdmin.topicMastery.length >= 1, true, 'Admin must see unit topic mastery');
    console.log('  ✔ Passed: Admin student details inspection 100% aligned with student and teacher\n');
    passedTests++;

    console.log('================================================================');
    console.log(`ALL TESTS PASSED: ${passedTests}/5`);
    console.log('================================================================');

  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

main().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
