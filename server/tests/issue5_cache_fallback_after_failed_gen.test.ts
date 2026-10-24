import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDisposableTestDb, assertDatabaseIsDisposable, teardownDisposableTestDb } from './test_isolation_helper.mjs';

const { tempDir, dbPath } = setupDisposableTestDb('issue5_cache_fallback');

process.env.NODE_ENV = 'test';
process.env.VERCEL = '1';
process.env.AUTO_APPLY_SCHEMA = 'true';

const { db } = await import('../src/db/db.js');
const { generateToken } = await import('../src/middleware/auth.js');
const { ExamCacheService } = await import('../src/services/examCacheService.js');
const { default: app } = await import('../src/server.js');
const { v4: uuidv4 } = await import('uuid');
import type { Server } from 'http';

describe('Issue 5 Regression: Fallback Exam Exclusion for Already-Attempted Exams', () => {
  let server: Server;
  let baseUrl: string;

  let stageId: string;
  let gradeId: string;
  let subjectId: string;
  let bookId: string;
  let chapterId: string;
  let student1Id: string;
  let student2Id: string;
  let cachedExam1Id: string;
  let cachedExam2Id: string;

  before(async () => {
    await db.init();
    assertDatabaseIsDisposable(db, dbPath);

    bookId = `book_${uuidv4()}`;
    chapterId = `ch_${uuidv4()}`;
    subjectId = `subj_${uuidv4()}`;
    student1Id = `stu1_${uuidv4()}`;
    student2Id = `stu2_${uuidv4()}`;

    // Use existing academic stage and grade seeded by schema
    const stageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PREPARATORY'`);
    stageId = stageRes.rows[0].id;
    const gradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PREP_1'`);
    gradeId = gradeRes.rows[0].id;

    // Insert subject
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'SCIENCE', 'العلوم', 'Science')`,
      [subjectId, gradeId]
    );

    // Insert student 1 & student 2
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 's1@test.com', 'hash', 'STUDENT', 'Student One', 1)`,
      [student1Id]
    );
    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_name, school_type)
       VALUES ($1, 'Student One', $2, $3, 'مدرسة الأمل', 'عربي')`,
      [student1Id, stageId, gradeId]
    );

    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 's2@test.com', 'hash', 'STUDENT', 'Student Two', 1)`,
      [student2Id]
    );
    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_name, school_type)
       VALUES ($1, 'Student Two', $2, $3, 'مدرسة النور', 'عربي')`,
      [student2Id, stageId, gradeId]
    );

    // Insert Book and Chapter
    await db.query(
      `INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, processing_status, school_type)
       VALUES ($1, 'كتاب العلوم', 'Science Book', $2, $3, $4, 'COMPLETED', 'عربي')`,
      [bookId, stageId, gradeId, subjectId]
    );
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 1, 'الوحدة الأولى', 'Unit 1', 1, 20)`,
      [chapterId, bookId]
    );

    // Create 2 cached exams in shared_cached_exams via ExamCacheService
    const identity = await ExamCacheService.resolveCurriculumIdentity(bookId);

    const questions1 = [
      {
        id: 'q1',
        question_text: 'ما هي وحدة قياس القوة في النظام الدولي؟',
        question_type: 'MCQ',
        difficulty: 'MEDIUM',
        options: [
          { id: 'opt1', text: 'نيوتن', is_correct: true },
          { id: 'opt2', text: 'جول', is_correct: false }
        ],
        ideal_answer: 'نيوتن'
      }
    ];

    const questions2 = [
      {
        id: 'q2',
        question_text: 'ما هي وحدة قياس السرعة في الفيزياء؟',
        question_type: 'MCQ',
        difficulty: 'MEDIUM',
        options: [
          { id: 'opt3', text: 'متر / ثانية', is_correct: true },
          { id: 'opt4', text: 'كيلوجرام', is_correct: false }
        ],
        ideal_answer: 'متر / ثانية'
      }
    ];

    const record1 = await ExamCacheService.storeExamInCache({
      identity,
      unitIds: [chapterId],
      examParams: { count: 1, difficulty: 'MEDIUM', language: 'ar' },
      questions: questions1,
      skipProvenanceCheck: true
    });
    cachedExam1Id = record1.examId;

    const record2 = await ExamCacheService.storeExamInCache({
      identity,
      unitIds: [chapterId],
      examParams: { count: 1, difficulty: 'MEDIUM', language: 'ar' },
      questions: questions2,
      skipProvenanceCheck: true
    });
    cachedExam2Id = record2.examId;

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://localhost:${address.port}`;
        }
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

  test('ExamCacheService.getVerifiedFallbackExam returns an eligible exam when Student 1 has no previous attempts', async () => {
    const fallback = await ExamCacheService.getVerifiedFallbackExam({
      bookId,
      chapterIds: [chapterId],
      examParams: { count: 1, difficulty: 'MEDIUM', language: 'ar' },
      studentId: student1Id
    });
    assert.ok(fallback, 'Expected a verified fallback exam to be found');
    assert.ok(
      fallback.examId === cachedExam1Id || fallback.examId === cachedExam2Id,
      'Fallback should be one of the verified exams'
    );
  });

  test('Student 1 completes Exam 1 -> assignment marked as COMPLETED', async () => {
    await db.query(`
      INSERT INTO student_exam_assignments (id, student_id, cached_exam_id, config_hash, status)
      VALUES ($1, $2, $3, 'hash1', 'COMPLETED')
    `, [`assign_${uuidv4()}`, student1Id, cachedExam1Id]);

    const check = await db.query(
      `SELECT * FROM student_exam_assignments WHERE student_id = $1 AND cached_exam_id = $2`,
      [student1Id, cachedExam1Id]
    );
    assert.equal(check.rows.length, 1);
    assert.equal(check.rows[0].status, 'COMPLETED');
  });

  test('ExamCacheService.getVerifiedFallbackExam strictly excludes Exam 1 for Student 1 and returns Exam 2', async () => {
    const fallback = await ExamCacheService.getVerifiedFallbackExam({
      bookId,
      chapterIds: [chapterId],
      examParams: { count: 1, difficulty: 'MEDIUM', language: 'ar' },
      studentId: student1Id
    });
    assert.ok(fallback, 'Expected fallback exam to be found');
    assert.equal(fallback.examId, cachedExam2Id, 'Must exclude Exam 1 and return unattempted Exam 2');
  });

  test('ExamCacheService.getVerifiedFallbackExam can still return Exam 1 for Student 2 who has not attempted it', async () => {
    const fallback = await ExamCacheService.getVerifiedFallbackExam({
      bookId,
      chapterIds: [chapterId],
      examParams: { count: 1, difficulty: 'MEDIUM', language: 'ar' },
      studentId: student2Id
    });
    assert.ok(fallback, 'Expected fallback exam for student 2');
    assert.ok(
      fallback.examId === cachedExam1Id || fallback.examId === cachedExam2Id,
      'Student 2 is eligible for both exams'
    );
  });

  test('Student 1 also completes Exam 2 -> getVerifiedFallbackExam returns null instead of recycling an old exam', async () => {
    await db.query(`
      INSERT INTO student_exam_assignments (id, student_id, cached_exam_id, config_hash, status)
      VALUES ($1, $2, $3, 'hash2', 'COMPLETED')
    `, [`assign_${uuidv4()}`, student1Id, cachedExam2Id]);

    const fallback = await ExamCacheService.getVerifiedFallbackExam({
      bookId,
      chapterIds: [chapterId],
      examParams: { count: 1, difficulty: 'MEDIUM', language: 'ar' },
      studentId: student1Id
    });
    assert.equal(fallback, null, 'Must return null when all cached exams have already been completed by student');
  });

  test('Student eligibility check blocks student from a different grade or stage from receiving the exam', async () => {
    const foreignStudentId = `stu_foreign_${uuidv4()}`;
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'foreign@test.com', 'hash', 'STUDENT', 'Foreign Student', 1)`,
      [foreignStudentId]
    );
    // Student is in Secondary stage, not Prep
    const secStageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'SECONDARY'`);
    const secGradeRes = await db.query(`SELECT id FROM grades WHERE code = 'SEC_1'`);
    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_name, school_type)
       VALUES ($1, 'Foreign Student', $2, $3, 'مدرسة المتفوقين', 'عربي')`,
      [foreignStudentId, secStageRes.rows[0].id, secGradeRes.rows[0].id]
    );

    const fallback = await ExamCacheService.getVerifiedFallbackExam({
      bookId,
      chapterIds: [chapterId],
      examParams: { count: 1, difficulty: 'MEDIUM', language: 'ar' },
      studentId: foreignStudentId
    });
    assert.equal(fallback, null, 'Must return null for student with mismatched grade/stage');
  });
});
