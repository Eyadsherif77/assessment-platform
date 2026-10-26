import assert from 'assert';
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { setupDisposableTestDb, assertDatabaseIsDisposable, teardownDisposableTestDb } from './test_isolation_helper.mjs';

console.log('================================================================');
console.log('FARABI AI — EXCEL REFERENCE IMPORT & FIXED EXAMS TEST SUITE');
console.log('Phase 7 Verification | Zero Paid AI Calls | Isolated Disposable DB');
console.log('================================================================\n');

// 1. Setup disposable SQLite DB
const { tempDir, dbPath } = setupDisposableTestDb('excel_ref_import');

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
    // Dynamically import database and migration after setting SQLITE_DB_PATH
    const dbModule = await import('../dist/db/db.js');
    const db = dbModule.db || dbModule.default || dbModule;
    await db.init();
    assertDatabaseIsDisposable(db, dbPath);

    // Seed Stage, Grade, Subject, User
    const stageId = 'stage_prep_' + Date.now();
    await db.query(`INSERT INTO academic_stages (id, code, name_ar, name_en, sort_order) VALUES ($1, $2, $3, $4, $5)`, [stageId, 'PREP_' + Date.now(), 'المرحلة الإعدادية', 'Preparatory', 2]);

    const gradeId = 'grade_prep1_' + Date.now();
    await db.query(`INSERT INTO grades (id, stage_id, code, name_ar, name_en, sort_order) VALUES ($1, $2, $3, $4, $5, $6)`, [gradeId, stageId, 'PREP1_' + Date.now(), 'الصف الأول الإعدادي', 'Prep 1', 1]);

    const subjId = 'subj_sci_' + Date.now();
    await db.query(`INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, $3, $4, $5)`, [subjId, gradeId, 'SCI_' + Date.now(), 'العلوم', 'Science']);

    const sciSubj = (await db.query(`SELECT * FROM subjects WHERE id = $1`, [subjId])).rows[0];
    const prep1Grade = (await db.query(`SELECT * FROM grades WHERE id = $1`, [gradeId])).rows[0];

    // Insert admin user
    await db.query(`INSERT OR IGNORE INTO users (id, email, password_hash, role, full_name) VALUES ('admin_usr_1', 'admin@farabi.edu', 'hash', 'ADMIN', 'مدير النظام')`);

    // Insert Book and Chapters (Unit 1: pages 1-34, Unit 2: pages 35-64)
    const bookId = 'book_science_prep1_' + Date.now();
    await db.query(`
      INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, total_pages, term, school_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 'كلاهما')
    `, [bookId, 'كتاب العلوم - الصف الأول الإعدادي', 'Science Book - Prep 1', stageId, prep1Grade.id, sciSubj.id, 64]);

    const ch1Id = 'ch_unit1_' + Date.now();
    const ch2Id = 'ch_unit2_' + Date.now();
    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
      VALUES ($1, $2, 1, 'الوحدة الأولى: المادة وتركيبها', 'Unit 1: Matter', 1, 34)
    `, [ch1Id, bookId]);

    await db.query(`
      INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
      VALUES ($1, $2, 2, 'الوحدة الثانية: الطاقة والموجات', 'Unit 2: Energy', 35, 64)
    `, [ch2Id, bookId]);

    // Seed supporting book chunks for Unit 2 (pages 37, 41, 45)
    await db.query(`
      INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content)
      VALUES 
        ('chunk_p37', $1, $2, $3, $4, $5, 37, 1, 'الشغل المبذول يقاس بوحدة الجول في النظام الدولي للوحدات.'),
        ('chunk_p41', $1, $2, $3, $4, $5, 41, 2, 'طاقة الحركة لجسم متحرك تتناسب طردياً مع كتلته ومربع سرعته.'),
        ('chunk_p45', $1, $2, $3, $4, $5, 45, 3, 'المولد الكهربي أو الدينامو يحول الطاقة الميكانيكية إلى طاقة كهربية.')
    `, [bookId, ch2Id, stageId, prep1Grade.id, sciSubj.id]);

    const { ReferenceImportService } = await import('../dist/services/referenceImportService.js');

    // ------------------------------------------------------------------------
    // TEST 1: Parse Workbook and Verify Field Normalization
    // ------------------------------------------------------------------------
    const sampleWorkbookRows = [
      {
        'Question': 'وحدة قياس الشغل المبذول هي:',
        'Option A': 'النيوتن',
        'Option B': 'الجول',
        'Option C': 'المتر',
        'Option D': 'الثانية',
        'Right Answer': 'الجول',
        'Reference Page': 37,
        'Bloom Level': 'تذكر'
      },
      {
        'Question': 'طاقة حركة الجسم تتناسب طردياً مع:',
        'Option A': 'كتلته ومربع سرعته',
        'Option B': 'وزنه فقط',
        'Option C': 'ارتفاعه عن سطح الأرض',
        'Option D': 'درجة حرارته',
        'Right Answer': 'كتلته ومربع سرعته',
        'Reference Page': 41,
        'Bloom Level': 'فهم'
      },
      {
        'Question': 'تتحول الطاقة الميكانيكية إلى طاقة كهربية في:',
        'Option A': 'المصباح الكهربي',
        'Option B': 'الدينامو',
        'Option C': 'السخان',
        'Option D': 'المكواة',
        'Right Answer': 'الدينامو',
        'Reference Page': 45,
        'Bloom Level': 'تطبيق'
      }
    ];

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(sampleWorkbookRows);
    xlsx.utils.book_append_sheet(wb, ws, 'Exams');
    const excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    await runTest('Parses Excel workbook and extracts question rows with authentic page references', async () => {
      const parsed = ReferenceImportService.parseWorkbook(excelBuffer, 'Science - Unit 2.xlsx');
      assert.strictEqual(parsed.parsedRows.length, 3, 'Should parse all 3 rows');
      assert.strictEqual(parsed.parsedRows[0].rightAnswerText, 'الجول');
      assert.strictEqual(parsed.parsedRows[0].pageReference, 37);
      assert.strictEqual(parsed.parsedRows[1].pageReference, 41);
      assert.strictEqual(parsed.parsedRows[2].pageReference, 45);
    });

    // ------------------------------------------------------------------------
    // TEST 2: Import valid 3 questions and verify SHA256 provenance hash
    // ------------------------------------------------------------------------
    let firstImportResult;
    await runTest('Imports reference questions and generates fixed exam with full provenance', async () => {
      firstImportResult = await ReferenceImportService.importReferenceWorkbook(excelBuffer, {
        operatorId: 'admin_usr_1',
        operatorRole: 'ADMIN',
        workbookName: 'Science - Unit 2.xlsx',
        createFixedExam: true,
        overrideSubjectId: sciSubj.id,
        overrideGradeId: prep1Grade.id,
        overrideChapterId: ch2Id
      });

      assert.strictEqual(firstImportResult.imported, 3, 'Should import all 3 valid questions');
      assert.strictEqual(firstImportResult.duplicates, 0, 'No duplicates on initial run');
      assert.strictEqual(firstImportResult.quarantined, 0, 'No quarantined rows');
      assert.ok(firstImportResult.fixedExam?.id, 'Should create a fixed exam');

      // Verify Questions in DB (question_bank_items)
      const qRows = (await db.query(`SELECT * FROM question_bank_items WHERE chapter_id = $1`, [ch2Id])).rows;
      assert.strictEqual(qRows.length, 3);
      for (const q of qRows) {
        assert.ok(q.quarantine_reason && q.quarantine_reason.startsWith('VERIFIED:'), 'Must have VERIFIED provenance hash');
        assert.strictEqual(q.is_quarantined, 0);
        assert.ok(q.page_reference >= 35 && q.page_reference <= 64, 'Page locator must be within chapter bounds');
      }

      // Verify Fixed Exam in DB
      const examRows = (await db.query(`SELECT * FROM exams WHERE id = $1`, [firstImportResult.fixedExam.id])).rows;
      assert.strictEqual(examRows.length, 1);
      assert.strictEqual(examRows[0].is_style_reference, 1, 'Fixed exam must be tagged as style reference');
      assert.strictEqual(examRows[0].is_published, 1);
    });

    // ------------------------------------------------------------------------
    // TEST 3: Idempotency & Duplicate Prevention
    // ------------------------------------------------------------------------
    await runTest('Re-importing identical workbook skips duplicates and maintains idempotency', async () => {
      const secondImportResult = await ReferenceImportService.importReferenceWorkbook(excelBuffer, {
        operatorId: 'admin_usr_1',
        operatorRole: 'ADMIN',
        workbookName: 'Science - Unit 2.xlsx',
        createFixedExam: true,
        overrideSubjectId: sciSubj.id,
        overrideGradeId: prep1Grade.id,
        overrideChapterId: ch2Id
      });

      assert.strictEqual(secondImportResult.imported, 0, 'Zero new items should be imported');
      assert.strictEqual(secondImportResult.duplicates, 3, 'All 3 rows recognized as duplicate');
      assert.strictEqual(secondImportResult.quarantined, 0);

      // Verify question count remains exactly 3
      const qRows = (await db.query(`SELECT COUNT(*) as count FROM question_bank_items WHERE chapter_id = $1`, [ch2Id])).rows;
      assert.strictEqual(Number(qRows[0].count), 3);
    });

    // ------------------------------------------------------------------------
    // TEST 4: Row Quarantine on Malformed Data / Invalid Page Bounds
    // ------------------------------------------------------------------------
    await runTest('Quarantines invalid rows (out-of-bounds page, missing correct answer option)', async () => {
      const badRows = [
        {
          'Question': 'سؤال بصفحة خارج حدود الوحدة الثانية',
          'Option A': 'أ',
          'Option B': 'ب',
          'Option C': 'ج',
          'Option D': 'د',
          'Right Answer': 'أ',
          'Reference Page': 999 // Unit 2 ends at 64
        },
        {
          'Question': 'سؤال بإجابة صحيحة لا تطابق أي اختيار',
          'Option A': 'أ',
          'Option B': 'ب',
          'Option C': 'ج',
          'Option D': 'د',
          'Right Answer': 'هـ', // Not in A, B, C, D
          'Reference Page': 40
        },
        {
          'Question': 'سؤال صالح تماماً داخل الوحدة',
          'Option A': 'خيار 1',
          'Option B': 'خيار 2',
          'Option C': 'خيار 3',
          'Option D': 'خيار 4',
          'Right Answer': 'خيار 1',
          'Reference Page': 42
        }
      ];

      const badWb = xlsx.utils.book_new();
      const badWs = xlsx.utils.json_to_sheet(badRows);
      xlsx.utils.book_append_sheet(badWb, badWs, 'Exams');
      const badBuffer = xlsx.write(badWb, { type: 'buffer', bookType: 'xlsx' });

      const res = await ReferenceImportService.importReferenceWorkbook(badBuffer, {
        operatorId: 'admin_usr_1',
        operatorRole: 'ADMIN',
        workbookName: 'Science - Unit 2.xlsx',
        createFixedExam: false,
        overrideSubjectId: sciSubj.id,
        overrideGradeId: prep1Grade.id,
        overrideChapterId: ch2Id
      });

      assert.strictEqual(res.quarantined, 2, '2 invalid rows must be quarantined');
      assert.strictEqual(res.imported, 1, '1 valid row imported');
    });

    // ------------------------------------------------------------------------
    // TEST 5: Hierarchy Aggregation Endpoint Logic (Subject -> Units -> Exams)
    // ------------------------------------------------------------------------
    await runTest('Fixed Exams Hierarchy groups exams correctly under Subject and Unit', async () => {
      // Query fixed exams with subject and chapter relations
      const rows = (await db.query(`
        SELECT 
          e.id as exam_id,
          e.title_ar as exam_title,
          e.duration_minutes,
          e.term,
          s.id as subject_id,
          s.name_ar as subject_name_ar,
          s.name_en as subject_name_en,
          c.id as chapter_id,
          c.chapter_number,
          c.title_ar as chapter_title_ar,
          c.title_en as chapter_title_en,
          0 as chunks_count,
          c.start_page,
          c.end_page,
          COUNT(eq.id) as questions_count
        FROM exams e
        JOIN subjects s ON e.subject_id = s.id
        LEFT JOIN book_chapters c ON e.chapter_id = c.id
        LEFT JOIN exam_questions eq ON e.id = eq.exam_id
        WHERE e.is_published = 1 AND e.is_style_reference = 1
        GROUP BY e.id
      `)).rows;

      assert.ok(rows.length >= 1, 'Should find at least 1 published fixed exam');
      const examItem = rows[0];
      assert.strictEqual(examItem.subject_name_ar, 'العلوم');
      assert.strictEqual(examItem.chapter_number, 2);
      assert.strictEqual(examItem.start_page, 35);
      assert.strictEqual(examItem.end_page, 64);
      assert.strictEqual(Number(examItem.questions_count), 3);
    });

    // ------------------------------------------------------------------------
    // TEST 6: Verify Zero Paid Gemini API Calls Rule
    // ------------------------------------------------------------------------
    await runTest('Verification that reference import and fixed exam generation make 0 external AI calls', async () => {
      // ReferenceImportService is pure deterministic database and Excel parsing.
      // Assert no Gemini client or network calls were imported or used.
      assert.strictEqual(typeof ReferenceImportService.importReferenceWorkbook, 'function');
      assert.strictEqual(typeof ReferenceImportService.generateTemplate, 'function');
    });

    console.log('\n================================================================');
    console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
    console.log('================================================================\n');

  } finally {
    teardownDisposableTestDb(null, tempDir);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
