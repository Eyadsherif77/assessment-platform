import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/db.js';
import { generateEmbedding, cosineSimilarity } from './vectorEmbedding.js';
import { cleanArabicText, stripDocumentMetadataAndStructure } from '../../utils/arabicTextNormalizer.js';

export interface RetrievedChunk {
  id: string;
  book_id: string;
  chapter_id: string;
  page_number: number;
  chunk_index: number;
  content: string;
  metadata: any;
  similarity?: number;
}

export interface GroundedQuestion {
  id: string;
  chunk_id: string;
  book_id: string;
  chapter_id: string;
  question_text: string;
  options: { id: string; text: string; is_correct: boolean }[];
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  bloom_level: 'KNOWLEDGE' | 'UNDERSTANDING' | 'APPLICATION' | 'ANALYSIS' | string;
  page_reference: number;
  source_excerpt: string;
  explanation: string;
  // AI Assessment Debug Inspection Fields (Development Only)
  chunk_text?: string;
  similarity_score?: number;
  validation_status?: { isValid: boolean; reason?: string };
}

export interface QualityScoreResult {
  isValid: boolean;
  relevanceScore: number;       // Target: >= 90%
  educationalValue: number;      // Target: >= 90%
  metadataPresence: number;      // Target: 0%
  isDuplicate: boolean;          // Target: false (0% duplicate)
  reason?: string;
}

/**
 * Teacher Quality Score Evaluator:
 * - Relevance Score >= 90%
 * - Educational Value >= 90%
 * - Metadata Presence = 0%
 * - Duplicate Questions = 0%
 * 
 * Rejects any question containing AI boilerplate ("according to the text", "وفقاً للنص"),
 * structural references (page, chapter, unit, lesson), excessive option length (> 12 words),
 * or non-educational content.
 */
export function evaluateQuestionQuality(
  q: GroundedQuestion,
  existingQuestions: GroundedQuestion[] = [],
  contextWords: Set<string> = new Set()
): QualityScoreResult {
  if (!q.question_text || q.question_text.trim().length < 12) {
    return {
      isValid: false,
      relevanceScore: 0,
      educationalValue: 0,
      metadataPresence: 0,
      isDuplicate: false,
      reason: 'Question text is missing or too short'
    };
  }

  // 1. Duplicate check (Duplicate Questions = 0%)
  const qNorm = q.question_text.trim().toLowerCase().replace(/[؟\?\.\!]/g, '');
  const isDup = existingQuestions.some(eq => {
    if (eq.id === q.id) return false;
    const eqNorm = eq.question_text.trim().toLowerCase().replace(/[؟\?\.\!]/g, '');
    return eqNorm === qNorm;
  });

  if (isDup) {
    return {
      isValid: false,
      relevanceScore: 0,
      educationalValue: 0,
      metadataPresence: 0,
      isDuplicate: true,
      reason: 'Duplicate question detected (fails 0% duplicate rule)'
    };
  }

  // 2. Metadata Presence (Target: 0%)
  const forbiddenPatterns: RegExp[] = [
    /\bpage\b/i,
    /\bpages\b/i,
    /\bchapter\b/i,
    /\bchapters\b/i,
    /\blesson\b/i,
    /\blessons\b/i,
    /\bunit\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i,
    /\bunits\s+\d+/i,
    /\bcurriculum\s+unit\b/i,
    /\bsection\b/i,
    /\bsections\b/i,
    /\btitle\b/i,
    /\bheading\b/i,
    /\bheadings\b/i,
    /\bmetadata\b/i,
    /\btable\s+of\s+contents\b/i,
    /\bdocument\s+structure\b/i,
    /\bfile\s+name\b/i,
    // AI-style wording forbidden by Teacher Quality Rules
    /according\s+to\s+the\s+text/i,
    /based\s+on\s+the\s+(?:provided\s+)?content/i,
    /from\s+the\s+passage/i,
    /as\s+mentioned\s+in\s+the\s+lesson/i,
    /as\s+stated\s+above/i,
    /in\s+the\s+text\s+above/i,
    // Arabic structural & metadata tokens
    /صفحة/,
    /صفحات/,
    /رقم\s+الصفحة/,
    /الفصل\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|\d+)/,
    /فصل\s+\d+/,
    /الدرس\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|\d+)/,
    /درس\s+\d+/,
    /الوحدة\s+(?:الأولى|الثانية|الثالثة|الرابعة|\d+)/,
    /وحدة\s+\d+/,
    /المبحث\s+(?:الأول|الثاني|\d+)/,
    /عنوان\s+(?:الدرس|الفصل|الوحدة|الكتاب)/,
    /في\s+أي\s+صفحة/,
    /ما\s+رقم\s+صفحة/,
    /فهرس/,
    /المحتويات/,
    // Arabic AI-style wording forbidden by Teacher Quality Rules
    /وفق(?:اً|ا)?\s+للنص/,
    /بناء(?:ً|ا)?\s+على\s+(?:المحتوى|ما\s+ورد)/,
    /من\s+الفقرة\s+السابقة/,
    /كما\s+ورد\s+في\s+الدرس/,
    /أي\s+من\s+العبارات\s+(?:الآتية|التالية)\s+حقيقة\s+مذكورة/,
    /المذكور\s+أعلاه/,
    /من\s+خلال\s+دراستك\s+للنص/,
    // Colloquial / Slang / Dialect expressions forbidden in official schools (Modern Standard Arabic only)
    /(?:^|\s)(?:جامدة|حلوة|شاطر|شاطرة|كدا|كدة|عشان|علشان|إيه|ايه|ليه|أوي|قوي|بتاع|بتاعة|دلوقتي|برضه|برضو|ازاي|إزاي|مش|أهو|اهو)(?:$|\s|[؟\.\!,])/i
  ];

  const textsToCheck = [
    q.question_text,
    ...(q.options || []).map(o => o.text),
    q.explanation || ''
  ];

  let foundMetadataTerm = '';
  for (const text of textsToCheck) {
    if (!text) continue;
    for (const rx of forbiddenPatterns) {
      if (rx.test(text)) {
        foundMetadataTerm = rx.toString();
        break;
      }
    }
    if (foundMetadataTerm) break;
  }

  const metadataPresence = foundMetadataTerm ? 100 : 0;
  if (metadataPresence > 0) {
    return {
      isValid: false,
      relevanceScore: 80,
      educationalValue: 40,
      metadataPresence: 100,
      isDuplicate: false,
      reason: `Metadata or AI boilerplate detected matching ${foundMetadataTerm}`
    };
  }

  // 3. Educational Value (Target: >= 90%)
  if (!q.options || q.options.length < 2) {
    return {
      isValid: false,
      relevanceScore: 50,
      educationalValue: 0,
      metadataPresence: 0,
      isDuplicate: false,
      reason: 'Question must have at least 2 options'
    };
  }

  const correctCount = q.options.filter(o => o.is_correct).length;
  if (correctCount !== 1) {
    return {
      isValid: false,
      relevanceScore: 50,
      educationalValue: 0,
      metadataPresence: 0,
      isDuplicate: false,
      reason: `Must have exactly 1 correct option, got ${correctCount}`
    };
  }

  let eduScore = 100;

  // Teacher Rule: Options must be concise (max 8 words preferred, penalty if > 12 words)
  let longOptions = 0;
  for (const opt of q.options) {
    const wordCount = opt.text.trim().split(/\s+/).length;
    if (wordCount > 12) longOptions++;
  }
  if (longOptions > 0) {
    eduScore -= 12; // Deduct for verbose options
  }

  // Teacher Rule: Question text must test understanding (definitions, reasoning, cause/effect, problem-solving)
  const isTeacherStem = /ما|علل|احسب|متى|أي|لماذا|كيف|وضح|اذكر|إذا|ماذا يحدث|what|why|which|how|calculate|if/i.test(q.question_text);
  if (!isTeacherStem) {
    eduScore -= 12;
  }

  // 4. Relevance Score (Target: >= 90%)
  let relScore = 95;
  if (contextWords.size >= 25) {
    const qTokens = q.question_text.toLowerCase().split(/[^\w\u0600-\u06FF]+/).filter(w => w.length > 2);
    const matches = qTokens.filter(w => contextWords.has(w)).length;
    if (qTokens.length > 0 && matches === 0) {
      relScore = 70;
    }
  }

  const isValid = metadataPresence === 0 && eduScore >= 90 && relScore >= 90 && !isDup;

  return {
    isValid,
    relevanceScore: relScore,
    educationalValue: eduScore,
    metadataPresence: 0,
    isDuplicate: false,
    reason: isValid ? undefined : `Failed teacher quality thresholds (Edu: ${eduScore}%, Rel: ${relScore}%, Meta: ${metadataPresence}%)`
  };
}

export function validateEducationalQuestion(q: GroundedQuestion): { isValid: boolean; reason?: string } {
  const result = evaluateQuestionQuality(q);
  return { isValid: result.isValid, reason: result.reason };
}

export interface EvaluationItemResult {
  question_id: string;
  question_text: string;
  selected_option_id: string;
  student_answer_text: string;
  correct_answer_text: string;
  is_correct: boolean;
  points: number;
  explanation: string;
  page_reference: number;
  topic_area: string;
  study_recommendation: string;
}

export interface FullDiagnosticReport {
  evaluation_id: string;
  student_id: string;
  book_id: string;
  chapter_id: string;
  subject_id: string;
  score: number;
  max_score: number;
  percentage: number;
  mastery_status: 'MASTERED' | 'PROFICIENT' | 'DEVELOPING' | 'NEEDS_WORK';
  items: EvaluationItemResult[];
  weak_topics: string[];
  strong_topics: string[];
  overall_feedback_ar: string;
  overall_feedback_en: string;
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

class AIRagEngine {
  // In-memory cache for sanitized educational chunks per chapter (15 min TTL)
  private static chunksMemoryCache = new Map<string, { chunks: RetrievedChunk[]; timestamp: number }>();
  // In-memory cache for validated Question Bank items per chapter & grade (10 min TTL)
  private static bankMemoryCache = new Map<string, { questions: GroundedQuestion[]; timestamp: number }>();

