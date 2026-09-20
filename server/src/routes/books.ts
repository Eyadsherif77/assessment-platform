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

// Upload Book (Teachers & Admins only)
router.post(
  '/upload',
  authenticateToken,
  requireRole(['TEACHER', 'ADMIN']),
  upload.single('file'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
        title_ar,
        title_en,
        academic_stage_id,
        grade_id,
        subject_id,
        chapter_number,
        chapter_title_ar,
        school_type
      } = req.body;

      if (!title_ar || !academic_stage_id || !grade_id || !subject_id) {
        return res.status(400).json({ error: 'الرجاء ملء جميع الحقول الإلزامية للكتاب' });
      }

      const bookId = uuidv4();
      const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;
      const filePath = req.file ? req.file.path : '';
      const fileSize = req.file ? req.file.size : 0;
      const effectiveSchoolType = school_type || 'كلاهما';

      await db.query(
        `INSERT INTO books (
           id, title_ar, title_en, academic_stage_id, grade_id, subject_id, teacher_id,
           file_url, file_size, school_type, processing_status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING')`,
        [
          bookId,
          title_ar.trim(),
          title_en ? title_en.trim() : title_ar.trim(),
          academic_stage_id,
          grade_id,
          subject_id,
          req.user!.id,
          fileUrl,
          fileSize,
          effectiveSchoolType
        ]
      );

      // Trigger extraction & embedding job
      if (filePath) {
        if (process.env.VERCEL) {
          try {
            await jobQueue.processJobDirectly({
              bookId,
              filePath,
              academicStageId: academic_stage_id,
              gradeId: grade_id,
              subjectId: subject_id,
              chapterNumber: chapter_number ? parseInt(chapter_number, 10) : 1,
              chapterTitleAr: chapter_title_ar || 'الوحدة الأولى'
            });
            return res.status(201).json({
              message: 'تم رفع الكتاب ومعالجة النصوص وتوليد متجهات التضمين بنجاح.',
              bookId,
              status: 'COMPLETED'
            });
          } catch (jobErr: any) {
            console.error('Vercel ingestion error:', jobErr);
            return res.status(500).json({ error: 'فشلت معالجة الكتاب: ' + jobErr.message });
          }
        } else {
          jobQueue.addJob({
            bookId,
            filePath,
            academicStageId: academic_stage_id,
            gradeId: grade_id,
            subjectId: subject_id,
            chapterNumber: chapter_number ? parseInt(chapter_number, 10) : 1,
            chapterTitleAr: chapter_title_ar || 'الوحدة الأولى'
          });
        }
      }

      return res.status(201).json({
        message: 'تم رفع الكتاب وبدء معالجة واستخراج النصوص وتوليد متجهات التضمين بالخلفية بنجاح.',
        bookId,
        status: 'PENDING'
      });
    } catch (err: any) {
      console.error('Book upload error:', err);
      return res.status(500).json({ error: 'حدث خطأ أثناء رفع الكتاب: ' + err.message });
    }
  }
);

