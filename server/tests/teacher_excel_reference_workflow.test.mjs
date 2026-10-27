import assert from 'assert';
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import express from 'express';
import { setupDisposableTestDb, assertDatabaseIsDisposable } from './test_isolation_helper.mjs';

console.log('================================================================');
console.log('FARABI AI — TEACHER EXCEL REFERENCE WORKFLOW TEST SUITE');
console.log('Isolated Disposable DB | Zero Live AI Calls | Zero Paid Costs');
console.log('================================================================\n');

const { tempDir, dbPath } = setupDisposableTestDb('teacher_excel_ref');

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
  try {
    // 1. Init DB
    const dbModule = await import('../dist/db/db.js');
    const db = dbModule.db || dbModule.default || dbModule;
    await db.init();
    assertDatabaseIsDisposable(db, dbPath);

    // 2. Seed Stage, Grade, Subjects (Science & Arabic)
    const stageId = 'stage_prep_' + Date.now();
    await db.query(`INSERT INTO academic_stages (id, code, name_ar, name_en, sort_order) VALUES ($1, $2, $3, $4, $5)`, [stageId, 'PREP_' + Date.now(), 'المرحلة الإعدادية', 'Preparatory', 2]);

    const gradeId = 'grade_prep3_' + Date.now();
    await db.query(`INSERT INTO grades (id, stage_id, code, name_ar, name_en, sort_order) VALUES ($1, $2, $3, $4, $5, $6)`, [gradeId, stageId, 'PREP3_' + Date.now(), 'الصف الثالث الإعدادي', 'Prep 3', 3]);

    const sciSubjId = 'subj_science_' + Date.now();
    await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, $3, $4, $5)`, [sciSubjId, gradeId, 'SCIENCE', 'العلوم', 'Science']);

    const arabicSubjId = 'subj_arabic_' + Date.now();
    await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, $3, $4, $5)`, [arabicSubjId, gradeId, 'ARABIC', 'اللغة العربية', 'Arabic']);

    // 3. Seed Teachers:
    // Teacher 1: Specialization Science
    const teacherSciId = 'teacher_sci_' + Date.now();
    await db.query(`INSERT INTO users (id, email, password_hash, role, full_name, subject_id) VALUES ($1, $2, 'hash', 'TEACHER', 'معلم العلوم', $3)`, [teacherSciId, 'teacher_sci@farabi.edu', sciSubjId]);
    await db.query(`INSERT INTO teacher_profiles (user_id, full_name, specialization, subject_id, grade_id, academic_stage_id) VALUES ($1, 'معلم العلوم', 'العلوم', $2, $3, $4)`, [teacherSciId, sciSubjId, gradeId, stageId]);

    // Teacher 2: Specialization Arabic
    const teacherArId = 'teacher_ar_' + Date.now();
    await db.query(`INSERT INTO users (id, email, password_hash, role, full_name, subject_id) VALUES ($1, $2, 'hash', 'TEACHER', 'معلم اللغة العربية', $3)`, [teacherArId, 'teacher_ar@farabi.edu', arabicSubjId]);
    await db.query(`INSERT INTO teacher_profiles (user_id, full_name, specialization, subject_id, grade_id, academic_stage_id) VALUES ($1, 'معلم اللغة العربية', 'اللغة العربية', $2, $3, $4)`, [teacherArId, arabicSubjId, gradeId, stageId]);

    // 4. Seed Books and Chapters
    const sciBookId = 'book_sci_' + Date.now();
    await db.query(`
      INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, total_pages, term, school_type)
      VALUES ($1, 'كتاب العلوم - الصف الثالث الإعدادي', 'Science Book - Prep 3', $2, $3, $4, 100, 1, 'كلاهما')
    `, [sciBookId, stageId, gradeId, sciSubjId]);

    const sciCh1Id = 'ch_sci_unit1_' + Date.now();
    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
      VALUES ($1, $2, 1, 'الوحدة الأولى: القوى والحركة', 'Unit 1: Force and Motion', 1, 40)
    `, [sciCh1Id, sciBookId]);

    await db.query(`
      INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content)
      VALUES 
        ('chunk_sci_p10', $1, $2, $3, $4, $5, 10, 1, 'السرعة المنتظمة هي السرعة التي يتحرك بها الجسم عندما يقطع مسافات متساوية في أزمنة متساوية.'),
        ('chunk_sci_p18', $1, $2, $3, $4, $5, 18, 2, 'العجلة هي مقدار التغير في سرعة الجسم في الثانية الواحدة وتقاس بمتر لكل ثانية مربعة.')
    `, [sciBookId, sciCh1Id, stageId, gradeId, sciSubjId]);

    // Import Services
    const { ReferenceImportService } = await import('../dist/services/referenceImportService.js');
    const { generateToken } = await import('../dist/middleware/auth.js');
    const examsRouter = (await import('../dist/routes/exams.js')).default;

    // Build Science Excel Workbook Buffer
    const validRows = [
      {
        'Question': 'حاصل ضرب سرعة الجسم في الزمن يعطي:',
        'Option A': 'المسافة',
        'Option B': 'العجلة',
        'Option C': 'الكتلة',
        'Option D': 'الكثافة',
        'Right Answer': 'المسافة',
        'Reference Page': 10,
        'Bloom Level': 'تذكر'
      },
      {
        'Question': 'وحدة قياس العجلة في النظام الدولي هي:',
        'Option A': 'م/ث',
        'Option B': 'م/ث²',
        'Option C': 'جول',
        'Option D': 'نيوتن',
        'Right Answer': 'م/ث²',
        'Reference Page': 18,
        'Bloom Level': 'فهم'
      }
    ];

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(validRows);
    xlsx.utils.book_append_sheet(wb, ws, 'Science Unit 1');
    const sciExcelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // ------------------------------------------------------------------------
    // TEST 1: Teacher Authorization — Specialization Enforcement
    // ------------------------------------------------------------------------
    await runTest('Teacher cannot import workbook for a subject different from their specialization', async () => {
      let threw = false;
      try {
        // Arabic teacher trying to import Science workbook
        await ReferenceImportService.previewReferenceWorkbook(sciExcelBuffer, {
          operatorId: teacherArId,
          operatorRole: 'TEACHER',
          workbookName: 'Science_Unit1.xlsx',
          overrideSubjectId: sciSubjId
        });
      } catch (err) {
        threw = true;
        assert.ok(err.message.includes('غير مصرح للمعلم'), `Expected authorization error, got: ${err.message}`);
      }
      assert.strictEqual(threw, true, 'Should block unauthorized teacher');
    });

    // ------------------------------------------------------------------------
    // TEST 2: Non-destructive Preview — Zero DB Modifications
    // ------------------------------------------------------------------------
    await runTest('Non-destructive preview parses workbook and resolves curriculum with 0 DB writes', async () => {
      const qCountBefore = (await db.query(`SELECT COUNT(*) as count FROM question_bank_items`)).rows[0].count;
      const examCountBefore = (await db.query(`SELECT COUNT(*) as count FROM exams`)).rows[0].count;

      const preview = await ReferenceImportService.previewReferenceWorkbook(sciExcelBuffer, {
        operatorId: teacherSciId,
        operatorRole: 'TEACHER',
        workbookName: 'Science_Unit1.xlsx',
        overrideSubjectId: sciSubjId,
        overrideGradeId: gradeId,
        overrideChapterId: sciCh1Id,
        durationMinutes: 45
      });

      assert.strictEqual(preview.success, true);
      assert.strictEqual(preview.totalRows, 2);
      assert.strictEqual(preview.validCount, 2);
      assert.strictEqual(preview.invalidCount, 0);
      assert.strictEqual(preview.duplicatesCount, 0);
      assert.strictEqual(preview.durationMinutes, 45, 'Duration preserved from teacher input');
      assert.strictEqual(preview.resolvedCurriculum.subjectId, sciSubjId);
      assert.strictEqual(preview.questions.length, 2);
      assert.strictEqual(preview.questions[0].options.find(o => o.is_correct)?.option_text, 'المسافة');

      // Verify zero DB modifications during preview
      const qCountAfter = (await db.query(`SELECT COUNT(*) as count FROM question_bank_items`)).rows[0].count;
      const examCountAfter = (await db.query(`SELECT COUNT(*) as count FROM exams`)).rows[0].count;
      assert.strictEqual(qCountAfter, qCountBefore, 'Preview must not insert question bank items');
      assert.strictEqual(examCountAfter, examCountBefore, 'Preview must not insert exams');
    });

    // ------------------------------------------------------------------------
    // TEST 3: Validation and Error Quarantine for Invalid Questions
    // ------------------------------------------------------------------------
    await runTest('Preview correctly identifies invalid rows and reports clear reasons', async () => {
      const invalidRows = [
        {
          'Question': 'سؤال بدون خيارات كافية وبدون إجابة صحيحة',
          'Option A': 'خيار وحيد',
          'Right Answer': '',
          'Reference Page': 10
        }
      ];
      const badWb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(badWb, xlsx.utils.json_to_sheet(invalidRows), 'Bad Sheet');
      const badBuffer = xlsx.write(badWb, { type: 'buffer', bookType: 'xlsx' });

      const preview = await ReferenceImportService.previewReferenceWorkbook(badBuffer, {
        operatorId: teacherSciId,
        operatorRole: 'TEACHER',
        workbookName: 'Bad.xlsx',
        overrideSubjectId: sciSubjId
      });

      assert.strictEqual(preview.validCount, 0);
      assert.strictEqual(preview.invalidCount, 1);
      assert.ok(preview.invalidRows[0].reason.length > 0);
    });

    // ------------------------------------------------------------------------
    // TEST 4: Teacher Import — Duration and Reference Persistence
    // ------------------------------------------------------------------------
    let importedExamResult;
    await runTest('Teacher imports reference workbook: preserves duration, creates fixed exam with correct provenance', async () => {
      importedExamResult = await ReferenceImportService.importReferenceWorkbook(sciExcelBuffer, {
        operatorId: teacherSciId,
        operatorRole: 'TEACHER',
        workbookName: 'Science_Unit1.xlsx',
        overrideSubjectId: sciSubjId,
        overrideGradeId: gradeId,
        overrideChapterId: sciCh1Id,
        durationMinutes: 45,
        examTitle: 'امتحان العلوم الشهري - الوحدة الأولى (نموذج معتمد)',
        isPublished: false,
        isStyleReference: true
      });

      assert.strictEqual(importedExamResult.success, true);
      assert.strictEqual(importedExamResult.imported, 2);
      assert.strictEqual(importedExamResult.duplicates, 0);
      assert.ok(importedExamResult.fixedExam?.id);

      // Verify in DB
      const examDb = (await db.query(`SELECT * FROM exams WHERE id = $1`, [importedExamResult.fixedExam.id])).rows[0];
      assert.strictEqual(examDb.title_ar, 'امتحان العلوم الشهري - الوحدة الأولى (نموذج معتمد)');
      assert.strictEqual(examDb.duration_minutes, 45, 'Duration 45 must be persisted in DB');
      assert.strictEqual(examDb.teacher_id, teacherSciId, 'Correct teacher ownership');
      assert.strictEqual(examDb.is_published, 0, 'Defaults to draft unless teacher explicitly publishes');
      assert.strictEqual(examDb.is_style_reference, 1, 'Marked as style reference');

      // Verify exam questions
      const examQuestions = (await db.query(`SELECT * FROM exam_questions WHERE exam_id = $1 ORDER BY order_index ASC`, [examDb.id])).rows;
      assert.strictEqual(examQuestions.length, 2);
      assert.strictEqual(examQuestions[0].page_reference, '10');
      assert.strictEqual(examQuestions[1].page_reference, '18');
    });

    // ------------------------------------------------------------------------
    // TEST 5: Idempotency & Duplicate Prevention — No Silent Overwrite
    // ------------------------------------------------------------------------
    await runTest('Re-importing identical workbook skips duplicates without modifying existing exam', async () => {
      const reimportResult = await ReferenceImportService.importReferenceWorkbook(sciExcelBuffer, {
        operatorId: teacherSciId,
        operatorRole: 'TEACHER',
        workbookName: 'Science_Unit1.xlsx',
        overrideSubjectId: sciSubjId,
        overrideGradeId: gradeId,
        overrideChapterId: sciCh1Id,
        durationMinutes: 60, // Passed different duration, but identical workbook must not overwrite
        examTitle: 'عنوان بديل غير مرغوب فيه',
        isPublished: true
      });

      assert.strictEqual(reimportResult.imported, 0, 'Zero new questions imported');
      assert.strictEqual(reimportResult.duplicates, 2, 'Both questions recognized as duplicates');
      assert.strictEqual(reimportResult.fixedExam?.isExisting, true, 'Flagged as existing exam');

      // Verify DB exam duration and title were NOT mutated
      const examDb = (await db.query(`SELECT * FROM exams WHERE id = $1`, [importedExamResult.fixedExam.id])).rows[0];
      assert.strictEqual(examDb.duration_minutes, 45, 'Original duration 45 preserved, not overwritten');
      assert.strictEqual(examDb.title_ar, 'امتحان العلوم الشهري - الوحدة الأولى (نموذج معتمد)', 'Original title preserved');
    });

    // ------------------------------------------------------------------------
    // TEST 6: Fixed Exam Hierarchy Integration
    // ------------------------------------------------------------------------
    await runTest('Imported reference exam is browsable through Fixed Exams Hierarchy', async () => {
      const hierarchyRes = await db.query(
        `SELECT e.id, e.title_ar, e.duration_minutes, e.chapter_id, s.name_ar as subject_name_ar
         FROM exams e
         JOIN subjects s ON e.subject_id = s.id
         WHERE e.id = $1`,
        [importedExamResult.fixedExam.id]
      );

      assert.strictEqual(hierarchyRes.rows.length, 1);
      assert.strictEqual(hierarchyRes.rows[0].duration_minutes, 45);
      assert.strictEqual(hierarchyRes.rows[0].subject_name_ar, 'العلوم');
    });

    // ------------------------------------------------------------------------
    // TEST 8: HTTP Endpoints Integration & Role Gates
    // ------------------------------------------------------------------------
    const app = express();
    app.use(express.json());
    app.use('/api/exams', examsRouter);

    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;

    const teacherSciToken = generateToken({ id: teacherSciId, email: 'teacher_sci@farabi.edu', role: 'TEACHER', fullName: 'معلم العلوم', subjectId: sciSubjId });
    const teacherArToken = generateToken({ id: teacherArId, email: 'teacher_ar@farabi.edu', role: 'TEACHER', fullName: 'معلم اللغة العربية', subjectId: arabicSubjId });
    const studentToken = generateToken({ id: 'student_1', email: 'student@farabi.edu', role: 'STUDENT', fullName: 'طالب تجريبي' });

    await runTest('HTTP Endpoint: Student role is rejected with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/exams/references/template`, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      assert.strictEqual(res.status, 403);
    });

    await runTest('HTTP Endpoint: Teacher can download template via GET /references/template', async () => {
      const res = await fetch(`${baseUrl}/api/exams/references/template`, {
        headers: { Authorization: `Bearer ${teacherSciToken}` }
      });
      assert.strictEqual(res.status, 200);
      const buf = Buffer.from(await res.arrayBuffer());
      assert.ok(buf.length > 500);
    });

    await runTest('HTTP Endpoint: Teacher preview rejects non-matching subject with 403', async () => {
      const form = new FormData();
      const fileBlob = new Blob([sciExcelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      form.append('file', fileBlob, 'Science_Unit1.xlsx');
      form.append('subject_id', sciSubjId); // Arabic teacher trying to pass Science subject

      const res = await fetch(`${baseUrl}/api/exams/references/preview-excel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherArToken}` },
        body: form
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.ok(data.error.includes('غير مصرح للمعلم'));
    });

    await runTest('HTTP Endpoint: Authorized teacher preview succeeds with 200 and preserves duration', async () => {
      const form = new FormData();
      const fileBlob = new Blob([sciExcelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      form.append('file', fileBlob, 'Science_Unit1.xlsx');
      form.append('duration_minutes', '40');

      const res = await fetch(`${baseUrl}/api/exams/references/preview-excel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teacherSciToken}` },
        body: form
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.durationMinutes, 40);
      assert.strictEqual(data.validCount, 2);
    });

    server.close();

    console.log('\n================================================================');
    console.log(`ALL ${passedTests}/${totalTests} TEACHER WORKFLOW TESTS PASSED PERFECTLY!`);
    console.log('================================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
  }
}

main();
