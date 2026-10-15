import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import pdfParse from 'pdf-parse';
import { PDFDocument } from 'pdf-lib';
import { db } from '../db/db.js';
import { aiChapterDetector, DetectedChapter } from './ai/aiChapterDetector.js';
import { VisualAssetExtractor } from './ai/visualAssetExtractor.js';
import { ReadinessValidator, UnitReadinessStatus } from './readinessValidator.js';
import { getStorageProvider, IStorageProvider } from './storage/storageProvider.js';
import { cleanArabicText } from '../utils/arabicTextNormalizer.js';
import { createSemanticVector } from './ai/vectorEmbedding.js';
import { DurableIngestionJobService } from './jobs/durableIngestionJobService.js';
import { GeminiOcrService } from './ai/geminiOcrService.js';

export type IngestionLifecycleStatus =
  | 'RECEIVED'
  | 'PROCESSING'
  | 'VALIDATING'
  | 'VERIFIED_READY'
  | 'BLOCKED'
  | 'REQUIRES_REMEDIATION';

export interface IngestionDiagnosticIssue {
  stage: string;
  code: string;
  pageNumber?: number;
  chapterNumber?: number;
  unitTitle?: string;
  message: string;
  remediationGuidance: string;
}

export interface IngestionUnitReport {
  chapterId: string;
  chapterNumber: number;
  titleAr: string;
  titleEn: string;
  startPage: number;
  endPage: number;
  totalChunks: number;
  totalCharacters: number;
  visualAssetCount: number;
  readinessStatus: UnitReadinessStatus;
  visualDependencies: string;
  issues: IngestionDiagnosticIssue[];
}

export interface IngestionReport {
  bookId: string;
  titleAr: string;
  titleEn: string;
  fileChecksum: string;
  fileSizeBytes: number;
  totalPages: number;
  status: IngestionLifecycleStatus;
  isPublished: boolean;
  storageDurable: boolean;
  storageUrl: string;
  units: IngestionUnitReport[];
  issues: IngestionDiagnosticIssue[];
  processingDurationMs: number;
}

export interface BookIngestionParams {
  bookId?: string;
  pdfBuffer: Buffer;
  fileName?: string;
  titleAr: string;
  titleEn?: string;
  academicStageId: string;
  gradeId: string;
  subjectId: string;
  schoolType?: string;
  term?: number;
  teacherId?: string;
  options?: {
    ocrProvider?: (pageNumber: number, pageBuffer: Buffer) => Promise<string | null>;
    visualRequirements?: 'GEOMETRY_DIAGRAMS' | 'CARTOGRAPHIC_MAPS' | 'SCIENCE_DIAGRAMS' | 'NONE';
    forceReingest?: boolean;
  };
}

export class BookIngestionService {
  // Concurrency limitation note:
  // inFlightJobs locks concurrent uploads on the same PDF SHA-256 + curriculum tuple within
  // the current Node.js process. In multi-instance serverless deployments (such as Vercel),
  // instances do not share memory; cross-instance data integrity is protected by generating
  // unique UUID bookIds and by Stage 2 database deduplication queries once any instance
  // completes. A distributed Redis/advisory lock would require schema/infra changes.
  private static inFlightJobs = new Map<string, Promise<IngestionReport>>();

