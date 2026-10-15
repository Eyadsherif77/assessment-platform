import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/db.js';
import { authenticateToken, requireRole, enforceStudentGrade, AuthenticatedRequest } from '../middleware/auth.js';
import { jobQueue } from '../services/jobs/jobQueue.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import { createSemanticVector } from '../services/ai/vectorEmbedding.js';
import { cleanArabicText } from '../utils/arabicTextNormalizer.js';
import { aiChapterDetector } from '../services/ai/aiChapterDetector.js';
import { BookIngestionService } from '../services/bookIngestionService.js';
import { DurableIngestionJobService } from '../services/jobs/durableIngestionJobService.js';
import { getStorageProvider } from '../services/storage/storageProvider.js';
import { VisualAssetExtractor } from '../services/ai/visualAssetExtractor.js';

const router = Router();

// Memory storage for small 2MB chunk uploads
const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Configure multer storage
const uploadDir = process.env.VERCEL
  ? path.resolve('/tmp', 'uploads')
  : path.resolve(process.cwd(), 'uploads');
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (e) {
  console.warn('Upload directory warning:', e);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
    } catch (_) {}
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Upload Book (Main Admin only - Unified Authoritative Pipeline)
router.post(
  '/upload',
  authenticateToken,
  requireRole(['ADMIN']),
  upload.single('file'),
  async (req: AuthenticatedRequest, res) => {
    let bookId: string | null = null;
    try {
      const {
        title_ar,
        title_en,
        academic_stage_id,
        grade_id,
        subject_id,
        term = 1,
        school_type
      } = req.body;

      if (!title_ar || !academic_stage_id || !grade_id || !subject_id) {
        return res.status(400).json({ error: 'الرجاء ملء جميع الحقول الإلزامية للكتاب' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'يرجى اختيار ملف كتاب PDF للرفع' });
      }

      const fileBuffer = req.file.buffer || (req.file.path && fs.existsSync(req.file.path) ? fs.readFileSync(req.file.path) : null);
      if (!fileBuffer || fileBuffer.length < 100) {
        return res.status(400).json({ error: 'الملف المرفوع فارغ أو غير صالح.' });
      }

      bookId = uuidv4();
      const effectiveSchoolType = school_type || 'كلاهما';
      const cleanTerm = parseInt(String(term), 10) === 2 ? 2 : 1;
      const fileName = req.file.originalname || `book_${bookId}.pdf`;

      // Save PDF chunks into book_pdf_chunks so student/teacher PDF reading works
      const CHUNK_SIZE = 2 * 1024 * 1024;
      const totalChunks = Math.ceil(fileBuffer.length / CHUNK_SIZE);
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(fileBuffer.length, (i + 1) * CHUNK_SIZE);
        const chunkSlice = fileBuffer.slice(start, end);
        await db.query(
          `REPLACE INTO book_pdf_chunks (book_id, chunk_index, chunk_data) VALUES ($1, $2, $3)`,
          [bookId, i, chunkSlice]
        );
      }

      // Execute unified authoritative automated ingestion pipeline
      const ingestionReport = await BookIngestionService.ingestTextbook({
        bookId,
        pdfBuffer: fileBuffer,
        fileName,
        titleAr: title_ar.trim(),
        titleEn: title_en ? title_en.trim() : title_ar.trim(),
        academicStageId: academic_stage_id,
        gradeId: grade_id,
        subjectId: subject_id,
        schoolType: effectiveSchoolType,
        term: cleanTerm,
        teacherId: req.user!.id
      });

      // If ingestion deduplicated to an existing canonical book, clean up temporary staging upload chunks
      if (ingestionReport.bookId && ingestionReport.bookId !== bookId) {
        await db.query(`DELETE FROM book_pdf_chunks WHERE book_id = $1`, [bookId]).catch(() => {});
      }

      if (ingestionReport.status === 'REQUIRES_REMEDIATION' || ingestionReport.status === 'BLOCKED') {
        // Clean up temporary upload chunks if ingestion failed and book is not an existing canonical book
        const canonicalCheck = await db.query(
          `SELECT id FROM books WHERE id = $1 AND processing_status IN ('COMPLETED', 'VERIFIED_READY')`,
          [bookId]
        ).catch(() => ({ rows: [] }));
        if (canonicalCheck.rows.length === 0) {
          await db.query(`DELETE FROM book_pdf_chunks WHERE book_id = $1`, [bookId]).catch(() => {});
        }

        if (ingestionReport.status === 'REQUIRES_REMEDIATION') {
          return res.status(422).json({
            error: 'يتطلب الكتاب معالجة تكميلية أو فحصاً يدوياً (OCR / صفحات ممسوحة).',
            code: 'REQUIRES_REMEDIATION',
            report: ingestionReport
          });
        }

        return res.status(400).json({
          error: 'فشلت معالجة الكتاب: تم حظر الكتاب بسبب عدم استيفاء شروط الجودة أو المحتوى.',
          code: 'BOOK_INGESTION_BLOCKED',
          report: ingestionReport
        });
      }

      return res.status(201).json({
        message: ingestionReport.status === 'VERIFIED_READY'
          ? `تم رفع ومعالجة واعتماد الكتاب بنجاح (${ingestionReport.totalPages} صفحة و ${ingestionReport.units.length} وحدات معتمدة).`
          : `تمت معالجة الكتاب (${ingestionReport.status}).`,
        bookId: ingestionReport.bookId,
        totalPages: ingestionReport.totalPages,
        status: ingestionReport.status,
        report: ingestionReport
      });
    } catch (err: any) {
      console.error('Book upload error:', err);
      // Clean up temporary staging chunks only if bookId is not an existing canonical book
      if (bookId) {
        try {
          const canonicalCheck = await db.query(
            `SELECT id FROM books WHERE id = $1 AND processing_status IN ('COMPLETED', 'VERIFIED_READY')`,
            [bookId]
          );
          if (canonicalCheck.rows.length === 0) {
            await db.query(`DELETE FROM book_pdf_chunks WHERE book_id = $1`, [bookId]);
          }
        } catch (_) {}
      }
      return res.status(500).json({ error: 'حدث خطأ أثناء معالجة ورفع الكتاب: ' + err.message });
    }
  }
);

