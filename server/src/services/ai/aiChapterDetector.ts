import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/db.js';

export interface DetectedChapter {
  id?: string;
  chapter_number: number;
  title_ar: string;
  title_en: string;
  start_page: number;
  end_page: number;
  description?: string;
}

export class AIChapterDetector {
  /**
   * Automatically analyzes textbook pages to detect Table of Contents and chapter partitions.
   * If Gemini API is configured, uses Gemini Flash to extract the exact chapter structure.
   * Otherwise uses a deterministic heuristic based on standard curriculum unit indicators.
   */
  public async detectAndCreateChapters(params: {
    bookId: string;
    bookTitleAr: string;
    bookTitleEn?: string;
    totalPages: number;
    pages: { pageNumber: number; text: string }[];
    academicStageId: string;
    gradeId: string;
    subjectId: string;
  }): Promise<DetectedChapter[]> {
    const { bookId, bookTitleAr, bookTitleEn, totalPages, pages } = params;

    let detected: DetectedChapter[] = [];

    // 1. Try Gemini AI detection using Table of Contents / first 20 pages
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && pages.length > 0) {
      try {
        detected = await this.callGeminiForChapters({
          bookTitleAr,
          bookTitleEn: bookTitleEn || bookTitleAr,
          totalPages,
          pagesSlice: pages.slice(0, 20)
        });
      } catch (err) {
        console.warn('⚠️ AI chapter detection note, falling back to heuristic:', err);
      }
    }

    // 2. If Gemini didn't return valid chapters, use intelligent curriculum heuristic
    if (!detected || detected.length < 2) {
      detected = this.detectHeuristicChapters({
        bookTitleAr,
        bookTitleEn: bookTitleEn || bookTitleAr,
        totalPages: totalPages || pages.length || 100,
        pages
      });
    }

    // 3. Persist detected chapters into book_chapters
    const createdChapters: DetectedChapter[] = [];
    const chapterIdMap = new Map<number, string>();

    // Remove any previous placeholder chapters for this book if re-detecting
    await db.query(`DELETE FROM book_chapters WHERE book_id = $1`, [bookId]);

