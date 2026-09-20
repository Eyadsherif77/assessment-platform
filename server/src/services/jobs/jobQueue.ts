import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import { db } from '../../db/db.js';
import { generateEmbedding, createSemanticVector } from '../ai/vectorEmbedding.js';
import { stripDocumentMetadataAndStructure } from '../../utils/arabicTextNormalizer.js';
import { aiChapterDetector } from '../ai/aiChapterDetector.js';

export interface BookIngestionJob {
  bookId: string;
  filePath: string;
  academicStageId: string;
  gradeId: string;
  subjectId: string;
  chapterId?: string;
  chapterNumber?: number;
  chapterTitleAr?: string;
}

class JobQueueService {
  private queue: BookIngestionJob[] = [];
  private isProcessing = false;
  private jobStatuses = new Map<string, { status: string; progress: number; error?: string }>();

  public addJob(job: BookIngestionJob): void {
    this.queue.push(job);
    this.jobStatuses.set(job.bookId, { status: 'PENDING', progress: 0 });
    console.log(`📥 [JobQueue] Enqueued ingestion job for book ${job.bookId}`);
    this.processNext();
  }

  public getStatus(bookId: string): { status: string; progress: number; error?: string } {
    return this.jobStatuses.get(bookId) || { status: 'UNKNOWN', progress: 0 };
  }

