import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDisposableTestDb, assertDatabaseIsDisposable, teardownDisposableTestDb } from './test_isolation_helper.mjs';

const { tempDir, dbPath } = setupDisposableTestDb('cross_grade_exam_isolation');

process.env.NODE_ENV = 'test';
process.env.VERCEL = '1'; // Prevent app.listen on port 5000 in server.ts
process.env.AUTO_APPLY_SCHEMA = 'true'; // Allow disposable SQLite schema creation

const { db } = await import('../src/db/db.js');
const { generateToken } = await import('../src/middleware/auth.js');
const { default: app } = await import('../src/server.js');
const { v4: uuidv4 } = await import('uuid');
import type { Server } from 'http';

describe('Universal Cross-Grade Manual Exam Visibility & Authorization Isolation Test', () => {
  let server: Server;
  let baseUrl: string;

  let stagePrepId: string;
  let gradePrep1Id: string;
  let gradePrep3Id: string;

  let subjectPrep1Id: string;
  let subjectPrep3Id: string;

  let teacherPrep3Id: string;
  let teacherPrep1Id: string;

  let studentPrep1Id: string;
  let studentPrep3Id: string;

  let tokenStudentPrep1: string;
  let tokenStudentPrep3: string;
  let tokenTeacherPrep3: string;
  let tokenTeacherPrep1: string;

  let examPrep3Id: string;
  let examPrep1Id: string;

  before(async () => {
    await db.init();
    assertDatabaseIsDisposable(db, dbPath);

    // 1. Fetch preparatory stage and grades
    const stageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PREPARATORY'`);
    stagePrepId = stageRes.rows[0].id;

    const prep1Res = await db.query(`SELECT id FROM grades WHERE code = 'PREP_1'`);
    gradePrep1Id = prep1Res.rows[0].id;

    const prep3Res = await db.query(`SELECT id FROM grades WHERE code = 'PREP_3'`);
    gradePrep3Id = prep3Res.rows[0].id;

    // 2. Insert Subjects for Prep 1 & Prep 3
    subjectPrep1Id = `subj_prep1_${uuidv4()}`;
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'SCIENCE', 'العلوم', 'Science')`,
      [subjectPrep1Id, gradePrep1Id]
    );

    subjectPrep3Id = `subj_prep3_${uuidv4()}`;
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'SCIENCE', 'العلوم', 'Science')`,
      [subjectPrep3Id, gradePrep3Id]
    );

    // 3. Insert Teachers
    teacherPrep3Id = `teach_prep3_${uuidv4()}`;
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'ayman.kamal@test.edu.eg', 'hash', 'TEACHER', 'أيمن كمال', 1)`,
      [teacherPrep3Id]
    );
    await db.query(
      `INSERT INTO teacher_profiles (user_id, full_name, school_name, specialization, academic_stage_id, grade_id, subject_id)
       VALUES ($1, 'أيمن كمال', 'مدرسة النور الإعدادية', 'العلوم', $2, $3, $4)`,
      [teacherPrep3Id, stagePrepId, gradePrep3Id, subjectPrep3Id]
    );

    teacherPrep1Id = `teach_prep1_${uuidv4()}`;
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'hassan.ali@test.edu.eg', 'hash', 'TEACHER', 'حسن علي', 1)`,
      [teacherPrep1Id]
    );
    await db.query(
      `INSERT INTO teacher_profiles (user_id, full_name, school_name, specialization, academic_stage_id, grade_id, subject_id)
       VALUES ($1, 'حسن علي', 'مدرسة الأمل الإعدادية', 'العلوم', $2, $3, $4)`,
      [teacherPrep1Id, stagePrepId, gradePrep1Id, subjectPrep1Id]
    );

    // 4. Insert Students
    studentPrep1Id = `stud_prep1_${uuidv4()}`;
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'ahmed.saleh@test.edu.eg', 'hash', 'STUDENT', 'أحمد صالح', 1)`,
      [studentPrep1Id]
    );
    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_name, school_type)
       VALUES ($1, 'أحمد صالح', $2, $3, 'مدرسة الأمل الإعدادية', 'عربي')`,
      [studentPrep1Id, stagePrepId, gradePrep1Id]
    );

    studentPrep3Id = `stud_prep3_${uuidv4()}`;
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'sara.mahmoud@test.edu.eg', 'hash', 'STUDENT', 'سارة محمود', 1)`,
      [studentPrep3Id]
    );
    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_name, school_type)
       VALUES ($1, 'سارة محمود', $2, $3, 'مدرسة النور الإعدادية', 'عربي')`,
      [studentPrep3Id, stagePrepId, gradePrep3Id]
    );

    // 5. Generate Auth Tokens
    tokenStudentPrep1 = generateToken({
      id: studentPrep1Id,
      email: 'ahmed.saleh@test.edu.eg',
      role: 'STUDENT',
      fullName: 'أحمد صالح'
    });

    tokenStudentPrep3 = generateToken({
      id: studentPrep3Id,
      email: 'sara.mahmoud@test.edu.eg',
      role: 'STUDENT',
      fullName: 'سارة محمود'
    });

    tokenTeacherPrep3 = generateToken({
      id: teacherPrep3Id,
      email: 'ayman.kamal@test.edu.eg',
      role: 'TEACHER',
      fullName: 'أيمن كمال'
    });

    tokenTeacherPrep1 = generateToken({
      id: teacherPrep1Id,
      email: 'hassan.ali@test.edu.eg',
      role: 'TEACHER',
      fullName: 'حسن علي'
    });

    // 6. Create Exams:
    // Exam 1: Prep 3 Science Exam created by Teacher Prep 3 (also marked as style reference)
    examPrep3Id = `exam_p3_${uuidv4()}`;
    await db.query(
      `INSERT INTO exams (id, academic_stage_id, grade_id, subject_id, teacher_id, term, title_ar, title_en, is_published, is_style_reference, school_type)
       VALUES ($1, $2, $3, $4, $5, 1, 'امتحان علوم الصف الثالث الإعدادي', 'Prep 3 Science Exam', 1, 1, 'كلاهما')`,
      [examPrep3Id, stagePrepId, gradePrep3Id, subjectPrep3Id, teacherPrep3Id]
    );

    const q1Id = `q1_${uuidv4()}`;
    await db.query(
      `INSERT INTO exam_questions (id, exam_id, question_text, points, order_index)
       VALUES ($1, $2, 'ما هي السرعة المتجهة؟', 5, 1)`,
      [q1Id, examPrep3Id]
    );
    await db.query(
      `INSERT INTO exam_question_options (id, question_id, option_text, is_correct)
       VALUES ($1, $2, 'السرعة القياسية في اتجاه محدد', 1),
              ($3, $2, 'المسافة الكلية', 0)`,
      [`opt1_${uuidv4()}`, q1Id, `opt2_${uuidv4()}`]
    );

    // Exam 2: Prep 1 Science Exam created by Teacher Prep 1
    examPrep1Id = `exam_p1_${uuidv4()}`;
    await db.query(
      `INSERT INTO exams (id, academic_stage_id, grade_id, subject_id, teacher_id, term, title_ar, title_en, is_published, is_style_reference, school_type)
       VALUES ($1, $2, $3, $4, $5, 1, 'امتحان علوم الصف الأول الإعدادي', 'Prep 1 Science Exam', 1, 0, 'كلاهما')`,
      [examPrep1Id, stagePrepId, gradePrep1Id, subjectPrep1Id, teacherPrep1Id]
    );

    const q2Id = `q2_${uuidv4()}`;
    await db.query(
      `INSERT INTO exam_questions (id, exam_id, question_text, points, order_index)
       VALUES ($1, $2, 'ما هي وحدة قياس الكثافة؟', 5, 1)`,
      [q2Id, examPrep1Id]
    );
    await db.query(
      `INSERT INTO exam_question_options (id, question_id, option_text, is_correct)
       VALUES ($1, $2, 'جم / سم3', 1),
              ($3, $2, 'متر / ثانية', 0)`,
      [`opt3_${uuidv4()}`, q2Id, `opt4_${uuidv4()}`]
    );

    // 7. Start express test server on ephemeral port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await teardownDisposableTestDb(db, tempDir);
  });

  test('1. Prep 1 student listing /api/exams MUST ONLY see Prep 1 exams and NOT Prep 3 exams', async () => {
    const res = await fetch(`${baseUrl}/api/exams?term=1`, {
      headers: { Authorization: `Bearer ${tokenStudentPrep1}` }
    });
    assert.equal(res.status, 200);
    const exams = await res.json();
    assert.ok(Array.isArray(exams));

    const examIds = exams.map((e: any) => e.id);
    assert.ok(examIds.includes(examPrep1Id), 'Prep 1 student should see Prep 1 exam');
    assert.ok(!examIds.includes(examPrep3Id), 'Prep 1 student MUST NOT see Prep 3 exam (even though both are in PREPARATORY stage)');
  });

  test('2. Prep 3 student listing /api/exams MUST ONLY see Prep 3 exams and NOT Prep 1 exams', async () => {
    const res = await fetch(`${baseUrl}/api/exams?term=1`, {
      headers: { Authorization: `Bearer ${tokenStudentPrep3}` }
    });
    assert.equal(res.status, 200);
    const exams = await res.json();
    assert.ok(Array.isArray(exams));

    const examIds = exams.map((e: any) => e.id);
    assert.ok(examIds.includes(examPrep3Id), 'Prep 3 student should see Prep 3 exam');
    assert.ok(!examIds.includes(examPrep1Id), 'Prep 3 student MUST NOT see Prep 1 exam');
  });

  test('3. Prep 1 student attempting direct access GET /api/exams/:id for Prep 3 exam MUST receive 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/exams/${examPrep3Id}`, {
      headers: { Authorization: `Bearer ${tokenStudentPrep1}` }
    });
    assert.equal(res.status, 403, 'Should be 403 Forbidden for cross-grade access');
    const data = await res.json();
    assert.match(data.error, /غير مخصص/);
  });

  test('4. Prep 1 student attempting POST /api/exams/:id/submit for Prep 3 exam MUST receive 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/exams/${examPrep3Id}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenStudentPrep1}`
      },
      body: JSON.stringify({ answers: [] })
    });
    assert.equal(res.status, 403, 'Should be 403 Forbidden for cross-grade submit');
    const data = await res.json();
    assert.match(data.error, /غير مخصص/);
  });

  test('5. Prep 1 student attempting GET /api/exams/:id/attempts for Prep 3 exam MUST receive 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/exams/${examPrep3Id}/attempts`, {
      headers: { Authorization: `Bearer ${tokenStudentPrep1}` }
    });
    assert.equal(res.status, 403, 'Should be 403 Forbidden for cross-grade attempts query');
  });

  test('6. Prep 1 student direct access to own grade exam GET /api/exams/:id succeeds with 200 OK', async () => {
    const res = await fetch(`${baseUrl}/api/exams/${examPrep1Id}`, {
      headers: { Authorization: `Bearer ${tokenStudentPrep1}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.exam.id, examPrep1Id);
    assert.equal(data.questions.length, 1);
  });

  test('7. Prep 3 student direct access to own grade exam GET /api/exams/:id succeeds with 200 OK', async () => {
    const res = await fetch(`${baseUrl}/api/exams/${examPrep3Id}`, {
      headers: { Authorization: `Bearer ${tokenStudentPrep3}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.exam.id, examPrep3Id);
    assert.equal(data.questions.length, 1);
  });

  test('8. Prep 3 student attempting direct access GET /api/exams/:id for Prep 1 exam MUST receive 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/exams/${examPrep1Id}`, {
      headers: { Authorization: `Bearer ${tokenStudentPrep3}` }
    });
    assert.equal(res.status, 403, 'Should be 403 Forbidden for cross-grade access');
  });

  test('9. Prep 3 student attempting POST /api/exams/:id/submit for Prep 1 exam MUST receive 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/exams/${examPrep1Id}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenStudentPrep3}`
      },
      body: JSON.stringify({ answers: [] })
    });
    assert.equal(res.status, 403, 'Should be 403 Forbidden for cross-grade submit');
  });

  test('10. Prep 3 teacher can view and manage their own manual exams via my_only=true', async () => {
    const res = await fetch(`${baseUrl}/api/exams?my_only=true&term=1`, {
      headers: { Authorization: `Bearer ${tokenTeacherPrep3}` }
    });
    assert.equal(res.status, 200);
    const exams = await res.json();
    const ids = exams.map((e: any) => e.id);
    assert.ok(ids.includes(examPrep3Id), 'Teacher Prep 3 should manage their own exam');
    assert.ok(!ids.includes(examPrep1Id), 'Teacher Prep 3 should not see other teacher exams with my_only=true');
  });

  test('11. Prep 1 teacher can view and manage their own manual exams via my_only=true', async () => {
    const res = await fetch(`${baseUrl}/api/exams?my_only=true&term=1`, {
      headers: { Authorization: `Bearer ${tokenTeacherPrep1}` }
    });
    assert.equal(res.status, 200);
    const exams = await res.json();
    const ids = exams.map((e: any) => e.id);
    assert.ok(ids.includes(examPrep1Id), 'Teacher Prep 1 should manage their own exam');
    assert.ok(!ids.includes(examPrep3Id), 'Teacher Prep 1 should not see other teacher exams with my_only=true');
  });

  test('12. Teachers can access style references across authorized channels without leaking to students', async () => {
    const teacherRefRes = await fetch(`${baseUrl}/api/exams/style-references?grade_id=${gradePrep3Id}`, {
      headers: { Authorization: `Bearer ${tokenTeacherPrep3}` }
    });
    const refs = await teacherRefRes.json();
    assert.equal(teacherRefRes.status, 200);
    assert.ok(Array.isArray(refs.style_references));
    assert.equal(refs.style_references[0].id, examPrep3Id);

    // And students cannot access /style-references
    const studentRefRes = await fetch(`${baseUrl}/api/exams/style-references`, {
      headers: { Authorization: `Bearer ${tokenStudentPrep1}` }
    });
    assert.equal(studentRefRes.status, 403, 'Students cannot access style-references endpoint');
  });
});
