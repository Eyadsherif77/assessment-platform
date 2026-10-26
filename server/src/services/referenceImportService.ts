import { v4 as uuidv4 } from 'uuid';
import * as xlsx from 'xlsx';
import { db } from '../db/db.js';
import {
  computeQuestionVerificationHash,
  evaluateQuestionQuality,
  verifyQuestionProvenance,
  GroundedQuestion
} from './ai/aiRagEngine.js';
import { AnswerValidationService } from './answerValidationService.js';

// Support both ESM and CommonJS xlsx import
const XLSX = (xlsx as any).default || xlsx;

export interface RawExcelRow {
  Subject?: string;
  المادة?: string;
  Unit?: string;
  الوحدة?: string;
  Question?: string;
  السؤال?: string;
  'Answer A'?: string;
  'الخيار أ'?: string;
  'الخيار (أ)'?: string;
  'Answer B'?: string;
  'الخيار ب'?: string;
  'الخيار (ب)'?: string;
  'Answer C'?: string;
  'الخيار ج'?: string;
  'الخيار (ج)'?: string;
  'Answer D'?: string;
  'الخيار د'?: string;
  'الخيار (د)'?: string;
  'Right Answer'?: string;
  'الإجابة الصحيحة'?: string;
  'Reference Page'?: number | string;
  'صفحة المرجع'?: number | string;
  'رقم الصفحة'?: number | string;
  Explanation?: string;
  التوضيح?: string;
  [key: string]: any;
}

export interface ParsedQuestionRow {
  rowNumber: number;
  subjectName: string;
  unitName: string;
  questionText: string;
  options: Array<{ id: string; text: string; is_correct: boolean }>;
  rightAnswerText: string;
  pageReference: number;
  explanation?: string;
  isValid: boolean;
  validationError?: string;
}

export interface ImportOptions {
  operatorId: string;
  operatorRole: string;
  workbookName: string;
  overrideStageId?: string;
  overrideGradeId?: string;
  overrideSubjectId?: string;
  overrideChapterId?: string;
  overrideTerm?: number;
  overrideSchoolType?: 'كلاهما' | 'عربي' | 'لغات';
  createFixedExam?: boolean;
  durationMinutes?: number;
  examTitle?: string;
  isStyleReference?: boolean;
  isPublished?: boolean;
}

export interface PreviewSummary {
  success: boolean;
  workbookName: string;
  sheetName: string;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicatesCount: number;
  durationMinutes: number;
  resolvedCurriculum: {
    stageId?: string;
    gradeId?: string;
    gradeNameAr?: string;
    subjectId?: string;
    subjectNameAr?: string;
    bookId?: string;
    bookTitleAr?: string;
    chapterId?: string;
    chapterTitleAr?: string;
    chapterNumber?: number;
  };
  questions: Array<{
    question_text: string;
    page_reference: string;
    explanation?: string;
    points: number;
    options: Array<{ option_text: string; is_correct: boolean }>;
  }>;
  invalidRows: Array<{
    rowNumber: number;
    questionText: string;
    reason: string;
  }>;
}

export interface ImportSummary {
  success: boolean;
  workbookName: string;
  sheetName: string;
  totalRows: number;
  imported: number;
  skipped: number;
  duplicates: number;
  quarantined: number;
  errors: string[];
  resolvedCurriculum: {
    stageId?: string;
    gradeId?: string;
    gradeNameAr?: string;
    subjectId?: string;
    subjectNameAr?: string;
    bookId?: string;
    bookTitleAr?: string;
    chapterId?: string;
    chapterTitleAr?: string;
    chapterNumber?: number;
  };
  fixedExam?: {
    id: string;
    title: string;
    questionsCount: number;
  };
}