// Legacy parsed textbook upload route (Fails clearly to prevent unverified ingestion bypass)
router.post(
  '/upload-parsed',
  authenticateToken,
  requireRole(['ADMIN']),
  async (req: AuthenticatedRequest, res) => {
    return res.status(400).json({
      error: 'تم إيقاف مسار رفع النصوص المفروزة (upload-parsed). يجب رفع ملف الكتاب الأصلي عبر مسار الرفع المعتمد (/api/books/finalize-chunked أو /api/books/upload) لضمان الاستخراج الموثوق والتخزين المتين للملف والأصول المرئية.',
      code: 'UNSUPPORTED_LEGACY_UPLOAD_ROUTE'
    });
  }
);

// Upload a single 2MB slice of a textbook (Guarantees zero Vercel 4.5MB payload issues)
router.post(
  '/upload-chunk',
  authenticateToken,
  requireRole(['ADMIN']),
  chunkUpload.single('chunk'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { uploadId, chunkIndex, totalChunks } = req.body;
      if (!uploadId || chunkIndex === undefined || !req.file) {
        return res.status(400).json({ error: 'Missing chunk upload parameters.' });
      }

      const cIdx = parseInt(chunkIndex, 10);
      const tChunks = parseInt(totalChunks, 10) || 1;

      await db.query(
        `REPLACE INTO file_upload_chunks (upload_id, chunk_index, total_chunks, chunk_data) VALUES ($1, $2, $3, $4)`,
        [uploadId, cIdx, tChunks, req.file.buffer]
      );

      return res.json({ success: true, chunkIndex: cIdx });
    } catch (err: any) {
      console.error('Error uploading chunk:', err);
      return res.status(500).json({ error: 'Failed to upload chunk: ' + err.message });
    }
  }
);

// Finalize chunked textbook upload: assemble buffer, parse with pdf-parse, and index
router.post(
  '/finalize-chunked',
  authenticateToken,
  requireRole(['ADMIN']),
  async (req: AuthenticatedRequest, res) => {
    let bookId: string | null = null;
    try {
      const {
        uploadId,
        title_ar,
        title_en,
        academic_stage_id,
        grade_id,
        subject_id,
        term = 1,
        chapter_number,
        chapter_title_ar,
        school_type,
        fileName,
        fileSize,
        totalChunks
      } = req.body;

      if (!uploadId || !title_ar || !academic_stage_id || !grade_id || !subject_id) {
        return res.status(400).json({ error: 'الرجاء ملء جميع الحقول الإلزامية للكتاب' });
      }

      // 1. Fetch all chunks in order
      const chunkRows = await db.query(
        `SELECT chunk_index, chunk_data FROM file_upload_chunks WHERE upload_id = $1 ORDER BY chunk_index ASC`,
        [uploadId]
      );

      if (chunkRows.rows.length === 0) {
        return res.status(400).json({ error: 'لم يتم العثور على أجزاء الملف المرفوعة.' });
      }

      const expectedTotal = parseInt(totalChunks, 10) || chunkRows.rows.length;
      if (chunkRows.rows.length < expectedTotal) {
        return res.status(400).json({
          error: `لم يكتمل رفع جميع أجزاء الكتاب (${chunkRows.rows.length} من ${expectedTotal}). يرجى إعادة المحاولة.`
        });
      }

      // 2. Combine chunk buffers
      const buffers = chunkRows.rows.map((r: any) => {
        const raw = r.chunk_data;
        return Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      });
      const fullBuffer = Buffer.concat(buffers);

      bookId = uuidv4();
      const effectiveSchoolType = school_type || 'كلاهما';
      const cleanTerm = parseInt(String(term), 10) === 2 ? 2 : 1;

      // Save PDF chunks for student/teacher PDF reading
      try {
        for (const r of chunkRows.rows) {
          await db.query(
            `REPLACE INTO book_pdf_chunks (book_id, chunk_index, chunk_data) VALUES ($1, $2, $3)`,
            [bookId, r.chunk_index, r.chunk_data]
          );
        }
      } catch (pdfStoreErr) {
        console.warn('Could not store PDF chunks in book_pdf_chunks:', pdfStoreErr);
      }

      // Execute unified automated ingestion pipeline (Stages 1 through 11)
      const ingestionReport = await BookIngestionService.ingestTextbook({
        bookId,
        pdfBuffer: fullBuffer,
        fileName,
        titleAr: title_ar.trim(),
        titleEn: title_en ? title_en.trim() : title_ar.trim(),
        academicStageId: academic_stage_id,
        gradeId: grade_id,
        subjectId: subject_id,
        schoolType: effectiveSchoolType,
        term: cleanTerm,
        teacherId: req.user!.id
      });

      // If ingestion deduplicated to an existing canonical book, clean up temporary staging upload chunks
      if (ingestionReport.bookId && ingestionReport.bookId !== bookId) {
        await db.query(`DELETE FROM book_pdf_chunks WHERE book_id = $1`, [bookId]).catch(() => {});
      }

      if (ingestionReport.status === 'REQUIRES_REMEDIATION' || ingestionReport.status === 'BLOCKED') {
        // Clean up temporary upload chunks only if book is not canonical
        const canonicalCheck = await db.query(
          `SELECT id FROM books WHERE id = $1 AND processing_status IN ('COMPLETED', 'VERIFIED_READY')`,
          [bookId]
        ).catch(() => ({ rows: [] }));
        if (canonicalCheck.rows.length === 0) {
          await db.query(`DELETE FROM book_pdf_chunks WHERE book_id = $1`, [bookId]).catch(() => {});
        }

        if (ingestionReport.status === 'REQUIRES_REMEDIATION') {
          return res.status(422).json({
            error: 'يتطلب الكتاب معالجة تكميلية أو فحصاً يدوياً (OCR / صفحات ممسوحة).',
            code: 'REQUIRES_REMEDIATION',
            report: ingestionReport
          });
        }

        return res.status(400).json({
          error: 'فشلت معالجة الكتاب: تم حظر الكتاب بسبب عدم استيفاء شروط الجودة أو المحتوى.',
          code: 'BOOK_INGESTION_BLOCKED',
          report: ingestionReport
        });
      }

      // Only clean up file_upload_chunks once ingestion has verified ready!
      if (ingestionReport.status === 'VERIFIED_READY') {
        db.query(`DELETE FROM file_upload_chunks WHERE upload_id = $1`, [uploadId]).catch(() => {});
      }

      return res.status(201).json({
        message: ingestionReport.status === 'VERIFIED_READY'
          ? `تم رفع ومعالجة واعتماد الكتاب بنجاح (${ingestionReport.totalPages} صفحة و ${ingestionReport.units.length} وحدات معتمدة).`
          : `تمت معالجة الكتاب، ولكن يتطلب فحص الجاهزية استكمال الأصول البصرية (${ingestionReport.status}).`,
        bookId: ingestionReport.bookId,
        totalPages: ingestionReport.totalPages,
        status: ingestionReport.status,
        report: ingestionReport
      });
    } catch (err: any) {
      console.error('Finalize chunked error:', err);
      // Clean up temporary staging chunks only if bookId is not an existing canonical book
      if (bookId) {
        try {
          const canonicalCheck = await db.query(
            `SELECT id FROM books WHERE id = $1 AND processing_status IN ('COMPLETED', 'VERIFIED_READY')`,
            [bookId]
          );
          if (canonicalCheck.rows.length === 0) {
            await db.query(`DELETE FROM book_pdf_chunks WHERE book_id = $1`, [bookId]);
          }
        } catch (_) {}
      }
      return res.status(500).json({ error: 'فشلت معالجة أجزاء الكتاب: ' + err.message });
    }
  }
);

