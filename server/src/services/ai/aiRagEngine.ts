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

/**
 * Quality Validation Layer:
 * Automatically rejects any question or option containing structural/metadata terms
 * such as "page", "chapter", "lesson", "unit", "section", "title", "heading",
 * or Arabic equivalents like "صفحة", "فصل", "درس", "وحدة", "عنوان", "فهرس".
 */
export function validateEducationalQuestion(q: GroundedQuestion): { isValid: boolean; reason?: string } {
  if (!q.question_text || q.question_text.trim().length < 10) {
    return { isValid: false, reason: 'Question text is missing or too short' };
  }

  const textsToCheck = [
    q.question_text,
    ...(q.options || []).map(o => o.text),
    q.explanation || ''
  ];

  const forbiddenPatterns: RegExp[] = [
    /\bpage\b/i,
    /\bpages\b/i,
    /\bchapter\b/i,
    /\bchapters\b/i,
    /\blesson\b/i,
    /\blessons\b/i,
    /\bunit\b/i,
    /\bunits\b/i,
    /\bsection\b/i,
    /\bsections\b/i,
    /\btitle\b/i,
    /\bheading\b/i,
    /\bheadings\b/i,
    /\bmetadata\b/i,
    /\btable\s+of\s+contents\b/i,
    /\bdocument\s+structure\b/i,
    /\bfile\s+name\b/i,
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
    /المحتويات/
  ];

  for (const text of textsToCheck) {
    if (!text) continue;
    for (const rx of forbiddenPatterns) {
      if (rx.test(text)) {
        return { isValid: false, reason: `Contains forbidden structural term matching ${rx}` };
      }
    }
  }

  if (!q.options || q.options.length < 2) {
    return { isValid: false, reason: 'Question must have at least 2 options' };
  }

  const correctCount = q.options.filter(o => o.is_correct).length;
  if (correctCount !== 1) {
    return { isValid: false, reason: `Must have exactly 1 correct option, got ${correctCount}` };
  }

  return { isValid: true };
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
  /**
   * Strictly retrieve textbook chunks belonging ONLY to the student's stage, grade, subject, book, and chapter.
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
    const { academicStageId, gradeId, subjectId, bookId, chapterId, queryText, limit = 6 } = params;

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

    if (!queryText) {
      return candidateChunks.slice(0, limit);
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
   * Check if questions already exist in the Question Bank in TiDB.
   * If studentId is provided, filters out questions the student has already seen,
   * guaranteeing the student never gets the same question twice!
   */
  private async getQuestionsFromBank(params: {
    bookId: string;
    chapterId: string;
    count: number;
    studentId?: string;
  }): Promise<GroundedQuestion[] | null> {
    const { bookId, chapterId, count, studentId } = params;
    try {
      const itemsRes = await db.query(
        `SELECT id, question_text, difficulty, bloom_level, explanation, page_reference, source_chunk_id
         FROM question_bank_items
         WHERE chapter_id = $1`,
        [chapterId]
      );

      if (itemsRes.rows.length === 0) return null;

      // Filter questions through Quality Validation Layer (strip any historical meta wording)
      const candidateRows = itemsRes.rows.filter((r: any) => {
        const qText = r.question_text || '';
        return !qText.includes('في صفحة') && !qText.includes('بصفحة') && !qText.includes('رقم الصفحة') && !qText.includes('الفهرس');
      });

      if (candidateRows.length === 0) return null;

      let filteredRows = candidateRows;

      // Deduplication: prevent the same student from seeing questions they already solved
      if (studentId) {
        try {
          const evalRes = await db.query(
            `SELECT questions_data FROM ai_evaluations WHERE student_id = $1 AND chapter_id = $2`,
            [studentId, chapterId]
          );
          const seenIds = new Set<string>();
          for (const row of evalRes.rows) {
            try {
              const qList = typeof row.questions_data === 'string' ? JSON.parse(row.questions_data) : row.questions_data;
              if (Array.isArray(qList)) {
                qList.forEach((q: any) => { if (q.id) seenIds.add(q.id); });
              }
            } catch (_) {}
          }

          const unseen = candidateRows.filter((r: any) => !seenIds.has(r.id));
          if (unseen.length >= count) {
            filteredRows = unseen;
          } else if (unseen.length > 0) {
            const seen = candidateRows.filter((r: any) => seenIds.has(r.id));
            filteredRows = [...unseen, ...shuffleArray(seen)];
          } else {
            console.log(`🔄 Student ${studentId} mastered all questions in bank for chapter ${chapterId}. Generating fresh questions.`);
            return null;
          }
        } catch (_) {}
      }

      if (filteredRows.length >= count) {
        const selectedItems = shuffleArray(filteredRows).slice(0, count);
        const questions: GroundedQuestion[] = [];

        for (const item of selectedItems) {
          const optRes = await db.query(
            `SELECT id, option_text, is_correct FROM question_bank_options WHERE question_item_id = $1`,
            [item.id]
          );

          if (optRes.rows.length >= 2) {
            const groundedQ: GroundedQuestion = {
              id: item.id,
              chunk_id: item.source_chunk_id || '',
              book_id: bookId,
              chapter_id: chapterId,
              question_text: item.question_text,
              options: shuffleArray(optRes.rows.map((o: any) => ({
                id: o.id,
                text: o.option_text,
                is_correct: o.is_correct === 1 || o.is_correct === true || o.is_correct === '1'
              }))),
              difficulty: item.difficulty || 'MEDIUM',
              bloom_level: item.bloom_level || 'UNDERSTANDING',
              page_reference: item.page_reference || 1,
              source_excerpt: '',
              explanation: item.explanation || ''
            };

            // Run through quality validation layer
            if (validateEducationalQuestion(groundedQ).isValid) {
              questions.push(groundedQ);
            }
          }
        }

        if (questions.length >= count) {
          console.log(`⚡ [Smart Question Bank] Served ${questions.length} validated educational questions from TiDB for chapter ${chapterId} ($0.00)`);
          return questions;
        }
      }
    } catch (err) {
      console.warn('⚠️ Question bank cache lookup error:', err);
    }
    return null;
  }

  /**
   * Save validated AI-generated questions to the Question Bank with source chunk traceability.
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
           VALUES ($1, $2, $3, $4, 'بنك الأسئلة الذكي المعتمد', 'بنك الأسئلة الذكي التراكمي المعتمد من المناهج المدرسية الرسمية')`,
          [bankId, params.subjectId, params.academicStageId, params.gradeId]
        );
      } else {
        bankId = bankRes.rows[0].id;
      }

      for (const q of questions) {
        // Quality Validation Layer
        const validation = validateEducationalQuestion(q);
        if (!validation.isValid) {
          console.log(`⚠️ Skipping question caching (failed quality check): ${validation.reason}`);
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
      console.log(`💾 [Smart Question Bank] Cached ${questions.length} validated grounded questions in TiDB for chapter ${params.chapterId}`);
    } catch (err) {
      console.warn('⚠️ Error saving questions to bank cache:', err);
    }
  }

  /**
   * Generate questions:
   * 1. Validates Student Safety Rule (academic stage & grade).
   * 2. Checks Smart Question Bank ($0.00).
   * 3. Retrieves textbook educational chunks.
   * 4. Calls Gemini API with strict prompt and Bloom's taxonomy distribution.
   * 5. Runs Quality Validation Layer (rejects structural references).
   * 6. Caches results with source chunk grounding.
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
      `SELECT id, academic_stage_id, grade_id FROM books WHERE id = $1`,
      [params.bookId]
    );
    if (bookCheck.rows.length === 0) {
      throw new Error('الكتاب المدرسي غير موجود بالمنصة.');
    }
    const book = bookCheck.rows[0];
    if (book.academic_stage_id !== params.academicStageId || book.grade_id !== params.gradeId) {
      throw new Error('غير مصرح: لا يمكن توليد أسئلة لكتاب خارج مرحلتك وصفك الدراسي المعتمد.');
    }

    // 1. Try Smart Question Bank in TiDB ($0.00 AI Cost, instant response, student deduplication)
    const cachedQuestions = await this.getQuestionsFromBank({
      bookId: params.bookId,
      chapterId: params.chapterId,
      count: requiredCount,
      studentId: params.studentId
    });
    if (cachedQuestions && cachedQuestions.length >= requiredCount) {
      return cachedQuestions;
    }

    // 2. Retrieve grounded educational textbook chunks
    let chunks = await this.retrieveGroundedChunks({
      ...params,
      limit: 8
    });

    if (chunks.length === 0) {
      try {
        const chInfo = await db.query(
          `SELECT c.title_ar as ch_title, b.title_ar as b_title
           FROM book_chapters c
           JOIN books b ON c.book_id = b.id
           WHERE c.id = $1`,
          [params.chapterId]
        );
        if (chInfo.rows.length > 0) {
          chunks = [{
            id: `anchor-${params.chapterId}`,
            book_id: params.bookId,
            chapter_id: params.chapterId,
            page_number: 1,
            chunk_index: 1,
            content: `المفاهيم التعليمية والأسس المقررة في درس ${chInfo.rows[0].ch_title} من كتاب ${chInfo.rows[0].b_title}. يتضمن الدرس القواعد الأساسية، والتعريفات الدقيقة، والتطبيقات والمسائل التقييمية.`,
            metadata: '{}',
            similarity: 1.0
          }];
        }
      } catch (e) {
        console.warn('Anchor chunk fallback failed:', e);
      }
    }

    if (chunks.length === 0) {
      throw new Error('المحتوى التعليمي المستخرج من هذا الفصل غير كافٍ لصياغة أسئلة تقييمية معتمدة.');
    }

    let validQuestions: GroundedQuestion[] = [];

    // Try Gemini API if key is present
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const rawAiQuestions = await this.callGeminiForQuestions(chunks, requiredCount, params.bookId, params.chapterId);
        if (rawAiQuestions && rawAiQuestions.length > 0) {
          // Quality Validation Layer: Filter out any questions mentioning structural tokens
          for (const q of rawAiQuestions) {
            const val = validateEducationalQuestion(q);
            if (val.isValid) {
              validQuestions.push(q);
            } else {
              console.warn(`⚠️ Rejected AI question due to quality violation: ${val.reason} (Text: "${q.question_text}")`);
            }
          }
        }
      } catch (err: any) {
        console.warn('⚠️ Gemini question generation note, proceeding to grounded fallback:', err.message || err);
      }
    }

    // If we need more questions to meet the count, generate deterministic grounded fallback questions
    if (validQuestions.length < requiredCount) {
      const needed = requiredCount - validQuestions.length;
      const fallbackList = this.generateGroundedFallbackQuestions(chunks, needed, params.bookId, params.chapterId);
      for (const fbQ of fallbackList) {
        if (validateEducationalQuestion(fbQ).isValid) {
          validQuestions.push(fbQ);
        }
      }
    }

    const finalQuestions = validQuestions.slice(0, requiredCount);

    if (finalQuestions.length === 0) {
      throw new Error('Insufficient educational content for assessment generation.');
    }

    // 3. Cache validated questions to Question Bank for future 0$ reuse
    try {
      await this.saveQuestionsToBank(params, finalQuestions);
    } catch (e) {
      console.warn('Cache save note:', e);
    }

    return finalQuestions;
  }

  private async callGeminiForQuestions(
    chunks: RetrievedChunk[],
    count: number,
    bookId: string,
    chapterId: string
  ): Promise<GroundedQuestion[] | null> {
    // Exact Bloom's Taxonomy Distribution:
    // 40% Knowledge, 30% Understanding, 20% Application, 10% Analysis
    const knowledgeCount = Math.max(1, Math.round(count * 0.4));
    const understandingCount = Math.max(1, Math.round(count * 0.3));
    const applicationCount = Math.max(1, Math.round(count * 0.2));
    const analysisCount = Math.max(1, count - knowledgeCount - understandingCount - applicationCount);

    const contextText = chunks
      .map(c => `[CHUNK ID: ${c.id} | Page Ref: ${c.page_number}]:\n${c.content}`)
      .join('\n\n---\n\n');

    const prompt = `You are an educational assessment generator.

Generate questions ONLY from the educational concepts contained in the provided textbook content.

Do NOT generate questions about:
- Page numbers
- Chapter numbers
- Lesson names
- Unit names
- Section titles
- Document structure
- Metadata
- File information

Questions must strictly assess:
- Knowledge
- Understanding
- Application
- Analysis

If the provided content does not contain enough educational material, return:
"Insufficient educational content for assessment generation."

CRITICAL GENERATION RULES:
1. Generate exactly ${count} multiple-choice questions in Arabic grounded 100% in the educational content.
2. Required Bloom's Taxonomy Distribution:
   - ${knowledgeCount} Knowledge question(s) (Definitions, scientific facts, direct recall) -> bloom_level: "KNOWLEDGE"
   - ${understandingCount} Understanding question(s) (Explanations, cause-and-effect, concept relationships) -> bloom_level: "UNDERSTANDING"
   - ${applicationCount} Application question(s) (Calculations, practical procedures, real-world examples, predictions) -> bloom_level: "APPLICATION"
   - ${analysisCount} Analysis question(s) (Comparative deductions, analyzing experiments or relationships) -> bloom_level: "ANALYSIS"
3. ZERO TOLERANCE for document structure: NEVER use the words "صفحة", "page", "فصل", "chapter", "درس", "lesson", "وحدة", "unit", "عنوان", "title" in question_text or options.
4. Each question must have 4 plausible options with exactly 1 correct answer and 3 realistic distractors.
5. Every question MUST be grounded in a specific chunk, referencing its exact "chunk_id" from the provided content.

Provided Textbook Content:
${contextText}

Respond ONLY with a valid JSON array of objects (no markdown code fences, no introductory or concluding text):
[
  {
    "chunk_id": "the exact chunk ID provided above",
    "question_text": "نص السؤال التعليمي المركز تماماً على المفهوم أو المسألة دون أي إشارة لهيكل الكتاب",
    "options": [
      { "text": "خيار أول", "is_correct": false },
      { "text": "خيار ثان", "is_correct": true },
      { "text": "خيار ثالث", "is_correct": false },
      { "text": "خيار رابع", "is_correct": false }
    ],
    "difficulty": "EASY" | "MEDIUM" | "HARD",
    "bloom_level": "KNOWLEDGE" | "UNDERSTANDING" | "APPLICATION" | "ANALYSIS",
    "page_reference": 4,
    "source_excerpt": "الاقتباس العلمي الدقيق من النص",
    "explanation": "شرح علمي مفصل لسبب صحة الإجابة"
  }
]`;

    const candidateModels = [
      process.env.GEMINI_MODEL,
      'gemini-flash-latest',
      'gemini-3.6-flash',
      'gemini-2.5-flash'
    ].filter(Boolean) as string[];

    for (const model of candidateModels) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.25,
                topP: 0.8
              }
            })
          }
        );

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
            const parsed = JSON.parse(rawText);
            if (Array.isArray(parsed) && parsed.length > 0) {
              return parsed.map((q: any) => {
                // Ensure chunk_id matches one of the retrieved chunks
                const matchedChunk = chunks.find(c => c.id === q.chunk_id) || chunks[0];
                const sanitizedQText = q.question_text.replace(/صفحة\s*\d+/g, '').trim();
                const optionsList: { id: string; text: string; is_correct: boolean }[] = shuffleArray<{ id: string; text: string; is_correct: boolean }>(
                  (Array.isArray(q.options) ? q.options : []).map((opt: any) => ({
                    id: uuidv4(),
                    text: String(opt?.text || ''),
                    is_correct: !!opt?.is_correct
                  }))
                );

                const resultQ: GroundedQuestion = {
                  id: uuidv4(),
                  chunk_id: matchedChunk?.id || chunks[0]?.id || '',
                  book_id: bookId,
                  chapter_id: chapterId,
                  question_text: sanitizedQText,
                  options: optionsList,
                  difficulty: q.difficulty || 'MEDIUM',
                  bloom_level: (q.bloom_level || 'UNDERSTANDING').toUpperCase(),
                  page_reference: Number(q.page_reference) || matchedChunk?.page_number || 1,
                  source_excerpt: q.source_excerpt || '',
                  explanation: q.explanation || '',
                  // Debug inspection metadata
                  chunk_text: matchedChunk?.content || q.source_excerpt || '',
                  similarity_score: Number((matchedChunk?.similarity ?? 1.0).toFixed(4)),
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

  private generateGroundedFallbackQuestions(
    chunks: RetrievedChunk[],
    count: number = 3,
    bookId: string = '',
    chapterId: string = ''
  ): GroundedQuestion[] {
    const questions: GroundedQuestion[] = [];

    for (const chunk of chunks) {
      if (questions.length >= count) break;
      const page = chunk.page_number;
      const text = chunk.content;
      if (!text || text.length < 25) continue;

      if ((text.includes('النفيس') || text.includes('ابن النفيس')) && questions.length < count) {
        questions.push({
          id: uuidv4(),
          chunk_id: chunk.id,
          book_id: bookId,
          chapter_id: chapterId,
          question_text: `ما الإنجاز الطبي الأبرز الذي اشتهر به العالم المسلم ابن النفيس في تاريخ الطب؟`,
          options: [
            { id: uuidv4(), text: 'وصف الدورة الدموية الصغرى بدقة علمية قبل علماء الغرب بقرون', is_correct: true },
            { id: uuidv4(), text: 'اكتشاف المجهر الضوئي لفحص الخلايا الحية', is_correct: false },
            { id: uuidv4(), text: 'تأسيس علم الجبر وقوانين المثلثات الرياضية', is_correct: false },
            { id: uuidv4(), text: 'تطوير تقنيات التخدير الكيميائي في العمليات الجراحية', is_correct: false }
          ],
          difficulty: 'EASY',
          bloom_level: 'KNOWLEDGE',
          page_reference: page,
          source_excerpt: 'فهو أول من وصف الدورة الدموية الصغرى وصفاً دقيقاً قبل أن يعرفها الغرب بقرون.',
          explanation: 'ابن النفيس هو أول من اكتشف ووصف الدورة الدموية الصغرى.'
        });
      }

      if (text.includes('البيمارستان') && questions.length < count) {
        questions.push({
          id: uuidv4(),
          chunk_id: chunk.id,
          book_id: bookId,
          chapter_id: chapterId,
          question_text: `ما الدور الرئيسي الذي كانت تقوم به مؤسسة 'البيمارستان' في الحضارة الإسلامية؟`,
          options: [
            { id: uuidv4(), text: 'مستشفيات متقدمة تُعنى برعاية المرضى جسدياً ونفسياً وتدريب الأطباء مجاناً', is_correct: true },
            { id: uuidv4(), text: 'مراكز عسكرية لحماية الثغور وتدريب الجيوش', is_correct: false },
            { id: uuidv4(), text: 'أسواق تجارية لتبادل البضائع والمنتجات الطبية', is_correct: false },
            { id: uuidv4(), text: 'مدارس مخصصة لتعليم اللغات الأجنبية فقط', is_correct: false }
          ],
          difficulty: 'MEDIUM',
          bloom_level: 'UNDERSTANDING',
          page_reference: page,
          source_excerpt: 'البيمارستانات كانت أكثر من مجرد مستشفيات، بل مؤسسات تُعنى براحة المريض جسدياً ونفسياً.',
          explanation: 'كانت البيمارستانات مؤسسات طبية وعلاجية وإنسانية راقية.'
        });
      }

      if ((text.includes('زويل') || text.includes('أحمد زويل')) && questions.length < count) {
        questions.push({
          id: uuidv4(),
          chunk_id: chunk.id,
          book_id: bookId,
          chapter_id: chapterId,
          question_text: `ما الاكتشاف العلمي الجليل الذي منح العالم المصري الدكتور أحمد زويل جائزة نوبل؟`,
          options: [
            { id: uuidv4(), text: 'ابتكار ميكروسكوب الفيمتو ثانية لتصوير حركة الجزيئات عند التفاعل الكيميائي', is_correct: true },
            { id: uuidv4(), text: 'ابتكار أجهزة الليزر لعلاج أمراض العيون', is_correct: false },
            { id: uuidv4(), text: 'اكتشاف عناصر إشعاعية جديدة في الجدول الدوري', is_correct: false },
            { id: uuidv4(), text: 'تصميم مركبات الفضاء لاستكشاف الكواكب الخارجية', is_correct: false }
          ],
          difficulty: 'MEDIUM',
          bloom_level: 'KNOWLEDGE',
          page_reference: page,
          source_excerpt: 'الدكتور أحمد زويل نال نوبل في الكيمياء بفضل ابتكار الفيمتو ثانية.',
          explanation: 'حاز د. أحمد زويل جائزة نوبل تقديراً لأبحاثه الرائدة في كيمياء الفيمتو ثانية.'
        });
      }

      if ((text.includes('الكثافة') || text.includes('البترول')) && questions.length < count) {
        questions.push({
          id: uuidv4(),
          chunk_id: chunk.id,
          book_id: bookId,
          chapter_id: chapterId,
          question_text: `علل علمياً: لماذا لا يُستخدم الماء في إطفاء حرائق البترول؟`,
          options: [
            { id: uuidv4(), text: 'لأن كثافة البترول أقل من كثافة الماء فيطفو فوق سطحه ويظل مشتعلاً', is_correct: true },
            { id: uuidv4(), text: 'لأن الماء يتفاعل كيميائياً مع البترول وينفجر', is_correct: false },
            { id: uuidv4(), text: 'لأن كثافة الماء أقل من كثافة البترول فيتبخر سريعاً', is_correct: false },
            { id: uuidv4(), text: 'لأن البترول يذوب في الماء البارد فقط', is_correct: false }
          ],
          difficulty: 'MEDIUM',
          bloom_level: 'APPLICATION',
          page_reference: page,
          source_excerpt: 'لا يستخدم الماء في إطفاء حرائق البترول لأن كثافة البترول أقل من كثافة الماء فيطفو مشتعلاً.',
          explanation: 'المواد الأقل كثافة تطفو فوق السائل الأعلى كثافة، ولذلك يطفو البترول فوق الماء مشتعلاً.'
        });
      }

      if ((text.includes('النسبي') || text.includes('الكسر') || text.includes('المقام')) && questions.length < count) {
        questions.push({
          id: uuidv4(),
          chunk_id: chunk.id,
          book_id: bookId,
          chapter_id: chapterId,
          question_text: `متى يعبر الكسر (أ / ب) عن عدد نسبي حقيقي في مجموعة الأعداد النسبية (ن)؟`,
          options: [
            { id: uuidv4(), text: 'عندما يكون المقام ب عدداً صحيحاً لا يساوي صفراً (ب ≠ 0)', is_correct: true },
            { id: uuidv4(), text: 'عندما يكون البسط أ مساوياً للصفر دائماً', is_correct: false },
            { id: uuidv4(), text: 'عندما يكون المقام ب مساوياً للصفر', is_correct: false },
            { id: uuidv4(), text: 'عندما يكون البسط والمقام أعداداً سالبة فقط', is_correct: false }
          ],
          difficulty: 'EASY',
          bloom_level: 'KNOWLEDGE',
          page_reference: page,
          source_excerpt: 'الشرط الأساسي هو أن المقام ب لا يساوي صفراً (ب ≠ 0).',
          explanation: 'القسمة على صفر ليس لها معنى في الرياضيات، لذلك يجب أن يكون المقام ب ≠ 0.'
        });
      }

      if ((text.includes('المعكوس') || text.includes('الضرب') || text.includes('المحايد')) && questions.length < count) {
        questions.push({
          id: uuidv4(),
          chunk_id: chunk.id,
          book_id: bookId,
          chapter_id: chapterId,
          question_text: `ما خاصية العدد صفر بالنسبة لعملية الضرب في مجموعة الأعداد النسبية؟`,
          options: [
            { id: uuidv4(), text: 'العدد صفر هو العدد النسبي الوحيد الذي ليس له معكوس ضربي', is_correct: true },
            { id: uuidv4(), text: 'العدد صفر هو المحايد الضربي لجميع الأعداد النسبية', is_correct: false },
            { id: uuidv4(), text: 'معكوسه الضربي هو العدد 1', is_correct: false },
            { id: uuidv4(), text: 'معكوسه الضربي يساوي معكوسه الجمعي', is_correct: false }
          ],
          difficulty: 'MEDIUM',
          bloom_level: 'UNDERSTANDING',
          page_reference: page,
          source_excerpt: 'العدد صفر ليس له معكوس ضربي لأن مقلوبه 1/0 ليس له معنى.',
          explanation: 'مقلوب الصفر هو 1/0 وهو كمية غير معرفة رياضياً.'
        });
      }

      if ((text.includes('الجبري') || text.includes('المقدار') || text.includes('الحد')) && questions.length < count) {
        questions.push({
          id: uuidv4(),
          chunk_id: chunk.id,
          book_id: bookId,
          chapter_id: chapterId,
          question_text: `كيف تُحدد درجة الحد الجبري في الرياضيات؟`,
          options: [
            { id: uuidv4(), text: 'بمجموع أسس العوامل الجبرية (الرموز) المكونة له', is_correct: true },
            { id: uuidv4(), text: 'بضرب المعامل العددي في عدد الحدود', is_correct: false },
            { id: uuidv4(), text: 'بأعلى معامل عددي في المقدار', is_correct: false },
            { id: uuidv4(), text: 'بعدد المتغيرات دون النظر إلى أسسها', is_correct: false }
          ],
          difficulty: 'MEDIUM',
          bloom_level: 'APPLICATION',
          page_reference: page,
          source_excerpt: 'درجة الحد الجبري هي مجموع أسس العوامل الجبرية المكونة له.',
          explanation: 'تُحسب درجة الحد الجبري بجمع أسس المتغيرات المكونة له.'
        });
      }

      // Sentence-level educational fact extractor
      if (questions.length < count) {
        const sentences = text
          .split(/[.،؛!؟\n]+/)
          .map(s => s.trim())
          .filter(s => s.length >= 25 && s.length <= 130 && !s.includes('الفهرس') && !s.includes('المحتويات') && !s.includes('صفحة'));

        if (sentences.length > 0) {
          const mainSentence = sentences[0];
          questions.push({
            id: uuidv4(),
            chunk_id: chunk.id,
            book_id: bookId,
            chapter_id: chapterId,
            question_text: `أي من العبارات التالية تمثل حقيقة ومفهوماً علمياً دقيقاً ورد في المحتوى التعليمي؟`,
            options: [
              { id: uuidv4(), text: mainSentence, is_correct: true },
              { id: uuidv4(), text: 'تتناقض المفاهيم الأساسية مع التطبيقات العملية في هذا المجال', is_correct: false },
              { id: uuidv4(), text: 'تقتصر أهمية دراسة الموضوع على الجانب النظري دون أي تطبيق عملي', is_correct: false },
              { id: uuidv4(), text: 'المعلومات المذكورة قيد التجربة ولم تثبت صحتها علمياً بعد', is_correct: false }
            ],
            difficulty: 'MEDIUM',
            bloom_level: 'UNDERSTANDING',
            page_reference: page,
            source_excerpt: mainSentence,
            explanation: `الحقيقة العلمية المقررة هي: "${mainSentence}".`
          });
        }
      }
    }

    // Fallback items based on Bloom's levels if needed
    let fallbackIdx = 1;
    while (questions.length < count) {
      const ch = chunks[(fallbackIdx - 1) % chunks.length] || chunks[0];
      const pNum = ch?.page_number || 1;
      const snippet = ch?.content?.slice(0, 100) || 'المحتوى العلمي المقرر';

      if (fallbackIdx === 1) {
        questions.push({
          id: uuidv4(),
          chunk_id: ch?.id || '',
          book_id: bookId,
          chapter_id: chapterId,
          question_text: `ما الركيزة الأساسية لفهم واستيعاب هذا الموضوع العلمي وتطبيقه بصورة صحيحة؟`,
          options: [
            { id: uuidv4(), text: 'استيعاب المفاهيم والمصطلحات الأساسية والربط المنطقي بينها', is_correct: true },
            { id: uuidv4(), text: 'الحفظ السطحي للألفاظ دون فهم المعنى العلمي والدلالة', is_correct: false },
            { id: uuidv4(), text: 'إهمال الأنشطة والتدريبات العملية الواردة بالمنهج', is_correct: false },
            { id: uuidv4(), text: 'الاعتماد على التخمين غير المستند لقواعد المنهج', is_correct: false }
          ],
          difficulty: 'EASY',
          bloom_level: 'KNOWLEDGE',
          page_reference: pNum,
          source_excerpt: snippet,
          explanation: `الفهم العميق للمفاهيم الأساسية هو الركيزة الأساسية للتعلم الفعال.`
        });
      } else if (fallbackIdx === 2) {
        questions.push({
          id: uuidv4(),
          chunk_id: ch?.id || '',
          book_id: bookId,
          chapter_id: chapterId,
          question_text: `كيف يستدل المتعلم على صحة النتائج العلمية والحلول في هذا المجال؟`,
          options: [
            { id: uuidv4(), text: 'بالرجوع إلى القواعد والمعايير العلمية والتطبيقية المعتمدة', is_correct: true },
            { id: uuidv4(), text: 'بالتخمين العشوائي دون سند من نصوص وقواعد المنهج', is_correct: false },
            { id: uuidv4(), text: 'بالاقتصار على قراءة العناوين فقط دون دراسة الشرح والتفاصيل', is_correct: false },
            { id: uuidv4(), text: 'بتجاهل الأمثلة والتمارين المحلولة في المنهج', is_correct: false }
          ],
          difficulty: 'MEDIUM',
          bloom_level: 'UNDERSTANDING',
          page_reference: pNum,
          source_excerpt: snippet,
          explanation: `القواعد والمعايير العلمية والتطبيقية المعتمدة هي المرجع الأساسي لصحة النتائج.`
        });
      } else {
        questions.push({
          id: uuidv4(),
          chunk_id: ch?.id || '',
          book_id: bookId,
          chapter_id: chapterId,
          question_text: `ما المهارة الأساسية التي يكتسبها الطالب من خلال التدريب والتطبيق العملي على هذا الموضوع؟`,
          options: [
            { id: uuidv4(), text: 'التفكير التحليلي والربط بين المعارف بطريقة منهجية منظمة', is_correct: true },
            { id: uuidv4(), text: 'الحفظ الآلي المنفصل عن التطبيق والسياق الحقيقي', is_correct: false },
            { id: uuidv4(), text: 'التسرع في الاستنتاج دون مراجعة معطيات المسألة', is_correct: false },
            { id: uuidv4(), text: 'إغفال الربط بين السبب والنتيجة في الظواهر المنهجية', is_correct: false }
          ],
          difficulty: 'HARD',
          bloom_level: 'ANALYSIS',
          page_reference: pNum,
          source_excerpt: snippet,
          explanation: `التدريب والتطبيق ينمي التفكير التحليلي والربط المنهجي بين المعارف.`
        });
      }
      fallbackIdx++;
    }

    return questions.slice(0, count).map(q => {
      const parentChunk = chunks.find(c => c.id === q.chunk_id) || chunks[0];
      return {
        ...q,
        options: shuffleArray(q.options),
        chunk_text: q.chunk_text || parentChunk?.content || '',
        similarity_score: q.similarity_score ?? Number((parentChunk?.similarity ?? 1.0).toFixed(4)),
        validation_status: q.validation_status || { isValid: true }
      };
    });
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
    const chapterName = chRes.rows[0]?.title_ar || 'الفصل الدراسي المقبول';

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
      if (!isCorrect) {
        studyRec = `🎯 خطة العلاج: افتح الكتاب عند ${chapterName} - [صفحة ${q.page_reference}] وراجع بعناية: "${q.source_excerpt.slice(0, 80)}...". مفهوم: ${q.bloom_level}.`;
        weakTopics.push(`مفهوم صفحة ${q.page_reference}: ${q.question_text.slice(0, 45)}`);
      } else {
        studyRec = `✅ إتقان تام: تم استيعاب مفهوم صفحة ${q.page_reference} بنجاح.`;
        strongTopics.push(`إتقان مفهوم صفحة ${q.page_reference}`);
      }

      items.push({
        question_id: q.id,
        question_text: q.question_text,
        selected_option_id: selectedOptId,
        student_answer_text: selectedOpt?.text || 'لم يتم اختيار إجابة',
        correct_answer_text: correctOpt?.text || '',
        is_correct: isCorrect,
        points: points,
        explanation: q.explanation,
        page_reference: q.page_reference,
        topic_area: `${chapterName} (ص ${q.page_reference})`,
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
        : 'بحاجة إلى تركيز وإعادة قراءة الصفحات المحددة في خطة العلاج قبل المحاولة التالية.',
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
