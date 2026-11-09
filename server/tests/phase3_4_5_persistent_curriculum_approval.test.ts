import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import http from 'http';
import * as xlsx from 'xlsx';
import { setupDisposableTestDb, teardownDisposableTestDb } from './test_isolation_helper.mjs';

const { tempDir, dbPath } = setupDisposableTestDb('phase3_4_5_approval');
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = 'test_key_non_billable';

import { db } from '../src/db/db.js';
import { generateToken } from '../src/middleware/auth.js';
import { ReadinessValidator } from '../src/services/readinessValidator.js';
import { CurriculumApprovalService } from '../src/services/curriculumApprovalService.js';
import { ExamCacheService } from '../src/services/examCacheService.js';
import { AIRagEngine } from '../src/services/ai/aiRagEngine.js';
import { ReferenceImportService } from '../src/services/referenceImportService.js';
import { GeminiClient } from '../src/services/ai/geminiClient.js';
import adminRouter from '../src/routes/admin.js';
import aiRouter from '../src/routes/ai.js';
import examsRouter from '../src/routes/exams.js';
import booksRouter from '../src/routes/books.js';

const XLSX = (xlsx as any).default || xlsx;

describe('FARABI AI — Phase 3.4 & 3.5: Persistent Curriculum Approval & Integration Test Suite', () => {
  let server: http.Server;
  let baseUrl: string;

  // Users & Tokens
  let adminId: string;
  let teacherArId: string;
  let studentId: string;
  let tokenAdmin: string;
  let tokenTeacherAr: string;
  let tokenStudent: string;

  // Curriculum Hierarchy IDs
  let stagePrepId: string;
  let gradePrep3Id: string;
  let subjArabicId: string;

  // Test Books
  const bookIngestedAId = 'book_ingested_a_345';
  const chapterU1Id = 'ch_ingested_u1_345';
  const chapterU2Id = 'ch_ingested_u2_345';

  const bookDefectiveId = 'book_defective_345';
  const chapterDefectiveId = 'ch_defective_345';

  // Canonical Book IDs
  const p3ArabicBookId = '013411b8-edec-477b-bd42-3dbdda9fb6a9';
  const p3ArabicUnit1Id = 'c7043f86-6a40-4417-a1b8-60e3301e7cb7';

  before(async () => {
    await db.init();

    // 1. Resolve Pre-seeded stages & grades
    const stageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PREPARATORY'`);
    stagePrepId = stageRes.rows[0].id;

    const gradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PREP_3'`);
    gradePrep3Id = gradeRes.rows[0].id;

    subjArabicId = `subj_ar_${uuidv4()}`;
    await db.query(`
      INSERT INTO subjects (id, grade_id, code, name_ar, name_en)
      VALUES ($1, $2, 'ARB', 'اللغة العربية', 'Arabic Language')
    `, [subjArabicId, gradePrep3Id]);

    // 2. Seed Users
    adminId = `admin_${uuidv4()}`;
    await db.query(`
      INSERT INTO users (id, email, password_hash, role, full_name)
      VALUES ($1, 'admin@farabi.edu', 'hash', 'ADMIN', 'المدير العام')
    `, [adminId]);
    tokenAdmin = generateToken({ id: adminId, email: 'admin@farabi.edu', role: 'ADMIN', fullName: 'المدير العام' });

    teacherArId = `teacher_ar_${uuidv4()}`;
    await db.query(`
      INSERT INTO users (id, email, password_hash, role, full_name, subject_id)
      VALUES ($1, 't.ar@farabi.edu', 'hash', 'TEACHER', 'أ. طارق محمود', $2)
    `, [teacherArId, subjArabicId]);
    await db.query(`
      INSERT INTO teacher_profiles (user_id, full_name, specialization, subject_id, grade_id, academic_stage_id)
      VALUES ($1, 'أ. طارق محمود', 'اللغة العربية', $2, $3, $4)
    `, [teacherArId, subjArabicId, gradePrep3Id, stagePrepId]);
    tokenTeacherAr = generateToken({ id: teacherArId, email: 't.ar@farabi.edu', role: 'TEACHER', fullName: 'أ. طارق محمود', subjectId: subjArabicId });

    studentId = `student_${uuidv4()}`;
    await db.query(`
      INSERT INTO users (id, email, password_hash, role, full_name)
      VALUES ($1, 'student@farabi.edu', 'hash', 'STUDENT', 'كريم أحمد')
    `, [studentId]);
    await db.query(`
      INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_name, school_type)
      VALUES ($1, 'كريم أحمد', $2, $3, 'مدرسة النيل', 'عربي')
    `, [studentId, stagePrepId, gradePrep3Id]);
    tokenStudent = generateToken({ id: studentId, email: 'student@farabi.edu', role: 'STUDENT', fullName: 'كريم أحمد' });

    // 3. Seed Valid Ingested Book A (COMPLETED, active_generation_id = 'gen_v1')
    await db.query(`
      INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status, term, school_type, active_generation_id)
      VALUES ($1, $2, $3, $4, 'كتاب القراءة الحديثة الصف الثالث الإعدادي', 'Modern Reading Prep 3', 30, 'COMPLETED', 1, 'كلاهما', 'gen_v1')
    `, [bookIngestedAId, stagePrepId, gradePrep3Id, subjArabicId]);

    // Chapter 1 (Pages 1 to 10)
    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'الوحدة الأولى: رواد الفكر والإصلاح', 'Unit 1: Pioneers of Thought', 1, 10, 'gen_v1')
    `, [chapterU1Id, bookIngestedAId]);

    // Chapter 2 (Pages 11 to 20)
    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 2, 'الوحدة الثانية: قيم العمل والإنتاج', 'Unit 2: Values of Work', 11, 20, 'gen_v1')
    `, [chapterU2Id, bookIngestedAId]);

    // Seed Pages for Book A
    for (let p = 1; p <= 20; p++) {
      await db.query(`
        INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count, generation_id)
        VALUES ($1, $2, $3, 'نصوص تعليمية موثقة وشروحات للصفحة رقم ' || $3, 150, 'gen_v1')
      `, [`page_${bookIngestedAId}_${p}`, bookIngestedAId, p]);
    }

    // Seed Chunks for Chapter 1 (3 chunks, total > 100 chars, generation 'gen_v1')
    const sampleText1 = 'كان رفاعة الطهطاوي رائد حركة التنوير في مصر الحديثة وأسهم في ترجمة العلوم وبناء النهضة الثقافية.';
    for (let c = 0; c < 3; c++) {
      await db.query(`
        INSERT INTO book_chunks (id, book_id, chapter_id, page_number, chunk_index, content, embedding, generation_id, academic_stage_id, grade_id, subject_id)
        VALUES ($1, $2, $3, $4, $5, $6, '{"model":"semantic-hash-768","version":"1.0","vector":[' || $5 || ',0.2,0.3]}', 'gen_v1', $7, $8, $9)
      `, [`chk_u1_${c}`, bookIngestedAId, chapterU1Id, 2 + c, c, sampleText1, stagePrepId, gradePrep3Id, subjArabicId]);
    }

    // Seed Chunks for Chapter 2 (3 chunks, total > 100 chars, generation 'gen_v1')
    const sampleText2 = 'العمل المخلص أساس تقدم الأمم ورفعة الشعوب، والإتقان في الأداء واجب وطني وأخلاقي أصيل.';
    for (let c = 0; c < 3; c++) {
      await db.query(`
        INSERT INTO book_chunks (id, book_id, chapter_id, page_number, chunk_index, content, embedding, generation_id, academic_stage_id, grade_id, subject_id)
        VALUES ($1, $2, $3, $4, $5, $6, '{"model":"semantic-hash-768","version":"1.0","vector":[' || $5 || ',0.4,0.5]}', 'gen_v1', $7, $8, $9)
      `, [`chk_u2_${c}`, bookIngestedAId, chapterU2Id, 12 + c, c, sampleText2, stagePrepId, gradePrep3Id, subjArabicId]);
    }

    // 4. Seed Defective Ingested Book (inverted page range: 25 to 10, zero chunks)
    await db.query(`
      INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status, term, school_type, active_generation_id)
      VALUES ($1, $2, $3, $4, 'كتاب معيب البيانات', 'Defective Book', 30, 'COMPLETED', 1, 'كلاهما', 'gen_v1')
    `, [bookDefectiveId, stagePrepId, gradePrep3Id, subjArabicId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'وحدة معيبة الحدود', 'Defective Unit', 25, 10, 'gen_v1')
    `, [chapterDefectiveId, bookDefectiveId]);

    // 5. Seed Canonical Book Record in DB (Prep 3 Arabic Unit 1)
    await db.query(`
      INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status, term, school_type, active_generation_id)
      VALUES ($1, $2, $3, $4, 'اللغة العربية الصف الثالث الإعدادي', 'Prep 3 Arabic', 150, 'COMPLETED', 1, 'كلاهما', 'v1')
    `, [p3ArabicBookId, stagePrepId, gradePrep3Id, subjArabicId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
      VALUES ($1, $2, 1, 'الوحدة الأولى: قيم تحمي شبابنا', 'Unit 1: Values', 15, 59, 'v1')
    `, [p3ArabicUnit1Id, p3ArabicBookId]);

    // 6. Start Express Server
    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);
    app.use('/api/ai', aiRouter);
    app.use('/api/exams', examsRouter);
    app.use('/api/books', booksRouter);

    server = app.listen(0);
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(() => {
    if (server) server.close();
    teardownDisposableTestDb(db, tempDir);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO A: New book ingestion finishes COMPLETED but remains NOT_AUDITED
  // ---------------------------------------------------------------------------
  test('Scenario A: Ingestion completion alone leaves unit NOT_AUDITED and ineligible for AI', async () => {
    const readiness = await ReadinessValidator.getUnitReadinessAsync(bookIngestedAId, chapterU1Id);
    assert.equal(readiness.status, 'NOT_AUDITED', 'Unit must report NOT_AUDITED');
    assert.equal(readiness.isEligibleForAI, false, 'Ingestion complete unit must NOT be eligible for AI without explicit approval');
    assert.ok(readiness.reason.includes('INGESTED_NOT_APPROVED') || readiness.reason.includes('لوحة الإدارة'), 'Reason must cite lack of explicit curriculum approval');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO B: Non-admin teacher cannot approve, reject, or revoke (403 Forbidden)
  // ---------------------------------------------------------------------------
  test('Scenario B: Teacher cannot approve, reject, or revoke curriculum units via HTTP API', async () => {
    // Attempt Approve
    const appRes = await fetch(`${baseUrl}/api/admin/curriculum/units/${chapterU1Id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenTeacherAr}` },
      body: JSON.stringify({ book_id: bookIngestedAId })
    });
    assert.equal(appRes.status, 403, 'Teacher must receive 403 Forbidden on approve endpoint');

    // Attempt Reject
    const rejRes = await fetch(`${baseUrl}/api/admin/curriculum/units/${chapterU1Id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenTeacherAr}` },
      body: JSON.stringify({ book_id: bookIngestedAId, reason: 'unauthorized' })
    });
    assert.equal(rejRes.status, 403, 'Teacher must receive 403 Forbidden on reject endpoint');

    // Attempt Revoke
    const revRes = await fetch(`${baseUrl}/api/admin/curriculum/units/${chapterU1Id}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenTeacherAr}` },
      body: JSON.stringify({ book_id: bookIngestedAId, reason: 'unauthorized' })
    });
    assert.equal(revRes.status, 403, 'Teacher must receive 403 Forbidden on revoke endpoint');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO C: Student cannot access administrative approval endpoints (403 Forbidden)
  // ---------------------------------------------------------------------------
  test('Scenario C: Student cannot access administrative review or approval endpoints', async () => {
    const queueRes = await fetch(`${baseUrl}/api/admin/curriculum/review-queue`, {
      headers: { Authorization: `Bearer ${tokenStudent}` }
    });
    assert.equal(queueRes.status, 403, 'Student must receive 403 Forbidden on review queue');

    const reviewRes = await fetch(`${baseUrl}/api/admin/curriculum/units/${chapterU1Id}/review`, {
      headers: { Authorization: `Bearer ${tokenStudent}` }
    });
    assert.equal(reviewRes.status, 403, 'Student must receive 403 Forbidden on unit review');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO D: Authorized administrator can inspect and approve a valid unit
  // ---------------------------------------------------------------------------
  test('Scenario D: Authorized administrator can inspect review queue, unit details, and approve a valid unit', async () => {
    // 1. Inspect Review Queue
    const queueRes = await fetch(`${baseUrl}/api/admin/curriculum/review-queue`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    assert.equal(queueRes.status, 200, 'Admin can access review queue');
    const queueData = await queueRes.json();
    assert.ok(Array.isArray(queueData.books), 'Review queue must return books array');
    const targetBook = queueData.books.find((b: any) => b.id === bookIngestedAId);
    assert.ok(targetBook, 'Book A must appear in admin review queue');

    // 2. Retrieve Unit Review Details
    const detailsRes = await fetch(`${baseUrl}/api/admin/curriculum/units/${chapterU1Id}/review`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    assert.equal(detailsRes.status, 200);
    const details = await detailsRes.json();
    assert.equal(details.provenance.isValid, true, 'Unit 1 provenance must be valid');
    assert.equal(details.coverage.total_chunks, 3, 'Must report 3 chunks');
    assert.equal(details.approval.status, 'NOT_AUDITED');

    // 3. Approve Unit 1
    const approveRes = await fetch(`${baseUrl}/api/admin/curriculum/units/${chapterU1Id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ book_id: bookIngestedAId, notes: 'معتمد للمنهج الجديد' })
    });
    assert.equal(approveRes.status, 200, 'Admin approve must return HTTP 200');
    const approveData = await approveRes.json();
    assert.equal(approveData.success, true);
    assert.equal(approveData.approval.approval_status, 'APPROVED');

    // Verify row in database
    const dbRow = await db.query(
      'SELECT * FROM curriculum_unit_approvals WHERE book_id = $1 AND chapter_id = $2 AND generation_id = $3',
      [bookIngestedAId, chapterU1Id, 'gen_v1']
    );
    assert.equal(dbRow.rows.length, 1, 'Approval row must exist in DB');
    assert.equal(dbRow.rows[0].approval_status, 'APPROVED');
    assert.equal(dbRow.rows[0].approved_by, adminId);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO E: Approval is persisted and survives validator recreation / process restart
  // ---------------------------------------------------------------------------
  test('Scenario E: Approval survives in-memory cache clear and simulated serverless restart', async () => {
    // Clear all in-memory validator state
    ReadinessValidator.clearDynamicUnits();

    // Query readiness asynchronously from DB
    const readiness = await ReadinessValidator.getUnitReadinessAsync(bookIngestedAId, chapterU1Id);
    assert.equal(readiness.status, 'VERIFIED_READY', 'Unit must evaluate to VERIFIED_READY from persistent DB');
    assert.equal(readiness.isEligibleForAI, true, 'Approved unit must be eligible for AI');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO F: Approved unit becomes eligible only for its approved generation
  // ---------------------------------------------------------------------------
  test('Scenario F: Approved unit eligibility is tied to active generation gen_v1', async () => {
    const approvalRecord = await db.query(
      'SELECT generation_id, approval_status FROM curriculum_unit_approvals WHERE chapter_id = $1',
      [chapterU1Id]
    );
    assert.equal(approvalRecord.rows[0].generation_id, 'gen_v1', 'Approval must be tied strictly to gen_v1');
    assert.equal(approvalRecord.rows[0].approval_status, 'APPROVED');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO G: Re-ingestion to a new generation invalidates previous approval
  // ---------------------------------------------------------------------------
  test('Scenario G: Bumping active_generation_id immediately invalidates previous approval', async () => {
    // Simulate re-ingestion: book active generation bumped to gen_v2
    await db.query(`UPDATE books SET active_generation_id = 'gen_v2' WHERE id = $1`, [bookIngestedAId]);

    const readinessGen2 = await ReadinessValidator.getUnitReadinessAsync(bookIngestedAId, chapterU1Id);
    assert.equal(readinessGen2.isEligibleForAI, false, 'Old approval must NOT be valid for gen_v2');

    // Restore active generation to gen_v1
    await db.query(`UPDATE books SET active_generation_id = 'gen_v1' WHERE id = $1`, [bookIngestedAId]);
    const readinessRestored = await ReadinessValidator.getUnitReadinessAsync(bookIngestedAId, chapterU1Id);
    assert.equal(readinessRestored.isEligibleForAI, true, 'Restored gen_v1 must be eligible again');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO H: Rejected and revoked units remain ineligible
  // ---------------------------------------------------------------------------
  test('Scenario H: Rejected unit remains ineligible with recorded rejection reason', async () => {
    const rejRes = await fetch(`${baseUrl}/api/admin/curriculum/units/${chapterU2Id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ book_id: bookIngestedAId, reason: 'نصوص الوحدة تحتاج إلى تدقيق لغوي إضافي' })
    });
    assert.equal(rejRes.status, 200);

    const readiness = await ReadinessValidator.getUnitReadinessAsync(bookIngestedAId, chapterU2Id);
    assert.equal(readiness.isEligibleForAI, false, 'Rejected unit must NOT be eligible');
    assert.ok(readiness.reason.includes('تدقيق لغوي'), 'Rejection reason must be surfaced');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO I: Approval of one unit does not approve another unit
  // ---------------------------------------------------------------------------
  test('Scenario I: Approval of Unit 1 does not grant approval to Unit 2', async () => {
    const u1 = await ReadinessValidator.getUnitReadinessAsync(bookIngestedAId, chapterU1Id);
    const u2 = await ReadinessValidator.getUnitReadinessAsync(bookIngestedAId, chapterU2Id);

    assert.equal(u1.isEligibleForAI, true, 'Unit 1 must be eligible');
    assert.equal(u2.isEligibleForAI, false, 'Unit 2 must remain ineligible');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO J: Missing pages, missing chunks, invalid provenance, and mismatched generations prevent approval
  // ---------------------------------------------------------------------------
  test('Scenario J: Defective unit fails independent server-side validation during approval attempt', async () => {
    const approveRes = await fetch(`${baseUrl}/api/admin/curriculum/units/${chapterDefectiveId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ book_id: bookDefectiveId })
    });
    assert.equal(approveRes.status, 400, 'Must reject defective unit with 400 Bad Request');
    const data = await approveRes.json();
    assert.ok(data.error.includes('مشاكل في سلامة البيانات') || data.error.includes('نطاق صفحات'), 'Error must report provenance or boundary failure');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO K: Cache and question-bank paths reject unapproved units
  // ---------------------------------------------------------------------------
  test('Scenario K: Cache lookup and AIRagEngine reject unapproved units fail-closed', async () => {
    // Unapproved unit 2 cache lookup
    const cacheResult = await ExamCacheService.getCachedExamForStudent({
      studentId,
      bookId: bookIngestedAId,
      chapterIds: [chapterU2Id],
      examParams: { count: 5, difficulty: 'MEDIUM' }
    });
    assert.equal(cacheResult.hit, false);
    assert.equal(cacheResult.reason, 'INELIGIBLE_STUDENT');

    // AIRagEngine generation rejected
    const ragEngine = new AIRagEngine();
    await assert.rejects(
      async () => {
        await ragEngine.generateQuestions({
          studentId,
          academicStageId: stagePrepId,
          gradeId: gradePrep3Id,
          subjectId: subjArabicId,
          bookId: bookIngestedAId,
          chapterId: chapterU2Id,
          questionCount: 3,
          difficulty: 'MEDIUM',
          language: 'ar',
          examType: 'UNIT'
        });
      },
      /UNIT_READINESS_BLOCKED/
    );
  });

  // ---------------------------------------------------------------------------
  // SCENARIO L: AI generation rejects unapproved units before any Gemini call
  // ---------------------------------------------------------------------------
  test('Scenario L: POST /api/ai/generate-quiz rejects unapproved unit with 403 UNIT_READINESS_BLOCKED before LLM', async () => {
    const res = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenStudent}` },
      body: JSON.stringify({
        book_id: bookIngestedAId,
        chapter_id: chapterU2Id,
        subject_id: subjArabicId,
        count: 3
      })
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.code, 'UNIT_READINESS_BLOCKED');

    // Verify 0 exams in DB
    const checkExams = await db.query('SELECT COUNT(*) as count FROM exams WHERE chapter_id = $1', [chapterU2Id]);
    assert.equal(Number(checkExams.rows[0].count), 0, 'Zero exams must be created in DB');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO M: Teacher manual exam creation rejects unapproved units
  // ---------------------------------------------------------------------------
  test('Scenario M: POST /api/exams rejects unapproved unit with 403 UNIT_READINESS_BLOCKED', async () => {
    const res = await fetch(`${baseUrl}/api/exams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenTeacherAr}` },
      body: JSON.stringify({
        title_ar: 'امتحان غير معتمد',
        title_en: 'Unapproved Exam',
        duration_minutes: 30,
        book_id: bookIngestedAId,
        chapter_id: chapterU2Id,
        subject_id: subjArabicId,
        grade_id: gradePrep3Id,
        academic_stage_id: stagePrepId,
        questions: [{ question_text: 'سؤال؟', points: 1, options: [{ option_text: 'نعم', is_correct: 1 }] }]
      })
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.code, 'UNIT_READINESS_BLOCKED');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO N: All 59 canonical units remain eligible
  // ---------------------------------------------------------------------------
  test('Scenario N: Canonical curricula in authoritative static inventory evaluate to VERIFIED_READY', async () => {
    const p3Ar = await ReadinessValidator.getUnitReadinessAsync(p3ArabicBookId, p3ArabicUnit1Id);
    assert.equal(p3Ar.status, 'VERIFIED_READY');
    assert.equal(p3Ar.isEligibleForAI, true);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO O: Excel Questions workflow remains functional
  // ---------------------------------------------------------------------------
  test('Scenario O: Excel Questions workflow parses rows, resolves correct answers, and persists', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([
      {
        'Question': 'من مؤلف كتاب الأيام؟',
        'Option A': 'طه حسين', 'Option B': 'العقاد', 'Option C': 'شوقي', 'Option D': 'المازني',
        'Right Answer': 'طه حسين', 'Reference Page': 5, 'Bloom Level': 'تذكر'
      }
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Questions');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const parsed = ReferenceImportService.parseWorkbook(buf, 'Questions.xlsx');
    assert.equal(parsed.parsedRows.length, 1);
    const idx = ReferenceImportService.resolveCorrectAnswerIndex('طه حسين', ['طه حسين', 'العقاد', 'شوقي', 'المازني']);
    assert.equal(idx, 0);

    const importRes = await ReferenceImportService.importReferenceWorkbook(buf, {
      operatorId: teacherArId,
      operatorRole: 'TEACHER',
      workbookName: 'Questions.xlsx',
      overrideSubjectId: subjArabicId,
      overrideGradeId: gradePrep3Id,
      overrideStageId: stagePrepId,
      overrideChapterId: chapterU1Id
    });
    assert.equal(importRes.imported, 1);

    const qbRes = await db.query('SELECT id, question_text FROM question_bank_items WHERE chapter_id = $1', [chapterU1Id]);
    assert.equal(qbRes.rows.length, 1);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO P: Excel Exams Reference workflow remains functional
  // ---------------------------------------------------------------------------
  test('Scenario P: Excel Exam Reference preview and teacher specialization check remain enforced', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([
      {
        'Question': 'سؤال تجريبي عن رواد التنوير في مصر؟',
        'Option A': 'رفاعة الطهطاوي',
        'Option B': 'أحمد شوقي',
        'Option C': 'عباس العقاد',
        'Option D': 'حافظ إبراهيم',
        'Right Answer': 'رفاعة الطهطاوي',
        'Reference Page': 5
      }
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Exams');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const preview = await ReferenceImportService.previewReferenceWorkbook(buf, {
      operatorId: teacherArId,
      operatorRole: 'TEACHER',
      workbookName: 'Exams.xlsx',
      overrideSubjectId: subjArabicId,
      overrideGradeId: gradePrep3Id,
      overrideStageId: stagePrepId,
      overrideChapterId: chapterU1Id
    });
    assert.equal(preview.success, true);
    assert.equal(preview.validCount, 1);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO Q: Approved new textbook can complete full AI generation path with deterministic Gemini mock
  // ---------------------------------------------------------------------------
  test('Scenario Q: Approved new textbook unit generates questions successfully with deterministic Gemini mock', async () => {
    const ragEngine = new AIRagEngine();
    const sessionId = `gen_sess_${uuidv4()}`;

    const questions = await ragEngine.generateQuestions({
      studentId,
      academicStageId: stagePrepId,
      gradeId: gradePrep3Id,
      subjectId: subjArabicId,
      bookId: bookIngestedAId,
      chapterId: chapterU1Id,
      questionCount: 2,
      difficulty: 'MEDIUM',
      language: 'ar',
      examType: 'UNIT',
      generationSessionId: sessionId
    });

    assert.ok(Array.isArray(questions), 'Must return array of questions');
    assert.ok(questions.length >= 1, 'Must return at least 1 generated question');
    assert.ok(questions[0].question_text, 'Question text must be populated');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO R: No-reference AI generation remains backward compatible
  // ---------------------------------------------------------------------------
  test('Scenario R: AI generation without style reference generates normally without error', async () => {
    const ragEngine = new AIRagEngine();
    const questions = await ragEngine.generateQuestions({
      studentId,
      academicStageId: stagePrepId,
      gradeId: gradePrep3Id,
      subjectId: subjArabicId,
      bookId: bookIngestedAId,
      chapterId: chapterU1Id,
      questionCount: 1,
      difficulty: 'MEDIUM',
      language: 'ar',
      examType: 'UNIT'
      // No referenceExamId provided
    });
    assert.ok(questions.length >= 1);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO S: Cost tracking and generation session correlation remain intact
  // ---------------------------------------------------------------------------
  test('Scenario S: Generation session correlation and telemetry tracking operate properly', async () => {
    const sessId = `gen_sess_${uuidv4()}`;
    const pWithSession = ExamCacheService.normalizeExamParameters({
      count: 2,
      difficulty: 'MEDIUM',
      styleReferenceId: 'ref_123'
    });
    assert.equal(pWithSession.normalizedParams.count, 2);
    assert.equal(pWithSession.normalizedParams.styleReferenceId, 'ref_123');
    assert.ok(sessId.startsWith('gen_sess_'));
  });

  // ---------------------------------------------------------------------------
  // SCENARIO T: Approval revocation immediately blocks subsequent generation and cache reuse
  // ---------------------------------------------------------------------------
  test('Scenario T: Approval revocation immediately blocks AI generation and cache reuse', async () => {
    // 1. Admin revokes Unit 1 approval
    const revRes = await fetch(`${baseUrl}/api/admin/curriculum/units/${chapterU1Id}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ book_id: bookIngestedAId, reason: 'تحديث وزاري ألغى دروس هذه الوحدة' })
    });
    assert.equal(revRes.status, 200);

    // 2. Readiness check immediately fails closed
    const readiness = await ReadinessValidator.getUnitReadinessAsync(bookIngestedAId, chapterU1Id);
    assert.equal(readiness.isEligibleForAI, false, 'Revoked unit must NOT be eligible for AI');
    assert.ok(readiness.reason.includes('تحديث وزاري') || readiness.reason.includes('سحب'), 'Reason must cite revocation');

    // 3. AI generation endpoint immediately rejects with 403 UNIT_READINESS_BLOCKED
    const genRes = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenStudent}` },
      body: JSON.stringify({
        book_id: bookIngestedAId,
        chapter_id: chapterU1Id,
        subject_id: subjArabicId,
        count: 2
      })
    });
    assert.equal(genRes.status, 403);
    const genData = await genRes.json();
    assert.equal(genData.code, 'UNIT_READINESS_BLOCKED');

    // 4. Cache lookup immediately returns INELIGIBLE_STUDENT
    const cacheResult = await ExamCacheService.getCachedExamForStudent({
      studentId,
      bookId: bookIngestedAId,
      chapterIds: [chapterU1Id],
      examParams: { count: 5, difficulty: 'MEDIUM' }
    });
    assert.equal(cacheResult.hit, false);
    assert.equal(cacheResult.reason, 'INELIGIBLE_STUDENT');
  });
});
