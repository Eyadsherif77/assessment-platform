import assert from 'assert';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { setupDisposableTestDb, assertDatabaseIsDisposable } from './test_isolation_helper.mjs';

console.log('================================================================');
console.log('FARABI AI — REFERENCE EXAM & CACHE ROTATION REGRESSION TEST');
console.log('Verifying Fixes for:');
console.log('1. EXAM_CONTENT_MISMATCH 409 Resolution in /api/ai/evaluate');
console.log('2. Question Rotation for Reference Exams (Unseen Questions Prioritized)');
console.log('3. Circular Fallback Recycling when all versions are attempted');
console.log('4. Partial Exam Acceptance (>= 3 questions) eliminating 14s lockout');
console.log('================================================================\n');

const { tempDir, dbPath } = setupDisposableTestDb('ref_exam_rotation');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_rotation_12345';
process.env.EXAM_ATTEMPT_SECRET = process.env.EXAM_ATTEMPT_SECRET || 'test_exam_attempt_secret_rotation_12345';

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

    const { ExamCacheService } = await import('../dist/services/examCacheService.js');
    const { signExamAttemptToken, verifyExamAttemptToken } = await import('../dist/services/answerValidationService.js');

    // 2. Fetch seeded Academic Stages & Grades
    const prepStageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'PREPARATORY'`);
    const stagePrepId = prepStageRes.rows[0].id;
    const prep3GradeRes = await db.query(`SELECT id FROM grades WHERE code = 'PREP_3'`);
    const gradePrep3Id = prep3GradeRes.rows[0].id;

    // 3. Seed Subject & Book & Chapter
    const sciSubjId = 'subj_sci_' + Date.now();
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en)
       VALUES ($1, $2, 'SCIENCE', 'العلوم', 'Science')`,
      [sciSubjId, gradePrep3Id]
    );

    const bookId = 'book_sci_' + Date.now();
    const genId = 'gen_test_' + Date.now();
    await db.query(
      `INSERT INTO books (id, title_ar, title_en, grade_id, subject_id, academic_stage_id, total_pages, processing_status, active_generation_id, term, school_type)
       VALUES ($1, 'علوم الصف الثالث الإعدادي', 'Science Prep 3', $2, $3, $4, 100, 'COMPLETED', $5, 'TERM_1', 'كلاهما')`,
      [bookId, gradePrep3Id, sciSubjId, stagePrepId, genId]
    );

    const chapterId = 'ch_unit2_' + Date.now();
    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
       VALUES ($1, $2, 2, 'الوحدة الثانية: الكهرباء والمغناطيسية', 'Unit 2: Electricity', 20, 40, $3)`,
      [chapterId, bookId, genId]
    );

    // Seed admin user for approvals
    const adminId = 'admin_user_' + Date.now();
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'admin@example.com', 'hash123', 'ADMIN', 'مدير النظام', 1)`,
      [adminId]
    );

    // Seed approved curriculum unit approval record
    await db.query(
      `INSERT INTO curriculum_unit_approvals (id, book_id, chapter_id, generation_id, approval_status, approved_by, approved_at)
       VALUES ($1, $2, $3, $4, 'APPROVED', $5, datetime('now'))`,
      ['cua_' + Date.now(), bookId, chapterId, genId, adminId]
    );

    // Seed educational chunks for content sufficiency check (>= 3 chunks, >= 500 chars)
    for (let c = 1; c <= 4; c++) {
      await db.query(
        `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, generation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          `chk_unit2_${c}_${Date.now()}`,
          bookId,
          chapterId,
          stagePrepId,
          gradePrep3Id,
          sciSubjId,
          20 + c,
          c,
          `محتوى تعليمي معتمد للوحدة الثانية في العلوم للصف الثالث الإعدادي حول الكهرباء والمغناطيسية والدوائر الكهربية وقانون أوم والمقاومة المتغيرة والمولد الكهربي. المقطع التعليمي رقم ${c} لشرح التفاصيل الفيزيائية الكاملة بدقة.`,
          genId
        ]
      );
    }

    // 4. Seed Teacher & Reference Exam in `exams` table with 8 questions
    const teacherId = 'teacher_test_' + Date.now();
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, 'teacher@example.com', 'hash123', 'TEACHER', 'معلم اختباري', 1)`,
      [teacherId]
    );

    const refExamId = 'ref_exam_unit2_' + Date.now();
    await db.query(
      `INSERT INTO exams (id, teacher_id, title_ar, title_en, academic_stage_id, grade_id, subject_id, chapter_id, book_id, duration_minutes, is_ai_reference)
       VALUES ($1, $2, 'امتحان العلوم المعتمد - الوحدة 2', 'Science Unit 2 Reference', $3, $4, $5, $6, $7, 30, 1)`,
      [refExamId, teacherId, stagePrepId, gradePrep3Id, sciSubjId, chapterId, bookId]
    );

    const qIds = [];
    for (let i = 1; i <= 8; i++) {
      const qId = `q_unit2_${i}_${Date.now()}`;
      qIds.push(qId);
      await db.query(
        `INSERT INTO exam_questions (id, exam_id, question_text, question_type, points, order_index, explanation)
         VALUES ($1, $2, $3, 'MULTIPLE_CHOICE', 1, $4, $5)`,
        [qId, refExamId, `سؤال معتمد رقم ${i} في الكهرباء والمغناطيسية`, i, `شرح السؤال ${i}`]
      );

      // Add options
      await db.query(
        `INSERT INTO exam_question_options (id, question_id, option_text, is_correct)
         VALUES ($1, $2, 'خيار أ صحيح', 1), ($3, $2, 'خيار ب خاطئ', 0)`,
        [`opt_${qId}_1`, qId, `opt_${qId}_2`]
      );
    }

    // 5. Setup Express app with ai router
    const aiRouter = (await import('../dist/routes/ai.js')).default;
    const jwt = (await import('jsonwebtoken')).default;

    const studentUser = {
      id: 'student_test_' + Date.now(),
      email: 'student@example.com',
      role: 'STUDENT'
    };

    // Seed student in database
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active)
       VALUES ($1, $2, 'hash123', 'STUDENT', 'طالب اختباري', 1)`,
      [studentUser.id, studentUser.email]
    );

    await db.query(
      `INSERT INTO student_profiles (user_id, full_name, academic_stage_id, grade_id, school_type)
       VALUES ($1, 'طالب اختباري', $2, $3, 'عربي')`,
      [studentUser.id, stagePrepId, gradePrep3Id]
    );

    const studentToken = jwt.sign(studentUser, process.env.JWT_SECRET);

    const app = express();
    app.use(express.json());
    app.use('/api/ai', aiRouter);

    const serverPort = 8765 + Math.floor(Math.random() * 500);
    serverInstance = app.listen(serverPort);
    const baseUrl = `http://127.0.0.1:${serverPort}/api/ai`;

    // ----------------------------------------------------------------
    // TEST 1: Generate exam with Priority 2 Reference Bank
    // ----------------------------------------------------------------
    let firstAttemptToken = '';
    let firstQIds = [];
    await runTest('Test 1: Priority 2 Reference Exam generation returns 5 unseen questions', async () => {
      const res = await fetch(`${baseUrl}/generate-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentToken}`
        },
        body: JSON.stringify({
          book_id: bookId,
          chapter_id: chapterId,
          subject_id: sciSubjId,
          count: 5
        })
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.questions.length, 5);
      assert.strictEqual(body.source, 'IMPORTED_REFERENCE');
      assert.ok(body.attempt_token, 'attempt_token must be present');

      firstAttemptToken = body.attempt_token;
      firstQIds = body.questions.map(q => q.id);

      // Verify that NO colliding row was stored in shared_cached_exams with the reference exam ID
      const collidingCheck = await db.query(`SELECT id FROM shared_cached_exams WHERE id = $1`, [refExamId]);
      assert.strictEqual(collidingCheck.rows.length, 0, 'Reference exam ID must NEVER be stored into shared_cached_exams');
    });

    // ----------------------------------------------------------------
    // TEST 2: Evaluate Reference Exam submission without 409 EXAM_CONTENT_MISMATCH
    // ----------------------------------------------------------------
    await runTest('Test 2: Reference exam evaluation succeeds and grades out of 5 questions', async () => {
      const answers = firstQIds.map(qid => ({
        question_id: qid,
        selected_option_id: `opt_${qid}_1` // correct option
      }));

      const res = await fetch(`${baseUrl}/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentToken}`
        },
        body: JSON.stringify({
          attempt_token: firstAttemptToken,
          answers
        })
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert.ok(body.report, 'report must be returned');
      assert.strictEqual(body.report.max_score, 5, 'Score must be out of 5, not full 8 reference questions');
      assert.strictEqual(body.report.score, 5, 'Score should be 5/5');
      assert.strictEqual(body.report.items.length, 5, 'Report should contain exactly 5 evaluated items');
    });

    // ----------------------------------------------------------------
    // TEST 3: Question Rotation: Second generation excludes already-answered questions
    // ----------------------------------------------------------------
    await runTest('Test 3: Question Rotation picks remaining unseen questions from reference bank', async () => {
      const res = await fetch(`${baseUrl}/generate-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentToken}`
        },
        body: JSON.stringify({
          book_id: bookId,
          chapter_id: chapterId,
          subject_id: sciSubjId,
          count: 3
        })
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.questions.length, 3);
      assert.strictEqual(body.source, 'IMPORTED_REFERENCE');

      const secondQIds = body.questions.map(q => q.id);
      // Check that none of the second questions overlap with the first 5 questions!
      const overlap = secondQIds.filter(qid => firstQIds.includes(qid));
      assert.strictEqual(overlap.length, 0, `Expected 0 overlap due to question rotation, but got ${overlap.length}`);
    });

    // ----------------------------------------------------------------
    // TEST 4: Circular Fallback Recycling in ExamCacheService
    // ----------------------------------------------------------------
    await runTest('Test 4: Circular fallback recycles oldest version when all versions attempted', async () => {
      const configIdentity = await ExamCacheService.resolveCurriculumIdentity(bookId);

      // Store two verified cached exams
      const exam1 = await ExamCacheService.storeExamInCache({
        examId: 'ai_cached_v1_' + Date.now(),
        identity: configIdentity,
        unitIds: [chapterId],
        examParams: { count: 5, difficulty: 'MEDIUM' },
        questions: qIds.slice(0, 5).map(id => ({
          id,
          chunk_id: 'chk_1',
          book_id: bookId,
          chapter_id: chapterId,
          question_text: `سؤال مخزن ${id}`,
          question_type: 'MULTIPLE_CHOICE',
          options: [
            { id: `opt_${id}_1`, text: 'أ', is_correct: true },
            { id: `opt_${id}_2`, text: 'ب', is_correct: false }
          ],
          difficulty: 'MEDIUM',
          bloom_level: 'UNDERSTANDING',
          page_reference: 22,
          explanation: 'شرح',
          correct_answer: `opt_${id}_1`
        })),
        assignedStudentId: studentUser.id,
        skipProvenanceCheck: true
      });

      // Mark this student as having attempted this cached exam
      await ExamCacheService.recordStudentAssignment(exam1.configKey, studentUser.id, exam1.examId);

      // Now query fallback: since all versions have been attempted by this student, circular recycling must return exam1
      const recycled = await ExamCacheService.getVerifiedFallbackExam({
        bookId: bookId,
        chapterIds: chapterId,
        examParams: { count: 5, difficulty: 'MEDIUM' },
        studentId: studentUser.id
      });

      assert.ok(recycled, 'Fallback must recycle rather than return null');
      assert.strictEqual(recycled.examId, exam1.examId);
    });

    // ----------------------------------------------------------------
    // TEST 5: Partial Exam Generation Acceptance (>= 3 questions)
    // ----------------------------------------------------------------
    await runTest('Test 5: Partial generation (3/5 verified) returns 200 with is_partial=true', async () => {
      // Mock aiRagEngine.generateQuestions to return only 3 verified questions
      const { aiRagEngine } = await import('../dist/services/ai/aiRagEngine.js');
      const origGenerate = aiRagEngine.generateQuestions;
      aiRagEngine.generateQuestions = async function() {
        return [
          {
            id: 'q_partial_1',
            chunk_id: 'chk_1',
            book_id: bookId,
            chapter_id: chapterId,
            question_text: 'سؤال جزئي 1',
            question_type: 'MULTIPLE_CHOICE',
            options: [{ id: 'opt_p1', text: 'أ', is_correct: true }, { id: 'opt_p2', text: 'ب', is_correct: false }],
            difficulty: 'MEDIUM',
            bloom_level: 'UNDERSTANDING',
            page_reference: 22,
            explanation: 'شرح',
            correct_answer: 'opt_p1'
          },
          {
            id: 'q_partial_2',
            chunk_id: 'chk_1',
            book_id: bookId,
            chapter_id: chapterId,
            question_text: 'سؤال جزئي 2',
            question_type: 'MULTIPLE_CHOICE',
            options: [{ id: 'opt_p3', text: 'أ', is_correct: true }, { id: 'opt_p4', text: 'ب', is_correct: false }],
            difficulty: 'MEDIUM',
            bloom_level: 'UNDERSTANDING',
            page_reference: 23,
            explanation: 'شرح',
            correct_answer: 'opt_p3'
          },
          {
            id: 'q_partial_3',
            chunk_id: 'chk_1',
            book_id: bookId,
            chapter_id: chapterId,
            question_text: 'سؤال جزئي 3',
            question_type: 'MULTIPLE_CHOICE',
            options: [{ id: 'opt_p5', text: 'أ', is_correct: true }, { id: 'opt_p6', text: 'ب', is_correct: false }],
            difficulty: 'MEDIUM',
            bloom_level: 'UNDERSTANDING',
            page_reference: 24,
            explanation: 'شرح',
            correct_answer: 'opt_p5'
          }
        ];
      };

      // Create a new chapter with NO reference exam, forcing Priority 3 AI generation
      const chNoRefId = 'ch_unit1_' + Date.now();
      await db.query(
        `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
         VALUES ($1, $2, 1, 'الوحدة الأولى: التفاعلات الكيميائية', 'Unit 1: Chemical Reactions', 1, 19, $3)`,
        [chNoRefId, bookId, genId]
      );
      await db.query(
        `INSERT INTO curriculum_unit_approvals (id, book_id, chapter_id, generation_id, approval_status, approved_by, approved_at)
         VALUES ($1, $2, $3, $4, 'APPROVED', $5, datetime('now'))`,
        ['cua_u1_' + Date.now(), bookId, chNoRefId, genId, adminId]
      );
      for (let c = 1; c <= 4; c++) {
        await db.query(
          `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, generation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            `chk_u1_${c}_${Date.now()}`,
            bookId,
            chNoRefId,
            stagePrepId,
            gradePrep3Id,
            sciSubjId,
            c,
            c,
            `محتوى تعليمي معتمد للوحدة الأولى في العلوم للصف الثالث الإعدادي حول التفاعلات الكيميائية والانحلال الحراري وتفاعلات الإحلال البسيط والمزدوج. المقطع رقم ${c}.`,
            genId
          ]
        );
      }

      try {
        const res = await fetch(`${baseUrl}/generate-quiz`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${studentToken}`
          },
          body: JSON.stringify({
            book_id: bookId,
            chapter_id: chNoRefId,
            subject_id: sciSubjId,
            count: 5 // requested 5, but generator only produces 3
          })
        });

        const body = await res.json();
        assert.strictEqual(res.status, 200, `Expected 200 OK for partial generation, got ${res.status}: ${JSON.stringify(body)}`);
        assert.strictEqual(body.is_partial, true, 'is_partial must be true');
        assert.strictEqual(body.questions.length, 3, 'Must deliver the 3 verified questions rather than failing closed');
        assert.ok(body.partial_notice, 'partial_notice must be present');
      } finally {
        aiRagEngine.generateQuestions = origGenerate;
      }
    });

    console.log(`\n================================================================`);
    console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED PERFECTLY!`);
    console.log(`================================================================\n`);
    process.exit(0);

  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
  }
}

main();
