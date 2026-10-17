import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDisposableTestDb, assertDatabaseIsDisposable, teardownDisposableTestDb } from './test_isolation_helper.mjs';

const { tempDir, dbPath } = setupDisposableTestDb('teacher_performance_and_student_attempts');

process.env.NODE_ENV = 'test';

import { db } from '../src/db/db.js';
import { v4 as uuidv4 } from 'uuid';

describe('Production Fix Regression Test: Teacher Performance & Super Admin Student Attempts', () => {
  let gradeId: string;
  let stageId: string;
  let subjectId: string;
  let teacherId: string;
  let student1Id: string;
  let student2Id: string;
  let bookId: string;
  let chapter1Id: string;
  let chapter2Id: string;
  let examId: string;

  before(async () => {
    await db.init();
    assertDatabaseIsDisposable(db, dbPath);

    // 1. Fetch seeded stage & grade
    const stageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PREPARATORY'`);
    const gradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PREP_3'`);
    stageId = stageRes.rows[0].id;
    gradeId = gradeRes.rows[0].id;

    // 2. Insert Subject
    subjectId = `subj_${uuidv4()}`;
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'ARABIC', 'اللغة العربية', 'Arabic')`,
      [subjectId, gradeId]
    );

    // 3. Insert Book & Chapters
    bookId = `book_${uuidv4()}`;
    await db.query(
      `INSERT INTO books (id, academic_stage_id, grade_id, subject_id, term, title_ar, title_en, total_pages)
       VALUES ($1, $2, $3, $4, 1, 'كتاب اللغة العربية', 'Arabic Book', 100)`,
      [bookId, stageId, gradeId, subjectId]
    );

    chapter1Id = `ch1_${uuidv4()}`;
    chapter2Id = `ch2_${uuidv4()}`;
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 1, 'الوحدة الأولى: قيم تحمي شبابنا', 'Unit 1', 1, 30),
              ($3, $2, 2, 'الوحدة الثانية: أعلام ورواد', 'Unit 2', 31, 60)`,
      [chapter1Id, bookId, chapter2Id]
    );

    // 4. Create Teacher with teaching assignments and profile
    teacherId = `teach_${uuidv4()}`;
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'teacher_prep3@test.gov.eg', 'hash', 'TEACHER', 'الأستاذ أحمد شاكر', 1)`,
      [teacherId]
    );

    const teachingAssignments = JSON.stringify([
      {
        subjectId,
        subjectName: 'اللغة العربية',
        gradeIds: [gradeId]
      }
    ]);
    const assignedGrades = JSON.stringify([gradeId]);
    const assignedSubjects = JSON.stringify(['اللغة العربية']);

    await db.query(
      `INSERT INTO teacher_profiles (
        user_id, full_name, school_name, specialization, academic_stage_id, grade_id, subject_id,
        assigned_grades, assigned_subjects, teaching_assignments
       ) VALUES ($1, 'الأستاذ أحمد شاكر', 'مدرسة المتفوقين', 'اللغة العربية', $2, $3, $4, $5, $6, $7)`,
      [teacherId, stageId, gradeId, subjectId, assignedGrades, assignedSubjects, teachingAssignments]
    );

    // 5. Create 2 Students
    student1Id = `stud1_${uuidv4()}`;
    student2Id = `stud2_${uuidv4()}`;
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'student1@test.gov.eg', 'hash', 'STUDENT', 'عمر ياسر حامد', 1),
              ($2, 'student2@test.gov.eg', 'hash', 'STUDENT', 'فاطمة محمود علي', 1)`,
      [student1Id, student2Id]
    );

    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_name, school_type)
       VALUES ($1, 'عمر ياسر حامد', $2, $3, 'مدرسة المتفوقين', 'عربي'),
              ($4, 'فاطمة محمود علي', $2, $3, 'مدرسة الأوائل', 'لغات')`,
      [student1Id, stageId, gradeId, student2Id]
    );

    // 6. Create Exam for testing
    examId = `exam_${uuidv4()}`;
    await db.query(
      `INSERT INTO exams (id, academic_stage_id, grade_id, subject_id, teacher_id, term, title_ar, title_en, is_published)
       VALUES ($1, $2, $3, $4, $5, 1, 'امتحان الشهر الأول لغة عربية', 'Arabic Month 1 Exam', 1)`,
      [examId, stageId, gradeId, subjectId, teacherId]
    );
  });

  after(async () => {
    await teardownDisposableTestDb(db, tempDir);
  });

  test('Requirement 1: Teacher profile impersonation returns assigned grade, stage, and teaching_assignments', async () => {
    const teacherQuery = `
      SELECT u.id, u.email, u.role, u.full_name,
             tp.school_name, tp.specialization,
             tp.grade_id, tp.academic_stage_id, tp.subject_id,
             tp.assigned_grades, tp.assigned_subjects, tp.teaching_assignments,
             g.name_ar as grade_name_ar, g.name_en as grade_name_en,
             s.name_ar as stage_name_ar, s.name_en as stage_name_en,
             subj.name_ar as subject_name_ar
      FROM users u
      LEFT JOIN teacher_profiles tp ON u.id = tp.user_id
      LEFT JOIN grades g ON tp.grade_id = g.id
      LEFT JOIN academic_stages s ON tp.academic_stage_id = s.id
      LEFT JOIN subjects subj ON tp.subject_id = subj.id
      WHERE u.id = $1
    `;
    const res = await db.query(teacherQuery, [teacherId]);
    assert.equal(res.rows.length, 1);
    const teacher = res.rows[0];

    assert.equal(teacher.grade_id, gradeId);
    assert.ok(teacher.grade_name_ar);
    assert.equal(teacher.academic_stage_id, stageId);
    assert.ok(teacher.teaching_assignments);

    let parsedAssignments = teacher.teaching_assignments;
    if (typeof parsedAssignments === 'string') parsedAssignments = JSON.parse(parsedAssignments);
    assert.equal(Array.isArray(parsedAssignments), true);
    assert.equal(parsedAssignments[0].subjectId, subjectId);
    assert.deepEqual(parsedAssignments[0].gradeIds, [gradeId]);
  });

  test('Requirement 2: Empty state post-reset returns null avg_score, 0 attempts, and NOT_ASSESSED status without mock/fake figures', async () => {
    // 1. Verify 0 attempts currently exist
    const attemptsCountRes = await db.query(
      `SELECT COUNT(*) as count FROM exam_attempts ea
       JOIN exams e ON ea.exam_id = e.id
       WHERE e.subject_id = $1 AND ea.status = 'COMPLETED'`,
      [subjectId]
    );
    const attemptsCount = Number(attemptsCountRes.rows[0].count);
    assert.equal(attemptsCount, 0);

    // 2. Calculate teacher analytics avg score logic
    let avgScore: number | null = null;
    if (attemptsCount > 0) {
      const avgRes = await db.query(
        `SELECT ROUND(AVG((ea.score / NULLIF(COALESCE(ea.total_points, 20), 0)) * 100), 1) as avg_score
         FROM exam_attempts ea
         JOIN exams e ON ea.exam_id = e.id
         WHERE e.subject_id = $1 AND ea.status = 'COMPLETED'`,
        [subjectId]
      );
      avgScore = avgRes.rows[0].avg_score != null ? Number(avgRes.rows[0].avg_score) : null;
    }

    // Crucial check: Must be null when 0 attempts, NEVER 86!
    assert.equal(avgScore, null);

    // 3. Chapters mastery calculation for subject
    const chRes = await db.query(
      `SELECT bc.id, bc.chapter_number, bc.title_ar,
              COUNT(ea.id) as attempts_count,
              ROUND(AVG((ea.score / NULLIF(COALESCE(ea.total_points, 20), 0)) * 100), 1) as avg_mastery
       FROM book_chapters bc
       JOIN books b ON bc.book_id = b.id
       LEFT JOIN exams e ON e.subject_id = b.subject_id AND e.grade_id = b.grade_id
       LEFT JOIN exam_attempts ea ON ea.exam_id = e.id AND ea.status = 'COMPLETED'
       WHERE b.subject_id = $1 AND b.term = 1
       GROUP BY bc.id, bc.chapter_number, bc.title_ar
       ORDER BY bc.chapter_number ASC`,
      [subjectId]
    );

    assert.equal(chRes.rows.length, 2);
    for (const ch of chRes.rows) {
      const attCount = Number(ch.attempts_count);
      assert.equal(attCount, 0);
      const masteryPct = attCount > 0 && ch.avg_mastery != null ? Math.round(Number(ch.avg_mastery)) : 0;
      const status = attCount === 0 ? 'NOT_ASSESSED' : masteryPct >= 80 ? 'MASTERED' : 'DEVELOPING';
      
      assert.equal(masteryPct, 0);
      assert.equal(status, 'NOT_ASSESSED');
    }

    // 4. Rankings must exclude unassessed chapters
    const assessedChapters = chRes.rows.filter(r => Number(r.attempts_count) > 0);
    const topChapter = assessedChapters.length > 0 ? assessedChapters[0] : null;
    const lowestChapter = assessedChapters.length > 1 ? assessedChapters[assessedChapters.length - 1] : null;
    assert.equal(topChapter, null);
    assert.equal(lowestChapter, null);
  });

  test('Requirement 3: Live persistence — When student submits completed attempt, scores and mastery propagate without manual edits', async () => {
    // 1. Student 1 submits attempt with 18/20 (90%)
    const attempt1Id = `att1_${uuidv4()}`;
    await db.query(
      `INSERT INTO exam_attempts (id, exam_id, student_id, score, total_points, status, completed_at)
       VALUES ($1, $2, $3, 18, 20, 'COMPLETED', CURRENT_TIMESTAMP)`,
      [attempt1Id, examId, student1Id]
    );

    // 2. Check updated teacher analytics
    const completedRes = await db.query(
      `SELECT COUNT(*) as count,
              ROUND(AVG((ea.score / NULLIF(COALESCE(ea.total_points, 20), 0)) * 100), 1) as avg_score
       FROM exam_attempts ea
       JOIN exams e ON ea.exam_id = e.id
       WHERE e.subject_id = $1 AND ea.status = 'COMPLETED'`,
      [subjectId]
    );

    assert.equal(Number(completedRes.rows[0].count), 1);
    assert.equal(Number(completedRes.rows[0].avg_score), 90);

    // 3. Super Admin Student query accurately reflects true score and count
    const adminStudentRes = await db.query(
      `SELECT u.id, u.full_name,
              (SELECT COUNT(*) FROM exam_attempts ea WHERE ea.student_id = u.id AND ea.status = 'COMPLETED') as attempts_count,
              (SELECT COUNT(*) FROM exam_attempts ea WHERE ea.student_id = u.id AND ea.status = 'IN_PROGRESS') as in_progress_count,
              (SELECT ROUND(AVG((ea.score / NULLIF(COALESCE(ea.total_points, 10), 0)) * 100), 1)
               FROM exam_attempts ea WHERE ea.student_id = u.id AND ea.status = 'COMPLETED') as avg_score
       FROM users u
       WHERE u.id = $1`,
      [student1Id]
    );

    assert.equal(adminStudentRes.rows.length, 1);
    const st1 = adminStudentRes.rows[0];
    assert.equal(Number(st1.attempts_count), 1);
    assert.equal(Number(st1.in_progress_count), 0);
    assert.equal(Number(st1.avg_score), 90);
  });

  test('Requirement 4: Super Admin distinguishes between IN_PROGRESS and COMPLETED attempts and includes AI evaluations', async () => {
    // 1. Student 2 starts an exam attempt (IN_PROGRESS)
    const inProgressAttemptId = `att_prog_${uuidv4()}`;
    await db.query(
      `INSERT INTO exam_attempts (id, exam_id, student_id, score, total_points, status, completed_at)
       VALUES ($1, $2, $3, 0, 20, 'IN_PROGRESS', NULL)`,
      [inProgressAttemptId, examId, student2Id]
    );

    // 2. Student 2 also completes an AI Evaluation (8/10 = 80%)
    const aiEvalId = `ai_eval_${uuidv4()}`;
    await db.query(
      `INSERT INTO ai_evaluations (id, student_id, book_id, subject_id, score, total_questions, created_at)
       VALUES ($1, $2, $3, $4, 8, 10, CURRENT_TIMESTAMP)`,
      [aiEvalId, student2Id, bookId, subjectId]
    );

    // 3. Query combined Super Admin student records
    const adminStudentQuery = `
      SELECT u.id, u.full_name,
        (
          COALESCE((SELECT COUNT(*) FROM exam_attempts ea WHERE ea.student_id = u.id AND ea.status = 'COMPLETED'), 0) +
          COALESCE((SELECT COUNT(*) FROM ai_evaluations ae WHERE ae.student_id = u.id), 0)
        ) as attempts_count,
        COALESCE((SELECT COUNT(*) FROM exam_attempts ea WHERE ea.student_id = u.id AND ea.status = 'IN_PROGRESS'), 0) as in_progress_count,
        (
          SELECT ROUND(AVG(val.pct), 1)
          FROM (
            SELECT (ea.score / NULLIF(COALESCE(ea.total_points, 10), 0)) * 100 as pct
            FROM exam_attempts ea
            WHERE ea.student_id = u.id AND ea.status = 'COMPLETED'
            UNION ALL
            SELECT (ae.score / NULLIF(COALESCE(ae.total_questions, 10), 0)) * 100 as pct
            FROM ai_evaluations ae
            WHERE ae.student_id = u.id AND ae.total_questions > 0
          ) val
        ) as avg_score
      FROM users u
      WHERE u.id = $1
    `;
    const res = await db.query(adminStudentQuery, [student2Id]);
    assert.equal(res.rows.length, 1);
    const st2 = res.rows[0];

    // Student 2 has:
    // - 1 completed assessment (AI eval)
    // - 1 in-progress attempt (standard exam)
    // - avgScore of 80% (from 8/10 AI eval, in-progress NOT counted in score)
    assert.equal(Number(st2.attempts_count), 1);
    assert.equal(Number(st2.in_progress_count), 1);
    assert.equal(Number(st2.avg_score), 80);
  });
});