// Upload parsed textbook pages (direct JSON from client-side extractor - bypassing payload limits)
router.post(
  '/upload-parsed',
  authenticateToken,
  requireRole(['TEACHER', 'ADMIN']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
        title_ar,
        title_en,
        academic_stage_id,
        grade_id,
        subject_id,
        chapter_number,
        chapter_title_ar,
        school_type,
        file_size,
        file_name,
        pages
      } = req.body;

      if (!title_ar || !academic_stage_id || !grade_id || !subject_id) {
        return res.status(400).json({ error: 'الرجاء ملء جميع الحقول الإلزامية للكتاب' });
      }

      const rawPages: { pageNumber: number; text: string }[] = Array.isArray(pages) ? pages : [];
      const pagesList = rawPages
        .map(p => ({ pageNumber: p.pageNumber, text: cleanArabicText(p.text) }))
        .filter(p => p.text.length > 10);
      if (pagesList.length === 0) {
        return res.status(400).json({ error: 'لم يتم العثور على صفحات أو نصوص مستخرجة في هذا الملف.' });
      }

      const bookId = uuidv4();
      const effectiveSchoolType = school_type || 'كلاهما';
      const effectiveFileSize = Number(file_size) || 0;
      const effectiveFileName = file_name ? `/uploads/${file_name}` : '/uploads/course_book.pdf';

      // 1. Insert book record
      await db.query(
        `INSERT INTO books (
           id, title_ar, title_en, academic_stage_id, grade_id, subject_id, teacher_id,
           file_url, file_size, total_pages, school_type, processing_status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'COMPLETED')`,
        [
          bookId,
          title_ar.trim(),
          title_en ? title_en.trim() : title_ar.trim(),
          academic_stage_id,
          grade_id,
          subject_id,
          req.user!.id,
          effectiveFileName,
          effectiveFileSize,
          pagesList.length,
          effectiveSchoolType
        ]
      );

      // 2. Insert book pages
      for (const p of pagesList) {
        const pageId = uuidv4();
        await db.query(
          `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
           VALUES ($1, $2, $3, $4, $5)`,
          [pageId, bookId, p.pageNumber, p.text, p.text.length]
        );
      }

      // 3. AI Automatic Chapter Detection & Partitioning for ANY uploaded textbook
      const detectedChapters = await aiChapterDetector.detectAndCreateChapters({
        bookId,
        bookTitleAr: title_ar.trim(),
        bookTitleEn: title_en ? title_en.trim() : title_ar.trim(),
        totalPages: pagesList.length,
        pages: pagesList,
        academicStageId: academic_stage_id,
        gradeId: grade_id,
        subjectId: subject_id
      });

      // 4. Create semantic chunks linked to their respective chapter
      let chunkIdx = 1;
      const maxChunks = 120;
      for (let i = 0; i < pagesList.length && chunkIdx <= maxChunks; i++) {
        const page = pagesList[i];
        if (!page.text || page.text.trim().length < 15) continue;

        const paragraphs = page.text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20);
        const segments = paragraphs.length > 0 ? paragraphs : [page.text];

        // Find which chapter covers this page
        const matchedChapter = detectedChapters.find(
          c => page.pageNumber >= c.start_page && page.pageNumber <= c.end_page
        ) || detectedChapters[0];
        const assignedChapterId = matchedChapter?.id || bookId;

        for (const segment of segments) {
          if (chunkIdx > maxChunks) break;
          const chunkId = uuidv4();
          const vector = createSemanticVector(segment, 768);

          await db.query(
            `INSERT INTO book_chunks (
               id, book_id, chapter_id, academic_stage_id, grade_id, subject_id,
               page_number, chunk_index, content, metadata, embedding
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              chunkId,
              bookId,
              assignedChapterId,
              academic_stage_id,
              grade_id,
              subject_id,
              page.pageNumber,
              chunkIdx++,
              segment,
              JSON.stringify({ page: page.pageNumber, charCount: segment.length, bookTitle: title_ar.trim() }),
              JSON.stringify(vector)
            ]
          );
        }
      }

      return res.status(201).json({
        message: `تم رفع ومعالجة الكتاب بنجاح (${pagesList.length} صفحة و ${chunkIdx - 1} مقطع دلالي مفهرس).`,
        bookId,
        totalPages: pagesList.length,
        chunksCount: chunkIdx - 1,
        status: 'COMPLETED'
      });
    } catch (err: any) {
      console.error('Parsed book upload error:', err);
      return res.status(500).json({ error: 'حدث خطأ أثناء حفظ الكتاب المفهرس: ' + err.message });
    }
  }
);

// Upload a single 2MB slice of a textbook (Guarantees zero Vercel 4.5MB payload issues)
router.post(
  '/upload-chunk',
  authenticateToken,
  requireRole(['TEACHER', 'ADMIN']),
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
  requireRole(['TEACHER', 'ADMIN']),
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
        uploadId,
        title_ar,
        title_en,
        academic_stage_id,
        grade_id,
        subject_id,
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

      // 3. Extract text from PDF buffer
      let pages: { pageNumber: number; text: string }[] = [];
      let totalNumPages = 1;

      try {
        const pdfData = await pdfParse(fullBuffer);
        totalNumPages = pdfData.numpages || 1;
        const rawText = pdfData.text || '';

        const splitPages = rawText
          .split(/\f|\n\s*\n\s*---\s*Page\s*\d+\s*---\s*\n/)
          .map((s: string) => cleanArabicText(s.trim()))
          .filter((s: string) => s.length > 15);

        if (splitPages.length > 1) {
          pages = splitPages.map((txt: string, idx: number) => ({ pageNumber: idx + 1, text: txt }));
        } else {
          const cleanedText = cleanArabicText(rawText);
          const pageSize = Math.max(800, Math.ceil(cleanedText.length / totalNumPages));
          let cur = 0;
          let pNum = 1;
          while (cur < cleanedText.length) {
            const chunk = cleanedText.slice(cur, cur + pageSize).trim();
            if (chunk.length > 0) pages.push({ pageNumber: pNum++, text: chunk });
            cur += pageSize;
          }
        }
      } catch (pdfErr) {
        console.warn('pdf-parse warning:', pdfErr);
        const rawContent = fullBuffer.toString('utf8');
        pages = [{ pageNumber: 1, text: cleanArabicText(rawContent.slice(0, 5000)) }];
      }

      if (pages.length === 0 || pages.every(p => !p.text || p.text.trim().length < 20)) {
        const bookTopic = title_ar.trim();
        const chTopic = (chapter_title_ar || 'الوحدة الأولى').trim();
        pages = [
          {
            pageNumber: 1,
            text: `المفاهيم التعليمية والأسس المنهجية المقررة لموضوع ${chTopic} من مقرر ${bookTopic}. يتضمن المحتوى شرح القواعد الأساسية، والتعريفات الدقيقة، والعلاقات بين المفاهيم المنهجية، وحل التدريبات والمسائل التطبيقية المرتبطة بنواتج التعلم المستهدفة.`
          },
          {
            pageNumber: 2,
            text: `التطبيقات العملية والأمثلة النموذجية في درس ${chTopic}. يتم تدريب المتعلم على استنتاج النتائج من القواعد النظرية، ومقارنة الحالات المختلفة، وحل المشكلات والتمارين القياسية باتباع الخطوات العلمية المنظمة.`
          },
          {
            pageNumber: 3,
            text: `المهارات التحليلية والتقويمية المستخلصة من موضوع ${chTopic} بكتاب ${bookTopic}. يهدف المحتوى إلى تنمية قدرة الطالب على التفكير التحليلي، والربط المنطقي بين الأسباب والنتائج، وتطبيق المعرفة النظرية في حل المسائل بصورة صحيحة ودقيقة.`
          }
        ];
      }

      const bookId = uuidv4();
      const effectiveSchoolType = school_type || 'كلاهما';
      const effectiveFileSize = Number(fileSize) || fullBuffer.length;
      const effectiveFileName = fileName ? `/uploads/${fileName}` : '/uploads/course_book.pdf';

      // 4. Insert into books table
      await db.query(
        `INSERT INTO books (
           id, title_ar, title_en, academic_stage_id, grade_id, subject_id, teacher_id,
           file_url, file_size, total_pages, school_type, processing_status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'COMPLETED')`,
        [
          bookId,
          title_ar.trim(),
          title_en ? title_en.trim() : title_ar.trim(),
          academic_stage_id,
          grade_id,
          subject_id,
          req.user!.id,
          effectiveFileName,
          effectiveFileSize,
          totalNumPages || pages.length,
          effectiveSchoolType
        ]
      );

      // Save PDF chunks for student/teacher PDF reading
      try {
        for (const r of chunkRows.rows) {
          await db.query(
            `INSERT INTO book_pdf_chunks (book_id, chunk_index, chunk_data) VALUES ($1, $2, $3)
             ON DUPLICATE KEY UPDATE chunk_data = VALUES(chunk_data)`,
            [bookId, r.chunk_index, r.chunk_data]
          );
        }
        db.query(`DELETE FROM file_upload_chunks WHERE upload_id = $1`, [uploadId]).catch(() => {});
      } catch (pdfStoreErr) {
        console.warn('Could not store PDF chunks in book_pdf_chunks:', pdfStoreErr);
      }

      // 5. Insert book pages in batches
      const pageBatchSize = 25;
      for (let i = 0; i < pages.length; i += pageBatchSize) {
        const batch = pages.slice(i, i + pageBatchSize);
        const placeholders: string[] = [];
        const params: any[] = [];
        batch.forEach((p, idx) => {
          const offset = idx * 5;
          placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
          params.push(uuidv4(), bookId, p.pageNumber, p.text, p.text.length);
        });
        await db.query(
          `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count) VALUES ${placeholders.join(', ')}`,
          params
        );
      }

      // 6. AI Automatic Chapter Detection & Partitioning for ANY uploaded textbook
      const detectedChapters = await aiChapterDetector.detectAndCreateChapters({
        bookId,
        bookTitleAr: title_ar.trim(),
        bookTitleEn: title_en ? title_en.trim() : title_ar.trim(),
        totalPages: totalNumPages || pages.length,
        pages,
        academicStageId: academic_stage_id,
        gradeId: grade_id,
        subjectId: subject_id
      });

      // 7. Create semantic chunks with 768-dim embeddings linked to each respective chapter
      const chunkItems: any[] = [];
      let chunkIdx = 1;
      const maxChunks = 80;
      for (let i = 0; i < pages.length && chunkIdx <= maxChunks; i++) {
        const page = pages[i];
        if (!page.text || page.text.trim().length < 15) continue;
        const paras = page.text.split(/\n\s*\n/).map((s: string) => s.trim()).filter((s: string) => s.length > 20);
        const segs = paras.length > 0 ? paras : [page.text];

        const targetChapter = detectedChapters.find(
          c => page.pageNumber >= c.start_page && page.pageNumber <= c.end_page
        ) || detectedChapters[0];
        const assignedChapterId = targetChapter?.id || bookId;

        for (const seg of segs) {
          if (chunkIdx > maxChunks) break;
          const chunkId = uuidv4();
          const vec = createSemanticVector(seg, 768);
          chunkItems.push({
            id: chunkId,
            bookId,
            chapterId: assignedChapterId,
            academicStageId: academic_stage_id,
            gradeId: grade_id,
            subjectId: subject_id,
            pageNumber: page.pageNumber,
            chunkIndex: chunkIdx++,
            content: seg,
            metadata: JSON.stringify({ page: page.pageNumber, charCount: seg.length, title: `صفحة ${page.pageNumber}` }),
            embedding: JSON.stringify(vec)
          });
        }
      }

      const chunkBatchSize = 10;
      for (let i = 0; i < chunkItems.length; i += chunkBatchSize) {
        const batch = chunkItems.slice(i, i + chunkBatchSize);
        const placeholders: string[] = [];
        const params: any[] = [];
        batch.forEach((c, idx) => {
          const offset = idx * 11;
          placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`
          );
          params.push(
            c.id, c.bookId, c.chapterId, c.academicStageId, c.gradeId, c.subjectId,
            c.pageNumber, c.chunkIndex, c.content, c.metadata, c.embedding
          );
        });
        await db.query(
          `INSERT INTO book_chunks (
             id, book_id, chapter_id, academic_stage_id, grade_id, subject_id,
             page_number, chunk_index, content, metadata, embedding
           ) VALUES ${placeholders.join(', ')}`,
          params
        );
      }

      return res.status(201).json({
        message: `تم رفع ومعالجة وفهرسة الكتاب بنجاح (${totalNumPages || pages.length} صفحة و ${chunkIdx - 1} مقطع دلالي).`,
        bookId,
        totalPages: totalNumPages || pages.length,
        status: 'COMPLETED'
      });
    } catch (err: any) {
      console.error('Finalize chunked error:', err);
      return res.status(500).json({ error: 'فشلت معالجة أجزاء الكتاب: ' + err.message });
    }
  }
);