// Get background processing status
router.get('/status/:id', authenticateToken, async (req, res) => {
  const id = String(req.params.id);
  const dbRes = await db.query('SELECT processing_status, processing_error, total_pages FROM books WHERE id = $1', [id]);
  
  if (dbRes.rows.length === 0) {
    return res.status(404).json({ error: 'الكتاب غير موجود' });
  }

  // Check durable job record in database
  const jobRes = await db.query(
    `SELECT id, current_stage, status, attempt_count, max_attempts, checkpoint_data, last_error, updated_at
     FROM book_ingestion_jobs
     WHERE book_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [id]
  ).catch(() => ({ rows: [] }));

  const job = jobRes.rows[0];
  const currentDbStatus = dbRes.rows[0].processing_status;

  let progress = currentDbStatus === 'COMPLETED' ? 100 : 20;
  if (job) {
    const stageProgress: Record<string, number> = {
      UPLOADED: 10,
      EXTRACTING_PAGES: 30,
      OCR_PROCESSING: 50,
      DETECTING_CHAPTERS: 70,
      CHUNKING_AND_EMBEDDING: 85,
      READINESS_AUDIT: 95,
      COMPLETED: 100,
      FAILED: 0,
      BLOCKED: 0
    };
    progress = stageProgress[job.current_stage] !== undefined ? stageProgress[job.current_stage] : progress;
  }

  // Opportunistic auto-resumption: If worker crashed or timed out and lease expired, resume in background
  if (job && job.attempt_count < (job.max_attempts || 3)) {
    const isStalled = job.status === 'RETRYING' ||
      (job.status === 'IN_PROGRESS' && job.lease_expires_at && new Date(job.lease_expires_at).getTime() < Date.now());
    if (isStalled) {
      DurableIngestionJobService.executeJobResumption(job.id).catch(err => {
        console.warn(`[Status Polling] Opportunistic resume for job ${job.id} failed:`, err.message);
      });
    }
  }

  return res.json({
    status: currentDbStatus,
    stage: job?.current_stage || 'UNKNOWN',
    jobStatus: job?.status || 'UNKNOWN',
    progress,
    error: dbRes.rows[0].processing_error || job?.last_error,
    totalPages: dbRes.rows[0].total_pages,
    jobId: job?.id
  });
});

// Recover / resume stalled ingestion jobs (Admin only)
router.post('/jobs/recover', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const stalledJobs = await DurableIngestionJobService.recoverStalledJobs(5);
    const executionResults: any[] = [];
    for (const job of stalledJobs) {
      const outcome = await DurableIngestionJobService.executeJobResumption(job.id);
      executionResults.push({
        jobId: job.id,
        bookId: job.bookId,
        outcome
      });
    }

    return res.json({
      message: `تم فحص المهام العالقة ومعالجة استئناف ${stalledJobs.length} مهام.`,
      recoveredCount: stalledJobs.length,
      resumedJobs: executionResults
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'فشل استئناف المهام: ' + err.message });
  }
});

// List Books (Filtered by Stage and Grade strictly for students)
router.get('/', authenticateToken, enforceStudentGrade, async (req: AuthenticatedRequest, res) => {
  try {
    let query = `
      SELECT b.*, s.name_ar as subject_name_ar, s.name_en as subject_name_en,
             st.name_ar as stage_name_ar, g.name_ar as grade_name_ar,
             (SELECT COUNT(*) FROM book_chapters bc WHERE bc.book_id = b.id) as chapters_count
      FROM books b
      JOIN subjects s ON b.subject_id = s.id
      JOIN academic_stages st ON b.academic_stage_id = st.id
      JOIN grades g ON b.grade_id = g.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    // If student, strictly enforce their own academic stage, grade, and school_type
    if (req.user?.role === 'STUDENT' && req.studentProfile) {
      params.push(req.studentProfile.academicStageId);
      conditions.push(`b.academic_stage_id = $${params.length}`);

      params.push(req.studentProfile.gradeId);
      conditions.push(`b.grade_id = $${params.length}`);

      // Filter by student's school_type: show books for their specific type OR 'كلاهما' (common books)
      const studentSchoolType = (req.studentProfile.schoolType || 'عربي').trim();
      const normStudentSchoolType = studentSchoolType.replace('ى', 'ي');
      params.push(studentSchoolType);
      params.push(normStudentSchoolType);
      conditions.push(`(
        COALESCE(b.school_type, 'كلاهما') IN ('كلاهما', 'both', 'Both', 'عربي ولغات', 'عام ولغات')
        OR b.school_type IS NULL
        OR b.school_type = $${params.length - 1}
        OR b.school_type = $${params.length}
        OR REPLACE(COALESCE(b.school_type, ''), 'ى', 'ي') = $${params.length}
      )`);
    } else {
      // For teachers: textbooks are uploaded by Admin. Teachers see curriculum books for the platform/filters
      // For teachers: filter textbooks strictly to their assigned subject & grade
      if (req.user?.role === 'TEACHER') {
        const teacherSubjId = req.query.subject_id || req.teacherProfile?.subjectId;
        const teacherGradeId = req.query.grade_id || req.teacherProfile?.gradeId;
        const teacherStageId = req.query.stage_id || req.teacherProfile?.academicStageId;

        if (teacherStageId) {
          params.push(teacherStageId);
          conditions.push(`b.academic_stage_id = $${params.length}`);
        }
        if (teacherGradeId) {
          params.push(teacherGradeId);
          conditions.push(`b.grade_id = $${params.length}`);
        }
        if (teacherSubjId) {
          params.push(teacherSubjId);
          conditions.push(`(b.subject_id = $${params.length} OR b.subject_id IN (
            SELECT s2.id FROM subjects s1 
            JOIN subjects s2 ON (s1.code = s2.code OR s1.name_ar = s2.name_ar) 
            WHERE s1.id = $${params.length}
          ))`);
        } else if (req.teacherProfile?.specialization) {
          const specClean = req.teacherProfile.specialization.replace(/^(اللغة|مادة|معلم أول|معلم)\s+/i, '').trim().toLowerCase();
          const sRows = await db.query(`SELECT id FROM subjects WHERE LOWER(name_ar) LIKE $1 OR LOWER(name_en) LIKE $1 OR LOWER(code) LIKE $1`, [`%${specClean}%`]);
          if (sRows.rows.length > 0) {
            const subjIds = sRows.rows.map((r: any) => `'${r.id}'`).join(',');
            conditions.push(`b.subject_id IN (${subjIds})`);
          }
        }
      } else if (req.query.my_only === 'true' && req.user?.id) {
        params.push(req.user.id);
        conditions.push(`b.teacher_id = $${params.length}`);
      }

      // Optional query filters
      if (req.query.stage_id && req.user?.role !== 'TEACHER') {
        params.push(req.query.stage_id);
        conditions.push(`b.academic_stage_id = $${params.length}`);
      }
      if (req.query.grade_id && req.user?.role !== 'TEACHER') {
        params.push(req.query.grade_id);
        conditions.push(`b.grade_id = $${params.length}`);
      }
      if (req.query.school_type) {
        params.push(req.query.school_type);
        conditions.push(`(b.school_type = $${params.length} OR b.school_type = 'كلاهما' OR b.school_type IS NULL)`);
      }
    }

    if (req.query.subject_id && req.user?.role !== 'TEACHER') {
      params.push(req.query.subject_id);
      conditions.push(`b.subject_id = $${params.length}`);
    }

    // Term filtering: query param 'term', or default to platform's active_term for students and teachers
    let filterTerm: number | null = req.query.term ? parseInt(String(req.query.term), 10) : null;
    if (!filterTerm && (req.user?.role === 'STUDENT' || req.user?.role === 'TEACHER')) {
      try {
        const termSetting = await db.query(`SELECT setting_value FROM platform_settings WHERE setting_key = 'active_term'`);
        filterTerm = termSetting.rows.length > 0 ? (parseInt(termSetting.rows[0].setting_value, 10) || 1) : 1;
      } catch (_) {
        filterTerm = 1;
      }
    }
    if (filterTerm && (filterTerm === 1 || filterTerm === 2)) {
      params.push(filterTerm);
      conditions.push(`(b.term = $${params.length} OR b.term IS NULL)`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY b.created_at DESC`;

    const result = await db.query(query, params);
    const existingBooks: any[] = result.rows.map(b => ({
      ...b,
      is_available: true,
      availability_status: 'AVAILABLE'
    }));

    // Check for official subjects belonging to this grade that have no uploaded textbook yet (e.g. Prep 3 Mathematics)
    const targetGradeId = req.user?.role === 'STUDENT' && req.studentProfile
      ? req.studentProfile.gradeId
      : (req.query.grade_id as string | undefined);

    if (targetGradeId && (!req.query.subject_id || req.user?.role === 'STUDENT')) {
      try {
        const subjectsRes = await db.query(
          `SELECT s.id, s.name_ar, s.name_en, s.grade_id,
                  g.name_ar as grade_name_ar, g.name_en as grade_name_en,
                  st.id as stage_id, st.name_ar as stage_name_ar, st.name_en as stage_name_en
           FROM subjects s
           JOIN grades g ON s.grade_id = g.id
           JOIN academic_stages st ON g.stage_id = st.id
           WHERE s.grade_id = $1
           ORDER BY s.sort_order ASC`,
          [targetGradeId]
        );

        const coveredSubjectIds = new Set(existingBooks.map((b: any) => b.subject_id));

        for (const subj of subjectsRes.rows) {
          if (!coveredSubjectIds.has(subj.id)) {
            // Include official subject with clear upcoming status
            existingBooks.push({
              id: `placeholder_${subj.id}`,
              title_ar: subj.name_ar,
              title_en: subj.name_en || subj.name_ar,
              file_url: null,
              academic_stage_id: subj.stage_id,
              grade_id: subj.grade_id,
              subject_id: subj.id,
              term: filterTerm || 1,
              school_type: 'كلاهما',
              processing_status: 'UPCOMING_TEXTBOOK',
              subject_name_ar: subj.name_ar,
              subject_name_en: subj.name_en,
              stage_name_ar: subj.stage_name_ar,
              grade_name_ar: subj.grade_name_ar,
              chapters_count: 0,
              is_available: false,
              availability_status: 'UPCOMING_TEXTBOOK',
              message: 'جاري رفع كتاب الوزارة المعتمد'
            });
          }
        }
      } catch (subjErr) {
        console.warn('⚠️ Could not query upcoming subjects for grade:', subjErr);
      }
    }

    return res.json(existingBooks);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب قائمة الكتب: ' + err.message });
  }
});

// Get Book Details with Chapters
router.get('/:id', authenticateToken, enforceStudentGrade, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    // Handle placeholder / upcoming books gracefully
    if (typeof id === 'string' && id.startsWith('placeholder_')) {
      const subjectId = id.replace('placeholder_', '');
      const subjRes = await db.query(
        `SELECT s.id, s.name_ar, s.name_en, s.grade_id,
                g.name_ar as grade_name_ar,
                st.id as stage_id, st.name_ar as stage_name_ar
         FROM subjects s
         JOIN grades g ON s.grade_id = g.id
         JOIN academic_stages st ON g.stage_id = st.id
         WHERE s.id = $1`,
        [subjectId]
      );
      if (subjRes.rows.length > 0) {
        const s = subjRes.rows[0];
        return res.json({
          id,
          title_ar: s.name_ar,
          title_en: s.name_en,
          subject_id: s.id,
          grade_id: s.grade_id,
          academic_stage_id: s.stage_id,
          subject_name_ar: s.name_ar,
          subject_name_en: s.name_en,
          grade_name_ar: s.grade_name_ar,
          stage_name_ar: s.stage_name_ar,
          is_available: false,
          availability_status: 'UPCOMING_TEXTBOOK',
          message: 'جاري رفع كتاب الوزارة المعتمد',
          chapters: []
        });
      }
    }

    const bookRes = await db.query(
      `SELECT b.*, s.name_ar as subject_name_ar, s.name_en as subject_name_en,
              st.name_ar as stage_name_ar, g.name_ar as grade_name_ar
       FROM books b
       JOIN subjects s ON b.subject_id = s.id
       JOIN academic_stages st ON b.academic_stage_id = st.id
       JOIN grades g ON b.grade_id = g.id
       WHERE b.id = $1`,
      [id]
    );

    if (bookRes.rows.length === 0) {
      return res.status(404).json({ error: 'الكتاب غير موجود' });
    }

    const book = bookRes.rows[0];

    // Enforce student grade & school_type permissions
    if (req.user?.role === 'STUDENT' && req.studentProfile) {
      if (book.grade_id !== req.studentProfile.gradeId) {
        return res.status(403).json({ error: 'لا يمكنك الوصول إلى كتاب غير مخصص لصفك الدراسي' });
      }
      const studentSchoolType = req.studentProfile.schoolType || 'عربي';
      if (book.school_type && book.school_type !== 'كلاهما' && book.school_type !== studentSchoolType) {
        return res.status(403).json({ error: 'لا يمكنك الوصول إلى كتاب غير مخصص لنوع مدرستك' });
      }
    }

    const chaptersRes = await db.query(
      `SELECT bc.*, 
              (SELECT COUNT(*) FROM book_chunks bk WHERE bk.chapter_id = bc.id) as chunks_count
       FROM book_chapters bc 
       WHERE bc.book_id = $1 
       ORDER BY bc.chapter_number ASC`,
      [id]
    );

    return res.json({
      ...book,
      chapters: chaptersRes.rows
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب تفاصيل الكتاب' });
  }
});

// Get Book Chapter Chunks (for reading or previewing grounded citations)
router.get('/:id/chapters/:chapterId/chunks', authenticateToken, enforceStudentGrade, async (req: AuthenticatedRequest, res) => {
  try {
    const { id, chapterId } = req.params;

    // Enforce student grade & school_type permissions before reading chunks
    if (req.user?.role === 'STUDENT' && req.studentProfile) {
      const bookCheck = await db.query(
        `SELECT grade_id, school_type FROM books WHERE id = $1`,
        [id]
      );
      if (bookCheck.rows.length === 0) {
        return res.status(404).json({ error: 'الكتاب غير موجود' });
      }
      if (bookCheck.rows[0].grade_id !== req.studentProfile.gradeId) {
        return res.status(403).json({ error: 'غير مصرح بالوصول لمحتوى صف دراسي آخر' });
      }
      const studentSchoolType = req.studentProfile.schoolType || 'عربي';
      if (bookCheck.rows[0].school_type && bookCheck.rows[0].school_type !== 'كلاهما' && bookCheck.rows[0].school_type !== studentSchoolType) {
        return res.status(403).json({ error: 'غير مصرح بالوصول لمحتوى غير مخصص لنوع مدرستك' });
      }
    }

    const chunksRes = await db.query(
      `SELECT id, page_number, chunk_index, content, content AS chunk_text, metadata
       FROM book_chunks
       WHERE book_id = $1 AND chapter_id = $2
       ORDER BY chunk_index ASC`,
      [id, chapterId]
    );

    return res.json(chunksRes.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب فقرات الوحدة' });
  }
});

// Stream original textbook PDF directly for student and teacher reading
router.get('/:id/pdf', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    // Verify book exists
    const bookCheck = await db.query(
      `SELECT id, title_ar, grade_id, school_type, file_url FROM books WHERE id = $1`,
      [id]
    );

    if (bookCheck.rows.length === 0) {
      return res.status(404).json({ error: 'الكتاب غير موجود' });
    }

    const book = bookCheck.rows[0];

    // Enforce student permissions
    if (req.user?.role === 'STUDENT' && req.studentProfile) {
      if (book.grade_id !== req.studentProfile.gradeId) {
        return res.status(403).json({ error: 'غير مصرح بعرض كتاب لصف دراسي آخر' });
      }
      const studentSchoolType = req.studentProfile.schoolType || 'عربي';
      if (book.school_type && book.school_type !== 'كلاهما' && book.school_type !== studentSchoolType) {
        return res.status(403).json({ error: 'غير مصرح بالوصول لمحتوى غير مخصص لنوع مدرستك' });
      }
    }

    // Check TiDB book_pdf_chunks (high-speed streaming with HTTP Range requests & batched queries)
    const countRes = await db.query(
      `SELECT COUNT(*) as cnt, SUM(LENGTH(chunk_data)) as total_len FROM book_pdf_chunks WHERE book_id = $1`,
      [id]
    );
    const totalChunks = parseInt(countRes.rows[0]?.cnt || '0', 10);
    const totalLen = parseInt(countRes.rows[0]?.total_len || '0', 10);

    if (totalChunks > 0 && totalLen > 0) {
      const etag = `"pdf-${id}-${totalLen}"`;
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="book_${id}.pdf"`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('ETag', etag);

      const rangeHeader = req.headers.range;
      const CHUNK_SIZE = 2 * 1024 * 1024; // 2097152 bytes per standard chunk

      // 1. HTTP Range Request (Enables instant Page 1 display in browser PDF reader)
      if (rangeHeader && rangeHeader.startsWith('bytes=')) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : totalLen - 1;

        if (start >= totalLen || end >= totalLen || start > end) {
          res.setHeader('Content-Range', `bytes */${totalLen}`);
          return res.status(416).end();
        }

        const startChunkIdx = Math.floor(start / CHUNK_SIZE);
        const endChunkIdx = Math.min(totalChunks - 1, Math.floor(end / CHUNK_SIZE));
        const contentLength = end - start + 1;

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLen}`);
        res.setHeader('Content-Length', String(contentLength));

        // Fetch ONLY the chunks overlapping the requested byte range
        const chunkBatch = await db.query(
          `SELECT chunk_index, chunk_data 
           FROM book_pdf_chunks 
           WHERE book_id = $1 AND chunk_index BETWEEN $2 AND $3 
           ORDER BY chunk_index ASC`,
          [id, startChunkIdx, endChunkIdx]
        );

        for (const row of chunkBatch.rows) {
          const cIdx = row.chunk_index;
          const raw = row.chunk_data;
          const chunkBuf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
          const chunkGlobalStart = cIdx * CHUNK_SIZE;

          const sliceStart = Math.max(0, start - chunkGlobalStart);
          const sliceEnd = Math.min(chunkBuf.length, end - chunkGlobalStart + 1);

          if (sliceStart < sliceEnd) {
            const part = chunkBuf.subarray(sliceStart, sliceEnd);
            res.write(part);
          }
        }
        return res.end();
      }

      // 2. Full PDF download: Batched chunk streaming (reduces database queries by 75%)
      res.setHeader('Content-Length', String(totalLen));
      const BATCH_SIZE = 4;
      for (let c = 0; c < totalChunks; c += BATCH_SIZE) {
        const endC = Math.min(totalChunks - 1, c + BATCH_SIZE - 1);
        const batchRows = await db.query(
          `SELECT chunk_index, chunk_data 
           FROM book_pdf_chunks 
           WHERE book_id = $1 AND chunk_index BETWEEN $2 AND $3 
           ORDER BY chunk_index ASC`,
          [id, c, endC]
        );
        for (const row of batchRows.rows) {
          const raw = row.chunk_data;
          const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
          res.write(buf);
        }
      }
      return res.end();
    }

    // Fallback: Check storage abstraction provider, then local disk
    const storageProvider = getStorageProvider();
    const candidateKeys = [
      `books/${id}/book_${id}.pdf`,
      `book_${id}.pdf`,
      book.file_url ? path.basename(book.file_url) : null
    ].filter(Boolean) as string[];

    let pdfBuf: Buffer | null = null;
    for (const key of candidateKeys) {
      try {
        if (await storageProvider.exists(key)) {
          pdfBuf = await storageProvider.getFile(key);
          if (pdfBuf) break;
        }
      } catch (storageErr: any) {
        console.warn(`[PDF Stream] Key check notice for "${key}":`, storageErr.message);
      }
    }

    if (!pdfBuf && book.file_url) {
      const diskPath = path.resolve(uploadDir, path.basename(book.file_url));
      if (fs.existsSync(diskPath)) {
        try {
          pdfBuf = fs.readFileSync(diskPath);
        } catch (_) {}
      }
    }

    if (pdfBuf) {
      const totalLen = pdfBuf.length;
      const etag = `"pdf-${id}-${totalLen}"`;
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="book_${id}.pdf"`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('ETag', etag);

      const rangeHeader = req.headers.range;
      if (rangeHeader && rangeHeader.startsWith('bytes=')) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : totalLen - 1;

        if (start >= totalLen || end >= totalLen || start > end) {
          res.setHeader('Content-Range', `bytes */${totalLen}`);
          return res.status(416).end();
        }

        const contentLength = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLen}`);
        res.setHeader('Content-Length', String(contentLength));
        return res.end(pdfBuf.subarray(start, end + 1));
      }

      res.setHeader('Content-Length', String(totalLen));
      return res.end(pdfBuf);
    }

    return res.status(404).json({ error: 'ملف الـ PDF الأصلي غير متوفر لهذا الكتاب حالياً' });
  } catch (err: any) {
    console.error('Stream PDF error:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء تحميل ملف الـ PDF: ' + err.message });
  }
});

// ==========================================
// UNIFIED VISUAL ASSETS SERVING ENDPOINT (Phase 4G.3Y)
// Supports both query token (?token=...) and Authorization header
// Handles extension-bearing (:assetId.pdf, :assetId.svg) and bare (:assetId) requests
// Delivers compiled in-memory SVGs and bundled deployment PDFs with HTTP Range support
// ==========================================
router.get('/assets/:assetId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const rawParam = req.params.assetId;
    if (!rawParam || typeof rawParam !== 'string') {
      return res.status(400).json({ error: 'معرّف الملف المرئي مفقود' });
    }

    let assetId = rawParam;
    if (assetId.endsWith('.pdf')) {
      assetId = assetId.slice(0, -4);
    } else if (assetId.endsWith('.svg')) {
      assetId = assetId.slice(0, -4);
    }

    // Strict regex validation — reject path traversal or malicious identifiers
    if (!/^(vis|diag)_[a-zA-Z0-9_-]+$/.test(assetId)) {
      return res.status(400).json({ error: 'معرّف الملف المرئي غير صالح' });
    }

    // Verify against manifest allowlist
    const asset = VisualAssetExtractor.getAssetById(assetId);
    if (!asset) {
      return res.status(404).json({ error: 'الأصل المرئي غير موجود' });
    }

    // Authorization: Enforce student grade & school type if user is a student
    if (req.user?.role === 'STUDENT' && req.studentProfile) {
      const bookRes = await db.query(
        'SELECT grade_id, school_type FROM books WHERE id = $1',
        [asset.book_id]
      );
      if (bookRes.rows.length > 0) {
        const book = bookRes.rows[0];
        if (book.grade_id && req.studentProfile.gradeId && book.grade_id !== req.studentProfile.gradeId) {
          return res.status(403).json({ error: 'غير مصرح بعرض وسائط تعليمية لصف دراسي آخر' });
        }
        const studentSchoolType = req.studentProfile.schoolType || 'عربي';
        if (book.school_type && book.school_type !== 'كلاهما' && book.school_type !== studentSchoolType) {
          return res.status(403).json({ error: 'غير مصرح بالوصول لمحتوى غير مخصص لنوع مدرستك' });
        }
      }
    }

    // Case 1: SVG Diagram — Serve from compiled source string in memory
    if (asset.mime_type === 'image/svg+xml') {
      const svgContent = VisualAssetExtractor.getCompiledSvg(asset.asset_id);
      if (svgContent) {
        res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
        res.setHeader('Cache-Control', 'private, max-age=86400');
        return res.status(200).send(svgContent);
      }
    }

    // Case 2: PDF Document Page — Serve from deployment bundled assets
    if (asset.mime_type === 'application/pdf') {
      const filePath = VisualAssetExtractor.getBundledPdfPath(asset.asset_id);
      if (filePath && fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        const totalLen = stat.size;
        const etag = `"asset-${asset.asset_id}-${totalLen}"`;

        if (req.headers['if-none-match'] === etag) {
          return res.status(304).end();
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${asset.asset_id}.pdf"`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        res.setHeader('ETag', etag);

        // Support HTTP Range requests (crucial for PDF viewers)
        const rangeHeader = req.headers.range;
        if (rangeHeader && rangeHeader.startsWith('bytes=')) {
          const parts = rangeHeader.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10) || 0;
          const end = parts[1] ? parseInt(parts[1], 10) : totalLen - 1;

          if (start >= totalLen || end >= totalLen || start > end) {
            res.setHeader('Content-Range', `bytes */${totalLen}`);
            return res.status(416).end();
          }

          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLen}`);
          res.setHeader('Content-Length', String(end - start + 1));
          const stream = fs.createReadStream(filePath, { start, end });
          return stream.pipe(res);
        }

        res.setHeader('Content-Length', String(totalLen));
        const stream = fs.createReadStream(filePath);
        return stream.pipe(res);
      }
    }

    // Fallback: Check storage abstraction provider or local disk (backward-compatible)
    const storage = getStorageProvider();
    const candidateKeys = [
      `visual_assets/${asset.book_id}/${path.basename(asset.file_path)}`,
      asset.asset_id,
      path.basename(asset.file_path)
    ];

    let assetBuf: Buffer | null = null;
    for (const k of candidateKeys) {
      try {
        if (await storage.exists(k)) {
          assetBuf = await storage.getFile(k, asset.sha256);
          if (assetBuf) break;
        }
      } catch (_) {}
    }

    if (!assetBuf && fs.existsSync(asset.file_path)) {
      try {
        assetBuf = fs.readFileSync(asset.file_path);
      } catch (_) {}
    }

    if (!assetBuf) {
      return res.status(404).json({ error: 'تعذر استرجاع ملف الأصل المرئي' });
    }

    res.setHeader('Content-Type', asset.mime_type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Length', String(assetBuf.length));
    return res.end(assetBuf);
  } catch (err: any) {
    console.error('Visual asset serving error:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء معالجة الوسيط المرئي' });
  }
});

// Protected storage proxy retrieval
router.get('/storage/:key(*)', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const rawKey = Array.isArray(req.params.key) ? req.params.key.join('/') : String(req.params.key || '');
    if (!rawKey || rawKey.includes('..') || rawKey.includes('\\')) {
      return res.status(400).json({ error: 'مسار الملف غير صالح' });
    }

    const cleanKey = rawKey.replace(/^[/\\]+/, '').trim();
    const storage = getStorageProvider();

    if (!(await storage.exists(cleanKey))) {
      return res.status(404).json({ error: 'الملف غير موجود في وحدة التخزين' });
    }

    const buf = await storage.getFile(cleanKey);

    const ext = path.extname(cleanKey).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.json': 'application/json'
    };

    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Length', String(buf.length));
    return res.end(buf);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في استرجاع الملف من التخزين: ' + err.message });
  }
});

// List chapters of a book with chunk statistics
router.get('/:id/chapters', authenticateToken, async (req, res) => {
  try {
    const id = String(req.params.id);
    const chaptersRes = await db.query(
      `SELECT bc.*, 
              (SELECT COUNT(*) FROM book_chunks bk WHERE bk.chapter_id = bc.id) as chunks_count
       FROM book_chapters bc
       WHERE bc.book_id = $1
       ORDER BY bc.chapter_number ASC`,
      [id]
    );
    return res.json(chaptersRes.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب وحدات الكتاب: ' + err.message });
  }
});

// Teacher manually adds a chapter to a book
router.post('/:id/chapters', authenticateToken, requireRole(['TEACHER', 'ADMIN']), async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const { chapter_number, title_ar, title_en, start_page, end_page, description } = req.body;

    if (!title_ar) {
      return res.status(400).json({ error: 'الرجاء إدخال عنوان الوحدة' });
    }

    const bookRes = await db.query('SELECT id, academic_stage_id, grade_id, subject_id FROM books WHERE id = $1', [id]);
    if (bookRes.rows.length === 0) {
      return res.status(404).json({ error: 'الكتاب غير موجود' });
    }
    const book = bookRes.rows[0];

    const chapterId = uuidv4();
    const chNum = parseInt(chapter_number, 10) || 1;
    const sPage = parseInt(start_page, 10) || 1;
    const ePage = parseInt(end_page, 10) || (sPage + 15);

    await db.query(
      `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        chapterId,
        id,
        chNum,
        title_ar.trim(),
        title_en ? title_en.trim() : `Chapter ${chNum}`,
        sPage,
        ePage,
        description || `محتوى ${title_ar} ومفهرس دلالياً لدعم التقييم التشخيصي.`
      ]
    );

    // Link chunks in this page range to the new chapter
    await db.query(
      `UPDATE book_chunks SET chapter_id = $1 
       WHERE book_id = $2 AND page_number BETWEEN $3 AND $4`,
      [chapterId, id, sPage, ePage]
    );

    return res.status(201).json({
      message: 'تمت إضافة الوحدة بنجاح',
      chapter: {
        id: chapterId,
        book_id: id,
        chapter_number: chNum,
        title_ar,
        title_en: title_en || `Chapter ${chNum}`,
        start_page: sPage,
        end_page: ePage
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في إضافة الوحدة: ' + err.message });
  }
});

