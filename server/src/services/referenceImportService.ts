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
  'Option A'?: string;
  'Answer A'?: string;
  'الخيار أ'?: string;
  'الخيار (أ)'?: string;
  'A'?: string;
  'أ'?: string;
  'Option B'?: string;
  'Answer B'?: string;
  'الخيار ب'?: string;
  'الخيار (ب)'?: string;
  'B'?: string;
  'ب'?: string;
  'Option C'?: string;
  'Answer C'?: string;
  'الخيار ج'?: string;
  'الخيار (ج)'?: string;
  'C'?: string;
  'ج'?: string;
  'Option D'?: string;
  'Answer D'?: string;
  'الخيار د'?: string;
  'الخيار (د)'?: string;
  'D'?: string;
  'د'?: string;
  'Right Answer'?: string;
  'الإجابة الصحيحة'?: string;
  'الصحيحة'?: string;
  'Question Type'?: string;
  'نوع السؤال'?: string;
  'النوع'?: string;
  Passage?: string;
  'Reading Passage'?: string;
  'قطعة القراءة'?: string;
  'النص'?: string;
  'القطعة'?: string;
  'Passage Text'?: string;
  'نص القطعة'?: string;
  'Passage ID'?: string | number;
  'رقم القطعة'?: string | number;
  Reference?: number | string;
  'المرجع'?: number | string;
  'Reference Page'?: number | string;
  'صفحة المرجع'?: number | string;
  'رقم الصفحة'?: number | string;
  'الصفحة'?: number | string;
  Explanation?: string;
  التوضيح?: string;
  الشرح?: string;
  [key: string]: any;
}

export interface ParsedQuestionRow {
  rowNumber: number;
  subjectName: string;
  unitName: string;
  questionText: string;
  questionType: string;
  passageText?: string;
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
  isAiReference?: boolean;
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
    question_type: string;
    passage_text?: string;
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
    isExisting?: boolean;
  };
  questions?: any[];
}

