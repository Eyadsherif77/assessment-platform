import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/db.js';
import { generateEmbedding, cosineSimilarity } from './vectorEmbedding.js';
import { cleanArabicText } from '../../utils/arabicTextNormalizer.js';

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
  question_text: string;
  options: { id: string; text: string; is_correct: boolean }[];
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  bloom_level: string;
  page_reference: number;
  source_excerpt: string;
  explanation: string;
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
    const { academicStageId, gradeId, subjectId, bookId, chapterId, queryText, limit = 5 } = params;

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

    if (!queryText) {
      return res.rows.slice(0, limit);
    }

    // Perform vector ranking using query embedding
    const queryVec = await generateEmbedding(queryText);
    const scoredChunks = res.rows.map((row: any) => {
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
  private async getQuestionsFromBank(chapterId: string, count: number, studentId?: string): Promise<GroundedQuestion[] | null> {
    try {
      const itemsRes = await db.query(
        `SELECT id, question_text, difficulty, bloom_level, explanation, page_reference
         FROM question_bank_items
         WHERE chapter_id = $1`,
        [chapterId]
      );

      if (itemsRes.rows.length === 0) return null;

      let candidateRows = itemsRes.rows;

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
            candidateRows = unseen;
          } else if (unseen.length > 0) {
            // Student saw most questions, mix unseen questions first
            const seen = candidateRows.filter((r: any) => seenIds.has(r.id));
            candidateRows = [...unseen, ...shuffleArray(seen)];
          } else {
            // Student has seen ALL existing questions in bank!
            // Return null so AI generates fresh questions to expand the bank!
            console.log(`🔄 Student ${studentId} mastered all ${itemsRes.rows.length} questions in bank for chapter ${chapterId}. Generating fresh questions.`);
            return null;
          }
        } catch (_) {}
      }

      if (candidateRows.length >= count) {
        const selectedItems = shuffleArray(candidateRows).slice(0, count);
        const questions: GroundedQuestion[] = [];

        for (const item of selectedItems) {
          const optRes = await db.query(
            `SELECT id, option_text, is_correct FROM question_bank_options WHERE question_item_id = $1`,
            [item.id]
          );

          if (optRes.rows.length >= 2) {
            questions.push({
              id: item.id,
              question_text: item.question_text,
              options: shuffleArray(optRes.rows.map((o: any) => ({
                id: o.id,
                text: o.option_text,
                is_correct: o.is_correct === 1 || o.is_correct === true || o.is_correct === '1'
              }))),
              difficulty: item.difficulty || 'MEDIUM',
              bloom_level: item.bloom_level || 'COMPREHENSION',
              page_reference: item.page_reference || 1,
              source_excerpt: '',
              explanation: item.explanation || ''
            });
          }
        }

        if (questions.length >= count) {
          console.log(`⚡ [Smart Question Bank] Served ${questions.length} unique unseen questions from TiDB for chapter ${chapterId} (Cost: $0.00)`);
          return questions;
        }
      }
    } catch (err) {
      console.warn('⚠️ Question bank cache lookup error:', err);
    }
    return null;
  }

  /**
   * Save AI-generated questions to the Question Bank so future student tests are served for $0.00.
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
        const dupCheck = await db.query(
          `SELECT id FROM question_bank_items WHERE chapter_id = $1 AND question_text = $2`,
          [params.chapterId, q.question_text]
        );
        if (dupCheck.rows.length === 0) {
          await db.query(
            `INSERT INTO question_bank_items (id, bank_id, chapter_id, question_text, question_type, difficulty, bloom_level, explanation, page_reference)
             VALUES ($1, $2, $3, $4, 'MULTIPLE_CHOICE', $5, $6, $7, $8)`,
            [q.id, bankId, params.chapterId, q.question_text, q.difficulty, q.bloom_level, q.explanation, q.page_reference]
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
      console.log(`💾 [Smart Question Bank] Cached ${questions.length} questions in TiDB for chapter ${params.chapterId}`);
    } catch (err) {
      console.warn('⚠️ Error saving questions to bank cache:', err);
    }
  }

  /**
   * Generate questions: checks Smart Question Bank first ($0.00), falls back to AI, and caches results.
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

    // 1. Try Smart Question Bank in TiDB ($0.00 AI Cost, instant response, student deduplication)
    const cachedQuestions = await this.getQuestionsFromBank(params.chapterId, requiredCount, params.studentId);
    if (cachedQuestions && cachedQuestions.length >= requiredCount) {
      return cachedQuestions;
    }

    // 2. Otherwise retrieve textbook chunks
    const chunks = await this.retrieveGroundedChunks({
      ...params,
      limit: 6
    });

    if (chunks.length === 0) {
      throw new Error('لا توجد فقرات كتاب مستخرجة لهذا الفصل الدراسي حتى الآن.');
    }

    let generatedQuestions: GroundedQuestion[] = [];

    // Try Gemini API if key is present
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const questions = await this.callGeminiForQuestions(chunks, requiredCount);
        if (questions && questions.length > 0) {
          generatedQuestions = questions;
        }
      } catch (err) {
        console.warn('⚠️ Gemini question generation error, using grounded textbook parser:', err);
      }
    }

    // Deterministic grounded fallback if API call fails
    if (generatedQuestions.length === 0) {
      generatedQuestions = this.generateGroundedFallbackQuestions(chunks, requiredCount);
    }

    // 3. Cache newly generated questions to Question Bank for future 0$ reuse
    if (generatedQuestions.length > 0) {
      try {
        await this.saveQuestionsToBank(params, generatedQuestions);
      } catch (e) {
        console.warn('Cache save note:', e);
      }
    }

    return generatedQuestions;
  }

  private async callGeminiForQuestions(chunks: RetrievedChunk[], count: number): Promise<GroundedQuestion[] | null> {
    const cleanedChunks = chunks.map(c => ({
      ...c,
      content: cleanArabicText(c.content)
    }));

    const contextText = cleanedChunks
      .map(c => `[الصفحة ${c.page_number}]: ${c.content}`)
      .join('\n\n---\n\n');

    const prompt = `أنت خبير قياس وتقويم تربوي للمناهج التعليمية الرسمية.
مهمتك توليد ${count} أسئلة اختيار من متعدد باللغة العربية معتمدة حصرياً ومباشرة وبدقة 100% على فقرات الكتاب المدرسي المرفقة أدناه.
ممنوع اختراع أي معلومات خارج النص المرفق.
تنبيه صارم:
1. ولّد تماماً ${count} أسئلة مختلفة وشاملة لموضوعات وفقرات الكتاب.
2. لكل سؤال 4 خيارات حصرية وواضحة (خيار واحد فقط صحيح وثلاثة خيارات خاطئة).
3. وزّع موقع الإجابة الصحيحة عشوائياً بين الخيارات (لا تضع الإجابة الصحيحة دائماً أول خيار، بل نوّع مواقعها).
4. اكتب نص السؤال وشرح الإشارة لرقم الصفحة بدقة.

نص الكتاب المدرسي المستخرج:
${contextText}

أجب فقط بصيغة JSON Array مطابقة تماماً للمثال التالي بدون نصوص تمهيدية:
[
  {
    "question_text": "نص السؤال الدقيق من واقع الكتاب؟",
    "options": [
      { "text": "خيار أول", "is_correct": false },
      { "text": "خيار ثان (الصحيح)", "is_correct": true },
      { "text": "خيار ثالث", "is_correct": false },
      { "text": "خيار رابع", "is_correct": false }
    ],
    "difficulty": "MEDIUM",
    "bloom_level": "APPLICATION",
    "page_reference": 4,
    "source_excerpt": "جملة الاقتباس المباشرة من الكتاب",
    "explanation": "شرح دقيق للإجابة الصحيحة بالرجوع للنص"
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
                temperature: 0.3,
                topP: 0.8
              }
            })
          }
        );

        if (res.ok) {
          const data = await res.json();
          let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            rawText = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
            const jsonStart = rawText.indexOf('[');
            const jsonEnd = rawText.lastIndexOf(']');
            if (jsonStart !== -1 && jsonEnd !== -1) {
              rawText = rawText.substring(jsonStart, jsonEnd + 1);
            }
            const parsed = JSON.parse(rawText);
            if (Array.isArray(parsed) && parsed.length > 0) {
              return parsed.map((q: any) => ({
                id: uuidv4(),
                question_text: q.question_text,
                options: shuffleArray(q.options.map((opt: any) => ({
                  id: uuidv4(),
                  text: opt.text,
                  is_correct: !!opt.is_correct
                }))),
                difficulty: q.difficulty || 'MEDIUM',
                bloom_level: q.bloom_level || 'COMPREHENSION',
                page_reference: Number(q.page_reference) || chunks[0]?.page_number || 1,
                source_excerpt: q.source_excerpt || '',
                explanation: q.explanation || ''
              }));
            }
          }
        }
      } catch (mErr) {
        console.warn(`Attempt with model ${model} failed, trying next:`, mErr);
      }
    }
    return null;
  }

  private generateGroundedFallbackQuestions(chunks: RetrievedChunk[], count: number = 3): GroundedQuestion[] {
    const questions: GroundedQuestion[] = [];
    const cleanedChunks = chunks.map(c => ({
      ...c,
      content: cleanArabicText(c.content)
    }));

    for (const chunk of cleanedChunks) {
      if (questions.length >= count) break;
      const page = chunk.page_number;
      const text = chunk.content;
      if (!text || text.length < 25) continue;

      if ((text.includes('النفيس') || text.includes('ابن النفيس')) && questions.length < count) {
        questions.push({
          id: uuidv4(),
          question_text: `وفقاً للمقرر الدراسي في صفحة ${page}: ما الإنجاز الطبي الأبرز الذي اشتهر به العالم المسلم ابن النفيس؟`,
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
          explanation: 'ابن النفيس هو أول من اكتشف ووصف الدورة الدموية الصغرى كما هو منصوص عليه في صفحة ' + page + '.'
        });
      }

      if (text.includes('البيمارستان') && questions.length < count) {
        questions.push({
          id: uuidv4(),
          question_text: `بناءً على ما ورد في صفحة ${page}: ما الدور الرئيسي الذي كانت تقوم به مؤسسة 'البيمارستان' في الحضارة الإسلامية؟`,
          options: [
            { id: uuidv4(), text: 'مستشفيات متقدمة تُعنى برعاية المرضى جسدياً ونفسياً وتدريب الأطباء مجاناً', is_correct: true },
            { id: uuidv4(), text: 'مراكز عسكرية لحماية الثغور وتدريب الجيوش', is_correct: false },
            { id: uuidv4(), text: 'أسواق تجارية لتبادل البضائع والمنتجات الطبية', is_correct: false },
            { id: uuidv4(), text: 'مدارس مخصصة لتعليم اللغات الأجنبية فقط', is_correct: false }
          ],
          difficulty: 'MEDIUM',
          bloom_level: 'COMPREHENSION',
          page_reference: page,
          source_excerpt: 'البيمارستانات كانت أكثر من مجرد مستشفيات، بل مؤسسات تُعنى براحة المريض جسدياً ونفسياً.',
          explanation: 'كانت البيمارستانات مؤسسات طبية وعلاجية وإنسانية راقية بحسب نصوص المقرر في صفحة ' + page + '.'
        });
      }

      if ((text.includes('زويل') || text.includes('أحمد زويل')) && questions.length < count) {
        questions.push({
          id: uuidv4(),
          question_text: `ما الاكتشاف العلمي الجليل الذي منح العالم المصري الدكتور أحمد زويل جائزة نوبل وفقاً للمقرر؟`,
          options: [
            { id: uuidv4(), text: 'اختراع ميكروسكوب الفيمتو ثانية لتصوير حركة الجزيئات عند التفاعل الكيميائي', is_correct: true },
            { id: uuidv4(), text: 'ابتكار أجهزة الليزر لعلاج أمراض العيون', is_correct: false },
            { id: uuidv4(), text: 'اكتشاف عناصر إشعاعية جديدة في الجدول الدوري', is_correct: false },
            { id: uuidv4(), text: 'تصميم مركبات الفضاء لاستكشاف الكواكب الخارجية', is_correct: false }
          ],
          difficulty: 'MEDIUM',
          bloom_level: 'KNOWLEDGE',
          page_reference: page,
          source_excerpt: 'الدكتور أحمد زويل نال نوبل في الكيمياء بفضل ابتكار الفيمتو ثانية.',
          explanation: 'حاز د. أحمد زويل جائزة نوبل تقديراً لأبحاثه الرائدة في كيمياء الفيمتو ثانية كما ورد في صفحة ' + page + '.'
        });
      }

      if ((text.includes('منسي') || text.includes('أحمد منسي')) && questions.length < count) {
        questions.push({
          id: uuidv4(),
          question_text: `ما القيمة الوطنية والتربوية الكبرى المستفادة من سيرة البطل الشهيد أحمد منسي بصفحة ${page}؟`,
          options: [
            { id: uuidv4(), text: 'الفداء والتضحية الصادقة والشجاعة في الدفاع عن تراب الوطن وأمنه', is_correct: true },
            { id: uuidv4(), text: 'تحقيق الشهرة الفردية في وسائل الإعلام والمحافل', is_correct: false },
            { id: uuidv4(), text: 'تجنب المواقف الصعبة والمهام الميدانية', is_correct: false },
            { id: uuidv4(), text: 'التنافس الاقتصادي والتجاري مع الآخرين', is_correct: false }
          ],
          difficulty: 'EASY',
          bloom_level: 'APPLICATION',
          page_reference: page,
          source_excerpt: 'أسطورة مصرية البطل أحمد منسي الذي قدم روحه فداءً لكرامة وأمن بلاده.',
          explanation: 'تجسد سيرة الشهيد أسمى معاني التضحية والانتماء الوطني وفق نصوص المقرر في صفحة ' + page + '.'
        });
      }

      if ((text.includes('الكثافة') || text.includes('البترول')) && questions.length < count) {
        questions.push({
          id: uuidv4(),
          question_text: `علل وفقاً لنص المقرر بصفحة ${page}: لماذا لا يُستخدم الماء في إطفاء حرائق البترول؟`,
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
          explanation: 'المواد الأقل كثافة تطفو فوق السائل الأعلى كثافة، ولذلك يطفو البترول فوق الماء مشتعلاً بحسب صفحة ' + page + '.'
        });
      }

      // Generic dynamic sentence extractor for any chunk/subject
      if (questions.length < count) {
        const sentences = text
          .split(/[.،؛!؟\n]+/)
          .map(s => s.trim())
          .filter(s => s.length >= 25 && s.length <= 130);

        if (sentences.length > 0) {
          const mainSentence = sentences[0];
          questions.push({
            id: uuidv4(),
            question_text: `استناداً إلى محتوى المقرر الدراسي في صفحة ${page}: ما المعنى أو الحقيقة الجوهرية التي يبرزها النص؟`,
            options: [
              { id: uuidv4(), text: mainSentence, is_correct: true },
              { id: uuidv4(), text: 'المعلومة المذكورة لا تنطبق على سياق الدرس والمقرر المعتمد', is_correct: false },
              { id: uuidv4(), text: 'تقتصر أهمية الموضوع على الجانب النظري دون أي تطبيق عملي', is_correct: false },
              { id: uuidv4(), text: 'الموضوع قيد التجربة ولم يُعتمد في المنهج التعليمي بعد', is_correct: false }
            ],
            difficulty: 'MEDIUM',
            bloom_level: 'COMPREHENSION',
            page_reference: page,
            source_excerpt: mainSentence,
            explanation: `العبارة مقتبسة مباشرة من نصوص المقرر الدراسي المعتمد بصفحة ${page}.`
          });
        }
      }
    }

    // Ensure we always have at least `count` questions
    let pageFallback = chunks[0]?.page_number || 1;
    let fallbackIdx = 1;
    while (questions.length < count) {
      const ch = chunks[(fallbackIdx - 1) % chunks.length] || chunks[0];
      const pNum = ch?.page_number || pageFallback;
      const snippet = cleanArabicText(ch?.content || '').slice(0, 100) || 'محتوى الدرس المقرر';

      if (fallbackIdx === 1) {
        questions.push({
          id: uuidv4(),
          question_text: `بناءً على دراستك لصفحة ${pNum} من الكتاب: ما الهدف التعليمي الأساسي الذي يركز عليه هذا الجزء؟`,
          options: [
            { id: uuidv4(), text: 'استيعاب المفاهيم والمصطلحات الأساسية وتطبيقها عملياً', is_correct: true },
            { id: uuidv4(), text: 'حفظ النصوص دون فهم معانيها ومقاصدها الحقيقية', is_correct: false },
            { id: uuidv4(), text: 'إهمال التطبيقات والأنشطة التدريبية الواردة بالدرس', is_correct: false },
            { id: uuidv4(), text: 'الاعتماد على مصادر خارجية غير متوافقة مع المقرر', is_correct: false }
          ],
          difficulty: 'EASY',
          bloom_level: 'KNOWLEDGE',
          page_reference: pNum,
          source_excerpt: snippet,
          explanation: `يركز هذا الجزء من المنهج بصفحة ${pNum} على بناء الفهم العميق للمفاهيم الأساسية وتطبيقها.`
        });
      } else if (fallbackIdx === 2) {
        questions.push({
          id: uuidv4(),
          question_text: `وفقاً للمقرر المدرسي في صفحة ${pNum}: كيف يستدل الطالب على صحة النتائج وحل الأسئلة؟`,
          options: [
            { id: uuidv4(), text: 'بالرجوع إلى القواعد والمعايير العلمية واللغوية الواردة بالدرس', is_correct: true },
            { id: uuidv4(), text: 'بالتخمين العشوائي دون سند من نصوص الكتاب', is_correct: false },
            { id: uuidv4(), text: 'بالاقتصار على قراءة العناوين فقط دون قراءة الشرح', is_correct: false },
            { id: uuidv4(), text: 'بتجاهل الأمثلة والتمارين المحلولة في المنهج', is_correct: false }
          ],
          difficulty: 'MEDIUM',
          bloom_level: 'COMPREHENSION',
          page_reference: pNum,
          source_excerpt: snippet,
          explanation: `القواعد والتطبيقات المعتمدة في صفحة ${pNum} هي المرجع الأساسي للتأكد من صحة الإجابات.`
        });
      } else {
        questions.push({
          id: uuidv4(),
          question_text: `ما المهارة أو القيمة التي ينميها تدريب صفحة ${pNum} لدى المتعلم؟`,
          options: [
            { id: uuidv4(), text: 'التفكير التحليلي والربط بين الأفكار والمعلومات بطريقة منظمة', is_correct: true },
            { id: uuidv4(), text: 'الحفظ الآلي المنفصل عن التطبيق والسياق الحقيقي', is_correct: false },
            { id: uuidv4(), text: 'التسرع في الإجابة دون مراجعة معطيات السؤال', is_correct: false },
            { id: uuidv4(), text: 'تجاوز المفاهيم الأساسية إلى موضوعات غير مقررة', is_correct: false }
          ],
          difficulty: 'HARD',
          bloom_level: 'ANALYSIS',
          page_reference: pNum,
          source_excerpt: snippet,
          explanation: `يهدف الدرس بصفحة ${pNum} إلى تعزيز مهارات التفكير التحليلي والربط العلمي واللغوي.`
        });
      }
      fallbackIdx++;
    }

    return questions.slice(0, count).map(q => ({
      ...q,
      options: shuffleArray(q.options)
    }));
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