export class ReferenceImportService {
  /**
   * Generate an official sample Excel reference workbook template.
   */
  public static generateTemplate(): Buffer {
    const sampleData = [
      {
        Subject: 'Science',
        Unit: 'Unit 2',
        Question: 'The product of the electric current intensity through a conductor and its flow time gives a physical quantity measured in ………',
        'Option A': 'ampere',
        'Option B': 'coulomb',
        'Option C': 'second',
        'Option D': 'meter',
        'Right Answer': 'coulomb',
        'Reference Page': 37,
        Explanation: 'Quantity of charge Q = I * t, measured in Coulombs.'
      },
      {
        Subject: 'Science',
        Unit: 'Unit 2',
        Question: 'The ammeter is connected in the electric circuit ………',
        'Option A': 'in parallel',
        'Option B': 'in series',
        'Option C': 'in series and parallel together',
        'Option D': 'to one terminal of the battery',
        'Right Answer': 'in series',
        'Reference Page': 37,
        Explanation: 'The ammeter must be connected in series to measure full electric current intensity.'
      }
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleData);
    XLSX.utils.book_append_sheet(wb, ws, 'Exams');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Parse an Excel workbook buffer and extract normalized question rows.
   */
  public static parseWorkbook(buffer: Buffer, originalname: string): {
    sheetName: string;
    parsedRows: ParsedQuestionRow[];
    errors: string[];
  } {
    const errors: string[] = [];
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('ملف Excel فارغ أو لا يحتوي على أوراق عمل صالحة');
    }

    // Select sheet: prioritize 'Exams', 'Questions', 'References', or the first sheet
    let targetSheetName = workbook.SheetNames[0];
    const candidateSheet = workbook.SheetNames.find((s: string) => 
      ['exams', 'questions', 'references', 'أسئلة', 'مراجع', 'اختبارات'].some(keyword => 
        s.trim().toLowerCase().includes(keyword)
      )
    );
    if (candidateSheet) {
      targetSheetName = candidateSheet;
    }

    const worksheet = workbook.Sheets[targetSheetName];
    if (!worksheet) {
      throw new Error(`ورقة العمل "${targetSheetName}" غير موجودة في الملف`);
    }

    const rawRows: RawExcelRow[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (rawRows.length === 0) {
      throw new Error(`ورقة العمل "${targetSheetName}" لا تحتوي على أي بيانات`);
    }

    const parsedRows: ParsedQuestionRow[] = [];

    rawRows.forEach((row, index) => {
      const rowNum = index + 2; // 1-indexed, accounting for header row

      const subjectName = String(row.Subject || row['المادة'] || '').trim();
      const unitName = String(row.Unit || row['الوحدة'] || '').trim();
      const questionText = String(row.Question || row['السؤال'] || '').trim();

      const optA = String(row['Option A'] || row['Answer A'] || row['الخيار أ'] || row['الخيار (أ)'] || row['A'] || row['أ'] || '').trim();
      const optB = String(row['Option B'] || row['Answer B'] || row['الخيار ب'] || row['الخيار (ب)'] || row['B'] || row['ب'] || '').trim();
      const optC = String(row['Option C'] || row['Answer C'] || row['الخيار ج'] || row['الخيار (ج)'] || row['C'] || row['ج'] || '').trim();
      const optD = String(row['Option D'] || row['Answer D'] || row['الخيار د'] || row['الخيار (د)'] || row['D'] || row['د'] || '').trim();

      const rawRightAnswer = String(row['Right Answer'] || row['الإجابة الصحيحة'] || row['الصحيحة'] || '').trim();
      const rawPage = row['Reference Page'] ?? row['صفحة المرجع'] ?? row['رقم الصفحة'] ?? row['الصفحة'];
      const pageNum = parseInt(String(rawPage).replace(/[^0-9]/g, ''), 10) || 1;
      const explanation = String(row.Explanation || row['التوضيح'] || row['الشرح'] || '').trim();

      // Row validation
      if (!questionText) {
        errors.push(`السطر ${rowNum}: نص السؤال فارغ`);
        return;
      }

      const rawOptions = [optA, optB, optC, optD].filter(Boolean);
      if (rawOptions.length < 2) {
        errors.push(`السطر ${rowNum}: يجب توفير خيارين على الأقل للسؤال`);
        return;
      }

      // Determine correct answer
      let matchedIndex = -1;
      const normRight = rawRightAnswer.toLowerCase();

      // Check letter indicators: A/B/C/D or أ/ب/ج/د
      if (['a', 'أ', 'الخيار a', 'الخيار أ'].includes(normRight)) matchedIndex = 0;
      else if (['b', 'ب', 'الخيار b', 'الخيار ب'].includes(normRight)) matchedIndex = 1;
      else if (['c', 'ج', 'الخيار c', 'الخيار ج'].includes(normRight)) matchedIndex = 2;
      else if (['d', 'د', 'الخيار d', 'الخيار د'].includes(normRight)) matchedIndex = 3;
      else {
        // Match by option text
        matchedIndex = rawOptions.findIndex(o => 
          o.toLowerCase().trim() === normRight ||
          o.trim() === rawRightAnswer ||
          normRight.includes(o.toLowerCase().trim())
        );
      }

      if (matchedIndex === -1) {
        errors.push(`السطر ${rowNum}: الإجابة الصحيحة "${rawRightAnswer}" لم تطابق أي من الخيارات المتاحة`);
      }

      const options = rawOptions.map((text, idx) => ({
        id: uuidv4(),
        text,
        is_correct: idx === matchedIndex
      }));

      parsedRows.push({
        rowNumber: rowNum,
        subjectName,
        unitName,
        questionText,
        options,
        rightAnswerText: matchedIndex >= 0 ? rawOptions[matchedIndex] : rawRightAnswer,
        pageReference: pageNum,
        explanation: explanation || undefined,
        isValid: matchedIndex >= 0
      });
    });

    return {
      sheetName: targetSheetName,
      parsedRows,
      errors
    };
  }

  /**
   * Import parsed Excel questions into authoritative Question Bank and create Fixed Exam.
   */
  public static async importReferenceWorkbook(
    buffer: Buffer,
    options: ImportOptions
  ): Promise<ImportSummary> {
    // 1. Authorization check
    const allowedRoles = ['ADMIN', 'SUPERVISOR', 'CENTRAL_ADMIN', 'TEACHER'];
    if (!allowedRoles.includes(options.operatorRole)) {
      throw new Error('غير مصرح لك باستيراد المراجع المنهجية');
    }

    // 2. Parse workbook
    const { sheetName, parsedRows, errors } = this.parseWorkbook(buffer, options.workbookName);

    if (parsedRows.length === 0) {
      throw new Error('لم يتم العثور على أي أسئلة صالحة في ملف Excel');
    }

    // 3. Resolve Curriculum Hierarchy (Subject, Grade, Stage, Book, Chapter)
    const representativeRow = parsedRows[0];
    const targetSubjectName = representativeRow.subjectName;
    const targetUnitName = representativeRow.unitName;

    // Detect Subject
    let subjectId = options.overrideSubjectId;
    if (!subjectId) {
      const subjectQuery = `
        SELECT s.id, s.name_ar, s.name_en, s.code, s.grade_id, g.stage_id as academic_stage_id, g.name_ar as grade_name_ar
        FROM subjects s
        JOIN grades g ON s.grade_id = g.id
        WHERE LOWER(s.name_en) = LOWER($1)
           OR s.name_ar LIKE $2
           OR LOWER(s.code) = LOWER($1)
        LIMIT 1
      `;
      const subjRes = await db.query(subjectQuery, [
        targetSubjectName || 'Science',
        `%${targetSubjectName || 'علوم'}%`
      ]);

      if (subjRes.rows.length > 0) {
        subjectId = subjRes.rows[0].id;
      } else {
        // Fallback: search for Science in Prep 3
        const fallbackSubj = await db.query(
          `SELECT id, name_ar, name_en, grade_id FROM subjects WHERE code = 'SCIENCE' LIMIT 1`
        );
        if (fallbackSubj.rows.length > 0) {
          subjectId = fallbackSubj.rows[0].id;
        } else {
          throw new Error(`تعذر العثور على مادة دراسية مطابقة للاسم: "${targetSubjectName}"`);
        }
      }
    }

    // Teacher subject authorization check
    if (options.operatorRole === 'TEACHER') {
      const teacherRes = await db.query(
        `SELECT u.id, u.subject_id, tp.subject_id as profile_subject_id, tp.specialization
         FROM users u
         LEFT JOIN teacher_profiles tp ON u.id = tp.user_id
         WHERE u.id = $1`,
        [options.operatorId]
      );
      if (teacherRes.rows.length > 0) {
        const t = teacherRes.rows[0];
        const teacherSubj = t.subject_id || t.profile_subject_id;
        if (teacherSubj && subjectId && teacherSubj !== subjectId) {
          throw new Error('غير مصرح للمعلم باستيراد أسئلة لمادة مختلفة عن تخصصه المعتمد');
        }
      }
    }

    // Retrieve full subject details
    const subjectInfoRes = await db.query(
      `SELECT s.id, s.name_ar, s.name_en, s.code, s.grade_id, g.stage_id as academic_stage_id, g.name_ar as grade_name_ar
       FROM subjects s
       JOIN grades g ON s.grade_id = g.id
       WHERE s.id = $1`,
      [subjectId]
    );

    if (subjectInfoRes.rows.length === 0) {
      throw new Error('المادة الدراسية المحددة غير موجودة في قاعدة البيانات');
    }

    const subjectInfo = subjectInfoRes.rows[0];
    const gradeId = options.overrideGradeId || subjectInfo.grade_id;
    const stageId = options.overrideStageId || subjectInfo.academic_stage_id;
    const term = options.overrideTerm || 1;
    const schoolType = options.overrideSchoolType || 'كلاهما';

    // Find active textbook for this subject and grade
    const bookRes = await db.query(
      `SELECT id, title_ar, total_pages, school_type
       FROM books
       WHERE subject_id = $1 AND grade_id = $2 AND term = $3
       ORDER BY created_at DESC LIMIT 1`,
      [subjectId, gradeId, term]
    );

    if (bookRes.rows.length === 0) {
      throw new Error(`لا يوجد كتاب مدرسي مسجل لمادة ${subjectInfo.name_ar} للصف ${subjectInfo.grade_name_ar} (الترم ${term})`);
    }

    const book = bookRes.rows[0];

    // Detect Chapter / Unit
    let chapterId = options.overrideChapterId;
    let resolvedChapter: any = null;

    if (!chapterId) {
      // Extract unit number from targetUnitName (e.g., "Unit 2" -> 2, "الوحدة الثانية" -> 2)
      let detectedUnitNum = 2; // Default for Unit 2
      const match = targetUnitName.match(/\d+/);
      if (match) {
        detectedUnitNum = parseInt(match[0], 10);
      } else if (targetUnitName.includes('ثاني') || targetUnitName.includes('الثانية') || targetUnitName.toLowerCase().includes('two')) {
        detectedUnitNum = 2;
      } else if (targetUnitName.includes('أول') || targetUnitName.includes('الأولى') || targetUnitName.toLowerCase().includes('one')) {
        detectedUnitNum = 1;
      } else if (targetUnitName.includes('ثالث') || targetUnitName.includes('الثالثة') || targetUnitName.toLowerCase().includes('three')) {
        detectedUnitNum = 3;
      } else if (targetUnitName.includes('رابع') || targetUnitName.includes('الرابعة') || targetUnitName.toLowerCase().includes('four')) {
        detectedUnitNum = 4;
      }

      const chapterRes = await db.query(
        `SELECT id, chapter_number, title_ar, title_en, start_page, end_page
         FROM book_chapters
         WHERE book_id = $1 AND chapter_number = $2
         LIMIT 1`,
        [book.id, detectedUnitNum]
      );

      if (chapterRes.rows.length > 0) {
        resolvedChapter = chapterRes.rows[0];
        chapterId = resolvedChapter.id;
      } else {
        // Fallback: get first chapter of book
        const firstChRes = await db.query(
          `SELECT id, chapter_number, title_ar, title_en, start_page, end_page
           FROM book_chapters
           WHERE book_id = $1
           ORDER BY chapter_number ASC LIMIT 1`,
          [book.id]
        );
        if (firstChRes.rows.length > 0) {
          resolvedChapter = firstChRes.rows[0];
          chapterId = resolvedChapter.id;
        } else {
          throw new Error(`الكتاب المدرسي "${book.title_ar}" لا يحتوي على وحدات دراسية مفهرسة`);
        }
      }
    } else {
      const chRes = await db.query(
        `SELECT id, chapter_number, title_ar, title_en, start_page, end_page FROM book_chapters WHERE id = $1`,
        [chapterId]
      );
      if (chRes.rows.length > 0) {
        resolvedChapter = chRes.rows[0];
      }
    }

    // 4. Ensure Question Bank exists
    let bankRes = await db.query(
      `SELECT id FROM question_banks WHERE subject_id = $1 AND grade_id = $2 LIMIT 1`,
      [subjectId, gradeId]
    );

    let bankId: string;
    if (bankRes.rows.length === 0) {
      bankId = uuidv4();
      let creatorId: string | null = options.operatorId;
      const userCheck = await db.query(`SELECT id FROM users WHERE id = $1`, [creatorId]);
      if (userCheck.rows.length === 0) {
        const adminUser = await db.query(`SELECT id FROM users WHERE role IN ('ADMIN', 'SUPERVISOR') LIMIT 1`);
        creatorId = adminUser.rows[0]?.id || null;
      }

      await db.query(
        `INSERT INTO question_banks (id, subject_id, academic_stage_id, grade_id, title, description, created_by)
         VALUES ($1, $2, $3, $4, 'بنك الأسئلة الذكي المعتمد', 'بنك الأسئلة المعتمد من المناهج المدرسية الرسمية', $5)`,
        [bankId, subjectId, stageId, gradeId, creatorId]
      );
    } else {
      bankId = bankRes.rows[0].id;
    }

    // 5. Ingest and Validate Each Question
    let imported = 0;
    let skipped = 0;
    let duplicates = 0;
    let quarantined = 0;

    const validatedExamQuestions: any[] = [];

    for (const q of parsedRows) {
      // Check duplicate
      const dupCheck = await db.query(
        `SELECT id FROM question_bank_items WHERE chapter_id = $1 AND question_text = $2`,
        [chapterId, q.questionText]
      );

      if (dupCheck.rows.length > 0) {
        duplicates++;
        // Fetch existing question for the fixed exam
        const existingId = dupCheck.rows[0].id;
        validatedExamQuestions.push({
          id: existingId,
          question_text: q.questionText,
          page_reference: q.pageReference,
          options: q.options,
          explanation: q.explanation
        });
        continue;
      }

      // Find matching source chunk in textbook
      let sourceChunkId: string | null = null;
      if (q.pageReference) {
        const chunkRes = await db.query(
          `SELECT id, content FROM book_chunks 
           WHERE book_id = $1 AND page_number = $2 
           ORDER BY chunk_index ASC LIMIT 1`,
          [book.id, q.pageReference]
        );
        if (chunkRes.rows.length > 0) {
          sourceChunkId = chunkRes.rows[0].id;
        } else {
          // If no chunk on exact page, check chapter chunk
          const chChunkRes = await db.query(
            `SELECT id FROM book_chunks WHERE chapter_id = $1 LIMIT 1`,
            [chapterId]
          );
          if (chChunkRes.rows.length > 0) {
            sourceChunkId = chChunkRes.rows[0].id;
          }
        }
      }

      // Verify question quality & answer key
      const groundedCandidate: GroundedQuestion = {
        id: uuidv4(),
        chunk_id: sourceChunkId || '',
        book_id: book.id,
        chapter_id: chapterId || '',
        question_text: q.questionText,
        options: q.options,
        difficulty: 'MEDIUM',
        bloom_level: 'UNDERSTANDING',
        page_reference: q.pageReference,
        source_excerpt: '',
        explanation: q.explanation || ''
      };

      const qualityResult = evaluateQuestionQuality(groundedCandidate);
      const answerVal = AnswerValidationService.validateQuestion(groundedCandidate);
      const hasSupportingChunk = Boolean(sourceChunkId);

      // Verify provenance: page reference must be within chapter start/end page
      const isPageWithinUnit = resolvedChapter
        ? (q.pageReference >= resolvedChapter.start_page && q.pageReference <= resolvedChapter.end_page)
        : (q.pageReference >= 1 && q.pageReference <= (book.total_pages || 200));

      const isQualityAcceptable = qualityResult.isValid || (qualityResult.metadataPresence === 0 && qualityResult.educationalValue >= 80);
      const isVerified = isQualityAcceptable && 
                         answerVal.answerKeyStatus !== 'REJECTED' && 
                         hasSupportingChunk && 
                         isPageWithinUnit;

      const verificationHash = computeQuestionVerificationHash(groundedCandidate);

      const isQuarantined = isVerified ? 0 : 1;
      const quarantineReason = isVerified 
        ? `VERIFIED:${verificationHash}` 
        : `QUARANTINED:${!hasSupportingChunk ? 'NO_SOURCE_CHUNK' : !isPageWithinUnit ? 'PAGE_OUT_OF_UNIT_BOUNDS' : answerVal.answerKeyStatus === 'REJECTED' ? 'INVALID_ANSWER_KEY' : qualityResult.reason || 'QUALITY_CHECK_FAILED'}`;

      // Insert question item
      const questionItemId = groundedCandidate.id;
      await db.query(
        `INSERT INTO question_bank_items (
           id, bank_id, chapter_id, question_text, question_type, difficulty,
           bloom_level, explanation, source_chunk_id, page_reference,
           is_quarantined, quarantine_reason
         ) VALUES ($1, $2, $3, $4, 'MULTIPLE_CHOICE', 'MEDIUM', 'UNDERSTANDING', $5, $6, $7, $8, $9)`,
        [
          questionItemId,
          bankId,
          chapterId,
          q.questionText,
          q.explanation || null,
          sourceChunkId,
          q.pageReference,
          isQuarantined,
          quarantineReason
        ]
      );

      // Insert options
      for (const opt of q.options) {
        await db.query(
          `INSERT INTO question_bank_options (id, question_item_id, option_text, is_correct)
           VALUES ($1, $2, $3, $4)`,
          [opt.id, questionItemId, opt.text, opt.is_correct ? 1 : 0]
        );
      }

      if (isQuarantined) {
        quarantined++;
      } else {
        imported++;
        validatedExamQuestions.push({
          id: questionItemId,
          question_text: q.questionText,
          page_reference: q.pageReference,
          options: q.options,
          explanation: q.explanation
        });
      }
    }

    // 6. Automatically Create/Update a Fixed Exam (if requested or by default)
    let fixedExamResult: { id: string; title: string; questionsCount: number } | undefined;

    if (options.createFixedExam !== false && validatedExamQuestions.length > 0) {
      const fixedExamId = uuidv4();
      const unitNumStr = resolvedChapter?.chapter_number ? `الوحدة ${resolvedChapter.chapter_number}` : 'الوحدة المنهجية';
      const defaultTitleAr = `امتحان ${subjectInfo.name_ar} - ${unitNumStr}: ${resolvedChapter?.title_ar || targetUnitName} (نموذج معتمد)`;
      const defaultTitleEn = `${subjectInfo.name_en || 'Subject'} - Unit ${resolvedChapter?.chapter_number || 1} Fixed Exam`;

      const examTitleAr = options.examTitle?.trim() || defaultTitleAr;
      const examTitleEn = options.examTitle?.trim() || defaultTitleEn;
      const durationMin = options.durationMinutes && options.durationMinutes >= 5 ? options.durationMinutes : 30;
      const isPub = options.isPublished !== undefined ? (options.isPublished ? 1 : 0) : (options.operatorRole === 'TEACHER' ? 0 : 1);
      const isStyleRef = options.isStyleReference !== undefined ? (options.isStyleReference ? 1 : 0) : 1;

      // Check if exam for this chapter/teacher already exists
      let existingExamRes;
      if (options.operatorRole === 'TEACHER') {
        existingExamRes = await db.query(
          `SELECT id, title_ar FROM exams WHERE teacher_id = $1 AND (chapter_id = $2 OR title_ar = $3) LIMIT 1`,
          [options.operatorId, chapterId, examTitleAr]
        );
      } else {
        existingExamRes = await db.query(
          `SELECT id, title_ar FROM exams WHERE chapter_id = $1 AND is_style_reference = 1 LIMIT 1`,
          [chapterId]
        );
      }

      let targetExamId: string;
      if (existingExamRes.rows.length > 0) {
        targetExamId = existingExamRes.rows[0].id;
        // Update exam settings and duration
        await db.query(
          `UPDATE exams SET duration_minutes = $2, is_style_reference = $3, is_published = $4 WHERE id = $1`,
          [targetExamId, durationMin, isStyleRef, isPub]
        );
        // Clean old questions to refresh with updated verified questions
        await db.query(`DELETE FROM exam_questions WHERE exam_id = $1`, [targetExamId]);
      } else {
        targetExamId = fixedExamId;
        let teacherId = options.operatorId;
        const teacherCheck = await db.query(`SELECT id FROM users WHERE id = $1`, [teacherId]);
        if (teacherCheck.rows.length === 0) {
          const validUser = await db.query(`SELECT id FROM users WHERE role IN ('ADMIN', 'SUPERVISOR', 'TEACHER') LIMIT 1`);
          teacherId = validUser.rows[0]?.id || options.operatorId;
        }

        await db.query(
          `INSERT INTO exams (
             id, title_ar, title_en, teacher_id, academic_stage_id, grade_id,
             subject_id, book_id, chapter_id, duration_minutes, is_published,
             is_style_reference, school_type, term
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            targetExamId,
            examTitleAr,
            examTitleEn,
            teacherId,
            stageId,
            gradeId,
            subjectId,
            book.id,
            chapterId,
            durationMin,
            isPub,
            isStyleRef,
            schoolType,
            term
          ]
        );
      }

      // Insert questions into exam_questions
      for (let i = 0; i < validatedExamQuestions.length; i++) {
        const eq = validatedExamQuestions[i];
        const examQId = uuidv4();

        await db.query(
          `INSERT INTO exam_questions (
             id, exam_id, question_item_id, question_text, question_type,
             points, page_reference, explanation, order_index
           ) VALUES ($1, $2, $3, $4, 'MULTIPLE_CHOICE', 1, $5, $6, $7)`,
          [
            examQId,
            targetExamId,
            eq.id,
            eq.question_text,
            String(eq.page_reference || 1),
            eq.explanation || null,
            i + 1
          ]
        );

        for (const opt of eq.options) {
          await db.query(
            `INSERT INTO exam_question_options (id, question_id, option_text, is_correct)
             VALUES ($1, $2, $3, $4)`,
            [uuidv4(), examQId, opt.text, opt.is_correct ? 1 : 0]
          );
        }
      }

      fixedExamResult = {
        id: targetExamId,
        title: examTitleAr,
        questionsCount: validatedExamQuestions.length
      };
    }

    return {
      success: true,
      workbookName: options.workbookName,
      sheetName,
      totalRows: parsedRows.length,
      imported,
      skipped,
      duplicates,
      quarantined,
      errors,
      resolvedCurriculum: {
        stageId,
        gradeId,
        gradeNameAr: subjectInfo.grade_name_ar,
        subjectId,
        subjectNameAr: subjectInfo.name_ar,
        bookId: book.id,
        bookTitleAr: book.title_ar,
        chapterId,
        chapterTitleAr: resolvedChapter?.title_ar,
        chapterNumber: resolvedChapter?.chapter_number
      },
      fixedExam: fixedExamResult
    };
  }

  /**
   * Preview and validate an Excel workbook without committing changes.
   * Gives teachers and supervisors instant feedback, row validity, duplicate counts, and parsed questions.
   */
  public static async previewReferenceWorkbook(
    buffer: Buffer,
    options: ImportOptions
  ): Promise<PreviewSummary> {
    const allowedRoles = ['ADMIN', 'SUPERVISOR', 'CENTRAL_ADMIN', 'TEACHER'];
    if (!allowedRoles.includes(options.operatorRole)) {
      throw new Error('غير مصرح لك بمعاينة أو استيراد ملفات الأسئلة');
    }

    const { sheetName, parsedRows } = this.parseWorkbook(buffer, options.workbookName);

    if (parsedRows.length === 0) {
      throw new Error('لم يتم العثور على أي أسئلة صالحة في ملف Excel');
    }

    const representativeRow = parsedRows[0];
    const targetSubjectName = representativeRow.subjectName;
    const targetUnitName = representativeRow.unitName;

    let subjectId = options.overrideSubjectId;
    if (!subjectId) {
      const subjectQuery = `
        SELECT s.id, s.name_ar, s.name_en, s.code, s.grade_id, g.stage_id as academic_stage_id, g.name_ar as grade_name_ar
        FROM subjects s
        JOIN grades g ON s.grade_id = g.id
        WHERE LOWER(s.name_en) = LOWER($1)
           OR s.name_ar LIKE $2
           OR LOWER(s.code) = LOWER($1)
        LIMIT 1
      `;
      const subjRes = await db.query(subjectQuery, [
        targetSubjectName || 'Science',
        `%${targetSubjectName || 'علوم'}%`
      ]);

      if (subjRes.rows.length > 0) {
        subjectId = subjRes.rows[0].id;
      } else {
        const fallbackSubj = await db.query(
          `SELECT id, name_ar, name_en, grade_id FROM subjects WHERE code = 'SCIENCE' LIMIT 1`
        );
        if (fallbackSubj.rows.length > 0) {
          subjectId = fallbackSubj.rows[0].id;
        } else {
          throw new Error(`تعذر العثور على مادة دراسية مطابقة للاسم: "${targetSubjectName}"`);
        }
      }
    }

    if (options.operatorRole === 'TEACHER') {
      const teacherRes = await db.query(
        `SELECT u.id, u.subject_id, tp.subject_id as profile_subject_id, tp.specialization
         FROM users u
         LEFT JOIN teacher_profiles tp ON u.id = tp.user_id
         WHERE u.id = $1`,
        [options.operatorId]
      );
      if (teacherRes.rows.length > 0) {
        const t = teacherRes.rows[0];
        const teacherSubj = t.subject_id || t.profile_subject_id;
        if (teacherSubj && subjectId && teacherSubj !== subjectId) {
          throw new Error('غير مصرح للمعلم باستيراد أسئلة لمادة مختلفة عن تخصصه المعتمد');
        }
      }
    }

    const subjectInfoRes = await db.query(
      `SELECT s.id, s.name_ar, s.name_en, s.code, s.grade_id, g.stage_id as academic_stage_id, g.name_ar as grade_name_ar
       FROM subjects s
       JOIN grades g ON s.grade_id = g.id
       WHERE s.id = $1`,
      [subjectId]
    );

    const subjectInfo = subjectInfoRes.rows[0] || { grade_name_ar: 'Prep 3' };
    const gradeId = options.overrideGradeId || subjectInfo.grade_id;
    const stageId = options.overrideStageId || subjectInfo.academic_stage_id;
    const term = options.overrideTerm || 1;

    const bookRes = await db.query(
      `SELECT id, title_ar, total_pages, school_type
       FROM books
       WHERE subject_id = $1 AND grade_id = $2 AND term = $3
       ORDER BY created_at DESC LIMIT 1`,
      [subjectId, gradeId, term]
    );
    const book = bookRes.rows[0];

    let chapterId = options.overrideChapterId;
    let resolvedChapter: any = null;

    if (book) {
      if (!chapterId) {
        let detectedUnitNum = 2;
        const match = targetUnitName.match(/\d+/);
        if (match) detectedUnitNum = parseInt(match[0], 10);
        else if (targetUnitName.includes('ثاني') || targetUnitName.includes('الثانية')) detectedUnitNum = 2;
        else if (targetUnitName.includes('أول') || targetUnitName.includes('الأولى')) detectedUnitNum = 1;
        else if (targetUnitName.includes('ثالث') || targetUnitName.includes('الثالثة')) detectedUnitNum = 3;
        else if (targetUnitName.includes('رابع') || targetUnitName.includes('الرابعة')) detectedUnitNum = 4;

        const chapterRes = await db.query(
          `SELECT id, chapter_number, title_ar, title_en, start_page, end_page
           FROM book_chapters
           WHERE book_id = $1 AND chapter_number = $2 LIMIT 1`,
          [book.id, detectedUnitNum]
        );
        if (chapterRes.rows.length > 0) {
          resolvedChapter = chapterRes.rows[0];
          chapterId = resolvedChapter.id;
        }
      } else {
        const chRes = await db.query(
          `SELECT id, chapter_number, title_ar, title_en, start_page, end_page FROM book_chapters WHERE id = $1`,
          [chapterId]
        );
        if (chRes.rows.length > 0) resolvedChapter = chRes.rows[0];
      }
    }

    const questions: Array<{
      question_text: string;
      page_reference: string;
      explanation?: string;
      points: number;
      options: Array<{ option_text: string; is_correct: boolean }>;
    }> = [];
    const invalidRows: Array<{ rowNumber: number; questionText: string; reason: string }> = [];
    let duplicatesCount = 0;

    for (const q of parsedRows) {
      if (!q.isValid) {
        invalidRows.push({
          rowNumber: q.rowNumber,
          questionText: q.questionText,
          reason: q.validationError || 'السؤال يفتقد إلى الإجابة الصحيحة أو الخيارات الكافية'
        });
        continue;
      }

      // Check duplicate hash
      const candidate: GroundedQuestion = {
        id: uuidv4(),
        chunk_id: 'preview_chunk',
        book_id: 'preview_book',
        chapter_id: 'preview_chapter',
        question_text: q.questionText,
        options: q.options.map(o => ({ id: o.id, text: o.text, is_correct: o.is_correct })),
        difficulty: 'MEDIUM',
        bloom_level: 'UNDERSTANDING',
        page_reference: q.pageReference,
        source_excerpt: '',
        explanation: q.explanation || ''
      };

      const verificationHash = computeQuestionVerificationHash(candidate);

      const dupRes = await db.query(
        `SELECT id FROM question_bank_items WHERE quarantine_reason = $1 LIMIT 1`,
        [`VERIFIED:${verificationHash}`]
      );

      if (dupRes.rows.length > 0) {
        duplicatesCount++;
      }

      questions.push({
        question_text: q.questionText,
        page_reference: String(q.pageReference || 1),
        explanation: q.explanation || '',
        points: 1,
        options: q.options.map(opt => ({
          option_text: opt.text,
          is_correct: opt.is_correct
        }))
      });
    }

    return {
      success: true,
      workbookName: options.workbookName,
      sheetName,
      totalRows: parsedRows.length,
      validCount: questions.length,
      invalidCount: invalidRows.length,
      duplicatesCount,
      durationMinutes: options.durationMinutes && options.durationMinutes >= 5 ? options.durationMinutes : 30,
      resolvedCurriculum: {
        stageId,
        gradeId,
        gradeNameAr: subjectInfo.grade_name_ar,
        subjectId,
        subjectNameAr: subjectInfo.name_ar,
        bookId: book?.id,
        bookTitleAr: book?.title_ar,
        chapterId: resolvedChapter?.id,
        chapterTitleAr: resolvedChapter?.title_ar,
        chapterNumber: resolvedChapter?.chapter_number
      },
      questions,
      invalidRows
    };
  }
}