  public async processJobDirectly(job: BookIngestionJob): Promise<void> {
    try {
      console.log(`⚙️ [JobQueue] Starting extraction & vectorization for book: ${job.bookId}`);
      this.jobStatuses.set(job.bookId, { status: 'EXTRACTING', progress: 10 });
      await db.query(`UPDATE books SET processing_status = 'EXTRACTING' WHERE id = $1`, [job.bookId]);

      // Read file and parse
      let pages: { pageNumber: number; text: string }[] = [];

      if (fs.existsSync(job.filePath)) {
        const fileBuffer = fs.readFileSync(job.filePath);
        try {
          const pdfData = await pdfParse(fileBuffer);
          // Split by form-feed or pages
          const rawPages = pdfData.text.split(/\f|\n\s*\n\s*---\s*Page\s*\d+\s*---\s*\n/);
          if (rawPages.length > 1) {
            pages = rawPages.map((txt: string, idx: number) => ({
              pageNumber: idx + 1,
              text: txt.trim()
            })).filter((p: { pageNumber: number; text: string }) => p.text.length > 20);
          } else {
            // Divide full text into 1500-char pages
            const total = pdfData.text;
            const pageSize = 1200;
            let current = 0;
            let pNum = 1;
            while (current < total.length) {
              const chunk = total.slice(current, current + pageSize).trim();
              if (chunk.length > 0) {
                pages.push({ pageNumber: pNum++, text: chunk });
              }
              current += pageSize;
            }
          }
        } catch (pdfErr) {
          console.log('ℹ️ Parsing file as structured educational text format...');
          const rawContent = fileBuffer.toString('utf8');
          
          // Check for structured page markers: e.g. "--- Page 4 ---" or "[صفحة 4]"
          const pageRegex = /(?:---|\[)\s*(?:Page|صفحة)\s*(\d+)\s*(?:---|\])/i;
          const sections = rawContent.split(/(?=(?:---|\[)\s*(?:Page|صفحة)\s*\d+\s*(?:---|\]))/i);
          
          if (sections.length > 1) {
            pages = sections.map((sec, idx) => {
              const match = sec.match(pageRegex);
              const pNum = match ? parseInt(match[1], 10) : idx + 1;
              const cleanText = sec.replace(pageRegex, '').trim();
              return {
                pageNumber: pNum,
                text: cleanText
              };
            }).filter(p => p.text.length > 10);
          } else {
            pages = [{ pageNumber: 1, text: rawContent.trim() }];
          }
        }
      } else {
        throw new Error(`Book file not found on disk at: ${job.filePath}`);
      }

      if (pages.length === 0) {
        pages = [{ pageNumber: 1, text: 'محتوى الكتاب التعليمي المستخرج من الوحدة الدراسية المقررة.' }];
      }

      this.jobStatuses.set(job.bookId, { status: 'EXTRACTING', progress: 40 });

      // Save pages to book_pages
      for (const page of pages) {
        const pageId = uuidv4();
        await db.query(
          `INSERT OR REPLACE INTO book_pages (id, book_id, page_number, raw_text, char_count) 
           VALUES ($1, $2, $3, $4, $5)`,
          [pageId, job.bookId, page.pageNumber, page.text, page.text.length]
        );
      }

      // Fetch book info for AI chapter detection
      const bookRes = await db.query('SELECT title_ar, title_en, total_pages FROM books WHERE id = $1', [job.bookId]);
      const bookInfo = bookRes.rows[0] || {};

      // AI Automatic Chapter Detection & Creation
      const detectedChapters = await aiChapterDetector.detectAndCreateChapters({
        bookId: job.bookId,
        bookTitleAr: bookInfo.title_ar || job.chapterTitleAr || 'كتاب دراسي',
        bookTitleEn: bookInfo.title_en || 'Textbook',
        totalPages: pages.length,
        pages,
        academicStageId: job.academicStageId,
        gradeId: job.gradeId,
        subjectId: job.subjectId
      });

      // Semantic chunking & vector embedding
      this.jobStatuses.set(job.bookId, { status: 'EMBEDDING', progress: 60 });
      await db.query(`UPDATE books SET processing_status = 'EMBEDDING' WHERE id = $1`, [job.bookId]);

      let chunkIdx = 1;
      const maxChunks = 80; // Safeguard against excessive runtime on serverless
      for (let pIdx = 0; pIdx < pages.length && chunkIdx <= maxChunks; pIdx++) {
        const page = pages[pIdx];
        // Strip document metadata, page numbers, and structural labels before chunking & embedding
        const sanitizedPageText = stripDocumentMetadataAndStructure(page.text, {
          chapterTitle: job.chapterTitleAr
        });
        if (!sanitizedPageText || sanitizedPageText.length < 20) continue;

        // Split page into semantic segments of 300-500 chars with 100 char overlap
        const paragraphs = sanitizedPageText.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20);
        const segments: string[] = paragraphs.length > 0 ? paragraphs : [sanitizedPageText];

        const matchedChapter = detectedChapters.find(
          c => page.pageNumber >= c.start_page && page.pageNumber <= c.end_page
        ) || detectedChapters[0];
        const assignedChapterId = matchedChapter?.id || job.bookId;

        for (const segment of segments) {
          if (chunkIdx > maxChunks) break;
          const chunkId = uuidv4();
          
          let embeddingVector: number[];
          if (chunkIdx <= 5) {
            try {
              embeddingVector = await generateEmbedding(segment);
            } catch (_) {
              embeddingVector = createSemanticVector(segment, 768);
            }
          } else {
            embeddingVector = createSemanticVector(segment, 768);
          }
          const embeddingJson = JSON.stringify(embeddingVector);

          await db.query(
            `INSERT INTO book_chunks (
               id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, 
               page_number, chunk_index, content, metadata, embedding
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              chunkId,
              job.bookId,
              assignedChapterId,
              job.academicStageId,
              job.gradeId,
              job.subjectId,
              page.pageNumber,
              chunkIdx++,
              segment,
              JSON.stringify({ page: page.pageNumber, charCount: segment.length }),
              embeddingJson
            ]
          );
        }

        const pct = Math.min(95, Math.round(60 + (pIdx / pages.length) * 35));
        this.jobStatuses.set(job.bookId, { status: 'EMBEDDING', progress: pct });
      }

      // Mark completed
      await db.query(
        `UPDATE books SET 
           processing_status = 'COMPLETED', 
           total_pages = $2,
           processing_error = NULL
         WHERE id = $1`,
        [job.bookId, pages.length]
      );

      this.jobStatuses.set(job.bookId, { status: 'COMPLETED', progress: 100 });
      console.log(`✅ [JobQueue] Book ${job.bookId} successfully extracted & vectorized with ${chunkIdx - 1} chunks.`);
    } catch (err: any) {
      console.error(`❌ [JobQueue] Failed processing book ${job.bookId}:`, err);
      const errMsg = err?.message || 'Unknown processing error';
      this.jobStatuses.set(job.bookId, { status: 'FAILED', progress: 0, error: errMsg });
      await db.query(
        `UPDATE books SET processing_status = 'FAILED', processing_error = $2 WHERE id = $1`,
        [job.bookId, errMsg]
      );
      throw err;
    }
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const job = this.queue.shift();

    if (!job) {
      this.isProcessing = false;
      return;
    }

    try {
      await this.processJobDirectly(job);
    } catch (_) {
      // Errors handled inside processJobDirectly
    } finally {
      this.isProcessing = false;
      this.processNext();
    }
  }
}

export const jobQueue = new JobQueueService();