export class ReferenceImportService {
  /**
   * Generate an official sample Excel reference workbook template.
   * Includes English and Arabic school examination question styles:
   * Grammar, Vocabulary, Reading Comprehension with Passage, Dialogue, Translation,
   * النحو, المفردات, الإملاء, الفهم القرائي مع القطعة.
   */
  public static generateTemplate(): Buffer {
    const sampleData = [
      {
        Subject: 'English',
        Unit: 'Unit 2',
        'Question Type': 'GRAMMAR',
        Passage: '',
        Question: 'Neither my brother nor my friends ……… to the club yesterday.',
        'Option A': 'went',
        'Option B': 'goes',
        'Option C': 'go',
        'Option D': 'has gone',
        'Right Answer': 'went',
        Reference: 24,
        Explanation: 'Yesterday indicates past simple tense.'
      },
      {
        Subject: 'English',
        Unit: 'Unit 2',
        'Question Type': 'VOCABULARY',
        Passage: '',
        Question: 'A ……… is a special discount on products during sale events.',
        'Option A': 'special offer',
        'Option B': 'complaint',
        'Option C': 'microwave',
        'Option D': 'kettle',
        'Right Answer': 'special offer',
        Reference: 26,
        Explanation: 'Special offer means a price reduction or deal.'
      },
      {
        Subject: 'English',
        Unit: 'Unit 2',
        'Question Type': 'READING_COMPREHENSION',
        Passage: 'Online shopping has transformed how people buy goods today. Many customers prefer ordering from home because it saves time and allows easy price comparisons. However, delivery delays and mismatched items remain common drawbacks that shoppers sometimes face.',
        Question: 'According to the passage, what is one major benefit of online shopping?',
        'Option A': 'It saves time and allows price comparison',
        'Option B': 'It is always completely free of charge',
        'Option C': 'Items always arrive within one hour',
        'Option D': 'Customers never receive wrong items',
        'Right Answer': 'It saves time and allows price comparison',
        Reference: 28,
        Explanation: 'Direct comprehension detail from the first two sentences.'
      },
      {
        Subject: 'English',
        Unit: 'Unit 2',
        'Question Type': 'READING_COMPREHENSION',
        Passage: 'Online shopping has transformed how people buy goods today. Many customers prefer ordering from home because it saves time and allows easy price comparisons. However, delivery delays and mismatched items remain common drawbacks that shoppers sometimes face.',
        Question: 'The word "drawbacks" in the passage is closest in meaning to ………',
        'Option A': 'disadvantages',
        'Option B': 'advantages',
        'Option C': 'discounts',
        'Option D': 'deliveries',
        'Right Answer': 'disadvantages',
        Reference: 28,
        Explanation: 'Drawbacks means negative aspects or disadvantages.'
      },
      {
        Subject: 'اللغة العربية',
        Unit: 'الوحدة الثانية',
        'Question Type': 'النحو',
        Passage: '',
        Question: 'يا طالباً العلمَ، اجتهد في دراستك. نوع المنادى في الجملة السابقة:',
        'Option A': 'شبيه بالمضاف',
        'Option B': 'مضاف',
        'Option C': 'نكرة مقصودة',
        'Option D': 'علم مفرد',
        'Right Answer': 'شبيه بالمضاف',
        Reference: 32,
        Explanation: 'منادى منون بعده معمول يتمم معناه فهو شبيه بالمضاف.'
      },
      {
        Subject: 'اللغة العربية',
        Unit: 'الوحدة الثانية',
        'Question Type': 'الفهم القرائي',
        Passage: 'تعد القراءة نافذة العقل على رياض المعرفة، وبها يرتقي الإنسان في مدارج الفكر والوعي. إن الأمم التي تقرأ هي الأمم القادرة على قيادة ركب الحضارة وبناء مستقبل مشرق لأجيالها القادمة.',
        Question: 'الفكرة الرئيسة في الفقرة السابقة هي:',
        'Option A': 'أهمية القراءة في رقي الفكر وبناء الحضارة',
        'Option B': 'تاريخ الطباعة في العصور القديمة',
        'Option C': 'صعوبة الحصول على الكتب المفيدة',
        'Option D': 'مقارنة بين المكتبات التقليدية والإلكترونية',
        'Right Answer': 'أهمية القراءة في رقي الفكر وبناء الحضارة',
        Reference: 35,
        Explanation: 'النص يتناول دور القراءة في بناء الفكر والحضارة.'
      }
    ];

    const wb = XLSX.utils.book_new();
    const headers = [
      'Subject',
      'Unit',
      'Question Type',
      'Passage',
      'Question',
      'Option A',
      'Option B',
      'Option C',
      'Option D',
      'Right Answer',
      'Reference',
      'Explanation'
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    XLSX.utils.book_append_sheet(wb, ws, 'Exams');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Parse an Excel workbook buffer and extract normalized question rows.
   * Validates required columns, 4 options, question text, correct answer,
   * extracts passages (either column or sheet), and ignores empty rows.
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

    // Check if there is a separate sheet for Passages
    const passageMap = new Map<string, string>();
    const passageSheetName = workbook.SheetNames.find((s: string) =>
      ['passages', 'passage', 'القطع', 'قطعة', 'نصوص القراءة'].some(kw =>
        s.trim().toLowerCase().includes(kw)
      )
    );
    if (passageSheetName && workbook.Sheets[passageSheetName]) {
      try {
        const rawPassageRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[passageSheetName], { defval: '' });
        for (const pRow of rawPassageRows) {
          const pId = String(pRow['Passage ID'] || pRow['ID'] || pRow['رقم القطعة'] || pRow['معرف القطعة'] || '').trim();
          const pText = String(pRow['Passage'] || pRow['Passage Text'] || pRow['النص'] || pRow['القطعة'] || pRow['نص القطعة'] || '').trim();
          if (pId && pText) {
            passageMap.set(pId.toLowerCase(), pText);
          }
        }
      } catch (pErr) {
        console.warn('⚠️ Error parsing auxiliary Passages sheet:', pErr);
      }
    }

    // Select questions sheet: prioritize 'Exams', 'Questions', 'References', or the first non-passage sheet
    let targetSheetName = workbook.SheetNames[0];
    const candidateSheet = workbook.SheetNames.find((s: string) => 
      ['exams', 'questions', 'references', 'أسئلة', 'مراجع', 'اختبارات'].some(keyword => 
        s.trim().toLowerCase().includes(keyword)
      )
    );
    if (candidateSheet) {
      targetSheetName = candidateSheet;
    } else if (passageSheetName && targetSheetName === passageSheetName && workbook.SheetNames.length > 1) {
      targetSheetName = workbook.SheetNames.find((s: string) => s !== passageSheetName) || workbook.SheetNames[0];
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
    const seenTextsInFile = new Set<string>();

    // Helper for flexible case/space-insensitive column extraction
    const getRowVal = (rowObj: any, ...aliases: string[]): string => {
      for (const a of aliases) {
        if (rowObj[a] !== undefined && rowObj[a] !== null && String(rowObj[a]).trim() !== '') {
          return String(rowObj[a]).trim();
        }
      }
      const normAliases = aliases.map(a => a.toLowerCase().replace(/[\s_\-\.\:]+/g, ''));
      for (const [rk, val] of Object.entries(rowObj)) {
        if (val === undefined || val === null || String(val).trim() === '') continue;
        const normKey = rk.toLowerCase().replace(/[\s_\-\.\:]+/g, '');
        if (normAliases.includes(normKey)) {
          return String(val).trim();
        }
      }
      return '';
    };

    rawRows.forEach((row, index) => {
      const rowNum = index + 2; // 1-indexed, accounting for header row

      const subjectName = getRowVal(row, 'Subject', 'المادة');
      const unitName = getRowVal(row, 'Unit', 'الوحدة');
      const questionText = getRowVal(row, 'Question', 'السؤال', 'نص السؤال');

      const optA = getRowVal(row, 'Option A', 'OptionA', 'Answer A', 'الخيار أ', 'الخيار (أ)', 'أ', 'A');
      const optB = getRowVal(row, 'Option B', 'OptionB', 'Answer B', 'الخيار ب', 'الخيار (ب)', 'ب', 'B');
      const optC = getRowVal(row, 'Option C', 'OptionC', 'Answer C', 'الخيار ج', 'الخيار (ج)', 'ج', 'C');
      const optD = getRowVal(row, 'Option D', 'OptionD', 'Answer D', 'الخيار د', 'الخيار (د)', 'د', 'D');

      const rawRightAnswer = getRowVal(row, 'Right Answer', 'RightAnswer', 'Correct Answer', 'الإجابة الصحيحة', 'الصحيحة', 'Right Ans');
      const rawPage = getRowVal(row, 'Reference', 'Reference Page', 'صفحة المرجع', 'المرجع', 'رقم الصفحة', 'الصفحة');
      const pageNum = parseInt(String(rawPage).replace(/[^0-9]/g, ''), 10) || 1;
      const explanation = getRowVal(row, 'Explanation', 'التوضيح', 'الشرح');

      // Extract question type
      let questionType = getRowVal(row, 'Question Type', 'QuestionType', 'نوع السؤال', 'النوع');

      // Extract reading passage
      let passageText = getRowVal(
        row,
        'Passage',
        'Reading Passage',
        'قطعة القراءة',
        'النص',
        'القطعة',
        'Passage Text',
        'نص القطعة'
      );

      // If row references a passage ID from the Passages sheet
      const passageIdRef = getRowVal(row, 'Passage ID', 'PassageID', 'رقم القطعة', 'معرف القطعة').toLowerCase();
      if (!passageText && passageIdRef && passageMap.has(passageIdRef)) {
        passageText = passageMap.get(passageIdRef) || '';
      }

      // If passage exists and questionType is not specified, default to READING_COMPREHENSION / الفهم القرائي
      if (passageText && !questionType) {
        const isArText = ((questionText + passageText).match(/[\u0600-\u06FF]/g) || []).length > ((questionText + passageText).match(/[a-zA-Z]/g) || []).length;
        questionType = isArText ? 'الفهم القرائي' : 'READING_COMPREHENSION';
      } else if (!questionType) {
        questionType = 'MULTIPLE_CHOICE';
      }

      // Safe empty row detection: ignore completely empty rows without error
      if (!questionText && !optA && !optB && !optC && !optD && !rawRightAnswer && !subjectName && !unitName) {
        return; // Skip empty row
      }

      // Validation 1: Question text must exist
      if (!questionText) {
        const reason = `السطر ${rowNum}: نص السؤال فارغ`;
        errors.push(reason);
        parsedRows.push({
          rowNumber: rowNum,
          subjectName,
          unitName,
          questionText: '',
          questionType,
          passageText: passageText || undefined,
          options: [],
          rightAnswerText: rawRightAnswer,
          pageReference: pageNum,
          explanation: explanation || undefined,
          isValid: false,
          validationError: reason
        });
        return;
      }

      // Validation 2: Check for 4 required options
      const rawOptions = [optA, optB, optC, optD];
      const validOptions = rawOptions.filter(o => Boolean(o && o.trim()));

      if (validOptions.length < 4) {
        const missingCount = 4 - validOptions.length;
        const reason = `السطر ${rowNum}: يجب توفير 4 خيارات كاملة لكل سؤال (الخيارات المتوفرة: ${validOptions.length} من 4)`;
        errors.push(reason);
        parsedRows.push({
          rowNumber: rowNum,
          subjectName,
          unitName,
          questionText,
          questionType,
          passageText: passageText || undefined,
          options: validOptions.map(text => ({ id: uuidv4(), text, is_correct: false })),
          rightAnswerText: rawRightAnswer,
          pageReference: pageNum,
          explanation: explanation || undefined,
          isValid: false,
          validationError: reason
        });
        return;
      }

      // Validation 3: Check intra-file duplicate question
      const normQText = questionText.trim().toLowerCase().replace(/[؟\?\.\!\s]+/g, ' ');
      if (seenTextsInFile.has(normQText)) {
        const reason = `السطر ${rowNum}: تكرار السؤال داخل نفس الملف ("${questionText.slice(0, 45)}...")`;
        errors.push(reason);
        parsedRows.push({
          rowNumber: rowNum,
          subjectName,
          unitName,
          questionText,
          questionType,
          passageText: passageText || undefined,
          options: validOptions.map(text => ({ id: uuidv4(), text, is_correct: false })),
          rightAnswerText: rawRightAnswer,
          pageReference: pageNum,
          explanation: explanation || undefined,
          isValid: false,
          validationError: reason
        });
        return;
      }
      seenTextsInFile.add(normQText);

      // Validation 4: Determine correct answer matching one of the 4 options
      let matchedIndex = -1;
      const normRight = rawRightAnswer.toLowerCase().trim();

      // Clean normalization for comparing strings
      const cleanNorm = (str: string) => str.toLowerCase().replace(/[\u064B-\u065F\u0670]/g, '').replace(/[^\w\u0600-\u06FF]+/g, ' ').trim();
      const cleanRight = cleanNorm(normRight);

      // Check letter indicators: A/B/C/D or أ/ب/ج/د or 1/2/3/4
      if (['a', 'أ', 'الخيار a', 'الخيار أ', 'option a', 'answer a', '1'].includes(normRight) || cleanRight === 'a' || cleanRight === 'أ' || cleanRight === '1') {
        matchedIndex = 0;
      } else if (['b', 'ب', 'الخيار b', 'الخيار ب', 'option b', 'answer b', '2'].includes(normRight) || cleanRight === 'b' || cleanRight === 'ب' || cleanRight === '2') {
        matchedIndex = 1;
      } else if (['c', 'ج', 'الخيار c', 'الخيار ج', 'option c', 'answer c', '3'].includes(normRight) || cleanRight === 'c' || cleanRight === 'ج' || cleanRight === '3') {
        matchedIndex = 2;
      } else if (['d', 'د', 'الخيار د', 'الخيار د', 'option d', 'answer d', '4'].includes(normRight) || cleanRight === 'd' || cleanRight === 'د' || cleanRight === '4') {
        matchedIndex = 3;
      } else {
        // Match by exact or trimmed option text
        matchedIndex = validOptions.findIndex(o => 
          o.toLowerCase().trim() === normRight ||
          o.trim() === rawRightAnswer
        );
        // Match by normalized text
        if (matchedIndex === -1) {
          matchedIndex = validOptions.findIndex(o => cleanNorm(o) === cleanRight);
        }
        // Substring match for phrases
        if (matchedIndex === -1 && cleanRight.length >= 3) {
          matchedIndex = validOptions.findIndex(o => {
            const co = cleanNorm(o);
            return co.length >= 3 && (cleanRight.includes(co) || co.includes(cleanRight));
          });
        }
      }

      if (matchedIndex === -1) {
        const reason = `السطر ${rowNum}: الإجابة الصحيحة "${rawRightAnswer}" لم تطابق أي من الخيارات الأربعة المتاحة`;
        errors.push(reason);
        parsedRows.push({
          rowNumber: rowNum,
          subjectName,
          unitName,
          questionText,
          questionType,
          passageText: passageText || undefined,
          options: validOptions.map(text => ({ id: uuidv4(), text, is_correct: false })),
          rightAnswerText: rawRightAnswer,
          pageReference: pageNum,
          explanation: explanation || undefined,
          isValid: false,
          validationError: reason
        });
        return;
      }

      const options = validOptions.map((text, idx) => ({
        id: uuidv4(),
        text,
        is_correct: idx === matchedIndex
      }));

      parsedRows.push({
        rowNumber: rowNum,
        subjectName,
        unitName,
        questionText,
        questionType,
        passageText: passageText || undefined,
        options,
        rightAnswerText: validOptions[matchedIndex],
        pageReference: pageNum,
        explanation: explanation || undefined,
        isValid: true
      });
    });

    return {
      sheetName: targetSheetName,
      parsedRows,
      errors
    };
  }

  /**
   * Preview and validate an Excel workbook without committing changes.
   * Gives instant feedback: valid questions, invalid rows with clear errors,
   * duplicate counts, passage detection, and question types.
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
    const targetSubjectName = representativeRow?.subjectName;
    const targetUnitName = representativeRow?.unitName;

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
        const match = targetUnitName ? targetUnitName.match(/\d+/) : null;
        if (match) detectedUnitNum = parseInt(match[0], 10);
        else if (targetUnitName?.includes('ثاني') || targetUnitName?.includes('الثانية')) detectedUnitNum = 2;
        else if (targetUnitName?.includes('أول') || targetUnitName?.includes('الأولى')) detectedUnitNum = 1;
        else if (targetUnitName?.includes('ثالث') || targetUnitName?.includes('الثالثة')) detectedUnitNum = 3;
        else if (targetUnitName?.includes('رابع') || targetUnitName?.includes('الرابعة')) detectedUnitNum = 4;

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
      question_type: string;
      passage_text?: string;
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

      // Check duplicate against existing question items
      const dupRes = await db.query(
        chapterId
          ? `SELECT id FROM question_bank_items WHERE (chapter_id = $1 AND question_text = $2) LIMIT 1`
          : `SELECT id FROM question_bank_items WHERE question_text = $1 LIMIT 1`,
        chapterId ? [chapterId, q.questionText] : [q.questionText]
      );

      if (dupRes.rows.length > 0) {
        duplicatesCount++;
      }

      questions.push({
        question_text: q.questionText,
        question_type: q.questionType,
        passage_text: q.passageText,
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
        chapterId: resolvedChapter?.id || chapterId,
        chapterTitleAr: resolvedChapter?.title_ar,
        chapterNumber: resolvedChapter?.chapter_number
      },
      questions,
      invalidRows
    };
  }

  /**
   * Universal Teacher / Administrative Reference Workbook Import.
   */
  public static async importReferenceWorkbook(
    buffer: Buffer,
    options: ImportOptions
  ): Promise<ImportSummary> {
    const allowedRoles = ['ADMIN', 'SUPERVISOR', 'CENTRAL_ADMIN', 'TEACHER'];
    if (!allowedRoles.includes(options.operatorRole)) {
      throw new Error('غير مصرح لك باستيراد المراجع المنهجية');
    }

    const { sheetName, parsedRows, errors } = this.parseWorkbook(buffer, options.workbookName);

    if (parsedRows.length === 0) {
      throw new Error('لم يتم العثور على أي أسئلة صالحة في ملف Excel');
    }

    const representativeRow = parsedRows[0];
    const targetSubjectName = representativeRow?.subjectName;
    const targetUnitName = representativeRow?.unitName;

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

    // Teacher specialization check
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
      let detectedUnitNum = 2;
      const match = targetUnitName ? targetUnitName.match(/\d+/) : null;
      if (match) {
        detectedUnitNum = parseInt(match[0], 10);
      } else if (targetUnitName?.includes('ثاني') || targetUnitName?.includes('الثانية') || targetUnitName?.toLowerCase().includes('two')) {
        detectedUnitNum = 2;
      } else if (targetUnitName?.includes('أول') || targetUnitName?.includes('الأولى') || targetUnitName?.toLowerCase().includes('one')) {
        detectedUnitNum = 1;
      } else if (targetUnitName?.includes('ثالث') || targetUnitName?.includes('الثالثة') || targetUnitName?.toLowerCase().includes('three')) {
        detectedUnitNum = 3;
      } else if (targetUnitName?.includes('رابع') || targetUnitName?.includes('الرابعة') || targetUnitName?.toLowerCase().includes('four')) {
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

    // Ensure Question Bank exists
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

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;
    let quarantined = 0;

    const validatedExamQuestions: any[] = [];
    const isReference = options.isStyleReference !== false;

    for (const q of parsedRows) {
      // Check duplicate
      const dupCheck = await db.query(
        `SELECT id FROM question_bank_items WHERE chapter_id = $1 AND question_text = $2`,
        [chapterId, q.questionText]
      );

      if (dupCheck.rows.length > 0) {
        duplicates++;
        const existingId = dupCheck.rows[0].id;
        validatedExamQuestions.push({
          id: existingId,
          question_text: q.questionText,
          question_type: q.questionType,
          passage_text: q.passageText,
          page_reference: q.pageReference,
          options: q.options,
          explanation: q.explanation
        });
        continue;
      }

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
      const isVerified = q.isValid && 
                         isQualityAcceptable && 
                         answerVal.answerKeyStatus !== 'REJECTED' && 
                         hasSupportingChunk && 
                         isPageWithinUnit;

      const verificationHash = computeQuestionVerificationHash(groundedCandidate);

      const isQuarantined = isVerified ? 0 : 1;
      const quarantineReason = isVerified 
        ? `VERIFIED:${verificationHash}` 
        : `QUARANTINED:${!q.isValid ? (q.validationError || 'INVALID_ROW') : !hasSupportingChunk ? 'NO_SOURCE_CHUNK' : !isPageWithinUnit ? 'PAGE_OUT_OF_UNIT_BOUNDS' : answerVal.answerKeyStatus === 'REJECTED' ? 'INVALID_ANSWER_KEY' : qualityResult.reason || 'QUALITY_CHECK_FAILED'}`;

      const questionItemId = groundedCandidate.id;
      await db.query(
        `INSERT INTO question_bank_items (
           id, bank_id, chapter_id, question_text, question_type, difficulty,
           bloom_level, explanation, passage_text, is_reference, source_chunk_id, page_reference,
           is_quarantined, quarantine_reason
         ) VALUES ($1, $2, $3, $4, $5, 'MEDIUM', 'UNDERSTANDING', $6, $7, $8, $9, $10, $11, $12)`,
        [
          questionItemId,
          bankId,
          chapterId,
          q.questionText,
          q.questionType || 'MULTIPLE_CHOICE',
          q.explanation || null,
          q.passageText || null,
          isReference ? 1 : 0,
          sourceChunkId,
          q.pageReference,
          isQuarantined,
          quarantineReason
        ]
      );

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
          question_type: q.questionType,
          passage_text: q.passageText,
          page_reference: q.pageReference,
          options: q.options,
          explanation: q.explanation
        });
      }
    }

