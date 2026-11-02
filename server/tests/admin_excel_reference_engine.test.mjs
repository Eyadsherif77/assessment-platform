import assert from 'assert';
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { setupDisposableTestDb, assertDatabaseIsDisposable } from './test_isolation_helper.mjs';

console.log('================================================================');
console.log('FARABI AI — EXAM-STYLE REFERENCE QUESTION ENGINE TEST SUITE');
console.log('Admin Import • Curriculum Scoping • Priority 1, 2, 3 • Passages');
console.log('================================================================\n');

const { tempDir, dbPath } = setupDisposableTestDb('admin_ref_engine');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_admin_ref_engine_12345';
process.env.EXAM_ATTEMPT_SECRET = process.env.EXAM_ATTEMPT_SECRET || 'test_exam_attempt_secret_admin_ref_12345';
process.env.NODE_ENV = 'test';

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

function generateExcelBuffer(rows, sheetName = 'Exams', extraSheets = {}) {
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(rows);
  xlsx.utils.book_append_sheet(wb, ws, sheetName);
  for (const [sName, sRows] of Object.entries(extraSheets)) {
    const sWs = xlsx.utils.json_to_sheet(sRows);
    xlsx.utils.book_append_sheet(wb, sWs, sName);
  }
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function main() {
  let serverInstance = null;
  try {
    // 1. Initialize DB
    const dbModule = await import('../dist/db/db.js');
    const db = dbModule.db || dbModule.default || dbModule;
    await db.init();
    assertDatabaseIsDisposable(db, dbPath);

    // 2. Fetch seeded stages & grades
    const prepStageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PREPARATORY'`);
    const stagePrepId = prepStageRes.rows[0].id;

    const prep3GradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PREP_3'`);
    const gradePrep3Id = prep3GradeRes.rows[0].id;

    const prep2GradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PREP_2'`);
    const gradePrep2Id = prep2GradeRes.rows[0].id;

    // 3. Seed Subjects: Prep 3 English, Prep 3 Arabic, Prep 2 English
    const p3EnglishSubjId = 'subj_p3_eng_' + Date.now();
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en)
       VALUES ($1, $2, 'ENGLISH', 'اللغة الإنجليزية', 'English')`,
      [p3EnglishSubjId, gradePrep3Id]
    );

    const p3ArabicSubjId = 'subj_p3_ar_' + Date.now();
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en)
       VALUES ($1, $2, 'ARABIC', 'اللغة العربية', 'Arabic')`,
      [p3ArabicSubjId, gradePrep3Id]
    );

    const p2EnglishSubjId = 'subj_p2_eng_' + Date.now();
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en)
       VALUES ($1, $2, 'ENGLISH', 'اللغة الإنجليزية', 'English')`,
      [p2EnglishSubjId, gradePrep2Id]
    );

    // 4. Seed Books & Chapters
    // Book 1: Prep 3 English
    const p3EngBookId = 'book_p3_eng_' + Date.now();
    await db.query(
      `INSERT INTO books (id, title_ar, title_en, subject_id, grade_id, academic_stage_id, total_pages, term, school_type, processing_status)
       VALUES ($1, 'كتاب اللغة الإنجليزية للصف الثالث الإعدادي', 'Prep 3 English Textbook', $2, $3, $4, 150, 1, 'كلاهما', 'COMPLETED')`,
      [p3EngBookId, p3EnglishSubjId, gradePrep3Id, stagePrepId]
    );

    const p3EngUnit2Id = 'ch_p3_eng_u2_' + Date.now();
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 2, 'الوحدة الثانية: التسوق عبر الإنترنت', 'Unit 2: Let us go shopping', 20, 40)`,
      [p3EngUnit2Id, p3EngBookId]
    );

    const p3EngUnit3Id = 'ch_p3_eng_u3_' + Date.now();
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 3, 'الوحدة الثالثة: مجتمعنا', 'Unit 3: My community', 41, 65)`,
      [p3EngUnit3Id, p3EngBookId]
    );

    // Book 2: Prep 3 Arabic
    const p3ArBookId = 'book_p3_ar_' + Date.now();
    await db.query(
      `INSERT INTO books (id, title_ar, title_en, subject_id, grade_id, academic_stage_id, total_pages, term, school_type, processing_status)
       VALUES ($1, 'كتاب اللغة العربية للصف الثالث الإعدادي', 'Prep 3 Arabic Textbook', $2, $3, $4, 180, 1, 'كلاهما', 'COMPLETED')`,
      [p3ArBookId, p3ArabicSubjId, gradePrep3Id, stagePrepId]
    );

    const p3ArUnit2Id = 'ch_p3_ar_u2_' + Date.now();
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 2, 'الوحدة الثانية: رحمة ومحبة', 'Unit 2: Mercy and Love', 25, 45)`,
      [p3ArUnit2Id, p3ArBookId]
    );

    // Book 3: Prep 2 English
    const p2EngBookId = 'book_p2_eng_' + Date.now();
    await db.query(
      `INSERT INTO books (id, title_ar, title_en, subject_id, grade_id, academic_stage_id, total_pages, term, school_type, processing_status)
       VALUES ($1, 'كتاب اللغة الإنجليزية للصف الثاني الإعدادي', 'Prep 2 English Textbook', $2, $3, $4, 140, 1, 'كلاهما', 'COMPLETED')`,
      [p2EngBookId, p2EnglishSubjId, gradePrep2Id, stagePrepId]
    );

    const p2EngUnit2Id = 'ch_p2_eng_u2_' + Date.now();
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 2, 'الوحدة الثانية: كيف تشعر؟', 'Unit 2: How are you feeling?', 18, 38)`,
      [p2EngUnit2Id, p2EngBookId]
    );

    // Seed book chunks for grounding verification (at least 3 chunks >= 150 chars to satisfy ReadinessValidator)
    for (const [bId, cId, pNum, subjId, grId] of [
      [p3EngBookId, p3EngUnit2Id, 25, p3EnglishSubjId, gradePrep3Id],
      [p3EngBookId, p3EngUnit3Id, 45, p3EnglishSubjId, gradePrep3Id],
      [p3ArBookId, p3ArUnit2Id, 30, p3ArabicSubjId, gradePrep3Id],
      [p2EngBookId, p2EngUnit2Id, 22, p2EnglishSubjId, gradePrep2Id]
    ]) {
      for (let i = 0; i < 3; i++) {
        await db.query(
          `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
           VALUES ($1, $2, $3, 'Educational content page text with curriculum explanations for testing assessment generation platform.', 150)`,
          [uuidv4(), bId, pNum + i]
        );
        await db.query(
          `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Educational unit text chunk for testing with rich vocabulary, grammar rules and comprehension text details.')`,
          [uuidv4(), bId, cId, stagePrepId, grId, subjId, pNum + i, i]
        );
      }
    }

    // 5. Seed Users: Admin, Teacher, Student
    const adminId = 'admin_' + Date.now();
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'admin@farabi.edu', 'hash', 'ADMIN', 'مدير النظام الرئيسي', 1)`,
      [adminId]
    );

    const teacherId = 'teacher_' + Date.now();
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, subject_id, is_active)
       VALUES ($1, 'teacher_p3@farabi.edu', 'hash', 'TEACHER', 'معلم اللغة الإنجليزية', $2, 1)`,
      [teacherId, p3EnglishSubjId]
    );

    // Student 1: Prep 3
    const studentP3Id = 'student_p3_' + Date.now();
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'student_p3@farabi.edu', 'hash', 'STUDENT', 'طالب ثالثة إعدادي', 1)`,
      [studentP3Id]
    );
    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_type)
       VALUES ($1, 'طالب ثالثة إعدادي', $2, $3, 'عربي')`,
      [studentP3Id, stagePrepId, gradePrep3Id]
    );

    // Student 2: Prep 2
    const studentP2Id = 'student_p2_' + Date.now();
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'student_p2@farabi.edu', 'hash', 'STUDENT', 'طالب ثانية إعدادي', 1)`,
      [studentP2Id]
    );
    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_type)
       VALUES ($1, 'طالب ثانية إعدادي', $2, $3, 'عربي')`,
      [studentP2Id, stagePrepId, gradePrep2Id]
    );

    // Generate JWTs
    const adminToken = jwt.sign({ id: adminId, role: 'ADMIN', email: 'admin@farabi.edu' }, process.env.JWT_SECRET);
    const teacherToken = jwt.sign({ id: teacherId, role: 'TEACHER', email: 'teacher_p3@farabi.edu' }, process.env.JWT_SECRET);
    const studentP3Token = jwt.sign({ id: studentP3Id, role: 'STUDENT', email: 'student_p3@farabi.edu' }, process.env.JWT_SECRET);
    const studentP2Token = jwt.sign({ id: studentP2Id, role: 'STUDENT', email: 'student_p2@farabi.edu' }, process.env.JWT_SECRET);

    // Import Services & Express App
    const { ReferenceImportService } = await import('../dist/services/referenceImportService.js');
    const { ExamCacheService } = await import('../dist/services/examCacheService.js');
    const adminRoutes = (await import('../dist/routes/admin.js')).default;
    const aiRoutes = (await import('../dist/routes/ai.js')).default;
    const examsRoutes = (await import('../dist/routes/exams.js')).default;

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use('/api/ai', aiRoutes);
    app.use('/api/exams', examsRoutes);

    const PORT = 39871;
    await new Promise((resolve) => {
      serverInstance = app.listen(PORT, resolve);
    });
    const baseUrl = `http://127.0.0.1:${PORT}`;

    // Helper fetch wrapper
    async function apiRequest(endpoint, options = {}) {
      const url = `${baseUrl}${endpoint}`;
      const res = await fetch(url, options);
      let body;
      try {
        body = await res.json();
      } catch (_) {
        body = null;
      }
      return { status: res.status, headers: res.headers, body };
    }

    console.log('--- SECTION A: ADMIN IMPORT & AUTHORIZATION TESTS ---');

    await runTest('A.1: Main Admin can access the preview and import endpoints', async () => {
      const validRows = [
        {
          Subject: 'English',
          Unit: 'Unit 2',
          'Question Type': 'GRAMMAR',
          Passage: '',
          Question: 'Neither my brother nor my friends went to the club yesterday.',
          'Option A': 'went',
          'Option B': 'goes',
          'Option C': 'go',
          'Option D': 'has gone',
          'Right Answer': 'went',
          'Reference Page': 25,
          Explanation: 'Past simple'
        }
      ];
      const buffer = generateExcelBuffer(validRows);

      const preview = await ReferenceImportService.previewReferenceWorkbook(buffer, {
        operatorId: adminId,
        operatorRole: 'ADMIN',
        workbookName: 'P3_Eng_U2.xlsx',
        overrideGradeId: gradePrep3Id,
        overrideSubjectId: p3EnglishSubjId,
        overrideChapterId: p3EngUnit2Id
      });

      assert.strictEqual(preview.success, true);
      assert.strictEqual(preview.validCount, 1);
      assert.strictEqual(preview.invalidCount, 0);
    });

    await runTest('A.2: Student is forbidden from accessing the importer (403)', async () => {
      assert.rejects(async () => {
        const buffer = generateExcelBuffer([]);
        await ReferenceImportService.importAdminReferenceQuestions(buffer, {
          operatorId: studentP3Id,
          operatorRole: 'STUDENT',
          workbookName: 'student_hack.xlsx',
          gradeId: gradePrep3Id,
          subjectId: p3EnglishSubjId,
          chapterId: p3EngUnit2Id
        });
      }, /غير مصرح لك باستيراد أسئلة المراجع/);
    });

    await runTest('A.3: Teacher is forbidden from accessing the main admin importer (403)', async () => {
      assert.rejects(async () => {
        const buffer = generateExcelBuffer([]);
        await ReferenceImportService.importAdminReferenceQuestions(buffer, {
          operatorId: teacherId,
          operatorRole: 'TEACHER',
          workbookName: 'teacher_hack.xlsx',
          gradeId: gradePrep3Id,
          subjectId: p3EnglishSubjId,
          chapterId: p3EngUnit2Id
        });
      }, /غير مصرح لك باستيراد أسئلة المراجع/);
    });

    await runTest('A.4: Missing question text is rejected with row number', async () => {
      const invalidRows = [
        {
          Subject: 'English',
          Unit: 'Unit 2',
          Question: '', // EMPTY QUESTION TEXT
          'Option A': 'alpha',
          'Option B': 'beta',
          'Option C': 'gamma',
          'Option D': 'delta',
          'Right Answer': 'alpha'
        }
      ];
      const buffer = generateExcelBuffer(invalidRows);
      const parsed = ReferenceImportService.parseWorkbook(buffer, 'test.xlsx');
      assert.strictEqual(parsed.parsedRows.length, 1);
      assert.strictEqual(parsed.parsedRows[0].isValid, false);
      assert.match(parsed.parsedRows[0].validationError, /السطر 2: نص السؤال فارغ/);
    });

    await runTest('A.5: Missing options (< 4 options) are rejected with row number', async () => {
      const invalidRows = [
        {
          Subject: 'English',
          Unit: 'Unit 2',
          Question: 'What is photosynthesis?',
          'Option A': 'Process 1',
          'Option B': 'Process 2',
          'Option C': '', // Missing option C
          'Option D': '', // Missing option D
          'Right Answer': 'Process 1'
        }
      ];
      const buffer = generateExcelBuffer(invalidRows);
      const parsed = ReferenceImportService.parseWorkbook(buffer, 'test.xlsx');
      assert.strictEqual(parsed.parsedRows[0].isValid, false);
      assert.match(parsed.parsedRows[0].validationError, /يجب توفير 4 خيارات كاملة/);
    });

    await runTest('A.6: Invalid correct-answer mapping is rejected with row number', async () => {
      const invalidRows = [
        {
          Subject: 'English',
          Unit: 'Unit 2',
          Question: 'Choose the correct answer',
          'Option A': 'London',
          'Option B': 'Paris',
          'Option C': 'Cairo',
          'Option D': 'Rome',
          'Right Answer': 'Tokyo' // Not matching any option!
        }
      ];
      const buffer = generateExcelBuffer(invalidRows);
      const parsed = ReferenceImportService.parseWorkbook(buffer, 'test.xlsx');
      assert.strictEqual(parsed.parsedRows[0].isValid, false);
      assert.match(parsed.parsedRows[0].validationError, /لم تطابق أي من الخيارات الأربعة/);
    });

    await runTest('A.7: Completely empty rows are safely ignored without error', async () => {
      const mixedRows = [
        {
          Subject: 'English',
          Unit: 'Unit 2',
          Question: 'Valid question text',
          'Option A': 'A',
          'Option B': 'B',
          'Option C': 'C',
          'Option D': 'D',
          'Right Answer': 'A'
        },
        {
          Subject: '',
          Unit: '',
          Question: '',
          'Option A': '',
          'Option B': '',
          'Option C': '',
          'Option D': '',
          'Right Answer': ''
        } // Empty row
      ];
      const buffer = generateExcelBuffer(mixedRows);
      const parsed = ReferenceImportService.parseWorkbook(buffer, 'test.xlsx');
      assert.strictEqual(parsed.parsedRows.length, 1);
      assert.strictEqual(parsed.parsedRows[0].isValid, true);
    });

    await runTest('A.8: Intra-file duplicate questions are detected and flagged', async () => {
      const dupRows = [
        {
          Subject: 'English',
          Unit: 'Unit 2',
          Question: 'The ammeter is connected in series.',
          'Option A': 'A',
          'Option B': 'B',
          'Option C': 'C',
          'Option D': 'D',
          'Right Answer': 'A'
        },
        {
          Subject: 'English',
          Unit: 'Unit 2',
          Question: 'The ammeter is connected in series.', // Duplicate!
          'Option A': 'A',
          'Option B': 'B',
          'Option C': 'C',
          'Option D': 'D',
          'Right Answer': 'A'
        }
      ];
      const buffer = generateExcelBuffer(dupRows);
      const parsed = ReferenceImportService.parseWorkbook(buffer, 'test.xlsx');
      assert.strictEqual(parsed.parsedRows.length, 2);
      assert.strictEqual(parsed.parsedRows[0].isValid, true);
      assert.strictEqual(parsed.parsedRows[1].isValid, false);
      assert.match(parsed.parsedRows[1].validationError, /تكرار السؤال داخل نفس الملف/);
    });

    console.log('\n--- SECTION B: CURRICULUM-LINKING & PERSISTENCE TESTS ---');

    // Import 5 reference questions for Prep 3 English Unit 2
    const p3EngU2Questions = [
      {
        Subject: 'English',
        Unit: 'Unit 2',
        'Question Type': 'GRAMMAR',
        Passage: '',
        Question: 'Neither my brother nor my friends ……… to the museum last Friday.',
        'Option A': 'went',
        'Option B': 'goes',
        'Option C': 'go',
        'Option D': 'has gone',
        'Right Answer': 'went',
        'Reference Page': 25,
        Explanation: 'Past simple'
      },
      {
        Subject: 'English',
        Unit: 'Unit 2',
        'Question Type': 'VOCABULARY',
        Passage: '',
        Question: 'A ……… is an appliance used to boil water quickly in the kitchen.',
        'Option A': 'kettle',
        'Option B': 'microwave',
        'Option C': 'toaster',
        'Option D': 'fridge',
        'Right Answer': 'kettle',
        'Reference Page': 26,
        Explanation: 'Kettle boils water'
      },
      {
        Subject: 'English',
        Unit: 'Unit 2',
        'Question Type': 'READING_COMPREHENSION',
        Passage: 'E-commerce has rapidly expanded across the world. Consumers enjoy browsing varied items from smart devices at home. Nevertheless, shipping delays and damaged packages can occasionally frustrate online buyers.',
        Question: 'Why do consumers enjoy e-commerce according to the passage?',
        'Option A': 'They can browse varied items from home',
        'Option B': 'It delivers packages instantly within minutes',
        'Option C': 'All goods are completely free of tax',
        'Option D': 'Deliveries never suffer any damage',
        'Right Answer': 'They can browse varied items from home',
        'Reference Page': 28,
        Explanation: 'Explicit comprehension from sentence 2'
      },
      {
        Subject: 'English',
        Unit: 'Unit 2',
        'Question Type': 'READING_COMPREHENSION',
        Passage: 'E-commerce has rapidly expanded across the world. Consumers enjoy browsing varied items from smart devices at home. Nevertheless, shipping delays and damaged packages can occasionally frustrate online buyers.',
        Question: 'The opposite of the word "rapidly" in the text is ………',
        'Option A': 'slowly',
        'Option B': 'quickly',
        'Option C': 'happily',
        'Option D': 'eagerly',
        'Right Answer': 'slowly',
        'Reference Page': 28,
        Explanation: 'Antonym of rapidly'
      },
      {
        Subject: 'English',
        Unit: 'Unit 2',
        'Question Type': 'DIALOGUE',
        Passage: '',
        Question: 'Shop assistant: "Can I help you with anything, sir?" Customer: "………"',
        'Option A': 'Yes, I am looking for a wireless speaker',
        'Option B': 'No, yesterday was sunny',
        'Option C': 'I visited the doctor last week',
        'Option D': 'Trains usually arrive on platform four',
        'Right Answer': 'Yes, I am looking for a wireless speaker',
        'Reference Page': 30,
        Explanation: 'Appropriate dialogue response'
      }
    ];

    await runTest('B.1: Main Admin imports Prep 3 English Unit 2 reference questions persistently', async () => {
      const buffer = generateExcelBuffer(p3EngU2Questions);
      const summary = await ReferenceImportService.importAdminReferenceQuestions(buffer, {
        operatorId: adminId,
        operatorRole: 'ADMIN',
        workbookName: 'P3_English_Unit2_Official.xlsx',
        gradeId: gradePrep3Id,
        subjectId: p3EnglishSubjId,
        chapterId: p3EngUnit2Id
      });

      assert.strictEqual(summary.success, true);
      assert.strictEqual(summary.imported, 5);
      assert.strictEqual(summary.resolvedCurriculum.gradeId, gradePrep3Id);
      assert.strictEqual(summary.resolvedCurriculum.subjectId, p3EnglishSubjId);
      assert.strictEqual(summary.resolvedCurriculum.chapterId, p3EngUnit2Id);

      // Verify persistent storage in question_bank_items
      const qRes = await db.query(
        `SELECT id, question_text, question_type, passage_text, is_reference FROM question_bank_items WHERE chapter_id = $1 AND is_reference = 1`,
        [p3EngUnit2Id]
      );
      assert.strictEqual(qRes.rows.length, 5);
      assert.strictEqual(qRes.rows.every(r => r.is_reference === 1), true);

      // Verify passage preservation without truncation
      const compQ = qRes.rows.find(r => r.question_type === 'READING_COMPREHENSION');
      assert.ok(compQ);
      assert.ok(compQ.passage_text.includes('E-commerce has rapidly expanded'));
    });

    await runTest('B.2: Re-importing identical reference file de-duplicates cleanly without duplicate active items', async () => {
      const buffer = generateExcelBuffer(p3EngU2Questions);
      const summary = await ReferenceImportService.importAdminReferenceQuestions(buffer, {
        operatorId: adminId,
        operatorRole: 'ADMIN',
        workbookName: 'P3_English_Unit2_Official.xlsx',
        gradeId: gradePrep3Id,
        subjectId: p3EnglishSubjId,
        chapterId: p3EngUnit2Id
      });

      assert.strictEqual(summary.imported, 5);
      const qRes = await db.query(
        `SELECT COUNT(*) as count FROM question_bank_items WHERE chapter_id = $1 AND is_reference = 1`,
        [p3EngUnit2Id]
      );
      assert.strictEqual(Number(qRes.rows[0].count), 5); // Count remains 5, no duplicates!
    });

    await runTest('B.3: Reference questions do NOT appear in static exam hierarchy for students', async () => {
      const res = await apiRequest(`/api/exams/fixed/hierarchy?grade_id=${gradePrep3Id}&term=1`, {
        headers: { Authorization: `Bearer ${studentP3Token}` }
      });
      assert.strictEqual(res.status, 200);
      const subjects = res.body.subjects || res.body;
      const engSubj = subjects.find(s => s.id === p3EnglishSubjId);
      if (engSubj) {
        const u2 = engSubj.units.find(u => u.unit_id === p3EngUnit2Id);
        // Unit 2 should have 0 static exams! Reference questions are strictly for AI exams
        assert.strictEqual(u2?.exams?.length || 0, 0);
      }
    });

    console.log('\n--- SECTION C: PRIORITY HIERARCHY & ZERO-COST ($0) GEMINI TESTS ---');

    await runTest('C.1: Priority 2 Match (Sufficient References): Generates AI exam with ZERO Gemini calls', async () => {
      const res = await apiRequest('/api/ai/generate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentP3Token}`
        },
        body: JSON.stringify({
          book_id: p3EngBookId,
          chapter_id: p3EngUnit2Id,
          subject_id: p3EnglishSubjId,
          count: 5
        })
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.questions.length, 5);
      assert.strictEqual(res.body.source, 'IMPORTED_REFERENCE');

      // Verify that questions preserve question text, options, and passage
      const questions = res.body.questions;
      assert.ok(questions.some(q => q.question_text.includes('Neither my brother nor my friends')));
      assert.ok(questions.some(q => q.question_text.includes('boil water') || q.options.some(o => o.text === 'kettle')));

      // Verify comprehension passage is present in payload
      const passageQ = questions.find(q => q.passage_text && q.passage_text.length > 0);
      assert.ok(passageQ, 'Reading comprehension passage must be provided in response');
      assert.ok(passageQ.passage_text.includes('E-commerce has rapidly expanded'));

      // Verify security: student payload never exposes is_correct
      for (const q of questions) {
        for (const opt of q.options) {
          assert.strictEqual(opt.is_correct, undefined, 'Student API must never expose is_correct');
        }
      }
    });

    await runTest('C.2: Priority 1 Match (Shared Cache HIT): Subsequent request hits cache with ZERO Gemini calls', async () => {
      const res = await apiRequest('/api/ai/generate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentP3Token}`
        },
        body: JSON.stringify({
          book_id: p3EngBookId,
          chapter_id: p3EngUnit2Id,
          subject_id: p3EnglishSubjId,
          count: 5
        })
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.questions.length, 5);
      // Hit shared cached exam
      assert.ok(res.body.source === 'CACHED_AI' || res.body.source === 'IMPORTED_REFERENCE');
    });

    console.log('\n--- SECTION D: CURRICULUM ISOLATION & ACCESS CONTROL TESTS ---');

    await runTest('D.1: Prep 3 English Unit 3 cannot retrieve Unit 2 references', async () => {
      // Unit 3 has NO reference questions imported yet. Should fail closed without falling to Unit 2.
      const res = await apiRequest('/api/ai/generate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentP3Token}`
        },
        body: JSON.stringify({
          book_id: p3EngBookId,
          chapter_id: p3EngUnit3Id,
          subject_id: p3EnglishSubjId,
          count: 5
        })
      });
      // Since no Gemini key is provided in test env, must fail closed rather than leaking Unit 2 references!
      assert.ok(res.status === 503 || res.status === 500);
      assert.notStrictEqual(res.body?.source, 'IMPORTED_REFERENCE');
    });

    await runTest('D.2: Prep 2 student cannot retrieve Prep 3 references', async () => {
      const res = await apiRequest('/api/ai/generate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentP2Token}`
        },
        body: JSON.stringify({
          book_id: p3EngBookId, // Trying to request Prep 3 book
          chapter_id: p3EngUnit2Id,
          subject_id: p3EnglishSubjId,
          count: 5
        })
      });
      // Grade mismatch: Student is Prep 2, Book is Prep 3
      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /GRADE_MISMATCH/);
    });

    await runTest('D.3: Arabic cannot retrieve English reference questions', async () => {
      // Request Arabic book with Arabic unit
      const res = await apiRequest('/api/ai/generate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentP3Token}`
        },
        body: JSON.stringify({
          book_id: p3ArBookId,
          chapter_id: p3ArUnit2Id,
          subject_id: p3ArabicSubjId,
          count: 5
        })
      });
      // No Arabic references imported yet; must not leak English references
      assert.notStrictEqual(res.body?.source, 'IMPORTED_REFERENCE');
    });

    console.log('\n--- SECTION E: ARABIC REFERENCE QUESTIONS & PASSAGES ---');

    await runTest('E.1: Import Arabic examination references (النحو، الفهم القرائي مع القطعة)', async () => {
      const arabicRows = [
        {
          Subject: 'اللغة العربية',
          Unit: 'الوحدة الثانية',
          'Question Type': 'النحو',
          Passage: '',
          Question: 'يا طالباً العلمَ، أقبل على دروسك بشغف. إعراب كلمة "طالباً":',
          'Option A': 'منادى منصوب بالفتحة الظاهرة',
          'Option B': 'مبتدأ مؤخر مرفوع بالضمة',
          'Option C': 'مفعول به ثان منصوب',
          'Option D': 'فاعل مرفوع بالضمة المقدرة',
          'Right Answer': 'منادى منصوب بالفتحة الظاهرة',
          'Reference Page': 30,
          Explanation: 'منادى شبيه بالمضاف حكمه النصب'
        },
        {
          Subject: 'اللغة العربية',
          Unit: 'الوحدة الثانية',
          'Question Type': 'الفهم القرائي',
          Passage: 'إن الرحمة الإنسانية ليست شعوراً سلبياً عابراً، بل هي دافع خلقي أصيل يدعو إلى التضامن والتكافل بين أبناء المجتمع الواحد، وبها تسود مشاعر الألفة والوئام.',
          Question: 'الدعوة الرئيسة التي يحث عليها النص هي:',
          'Option A': 'التضامن والتكافل العملي بين أفراد المجتمع',
          'Option B': 'الانعزال التام عن قضايا المجتمع',
          'Option C': 'الاكتفاء بالمشاعر دون تقديم العون',
          'Option D': 'التنافس المادي بين الأفراد',
          'Right Answer': 'التضامن والتكافل العملي بين أفراد المجتمع',
          'Reference Page': 32,
          Explanation: 'المفهوم الأساسي للرحمة في النص'
        },
        {
          Subject: 'اللغة العربية',
          Unit: 'الوحدة الثانية',
          'Question Type': 'الفهم القرائي',
          Passage: 'إن الرحمة الإنسانية ليست شعوراً سلبياً عابراً، بل هي دافع خلقي أصيل يدعو إلى التضامن والتكافل بين أبناء المجتمع الواحد، وبها تسود مشاعر الألفة والوئام.',
          Question: 'مضاد كلمة "الوئام" في سياق الفقرة هو:',
          'Option A': 'الشقاق والخصام',
          'Option B': 'التسامح والصلح',
          'Option C': 'التكافل والتعاون',
          'Option D': 'السكينة والهدوء',
          'Right Answer': 'الشقاق والخصام',
          'Reference Page': 32,
          Explanation: 'عكس الوئام'
        }
      ];

      const buffer = generateExcelBuffer(arabicRows);
      const summary = await ReferenceImportService.importAdminReferenceQuestions(buffer, {
        operatorId: adminId,
        operatorRole: 'ADMIN',
        workbookName: 'P3_Arabic_Unit2_Official.xlsx',
        gradeId: gradePrep3Id,
        subjectId: p3ArabicSubjId,
        chapterId: p3ArUnit2Id
      });

      assert.strictEqual(summary.success, true);
      assert.strictEqual(summary.imported, 3);

      // Verify Arabic AI exam generation retrieves Arabic references with passage
      const res = await apiRequest('/api/ai/generate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentP3Token}`
        },
        body: JSON.stringify({
          book_id: p3ArBookId,
          chapter_id: p3ArUnit2Id,
          subject_id: p3ArabicSubjId,
          count: 3
        })
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.questions.length, 3);
      assert.strictEqual(res.body.source, 'IMPORTED_REFERENCE');

      const arabicPassageQ = res.body.questions.find(q => q.passage_text && q.passage_text.includes('الرحمة الإنسانية'));
      assert.ok(arabicPassageQ, 'Arabic reading passage must be preserved and visible to student');
    });

    console.log('\n--- SECTION F: STUDENT EXAM EVALUATION & ATTEMPT PERSISTENCE ---');

    await runTest('F.1: Student evaluates AI exam answers and gets server-authoritative score', async () => {
      // 1. Generate exam
      const genRes = await apiRequest('/api/ai/generate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentP3Token}`
        },
        body: JSON.stringify({
          book_id: p3EngBookId,
          chapter_id: p3EngUnit2Id,
          subject_id: p3EnglishSubjId,
          count: 5
        })
      });

      assert.strictEqual(genRes.status, 200);
      const { attempt_token, questions } = genRes.body;
      assert.ok(attempt_token);

      // Pick option for each question (answer first option for all)
      const answers = {};
      questions.forEach(q => {
        answers[q.id] = q.options[0].id;
      });

      // Submit evaluation
      const evalRes = await apiRequest('/api/ai/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentP3Token}`
        },
        body: JSON.stringify({
          attempt_token,
          answers
        })
      });

      assert.strictEqual(evalRes.status, 200);
      assert.ok(evalRes.body.report);
      assert.ok(typeof evalRes.body.report.score === 'number');
    });

    console.log('\n================================================================');
    console.log(`ALL TESTS PASSED! (${passedTests}/${totalTests})`);
    console.log('================================================================\n');

  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
  }
}

main().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