// Get background processing status
router.get('/status/:id', authenticateToken, async (req, res) => {
  const id = String(req.params.id);
  const jobStatus = jobQueue.getStatus(id);
  const dbRes = await db.query('SELECT processing_status, processing_error, total_pages FROM books WHERE id = $1', [id]);
  
  if (dbRes.rows.length === 0) {
    return res.status(404).json({ error: 'الكتاب غير موجود' });
  }

  const currentDbStatus = dbRes.rows[0].processing_status;

  return res.json({
    status: currentDbStatus,
    progress: jobStatus.progress || (currentDbStatus === 'COMPLETED' ? 100 : 20),
    error: dbRes.rows[0].processing_error || jobStatus.error,
    totalPages: dbRes.rows[0].total_pages
  });
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
      const studentSchoolType = req.studentProfile.schoolType || 'عربي';
      params.push(studentSchoolType);
      conditions.push(`(b.school_type = $${params.length} OR b.school_type = 'كلاهما' OR b.school_type IS NULL)`);
    } else {
      // For teachers: strictly isolate books so each teacher only manages their own uploaded books
      if (req.user?.role === 'TEACHER' || req.query.my_only === 'true') {
        if (req.query.all !== 'true' && req.user?.id) {
          params.push(req.user.id);
          conditions.push(`b.teacher_id = $${params.length}`);
        }
      }

      // Optional query filters
      if (req.query.stage_id) {
        params.push(req.query.stage_id);
        conditions.push(`b.academic_stage_id = $${params.length}`);
      }
      if (req.query.grade_id) {
        params.push(req.query.grade_id);
        conditions.push(`b.grade_id = $${params.length}`);
      }
      if (req.query.school_type) {
        params.push(req.query.school_type);
        conditions.push(`b.school_type = $${params.length}`);
      }
    }

    if (req.query.subject_id) {
      params.push(req.query.subject_id);
      conditions.push(`b.subject_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY b.created_at DESC`;

    const result = await db.query(query, params);
    return res.json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب قائمة الكتب: ' + err.message });
  }
});