// Teacher updates a chapter
router.put('/:id/chapters/:chapterId', authenticateToken, requireRole(['TEACHER', 'ADMIN']), async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const chapterId = String(req.params.chapterId);
    const { chapter_number, title_ar, title_en, start_page, end_page } = req.body;

    await db.query(
      `UPDATE book_chapters 
       SET chapter_number = COALESCE($3, chapter_number),
           title_ar = COALESCE($4, title_ar),
           title_en = COALESCE($5, title_en),
           start_page = COALESCE($6, start_page),
           end_page = COALESCE($7, end_page)
       WHERE id = $1 AND book_id = $2`,
      [chapterId, id, chapter_number, title_ar, title_en, start_page, end_page]
    );

    return res.json({ message: 'تم تحديث بيانات الوحدة بنجاح' });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في تحديث الوحدة: ' + err.message });
  }
});

// Teacher deletes a chapter
router.delete('/:id/chapters/:chapterId', authenticateToken, requireRole(['TEACHER', 'ADMIN']), async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const chapterId = String(req.params.chapterId);

    // Invariant (Phase 4G.3AG): Guard verified canonical books
    const canonicalCheck = await db.query(
      `SELECT b.id FROM books b 
       WHERE b.id = $1 AND b.processing_status IN ('COMPLETED', 'VERIFIED_READY')
         AND (SELECT COUNT(*) FROM book_chunks WHERE book_id = b.id) > 0`,
      [id]
    ).catch(() => ({ rows: [] }));
    if (canonicalCheck.rows.length > 0) {
      return res.status(403).json({ error: 'لا يمكن حذف وحدات كتاب معتمد ومفهرس دلالياً لحماية بيانات الطلاب والتقييمات.' });
    }

    await db.query('DELETE FROM book_chapters WHERE id = $1 AND book_id = $2', [chapterId, id]);
    return res.json({ message: 'تم حذف الوحدة بنجاح' });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في حذف الوحدة: ' + err.message });
  }
});

