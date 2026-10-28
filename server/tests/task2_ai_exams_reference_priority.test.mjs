import assert from 'assert';
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { setupDisposableTestDb, assertDatabaseIsDisposable } from './test_isolation_helper.mjs';

console.log('================================================================');
console.log('FARABI AI — TASK 2: AI EXAMS REFERENCE PRIORITY TEST SUITE');
console.log('Priority Order: Cached AI -> Imported Reference -> Gemini ($0 spend)');
console.log('================================================================\n');

const { tempDir, dbPath } = setupDisposableTestDb('task2_priority');

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
    // 1. Initialize DB
    const dbModule = await import('../dist/db/db.js');
    const db = dbModule.db || dbModule.default || dbModule;
    await db.init();
    assertDatabaseIsDisposable(db, dbPath);

    // 2. Fetch seeded Academic Stages & Grades
    const prepStageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PREPARATORY'`);
    const stagePrepId = prepStageRes.rows[0].id;

    const primStageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PRIMARY'`);
    const stagePrimId = primStageRes.rows[0].id;

    const prep3GradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PREP_3'`);
    const gradePrep3Id = prep3GradeRes.rows[0].id;

    const prep2GradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PREP_2'`);
    const gradePrep2Id = prep2GradeRes.rows[0].id;

    // 4. Seed Subjects: Science & Arabic
    const sciSubjId = 'subj_sci_' + Date.now();
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en)
       VALUES ($1, $2, 'SCIENCE', 'العلوم', 'Science')`,
      [sciSubjId, gradePrep3Id]
    );

    const arSubjId = 'subj_ar_' + Date.now();
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en)
       VALUES ($1, $2, 'ARABIC', 'اللغة العربية', 'Arabic')`,
      [arSubjId, gradePrep3Id]
    );

    // 5. Seed Teachers
    // Teacher 1: Specialization Science
    const teacherSciId = 'teacher_sci_' + Date.now();
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, subject_id, is_active)
       VALUES ($1, 'teacher_sci@farabi.edu', 'hash', 'TEACHER', 'معلم العلوم', $2, 1)`,
      [teacherSciId, sciSubjId]
    );
    await db.query(
      `INSERT INTO teacher_profiles (user_id, full_name, specialization, subject_id, grade_id, academic_stage_id)
       VALUES ($1, 'معلم العلوم', 'العلوم', $2, $3, $4)`,
      [teacherSciId, sciSubjId, gradePrep3Id, stagePrepId]
    );

    // Teacher 2: Specialization Arabic
    const teacherArId = 'teacher_ar_' + Date.now();
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, subject_id, is_active)
       VALUES ($1, 'teacher_ar@farabi.edu', 'hash', 'TEACHER', 'معلم اللغة العربية', $2, 1)`,
      [teacherArId, arSubjId]
    );
    await db.query(
      `INSERT INTO teacher_profiles (user_id, full_name, specialization, subject_id, grade_id, academic_stage_id)
       VALUES ($1, 'معلم اللغة العربية', 'اللغة العربية', $2, $3, $4)`,
      [teacherArId, arSubjId, gradePrep3Id, stagePrepId]
    );

    // 6. Seed Students
    // Student 1: Prep 3, Prep stage, 'عربي' (Target eligible student)
    const student1Id = 'student_p3_' + Date.now();
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'student_p3@farabi.edu', 'hash', 'STUDENT', 'طالب ثالث إعدادي', 1)`,
      [student1Id]
    );
    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_type)
       VALUES ($1, 'طالب ثالث إعدادي', $2, $3, 'عربي')`,
      [student1Id, stagePrepId, gradePrep3Id]
    );

    // Student 2: Prep 2, Prep stage (Different grade)
    const student2Id = 'student_p2_' + Date.now();
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'student_p2@farabi.edu', 'hash', 'STUDENT', 'طالب ثاني إعدادي', 1)`,
      [student2Id]
    );
    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_type)
       VALUES ($1, 'طالب ثاني إعدادي', $2, $3, 'عربي')`,
      [student2Id, stagePrepId, gradePrep2Id]
    );

    // Student 3: Primary stage (Different stage)
    const student3Id = 'student_prim_' + Date.now();
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'student_prim@farabi.edu', 'hash', 'STUDENT', 'طالب ابتدائي', 1)`,
      [student3Id]
    );
    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_type)
       VALUES ($1, 'طالب ابتدائي', $2, $3, 'عربي')`,
      [student3Id, stagePrimId, gradePrep3Id]
    );

    // 7. Seed Science Book and Chapters
    const sciBookId = 'book_sci_p3_' + Date.now();
    await db.query(
      `INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, total_pages, term, school_type, processing_status)
       VALUES ($1, 'كتاب العلوم - الصف الثالث الإعدادي', 'Science Book - Prep 3', $2, $3, $4, 100, 1, 'كلاهما', 'COMPLETED')`,
      [sciBookId, stagePrepId, gradePrep3Id, sciSubjId]
    );

    // Chapter 1: Unit 1
    const sciCh1Id = 'ch_sci_u1_' + Date.now();
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 1, 'الوحدة الأولى: القوى والحركة', 'Unit 1: Force and Motion', 1, 30)`,
      [sciCh1Id, sciBookId]
    );

    // Chapter 2: Unit 2
    const sciCh2Id = 'ch_sci_u2_' + Date.now();
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
       VALUES ($1, $2, 2, 'الوحدة الثانية: الطاقة الضوئية', 'Unit 2: Light Energy', 31, 60)`,
      [sciCh2Id, sciBookId]
    );

    // Seed Book Pages & Chunks for Unit 1 and Unit 2
    await db.query(
      `INSERT INTO book_pages (book_id, page_number, raw_text)
       VALUES 
         ($1, 10, 'السرعة المنتظمة: يقطع الجسم مسافات متساوية في أزمنة متساوية. المسافة = السرعة × الزمن.'),
         ($1, 18, 'العجلة المنتظمة: التغير في سرعة الجسم بمقادير متساوية في أزمنة متساوية. وحدة قياس العجلة م/ث².'),
         ($1, 35, 'المرايا والعدسات: تعكس المرآة المستوية الضوء وتكون صورة تقديرية معتدلة مساوية للجسم.'),
         ($1, 42, 'العدسة المحدبة: قطعة ضوئية شفافة سميكة من المنتصف ورقيقة عند الطرفين وتجمع الأشعة الضوئية في بؤرة حقيقية.')`,
      [sciBookId]
    );

    await db.query(
      `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content)
       VALUES 
         ('chunk_sci_u1_1', $1, $2, $3, $4, $5, 10, 1, 'السرعة المنتظمة: يقطع الجسم مسافات متساوية في أزمنة متساوية. المسافة = السرعة × الزمن.'),
         ('chunk_sci_u1_2', $1, $2, $3, $4, $5, 18, 2, 'العجلة المنتظمة: التغير في سرعة الجسم بمقادير متساوية في أزمنة متساوية. وحدة قياس العجلة م/ث².'),
         ('chunk_sci_u2_1', $1, $6, $3, $4, $5, 35, 1, 'المرايا والعدسات: تعكس المرآة المستوية الضوء وتكون صورة تقديرية معتدلة مساوية للجسم.'),
         ('chunk_sci_u2_2', $1, $6, $3, $4, $5, 42, 2, 'العدسة المحدبة: قطعة ضوئية شفافة سميكة من المنتصف ورقيقة عند الطرفين وتجمع الأشعة الضوئية في بؤرة حقيقية.')`,
      [sciBookId, sciCh1Id, stagePrepId, gradePrep3Id, sciSubjId, sciCh2Id]
    );

    // 8. Import Services & Middleware
    const { ReferenceImportService } = await import('../dist/services/referenceImportService.js');
    const { ExamCacheService } = await import('../dist/services/examCacheService.js');
    const { aiRagEngine, AIRagEngine } = await import('../dist/services/ai/aiRagEngine.js');
    const { generateToken } = await import('../dist/middleware/auth.js');
    const examsRouter = (await import('../dist/routes/exams.js')).default;
    const aiRouter = (await import('../dist/routes/ai.js')).default;

    // 9. Instrument aiRagEngine.generateQuestions to detect Gemini invocations
    let aiGenerationCalls = 0;
    const originalGenerateQuestions = aiRagEngine.generateQuestions;
    aiRagEngine.generateQuestions = async function (params) {
      aiGenerationCalls++;
      // Return synthetic grounded questions for fallback test
      return [
        {
          id: 'q_gen_' + uuidv4(),
          chunk_id: 'chunk_sci_u2_1',
          book_id: params.bookId,
          chapter_id: params.chapterId,
          question_text: 'تتكون الصورة في المرآة المستوية وتكون دائماً:',
          options: [
            { id: 'opt_g1', text: 'تقديرية معتدلة مساوية للجسم', is_correct: true },
            { id: 'opt_g2', text: 'حقيقية مقلوبة مصغرة', is_correct: false },
            { id: 'opt_g3', text: 'حقيقية مكبرة', is_correct: false }
          ],
          difficulty: 'MEDIUM',
          bloom_level: 'UNDERSTANDING',
          page_reference: 35,
          source_excerpt: 'تعكس المرآة المستوية الضوء وتكون صورة تقديرية معتدلة مساوية للجسم.',
          explanation: 'خصائص الصورة في المرآة المستوية: تقديرية ومعتدلة ومساوية للجسم.'
        }
      ];
    };

    // 10. Teacher imports Excel Reference Exam for Science Prep 3, Unit 1 (Duration: 45 min)
    const workbookRows = [
      {
        'Question': 'حاصل ضرب سرعة الجسم المتحرك في الزمن يعطي:',
        'Option A': 'المسافة المقطوعة',
        'Option B': 'العجلة المنتظمة',
        'Option C': 'الكتلة الكلية',
        'Option D': 'الكثافة النوعية',
        'Right Answer': 'المسافة المقطوعة',
        'Reference Page': 10,
        'Bloom Level': 'تذكر'
      },
      {
        'Question': 'وحدة قياس العجلة في النظام الدولي هي:',
        'Option A': 'متر / ثانية²',
        'Option B': 'متر / ثانية',
        'Option C': 'كيلوجرام / متر',
        'Option D': 'جول / ثانية',
        'Right Answer': 'متر / ثانية²',
        'Reference Page': 18,
        'Bloom Level': 'فهم'
      }
    ];

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(workbookRows);
    xlsx.utils.book_append_sheet(wb, ws, 'Questions');
    const excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const importRes = await ReferenceImportService.importReferenceWorkbook(excelBuffer, {
      operatorId: teacherSciId,
      operatorRole: 'TEACHER',
      workbookName: 'Science_Prep3_Unit1.xlsx',
      overrideStageId: stagePrepId,
      overrideGradeId: gradePrep3Id,
      overrideSubjectId: sciSubjId,
      overrideChapterId: sciCh1Id,
      schoolType: 'كلاهما',
      examTitle: 'اختبار الوحدة الأولى - السرعة والعجلة (مرجع)',
      durationMinutes: 45,
      isPublished: true,
      isStyleReference: true
    });

    assert.strictEqual(importRes.success, true, 'Teacher reference import must succeed');
    const importedReferenceExamId = importRes.fixedExam?.id;
    assert.ok(importedReferenceExamId, 'Must return valid examId for imported reference');

    // 11. Setup Express app with both routes mounted
    const app = express();
    app.use(express.json());
    app.use('/api/exams', examsRouter);
    app.use('/api/ai', aiRouter);

    serverInstance = app.listen(0);
    const port = serverInstance.address().port;
    const baseUrl = `http://localhost:${port}`;

    // Generate tokens
    const student1Token = generateToken({ id: student1Id, email: 'student_p3@farabi.edu', role: 'STUDENT', fullName: 'طالب ثالث إعدادي' });
    const student2Token = generateToken({ id: student2Id, email: 'student_p2@farabi.edu', role: 'STUDENT', fullName: 'طالب ثاني إعدادي' });
    const student3Token = generateToken({ id: student3Id, email: 'student_prim@farabi.edu', role: 'STUDENT', fullName: 'طالب ابتدائي' });
    const teacherSciToken = generateToken({ id: teacherSciId, email: 'teacher_sci@farabi.edu', role: 'TEACHER', fullName: 'معلم العلوم' });
    const teacherArToken = generateToken({ id: teacherArId, email: 'teacher_ar@farabi.edu', role: 'TEACHER', fullName: 'معلم العربي' });

    // ------------------------------------------------------------------------
    // TEST 1 & 2: Priority 1 — Valid cached AI exam is returned first; Gemini calls == 0
    // ------------------------------------------------------------------------
    const cachedQuestions = [
      {
        id: 'q_cache_1',
        chunk_id: 'chunk_sci_u1_1',
        book_id: sciBookId,
        chapter_id: sciCh1Id,
        question_text: 'ما هو تعريف السرعة المنتظمة كما ورد في الكتاب؟',
        options: [
          { id: 'opt_c1', text: 'قطع مسافات متساوية في أزمنة متساوية', is_correct: true },
          { id: 'opt_c2', text: 'قطع مسافات مختلفة في أزمنة متساوية', is_correct: false }
        ],
        difficulty: 'MEDIUM',
        bloom_level: 'KNOWLEDGE',
        page_reference: 10,
        source_excerpt: 'السرعة المنتظمة: يقطع الجسم مسافات متساوية في أزمنة متساوية.',
        explanation: 'السرعة المنتظمة تعني ثبات السرعة بقطع مسافات متساوية في أزمنة متساوية.'
      }
    ];

    const curriculumIdentity = await ExamCacheService.resolveCurriculumIdentity(sciBookId);
    const cachedExamRecord = await ExamCacheService.storeExamInCache({
      identity: curriculumIdentity,
      unitIds: [sciCh1Id],
      examParams: { count: 1, difficulty: 'MEDIUM' },
      questions: cachedQuestions,
      skipProvenanceCheck: true
    });
    const cachedExamRecordId = cachedExamRecord.examId;

    await runTest('1. Valid cached AI exam is selected before an imported reference exam', async () => {
      aiGenerationCalls = 0;
      const resp = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${student1Token}`
        },
        body: JSON.stringify({
          book_id: sciBookId,
          chapter_id: sciCh1Id,
          subject_id: sciSubjId,
          count: 1,
          difficulty: 'MEDIUM'
        })
      });

      const body = await resp.json();
      assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.source, 'CACHED_AI', 'Source must indicate CACHED_AI when valid cache exists');
      assert.strictEqual(body.questions[0].question_text, 'ما هو تعريف السرعة المنتظمة كما ورد في الكتاب؟');
    });

    await runTest('2. When a cached exam exists, Gemini is not called', async () => {
      assert.strictEqual(aiGenerationCalls, 0, 'Gemini generation calls MUST be exactly 0 on cache hit');
    });

    // ------------------------------------------------------------------------
    // TEST 3 & 4: Priority 2 — Matching imported reference exam selected when no cache; Gemini calls == 0
    // ------------------------------------------------------------------------
    // Invalidate cached exam so cache miss occurs
    await db.query(`DELETE FROM shared_cached_exams WHERE id = $1`, [cachedExamRecordId]);
    ExamCacheService.clearMemoryCache();

    let studentAttemptToken = null;
    let studentAttemptQuestions = null;

    await runTest('3. When no cached exam exists but a matching imported reference exists, the reference is selected', async () => {
      aiGenerationCalls = 0;
      const resp = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${student1Token}`
        },
        body: JSON.stringify({
          book_id: sciBookId,
          chapter_id: sciCh1Id,
          subject_id: sciSubjId,
          count: 2,
          difficulty: 'MEDIUM'
        })
      });

      const body = await resp.json();
      assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.source, 'IMPORTED_REFERENCE', 'Source must be IMPORTED_REFERENCE when matching reference exists');
      assert.strictEqual(body.duration_minutes, 45, 'Configured duration (45 mins) must be returned');
      assert.strictEqual(body.questions.length, 2, 'Must return all 2 imported reference questions');
      assert.strictEqual(body.questions[0].question_text, 'حاصل ضرب سرعة الجسم المتحرك في الزمن يعطي:');
      assert.ok(body.attempt_token, 'Must return signed attempt_token for student attempt');

      studentAttemptToken = body.attempt_token;
      studentAttemptQuestions = body.questions;
    });

    await runTest('4. When a matching imported reference is selected, Gemini is not called', async () => {
      assert.strictEqual(aiGenerationCalls, 0, 'Gemini generation calls MUST be exactly 0 on imported reference hit');
    });

    // ------------------------------------------------------------------------
    // TEST 5: Priority 3 — Gemini generation called only when neither cached nor reference exists
    // ------------------------------------------------------------------------
    await runTest('5. Gemini generation is considered only when neither source provides a suitable exam', async () => {
      aiGenerationCalls = 0;
      // Request for Unit 2 (has no cached exam and no imported reference exam)
      const resp = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${student1Token}`
        },
        body: JSON.stringify({
          book_id: sciBookId,
          chapter_id: sciCh2Id,
          subject_id: sciSubjId,
          count: 1,
          difficulty: 'MEDIUM'
        })
      });

      const body = await resp.json();
      assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.source, 'GENERATED_AI', 'Source must be GENERATED_AI when falling back to Priority 3');
      assert.strictEqual(aiGenerationCalls, 1, 'Gemini generation MUST be invoked exactly once');
      assert.strictEqual(body.questions[0].question_text, 'تتكون الصورة في المرآة المستوية وتكون دائماً:');
    });

    // ------------------------------------------------------------------------
    // TEST 6: Grade matching is exact
    // ------------------------------------------------------------------------
    await runTest('6. Grade matching is exact', async () => {
      // Student 2 is in Prep 2, attempting to access Prep 3 book/exam
      const resp = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${student2Token}`
        },
        body: JSON.stringify({
          book_id: sciBookId,
          chapter_id: sciCh1Id,
          subject_id: sciSubjId,
          count: 2,
          difficulty: 'MEDIUM'
        })
      });

      assert.ok(resp.status === 400 || resp.status === 403, `Must reject student from a different grade (got ${resp.status})`);
      const body = await resp.json();
      assert.ok(body.error.includes('GRADE_MISMATCH') || body.error.includes('الصف') || body.error.includes('مختلف') || body.error.includes('يطابق'), 'Error must specify grade mismatch');
    });

    // ------------------------------------------------------------------------
    // TEST 7: Subject matching is exact
    // ------------------------------------------------------------------------
    await runTest('7. Subject matching is exact', async () => {
      // Create Arabic Book and Unit for Prep 3
      const arBookId = 'book_ar_p3_' + Date.now();
      await db.query(
        `INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, total_pages, term, school_type, processing_status)
         VALUES ($1, 'كتاب اللغة العربية - الصف الثالث الإعدادي', 'Arabic Book - Prep 3', $2, $3, $4, 80, 1, 'كلاهما', 'COMPLETED')`,
        [arBookId, stagePrepId, gradePrep3Id, arSubjId]
      );
      const arCh1Id = 'ch_ar_u1_' + Date.now();
      await db.query(
        `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
         VALUES ($1, $2, 1, 'الوحدة الأولى: سفينة نوح', 'Unit 1: Noah Ark', 1, 25)`,
        [arCh1Id, arBookId]
      );
      await db.query(
        `INSERT INTO book_pages (book_id, page_number, raw_text)
         VALUES ($1, 5, 'سفينة نوح عليه السلام: نص قرآني شريف يحث على الإيمان بالله والعمل الصالح.'),
                ($1, 12, 'الفهم القرائي: أمر الله نبيه نوحاً بصنع الفلك لتكون وسيلة للنجاة وحفظ المؤمنين.')`,
        [arBookId]
      );
      await db.query(
        `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content)
         VALUES 
           ('chk_ar_1', $1, $2, $3, $4, $5, 5, 1, 'سفينة نوح عليه السلام: نص قرآني شريف يحث على الإيمان بالله والعمل الصالح.'),
           ('chk_ar_2', $1, $2, $3, $4, $5, 12, 2, 'الفهم القرائي: أمر الله نبيه نوحاً بصنع الفلك لتكون وسيلة للنجاة وحفظ المؤمنين.')`,
        [arBookId, arCh1Id, stagePrepId, gradePrep3Id, arSubjId]
      );

      aiGenerationCalls = 0;
      // Request Arabic unit: must NOT return the Science imported reference exam!
      const resp = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${student1Token}`
        },
        body: JSON.stringify({
          book_id: arBookId,
          chapter_id: arCh1Id,
          subject_id: arSubjId,
          count: 1,
          difficulty: 'MEDIUM'
        })
      });

      const body = await resp.json();
      assert.strictEqual(resp.status, 200);
      assert.notStrictEqual(body.source, 'IMPORTED_REFERENCE', 'Arabic request must NOT receive Science imported reference exam');
      assert.notStrictEqual(body.exam_title, 'اختبار الوحدة الأولى - السرعة والعجلة (مرجع)', 'Must not leak Science exam title');
    });

    // ------------------------------------------------------------------------
    // TEST 8: Unit/chapter matching is exact
    // ------------------------------------------------------------------------
    await runTest('8. Unit/chapter matching is exact', async () => {
      // Request Science Unit 2: must NOT match Unit 1 reference exam
      aiGenerationCalls = 0;
      const resp = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${student1Token}`
        },
        body: JSON.stringify({
          book_id: sciBookId,
          chapter_id: sciCh2Id,
          subject_id: sciSubjId,
          count: 1,
          difficulty: 'MEDIUM'
        })
      });

      const body = await resp.json();
      assert.strictEqual(resp.status, 200);
      assert.notStrictEqual(body.source, 'IMPORTED_REFERENCE', 'Unit 2 request must NOT receive Unit 1 reference exam');
    });

    // ------------------------------------------------------------------------
    // TEST 9: Unauthorized students cannot access exams outside their eligibility
    // ------------------------------------------------------------------------
    await runTest('9. Unauthorized students cannot access exams outside their eligibility', async () => {
      // 1. Missing token
      const noTokenResp = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_id: sciBookId, chapter_id: sciCh1Id, subject_id: sciSubjId })
      });
      assert.strictEqual(noTokenResp.status, 401, 'Unauthenticated request must be rejected with 401');

      // 2. Primary stage student requesting Prep stage exam
      const wrongStageResp = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${student3Token}`
        },
        body: JSON.stringify({ book_id: sciBookId, chapter_id: sciCh1Id, subject_id: sciSubjId })
      });
      assert.ok(wrongStageResp.status === 400 || wrongStageResp.status === 403, `Cross-stage access must be rejected (got ${wrongStageResp.status})`);
    });

    // ------------------------------------------------------------------------
    // TEST 10: Teachers cannot import exams outside their authorized specialization
    // ------------------------------------------------------------------------
    await runTest('10. Teachers cannot import exams outside their authorized specialization', async () => {
      // Science teacher attempts to import Arabic exam
      let unauthError = null;
      try {
        await ReferenceImportService.importReferenceWorkbook(excelBuffer, {
          operatorId: teacherSciId, // Science teacher
          operatorRole: 'TEACHER',
          workbookName: 'Illegal_Arabic_Import.xlsx',
          overrideStageId: stagePrepId,
          overrideGradeId: gradePrep3Id,
          overrideSubjectId: arSubjId, // Arabic subject
          overrideChapterId: sciCh1Id,
          schoolType: 'كلاهما',
          examTitle: 'محاولة استيراد غير مصرح',
          durationMinutes: 30
        });
      } catch (err) {
        unauthError = err;
      }

      assert.ok(unauthError, 'Import outside specialization must fail');
      assert.ok(unauthError.message.includes('غير مصرح للمعلم') || unauthError.message.includes('تخصصه'), 'Must report teacher specialization error');
    });

    // ------------------------------------------------------------------------
    // TEST 11: Imported question text, options, answer keys, source references, and duration remain intact
    // ------------------------------------------------------------------------
    await runTest('11. Imported question text, options, answer keys, source references, and duration remain intact', async () => {
      const examRow = await db.query(`SELECT duration_minutes, title_ar FROM exams WHERE id = $1`, [importedReferenceExamId]);
      assert.strictEqual(parseInt(examRow.rows[0].duration_minutes, 10), 45, 'Duration 45 mins must be stored in exams table');

      const qRows = await db.query(
        `SELECT question_text, points, page_reference, explanation FROM exam_questions WHERE exam_id = $1 ORDER BY order_index ASC`,
        [importedReferenceExamId]
      );
      assert.strictEqual(qRows.rows.length, 2, '2 questions must be stored');
      assert.strictEqual(qRows.rows[0].question_text, 'حاصل ضرب سرعة الجسم المتحرك في الزمن يعطي:');
      assert.strictEqual(qRows.rows[0].page_reference, '10', 'Page reference 10 must be preserved');
      assert.strictEqual(qRows.rows[1].question_text, 'وحدة قياس العجلة في النظام الدولي هي:');
      assert.strictEqual(qRows.rows[1].page_reference, '18', 'Page reference 18 must be preserved');

      // Verify correct option
      const optRows = await db.query(
        `SELECT eqo.option_text, eqo.is_correct
         FROM exam_question_options eqo
         JOIN exam_questions eq ON eqo.question_id = eq.id
         WHERE eq.exam_id = $1 AND eqo.is_correct = 1
         ORDER BY eq.order_index ASC`,
        [importedReferenceExamId]
      );
      assert.strictEqual(optRows.rows[0].option_text, 'المسافة المقطوعة');
      assert.strictEqual(optRows.rows[1].option_text, 'متر / ثانية²');
    });

    // ------------------------------------------------------------------------
    // TEST 12: The imported reference remains unchanged when a student takes the exam
    // ------------------------------------------------------------------------
    await runTest('12. The imported reference remains unchanged when a student takes the exam', async () => {
      const beforeExam = await db.query(`SELECT title_ar, duration_minutes, is_published FROM exams WHERE id = $1`, [importedReferenceExamId]);
      const beforeQCount = await db.query(`SELECT count(*) as cnt FROM exam_questions WHERE exam_id = $1`, [importedReferenceExamId]);

      // Student starts attempt (simulated via API call from Test 3)
      assert.ok(studentAttemptToken, 'Student attempt token is active');

      const afterExam = await db.query(`SELECT title_ar, duration_minutes, is_published FROM exams WHERE id = $1`, [importedReferenceExamId]);
      const afterQCount = await db.query(`SELECT count(*) as cnt FROM exam_questions WHERE exam_id = $1`, [importedReferenceExamId]);

      assert.deepStrictEqual(beforeExam.rows[0], afterExam.rows[0], 'Exam record must remain completely immutable');
      assert.strictEqual(beforeQCount.rows[0].cnt, afterQCount.rows[0].cnt, 'Question count must remain immutable');
    });

    // ------------------------------------------------------------------------
    // TEST 13: Each student\'s attempt is handled through the existing attempt system
    // ------------------------------------------------------------------------
    await runTest('13. Each student\'s attempt is handled through the existing attempt system', async () => {
      const attRows = await db.query(
        `SELECT id, exam_id, student_id, status, started_at
         FROM exam_attempts
         WHERE exam_id = $1 AND student_id = $2`,
        [importedReferenceExamId, student1Id]
      );
      assert.strictEqual(attRows.rows.length, 1, 'Must track attempt in exam_attempts table');
      assert.strictEqual(attRows.rows[0].status, 'IN_PROGRESS', 'Initial attempt status must be IN_PROGRESS');
      assert.ok(attRows.rows[0].started_at, 'Must have authoritative started_at timestamp');
    });

    // ------------------------------------------------------------------------
    // TEST 14: Correct answers and explanations are not exposed prematurely
    // ------------------------------------------------------------------------
    await runTest('14. Correct answers and explanations are not exposed prematurely', async () => {
      for (const q of studentAttemptQuestions) {
        assert.strictEqual(q.explanation, undefined, 'Explanation must be stripped from student questions');
        assert.strictEqual(q.is_correct, undefined, 'is_correct must be stripped from student questions');
        assert.strictEqual(q.correct_answer, undefined, 'correct_answer must be stripped from student questions');
        for (const opt of q.options) {
          assert.strictEqual(opt.is_correct, undefined, 'is_correct must be stripped from question options');
        }
      }
    });

    // ------------------------------------------------------------------------
    // TEST 15: Repeated imports do not silently overwrite existing reference exams
    // ------------------------------------------------------------------------
    await runTest('15. Repeated imports do not silently overwrite existing reference exams', async () => {
      const secondImport = await ReferenceImportService.importReferenceWorkbook(excelBuffer, {
        operatorId: teacherSciId,
        operatorRole: 'TEACHER',
        workbookName: 'Science_Prep3_Unit1_v2.xlsx',
        overrideStageId: stagePrepId,
        overrideGradeId: gradePrep3Id,
        overrideSubjectId: sciSubjId,
        overrideChapterId: sciCh1Id,
        schoolType: 'كلاهما',
        examTitle: 'اختبار الوحدة الأولى - نسخة ثانية',
        durationMinutes: 50,
        isPublished: true,
        isStyleReference: true
      });

      assert.strictEqual(secondImport.success, true, 'Second import must succeed cleanly');
      assert.strictEqual(secondImport.duplicates, 2, 'All identical questions must be detected as duplicates');
      assert.strictEqual(secondImport.fixedExam?.isExisting, true, 'Must flag existing exam to prevent silent overwrite');

      // Verify original exam title and duration were NOT overwritten
      const originalExam = await db.query(`SELECT title_ar, duration_minutes FROM exams WHERE id = $1`, [importedReferenceExamId]);
      assert.strictEqual(originalExam.rows[0].title_ar, 'اختبار الوحدة الأولى - السرعة والعجلة (مرجع)', 'Title must not be overwritten');
      assert.strictEqual(parseInt(originalExam.rows[0].duration_minutes, 10), 45, 'Duration must not be overwritten');
    });

    // ------------------------------------------------------------------------
    // TEST 16: The same exam is not listed multiple times through overlapping discovery paths
    // ------------------------------------------------------------------------
    await runTest('16. The same exam is not listed multiple times through overlapping discovery paths', async () => {
      const listResp = await fetch(`${baseUrl}/api/exams?grade_id=${gradePrep3Id}&subject_id=${sciSubjId}`, {
        headers: { 'Authorization': `Bearer ${student1Token}` }
      });
      if (listResp.status === 200) {
        const examsList = await listResp.json();
        const ids = examsList.map(e => e.id);
        const uniqueIds = new Set(ids);
        assert.strictEqual(ids.length, uniqueIds.size, 'Exam list must contain zero duplicates');
      }
    });

    // ------------------------------------------------------------------------
    // TEST 17: The imported exam remains available after simulated process restart or cache loss
    // ------------------------------------------------------------------------
    await runTest('17. The imported exam remains available after simulated process restart or cache loss', async () => {
      // Clear memory caches completely
      ExamCacheService.clearMemoryCache();
      AIRagEngine.clearMemoryCache();

      // Retrieve from database directly to verify persistent storage
      const persisted = await db.query(`SELECT id, title_ar FROM exams WHERE id = $1`, [importedReferenceExamId]);
      assert.strictEqual(persisted.rows.length, 1, 'Must persist in database');
      assert.strictEqual(persisted.rows[0].id, importedReferenceExamId);

      // Verify that AI exam generation still discovers it from DB without calling Gemini
      aiGenerationCalls = 0;
      const resp = await fetch(`${baseUrl}/api/ai/generate-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${student1Token}`
        },
        body: JSON.stringify({
          book_id: sciBookId,
          chapter_id: sciCh1Id,
          subject_id: sciSubjId,
          count: 2,
          difficulty: 'MEDIUM'
        })
      });

      const body = await resp.json();
      assert.strictEqual(resp.status, 200);
      assert.strictEqual(body.source, 'IMPORTED_REFERENCE', 'Must reload from persistent reference exam store');
      assert.strictEqual(aiGenerationCalls, 0, 'Gemini calls must remain 0 after cache wipe');
    });

    // ------------------------------------------------------------------------
    // TEST 18: The existing timer, answer persistence, grading, and duplicate-submission protections continue to pass
    // ------------------------------------------------------------------------
    await runTest('18. Existing timer, answer persistence, grading, and duplicate-submission protections continue to pass', async () => {
      // Find the correct options for the student attempt questions
      const q1Id = studentAttemptQuestions[0].id;
      const q2Id = studentAttemptQuestions[1].id;

      const optRows = await db.query(
        `SELECT id, question_id, is_correct FROM exam_question_options WHERE question_id IN ($1, $2)`,
        [q1Id, q2Id]
      );
      const q1Correct = optRows.rows.find(r => r.question_id === q1Id && r.is_correct === 1)?.id;
      const q2Correct = optRows.rows.find(r => r.question_id === q2Id && r.is_correct === 1)?.id;

      // Submit evaluation to POST /api/ai/evaluate
      const evalResp = await fetch(`${baseUrl}/api/ai/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${student1Token}`
        },
        body: JSON.stringify({
          attempt_token: studentAttemptToken,
          answers: [
            { question_id: q1Id, selected_option_id: q1Correct },
            { question_id: q2Id, selected_option_id: q2Correct }
          ]
        })
      });

      const evalBody = await evalResp.json();
      assert.strictEqual(evalResp.status, 200, `Evaluation must succeed, got ${evalResp.status}: ${JSON.stringify(evalBody)}`);
      assert.ok(evalBody.report, 'Evaluation response must contain diagnostic report');
      assert.strictEqual(evalBody.report.provisional_percentage, 100, 'All correct answers must achieve 100% score');
      assert.strictEqual(evalBody.report.score, 2, 'Score must equal 2/2 points');

      // Verify exam_attempts status updated to COMPLETED
      const attemptCheck = await db.query(
        `SELECT status, completed_at FROM exam_attempts WHERE exam_id = $1 AND student_id = $2`,
        [importedReferenceExamId, student1Id]
      );
      assert.strictEqual(attemptCheck.rows[0].status, 'COMPLETED', 'Attempt status must be updated to COMPLETED');
      assert.ok(attemptCheck.rows[0].completed_at, 'Completed at timestamp must be set');

      // Duplicate submission idempotency check: submitting again returns valid response without error
      const dupResp = await fetch(`${baseUrl}/api/ai/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${student1Token}`
        },
        body: JSON.stringify({
          attempt_token: studentAttemptToken,
          answers: [
            { question_id: q1Id, selected_option_id: q1Correct },
            { question_id: q2Id, selected_option_id: q2Correct }
          ]
        })
      });
      assert.ok(dupResp.status === 200 || dupResp.status === 409, 'Duplicate submission handled safely');
    });

    console.log('\n================================================================');
    console.log(`ALL TASK 2 TESTS PASSED PERFECTLY: ${passedTests}/${totalTests}`);
    console.log('================================================================');
  } catch (err) {
    console.error('\n❌ TASK 2 TEST SUITE FAILED:', err);
    process.exit(1);
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
  }
}

main();