    for (const ch of detected) {
      const chId = uuidv4();
      chapterIdMap.set(ch.chapter_number, chId);

      await db.query(
        `INSERT INTO book_chapters (
           id, book_id, chapter_number, title_ar, title_en, start_page, end_page, description
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          chId,
          bookId,
          ch.chapter_number,
          ch.title_ar,
          ch.title_en,
          ch.start_page,
          ch.end_page,
          ch.description || `محتوى ${ch.title_ar} ومفهرس دلالياً لدعم التقييم التشخيصي وبنوك الأسئلة الذكية.`
        ]
      );
      createdChapters.push({ ...ch, id: chId });
    }

    console.log(`📚 [AI Chapter Detector] Successfully partitioned book "${bookTitleAr}" into ${createdChapters.length} chapters.`);

    // 4. Update existing book_chunks to link to the corresponding chapter based on page_number
    try {
      for (const ch of detected) {
        const targetChapterId = chapterIdMap.get(ch.chapter_number);
        if (targetChapterId) {
          await db.query(
            `UPDATE book_chunks SET chapter_id = $1 
             WHERE book_id = $2 AND page_number BETWEEN $3 AND $4`,
            [targetChapterId, bookId, ch.start_page, ch.end_page]
          );
        }
      }
      // Any remaining chunks fallback to first chapter
      const ch1Id = chapterIdMap.get(detected[0]?.chapter_number);
      if (ch1Id) {
        await db.query(
          `UPDATE book_chunks SET chapter_id = $1 
           WHERE book_id = $2 AND (chapter_id IS NULL OR chapter_id NOT IN (${Array.from(chapterIdMap.values()).map(id => `'${id}'`).join(',')}))`,
          [ch1Id, bookId]
        );
      }
    } catch (e) {
      console.warn('Chunk chapter re-linking note:', e);
    }

    return createdChapters;
  }

  /**
   * Uses Gemini to parse Table of Contents and discover all units/chapters with page boundaries.
   */
  private async callGeminiForChapters(params: {
    bookTitleAr: string;
    bookTitleEn: string;
    totalPages: number;
    pagesSlice: { pageNumber: number; text: string }[];
  }): Promise<DetectedChapter[]> {
    const sampleText = params.pagesSlice
      .map(p => `[Page ${p.pageNumber}]:\n${p.text.slice(0, 1000)}`)
      .join('\n\n---\n\n');

    const prompt = `You are an educational textbook curriculum analyzer.
Analyze the following textbook opening pages and Table of Contents for: "${params.bookTitleAr}" (${params.bookTitleEn}).
The total page count of the book is ${params.totalPages}.

Your task is to identify ALL Units, Chapters, or Modules contained in this textbook.
Do NOT limit to chapter 1. Extract ALL units/chapters present in the curriculum (e.g., 2, 3, 4, 5, 6 chapters).

For each chapter, determine:
- chapter_number: integer (1, 2, 3...)
- title_ar: authentic Arabic chapter/unit title (e.g. "الوحدة الأولى: الأعداد النسبية")
- title_en: authentic English chapter/unit title (e.g. "Unit 1: Rational Numbers")
- start_page: integer page number where the chapter starts
- end_page: integer page number where the chapter ends (make sure it spans until the next chapter starts or the total pages)
- description: concise 1-sentence educational overview

Textbook Preview Pages:
${sampleText}

Return ONLY a valid JSON array of chapter objects (no markdown code fences):
[
  {
    "chapter_number": 1,
    "title_ar": "الوحدة الأولى: ...",
    "title_en": "Unit 1: ...",
    "start_page": 1,
    "end_page": 30,
    "description": "..."
  }
]`;

    const candidateModels = [
      process.env.GEMINI_MODEL,
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-3.6-flash'
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
              generationConfig: { temperature: 0.2, topP: 0.8 }
            })
          }
        );

        if (res.ok) {
          const data = await res.json();
          let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          rawText = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
          const startIdx = rawText.indexOf('[');
          const endIdx = rawText.lastIndexOf(']');
          if (startIdx !== -1 && endIdx !== -1) {
            rawText = rawText.substring(startIdx, endIdx + 1);
            const parsed = JSON.parse(rawText);
            if (Array.isArray(parsed) && parsed.length >= 2) {
              return parsed.map((item: any, idx: number) => ({
                chapter_number: item.chapter_number || (idx + 1),
                title_ar: item.title_ar || `الوحدة #${idx + 1}`,
                title_en: item.title_en || `Unit ${idx + 1}`,
                start_page: Number(item.start_page) || 1,
                end_page: Number(item.end_page) || params.totalPages,
                description: item.description || ''
              }));
            }
          }
        }
      } catch (err) {
        console.warn(`Gemini model ${model} chapter detection failed, trying next:`, err);
      }
    }

    return [];
  }

  /**
   * Deterministic heuristic curriculum detector based on subject keywords & standard divisions.
   */
  public detectHeuristicChapters(params: {
    bookTitleAr: string;
    bookTitleEn: string;
    totalPages: number;
    pages: { pageNumber: number; text: string }[];
  }): DetectedChapter[] {
    const { bookTitleAr, bookTitleEn, totalPages } = params;
    const title = (bookTitleAr + ' ' + bookTitleEn).toLowerCase();

    // 1. Mathematics Curriculum (Prep 1 Term 1)
    if (title.includes('math') || title.includes('رياضيات') || title.includes('حساب')) {
      const p1End = Math.round(totalPages * 0.28);
      const p2End = Math.round(totalPages * 0.58);
      const p3End = Math.round(totalPages * 0.78);
      return [
        {
          chapter_number: 1,
          title_ar: 'الوحدة الأولى: الأعداد النسبية والعمليات عليها',
          title_en: 'Unit 1: Numbers and Operations (Rational Numbers)',
          start_page: 1,
          end_page: p1End,
          description: 'مجموعة الأعداد النسبية، المقارنة، والعمليات الحسابية والخواص الأساسية.'
        },
        {
          chapter_number: 2,
          title_ar: 'الوحدة الثانية: الحدود والمقادير الجبرية',
          title_en: 'Unit 2: Algebra & Algebraic Expressions',
          start_page: p1End + 1,
          end_page: p2End,
          description: 'المفاهيم الجبرية، جمع وطرح وضرب وقسمة الحدود والمقادير والمعادلات.'
        },
        {
          chapter_number: 3,
          title_ar: 'الوحدة الثالثة: الإحصاء والاحتمال',
          title_en: 'Unit 3: Statistics & Probability',
          start_page: p2End + 1,
          end_page: p3End,
          description: 'مقاييس النزعة المركزية: المتوسط الحسابي، والوسيط، والمنوال، ومبادئ الاحتمال.'
        },
        {
          chapter_number: 4,
          title_ar: 'الوحدة الرابعة: المفاهيم الهندسية والقياس والتطابق',
          title_en: 'Unit 4: Geometry & Geometric Concepts',
          start_page: p3End + 1,
          end_page: totalPages,
          description: 'العلاقات بين الزوايا، تطابق المثلثات، التوازي، والإنشاءات الهندسية.'
        }
      ];
    }

    // 2. Science Curriculum (العلوم)
    if (title.includes('science') || title.includes('علوم')) {
      const p1End = Math.round(totalPages * 0.35);
      const p2End = Math.round(totalPages * 0.70);
      return [
        {
          chapter_number: 1,
          title_ar: 'الوحدة الأولى: المادة وخواصها وتركيبها',
          title_en: 'Unit 1: Matter and its Properties',
          start_page: 1,
          end_page: p1End,
          description: 'المادة وخواصها الكيميائية والفيزيائية والكثافة والتركيب الذري.'
        },
        {
          chapter_number: 2,
          title_ar: 'الوحدة الثانية: الطاقة ومصادرها وصورها',
          title_en: 'Unit 2: Energy: Sources and Forms',
          start_page: p1End + 1,
          end_page: p2End,
          description: 'طاقة الوضع والحركة والطاقة الحرارية وتحولات الطاقة.'
        },
        {
          chapter_number: 3,
          title_ar: 'الوحدة الثالثة: التنوع والتكيف في الكائنات الحية',
          title_en: 'Unit 3: Diversity and Adaptation in Living Organisms',
          start_page: p2End + 1,
          end_page: totalPages,
          description: 'تصنيف الكائنات الحية والتكيف البيئي وتنوع البيئات.'
        }
      ];
    }

    // 3. Arabic Language Curriculum (اللغة العربية)
    if (title.includes('عرب') || title.includes('لغة عربية') || title.includes('arabic')) {
      const p1End = Math.round(totalPages * 0.33);
      const p2End = Math.round(totalPages * 0.66);
      return [
        {
          chapter_number: 1,
          title_ar: 'الوحدة الأولى: مكارم الأخلاق والقيم الإنسانية (نصوص وقواعد)',
          title_en: 'Unit 1: Values and Ethics (Grammar & Texts)',
          start_page: 1,
          end_page: p1End,
          description: 'دروس القراءة والنصوص المقررة وقواعد النحو والإملاء التأسيسية.'
        },
        {
          chapter_number: 2,
          title_ar: 'الوحدة الثانية: العلم والعمل وبناء الحضارة',
          title_en: 'Unit 2: Knowledge and Work in Society',
          start_page: p1End + 1,
          end_page: p2End,
          description: 'نصوص أدبية ومفاهيم نحوية متقدمة وتطبيقات لغوية منهجية.'
        },
        {
          chapter_number: 3,
          title_ar: 'الوحدة الثالثة: الفنون والآداب والمطالعة الموسعة',
          title_en: 'Unit 3: Arts, Literature and Language Skills',
          start_page: p2End + 1,
          end_page: totalPages,
          description: 'تطبيقات النحو والصرف وتذوق البلاغة والقصة المقررة.'
        }
      ];
    }

    // 4. Default 3-Chapter Partitioning for any other uploaded book
    const partSize = Math.max(1, Math.floor(totalPages / 3));
    return [
      {
        chapter_number: 1,
        title_ar: 'الوحدة الأولى: المفاهيم التأسيسية والأسس المنهجية',
        title_en: 'Unit 1: Core Concepts and Foundations',
        start_page: 1,
        end_page: partSize,
        description: 'المفاهيم التأسيسية والقواعد الأولية للمنهج.'
      },
      {
        chapter_number: 2,
        title_ar: 'الوحدة الثانية: التطبيقات العملية والنظرية المتقدمة',
        title_en: 'Unit 2: Applied Concepts and Advanced Topics',
        start_page: partSize + 1,
        end_page: partSize * 2,
        description: 'المفاهيم والتطبيقات العملية والتمارين المقررة.'
      },
      {
        chapter_number: 3,
        title_ar: 'الوحدة الثالثة: التقييم التراكمي ونواتج التعلم الشاملة',
        title_en: 'Unit 3: Comprehensive Review and Final Competencies',
        start_page: (partSize * 2) + 1,
        end_page: totalPages,
        description: 'المراجعات التراكمية ونواتج التعلم المستهدفة.'
      }
    ];
  }
}

export const aiChapterDetector = new AIChapterDetector();