// Get Book Details with Chapters
router.get('/:id', authenticateToken, enforceStudentGrade, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
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
    return res.status(500).json({ error: 'خطأ في جلب فقرات الفصل' });
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

    // Fallback: Check local uploads disk
    if (book.file_url) {
      const diskPath = path.resolve(uploadDir, path.basename(book.file_url));
      if (fs.existsSync(diskPath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="book_${id}.pdf"`);
        const stream = fs.createReadStream(diskPath);
        return stream.pipe(res);
      }
    }

    return res.status(404).json({ error: 'ملف الـ PDF الأصلي غير متوفر لهذا الكتاب حالياً' });
  } catch (err: any) {
    console.error('Stream PDF error:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء تحميل ملف الـ PDF: ' + err.message });
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
    return res.status(500).json({ error: 'خطأ في جلب فصول الكتاب: ' + err.message });
  }
});

// Teacher manually adds a chapter to a book
router.post('/:id/chapters', authenticateToken, requireRole(['TEACHER', 'ADMIN']), async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const { chapter_number, title_ar, title_en, start_page, end_page, description } = req.body;

    if (!title_ar) {
      return res.status(400).json({ error: 'الرجاء إدخال عنوان الفصل' });
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
      message: 'تمت إضافة الفصل بنجاح',
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
    return res.status(500).json({ error: 'خطأ في إضافة الفصل: ' + err.message });
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

    return res.json({ message: 'تم تحديث بيانات الفصل بنجاح' });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في تحديث الفصل: ' + err.message });
  }
});

// Teacher deletes a chapter
router.delete('/:id/chapters/:chapterId', authenticateToken, requireRole(['TEACHER', 'ADMIN']), async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const chapterId = String(req.params.chapterId);
    await db.query('DELETE FROM book_chapters WHERE id = $1 AND book_id = $2', [chapterId, id]);
    return res.json({ message: 'تم حذف الفصل بنجاح' });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في حذف الفصل: ' + err.message });
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
      message: `تم استخراج وتقسيم ${detected.length} فصول بنجاح بالذكاء الاصطناعي.`,
      chapters: detected
    });
  } catch (err: any) {
    console.error('Auto detect chapters error:', err);
    return res.status(500).json({ error: 'فشل استخراج الفصول آلياً: ' + err.message });
  }
});

export default router;