    // Invalidate AI exam cache for this chapter so new references take effect immediately
    try {
      await db.query(
        `DELETE FROM shared_cached_exams WHERE grade_id = $1 AND subject_id = $2 AND (unit_ids LIKE $3 OR unit_ids = $4)`,
        [gradeId, subjectId, `%${chapterId}%`, chapterId]
      );
    } catch (_) {}

    // Create/update fixed exam container if requested
    let fixedExamResult: { id: string; title: string; questionsCount: number; isExisting?: boolean } | undefined;

    if (options.createFixedExam !== false && validatedExamQuestions.length > 0) {
      const fixedExamId = uuidv4();
      const unitNumStr = resolvedChapter?.chapter_number ? `الوحدة ${resolvedChapter.chapter_number}` : 'الوحدة المنهجية';
      const defaultTitleAr = `امتحان ${subjectInfo.name_ar} - ${unitNumStr}: ${resolvedChapter?.title_ar || targetUnitName} (نموذج معتمد)`;
      const defaultTitleEn = `${subjectInfo.name_en || 'Subject'} - Unit ${resolvedChapter?.chapter_number || 1} Fixed Exam`;

      const examTitleAr = options.examTitle?.trim() || defaultTitleAr;
      const examTitleEn = options.examTitle?.trim() || defaultTitleEn;
      const durationMin = options.durationMinutes && options.durationMinutes >= 5 ? options.durationMinutes : 30;
      const isPub = options.isPublished !== undefined ? (options.isPublished ? 1 : 0) : 1;
      const isStyleRef = options.isStyleReference !== undefined ? (options.isStyleReference ? 1 : 0) : 1;
      const isAiRef = options.isAiReference !== undefined ? (options.isAiReference ? 1 : 0) : 0;

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
      let isExistingExam = false;
      if (existingExamRes.rows.length > 0) {
        targetExamId = existingExamRes.rows[0].id;

        // If ALL parsed rows are duplicates and NO new questions were imported (identical workbook re-import):
        if (imported === 0 && duplicates === parsedRows.length) {
          isExistingExam = true;
          // Retain the existing exam completely untouched (do not overwrite title, duration, or metadata)
          const examDataRes = await db.query(
            `SELECT id, title_ar, duration_minutes, is_published, is_style_reference FROM exams WHERE id = $1`,
            [targetExamId]
          );
          const qCountRes = await db.query(
            `SELECT COUNT(*) as count FROM exam_questions WHERE exam_id = $1`,
            [targetExamId]
          );
          fixedExamResult = {
            id: targetExamId,
            title: examDataRes.rows[0]?.title_ar || existingExamRes.rows[0].title_ar,
            questionsCount: parseInt(qCountRes.rows[0]?.count, 10) || validatedExamQuestions.length,
            isExisting: true
          };
        } else {
          await db.query(
            `UPDATE exams SET duration_minutes = $2, is_style_reference = $3, is_ai_reference = $4, is_published = $5 WHERE id = $1`,
            [targetExamId, durationMin, isStyleRef, isAiRef, isPub]
          );
          await db.query(`DELETE FROM exam_questions WHERE exam_id = $1`, [targetExamId]);
        }
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
             is_style_reference, is_ai_reference, school_type, term
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
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
            isAiRef,
            schoolType,
            term
          ]
        );
      }

      if (!isExistingExam) {
        for (let i = 0; i < validatedExamQuestions.length; i++) {
          const eq = validatedExamQuestions[i];
          const examQId = uuidv4();

          await db.query(
            `INSERT INTO exam_questions (
               id, exam_id, question_item_id, question_text, question_type,
               points, page_reference, passage_text, explanation, order_index
             ) VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8, $9)`,
            [
              examQId,
              targetExamId,
              eq.id,
              eq.question_text,
              eq.question_type || 'MULTIPLE_CHOICE',
              String(eq.page_reference || 1),
              eq.passage_text || null,
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
          questionsCount: validatedExamQuestions.length,
          isExisting: false
        };
      }
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
      fixedExam: fixedExamResult,
      questions: validatedExamQuestions
    };
  }

  /**
   * Main Admin Exclusive Reference Questions Import Workflow.
   * Strictly scopes questions to authoritative Grade, Subject, and Unit.
   * Stores questions in the persistent Question Bank with zero paid Gemini spend.
   * Automatically isolates questions from static exams (is_published = 0, is_ai_reference = 1).
   */
  public static async importAdminReferenceQuestions(
    buffer: Buffer,
    options: {
      operatorId: string;
      operatorRole: string;
      workbookName: string;
      gradeId: string;
      subjectId: string;
      chapterId: string;
    }
  ): Promise<ImportSummary> {
    // 1. Strict Role Authorization Check
    if (options.operatorRole !== 'ADMIN') {
      throw new Error('غير مصرح لك باستيراد أسئلة المراجع للامتحانات الذكية (مخصص لمدير النظام فقط)');
    }

    if (!options.gradeId || !options.subjectId || !options.chapterId) {
      throw new Error('يجب تحديد الصف الدراسي والمادة والوحدة بشكل صريح');
    }

    // 2. Parse workbook & validate
    const { sheetName, parsedRows, errors } = this.parseWorkbook(buffer, options.workbookName);

    if (parsedRows.length === 0) {
      throw new Error('لم يتم العثور على أي أسئلة صالحة في ملف Excel');
    }

    const invalidRows = parsedRows.filter(r => !r.isValid);
    if (invalidRows.length > 0) {
      const errDetails = invalidRows.map(r => r.validationError).join(' • ');
      throw new Error(`الملف يحتوي على ${invalidRows.length} سؤال غير صالح: ${errDetails}`);
    }

    // 3. Resolve authoritative curriculum
    const subjectRes = await db.query(
      `SELECT s.id, s.name_ar, s.name_en, s.grade_id, g.stage_id, g.name_ar as grade_name_ar
       FROM subjects s
       JOIN grades g ON s.grade_id = g.id
       WHERE s.id = $1 AND s.grade_id = $2`,
      [options.subjectId, options.gradeId]
    );

    if (subjectRes.rows.length === 0) {
      throw new Error('المادة الدراسية المحددة لا تنتمي إلى الصف الدراسي المختار');
    }

    const subjectInfo = subjectRes.rows[0];
    const stageId = subjectInfo.stage_id;

    // Verify Chapter exists
    const chapterRes = await db.query(
      `SELECT bc.id, bc.chapter_number, bc.title_ar, bc.title_en, bc.book_id,
              b.title_ar as book_title_ar, b.total_pages
       FROM book_chapters bc
       JOIN books b ON bc.book_id = b.id
       WHERE bc.id = $1 AND b.subject_id = $2 AND b.grade_id = $3`,
      [options.chapterId, options.subjectId, options.gradeId]
    );

    if (chapterRes.rows.length === 0) {
      throw new Error('الوحدة المحددة لا تنتمي إلى المنهج الدراسي المعتمد');
    }

    const chapterInfo = chapterRes.rows[0];

    // 4. Ensure Question Bank exists
    let bankRes = await db.query(
      `SELECT id FROM question_banks WHERE subject_id = $1 AND grade_id = $2 LIMIT 1`,
      [options.subjectId, options.gradeId]
    );

    let bankId: string;
    if (bankRes.rows.length === 0) {
      bankId = uuidv4();
      await db.query(
        `INSERT INTO question_banks (id, subject_id, academic_stage_id, grade_id, title, description, created_by)
         VALUES ($1, $2, $3, $4, 'بنك الأسئلة الذكي المعتمد', 'المرجع الرسمي للامتحانات الذكية', $5)`,
        [bankId, options.subjectId, stageId, options.gradeId, options.operatorId]
      );
    } else {
      bankId = bankRes.rows[0].id;
    }

    // 5. Invalidate cached AI exams for this unit so fresh reference questions take effect immediately
    try {
      await db.query(
        `DELETE FROM shared_cached_exams WHERE grade_id = $1 AND subject_id = $2 AND (unit_ids LIKE $3 OR unit_ids = $4)`,
        [options.gradeId, options.subjectId, `%${options.chapterId}%`, options.chapterId]
      );
    } catch (_) {}

    // 6. Transactional Save & Deduplication: Remove prior active reference questions for this exact chapter
    await db.query(
      `DELETE FROM question_bank_items WHERE chapter_id = $1 AND is_reference = 1`,
      [options.chapterId]
    );

    // Also remove prior reference exam container for this chapter
    const oldExamRes = await db.query(
      `SELECT id FROM exams WHERE chapter_id = $1 AND is_ai_reference = 1`,
      [options.chapterId]
    );
    for (const oldEx of oldExamRes.rows) {
      await db.query(`DELETE FROM exam_questions WHERE exam_id = $1`, [oldEx.id]);
      await db.query(`DELETE FROM exams WHERE id = $1`, [oldEx.id]);
    }

    // 7. Insert new reference questions
    let imported = 0;
    const validatedQuestions: any[] = [];

    for (const q of parsedRows) {
      const questionItemId = uuidv4();

      await db.query(
        `INSERT INTO question_bank_items (
           id, bank_id, chapter_id, question_text, question_type, difficulty,
           bloom_level, explanation, passage_text, is_reference, page_reference,
           is_quarantined, quarantine_reason
         ) VALUES ($1, $2, $3, $4, $5, 'MEDIUM', 'UNDERSTANDING', $6, $7, 1, $8, 0, 'VERIFIED:ADMIN_REFERENCE')`,
        [
          questionItemId,
          bankId,
          options.chapterId,
          q.questionText,
          q.questionType || 'MULTIPLE_CHOICE',
          q.explanation || null,
          q.passageText || null,
          q.pageReference || 1
        ]
      );

      for (const opt of q.options) {
        await db.query(
          `INSERT INTO question_bank_options (id, question_item_id, option_text, is_correct)
           VALUES ($1, $2, $3, $4)`,
          [uuidv4(), questionItemId, opt.text, opt.is_correct ? 1 : 0]
        );
      }

      imported++;
      validatedQuestions.push({
        id: questionItemId,
        question_text: q.questionText,
        question_type: q.questionType,
        passage_text: q.passageText,
        page_reference: q.pageReference,
        options: q.options,
        explanation: q.explanation
      });
    }

    // 8. Create AI Reference container in `exams` (isolated from static listings: is_published = 0, is_ai_reference = 1)
    const refExamId = uuidv4();
    const titleAr = `أسئلة مرجعية معتمدة - ${subjectInfo.name_ar} - الوحدة ${chapterInfo.chapter_number}: ${chapterInfo.title_ar}`;
    const titleEn = `Reference Exam - ${subjectInfo.name_en || 'Subject'} - Unit ${chapterInfo.chapter_number}`;

    await db.query(
      `INSERT INTO exams (
         id, title_ar, title_en, teacher_id, academic_stage_id, grade_id,
         subject_id, book_id, chapter_id, duration_minutes, is_published,
         is_style_reference, is_ai_reference, school_type, term
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 30, 0, 1, 1, 'كلاهما', 1)`,
      [
        refExamId,
        titleAr,
        titleEn,
        options.operatorId,
        stageId,
        options.gradeId,
        options.subjectId,
        chapterInfo.book_id,
        options.chapterId
      ]
    );

    for (let i = 0; i < validatedQuestions.length; i++) {
      const vq = validatedQuestions[i];
      const examQId = uuidv4();

      await db.query(
        `INSERT INTO exam_questions (
           id, exam_id, question_item_id, question_text, question_type,
           points, page_reference, passage_text, explanation, order_index
         ) VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8, $9)`,
        [
          examQId,
          refExamId,
          vq.id,
          vq.question_text,
          vq.question_type || 'MULTIPLE_CHOICE',
          String(vq.page_reference || 1),
          vq.passage_text || null,
          vq.explanation || null,
          i + 1
        ]
      );

      for (const opt of vq.options) {
        await db.query(
          `INSERT INTO exam_question_options (id, question_id, option_text, is_correct)
           VALUES ($1, $2, $3, $4)`,
          [uuidv4(), examQId, opt.text, opt.is_correct ? 1 : 0]
        );
      }
    }

    return {
      success: true,
      workbookName: options.workbookName,
      sheetName,
      totalRows: parsedRows.length,
      imported,
      skipped: 0,
      duplicates: 0,
      quarantined: 0,
      errors: [],
      resolvedCurriculum: {
        stageId,
        gradeId: options.gradeId,
        gradeNameAr: subjectInfo.grade_name_ar,
        subjectId: options.subjectId,
        subjectNameAr: subjectInfo.name_ar,
        bookId: chapterInfo.book_id,
        bookTitleAr: chapterInfo.book_title_ar,
        chapterId: options.chapterId,
        chapterTitleAr: chapterInfo.title_ar,
        chapterNumber: chapterInfo.chapter_number
      },
      fixedExam: {
        id: refExamId,
        title: titleAr,
        questionsCount: imported,
        isExisting: false
      },
      questions: validatedQuestions
    };
  }
}