// Run AI Auto-Detection of chapters on an existing book
router.post('/:id/auto-detect-chapters', authenticateToken, requireRole(['TEACHER', 'ADMIN']), async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const bookRes = await db.query(
      'SELECT id, title_ar, title_en, total_pages, academic_stage_id, grade_id, subject_id FROM books WHERE id = $1',
      [id]
    );
    if (bookRes.rows.length === 0) {
      return res.status(404).json({ error: 'الكتاب غير موجود' });
    }
    const book = bookRes.rows[0];

    const pagesRes = await db.query(
      'SELECT page_number, raw_text as text FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC LIMIT 30',
      [id]
    );

    const detected = await aiChapterDetector.detectAndCreateChapters({
      bookId: id,
      bookTitleAr: book.title_ar,
      bookTitleEn: book.title_en,
      totalPages: Number(book.total_pages) || 120,
      pages: pagesRes.rows.map((r: any) => ({ pageNumber: Number(r.page_number) || 1, text: r.text || '' })),
      academicStageId: book.academic_stage_id,
      gradeId: book.grade_id,
      subjectId: book.subject_id
    });

    return res.json({
      message: `تم استخراج وتقسيم ${detected.length} وحدات بنجاح بالذكاء الاصطناعي.`,
      chapters: detected
    });
  } catch (err: any) {
    console.error('Auto detect chapters error:', err);
    return res.status(500).json({ error: 'فشل استخراج الوحدات آلياً: ' + err.message });
  }
});

export default router;