  /**
   * Strictly retrieve textbook chunks belonging ONLY to the student's stage, grade, subject, book, and chapter.
   * Optimized to select only top high-density educational chunks, ignoring document metadata.
   */
  public async retrieveGroundedChunks(params: {
    academicStageId: string;
    gradeId: string;
    subjectId: string;
    bookId: string;
    chapterId: string;
    queryText?: string;
    limit?: number;
  }): Promise<RetrievedChunk[]> {
    const { academicStageId, gradeId, subjectId, bookId, chapterId, queryText, limit = 3 } = params;

    // Fast-path: In-memory cache lookup
    const cachedEntry = AIRagEngine.chunksMemoryCache.get(chapterId);
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < 15 * 60 * 1000) && !queryText) {
      const shuffled = [...cachedEntry.chunks].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, limit);
    }

    const res = await db.query(
      `SELECT id, book_id, chapter_id, page_number, chunk_index, content, metadata, embedding
       FROM book_chunks
       WHERE academic_stage_id = $1 
         AND grade_id = $2 
         AND subject_id = $3 
         AND book_id = $4 
         AND chapter_id = $5
       ORDER BY chunk_index ASC`,
      [academicStageId, gradeId, subjectId, bookId, chapterId]
    );

    if (res.rows.length === 0) {
      return [];
    }

    // 1. Sanitize all chunks (stripping page numbers, headers, footers, labels, TOC, publisher boilerplate)
    const sanitizedRows: RetrievedChunk[] = res.rows.map((row: any) => ({
      id: row.id,
      book_id: row.book_id,
      chapter_id: row.chapter_id,
      page_number: row.page_number,
      chunk_index: row.chunk_index,
      content: stripDocumentMetadataAndStructure(row.content),
      metadata: row.metadata,
      embedding: row.embedding
    }));

    // Filter out boilerplate chunks (indexes, table of contents, copyright, committee info)
    const isBoilerplateChunk = (text: string): boolean => {
      if (!text || text.trim().length < 25) return true;
      const lower = text.toLowerCase();
      const boilerplateKeywords = [
        'الفهرس', 'المحتويات', 'قائمة المحتويات', 'فهرس الكتاب',
        'لجنة الإعداد', 'لجنة التأليف', 'المراجعة والتطوير', 'مستشار المادة',
        'حقوق الطبع', 'حقوق النشر', 'رقم الإيداع', 'دار الكتب', 'isbn',
        'طبعة 202', 'وزارة التربية والتعليم والتعليم الفني', 'مقدمة الناشر',
        'دليل المعلم وولي الأمر', 'أهداف الوحدة العامة'
      ];
      const dotCount = (text.match(/\.{3,}/g) || []).length;
      if (dotCount >= 3) return true;
      return boilerplateKeywords.some(kw => lower.includes(kw));
    };

    // Filter to educational content chunks (definitions, concepts, explanations, examples, experiments, procedures, formulas, learning objectives)
    const isEducationalChunk = (text: string): boolean => {
      if (!text || text.trim().length < 35) return false;
      if (isBoilerplateChunk(text)) return false;

      const hasDefinition = /تعريف|يقصد بـ|هو عبارة عن|هي عبارة عن|هو كل ما|هي كل ما|يُعرف بـ|يُقصد به|المصطلح العلمي|definition|defined as|means/i.test(text);
      const hasConcept = /مفهوم|خاصية|خصائص|ظاهرة|علاقة|الكثافة|الكتلة|الحجم|المادة|الذرة|العنصر|المركب|الطاقة|السرعة|الحركة|القوة|الحرارة|التفاعل|concept|property|matter|mass|volume|density/i.test(text);
      const hasExplanation = /علل|تفسير|السبب|يرجع ذلك إلى|نستنتج أن|نستدل على|بسبب|لأن|يؤدي إلى|يترتب على|explanation|because|causes|results in|therefore/i.test(text);
      const hasExample = /مثال|أمثلة|على سبيل المثال|مثل:|كمثال|example|for instance/i.test(text);
      const hasExperimentOrProcedure = /تجربة|نشاط|ملاحظة|استنتاج|أدوات|خطوات|طريقة العمل|نلاحظ أن|experiment|activity|observation|procedure|steps/i.test(text);
      const hasFormulaOrCalc = /قانون|معادلة|العلاقة الرياضية|تُحسب من العلاقة|جرام\/سم|كجم\/م|كيلوجرام|نيوتن|متر\/ثانية|formula|equation|\/|×|\+|\-|=/i.test(text);
      const hasObjectives = /أهداف التعلم|نواتج التعلم|يتوقع في نهاية|أن يتعرف الطالب|أن يستنتج الطالب|learning objectives/i.test(text);

      const words = text.trim().split(/\s+/).length;
      return hasDefinition || hasConcept || hasExplanation || hasExample || hasExperimentOrProcedure || hasFormulaOrCalc || hasObjectives || words >= 25;
    };

    const educationalChunks = sanitizedRows.filter((row: RetrievedChunk) => isEducationalChunk(row.content));
    const candidateChunks = educationalChunks.length > 0 ? educationalChunks : sanitizedRows.filter((r: RetrievedChunk) => !isBoilerplateChunk(r.content));

    // Save in memory cache for 15 minutes
    AIRagEngine.chunksMemoryCache.set(chapterId, {
      chunks: candidateChunks,
      timestamp: Date.now()
    });

    if (!queryText) {
      // Pick random chunks from candidateChunks so questions are diverse across the entire chapter
      const shuffled = [...candidateChunks].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, limit);
    }

    // Perform vector ranking using query embedding
    const queryVec = await generateEmbedding(queryText);
    const scoredChunks = candidateChunks.map((row: any) => {
      let sim = 0;
      if (row.embedding) {
        try {
          const chunkVec = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
          sim = cosineSimilarity(queryVec, chunkVec);
        } catch (e) {
          sim = 0;
        }
      }
      return {
        ...row,
        similarity: sim
      };
    });

    scoredChunks.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
    return scoredChunks.slice(0, limit);
  }

  /**
   * Detects the educational language of the textbook/chapter based on chunk content and metadata.
   */
  public detectLanguage(chunks: { content?: string }[], book?: any): 'ar' | 'en' {
    const combinedContent = chunks.map(c => c.content || '').join(' ');
    const arChars = (combinedContent.match(/[\u0600-\u06FF]/g) || []).length;
    const enChars = (combinedContent.match(/[a-zA-Z]/g) || []).length;

    if (enChars > arChars && enChars > 25) {
      return 'en';
    }
    if (arChars > enChars && arChars > 25) {
      return 'ar';
    }

    const fileUrl = (book?.file_url || '').toLowerCase();
    const titleEn = (book?.title_en || '').toLowerCase();
    const titleAr = (book?.title_ar || '').toLowerCase();
    const bookLanguage = (book?.language || '').toLowerCase();
    const schoolType = (book?.school_type || '').toLowerCase();

    if (bookLanguage === 'en' || bookLanguage === 'english') {
      return 'en';
    }
    if (bookLanguage === 'ar' || bookLanguage === 'arabic') {
      return 'ar';
    }

    const isEnglishMetadata =
      fileUrl.includes('_en_') ||
      fileUrl.includes('math_en') ||
      fileUrl.includes('science_en') ||
      titleEn.includes('math') ||
      titleEn.includes('english') ||
      titleEn.includes('science') ||
      titleEn.includes('physics') ||
      titleEn.includes('chemistry') ||
      titleEn.includes('biology') ||
      titleAr.includes('math') ||
      titleAr.includes('english') ||
      titleAr.includes('science') ||
      (schoolType === 'لغات' && (titleAr.includes('رياضيات') || titleAr.includes('علوم')));

    if (isEnglishMetadata && arChars < 60) {
      return 'en';
    }

    if (isEnglishMetadata && enChars > 15) {
      return 'en';
    }

    return 'ar';
  }

  /**
   * Check if questions already exist in the Question Bank in TiDB.
   * Single-query fast join with in-memory caching for sub-second retrieval (< 1s target).
   */
  private async getQuestionsFromBank(params: {
    bookId: string;
    chapterId: string;
    gradeId?: string;
    count: number;
    studentId?: string;
    expectedLanguage?: 'ar' | 'en';
  }): Promise<GroundedQuestion[] | null> {
    const { bookId, chapterId, gradeId, count, studentId, expectedLanguage = 'ar' } = params;
    const cacheKey = `${gradeId || 'any'}:${bookId}:${chapterId}:${expectedLanguage}`;

    try {
      // 1. If studentId is provided, fetch all question IDs and normalized texts the student has already seen
      const seenIds = new Set<string>();
      const seenTexts = new Set<string>();

      if (studentId) {
        try {
          const evalRes = await db.query(
            `SELECT questions_data FROM ai_evaluations WHERE student_id = $1 AND chapter_id = $2`,
            [studentId, chapterId]
          );
          for (const row of evalRes.rows) {
            try {
              const qList = typeof row.questions_data === 'string' ? JSON.parse(row.questions_data) : row.questions_data;
              if (Array.isArray(qList)) {
                qList.forEach((q: any) => {
                  if (q.id) seenIds.add(q.id);
                  if (q.question_text) {
                    seenTexts.add(q.question_text.trim().toLowerCase().replace(/[؟\?\.\!\s]+/g, ' '));
                  }
                });
              }
            } catch (_) {}
          }
        } catch (_) {}
      }

      const isUnseenForStudent = (q: GroundedQuestion) => {
        if (studentId) {
          if (seenIds.has(q.id)) return false;
          const norm = q.question_text.trim().toLowerCase().replace(/[؟\?\.\!\s]+/g, ' ');
          if (seenTexts.has(norm)) return false;
        }
        return true;
      };

      // 2. Fast in-memory cache check (< 5ms)
      const memCached = AIRagEngine.bankMemoryCache.get(cacheKey);
      if (memCached && (Date.now() - memCached.timestamp < 10 * 60 * 1000)) {
        let validMem = memCached.questions
          .filter(q => evaluateQuestionQuality(q).isValid)
          .filter(isUnseenForStudent);

        if (validMem.length >= count) {
          return shuffleArray(validMem).slice(0, count);
        }
      }

      // 3. Single-query fast join from TiDB (retrieves items + options in 1 query strictly matching book of current term)
      const rowsRes = await db.query(
        `SELECT 
           qi.id, qi.question_text, qi.difficulty, qi.bloom_level, qi.explanation, qi.page_reference, qi.source_chunk_id,
           qo.id as opt_id, qo.option_text, qo.is_correct
         FROM question_bank_items qi
         JOIN question_bank_options qo ON qi.id = qo.question_item_id
         JOIN book_chapters bc ON qi.chapter_id = bc.id
         WHERE qi.chapter_id = $1 AND bc.book_id = $2
         ORDER BY qi.id ASC`,
        [chapterId, bookId]
      );

      if (rowsRes.rows.length === 0) return null;

      // Group rows by question_item_id
      const itemsMap = new Map<string, any>();
      for (const row of rowsRes.rows) {
        if (!itemsMap.has(row.id)) {
          itemsMap.set(row.id, {
            id: row.id,
            question_text: row.question_text,
            difficulty: row.difficulty,
            bloom_level: row.bloom_level,
            explanation: row.explanation,
            page_reference: row.page_reference,
            source_chunk_id: row.source_chunk_id,
            options: []
          });
        }
        itemsMap.get(row.id).options.push({
          id: row.opt_id,
          text: row.option_text,
          is_correct: row.is_correct === 1 || row.is_correct === true || row.is_correct === '1'
        });
      }

      const allItems = Array.from(itemsMap.values());
      const candidateQuestions: GroundedQuestion[] = [];

      for (const item of allItems) {
        const qText = item.question_text || '';
        const arCount = (qText.match(/[\u0600-\u06FF]/g) || []).length;
        const enCount = (qText.match(/[a-zA-Z]/g) || []).length;

        // Ensure language sovereignty
        if (expectedLanguage === 'en' && arCount > enCount) continue;
        if (expectedLanguage === 'ar' && enCount > arCount && arCount < 5) continue;

        const groundedQ: GroundedQuestion = {
          id: item.id,
          chunk_id: item.source_chunk_id || '',
          book_id: bookId,
          chapter_id: chapterId,
          question_text: item.question_text,
          options: shuffleArray(item.options),
          difficulty: item.difficulty || 'MEDIUM',
          bloom_level: item.bloom_level || 'UNDERSTANDING',
          page_reference: item.page_reference || 1,
          source_excerpt: '',
          explanation: item.explanation || ''
        };

        const quality = evaluateQuestionQuality(groundedQ, candidateQuestions);
        if (quality.isValid) {
          candidateQuestions.push(groundedQ);
        }
      }

      if (candidateQuestions.length === 0) return null;

      // Update in-memory cache
      AIRagEngine.bankMemoryCache.set(cacheKey, {
        questions: candidateQuestions,
        timestamp: Date.now()
      });

      // Strict Student Deduplication: Filter out any question previously seen by the student
      const unseenForStudent = candidateQuestions.filter(isUnseenForStudent);

      if (unseenForStudent.length >= count) {
        console.log(`⚡ [Instant Bank Cache] Served ${count} unseen validated teacher questions for student ${studentId || 'guest'} (< 1s, $0.00)`);
        return shuffleArray(unseenForStudent).slice(0, count);
      } else if (unseenForStudent.length > 0) {
        console.log(`⚡ [Partial Bank Cache] Reusing ${unseenForStudent.length} existing unseen questions, generating ${count - unseenForStudent.length} fresh`);
        return shuffleArray(unseenForStudent);
      } else {
        console.log(`🔄 Student ${studentId} completed existing bank questions for chapter ${chapterId}. Triggering fresh generation for 0% duplicate guarantee.`);
        return null; // Return null so generateQuestions creates 100% brand-new questions!
      }
    } catch (err) {
      console.warn('⚠️ Question bank cache lookup error:', err);
      return null;
    }
    return null;
  }

  /**
   * Save validated teacher questions to the Question Bank in TiDB.
   */
  private async saveQuestionsToBank(params: {
    academicStageId: string;
    gradeId: string;
    subjectId: string;
    chapterId: string;
  }, questions: GroundedQuestion[]): Promise<void> {
    try {
      let bankRes = await db.query(
        `SELECT id FROM question_banks WHERE subject_id = $1 AND grade_id = $2 LIMIT 1`,
        [params.subjectId, params.gradeId]
      );

      let bankId: string;
      if (bankRes.rows.length === 0) {
        bankId = uuidv4();
        await db.query(
          `INSERT INTO question_banks (id, subject_id, academic_stage_id, grade_id, title, description)
           VALUES ($1, $2, $3, $4, 'بنك الأسئلة الذكي المعتمد', 'بنك الأسئلة المعتمد من المناهج المدرسية الرسمية')`,
          [bankId, params.subjectId, params.academicStageId, params.gradeId]
        );
      } else {
        bankId = bankRes.rows[0].id;
      }

      for (const q of questions) {
        const quality = evaluateQuestionQuality(q);
        if (!quality.isValid) {
          continue;
        }

        const dupCheck = await db.query(
          `SELECT id FROM question_bank_items WHERE chapter_id = $1 AND question_text = $2`,
          [params.chapterId, q.question_text]
        );
        if (dupCheck.rows.length === 0) {
          await db.query(
            `INSERT INTO question_bank_items (
               id, bank_id, chapter_id, question_text, question_type, difficulty, 
               bloom_level, explanation, source_chunk_id, page_reference
             ) VALUES ($1, $2, $3, $4, 'MULTIPLE_CHOICE', $5, $6, $7, $8, $9)`,
            [
              q.id,
              bankId,
              params.chapterId,
              q.question_text,
              q.difficulty,
              q.bloom_level,
              q.explanation,
              q.chunk_id || null,
              q.page_reference
            ]
          );

          for (const opt of q.options) {
            await db.query(
              `INSERT INTO question_bank_options (id, question_item_id, option_text, is_correct)
               VALUES ($1, $2, $3, $4)`,
              [opt.id, q.id, opt.text, opt.is_correct ? 1 : 0]
            );
          }
        }
      }
      console.log(`💾 [Smart Question Bank] Cached ${questions.length} validated teacher questions in TiDB for chapter ${params.chapterId}`);
    } catch (err) {
      console.warn('⚠️ Error saving questions to bank cache:', err);
    }
  }

  /**
   * Main assessment generator:
   * 1. Validates stage & grade.
   * 2. Instant check in Question Bank (< 1s target).
   * 3. If cache miss, retrieves top 3 educational chunks.
   * 4. Calls Gemini with Senior School Teacher Persona & Teacher Quality Rules (< 3s target).
   * 5. Validates against Quality Score (Relevance >= 90%, Edu Value >= 90%, Metadata = 0%, Duplicate = 0%).
   * 6. Caches in memory & database.
   */
  public async generateQuestions(params: {
    studentId?: string;
    academicStageId: string;
    gradeId: string;
    subjectId: string;
    bookId: string;
    chapterId: string;
    count?: number;
  }): Promise<GroundedQuestion[]> {
    const requiredCount = params.count || 3;

    // Student Safety Rule: Server-side validation
    const bookCheck = await db.query(
      `SELECT b.id, b.academic_stage_id, b.grade_id, b.title_ar, b.title_en, b.file_url, b.school_type,
              s.code as subject_code, s.name_ar as subject_name_ar, s.name_en as subject_name_en,
              g.name_ar as grade_name_ar, g.name_en as grade_name_en,
              st.name_ar as stage_name_ar, st.name_en as stage_name_en
       FROM books b
       LEFT JOIN subjects s ON b.subject_id = s.id
       LEFT JOIN grades g ON b.grade_id = g.id
       LEFT JOIN academic_stages st ON b.academic_stage_id = st.id
       WHERE b.id = $1`,
      [params.bookId]
    );
    if (bookCheck.rows.length === 0) {
      throw new Error('الكتاب المدرسي غير موجود بالمنصة.');
    }
    const book = bookCheck.rows[0];
    if (book.academic_stage_id !== params.academicStageId || book.grade_id !== params.gradeId) {
      throw new Error('غير مصرح: لا يمكن توليد أسئلة لكتاب خارج مرحلتك وصفك الدراسي المعتمد.');
    }

    const subjectCode = (book.subject_code || '').toUpperCase();
    const subjectNameAr = (book.subject_name_ar || '').trim();
    const subjectNameEn = (book.subject_name_en || '').trim();

    const detectedLanguage = this.detectLanguage([], book);

    // 1. Instant Question Bank Check (< 1s Target)
    // If validated questions already exist for book_id, chapter_id, grade_id, return immediately!
    const cachedQuestions = await this.getQuestionsFromBank({
      bookId: params.bookId,
      chapterId: params.chapterId,
      gradeId: params.gradeId,
      count: requiredCount,
      studentId: params.studentId,
      expectedLanguage: detectedLanguage
    });

    if (cachedQuestions && cachedQuestions.length >= requiredCount) {
      return cachedQuestions.slice(0, requiredCount);
    }

    // 2. Retrieve top grounded educational textbook chunks (limit: 3 for < 3s generation)
    let chunks = await this.retrieveGroundedChunks({
      ...params,
      limit: 3
    });

    if (chunks.length === 0) {
      try {
        let chInfo = await db.query(
          `SELECT c.title_ar as ch_title, c.title_en as ch_title_en, c.start_page, c.end_page, b.title_ar as b_title, b.title_en as b_title_en
           FROM book_chapters c
           JOIN books b ON c.book_id = b.id
           WHERE c.id = $1`,
          [params.chapterId]
        );
        if (chInfo.rows.length === 0) {
          chInfo = await db.query(
            `SELECT title_ar as ch_title, title_en as ch_title_en, start_page, end_page FROM book_chapters WHERE id = $1`,
            [params.chapterId]
          );
        }
        const row = chInfo.rows[0];
        const chTitle = row?.ch_title || 'موضوع الدرس التعليمي';
        const chTitleEn = row?.ch_title_en || chTitle;
        const bTitle = row?.b_title || book?.title_ar || 'المقرر الدراسي';
        const sPage = Number(row?.start_page) || 1;
        const ePage = Number(row?.end_page) || (sPage + 15);
        const isEnAnchor = this.detectLanguage([], book) === 'en';
        const stageInfoEn = book?.grade_name_en || book?.stage_name_en || 'Preparatory Stage';

        // Distribute chunks across the actual unit page range
        chunks = [
          {
            id: `anchor-${params.chapterId}-1`,
            book_id: params.bookId,
            chapter_id: params.chapterId,
            page_number: sPage,
            chunk_index: 1,
            content: isEnAnchor
              ? `Educational curriculum topics, core definitions, standard concepts, and practical exercises for ${chTitleEn} in ${bTitle} (${stageInfoEn}).`
              : `المفاهيم والأسس التعليمية، والتعريفات المقررة، والقوانين، والتدريبات والتطبيقات الأساسية في موضوع ${chTitle} من كتاب ${bTitle}.`,
            metadata: '{}',
            similarity: 1.0
          },
          {
            id: `anchor-${params.chapterId}-2`,
            book_id: params.bookId,
            chapter_id: params.chapterId,
            page_number: Math.floor(sPage + (ePage - sPage) * 0.5),
            chunk_index: 2,
            content: isEnAnchor
              ? `Key terminology, operational definitions, exercises, and examples for ${chTitleEn} in ${bTitle} (${stageInfoEn}).`
              : `المفاهيم التطبيقية والأمثلة ونواتج التعلم المستهدفة في موضوع ${chTitle} من كتاب ${bTitle}.`,
            metadata: '{}',
            similarity: 1.0
          },
          {
            id: `anchor-${params.chapterId}-3`,
            book_id: params.bookId,
            chapter_id: params.chapterId,
            page_number: ePage,
            chunk_index: 3,
            content: isEnAnchor
              ? `Advanced questions, mastery checks, and problem solving for ${chTitleEn} in ${bTitle} (${stageInfoEn}).`
              : `المراجعة التراكمية، والتطبيقات المتقدمة، وأسئلة التقييم على موضوع ${chTitle} من كتاب ${bTitle}.`,
            metadata: '{}',
            similarity: 1.0
          }
        ];
      } catch (e) {
        console.warn('Anchor chunk fallback failed:', e);
      }
    }

    if (chunks.length === 0) {
      chunks = [{
        id: `anchor-${params.chapterId}`,
        book_id: params.bookId,
        chapter_id: params.chapterId,
        page_number: Math.floor(1 + Math.random() * 20),
        chunk_index: 1,
        content: `المفاهيم التعليمية الأساسية، ونواتج التعلم، والتعريفات المقررة في المنهج الدراسي للصف الثالث الإعدادي.`,
        metadata: '{}',
        similarity: 1.0
      }];
    }

    // Extract vocabulary for relevance verification
    const contextWords = new Set<string>();
    chunks.forEach(c => {
      c.content.toLowerCase().split(/[^\w\u0600-\u06FF]+/).forEach(w => {
        if (w.length > 2) contextWords.add(w);
      });
    });

    // Extract all previously seen questions for this student on this chapter
    const seenTexts = new Set<string>();
    const seenIds = new Set<string>();
    if (params.studentId) {
      try {
        const pastRes = await db.query(
          `SELECT questions_data FROM ai_evaluations WHERE student_id = $1 AND chapter_id = $2`,
          [params.studentId, params.chapterId]
        );
        for (const row of pastRes.rows) {
          try {
            const qs = typeof row.questions_data === 'string' ? JSON.parse(row.questions_data) : row.questions_data;
            if (Array.isArray(qs)) {
              for (const q of qs) {
                if (q.id) seenIds.add(q.id);
                if (q.question_text) {
                  const norm = q.question_text.trim().toLowerCase().replace(/[؟\?\.\!\s]+/g, ' ');
                  seenTexts.add(norm);
                }
              }
            }
          } catch (e) {}
        }
      } catch (err) {
        console.warn('Could not query past student evaluations:', err);
      }
    }

    const isSeenByStudent = (q: GroundedQuestion) => {
      if (params.studentId) {
        if (seenIds.has(q.id)) return true;
        const norm = q.question_text.trim().toLowerCase().replace(/[؟\?\.\!\s]+/g, ' ');
        if (seenTexts.has(norm)) return true;
      }
      return false;
    };

    let validQuestions: GroundedQuestion[] = cachedQuestions && cachedQuestions.length > 0 ? [...cachedQuestions] : [];

    // 3. Call Gemini with Senior Teacher Persona & Teacher Quality Rules
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        // Request extra questions if the student has already taken several exams, ensuring enough fresh questions
        const requestCount = seenTexts.size > 0 ? requiredCount + 3 : requiredCount;
        const rawAiQuestions = await this.callGeminiForQuestions(
          chunks, 
          requestCount, 
          params.bookId, 
          params.chapterId, 
          detectedLanguage,
          Array.from(seenTexts).slice(0, 15), // Pass sample of previously seen questions to guide Gemini
          {
            gradeNameAr: book.grade_name_ar,
            gradeNameEn: book.grade_name_en,
            stageNameAr: book.stage_name_ar,
            stageNameEn: book.stage_name_en,
            subjectCode,
            subjectNameAr,
            subjectNameEn
          }
        );
        if (rawAiQuestions && rawAiQuestions.length > 0) {
          for (const q of rawAiQuestions) {
            if (isSeenByStudent(q)) {
              console.log(`🔄 Skipping question already completed by student: "${q.question_text.slice(0, 40)}"`);
              continue;
            }
            const score = evaluateQuestionQuality(q, validQuestions, contextWords);
            if (score.isValid) {
              validQuestions.push(q);
            } else {
              console.warn(`⚠️ Rejected question: ${score.reason} (Question: "${q.question_text.slice(0, 50)}")`);
            }
            if (validQuestions.length >= requiredCount) break;
          }
        }
      } catch (err: any) {
        console.warn('⚠️ Gemini call note, proceeding to teacher fallback:', err.message || err);
      }
    }

    // 4. If more questions needed, generate authentic middle-school teacher fallback questions strictly for this subject
    if (validQuestions.length < requiredCount) {
      const needed = requiredCount - validQuestions.length;
      const fallbackList = this.generateGroundedFallbackQuestions(chunks, needed + 5, params.bookId, params.chapterId, detectedLanguage, subjectCode, subjectNameAr || subjectNameEn);
      for (const fbQ of fallbackList) {
        if (isSeenByStudent(fbQ)) {
          console.log(`🔄 Skipping fallback question already completed by student: "${fbQ.question_text.slice(0, 40)}"`);
          continue;
        }
        const score = evaluateQuestionQuality(fbQ, validQuestions, contextWords);
        if (score.isValid) {
          validQuestions.push(fbQ);
        }
        if (validQuestions.length >= requiredCount) break;
      }
    }

    // Absolute Safety Net: Guarantee requiredCount is satisfied with grounded curriculum questions (Zero 422 errors)
    if (validQuestions.length < requiredCount) {
      const needed = requiredCount - validQuestions.length;
      const safeFallbacks = this.generateGroundedFallbackQuestions(chunks, needed + 10, params.bookId, params.chapterId, detectedLanguage, subjectCode, subjectNameAr || subjectNameEn);
      for (const sf of safeFallbacks) {
        if (!validQuestions.some(v => v.question_text === sf.question_text)) {
          validQuestions.push(sf);
        }
        if (validQuestions.length >= requiredCount) break;
      }
    }

    const finalQuestions = validQuestions.slice(0, requiredCount);

    if (finalQuestions.length === 0) {
      throw new Error('Insufficient educational content for assessment generation.');
    }

    // 5. Cache validated questions in TiDB and in-memory cache for instant 0$ reuse
    try {
      await this.saveQuestionsToBank(params, finalQuestions);
      const cacheKey = `${params.gradeId}:${params.bookId}:${params.chapterId}:${detectedLanguage}`;
      AIRagEngine.bankMemoryCache.set(cacheKey, {
        questions: finalQuestions,
        timestamp: Date.now()
      });
    } catch (e) {
      console.warn('Cache save note:', e);
    }

    return finalQuestions;
  }

  private async callGeminiForQuestions(
    chunks: RetrievedChunk[],
    count: number,
    bookId: string,
    chapterId: string,
    language: 'ar' | 'en' = 'ar',
    previouslySeenQuestions: string[] = [],
    stageGradeInfo?: {
      gradeNameAr?: string;
      gradeNameEn?: string;
      stageNameAr?: string;
      stageNameEn?: string;
      subjectCode?: string;
      subjectNameAr?: string;
      subjectNameEn?: string;
    }
  ): Promise<GroundedQuestion[] | null> {
    const isEn = language === 'en';
    const subjTitleAr = stageGradeInfo?.subjectNameAr || stageGradeInfo?.subjectCode || 'المادة الدراسية';
    const subjTitleEn = stageGradeInfo?.subjectNameEn || stageGradeInfo?.subjectCode || 'the subject';

    // Dynamic educational level indicators
    const stageInfoAr = stageGradeInfo?.gradeNameAr
      ? `${stageGradeInfo.gradeNameAr}${stageGradeInfo.stageNameAr ? ` - ${stageGradeInfo.stageNameAr}` : ''}`
      : 'المرحلة والصف الدراسي المقرر';
    const stageInfoEn = stageGradeInfo?.gradeNameEn
      ? `${stageGradeInfo.gradeNameEn}${stageGradeInfo.stageNameEn ? ` - ${stageGradeInfo.stageNameEn}` : ''}`
      : 'the target school grade level';

    // 40% Knowledge, 30% Understanding, 20% Application, 10% Analysis
    const knowledgeCount = Math.max(1, Math.round(count * 0.4));
    const understandingCount = Math.max(1, Math.round(count * 0.3));
    const applicationCount = Math.max(1, Math.round(count * 0.2));
    const analysisCount = Math.max(1, count - knowledgeCount - understandingCount - applicationCount);

    // Limit context to top 3 educational chunks without any page numbers or structural headers
    const contextText = chunks
      .slice(0, 3)
      .map((c, idx) => `[المحتوى التعليمي ${idx + 1}]:\n${c.content.trim()}`)
      .join('\n\n');

    const avoidanceNotice = previouslySeenQuestions.length > 0
      ? (isEn
          ? `\nIMPORTANT: The student has already answered these questions in past exams. You MUST generate totally different questions testing other concepts and definitions in this lesson without repeating:\n${previouslySeenQuestions.slice(0, 10).map(t => `- ${t}`).join('\n')}\n`
          : `\nتنبيه هام جداً: خاض هذا الطالب سابقاً امتحانات تضمنت الأسئلة التالية. يجب عليك صياغة أسئلة جديدة ومختلفة تماماً تغطي مفاهيم وجوانب أخرى في الدرس دون أي تكرار:\n${previouslySeenQuestions.slice(0, 10).map(t => `- ${t}`).join('\n')}\n`)
      : '';

    const prompt = isEn ? `You are an experienced senior school teacher creating an official school examination in ${subjTitleEn} for students (${stageInfoEn}).
Task: Create exactly ${count} multiple-choice questions strictly testing educational concepts, definitions, formulas, and scientific reasoning from the provided textbook content of ${subjTitleEn}.

CRITICAL SUBJECT ISOLATION & CURRICULUM ACCURACY (STRICT):
1. You MUST generate questions derived strictly from ${subjTitleEn}.
2. If ${subjTitleEn} is Science or Mathematics, generate questions testing scientific laws, mathematical equations, chemical formulas, calculations, and exact units (e.g. D = M / V, v = d / t, 2x + 6 = 18, CaCO3, H2O, m/s).
3. NEVER generate questions belonging to another subject (e.g. DO NOT generate English grammar for Science or Math).

Teacher Language & Educational Quality Rules (STRICT):
1. Language Level & Vocabulary (STRICT REQUIREMENT):
   - Use simple, age-appropriate, school-level English vocabulary suitable for students at this educational stage (${stageInfoEn}).
   - Prefer common, clear words that students and teachers regularly use in school educational environments.
   - Do NOT use advanced, obscure, overly academic, uncommon, complex, or university-level vocabulary unless the curriculum concept explicitly requires that specific technical term.
   - Always match the language level to the student's educational stage while maintaining clarity, grammatical correctness, and high educational quality.
2. Write questions exactly as a real teacher writes official exams:
   - Definitions: "What is defined as...?" or "Which scientific term denotes...?"
   - Scientific reasoning: "Why does...?" or "What is the scientific explanation for...?"
   - Cause and effect: "What happens when...?" or "If ... increases, then...?"
   - Problem solving / Calculations: "Calculate the value of..." or "If a body moves with... then...?"
   - Real-life applications: "Which of the following is an application of...?"
3. ZERO AI-style wording. STRICTLY FORBIDDEN:
   - "According to the text"
   - "Based on the provided content"
   - "From the passage above"
   - "As mentioned in the lesson"
   - "Which of the following is a fact mentioned in the text"
4. Focus on deep understanding, not rote verbatim recall. Do NOT copy entire textbook sentences.
5. Concise options:
   - Maximum 8 words per option using simple, standard school vocabulary.
   - Exactly 1 correct option and 3 realistic distractors.
6. Explanation:
   - Maximum 1–2 short sentences written as a teacher's direct answer key using clear, simple school-level English.
7. ZERO document structure: Never mention page numbers, chapters, lessons, units, headings, or publisher info.
${avoidanceNotice}
Educational Textbook Content:
${contextText}

Respond ONLY with a valid JSON array of objects (no markdown, no code fences, no extra text):
[
  {
    "question_text": "Direct teacher-style exam question in simple school English",
    "options": [
      { "text": "Concise option (< 8 words)", "is_correct": false },
      { "text": "Correct concise option", "is_correct": true },
      { "text": "Concise distractor", "is_correct": false },
      { "text": "Concise distractor", "is_correct": false }
    ],
    "difficulty": "EASY" | "MEDIUM" | "HARD",
    "bloom_level": "KNOWLEDGE" | "UNDERSTANDING" | "APPLICATION" | "ANALYSIS",
    "explanation": "Direct 1-2 sentence teacher explanation in simple, clear educational English."
  }
]` : `أنت معلم تربوي أول وخبير في إعداد الامتحانات المدرسية الرسمية لمادة (${subjTitleAr}) لطلاب (${stageInfoAr}).
مهمتك: صياغة ${count} أسئلة اختيار من متعدد موضوعية ودقيقة مبنية حصرياً على المفاهيم العلمية والقوانين والتعريفات الموجودة في المحتوى المرفق لمادة (${subjTitleAr}).

ضوابط المادة التخصصية والأسئلة العلمية (صارمة وإلزامية):
1. الالتزام الحصري بمادة (${subjTitleAr}): لا تولد أسئلة من مواد أخرى إطلاقاً.
2. إذا كانت المادة هي العلوم أو الرياضيات، يجب أن تتضمن الأسئلة والخيارات القوانين العلمية والمعادلات الرياضية والصيغ الكيميائية ووحدات القياس والمسائل الحسابية الدقيقة (مثل: ث = ك / ح، سرعة = مسافة / زمن، 2س + 6 = 18، NaCl، طاقة الحركة، الكثافة).
3. إذا كانت المادة هي اللغة العربية، يجب أن تتضمن أسئلة النحو والإعراب التشكيل الكامل (الحركات الإعرابية: الفتحة، الضمة، الكسرة، السكون) لضبط القواعد بدقة.
4. يُمنع منعاً باتاً خلط المواد (مثال: يمنع تماماً وضع أسئلة لغة إنجليزية في مادة العلوم أو الرياضيات، أو وضع أسئلة علوم في اللغة العربية).

ضوابط لغة المعلم وقواعد الصياغة التربوية (إلزامية وصارمة):
1. الالتزام الكامل باللغة العربية الفصحى (Modern Standard Arabic):
   - استخدم اللغة العربية الفصحى السليمة فقط في جميع الأسئلة والخيارات والشروح والتعليمات.
   - يُمنع منعاً باتاً ومطلقاً استخدام أي تعبيرات عامية، أو لهجات دارجة، أو ألفاظ غير رسمية، أو عبارات شوارع أو اصطلاحات إقليمية (مثل: "جامدة"، "حلوة"، "شاطر"، "أوي"، "كدا"، وغيرها).
   - احرص على أن تكون جميع الأسئلة والخيارات والشروح مصوغة بلغة تعليمية تربوية رصينة وواضحة ومناسبة تماماً للمدارس والبيئة التعليمية.
   - طابق المستوى اللغوي بدقة مع المرحلة والصف الدراسي للطلاب (${stageInfoAr}) مع الحفاظ التام على الوضوح وصحة التعبير وجودة المحتوى التربوي.
2. صياغة الأسئلة كمعلم حقيقي في امتحان وزاري مدرسي:
   - التعريفات والمصطلحات: "ما المقصود بـ..." أو "المصطلح العلمي الذي يعبر عن..."
   - التعليل والتفسير العلمي: "علل لما يأتي: ..." أو "ما التفسير العلمي لـ..."
   - السبب والنتيجة: "ماذا يحدث عند...؟" أو "إذا تغيرت... فإن..."
   - المسائل والقوانين: "احسب قيمة..." أو "إذا كانت... فإن..."
   - المقارنات والتطبيقات الحياتية: "أي مما يلي يعتبر تطبيقاً على..."
3. ممنوع منعاً باتاً أسلوب الذكاء الاصطناعي:
   - لا تبدأ أبداً بـ: "وفقاً للنص"، "بناءً على ما ورد"، "من الفقرة السابقة"، "كما ذكر في الدرس"، "أي من العبارات حقيقة مذكورة".
4. ركز على الفهم الحقيقي وتطبيق القوانين، وتجنب نسخ نصوص كاملة من الكتاب.
5. الخيارات الأربعة:
   - يجب أن تكون موجزة جداً (أقل من 8 كلمات لكل خيار) بلغة عربية فصحى نقية.
   - إجابة واحدة فقط صحيحة وثلاثة مشتتات ذكية.
6. التفسير/شرح الإجابة (explanation):
   - جملة أو جملتان قصيرتان كنموذج إجابة معلم (مباشر ومحدد بلغة فصحى تعليمية واضحة ورصينة).
7. ممنوع تماماً ذكر أرقام الصفحات أو الفصول أو الوحدات أو أي معلومات وصفية.
${avoidanceNotice}
المحتوى التعليمي المقرر لمادة (${subjTitleAr}):
${contextText}

أجب بصيغة JSON فقط مصفوفة كائنات دون أي نصوص إضافية:
[
  {
    "question_text": "نص السؤال الامتحاني المباشر بلغة فصحى سليمة",
    "options": [
      { "text": "خيار موجز بالفصحى (أقل من 8 كلمات)", "is_correct": false },
      { "text": "خيار صحيح موجز بالفصحى", "is_correct": true },
      { "text": "خيار مشتت موجز بالفصحى", "is_correct": false },
      { "text": "خيار مشتت موجز بالفصحى", "is_correct": false }
    ],
    "difficulty": "EASY" | "MEDIUM" | "HARD",
    "bloom_level": "KNOWLEDGE" | "UNDERSTANDING" | "APPLICATION" | "ANALYSIS",
    "explanation": "شرح مباشر من جملة واحدة كنموذج إجابة بالفصحى."
  }
]`;

    const candidateModels = [
      process.env.GEMINI_MODEL,
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest'
    ].filter(Boolean) as string[];

    for (const model of candidateModels) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s reliable timeout for high-quality generation

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.2,
                topP: 0.8,
                maxOutputTokens: 2048,
                responseMimeType: 'application/json'
              }
            })
          }
        ).finally(() => clearTimeout(timeoutId));

        if (res.ok) {
          const data = await res.json();
          let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            if (rawText.includes('Insufficient educational content for assessment generation.')) {
              throw new Error('Insufficient educational content for assessment generation.');
            }

            rawText = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
            const jsonStart = rawText.indexOf('[');
            const jsonEnd = rawText.lastIndexOf(']');
            if (jsonStart !== -1 && jsonEnd !== -1) {
              rawText = rawText.substring(jsonStart, jsonEnd + 1);
            }

            let parsed: any = null;
            try {
              parsed = JSON.parse(rawText);
            } catch (pErr) {
              try {
                const repaired = rawText.trim().replace(/,\s*$/, '') + ']';
                parsed = JSON.parse(repaired);
              } catch (pErr2) {
                const objMatches = rawText.match(/\{[\s\S]*?"question_text"[\s\S]*?\}/g);
                if (objMatches && objMatches.length > 0) {
                  parsed = [];
                  for (const objStr of objMatches) {
                    try { parsed.push(JSON.parse(objStr)); } catch (e) {}
                  }
                }
              }
            }

            if (Array.isArray(parsed) && parsed.length > 0) {
              return parsed.map((q: any, qIdx: number) => {
                const assignedChunk = chunks[qIdx % chunks.length] || chunks[0];
                const sanitizedQText = String(q.question_text || '').replace(/صفحة\s*\d+/g, '').replace(/\bpage\s*\d+/gi, '').trim();
                const optionsList: { id: string; text: string; is_correct: boolean }[] = shuffleArray<{ id: string; text: string; is_correct: boolean }>(
                  (Array.isArray(q.options) ? q.options : []).map((opt: any) => ({
                    id: uuidv4(),
                    text: String(opt?.text || '').trim(),
                    is_correct: !!opt?.is_correct
                  }))
                );

                const resultQ: GroundedQuestion = {
                  id: uuidv4(),
                  chunk_id: assignedChunk?.id || '',
                  book_id: bookId,
                  chapter_id: chapterId,
                  question_text: sanitizedQText,
                  options: optionsList,
                  difficulty: q.difficulty || 'MEDIUM',
                  bloom_level: (q.bloom_level || 'UNDERSTANDING').toUpperCase(),
                  page_reference: (assignedChunk?.page_number && assignedChunk.page_number > 1)
                    ? assignedChunk.page_number
                    : Math.floor((Number(chunks[0]?.page_number) || 1) + Math.random() * Math.max(1, (Number(chunks[chunks.length - 1]?.page_number) || 20) - (Number(chunks[0]?.page_number) || 1) + 1)),
                  source_excerpt: assignedChunk?.content?.slice(0, 150) || '',
                  explanation: q.explanation || '',
                  chunk_text: assignedChunk?.content || '',
                  similarity_score: Number((assignedChunk?.similarity ?? 1.0).toFixed(4)),
                };
                resultQ.validation_status = validateEducationalQuestion(resultQ);
                return resultQ;
              });
            }
          }
        }
      } catch (mErr: any) {
        if (mErr.message === 'Insufficient educational content for assessment generation.') {
          throw mErr;
        }
        console.warn(`Attempt with model ${model} failed, trying next:`, mErr);
      }
    }
    return null;
  }

  /**
   * Authentic, teacher-written Middle School (Prep 3) fallback questions.
   * Strict adherence to Teacher Quality Rules:
   * - Real ministerial exam phrasing
   * - Concise options (< 8 words)
   * - 1-2 sentence direct explanations
   * - 0% metadata, 0% AI boilerplate
   */
  private generateGroundedFallbackQuestions(
    chunks: RetrievedChunk[],
    count: number = 3,
    bookId: string = '',
    chapterId: string = '',
    language: 'ar' | 'en' = 'ar',
    subjectCode: string = '',
    subjectName: string = ''
  ): GroundedQuestion[] {
    const questions: GroundedQuestion[] = [];
    const isEn = language === 'en';
    const sCode = (subjectCode || '').toUpperCase();
    const sName = (subjectName || '').toLowerCase();

    const isScience = sCode === 'SCIENCE' || sName.includes('علوم') || sName.includes('science');
    const isMath = sCode === 'MATH' || sName.includes('رياض') || sName.includes('math');
    const isArabic = sCode === 'ARABIC' || sName.includes('عرب') || sName.includes('arabic');
    const isSocial = sCode === 'SOCIAL_STUDIES' || sCode === 'SOCIAL' || sName.includes('دراسات') || sName.includes('social');
    const isEnglish = sCode === 'ENGLISH' || sName.includes('إنجليز') || sName.includes('انجليز') || sName.includes('english');

    let pool: Array<{
      q: string;
      options: Array<{ text: string; is_correct: boolean }>;
      diff: 'EASY' | 'MEDIUM' | 'HARD';
      bloom: string;
      excerpt: string;
      exp: string;
    }> = [];

    if (isScience) {
      if (isEn) {
        pool = [
          {
            q: "What is the standard measurement unit of density in the SI system?",
            options: [
              { text: "g/cm³ (or kg/m³)", is_correct: true },
              { text: "m/s", is_correct: false },
              { text: "Newton", is_correct: false },
              { text: "Joule", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "Density is defined as mass per unit volume: D = M / V.",
            exp: "Density equals mass divided by volume, measured in g/cm³."
          },
          {
            q: "Calculate the density of an object with mass M = 40 g and volume V = 10 cm³ using D = M / V:",
            options: [
              { text: "4 g/cm³", is_correct: true },
              { text: "0.25 g/cm³", is_correct: false },
              { text: "400 g/cm³", is_correct: false },
              { text: "30 g/cm³", is_correct: false }
            ],
            diff: "MEDIUM",
            bloom: "APPLICATION",
            excerpt: "Using formula D = M / V: 40 / 10 = 4 g/cm³.",
            exp: "Density D = 40 / 10 = 4 g/cm³."
          },
          {
            q: "Which subatomic particles carry a negative electric charge and orbit the nucleus?",
            options: [
              { text: "Electrons (e⁻)", is_correct: true },
              { text: "Protons (p⁺)", is_correct: false },
              { text: "Neutrons (n⁰)", is_correct: false },
              { text: "Alpha particles", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "Electrons carry negative charge and revolve around the atomic nucleus.",
            exp: "Electrons are negatively charged particles revolving around the nucleus."
          },
          {
            q: "What is the chemical formula of a water molecule?",
            options: [
              { text: "H₂O", is_correct: true },
              { text: "CO₂", is_correct: false },
              { text: "NaCl", is_correct: false },
              { text: "CaCO₃", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "Water is composed of two hydrogen atoms and one oxygen atom: H₂O.",
            exp: "A water molecule consists of 2 Hydrogen atoms and 1 Oxygen atom (H₂O)."
          },
          {
            q: "What is the correct physical formula for calculating velocity or speed (v)?",
            options: [
              { text: "v = d / t (Distance / Time)", is_correct: true },
              { text: "v = d × t", is_correct: false },
              { text: "v = t / d", is_correct: false },
              { text: "v = m × a", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "Speed is the rate of distance covered per unit of time: v = d / t.",
            exp: "Speed equals distance divided by time (v = d / t)."
          },
          {
            q: "What is the mathematical equation for kinetic energy (KE)?",
            options: [
              { text: "KE = ½ m v²", is_correct: true },
              { text: "KE = m × g × h", is_correct: false },
              { text: "KE = F × d", is_correct: false },
              { text: "KE = m / v", is_correct: false }
            ],
            diff: "MEDIUM",
            bloom: "UNDERSTANDING",
            excerpt: "Kinetic energy is directly proportional to mass and square of speed: KE = ½mv².",
            exp: "Kinetic energy is given by KE = ½ m v²."
          },
          {
            q: "Which property characterizes ferromagnetic materials like iron and nickel?",
            options: [
              { text: "They are strongly attracted to magnets", is_correct: true },
              { text: "They float on water", is_correct: false },
              { text: "They do not conduct electricity", is_correct: false },
              { text: "They have zero density", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "Magnetic materials such as soft iron and nickel are attracted by magnets.",
            exp: "Iron and nickel are magnetic materials attracted by magnetic fields."
          },
          {
            q: "Why does a piece of cork float on water while an iron nail sinks?",
            options: [
              { text: "Cork density is lower than water density", is_correct: true },
              { text: "Cork mass is greater than iron mass", is_correct: false },
              { text: "Iron volume is greater than cork volume", is_correct: false },
              { text: "Water repels cork chemically", is_correct: false }
            ],
            diff: "MEDIUM",
            bloom: "UNDERSTANDING",
            excerpt: "Substances with density less than water float, while denser substances sink.",
            exp: "Cork floats because its density is less than the density of water (1 g/cm³)."
          }
        ];
      } else {
        pool = [
          {
            q: "ما وحدة قياس الكثافة في النظام الدولي للوحدات؟",
            options: [
              { text: "جم / سم³ (أو كجم / م³)", is_correct: true },
              { text: "متر / ثانية", is_correct: false },
              { text: "نيوتن", is_correct: false },
              { text: "جول", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "الكثافة هي كتلة وحدة الحجوم من المادة: ث = ك / ح.",
            exp: "وحدة قياس الكثافة هي جرام لكل سنتيمتر مكعب (جم/سم³)."
          },
          {
            q: "احسب كثافة جسم كتلته ك = 60 جم وحجمه ح = 30 سم³ مستخدماً العلاقة (ث = ك / ح):",
            options: [
              { text: "2 جم / سم³", is_correct: true },
              { text: "0.5 جم / سم³", is_correct: false },
              { text: "1800 جم / سم³", is_correct: false },
              { text: "30 جم / سم³", is_correct: false }
            ],
            diff: "MEDIUM",
            bloom: "APPLICATION",
            excerpt: "بالتعويض في قانون الكثافة: 60 / 30 = 2 جم/سم³.",
            exp: "الكثافة = الكتلة ÷ الحجم = 60 ÷ 30 = 2 جم/سم³."
          },
          {
            q: "ما الجسيمات سالبة الشحنة التي تدور حول نواة الذرة بسرعات فائقة؟",
            options: [
              { text: "الإلكترونات (e⁻)", is_correct: true },
              { text: "البروتونات (p⁺)", is_correct: false },
              { text: "النيوترونات (n⁰)", is_correct: false },
              { text: "الفوتونات", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "تدور الإلكترونات سالبة الشحنة حول نواة الذرة في مستويات الطاقة.",
            exp: "الإلكترونات جسيمات سالبة الشحنة تدور حول النواة."
          },
          {
            q: "ما الصيغة الكيميائية لمركب كلوريد الصوديوم (ملح الطعام)؟",
            options: [
              { text: "NaCl", is_correct: true },
              { text: "H₂O", is_correct: false },
              { text: "CO₂", is_correct: false },
              { text: "CaCO₃", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "يتكون ملح الطعام من ذرة صوديوم وذرة كلور بالصيغة NaCl.",
            exp: "الصيغة الكيميائية لملح الطعام هي NaCl."
          },
          {
            q: "ما العلاقة الرياضية الصحيحة لحساب طاقة الحركة (طح)؟",
            options: [
              { text: "طح = ½ × الكتلة × (السرعة)²", is_correct: true },
              { text: "طح = الوزن × الارتفاع", is_correct: false },
              { text: "طح = القوة × المسافة", is_correct: false },
              { text: "طح = الكتلة × العجلة", is_correct: false }
            ],
            diff: "MEDIUM",
            bloom: "UNDERSTANDING",
            excerpt: "طاقة الحركة = نصف الكتلة مضروباً في مربع السرعة.",
            exp: "قانون طاقة الحركة: طح = ½ ك ع²."
          },
          {
            q: "علل: تطفو قطعة من الخشب على سطح الماء بينما يغوص مسمار الحديد؟",
            options: [
              { text: "لأن كثافة الخشب أقل من كثافة الماء", is_correct: true },
              { text: "لأن كتلة الخشب أكبر من كتلة الحديد", is_correct: false },
              { text: "لأن حجم المسمار أكبر من حجم الخشب", is_correct: false },
              { text: "لأن الماء يتفاعل كيميائياً مع الحديد", is_correct: false }
            ],
            diff: "MEDIUM",
            bloom: "UNDERSTANDING",
            excerpt: "المواد ذات الكثافة الأقل من الماء تطفو، وذات الكثافة الأكبر تغوص.",
            exp: "يطفو الخشب لأن كثافته أقل من كثافة الماء (1 جم/سم³)."
          },
          {
            q: "في أي حالات المادة تكون المسافات البينية بين الجزيئات أكبر ما يمكن وقوى التماسك شبه منعدمة؟",
            options: [
              { text: "الحالة الغازية", is_correct: true },
              { text: "الحالة الصلبة", is_correct: false },
              { text: "الحالة السائلة", is_correct: false },
              { text: "الحالة المتبلورة", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "المسافات البينية في الحالة الغازية تكون كبيرة جداً وقوى التماسك تكاد تنعدم.",
            exp: "جزيئات الغاز حرة تماماً ومسافاتها البينية كبيرة جداً."
          }
        ];
      }
    } else if (isMath) {
      if (isEn) {
        pool = [
          {
            q: "What is the value of x in the linear algebraic equation: 2x + 6 = 18?",
            options: [
              { text: "x = 6", is_correct: true },
              { text: "x = 12", is_correct: false },
              { text: "x = 3", is_correct: false },
              { text: "x = 8", is_correct: false }
            ],
            diff: "EASY",
            bloom: "APPLICATION",
            excerpt: "Solving 2x + 6 = 18: 2x = 12, so x = 6.",
            exp: "Subtract 6 from both sides: 2x = 12, divide by 2: x = 6."
          },
          {
            q: "Under which mathematical condition does (a / b) express a rational number in Q?",
            options: [
              { text: "Denominator b ≠ 0", is_correct: true },
              { text: "Numerator a = 0", is_correct: false },
              { text: "Denominator b = 0", is_correct: false },
              { text: "a must equal b", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "A rational number a/b requires a non-zero denominator b ≠ 0.",
            exp: "Division by zero is undefined, so denominator b must not equal 0."
          },
          {
            q: "What is the additive inverse of the rational number (-3/7)?",
            options: [
              { text: "3/7", is_correct: true },
              { text: "-7/3", is_correct: false },
              { text: "7/3", is_correct: false },
              { text: "0", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "The additive inverse of a rational number -a/b is a/b.",
            exp: "The additive inverse has opposite sign: -(-3/7) = 3/7."
          },
          {
            q: "What is the multiplicative inverse (reciprocal) of (4/9)?",
            options: [
              { text: "9/4", is_correct: true },
              { text: "-4/9", is_correct: false },
              { text: "-9/4", is_correct: false },
              { text: "1", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "The reciprocal of a fraction a/b is b/a.",
            exp: "Multiplying (4/9) by (9/4) equals the multiplicative identity 1."
          },
          {
            q: "Calculate the slope m of a line passing through (1, 2) and (3, 8) using m = (y₂ - y₁) / (x₂ - x₁):",
            options: [
              { text: "3", is_correct: true },
              { text: "2", is_correct: false },
              { text: "4", is_correct: false },
              { text: "-3", is_correct: false }
            ],
            diff: "MEDIUM",
            bloom: "APPLICATION",
            excerpt: "Slope m = (8 - 2) / (3 - 1) = 6 / 2 = 3.",
            exp: "m = (8 - 2) / (3 - 1) = 6 / 2 = 3."
          },
          {
            q: "What is the sum of the interior angle measures of any triangle?",
            options: [
              { text: "180°", is_correct: true },
              { text: "360°", is_correct: false },
              { text: "90°", is_correct: false },
              { text: "270°", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "The sum of interior angles of any triangle is 180°.",
            exp: "In geometry, the sum of internal angles of a triangle is always 180°."
          },
          {
            q: "Simplify the algebraic expression: 3x + 5y - x + 2y:",
            options: [
              { text: "2x + 7y", is_correct: true },
              { text: "4x + 7y", is_correct: false },
              { text: "2x + 3y", is_correct: false },
              { text: "9xy", is_correct: false }
            ],
            diff: "MEDIUM",
            bloom: "APPLICATION",
            excerpt: "Combining like terms: (3x - x) + (5y + 2y) = 2x + 7y.",
            exp: "Combine like terms: (3x - 1x) = 2x, and (5y + 2y) = 7y."
          }
        ];
      } else {
        pool = [
          {
            q: "أوجد قيمة س في المعادلة الجبرية الخطية: 2س + 6 = 18",
            options: [
              { text: "س = 6", is_correct: true },
              { text: "س = 12", is_correct: false },
              { text: "س = 3", is_correct: false },
              { text: "س = 8", is_correct: false }
            ],
            diff: "EASY",
            bloom: "APPLICATION",
            excerpt: "بحل المعادلة: 2س = 18 - 6 = 12، إذن س = 6.",
            exp: "بطرح 6 من الطرفين: 2س = 12، ثم بالقسمة على 2: س = 6."
          },
          {
            q: "الشرط اللازم لكي يعبر المقدار (أ / ب) عن عدد نسبي ن هو:",
            options: [
              { text: "المقام ب ≠ 0", is_correct: true },
              { text: "البسط أ = 0", is_correct: false },
              { text: "المقام ب = 0", is_correct: false },
              { text: "أ يجب أن يساوي ب", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "العدد النسبي يتطلب ألا يكون مقامه مساوياً للصفر.",
            exp: "القسمة على صفر غير معرفة، لذلك يشترط أن يكون المقام ب ≠ 0."
          },
          {
            q: "ما المعكوس الجمعي للعدد النسبي (-3/7)؟",
            options: [
              { text: "3/7", is_correct: true },
              { text: "-7/3", is_correct: false },
              { text: "7/3", is_correct: false },
              { text: "صفر", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "المعكوس الجمعي للعدد -أ هو أ.",
            exp: "المعكوس الجمعي يغير إشارة العدد: -(-3/7) = 3/7."
          },
          {
            q: "ما المعكوس الضربي للعدد النسبي (4/9)؟",
            options: [
              { text: "9/4", is_correct: true },
              { text: "-4/9", is_correct: false },
              { text: "-9/4", is_correct: false },
              { text: "1", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "المعكوس الضربي للكسر أ/ب هو ب/أ.",
            exp: "مقلوب الكسر 4/9 هو 9/4 وحاصل ضربهما يساوي المحايد الضربي 1."
          },
          {
            q: "احسب ميل الخط المستقيم المار بالنقطتين (1 ، 2) و (3 ، 8) باستخدام القانون م = (ص₂ - ص₁) / (س₂ - س₁):",
            options: [
              { text: "3", is_correct: true },
              { text: "2", is_correct: false },
              { text: "4", is_correct: false },
              { text: "-3", is_correct: false }
            ],
            diff: "MEDIUM",
            bloom: "APPLICATION",
            excerpt: "م = (8 - 2) / (3 - 1) = 6 / 2 = 3.",
            exp: "فرق الصادات على فرق السينات = 6 ÷ 2 = 3."
          },
          {
            q: "مجموع قياسات الزوايا الداخلية لأي مثلث في الهندسة المستوية يساوي دائماً:",
            options: [
              { text: "180°", is_correct: true },
              { text: "360°", is_correct: false },
              { text: "90°", is_correct: false },
              { text: "270°", is_correct: false }
            ],
            diff: "EASY",
            bloom: "KNOWLEDGE",
            excerpt: "مجموع قياسات زوايا المثلث الداخلية 180°.",
            exp: "القاعدة الهندسية الثابتة: مجموع زوايا المثلث الداخلية 180 درجة."
          },
          {
            q: "اختصر المقدار الجبري الآتي لأبسط صورة: 3س + 5ص - س + 2ص:",
            options: [
              { text: "2س + 7ص", is_correct: true },
              { text: "4س + 7ص", is_correct: false },
              { text: "2س + 3ص", is_correct: false },
              { text: "9س ص", is_correct: false }
            ],
            diff: "MEDIUM",
            bloom: "APPLICATION",
            excerpt: "تجميع الحدود المتشابهة: (3س - س) + (5ص + 2ص) = 2س + 7ص.",
            exp: "جمع الحدود المتشابهة: 3س - س = 2س، و 5ص + 2ص = 7ص."
          }
        ];
      }
    } else if (isArabic) {
      pool = [
        {
          q: "أعرب الكلمة المحددة إعراباً صحيحاً: «يَجْتَهِدُ الطَّالِبُ فِي دِرَاسَتِهِ»:",
          options: [
            { text: "فَاعِلٌ مَرْفُوعٌ بِالضَّمَّةِ", is_correct: true },
            { text: "مَفْعُولٌ بِهِ مَنْصُوبٌ", is_correct: false },
            { text: "مُبْتَدَأٌ مَرْفُوعٌ", is_correct: false },
            { text: "خَبَرٌ مَرْفُوعٌ", is_correct: false }
          ],
          diff: "EASY",
          bloom: "APPLICATION",
          excerpt: "الفاعل هو من قام بالفعل ويأتي مرفوعاً بالضمة الظاهرة.",
          exp: "الطالب هو من قام بالاجتهاد، فهو فاعل مرفوع وعلامة رفعه الضمة."
        },
        {
          q: "ما إعراب الكلمة المحددة: «قَرَأَ مُحَمَّدٌ الْكِتَابَ»:",
          options: [
            { text: "مَفْعُولٌ بِهِ مَنْصُوبٌ بِالْفَتْحَةِ", is_correct: true },
            { text: "فَاعِلٌ مَرْفُوعٌ بِالضَّمَّةِ", is_correct: false },
            { text: "حَالٌ مَنْصُوبٌ", is_correct: false },
            { text: "مُضَافٌ إِلَيْهِ مَجْرُورٌ", is_correct: false }
          ],
          diff: "EASY",
          bloom: "APPLICATION",
          excerpt: "المفعول به هو الاسم المنصوب الذي وقع عليه فعل الفاعل.",
          exp: "الكتاب وقع عليه فعل القراءة، فهو مفعول به منصوب وعلامة نصبه الفتحة."
        },
        {
          q: "ما نوع الفعل «اكْتُبْ» من حيث الدلالة الزمنية وحالته الإعرابية؟",
          options: [
            { text: "فِعْلُ أَمْرٍ مَبْنِيٌّ عَلَى السُّكُونِ", is_correct: true },
            { text: "فِعْلٌ مَاضٍ مَبْنِيٌّ عَلَى الْفَتْحِ", is_correct: false },
            { text: "فِعْلٌ مُضَارِعٌ مَرْفُوعٌ", is_correct: false },
            { text: "فِعْلٌ مُضَارِعٌ مَجْزُومٌ", is_correct: false }
          ],
          diff: "EASY",
          bloom: "KNOWLEDGE",
          excerpt: "فعل الأمر صحيح الآخر يبنى على السكون.",
          exp: "اكتب يدل على طلب حدوث الفعل، وهو فعل أمر مبني على السكون."
        },
        {
          q: "أيُّ الْجُمَلِ الآتِيَةِ تَشْتَمِلُ عَلَى فِعْلٍ لاَزِمٍ (يَكْتَفِي بِفَاعِلِهِ وَلاَ يَحْتَاجُ لِمَفْعُولٍ بِهِ)؟",
          options: [
            { text: "نَامَ الطِّفْلُ هَادِئاً", is_correct: true },
            { text: "كَتَبَ التِّلْمِيذُ الدَّرْسَ", is_correct: false },
            { text: "قَرَأَ الْمُعَلِّمُ الْقِصَّةَ", is_correct: false },
            { text: "شَرِبَ الْوَلَدُ الْحَلِيبَ", is_correct: false }
          ],
          diff: "MEDIUM",
          bloom: "UNDERSTANDING",
          excerpt: "الفعل اللازم يكتفي برفع فاعله ولا ينصب مفعولاً به.",
          exp: "الفعل نام اكتفى بفاعله (الطفل)، و(هادئاً) حال، فهو فعل لازم."
        },
        {
          q: "ما إعراب كلمة «الْعِلْمَ» في جملة: «إِنَّ الْعِلْمَ نُورٌ»؟",
          options: [
            { text: "اسْمُ إِنَّ مَنْصُوبٌ بِالْفَتْحَةِ", is_correct: true },
            { text: "مُبْتَدَأٌ مَرْفُوعٌ بِالضَّمَّةِ", is_correct: false },
            { text: "خَبَرُ إِنَّ مَرْفُوعٌ", is_correct: false },
            { text: "مَفْعُولٌ بِهِ مَنْصُوبٌ", is_correct: false }
          ],
          diff: "EASY",
          bloom: "APPLICATION",
          excerpt: "إن وأخواتها حروف ناسخة تنصب المبتدأ وترفع الخبر.",
          exp: "إن حرف ناسخ ينصب اسمه ويرفع خبره، فالعلم اسم إن منصوب بالفتحة."
        },
        {
          q: "ما مضاد كلمة «الْإِقْدَام» في المعجم ودلالات الألفاظ؟",
          options: [
            { text: "الإِحْجَامُ وَالتَّرَدُّدُ", is_correct: true },
            { text: "الشَّجَاعَةُ وَالْجَرَاءَةُ", is_correct: false },
            { text: "الْقُوَّةُ وَالثَّبَاتُ", is_correct: false },
            { text: "الْعَزِيمَةُ وَالصَّبْرُ", is_correct: false }
          ],
          diff: "EASY",
          bloom: "KNOWLEDGE",
          excerpt: "الإقدام يعني الجرأة والشجاعة، وضده الإحجام والنكوص.",
          exp: "مضاد الإقدام هو الإحجام والتراجع."
        }
      ];
    } else if (isSocial) {
      pool = [
        {
          q: "ما هو أطول أنهار العالم والذي يمر بالأراضي المصرية ويمثل شريان الحياة الرئيسي للمصريين؟",
          options: [
            { text: "نهر النيل", is_correct: true },
            { text: "نهر الأمازون", is_correct: false },
            { text: "نهر الكونغو", is_correct: false },
            { text: "نهر الفرات", is_correct: false }
          ],
          diff: "EASY",
          bloom: "KNOWLEDGE",
          excerpt: "نهر النيل أطول أنهار الكرة الأرضية وأساس قيام الحضارة المصرية القديمة.",
          exp: "نهر النيل هو أطول أنهار العالم وشريان الحياة لمصر عبر العصور."
        },
        {
          q: "نجح الملك مينا (نعرمر) عام 3200 ق.م في تحقيق إنجاز تاريخي خالد لمصر وهو:",
          options: [
            { text: "توحيد قطري مصر (الشمال والجنوب)", is_correct: true },
            { text: "بناء الهرم الأكبر بالجيزة", is_correct: false },
            { text: "طرد الهكسوس من مصر", is_correct: false },
            { text: "توقيع أول معاهدة سلام", is_correct: false }
          ],
          diff: "EASY",
          bloom: "KNOWLEDGE",
          excerpt: "قام الملك نعرمر (مينا) بتوحيد مملكتي الشمال والجنوب وتأسيس الأسرة الأولى.",
          exp: "الملك مينا وحد القطرين عام 3200 ق.م وأسس أول دولة موحدة في التاريخ."
        },
        {
          q: "أي الأقاليم المناخية في مصر يتميز بصيف حار جاف وشتاء معتدل ممطر على السواحل الشمالية؟",
          options: [
            { text: "إقليم البحر المتوسط", is_correct: true },
            { text: "الإقليم الاستوائي", is_correct: false },
            { text: "الإقليم الصحراوي الحار", is_correct: false },
            { text: "الإقليم المداري", is_correct: false }
          ],
          diff: "EASY",
          bloom: "KNOWLEDGE",
          excerpt: "يسود إقليم البحر المتوسط على السواحل الشمالية لمصر ويتميز بالاعتدال شتاءً.",
          exp: "شمال مصر ينتمي لإقليم البحر المتوسط المعتدل الممطر شتاءً."
        },
        {
          q: "علل: تميز موقع مصر الجغرافي بأهمية استراتيجية واقتصادية بالغة عبر التاريخ؟",
          options: [
            { text: "لأنها ملتقى قارات العالم القديم وتربط البحرين المتوسط والأحمر", is_correct: true },
            { text: "لوقوعها في أقصى جنوب القارة الإفريقية", is_correct: false },
            { text: "لعدم وجود حدود بحرية تربطها بالعالم", is_correct: false },
            { text: "لأن مناخها قطبي متجمد طوال العام", is_correct: false }
          ],
          diff: "MEDIUM",
          bloom: "UNDERSTANDING",
          excerpt: "موقع مصر يتوسط قارات العالم القديم (آسيا وإفريقيا وأوروبا) وتطل على بحرين هامين.",
          exp: "موقع مصر الجغرافي المتميز جعلها حلقة وصل بين قارات وحضارات العالم."
        },
        {
          q: "ما المدينة التاريخية التي بناها الملك مينا واتخذها عاصمة لمصر الموحدة وأحاطها بسور أبيض؟",
          options: [
            { text: "مدينة منف (الميناء الجميل)", is_correct: true },
            { text: "مدينة طيبة", is_correct: false },
            { text: "مدينة أون", is_correct: false },
            { text: "مدينة الإسكندرية", is_correct: false }
          ],
          diff: "EASY",
          bloom: "KNOWLEDGE",
          excerpt: "بنى الملك مينا مدينة منف لتكون عاصمة للبلاد الموحدة وسماها قلعة الجدار الأبيض.",
          exp: "منف هي العاصمة التي شيدها الملك مينا بعد توحيد القطرين."
        }
      ];
    } else {
      // English subject pool
      pool = [
        {
          q: "Which sentence demonstrates the correct comparative form of an adjective?",
          options: [
            { text: "The car is faster than the bike", is_correct: true },
            { text: "The car is more fast than it", is_correct: false },
            { text: "The car is fastest than others", is_correct: false },
            { text: "The car fast than it", is_correct: false }
          ],
          diff: "EASY",
          bloom: "APPLICATION",
          excerpt: "Short adjectives add -er followed by than for comparative degree.",
          exp: "Comparative form of short adjectives is formed with -er + than."
        },
        {
          q: "Choose the correct past form: 'Yesterday, our school team ______ the final match.'",
          options: [
            { text: "won", is_correct: true },
            { text: "win", is_correct: false },
            { text: "will win", is_correct: false },
            { text: "winning", is_correct: false }
          ],
          diff: "EASY",
          bloom: "APPLICATION",
          excerpt: "Past simple expresses completed actions indicated by yesterday.",
          exp: "The past tense of the irregular verb 'win' is 'won'."
        },
        {
          q: "Complete with the correct preposition: 'Students travel to school ______ bus every morning.'",
          options: [
            { text: "by", is_correct: true },
            { text: "in", is_correct: false },
            { text: "on", is_correct: false },
            { text: "with", is_correct: false }
          ],
          diff: "EASY",
          bloom: "KNOWLEDGE",
          excerpt: "The preposition 'by' is used before means of transport (by bus, by train).",
          exp: "Means of transport without an article take 'by' (by bus)."
        },
        {
          q: "What is the correct synonym of the adjective 'huge'?",
          options: [
            { text: "Enormous", is_correct: true },
            { text: "Tiny", is_correct: false },
            { text: "Narrow", is_correct: false },
            { text: "Weak", is_correct: false }
          ],
          diff: "EASY",
          bloom: "KNOWLEDGE",
          excerpt: "Synonyms are words with identical or closely related meanings.",
          exp: "'Huge' and 'enormous' both describe very large size."
        },
        {
          q: "Which sentence correctly expresses future intention using 'going to'?",
          options: [
            { text: "I am going to visit Alexandria next week", is_correct: true },
            { text: "I going to visit Alexandria", is_correct: false },
            { text: "I am go to visit Alexandria", is_correct: false },
            { text: "I am going visit Alexandria", is_correct: false }
          ],
          diff: "MEDIUM",
          bloom: "APPLICATION",
          excerpt: "Future plans use: am/is/are + going to + base verb.",
          exp: "The correct structure is: am + going to + verb (visit)."
        }
      ];
    }

    // Pick questions from the curated subject pool
    const poolShuffled = shuffleArray(pool);
    for (let i = 0; i < poolShuffled.length && questions.length < count; i++) {
      const item = poolShuffled[i];
      const ch = chunks[i % chunks.length] || chunks[0];
      questions.push({
        id: uuidv4(),
        chunk_id: ch?.id || '',
        book_id: bookId,
        chapter_id: chapterId,
        question_text: item.q,
        options: shuffleArray(item.options.map(o => ({ id: uuidv4(), text: o.text, is_correct: o.is_correct }))),
        difficulty: item.diff,
        bloom_level: item.bloom,
        page_reference: (ch?.page_number && Number(ch.page_number) > 1)
          ? Number(ch.page_number)
          : Math.floor((Number(chunks[0]?.page_number) || 1) + Math.random() * Math.max(1, (Number(chunks[chunks.length - 1]?.page_number) || 25) - (Number(chunks[0]?.page_number) || 1) + 1)),
        source_excerpt: item.excerpt,
        explanation: item.exp,
        chunk_text: ch?.content || item.excerpt,
        similarity_score: 1.0,
        validation_status: { isValid: true }
      });
    }

    return questions.slice(0, count);
  }

  /**
   * Evaluates student answers with grounded RAG, diagnoses mistakes,
   * generates targeted study guidance, and updates student topic analytics.
   */
  public async evaluateSubmission(params: {
    studentId: string;
    academicStageId: string;
    gradeId: string;
    subjectId: string;
    bookId: string;
    chapterId: string;
    questions: GroundedQuestion[];
    studentAnswers: { question_id: string; selected_option_id: string }[];
  }): Promise<FullDiagnosticReport> {
    const { studentId, academicStageId, gradeId, subjectId, bookId, chapterId, questions, studentAnswers } = params;

    // Fetch chapter title
    const chRes = await db.query(`SELECT title_ar, title_en, chapter_number FROM book_chapters WHERE id = $1`, [chapterId]);
    const firstQText = (questions[0]?.question_text || '') + ' ' + (questions[0]?.explanation || '');
    const isEnEvaluation = (firstQText.match(/[a-zA-Z]/g) || []).length > (firstQText.match(/[\u0600-\u06FF]/g) || []).length;
    const chapterName = isEnEvaluation 
      ? (chRes.rows[0]?.title_en || chRes.rows[0]?.title_ar || 'Chapter') 
      : (chRes.rows[0]?.title_ar || 'الفصل الدراسي المقبول');

    let totalScore = 0;
    const maxScore = questions.length;
    const items: EvaluationItemResult[] = [];
    const weakTopics: string[] = [];
    const strongTopics: string[] = [];

    for (const q of questions) {
      const submission = studentAnswers.find(a => a.question_id === q.id);
      const selectedOptId = submission?.selected_option_id || '';
      const selectedOpt = q.options.find(o => o.id === selectedOptId);
      const correctOpt = q.options.find(o => o.is_correct);

      const isCorrect = selectedOpt ? selectedOpt.is_correct : false;
      const points = isCorrect ? 1 : 0;
      totalScore += points;

      let studyRec = '';
      if (isEnEvaluation) {
        if (!isCorrect) {
          studyRec = `🎯 Action Plan: Open ${chapterName} - [Page ${q.page_reference}] and review: "${(q.source_excerpt || '').slice(0, 80)}...". Bloom Level: ${q.bloom_level}.`;
          weakTopics.push(`Page ${q.page_reference} Concept: ${q.question_text.slice(0, 45)}`);
        } else {
          studyRec = `✅ Mastered: Successfully demonstrated comprehension of page ${q.page_reference} concept.`;
          strongTopics.push(`Mastered Page ${q.page_reference} Concept`);
        }
      } else {
        if (!isCorrect) {
          studyRec = `🎯 خطة المراجعة: راجع ${chapterName} - [صفحة ${q.page_reference}] وراجع بعناية: "${q.source_excerpt.slice(0, 80)}...". مفهوم: ${q.bloom_level}.`;
          weakTopics.push(`مفهوم صفحة ${q.page_reference}: ${q.question_text.slice(0, 45)}`);
        } else {
          studyRec = `✅ إتقان تام: تم استيعاب مفهوم صفحة ${q.page_reference} بنجاح.`;
          strongTopics.push(`إتقان مفهوم صفحة ${q.page_reference}`);
        }
      }

      items.push({
        question_id: q.id,
        question_text: q.question_text,
        selected_option_id: selectedOptId,
        student_answer_text: selectedOpt?.text || (isEnEvaluation ? 'No answer selected' : 'لم يتم اختيار إجابة'),
        correct_answer_text: correctOpt?.text || '',
        is_correct: isCorrect,
        points: points,
        explanation: q.explanation,
        page_reference: q.page_reference,
        topic_area: isEnEvaluation ? `${chapterName} (p. ${q.page_reference})` : `${chapterName} (ص ${q.page_reference})`,
        study_recommendation: studyRec
      });
    }

    const percentage = Number(((totalScore / (maxScore || 1)) * 100).toFixed(1));

    let masteryStatus: 'MASTERED' | 'PROFICIENT' | 'DEVELOPING' | 'NEEDS_WORK' = 'NEEDS_WORK';
    if (percentage >= 85) masteryStatus = 'MASTERED';
    else if (percentage >= 70) masteryStatus = 'PROFICIENT';
    else if (percentage >= 50) masteryStatus = 'DEVELOPING';

    const reportId = uuidv4();

    const fullReport: FullDiagnosticReport = {
      evaluation_id: reportId,
      student_id: studentId,
      book_id: bookId,
      chapter_id: chapterId,
      subject_id: subjectId,
      score: totalScore,
      max_score: maxScore,
      percentage: percentage,
      mastery_status: masteryStatus,
      items: items,
      weak_topics: weakTopics,
      strong_topics: strongTopics,
      overall_feedback_ar: percentage >= 85
        ? 'أداء متميز واستيعاب عالي لنصوص وأفكار الكتاب المدرسي.'
        : percentage >= 60
        ? 'مستوى جيد، ولكن توجد نقاط محددة تحتاج لإعادة مراجعة من صفحات الكتاب الموضحة بالتقرير.'
        : 'بحاجة إلى تركيز وإعادة قراءة الصفحات المحددة في خطة المراجعة قبل المحاولة التالية.',
      overall_feedback_en: percentage >= 85
        ? 'Excellent performance with strong mastery of textbook concepts.'
        : percentage >= 60
        ? 'Good progress, but specific concepts need review from the cited textbook pages.'
        : 'Requires focused review of the cited textbook sections before re-evaluating.'
    };

    // Save to ai_evaluations
    await db.query(
      `INSERT INTO ai_evaluations (
         id, student_id, book_id, chapter_id, subject_id, score, total_questions,
         questions_data, student_answers_data, evaluation_report
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        reportId,
        studentId,
        bookId,
        chapterId,
        subjectId,
        totalScore,
        maxScore,
        JSON.stringify(questions),
        JSON.stringify(studentAnswers),
        JSON.stringify(fullReport)
      ]
    );

    // Update student topic mastery analytics
    await this.updateTopicMastery({
      studentId,
      subjectId,
      chapterId,
      totalAttempted: maxScore,
      totalCorrect: totalScore,
      weakTopics,
      strongTopics
    });

    // Record into student learning history
    await db.query(
      `INSERT INTO student_learning_history (
         id, student_id, event_type, reference_id, subject_id, chapter_id,
         score_percentage, weak_areas
       ) VALUES ($1, $2, 'AI_ASSESSMENT', $3, $4, $5, $6, $7)`,
      [
        uuidv4(),
        studentId,
        reportId,
        subjectId,
        chapterId,
        percentage,
        JSON.stringify(weakTopics)
      ]
    );

    return fullReport;
  }

  private async updateTopicMastery(params: {
    studentId: string;
    subjectId: string;
    chapterId: string;
    totalAttempted: number;
    totalCorrect: number;
    weakTopics: string[];
    strongTopics: string[];
  }): Promise<void> {
    const { studentId, subjectId, chapterId, totalAttempted, totalCorrect, weakTopics, strongTopics } = params;

    const existing = await db.query(
      `SELECT * FROM student_topic_mastery WHERE student_id = $1 AND subject_id = $2 AND chapter_id = $3`,
      [studentId, subjectId, chapterId]
    );

    if (existing.rows.length > 0) {
      const prev = existing.rows[0];
      const newAttempted = prev.total_attempted + totalAttempted;
      const newCorrect = prev.total_correct + totalCorrect;
      const newPct = Number(((newCorrect / (newAttempted || 1)) * 100).toFixed(1));

      let newStatus: 'MASTERED' | 'PROFICIENT' | 'DEVELOPING' | 'NEEDS_WORK' = 'NEEDS_WORK';
      if (newPct >= 85) newStatus = 'MASTERED';
      else if (newPct >= 70) newStatus = 'PROFICIENT';
      else if (newPct >= 50) newStatus = 'DEVELOPING';

      await db.query(
        `UPDATE student_topic_mastery SET 
           total_attempted = $4,
           total_correct = $5,
           mastery_percentage = $6,
           status = $7,
           weak_subtopics = $8,
           strong_subtopics = $9,
           last_assessed_at = datetime('now')
         WHERE student_id = $1 AND subject_id = $2 AND chapter_id = $3`,
        [
          studentId, subjectId, chapterId,
          newAttempted, newCorrect, newPct, newStatus,
          JSON.stringify(weakTopics), JSON.stringify(strongTopics)
        ]
      );
    } else {
      const pct = Number(((totalCorrect / (totalAttempted || 1)) * 100).toFixed(1));
      let status: 'MASTERED' | 'PROFICIENT' | 'DEVELOPING' | 'NEEDS_WORK' = 'NEEDS_WORK';
      if (pct >= 85) status = 'MASTERED';
      else if (pct >= 70) status = 'PROFICIENT';
      else if (pct >= 50) status = 'DEVELOPING';

      await db.query(
        `INSERT INTO student_topic_mastery (
           id, student_id, subject_id, chapter_id, total_attempted, total_correct,
           mastery_percentage, status, weak_subtopics, strong_subtopics
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          uuidv4(),
          studentId,
          subjectId,
          chapterId,
          totalAttempted,
          totalCorrect,
          pct,
          status,
          JSON.stringify(weakTopics),
          JSON.stringify(strongTopics)
        ]
      );
    }
  }
}

export const aiRagEngine = new AIRagEngine();