  /**
   * Validate chapter boundary sanity (no negative ranges, no out of bounds, no overlapping chapters)
   */
  public static validateChapterBoundaries(
    chapters: DetectedChapter[],
    totalPages: number
  ): { valid: boolean; issues: IngestionDiagnosticIssue[] } {
    const issues: IngestionDiagnosticIssue[] = [];

    if (!chapters || chapters.length === 0) {
      issues.push({
        stage: 'CHAPTER_MAPPING',
        code: 'NO_CHAPTERS_DETECTED',
        message: 'لم يتم العثور على أي فصول أو وحدات دراسية في الكتاب.',
        remediationGuidance: 'تأكد من وضوح الفهرس وعناوين الوحدات في الصفحات الأولى للكتاب.'
      });
      return { valid: false, issues };
    }

    // Sort chapters by start_page ascending
    const sorted = [...chapters].sort((a, b) => a.start_page - b.start_page);

    for (let i = 0; i < sorted.length; i++) {
      const ch = sorted[i];

      // 1. Range orientation check
      if (ch.start_page > ch.end_page) {
        issues.push({
          stage: 'CHAPTER_MAPPING',
          code: 'INVERTED_PAGE_RANGE',
          chapterNumber: ch.chapter_number,
          unitTitle: ch.title_ar,
          message: `نطاق صفحات الفصل (${ch.title_ar}) غير صالح: يبدأ في ${ch.start_page} وينتهي في ${ch.end_page}.`,
          remediationGuidance: 'يجب أن يكون رقم صفحة البداية أصغر من أو يساوي صفحة النهاية.'
        });
      }

      // 2. Out of bounds check
      if (ch.start_page < 1 || ch.end_page > totalPages) {
        issues.push({
          stage: 'CHAPTER_MAPPING',
          code: 'OUT_OF_BOUNDS_PAGE_RANGE',
          chapterNumber: ch.chapter_number,
          unitTitle: ch.title_ar,
          message: `نطاق صفحات الفصل (${ch.title_ar}) خارج حدود الكتاب: 1 إلى ${totalPages}.`,
          remediationGuidance: 'عدل نطاق الصفحات ليكون ضمن إجمالي صفحات ملف الكتاب.'
        });
      }

      // 3. Overlapping chapter check
      if (i > 0) {
        const prev = sorted[i - 1];
        if (ch.start_page <= prev.end_page) {
          issues.push({
            stage: 'CHAPTER_MAPPING',
            code: 'OVERLAPPING_CHAPTER_RANGES',
            chapterNumber: ch.chapter_number,
            unitTitle: ch.title_ar,
            message: `تداخل بين الفصل "${prev.title_ar}" (ينتهي ص ${prev.end_page}) والفصل "${ch.title_ar}" (يبدأ ص ${ch.start_page}).`,
            remediationGuidance: 'تأكد من عدم تداخل صفحات الوحدات الدراسية المتتالية.'
          });
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Main unified entry point: Ingest, extract, partition, audit, and safely publish a textbook
   */
  public static async ingestTextbook(params: BookIngestionParams): Promise<IngestionReport> {
    const startTime = Date.now();
    const {
      pdfBuffer,
      titleAr,
      titleEn = titleAr,
      academicStageId,
      gradeId,
      subjectId,
      schoolType = 'كلاهما',
      term = 1,
      teacherId,
      fileName,
      options = {}
    } = params;

    // Compute deterministic checksum
    const fileChecksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    const lockKey = `${fileChecksum}::${academicStageId}::${gradeId}::${subjectId}::${term}`;

    // Prevent concurrent duplicate runs on the same buffer
    if (this.inFlightJobs.has(lockKey)) {
      console.log(`🔒 [BookIngestionService] Concurrent ingestion detected for checksum ${fileChecksum.slice(0, 8)}. Awaiting existing job.`);
      return await this.inFlightJobs.get(lockKey)!;
    }

    const jobPromise = this.executeIngestionWorkflow(params, fileChecksum, startTime);
    this.inFlightJobs.set(lockKey, jobPromise);

    try {
      return await jobPromise;
    } finally {
      this.inFlightJobs.delete(lockKey);
    }
  }

  /**
   * Core execution pipeline coordinating Stages 1 through 11
   */
  private static async executeIngestionWorkflow(
    params: BookIngestionParams,
    fileChecksum: string,
    startTime: number
  ): Promise<IngestionReport> {
    const {
      pdfBuffer,
      titleAr,
      titleEn = titleAr,
      academicStageId,
      gradeId,
      subjectId,
      schoolType = 'كلاهما',
      term = 1,
      teacherId,
      fileName,
      options = {}
    } = params;

    const bookId = params.bookId || uuidv4();
    const issues: IngestionDiagnosticIssue[] = [];

    // =========================================================================
    // STAGE 0: Durable Relational Job Registration & Atomic Claiming
    // =========================================================================
    const workerId = `worker_${uuidv4().slice(0, 8)}`;
    let jobRecord: any = null;
    try {
      jobRecord = await DurableIngestionJobService.createOrGetJob({
        bookId,
        fileChecksum,
        initialCheckpoint: { titleAr, titleEn }
      });
      await DurableIngestionJobService.claimJob(jobRecord.id, workerId);
    } catch (jobErr: any) {
      console.warn('⚠️ [BookIngestionService] Durable job registration notice:', jobErr.message);
    }

    const checkpoint = jobRecord?.checkpointData || {};

    // =========================================================================
    // STAGE 1: File Integrity and Validation
    // =========================================================================
    if (!pdfBuffer || pdfBuffer.length < 100) {
      issues.push({
        stage: 'FILE_VALIDATION',
        code: 'FILE_TOO_SMALL',
        message: 'الملف المرفوع فارغ أو حجمه أقل من الحد الأدنى المقبول (100 بايت).',
        remediationGuidance: 'يرجى رفع ملف كتاب PDF صحيح وكامل.'
      });
      return this.buildFailureReport(bookId, titleAr, titleEn, fileChecksum, pdfBuffer?.length || 0, 0, 'BLOCKED', issues, startTime);
    }

    const magicHeader = pdfBuffer.slice(0, 4).toString('ascii');
    if (magicHeader !== '%PDF') {
      issues.push({
        stage: 'FILE_VALIDATION',
        code: 'INVALID_PDF_HEADER',
        message: `ملف غير صالح: ترويسة الملف "${magicHeader}" لا تطابق معيار PDF (%PDF).`,
        remediationGuidance: 'تأكد من أن الملف هو مستند PDF حقيقي وليس ملفاً معاد تسميته.'
      });
      return this.buildFailureReport(bookId, titleAr, titleEn, fileChecksum, pdfBuffer.length, 0, 'BLOCKED', issues, startTime);
    }

    // =========================================================================
    // INVARIANT GUARD (Phase 4G.3AG): Protect Existing Verified Books
    // A verified canonical book with existing valid pages or chunks must never
    // have its existing content deleted as part of an ordinary new-book upload or retry.
    // =========================================================================
    const verifiedCanonicalCheck = await db.query(
      `SELECT b.id, b.title_ar, b.total_pages, b.processing_status,
              (SELECT COUNT(*) FROM book_chunks WHERE book_id = b.id) as chunk_count,
              (SELECT COUNT(*) FROM book_pages WHERE book_id = b.id) as page_count
       FROM books b WHERE b.id = $1`,
      [bookId]
    ).catch(() => ({ rows: [] }));

    const existingCanonicalRow = verifiedCanonicalCheck.rows[0];
    const hasCanonicalContent = existingCanonicalRow &&
      (Number(existingCanonicalRow.chunk_count) > 0 || Number(existingCanonicalRow.page_count) > 0);
    const isVerifiedCanonicalBook = existingCanonicalRow &&
      (existingCanonicalRow.processing_status === 'COMPLETED' || existingCanonicalRow.processing_status === 'VERIFIED_READY') &&
      hasCanonicalContent;

    if (isVerifiedCanonicalBook) {
      if (!options.forceReingest) {
        console.log(`ℹ️ [BookIngestionService] Book ${bookId} is already verified canonical. Returning idempotent ready report.`);
        return {
          bookId,
          titleAr: existingCanonicalRow.title_ar || titleAr,
          titleEn,
          fileChecksum,
          fileSizeBytes: pdfBuffer.length,
          totalPages: existingCanonicalRow.total_pages || 1,
          status: 'VERIFIED_READY',
          isPublished: true,
          storageDurable: getStorageProvider().isDurable(),
          storageUrl: getStorageProvider().getUrl(`books/${bookId}/book_${bookId}.pdf`),
          units: [],
          issues: [],
          processingDurationMs: Date.now() - startTime
        };
      } else {
        console.warn(`🛑 [BookIngestionService] Attempted in-place replacement of verified canonical book ${bookId} rejected.`);
        issues.push({
          stage: 'PERSISTENCE_SAFETY',
          code: 'CANNOT_OVERWRITE_VERIFIED_BOOK',
          message: 'الكتاب معتمد ومفهرس بالفعل. استبدال نفس السجل في مكانه محظور لحماية البيانات المعتمدة.',
          remediationGuidance: 'لحماية المحتوى المعتمد، لا يمكن استبدال الكتاب المعتمد في مكانه. يرجى رفع نسخة جديدة بمعرف مستقل.'
        });
        return this.buildFailureReport(bookId, titleAr, titleEn, fileChecksum, pdfBuffer.length, 0, 'BLOCKED', issues, startTime);
      }
    }

    // =========================================================================
    // STAGE 2: Duplicate Detection
    // =========================================================================
    try {
      const existingBook = await db.query(
        `SELECT id, title_ar, total_pages, processing_status FROM books 
         WHERE academic_stage_id = $1 AND grade_id = $2 AND subject_id = $3 AND term = $4 AND title_ar = $5
         LIMIT 1`,
        [academicStageId, gradeId, subjectId, term, titleAr.trim()]
      );

      if (existingBook.rows.length > 0 && (existingBook.rows[0].processing_status === 'COMPLETED' || existingBook.rows[0].processing_status === 'VERIFIED_READY')) {
        if (!options.forceReingest) {
          console.log(`ℹ️ [BookIngestionService] Identical book already exists and verified ready (Book ID: ${existingBook.rows[0].id}). Returning idempotent report.`);
          return {
            bookId: existingBook.rows[0].id,
            titleAr: existingBook.rows[0].title_ar,
            titleEn,
            fileChecksum,
            fileSizeBytes: pdfBuffer.length,
            totalPages: existingBook.rows[0].total_pages || 1,
            status: 'VERIFIED_READY',
            isPublished: true,
            storageDurable: getStorageProvider().isDurable(),
            storageUrl: getStorageProvider().getUrl(`books/${existingBook.rows[0].id}/book_${existingBook.rows[0].id}.pdf`),
            units: [],
            issues: [],
            processingDurationMs: Date.now() - startTime
          };
        } else {
          console.warn(`🛑 [BookIngestionService] Attempted in-place duplicate replacement of verified canonical book ${existingBook.rows[0].id} rejected.`);
          issues.push({
            stage: 'PERSISTENCE_SAFETY',
            code: 'CANNOT_OVERWRITE_VERIFIED_BOOK',
            message: 'يوجد كتاب معتمد ومفهرس بالفعل بنفس البيانات المنهجية. استبدال الكتاب المعتمد في مكانه محظور.',
            remediationGuidance: 'لحماية المحتوى المعتمد، يرجى استخدام معرف مستقل أو تعديل بيانات المقرر.'
          });
          return this.buildFailureReport(existingBook.rows[0].id, titleAr, titleEn, fileChecksum, pdfBuffer.length, 0, 'BLOCKED', issues, startTime);
        }
      }
    } catch (dbErr) {
      // Continue if read-only / test DB doesn't have the table or record
    }

    // =========================================================================
    // STAGE 3: Genuine Page-by-Page PDF Text Extraction
    // =========================================================================
    let totalPages = 1;
    let extractedPages: { pageNumber: number; text: string; charCount: number }[] = [];

    // Checkpoint resumption: If pages were already extracted in a prior worker attempt, reuse them
    if (checkpoint.extractedPages && Array.isArray(checkpoint.extractedPages) && checkpoint.extractedPages.length > 0) {
      console.log(`♻️ [BookIngestionService] Resuming from checkpoint: ${checkpoint.extractedPages.length} extracted pages.`);
      extractedPages = checkpoint.extractedPages;
      totalPages = checkpoint.totalPages || extractedPages.length;
    } else {
      try {
        const parsed = await pdfParse(pdfBuffer);
        totalPages = parsed.numpages || 1;
        const rawText = parsed.text || '';

        const splitPages = rawText
          .split(/\f|\n\s*\n\s*---\s*Page\s*\d+\s*---\s*\n/)
          .map((s: string) => cleanArabicText(s.trim()));

        if (splitPages.length > 1) {
          extractedPages = splitPages.map((txt: string, idx: number) => ({
            pageNumber: idx + 1,
            text: txt,
            charCount: txt.length
          }));
        } else {
          const cleaned = cleanArabicText(rawText);
          const pageSize = Math.max(800, Math.ceil(cleaned.length / totalPages));
          let cur = 0;
          let pNum = 1;
          while (cur < cleaned.length) {
            const chunk = cleaned.slice(cur, cur + pageSize).trim();
            if (chunk.length > 0) {
              extractedPages.push({ pageNumber: pNum++, text: chunk, charCount: chunk.length });
            }
            cur += pageSize;
          }
        }

        // Account for any remaining empty pages
        totalPages = Math.max(totalPages, extractedPages.length, 1);
        if (extractedPages.length === 0) {
          for (let pNum = 1; pNum <= totalPages; pNum++) {
            extractedPages.push({ pageNumber: pNum, text: '', charCount: 0 });
          }
        }

        if (jobRecord) {
          await DurableIngestionJobService.saveCheckpoint(jobRecord.id, workerId, 'EXTRACTING_PAGES', {
            totalPages,
            extractedPageCount: extractedPages.length
          }).catch(() => {});
        }
      } catch (parseErr: any) {
        issues.push({
          stage: 'PAGE_EXTRACTION',
          code: 'PDF_PARSE_FAILED',
          message: `فشل قراءة نصوص صفحات PDF: ${parseErr.message}`,
          remediationGuidance: 'تحقق من سلامة تشفير وضغط ملف الـ PDF.'
        });
        if (jobRecord) {
          await DurableIngestionJobService.markFailed(jobRecord.id, workerId, `PDF parse failed: ${parseErr.message}`, false).catch(() => {});
        }
        return this.buildFailureReport(bookId, titleAr, titleEn, fileChecksum, pdfBuffer.length, 0, 'BLOCKED', issues, startTime);
      }
    }

    // Ensure all totalPages are accounted for in extractedPages
    totalPages = Math.max(totalPages, extractedPages.length, 1);
    if (extractedPages.length === 0) {
      for (let pNum = 1; pNum <= totalPages; pNum++) {
        extractedPages.push({ pageNumber: pNum, text: '', charCount: 0 });
      }
    }

    // =========================================================================
    // STAGE 4 & 5: Detect Scanned/Low-Text Pages & Multimodal OCR Handling
    // =========================================================================
    const lowTextThresholdChars = 35;
    const lowTextPages = extractedPages.filter(p => p.charCount < lowTextThresholdChars);

    if (lowTextPages.length > 0) {
      console.log(`⚠️ [BookIngestionService] Detected ${lowTextPages.length} low-text/scanned pages.`);
      const ocrResults: Record<number, string> = checkpoint.ocrResults || {};

      for (const lp of lowTextPages) {
        // Reuse page-level checkpoint if already OCR'd in previous attempt
        if (ocrResults[lp.pageNumber] && ocrResults[lp.pageNumber].length >= lowTextThresholdChars) {
          lp.text = ocrResults[lp.pageNumber];
          lp.charCount = lp.text.length;
          continue;
        }

        try {
          let ocrText = '';
          if (options.ocrProvider) {
            ocrText = (await options.ocrProvider(lp.pageNumber, pdfBuffer)) || '';
          } else {
            const ocrRes = await GeminiOcrService.ocrPage({
              bookId,
              pageNumber: lp.pageNumber,
              fullPdfBuffer: pdfBuffer
            });
            if (ocrRes.status === 'EXTRACTED') {
              ocrText = ocrRes.text;
            } else if (ocrRes.status === 'FAILED_RETRYABLE') {
              console.warn(`⏳ [BookIngestionService] OCR hit retryable state on page ${lp.pageNumber}. Checkpoint saved.`);
              if (jobRecord) {
                await DurableIngestionJobService.saveCheckpoint(jobRecord.id, workerId, 'OCR_PROCESSING', {
                  ocrResults
                }).catch(() => {});
                await DurableIngestionJobService.markFailed(jobRecord.id, workerId, `OCR retryable on page ${lp.pageNumber}: ${ocrRes.error}`, true).catch(() => {});
              }
              issues.push({
                stage: 'OCR_HANDLING',
                code: 'OCR_PROVIDER_TEMPORARILY_UNAVAILABLE',
                pageNumber: lp.pageNumber,
                message: `مزود التعرف الضوئي OCR غير متاح مؤقتاً للصفحة ${lp.pageNumber} (${ocrRes.error || 'Rate limit / timeout'}). تم حفظ تقدم المعالجة لاستئنافها آلياً.`,
                remediationGuidance: 'سيتم استئناف قراءة الصفحات المتبقية آلياً عند توفر الحصة.'
              });
              return this.buildFailureReport(bookId, titleAr, titleEn, fileChecksum, pdfBuffer.length, totalPages, 'REQUIRES_REMEDIATION', issues, startTime);
            }
          }

          if (ocrText && ocrText.trim().length >= lowTextThresholdChars) {
            const cleanedOcr = cleanArabicText(ocrText.trim());
            lp.text = cleanedOcr;
            lp.charCount = cleanedOcr.length;
            ocrResults[lp.pageNumber] = cleanedOcr;

            if (jobRecord) {
              await DurableIngestionJobService.saveCheckpoint(jobRecord.id, workerId, 'OCR_PROCESSING', {
                ocrResults
              }).catch(() => {});
            }
          }
        } catch (ocrErr: any) {
          console.warn(`OCR exception for page ${lp.pageNumber}:`, ocrErr.message);
        }
      }

      // Re-check after OCR attempt
      const unresolvedLowTextPages = extractedPages.filter(p => p.charCount < lowTextThresholdChars);
      if (unresolvedLowTextPages.length > 0) {
        const pageNumbers = unresolvedLowTextPages.map(p => p.pageNumber);
        issues.push({
          stage: 'OCR_HANDLING',
          code: 'UNRESOLVED_SCANNED_PAGES',
          message: `الصفحات [${pageNumbers.slice(0, 10).join(', ')}${pageNumbers.length > 10 ? '...' : ''}] تحتوي على صور ممسوحة أو نصوص غير قابلة للاستخراج، ومزود OCR لم يستطع قراءتها بالكامل.`,
          remediationGuidance: 'قم برفع نسخة رقمية أصلية أو فحص جودة الصفحات الممسوحة ضوئياً.'
        });

        if (jobRecord) {
          await DurableIngestionJobService.markFailed(jobRecord.id, workerId, `Unresolved scanned pages: ${pageNumbers.join(', ')}`, false).catch(() => {});
        }

        // Fail-closed: Never generate synthetic placeholder text!
        return this.buildFailureReport(bookId, titleAr, titleEn, fileChecksum, pdfBuffer.length, totalPages, 'REQUIRES_REMEDIATION', issues, startTime);
      }
    }

    // Ensure we have extractable content
    if (extractedPages.length === 0 || extractedPages.every(p => p.charCount < lowTextThresholdChars)) {
      issues.push({
        stage: 'PAGE_EXTRACTION',
        code: 'NO_EXTRACTABLE_TEXT',
        message: 'الملف لا يحتوي على أي نصوص قابلة للاستخراج باللغة العربية.',
        remediationGuidance: 'الكتاب ممسوح ضوئياً بالكامل ويحتاج إلى معالجة OCR متقدمة قبل الإدراج.'
      });
      return this.buildFailureReport(bookId, titleAr, titleEn, fileChecksum, pdfBuffer.length, totalPages, 'REQUIRES_REMEDIATION', issues, startTime);
    }

    // Ensure book record exists before chapter detection so foreign keys resolve
    try {
      const existing = await db.query('SELECT id FROM books WHERE id = $1', [bookId]);
      if (existing.rows.length === 0) {
        try {
          await db.query(
            `INSERT INTO books (
               id, title_ar, title_en, academic_stage_id, grade_id, subject_id, teacher_id,
               file_url, file_size, total_pages, school_type, term, processing_status
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING')`,
            [
              bookId,
              titleAr.trim(),
              titleEn.trim(),
              academicStageId,
              gradeId,
              subjectId,
              teacherId || null,
              fileName ? `/uploads/${fileName}` : `/uploads/book_${bookId}.pdf`,
              pdfBuffer.length,
              totalPages,
              schoolType,
              term
            ]
          );
        } catch (_) {
          await db.query(
            `INSERT INTO books (
               id, title_ar, title_en, academic_stage_id, grade_id, subject_id, teacher_id,
               file_url, file_size, total_pages, processing_status
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING')`,
            [
              bookId,
              titleAr.trim(),
              titleEn.trim(),
              academicStageId,
              gradeId,
              subjectId,
              teacherId || null,
              fileName ? `/uploads/${fileName}` : `/uploads/book_${bookId}.pdf`,
              pdfBuffer.length,
              totalPages
            ]
          );
        }
      }
    } catch (e: any) {
      console.warn('⚠️ [BookIngestionService] Initial book insert notice:', e.message);
    }

    // =========================================================================
    // STAGE 6: Chapter & Unit Detection & Boundary Validation
    // =========================================================================
    let detectedChapters: DetectedChapter[] = [];
    if (checkpoint.detectedChapters && Array.isArray(checkpoint.detectedChapters) && checkpoint.detectedChapters.length > 0) {
      console.log(`♻️ [BookIngestionService] Resuming from checkpoint: ${checkpoint.detectedChapters.length} detected chapters.`);
      detectedChapters = checkpoint.detectedChapters;
    } else {
      detectedChapters = await aiChapterDetector.detectAndCreateChapters({
        bookId,
        bookTitleAr: titleAr.trim(),
        bookTitleEn: titleEn.trim(),
        totalPages,
        pages: extractedPages,
        academicStageId,
        gradeId,
        subjectId
      });

      if (jobRecord) {
        await DurableIngestionJobService.saveCheckpoint(jobRecord.id, workerId, 'DETECTING_CHAPTERS', {
          detectedChapters
        }).catch(() => {});
      }
    }

    const boundaryCheck = this.validateChapterBoundaries(detectedChapters, totalPages);
    if (!boundaryCheck.valid) {
      issues.push(...boundaryCheck.issues);
      if (jobRecord) {
        await DurableIngestionJobService.markFailed(
          jobRecord.id,
          workerId,
          boundaryCheck.issues.map(i => i.message).join('; '),
          false
        ).catch(() => {});
      }
      return this.buildFailureReport(bookId, titleAr, titleEn, fileChecksum, pdfBuffer.length, totalPages, 'BLOCKED', issues, startTime);
    }

    // =========================================================================
    // STAGE 7: Chunking with Authoritative Provenance
    // =========================================================================
    interface ChunkRecord {
      id: string;
      bookId: string;
      chapterId: string;
      pageNumber: number;
      chunkIndex: number;
      content: string;
      charCount: number;
      embedding: string;
    }

    const allChunks: ChunkRecord[] = [];
    const chapterChunkCountMap = new Map<string, number>();
    const chapterCharCountMap = new Map<string, number>();

    let globalChunkIdx = 1;
    for (const page of extractedPages) {
      if (!page.text || page.charCount < 15) continue;

      let segments: string[] = [];
      const rawParas = page.text
        .split(/\n+/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 20);

      if (rawParas.length > 1) {
        segments = rawParas;
      } else {
        const text = page.text.trim();
        if (text.length > 150) {
          const sentences = text.split(/(?<=[.،؛\n])\s+/).filter(s => s.trim().length > 15);
          if (sentences.length > 1) {
            segments = sentences;
          } else {
            const mid = Math.floor(text.length / 2);
            segments = [text.slice(0, mid).trim(), text.slice(mid).trim()].filter(s => s.length > 0);
          }
        } else {
          segments = [text];
        }
      }
      const targetChapter = detectedChapters.find(
        c => page.pageNumber >= c.start_page && page.pageNumber <= c.end_page
      ) || detectedChapters[0];

      const assignedChapterId = targetChapter?.id || bookId;

      for (const seg of segments) {
        const chunkId = uuidv4();
        const vec = createSemanticVector(seg, 768);

        allChunks.push({
          id: chunkId,
          bookId,
          chapterId: assignedChapterId,
          pageNumber: page.pageNumber,
          chunkIndex: globalChunkIdx++,
          content: seg,
          charCount: seg.length,
          embedding: JSON.stringify(vec)
        });

        chapterChunkCountMap.set(assignedChapterId, (chapterChunkCountMap.get(assignedChapterId) || 0) + 1);
        chapterCharCountMap.set(assignedChapterId, (chapterCharCountMap.get(assignedChapterId) || 0) + seg.length);
      }
    }

    if (jobRecord) {
      await DurableIngestionJobService.saveCheckpoint(jobRecord.id, workerId, 'CHUNKING_AND_EMBEDDING', {
        totalChunks: allChunks.length
      }).catch(() => {});
    }

    // =========================================================================
    // STAGE 8: Multimodal Extraction & Visual Asset Association
    // =========================================================================
    // Save PDF to storage provider first so visual asset extractor can read single pages if needed
    const storage = getStorageProvider();
    const pdfKey = `books/${bookId}/book_${bookId}.pdf`;
    let storageMeta = { url: `/uploads/book_${bookId}.pdf`, durable: storage.isDurable() };
    try {
      storageMeta = await storage.saveFile(pdfKey, pdfBuffer, 'application/pdf', { isPrivate: true });
    } catch (saveErr: any) {
      console.warn(`⚠️ [BookIngestionService] Storage save notice: ${saveErr.message}`);
      issues.push({
        stage: 'DURABLE_STORAGE',
        code: saveErr.code || 'STORAGE_SAVE_FAILED',
        message: `تعذر حفظ ملف الكتاب في وحدة التخزين المتينة: ${saveErr.message}`,
        remediationGuidance: 'تأكد من سلامة اتصال وحدة التخزين وتكوين التخزين المتين بشكل سليم.'
      });
      if (jobRecord) {
        await DurableIngestionJobService.markFailed(jobRecord.id, workerId, `Storage save failed: ${saveErr.message}`, true).catch(() => {});
      }
      return this.buildFailureReport(bookId, titleAr, titleEn, fileChecksum, pdfBuffer.length, totalPages, 'BLOCKED', issues, startTime);
    }

    const subjectVisualReq = options.visualRequirements || this.inferVisualRequirement(subjectId, titleAr);
    const chapterAssetsMap = new Map<string, any[]>();

    for (const ch of detectedChapters) {
      const chId = ch.id || bookId;
      const assetsForCh = VisualAssetExtractor.getAssetsForChapter(bookId, chId);
      chapterAssetsMap.set(chId, assetsForCh);
    }

    // =========================================================================
    // STAGE 9 & 10: Unit Completeness & Readiness Audit
    // =========================================================================
    const unitReports: IngestionUnitReport[] = [];
    const dynamicUnitsToRegister: any[] = [];
    let hasAnyBlockedUnit = false;

    for (const ch of detectedChapters) {
      const chId = ch.id || bookId;
      const chunksCount = chapterChunkCountMap.get(chId) || 0;
      const charsCount = chapterCharCountMap.get(chId) || 0;
      const assets = chapterAssetsMap.get(chId) || [];
      const unitIssues: IngestionDiagnosticIssue[] = [];

      // Check durable storage retrievability for textbook source PDF
      try {
        const isPdfRetrievable = await storage.exists(pdfKey);
        if (!isPdfRetrievable) {
          unitIssues.push({
            stage: 'DURABLE_STORAGE',
            code: 'PDF_NOT_RETRIEVABLE',
            chapterNumber: ch.chapter_number,
            unitTitle: ch.title_ar,
            message: `ملف الكتاب الأصلي "${pdfKey}" غير متوفر أو غير قابل للاسترجاع من وحدة التخزين المتينة.`,
            remediationGuidance: 'تأكد من نجاح حفظ الكتاب في وحدة التخزين المتينة قبل النشر.'
          });
        }
      } catch (storageCheckErr: any) {
        unitIssues.push({
          stage: 'DURABLE_STORAGE',
          code: 'STORAGE_CHECK_FAILED',
          chapterNumber: ch.chapter_number,
          unitTitle: ch.title_ar,
          message: `فشل التحقق من وحدة التخزين: ${storageCheckErr.message}`,
          remediationGuidance: 'تأكد من تكوين رمز التخزين أو جاهزية قاعدة البيانات بشكل سليم.'
        });
      }

      // Check durable storage retrievability for required visual assets
      for (const asset of assets) {
        try {
          const assetKey = `visual_assets/${bookId}/${path.basename(asset.file_path)}`;
          const exists = (await storage.exists(assetKey)) || (await storage.exists(asset.asset_id));
          if (!exists && !fs.existsSync(asset.file_path)) {
            unitIssues.push({
              stage: 'VISUAL_INTEGRITY',
              code: 'ASSET_NOT_RETRIEVABLE_FROM_STORAGE',
              chapterNumber: ch.chapter_number,
              unitTitle: ch.title_ar,
              message: `الأصل البصري المطلوب "${asset.asset_id}" غير متاح في التخزين المتين.`,
              remediationGuidance: 'أعد استخراج الأصل البصري ورفعه إلى التخزين الدائم.'
            });
          }
        } catch (assetErr: any) {
          unitIssues.push({
            stage: 'VISUAL_INTEGRITY',
            code: 'ASSET_STORAGE_VERIFY_ERROR',
            chapterNumber: ch.chapter_number,
            unitTitle: ch.title_ar,
            message: `خطأ في فحص تخزين الأصل البصري "${asset.asset_id}": ${assetErr.message}`,
            remediationGuidance: 'تحقق من اتصال التخزين الدائم.'
          });
        }
      }

      // Check minimum content
      if (chunksCount < 2 || charsCount < 100) {
        unitIssues.push({
          stage: 'QUALITY_VALIDATION',
          code: 'INSUFFICIENT_TEXT_CONTENT',
          chapterNumber: ch.chapter_number,
          unitTitle: ch.title_ar,
          message: `المحتوى النصي للوحدة "${ch.title_ar}" غير كافٍ لتوليد أسئلة موثوقة (${chunksCount} مقاطع، ${charsCount} حرفاً).`,
          remediationGuidance: 'تأكد من أن نطاق صفحات الوحدة يحتوي على شرح تفصيلي ومسائل.'
        });
      }

      // Check visual requirement if subject mandates diagrams or maps
      if (subjectVisualReq !== 'NONE' && assets.length === 0) {
        // If geometry or maps required but no assets extracted, unit is conditionally ready or blocked
        unitIssues.push({
          stage: 'VISUAL_INTEGRITY',
          code: 'MISSING_REQUIRED_VISUAL_ASSETS',
          chapterNumber: ch.chapter_number,
          unitTitle: ch.title_ar,
          message: `المقرر يتطلب أصولاً بصرية (${subjectVisualReq})، لكن لم يتم استخراج أي مخططات أو خرائط لهذه الوحدة.`,
          remediationGuidance: 'استخرج المخططات الهندسية أو الخرائط الجغرافية وأرفقها بمانيفست الأصول المرئية.'
        });
      }

      const unitStatus: UnitReadinessStatus = unitIssues.length === 0 ? 'VERIFIED_READY' : 'BLOCKED';
      if (unitStatus === 'BLOCKED') {
        hasAnyBlockedUnit = true;
      }

      // Collect dynamic units for registration after database persistence succeeds
      dynamicUnitsToRegister.push({
        book_id: bookId,
        chapter_id: chId,
        book_title_ar: titleAr,
        book_title_en: titleEn,
        unit_title_ar: ch.title_ar,
        unit_title_en: ch.title_en,
        grade_ar: 'الصف الدراسي للمقرر',
        subject_ar: 'المادة المعتمدة',
        readiness_status: unitStatus,
        visual_dependencies: subjectVisualReq,
        status_reason: unitStatus === 'VERIFIED_READY'
          ? 'تم التحقق من جاهزية الوحدة واكتمال النصوص والأصول المرئية عبر خط المعالجة الموحد.'
          : unitIssues.map(i => i.message).join(' | '),
        evidence_and_unresolved_issues: unitIssues.length === 0
          ? `${chunksCount} chunks, ${charsCount} chars, ${assets.length} visual assets verified.`
          : unitIssues.map(i => i.message).join('; ')
      });

      unitReports.push({
        chapterId: chId,
        chapterNumber: ch.chapter_number,
        titleAr: ch.title_ar,
        titleEn: ch.title_en,
        startPage: ch.start_page,
        endPage: ch.end_page,
        totalChunks: chunksCount,
        totalCharacters: charsCount,
        visualAssetCount: assets.length,
        readinessStatus: unitStatus,
        visualDependencies: subjectVisualReq,
        issues: unitIssues
      });
    }

    if (jobRecord) {
      await DurableIngestionJobService.saveCheckpoint(jobRecord.id, workerId, 'READINESS_AUDIT', {
        hasAnyBlockedUnit,
        unitReportsCount: unitReports.length
      }).catch(() => {});
    }

    // =========================================================================
    // STAGE 11: Fail-Closed Publication Gate
    // =========================================================================
    const finalStatus: IngestionLifecycleStatus = hasAnyBlockedUnit ? 'BLOCKED' : 'VERIFIED_READY';
    const isPublished = finalStatus === 'VERIFIED_READY';

    // Persist book record and chunks safely in database with fail-closed error propagation
    try {
      await this.persistBookRecords({
        bookId,
        titleAr,
        titleEn,
        academicStageId,
        gradeId,
        subjectId,
        teacherId,
        schoolType,
        term,
        storageUrl: storageMeta.url,
        fileSize: pdfBuffer.length,
        totalPages,
        status: finalStatus,
        errorMessage: hasAnyBlockedUnit ? JSON.stringify(unitReports.filter(u => u.issues.length > 0)) : null,
        extractedPages,
        chunks: allChunks
      });

      // Register dynamic units in ReadinessValidator ONLY after DB persistence succeeds
      if (finalStatus === 'VERIFIED_READY') {
        for (const du of dynamicUnitsToRegister) {
          ReadinessValidator.registerDynamicUnit(du);
        }
        if (jobRecord) {
          await DurableIngestionJobService.markCompleted(jobRecord.id, workerId, {
            status: finalStatus,
            totalPages,
            totalChunks: allChunks.length,
            unitsCount: unitReports.length
          }).catch(() => {});
        }
      } else {
        if (jobRecord) {
          await DurableIngestionJobService.markFailed(
            jobRecord.id,
            workerId,
            unitReports.flatMap(u => u.issues).map(i => i.message).join('; ') || 'Readiness verification blocked incomplete units',
            false
          ).catch(() => {});
        }
      }
    } catch (persistErr: any) {
      console.error('❌ [BookIngestionService] Database persistence failed:', persistErr.message);
      issues.push({
        stage: 'DATABASE_PERSISTENCE',
        code: 'PERSISTENCE_FAILED',
        message: `فشل حفظ سجلات الكتاب أو المقاطع في قاعدة البيانات: ${persistErr.message}`,
        remediationGuidance: 'تحقق من اتصال قاعدة البيانات وحجم المقاطع وأعد المحاولة.'
      });
      if (jobRecord) {
        await DurableIngestionJobService.markFailed(jobRecord.id, workerId, `Persistence failed: ${persistErr.message}`, true).catch(() => {});
      }
      return this.buildFailureReport(bookId, titleAr, titleEn, fileChecksum, pdfBuffer.length, totalPages, 'BLOCKED', issues, startTime);
    }

    return {
      bookId,
      titleAr,
      titleEn,
      fileChecksum,
      fileSizeBytes: pdfBuffer.length,
      totalPages,
      status: finalStatus,
      isPublished,
      storageDurable: storageMeta.durable,
      storageUrl: storageMeta.url,
      units: unitReports,
      issues,
      processingDurationMs: Date.now() - startTime
    };
  }

  /**
   * Helper to infer visual requirements based on subject ID or book title
   */
  private static inferVisualRequirement(
    subjectId: string,
    titleAr: string
  ): 'GEOMETRY_DIAGRAMS' | 'CARTOGRAPHIC_MAPS' | 'NONE' {
    const title = titleAr.toLowerCase();
    if (title.includes('هندسة') || title.includes('geometry')) return 'GEOMETRY_DIAGRAMS';
    if (title.includes('جغرافيا') || title.includes('خريطة') || title.includes('خرائط') || (title.includes('دراسات') && title.includes('جغرافيا'))) {
      return 'CARTOGRAPHIC_MAPS';
    }
    return 'NONE';
  }

  /**
   * Build a structured failure report when a stage fails
   */
  private static buildFailureReport(
    bookId: string,
    titleAr: string,
    titleEn: string,
    fileChecksum: string,
    fileSizeBytes: number,
    totalPages: number,
    status: IngestionLifecycleStatus,
    issues: IngestionDiagnosticIssue[],
    startTime: number
  ): IngestionReport {
    return {
      bookId,
      titleAr,
      titleEn,
      fileChecksum,
      fileSizeBytes,
      totalPages,
      status,
      isPublished: false,
      storageDurable: false,
      storageUrl: '',
      units: [],
      issues,
      processingDurationMs: Date.now() - startTime
    };
  }

  /**
   * Safe, non-destructive staged persistence and promotion of textbook records.
   * 
   * NON-TRANSACTIONAL LIMITATION NOTE:
   * TiDB Cloud Serverless HTTP and distributed pool drivers do not support connection-pinned
   * multi-statement interactive transactions in standard stateless execution.
   * Therefore, this promotion workflow uses a strictly staged and ordered promotion sequence
   * with fail-closed gates rather than crash-safe atomic transactions.
   * 
   * INVARIANT:
   * 1. A verified canonical book with existing valid pages or chunks is NEVER replaced in-place.
   * 2. All fresh pages and chunks are staged under an isolated staging ID and 100% written
   *    BEFORE any promotion statements execute.
   * 3. Canonical book status remains PENDING or FAILED during preparation and promotion,
   *    and is updated to COMPLETED only as the final successful promotion step.
   * 4. If promotion fails midway, fail-closed: canonical status is marked FAILED, diagnostic
   *    context is logged, and recoverable staged records are preserved (NOT deleted).
   */
  private static async persistBookRecords(params: {
    bookId: string;
    titleAr: string;
    titleEn: string;
    academicStageId: string;
    gradeId: string;
    subjectId: string;
    teacherId?: string;
    schoolType: string;
    term: number;
    storageUrl: string;
    fileSize: number;
    totalPages: number;
    status: IngestionLifecycleStatus;
    errorMessage: string | null;
    extractedPages: { pageNumber: number; text: string; charCount: number }[];
    chunks: any[];
  }): Promise<void> {
    const {
      bookId,
      titleAr,
      titleEn,
      academicStageId,
      gradeId,
      subjectId,
      teacherId,
      schoolType,
      term,
      storageUrl,
      fileSize,
      totalPages,
      status,
      errorMessage,
      extractedPages,
      chunks
    } = params;

    const pageBatchSize = 25;
    const chunkBatchSize = 10;
    const dbStatus = status === 'VERIFIED_READY' ? 'COMPLETED' : 'FAILED';

    // 1. Invariant Guard: Protect Existing Verified Books
    // A verified canonical book with existing valid pages or chunks must never have its content
    // deleted as part of an ordinary new-book upload or retry.
    const existing = await db.query(
      `SELECT b.id, b.processing_status,
              (SELECT COUNT(*) FROM book_chunks WHERE book_id = b.id) as chunk_count,
              (SELECT COUNT(*) FROM book_pages WHERE book_id = b.id) as page_count
       FROM books b WHERE b.id = $1`,
      [bookId]
    ).catch(() => ({ rows: [] }));

    const existingRow = existing.rows[0];
    const hasExistingContent = existingRow && (Number(existingRow.chunk_count) > 0 || Number(existingRow.page_count) > 0);
    const isExistingVerified = existingRow &&
      (existingRow.processing_status === 'COMPLETED' || existingRow.processing_status === 'VERIFIED_READY') &&
      hasExistingContent;

    if (isExistingVerified) {
      throw new Error('CANNOT_OVERWRITE_VERIFIED_BOOK: A verified canonical book with existing valid pages or chunks cannot be replaced in place.');
    }

    // 2. Ensure canonical book record exists with PENDING status (so foreign keys resolve, but book is NOT ready)
    if (existingRow) {
      await db.query(
        `UPDATE books SET 
           title_ar = $1, title_en = $2, file_url = $3, file_size = $4, total_pages = $5,
           processing_status = 'PENDING', processing_error = NULL, school_type = $6, term = $7
         WHERE id = $8`,
        [titleAr.trim(), titleEn.trim(), storageUrl, fileSize, totalPages, schoolType, term, bookId]
      );
    } else {
      await db.query(
        `INSERT INTO books (
           id, title_ar, title_en, academic_stage_id, grade_id, subject_id, teacher_id,
           file_url, file_size, total_pages, school_type, term, processing_status, processing_error
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING', NULL)`,
        [bookId, titleAr.trim(), titleEn.trim(), academicStageId, gradeId, subjectId, teacherId || null, storageUrl, fileSize, totalPages, schoolType, term]
      );
    }

    // 3. Staged Persistence
    const stagingBookId = uuidv4();
    let currentPromotionStep = 'STAGING_PREPARATION';

    try {
      // Step A: Insert staging stub into books table
      await db.query(
        `INSERT INTO books (
           id, title_ar, title_en, academic_stage_id, grade_id, subject_id, teacher_id,
           file_url, file_size, total_pages, school_type, term, processing_status, processing_error
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING', $13)`,
        [stagingBookId, titleAr.trim(), titleEn.trim(), academicStageId, gradeId, subjectId, teacherId || null, storageUrl, fileSize, totalPages, schoolType, term, `Staging for book ${bookId}`]
      );

      // Step B: Batch insert pages under stagingBookId
      currentPromotionStep = 'INSERTING_STAGED_PAGES';
      for (let i = 0; i < extractedPages.length; i += pageBatchSize) {
        const batch = extractedPages.slice(i, i + pageBatchSize);
        const placeholders: string[] = [];
        const queryParams: any[] = [];
        batch.forEach((p, idx) => {
          const offset = idx * 5;
          placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
          queryParams.push(uuidv4(), stagingBookId, p.pageNumber, p.text, p.charCount);
        });
        await db.query(
          `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count) VALUES ${placeholders.join(', ')}`,
          queryParams
        );
      }

      // Step C: Batch insert chunks under stagingBookId
      currentPromotionStep = 'INSERTING_STAGED_CHUNKS';
      for (let i = 0; i < chunks.length; i += chunkBatchSize) {
        const batch = chunks.slice(i, i + chunkBatchSize);
        const placeholders: string[] = [];
        const queryParams: any[] = [];
        batch.forEach((c, idx) => {
          const offset = idx * 11;
          placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`
          );
          queryParams.push(
            c.id,
            stagingBookId,
            c.chapterId,
            academicStageId,
            gradeId,
            subjectId,
            c.pageNumber,
            c.chunkIndex,
            c.content,
            JSON.stringify({ page: c.pageNumber, charCount: c.charCount, title: `صفحة ${c.pageNumber}` }),
            c.embedding
          );
        });
        await db.query(
          `INSERT INTO book_chunks (
             id, book_id, chapter_id, academic_stage_id, grade_id, subject_id,
             page_number, chunk_index, content, metadata, embedding
           ) VALUES ${placeholders.join(', ')}`,
          queryParams
        );
      }

      // Step D: Ordered Promotion
      // 1. Remove previous failed chunks/pages from canonical bookId (if retrying a failed attempt)
      currentPromotionStep = 'CLEAR_PRIOR_FAILED_CONTENT';
      await db.query(`DELETE FROM book_chunks WHERE book_id = $1`, [bookId]);
      await db.query(`DELETE FROM book_pages WHERE book_id = $1`, [bookId]);

      // 2. Transfer staged chunks to canonical bookId
      currentPromotionStep = 'PROMOTING_CHUNKS';
      await db.query(`UPDATE book_chunks SET book_id = $1 WHERE book_id = $2`, [bookId, stagingBookId]);

      // 3. Transfer staged pages to canonical bookId
      currentPromotionStep = 'PROMOTING_PAGES';
      await db.query(`UPDATE book_pages SET book_id = $1 WHERE book_id = $2`, [bookId, stagingBookId]);

      // 4. Update canonical book to final status
      currentPromotionStep = 'FINALIZING_BOOK_STATUS';
      await db.query(
        `UPDATE books SET 
           title_ar = $1, title_en = $2, file_url = $3, file_size = $4, total_pages = $5,
           processing_status = $6, processing_error = $7, school_type = $8, term = $9
         WHERE id = $10`,
        [titleAr.trim(), titleEn.trim(), storageUrl, fileSize, totalPages, dbStatus, errorMessage, schoolType, term, bookId]
      );

      // 5. Clean up staging book record stub
      currentPromotionStep = 'CLEANUP_STAGING_STUB';
      await db.query(`DELETE FROM books WHERE id = $1`, [stagingBookId]).catch(() => {});
    } catch (err: any) {
      console.error(
        `🚨 [BookIngestionService] Persistence/promotion failed at step "${currentPromotionStep}" for canonical book ${bookId} (stagingId: ${stagingBookId}): ${err.message}. Preserving recoverable staged records.`
      );

      // Fail-closed: Ensure canonical book is marked FAILED so no partial records can pass readiness
      await db.query(
        `UPDATE books SET processing_status = 'FAILED', processing_error = $1 WHERE id = $2`,
        [`فشل النقل الترويجي للبيانات في خطوة ${currentPromotionStep} (staging_id: ${stagingBookId}): ${err.message}`, bookId]
      ).catch(() => {});

      // Conservative preservation: DO NOT delete stagingBookId records here!
      // They may be the only remaining copy of the parsed data.
      throw new Error(`فشلت معالجة حفظ مقاطع وصفحات الكتاب (${currentPromotionStep}): ${err.message}`);
    }
  }
}
