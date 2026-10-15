import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/db.js';
import { GeminiClient } from './geminiClient.js';
import { cleanArabicText } from '../../utils/arabicTextNormalizer.js';

export interface DetectedChapter {
  id?: string;
  chapter_number: number;
  title_ar: string;
  title_en: string;
  start_page: number;
  end_page: number;
  description?: string;
  description_en?: string;
}

export class AIChapterDetector {
  /**
   * Automatically analyzes textbook pages to detect Table of Contents and chapter partitions.
   * If Gemini API is configured and reachable, uses active Gemini Flash models to extract the exact chapter structure.
   * Otherwise falls back to an intelligent, content-aware structural parser that detects unit headings from actual source text.
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

    // 1. Try AI detection using Table of Contents / first 30 pages with 15s timeout
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && pages.length > 0) {
      try {
        detected = await this.callGeminiForChapters({
          bookTitleAr,
          bookTitleEn: bookTitleEn || bookTitleAr,
          totalPages,
          pagesSlice: pages.slice(0, 30)
        });
      } catch (err) {
        console.warn('⚠️ AI chapter detection fallback to structural heuristic:', err);
      }
    }

    // 2. If AI didn't return valid chapters, use universal content-aware structural parser
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

    // Invariant: Protect Existing Verified Books
    // Never delete chapters of a verified canonical book with existing valid chunks!
    const verifiedCheck = await db.query(
      `SELECT processing_status, (SELECT COUNT(*) FROM book_chunks WHERE book_id = $1) as chunk_count FROM books WHERE id = $1`,
      [bookId]
    ).catch(() => ({ rows: [] }));

    const isVerifiedCanonical = verifiedCheck.rows.length > 0 &&
      (verifiedCheck.rows[0].processing_status === 'COMPLETED' || verifiedCheck.rows[0].processing_status === 'VERIFIED_READY') &&
      Number(verifiedCheck.rows[0].chunk_count) > 0;

    if (isVerifiedCanonical) {
      console.warn(`🛡️ [AIChapterDetector] Book ${bookId} is verified canonical with active chunks. Preserving existing chapters.`);
      const existingChapters = await db.query(
        `SELECT id, chapter_number, title_ar, title_en, start_page, end_page, description FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC`,
        [bookId]
      );
      if (existingChapters.rows.length > 0) {
        return existingChapters.rows.map((r: any) => ({
          id: r.id,
          chapter_number: r.chapter_number,
          title_ar: r.title_ar,
          title_en: r.title_en,
          start_page: r.start_page,
          end_page: r.end_page,
          description: r.description
        }));
      }
    }

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
   * Uses GeminiClient to parse Table of Contents and discover all units/chapters with page boundaries.
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
- title_ar: authentic Arabic chapter/unit title (e.g. "الوحدة الأولى: ...")
- title_en: authentic English chapter/unit title (e.g. "Unit 1: ...")
- start_page: integer page number where the chapter starts
- end_page: integer page number where the chapter ends (make sure it spans until the next chapter starts or total pages)
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

    try {
      const rawResponse = await GeminiClient.generateContent({
        prompt,
        temperature: 0.1,
        timeoutMs: 15000,
        context: {
          callPurpose: 'CHAPTER_DETECTION',
          workflow: 'TEXTBOOK_INGESTION'
        }
      });

      let rawText = rawResponse.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
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
            start_page: Math.max(1, Number(item.start_page) || 1),
            end_page: Math.min(params.totalPages, Number(item.end_page) || params.totalPages),
            description: item.description || ''
          }));
        }
      }
    } catch (err: any) {
      console.warn('⚠️ Gemini chapter detection call failed:', err.message);
    }

    return [];
  }

  /**
   * Universal content-aware structural curriculum detector.
   * Scans actual page texts for unit and chapter markers (Arabic & English),
   * extracting authentic titles printed in the textbook WITHOUT any hardcoded grade or subject topics.
   */
  public detectHeuristicChapters(params: {
    bookTitleAr: string;
    bookTitleEn: string;
    totalPages: number;
    pages: { pageNumber: number; text: string }[];
  }): DetectedChapter[] {
    const { bookTitleAr, bookTitleEn, totalPages, pages } = params;

    // Handle very short booklets / test fixtures (<= 3 pages)
    if (totalPages <= 3 || pages.length <= 3) {
      return [
        {
          chapter_number: 1,
          title_ar: bookTitleAr.trim() || 'الوحدة الأولى',
          title_en: bookTitleEn.trim() || 'Unit 1',
          start_page: 1,
          end_page: Math.max(totalPages, 1),
          description: `محتوى ${bookTitleAr} ومفهرس دلالياً.`
        }
      ];
    }

    // 1. Scan extracted pages for explicit structural headings
    // Regex matches common Arabic and English unit patterns:
    // e.g. "الوحدة الأولى: ...", "الوحدة 1: ...", "الفصل الأول: ...", "المحور الأول: ...", "Unit 1: ...", "Chapter 1: ..."
    const arabicUnitRegex = /(?:^|\n)\s*(?:الوحدة|الفصل|المحور|المفهوم|الباب)\s+(الأولى|الأول|الثانية|الثاني|الثالثة|الثالث|الرابعة|الرابع|الخامسة|الخامس|السادسة|السادس|السابعة|السابع|الثامنة|الثامن|\d+)[:\s\-–—]+([^\n\r]+)/i;
    const englishUnitRegex = /(?:^|\n)\s*(?:Unit|Chapter|Module|Theme)\s+(\d+|one|two|three|four|five|six|seven|eight)[:\s\-–—]+([^\n\r]+)/i;

    interface DetectedMarker {
      chapterNumber: number;
      titleAr: string;
      titleEn: string;
      pageNumber: number;
    }

    const markers: DetectedMarker[] = [];
    const seenNumbers = new Set<number>();

    const arabicOrdinals: Record<string, number> = {
      'الأول': 1, 'الأولى': 1, '1': 1,
      'الثاني': 2, 'الثانية': 2, '2': 2,
      'الثالث': 3, 'الثالثة': 3, '3': 3,
      'الرابع': 4, 'الرابعة': 4, '4': 4,
      'الخامس': 5, 'الخامسة': 5, '5': 5,
      'السادس': 6, 'السادسة': 6, '6': 6,
      'السابع': 7, 'السابعة': 7, '7': 7,
      'الثامن': 8, 'الثامنة': 8, '8': 8
    };

    const englishOrdinals: Record<string, number> = {
      '1': 1, 'one': 1,
      '2': 2, 'two': 2,
      '3': 3, 'three': 3,
      '4': 4, 'four': 4,
      '5': 5, 'five': 5,
      '6': 6, 'six': 6,
      '7': 7, 'seven': 7,
      '8': 8, 'eight': 8
    };

    for (const page of pages) {
      if (!page.text || page.text.length < 20) continue;

      const arMatch = page.text.match(arabicUnitRegex);
      if (arMatch) {
        const rawNum = arMatch[1].trim();
        const rawTitle = arMatch[2].trim().slice(0, 100);
        const chNum = arabicOrdinals[rawNum] || parseInt(rawNum, 10) || (markers.length + 1);

        if (!seenNumbers.has(chNum) && rawTitle.length >= 3) {
          seenNumbers.add(chNum);
          markers.push({
            chapterNumber: chNum,
            titleAr: `الوحدة ${rawNum}: ${rawTitle}`,
            titleEn: `Unit ${chNum}: ${rawTitle}`,
            pageNumber: page.pageNumber
          });
        }
        continue;
      }

      const enMatch = page.text.match(englishUnitRegex);
      if (enMatch) {
        const rawNum = enMatch[1].trim().toLowerCase();
        const rawTitle = enMatch[2].trim().slice(0, 100);
        const chNum = englishOrdinals[rawNum] || parseInt(rawNum, 10) || (markers.length + 1);

        if (!seenNumbers.has(chNum) && rawTitle.length >= 3) {
          seenNumbers.add(chNum);
          markers.push({
            chapterNumber: chNum,
            titleAr: `Unit ${chNum}: ${rawTitle}`,
            titleEn: `Unit ${chNum}: ${rawTitle}`,
            pageNumber: page.pageNumber
          });
        }
      }
    }

    // Sort markers by chapter number
    markers.sort((a, b) => a.chapterNumber - b.chapterNumber);

    // If we discovered at least 2 authentic structural markers from the page text, construct chapters
    if (markers.length >= 2) {
      const chapters: DetectedChapter[] = [];
      for (let i = 0; i < markers.length; i++) {
        const current = markers[i];
        const next = markers[i + 1];

        const startPage = i === 0 ? 1 : current.pageNumber;
        const endPage = next ? Math.max(startPage, next.pageNumber - 1) : totalPages;

        chapters.push({
          chapter_number: i + 1,
          title_ar: current.titleAr,
          title_en: current.titleEn,
          start_page: startPage,
          end_page: endPage,
          description: `المحتوى التعليمي المقرر في ${current.titleAr} ومفهرس دلالياً.`
        });
      }
      return chapters;
    }

    // 2. Default Content-Aware Partitioning (Universal across all subjects/grades)
    // Partitions dynamically into proportional units using the authentic book title.
    // Zero hardcoded Prep 1 titles!
    const numPartitions = totalPages >= 80 ? 4 : (totalPages >= 30 ? 3 : 2);
    const partSize = Math.max(1, Math.floor(totalPages / numPartitions));
    const chapters: DetectedChapter[] = [];

    const ordinalsAr = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة'];
    const ordinalsEn = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];

    for (let i = 0; i < numPartitions; i++) {
      const startPage = i === 0 ? 1 : (i * partSize) + 1;
      const endPage = (i === numPartitions - 1) ? totalPages : (i + 1) * partSize;
      const ordAr = ordinalsAr[i] || `${i + 1}`;
      const ordEn = ordinalsEn[i] || `${i + 1}`;

      chapters.push({
        chapter_number: i + 1,
        title_ar: `الوحدة ${ordAr}: محتوى ${bookTitleAr} (الجزء ${i + 1})`,
        title_en: `Unit ${ordEn}: ${bookTitleEn || 'Content'} (Part ${i + 1})`,
        start_page: startPage,
        end_page: endPage,
        description: `المحتوى التعليمي التأسيسي للمنهج المقرر والمفهرس دلالياً.`
      });
    }

    return chapters;
  }
}

export const aiChapterDetector = new AIChapterDetector();
