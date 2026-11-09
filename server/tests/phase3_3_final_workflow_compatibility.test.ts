import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import * as xlsx from 'xlsx';
import { setupDisposableTestDb, assertDatabaseIsDisposable, teardownDisposableTestDb } from './test_isolation_helper.mjs';

// Setup disposable SQLite database for safe, 100% isolated testing
const { tempDir, dbPath } = setupDisposableTestDb('phase3_3_workflow');
process.env.NODE_ENV = 'test';

import { db } from '../src/db/db.js';
import { ReadinessValidator } from '../src/services/readinessValidator.js';
import { ExamCacheService } from '../src/services/examCacheService.js';
import { AIRagEngine } from '../src/services/ai/aiRagEngine.js';
import { ReferenceImportService } from '../src/services/referenceImportService.js';
import { generateToken } from '../src/middleware/auth.js';
import aiRouter from '../src/routes/ai.js';
import examsRouter from '../src/routes/exams.js';
import { v4 as uuidv4 } from 'uuid';

const XLSX = (xlsx as any).default || xlsx;

describe('FARABI AI — Phase 3.3: Final Exam Workflow Compatibility Audit', { concurrency: 1 }, () => {
  let server: any;
  let baseUrl: string;

  let stagePrepId: string;
  let gradePrep1Id: string;
  let gradePrep2Id: string;
  let gradePrep3Id: string;

  let subjArabicId: string;
  let subjEnglishId: string;
  let subjScienceId: string;
  let subjUnapprovedId: string;

  let teacherArId: string;
  let teacherSciId: string;

  let tokenTeacherAr: string;
  let tokenTeacherSci: string;
  let tokenStudentPrep3: string;
  let studentPrep3Id: string;

  const unapprovedBookId = `book_unapproved_${uuidv4()}`;
  const unapprovedChapterId = `ch_unapproved_${uuidv4()}`;

  // Canonical Ministerial IDs from authoritative_curriculum_inventory.json
  const p1ArabicBookId = '0758fc7a-c9b2-4e25-a32b-6cacb6bb418d';
  const p1ArabicUnit1Id = 'de726b08-631a-465c-82b4-8d7e3b7be4cb';

  const p2ArabicBookId = 'bc6bb834-7192-474c-8507-c53265028b4e';
  const p2ArabicUnit1Id = '902f6adf-8043-4247-b80c-42bb48d200b8';

  const p3ArabicBookId = '013411b8-edec-477b-bd42-3dbdda9fb6a9';
  const p3ArabicUnit1Id = 'c7043f86-6a40-4417-a1b8-60e3301e7cb7';

  const p3EnglishBookId = '9e702109-7d92-445c-b814-567c1f6cba49';
  const p3EnglishUnit4Id = 'f13a0004-9e70-445c-b814-567c1f6cba49';

  const p3ScienceBookId = 'ecf50c73-4329-436d-a0a6-520cfa8172f6';
  const p3ScienceUnits = [
    '3eeb0aa8-f4f2-4c2f-821c-527ad8b084b6',
    '7c45791b-e5c6-4cf6-9efe-0e32b763a946',
    '53219e01-9c64-43e8-b96e-9296cc41edea',
    'd72d1c19-4016-4d16-8d30-47ac2bdeef80'
  ];

  before(async () => {
    await db.init();
    assertDatabaseIsDisposable(db, dbPath);

    // 1. Resolve Pre-seeded stages & grades
    const stageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PREPARATORY'`);
    stagePrepId = stageRes.rows[0].id;

    const g1 = await db.query(`SELECT id FROM grades WHERE code = 'PREP_1'`);
    const g2 = await db.query(`SELECT id FROM grades WHERE code = 'PREP_2'`);
    const g3 = await db.query(`SELECT id FROM grades WHERE code = 'PREP_3'`);
    gradePrep1Id = g1.rows[0].id;
    gradePrep2Id = g2.rows[0].id;
    gradePrep3Id = g3.rows[0].id;

    // 2. Insert Subjects for Prep 3
    subjArabicId = `subj_ar_${uuidv4()}`;
    await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'ARB', 'اللغة العربية', 'Arabic')`, [subjArabicId, gradePrep3Id]);

    subjEnglishId = `subj_en_${uuidv4()}`;
    await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'ENG', 'اللغة الإنجليزية', 'English')`, [subjEnglishId, gradePrep3Id]);

    subjScienceId = `subj_sci_${uuidv4()}`;
    await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'SCI', 'العلوم', 'Science')`, [subjScienceId, gradePrep3Id]);

    subjUnapprovedId = `subj_unapp_${uuidv4()}`;
    await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'TEST_UNAPP', 'مادة غير معتمدة', 'Unapproved Subject')`, [subjUnapprovedId, gradePrep3Id]);

    // 3. Seed Teachers with profiles and specializations
    teacherArId = `teacher_ar_${uuidv4()}`;
    await db.query(`INSERT INTO users (id, email, password_hash, role, full_name, subject_id) VALUES ($1, 't.ar@farabi.edu', 'hash', 'TEACHER', 'أ. أحمد عربي', $2)`, [teacherArId, subjArabicId]);
    await db.query(`INSERT INTO teacher_profiles (user_id, full_name, specialization, subject_id, grade_id, academic_stage_id) VALUES ($1, 'أ. أحمد عربي', 'اللغة العربية', $2, $3, $4)`, [teacherArId, subjArabicId, gradePrep3Id, stagePrepId]);

    teacherSciId = `teacher_sci_${uuidv4()}`;
    await db.query(`INSERT INTO users (id, email, password_hash, role, full_name, subject_id) VALUES ($1, 't.sci@farabi.edu', 'hash', 'TEACHER', 'أ. هاني علوم', $2)`, [teacherSciId, subjScienceId]);
    await db.query(`INSERT INTO teacher_profiles (user_id, full_name, specialization, subject_id, grade_id, academic_stage_id) VALUES ($1, 'أ. هاني علوم', 'العلوم', $2, $3, $4)`, [teacherSciId, subjScienceId, gradePrep3Id, stagePrepId]);

    tokenTeacherAr = generateToken({ id: teacherArId, email: 't.ar@farabi.edu', role: 'TEACHER', fullName: 'أ. أحمد عربي', subjectId: subjArabicId });
    tokenTeacherSci = generateToken({ id: teacherSciId, email: 't.sci@farabi.edu', role: 'TEACHER', fullName: 'أ. هاني علوم', subjectId: subjScienceId });

    // 4. Seed Student
    studentPrep3Id = `student_p3_${uuidv4()}`;
    await db.query(`INSERT INTO users (id, email, password_hash, role, full_name) VALUES ($1, 'student.p3@farabi.edu', 'hash', 'STUDENT', 'سارة محمود')`, [studentPrep3Id]);
    await db.query(`INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_name, school_type) VALUES ($1, 'سارة محمود', $2, $3, 'مدرسة النور الإعدادية', 'عربي')`, [studentPrep3Id, stagePrepId, gradePrep3Id]);
    tokenStudentPrep3 = generateToken({ id: studentPrep3Id, email: 'student.p3@farabi.edu', role: 'STUDENT', fullName: 'سارة محمود' });

    // 5. Seed Unapproved Newly Ingested Book with valid page chunks so its ONLY defect is unapproved status
    await db.query(`
      INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status, term, school_type, active_generation_id)
      VALUES ($1, $2, $3, $4, 'كتاب لغة عربية تجريبي غير معتمد', 'Unapproved Arabic Book', 20, 'COMPLETED', 1, 'كلاهما', 'gen_1')
    `, [unapprovedBookId, stagePrepId, gradePrep3Id, subjArabicId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'الوحدة غير المعتمدة', 'Unapproved Unit', 1, 10, 'gen_1')
    `, [unapprovedChapterId, unapprovedBookId]);

    const sampleChunk = 'محتوى نصي كامل من كتاب مدرسي تجريبي قيد الفحص والتدقيق للتأكد من شروط الاعتماد التربوي الصارم.';
    for (let i = 0; i < 3; i++) {
      await db.query(`
        INSERT INTO book_chunks (id, book_id, chapter_id, page_number, chunk_index, content, embedding, generation_id, academic_stage_id, grade_id, subject_id)
        VALUES ($1, $2, $3, $4, $5, $6, '{"model":"semantic-hash-768","version":"1.0","vector":[' || $5 || ',0.1,0.2]}', 'gen_1', $7, $8, $9)
      `, [`chk_unapp_${i}`, unapprovedBookId, unapprovedChapterId, 2, i, sampleChunk, stagePrepId, gradePrep3Id, subjArabicId]);
    }

    // 6. Seed Canonical Books and Supporting Chunks in DB
    // Canonical Prep 3 Arabic
    await db.query(`
      INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status, term, school_type, active_generation_id)
      VALUES ($1, $2, $3, $4, 'اللغة العربية الصف الثالث الإعدادي', 'Prep 3 Arabic', 150, 'COMPLETED', 1, 'كلاهما', 'v1')
    `, [p3ArabicBookId, stagePrepId, gradePrep3Id, subjArabicId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'الوحدة الأولى: قيم تحمي شبابنا', 'Unit 1: Values', 15, 59, 'v1')
    `, [p3ArabicUnit1Id, p3ArabicBookId]);

    await db.query(`
      INSERT INTO book_chunks (id, book_id, chapter_id, page_number, chunk_index, content, generation_id, academic_stage_id, grade_id, subject_id)
      VALUES 
        ('chk_ar_p25', $1, $2, 25, 0, 'من مؤلف كتاب الأيام هو الأديب والعميد طه حسين.', 'v1', $3, $4, $5),
        ('chk_ar_p30', $1, $2, 30, 1, 'البسالة تعني الشجاعة والإقدام في مواجهة التحديات والصعاب.', 'v1', $3, $4, $5)
    `, [p3ArabicBookId, p3ArabicUnit1Id, stagePrepId, gradePrep3Id, subjArabicId]);

    // Canonical Prep 3 Science
    await db.query(`
      INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status, term, school_type, active_generation_id)
      VALUES ($1, $2, $3, $4, 'العلوم (لغات)', 'Science (Prep 3)', 114, 'COMPLETED', 1, 'كلاهما', 'v1')
    `, [p3ScienceBookId, stagePrepId, gradePrep3Id, subjScienceId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'الوحدة الأولى: التفاعلات الكيميائية', 'Unit 1: Chemical Reactions', 8, 34, 'v1')
    `, [p3ScienceUnits[0], p3ScienceBookId]);

    await db.query(`
      INSERT INTO book_chunks (id, book_id, chapter_id, page_number, chunk_index, content, generation_id, academic_stage_id, grade_id, subject_id)
      VALUES 
        ('chk_sci_p12', $1, $2, 12, 0, 'السرعة القياسية والعجلة المنتظمة من المفاهيم الأساسية في الحركة.', 'v1', $3, $4, $5)
    `, [p3ScienceBookId, p3ScienceUnits[0], stagePrepId, gradePrep3Id, subjScienceId]);

    // 7. Start Real Express HTTP Server
    const app = express();
    app.use(express.json());
    app.use('/api/ai', aiRouter);
    app.use('/api/exams', examsRouter);

    server = app.listen(0);
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(() => {
    if (server) server.close();
    teardownDisposableTestDb(db, tempDir);
  });

  // ---------------------------------------------------------------------------
  // REQUIREMENT 1: Unapproved Textbooks — AI Generation Blocked
  // ---------------------------------------------------------------------------
  test('Requirement 1: HTTP POST /api/ai/generate-quiz rejects unapproved textbook with 403 UNIT_READINESS_BLOCKED before LLM call', async () => {
    const res = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenStudentPrep3}`
      },
      body: JSON.stringify({
        book_id: unapprovedBookId,
        chapter_id: unapprovedChapterId,
        subject_id: subjArabicId,
        count: 3
      })
    });

    assert.equal(res.status, 403, 'Must return HTTP 403 Forbidden');
    const data = await res.json();
    assert.equal(data.code, 'UNIT_READINESS_BLOCKED', 'Error code must be UNIT_READINESS_BLOCKED');
    assert.equal(data.readiness?.status, 'NOT_AUDITED', 'Readiness status must report NOT_AUDITED');

    // Verify zero exams or attempts created in database
    const examsCheck = await db.query('SELECT COUNT(*) as count FROM exams WHERE book_id = $1', [unapprovedBookId]);
    assert.equal(Number(examsCheck.rows[0].count), 0, 'Zero exams must be created in DB');
  });

  // ---------------------------------------------------------------------------
  // REQUIREMENT 2: Cache and Question Bank Isolation
  // ---------------------------------------------------------------------------
  test('Requirement 2: Unapproved textbooks cannot reuse cache or retrieve questions', async () => {
    // A. Shared Exam Cache lookup fails closed
    const cacheResult = await ExamCacheService.getCachedExamForStudent({
      studentId: studentPrep3Id,
      bookId: unapprovedBookId,
      chapterIds: [unapprovedChapterId],
      examParams: { count: 5, difficulty: 'MEDIUM' }
    });
    assert.equal(cacheResult.hit, false, 'Cache hit must be false');
    assert.equal(cacheResult.reason, 'INELIGIBLE_STUDENT', 'Reason must be INELIGIBLE_STUDENT');

    // B. AIRagEngine.generateQuestions throws UNIT_READINESS_BLOCKED
    const ragEngine = new AIRagEngine();
    await assert.rejects(
      async () => {
        await ragEngine.generateQuestions({
          studentId: studentPrep3Id,
          academicStageId: stagePrepId,
          gradeId: gradePrep3Id,
          subjectId: subjArabicId,
          bookId: unapprovedBookId,
          chapterId: unapprovedChapterId,
          questionCount: 3,
          difficulty: 'MEDIUM',
          language: 'ar',
          examType: 'UNIT'
        });
      },
      /UNIT_READINESS_BLOCKED/
    );

    // C. Approved canonical textbook retains normal cache functionality
    const canonicalCacheResult = await ExamCacheService.getCachedExamForStudent({
      studentId: studentPrep3Id,
      bookId: p3ArabicBookId,
      chapterIds: [p3ArabicUnit1Id],
      examParams: { count: 5, difficulty: 'MEDIUM' }
    });
    assert.equal(canonicalCacheResult.reason, 'CACHE_MISS', 'Canonical unit should return normal CACHE_MISS (not INELIGIBLE_STUDENT)');
  });

  // ---------------------------------------------------------------------------
  // REQUIREMENT 3: Teacher Manual Exam Creation
  // ---------------------------------------------------------------------------
  test('Requirement 3: HTTP POST /api/exams rejects unapproved textbook and permits canonical approved textbook', async () => {
    // A. Unapproved book creation attempt -> 403 UNIT_READINESS_BLOCKED
    const unapprovedRes = await fetch(`${baseUrl}/api/exams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenTeacherAr}`
      },
      body: JSON.stringify({
        title_ar: 'امتحان غير معتمد',
        title_en: 'Unapproved Exam',
        duration_minutes: 30,
        book_id: unapprovedBookId,
        chapter_id: unapprovedChapterId,
        subject_id: subjArabicId,
        grade_id: gradePrep3Id,
        academic_stage_id: stagePrepId,
        questions: [
          {
            question_text: 'سؤال تجريبي؟',
            points: 2,
            options: [{ option_text: 'خيار 1', is_correct: 1 }, { option_text: 'خيار 2', is_correct: 0 }]
          }
        ]
      })
    });

    assert.equal(unapprovedRes.status, 403, 'Must return HTTP 403 for unapproved textbook');
    const unapprovedData = await unapprovedRes.json();
    assert.equal(unapprovedData.code, 'UNIT_READINESS_BLOCKED');

    // B. Approved canonical book creation attempt -> 201 Created
    const approvedRes = await fetch(`${baseUrl}/api/exams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenTeacherAr}`
      },
      body: JSON.stringify({
        title_ar: 'امتحان لغة عربية معتمد للوحدة الأولى',
        title_en: 'Prep 3 Arabic Unit 1 Exam',
        duration_minutes: 45,
        book_id: p3ArabicBookId,
        chapter_id: p3ArabicUnit1Id,
        subject_id: subjArabicId,
        grade_id: gradePrep3Id,
        academic_stage_id: stagePrepId,
        questions: [
          {
            question_text: 'ما هو الهدف من القيم الأخلاقية في تنشئة الشباب؟',
            points: 5,
            options: [
              { option_text: 'حماية المجتمع وبناء المستقبل', is_correct: 1 },
              { option_text: 'إهدار الوقت', is_correct: 0 }
            ]
          }
        ]
      })
    });

    assert.equal(approvedRes.status, 201, 'Must return HTTP 201 Created for approved canonical book');
    const approvedData = await approvedRes.json();
    assert.ok(approvedData.id, 'Response must return created exam ID');

    // Verify questions and options were persisted
    const qCount = await db.query('SELECT COUNT(*) as count FROM exam_questions WHERE exam_id = $1', [approvedData.id]);
    assert.equal(Number(qCount.rows[0].count), 1, 'Question must be persisted');
  });

  // ---------------------------------------------------------------------------
  // REQUIREMENT 4: Excel Questions Workflow
  // ---------------------------------------------------------------------------
  test('Requirement 4: Excel question workbook parsing, option persistence, and answer resolution operate correctly', async () => {
    // Build real Excel buffer in-memory
    const rows = [
      {
        'Question': 'من مؤلف كتاب الأيام؟',
        'Option A': 'طه حسين',
        'Option B': 'عباس العقاد',
        'Option C': 'نجيب محفوظ',
        'Option D': 'أحمد شوقي',
        'Right Answer': 'طه حسين',
        'Reference Page': 25,
        'Bloom Level': 'تذكر'
      },
      {
        'Question': 'ما مرادف كلمة البسالة؟',
        'Option A': 'الشجاعة',
        'Option B': 'الخوف',
        'Option C': 'التردد',
        'Option D': 'الكسل',
        'Right Answer': 'الشجاعة',
        'Reference Page': 30,
        'Bloom Level': 'فهم'
      }
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Questions');
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // 1. Test parsing
    const parsed = ReferenceImportService.parseWorkbook(excelBuffer, 'Test_Arabic_Questions.xlsx');
    assert.equal(parsed.parsedRows.length, 2, 'Should parse exactly 2 rows');
    assert.equal(parsed.parsedRows[0].questionText, 'من مؤلف كتاب الأيام؟');

    // 2. Test correct answer resolution
    const idx0 = ReferenceImportService.resolveCorrectAnswerIndex('طه حسين', ['طه حسين', 'عباس العقاد', 'نجيب محفوظ', 'أحمد شوقي']);
    assert.equal(idx0, 0, 'Correct index must be 0 for طه حسين');

    const idx1 = ReferenceImportService.resolveCorrectAnswerIndex('B', ['الشجاعة', 'الخوف', 'التردد', 'الكسل']);
    assert.equal(idx1, 1, 'Letter notation B must resolve to index 1');

    // 3. Test importReferenceWorkbook
    const importSummary = await ReferenceImportService.importReferenceWorkbook(excelBuffer, {
      operatorId: teacherArId,
      operatorRole: 'TEACHER',
      workbookName: 'Arabic_Unit1.xlsx',
      overrideSubjectId: subjArabicId,
      overrideGradeId: gradePrep3Id,
      overrideStageId: stagePrepId,
      overrideChapterId: p3ArabicUnit1Id,
      createFixedExam: true,
      durationMinutes: 45
    });

    assert.equal(importSummary.imported, 2, 'Should import exactly 2 reference questions');
    assert.equal(importSummary.skipped, 0);

    // Verify questions persisted in question_bank_items
    const qbRes = await db.query(
      'SELECT id, question_text FROM question_bank_items WHERE chapter_id = $1 AND is_reference = 1',
      [p3ArabicUnit1Id]
    );
    assert.equal(qbRes.rows.length, 2);

    // Verify option persistence and answer resolution
    const optRes = await db.query(
      'SELECT option_text, is_correct FROM question_bank_options WHERE question_item_id = $1 ORDER BY is_correct DESC',
      [qbRes.rows[0].id]
    );
    assert.ok(optRes.rows.length >= 2, 'Options must be persisted');
    const correctOpt = optRes.rows.find((r: any) => r.is_correct === 1);
    assert.ok(correctOpt, 'Must have a correct option');
    assert.equal(correctOpt.option_text, 'طه حسين', 'Correct option text must match parsed resolution');
  });

  // ---------------------------------------------------------------------------
  // REQUIREMENT 5: Excel Exams Reference Workflow
  // ---------------------------------------------------------------------------
  test('Requirement 5: Excel exam-reference preview, teacher specialization check, and style guidance verified', async () => {
    // 1. Teacher specialization check: Science teacher cannot import for Arabic
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{
      'Question': 'سؤال علوم تجريبي؟',
      'Option A': 'أ', 'Option B': 'ب', 'Option C': 'ج', 'Option D': 'د',
      'Right Answer': 'أ', 'Reference Page': 12
    }]);
    XLSX.utils.book_append_sheet(wb, ws, 'Questions');
    const sciExcelBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Preview
    const preview = await ReferenceImportService.previewReferenceWorkbook(sciExcelBuf, {
      operatorId: teacherSciId,
      operatorRole: 'TEACHER',
      workbookName: 'Science_Unit1.xlsx',
      overrideSubjectId: subjScienceId,
      overrideGradeId: gradePrep3Id,
      overrideStageId: stagePrepId,
      overrideChapterId: p3ScienceUnits[0]
    });
    assert.equal(preview.success, true);
    assert.equal(preview.validCount, 1);

    // Science teacher attempting Arabic subject must be rejected
    await assert.rejects(
      async () => {
        await ReferenceImportService.importReferenceWorkbook(sciExcelBuf, {
          operatorId: teacherSciId,
          operatorRole: 'TEACHER',
          workbookName: 'Science_Unit1.xlsx',
          overrideSubjectId: subjArabicId, // Mismatched subject for science teacher
          overrideGradeId: gradePrep3Id,
          overrideStageId: stagePrepId
        });
      },
      /غير مصرح للمعلم|MISMATCH/
    );

    // 2. Style Reference Retrieval: Teacher queries style-references via HTTP endpoint
    const refRes = await fetch(`${baseUrl}/api/exams/style-references?grade_id=${gradePrep3Id}`, {
      headers: { Authorization: `Bearer ${tokenTeacherAr}` }
    });
    assert.equal(refRes.status, 200, 'Teacher can access style references endpoint');
    const refData = await refRes.json();
    assert.ok(Array.isArray(refData.style_references), 'style_references must be an array');
  });

  // ---------------------------------------------------------------------------
  // REQUIREMENT 6: AI Generation Readiness for All Canonical Curricula
  // ---------------------------------------------------------------------------
  test('Requirement 6: Canonical curricula (Prep 1, Prep 2, Prep 3 Arabic, English, Science) all evaluate to VERIFIED_READY', async () => {
    // 1. Prep 1 Arabic
    const p1Ar = await ReadinessValidator.getUnitReadinessAsync(p1ArabicBookId, p1ArabicUnit1Id);
    assert.equal(p1Ar.status, 'VERIFIED_READY');
    assert.equal(p1Ar.isEligibleForAI, true);

    // 2. Prep 2 Arabic
    const p2Ar = await ReadinessValidator.getUnitReadinessAsync(p2ArabicBookId, p2ArabicUnit1Id);
    assert.equal(p2Ar.status, 'VERIFIED_READY');
    assert.equal(p2Ar.isEligibleForAI, true);

    // 3. Prep 3 Arabic
    const p3Ar = await ReadinessValidator.getUnitReadinessAsync(p3ArabicBookId, p3ArabicUnit1Id);
    assert.equal(p3Ar.status, 'VERIFIED_READY');
    assert.equal(p3Ar.isEligibleForAI, true);

    // 4. Prep 3 English
    const p3En = await ReadinessValidator.getUnitReadinessAsync(p3EnglishBookId, p3EnglishUnit4Id);
    assert.equal(p3En.status, 'VERIFIED_READY');
    assert.equal(p3En.isEligibleForAI, true);

    // 5. Prep 3 Science (All 4 Units)
    for (const uId of p3ScienceUnits) {
      const p3Sci = await ReadinessValidator.getUnitReadinessAsync(p3ScienceBookId, uId);
      assert.equal(p3Sci.status, 'VERIFIED_READY', `Science unit ${uId} must be VERIFIED_READY`);
      assert.equal(p3Sci.isEligibleForAI, true);
    }
  });
});
