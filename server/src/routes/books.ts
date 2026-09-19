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

      const pagesList: { pageNumber: number; text: string }[] = Array.isArray(pages) ? pages : [];
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

      // 2. Insert primary chapter
      const chapterId = uuidv4();
      const chNum = parseInt(chapter_number, 10) || 1;
      const chTitle = chapter_title_ar ? chapter_title_ar.trim() : 'الوحدة الأولى: المنهج الدراسي';
      const firstPageNum = pagesList[0].pageNumber || 1;
      const lastPageNum = pagesList[pagesList.length - 1].pageNumber || pagesList.length;

      await db.query(
        `INSERT INTO book_chapters (
           id, book_id, chapter_number, title_ar, title_en, start_page, end_page, description
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          chapterId,
          bookId,
          chNum,
          chTitle,
          `Chapter ${chNum}`,
          firstPageNum,
          lastPageNum,
          `محتوى ${chTitle} المستخرج ومفهرس دلالياً لدعم التقييم التشخيصي وبنوك الأسئلة.`
        ]
      );

      // 3. Insert book pages
      for (const p of pagesList) {
        const pageId = uuidv4();
        await db.query(
          `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
           VALUES ($1, $2, $3, $4, $5)`,
          [pageId, bookId, p.pageNumber, p.text, p.text.length]
        );
      }

      // 4. Create semantic chunks
      let chunkIdx = 1;
      const maxChunks = 120;
      for (let i = 0; i < pagesList.length && chunkIdx <= maxChunks; i++) {
        const page = pagesList[i];
        if (!page.text || page.text.trim().length < 15) continue;

        const paragraphs = page.text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20);
        const segments = paragraphs.length > 0 ? paragraphs : [page.text];

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
              chapterId,
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

      // Clean up temporary chunks from database in background
      db.query(`DELETE FROM file_upload_chunks WHERE upload_id = $1`, [uploadId]).catch(() => {});

      // 3. Extract text from PDF buffer
      let pages: { pageNumber: number; text: string }[] = [];
      let totalNumPages = 1;

      try {
        const pdfData = await pdfParse(fullBuffer);
        totalNumPages = pdfData.numpages || 1;
        const rawText = pdfData.text || '';

        const splitPages = rawText.split(/\f|\n\s*\n\s*---\s*Page\s*\d+\s*---\s*\n/).map((s: string) => s.trim()).filter((s: string) => s.length > 15);
        if (splitPages.length > 1) {
          pages = splitPages.map((txt: string, idx: number) => ({ pageNumber: idx + 1, text: txt }));
        } else {
          const pageSize = Math.max(800, Math.ceil(rawText.length / totalNumPages));
          let cur = 0;
          let pNum = 1;
          while (cur < rawText.length) {
            const chunk = rawText.slice(cur, cur + pageSize).trim();
            if (chunk.length > 0) pages.push({ pageNumber: pNum++, text: chunk });
            cur += pageSize;
          }
        }
      } catch (pdfErr) {
        console.warn('pdf-parse warning:', pdfErr);
        const rawContent = fullBuffer.toString('utf8');
        pages = [{ pageNumber: 1, text: rawContent.slice(0, 5000) }];
      }

      if (pages.length === 0) {
        pages = [{ pageNumber: 1, text: 'محتوى المقرر الدراسي المعتمد' }];
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

      // 5. Insert primary chapter
      const chapterId = uuidv4();
      const chNum = parseInt(chapter_number, 10) || 1;
      const chTitle = chapter_title_ar ? chapter_title_ar.trim() : 'الوحدة الأولى: المنهج الدراسي';
      await db.query(
        `INSERT INTO book_chapters (
           id, book_id, chapter_number, title_ar, title_en, start_page, end_page, description
         ) VALUES ($1, $2, $3, $4, $5, 1, $6, $7)`,
        [
          chapterId,
          bookId,
          chNum,
          chTitle,
          `Chapter ${chNum}`,
          totalNumPages || pages.length,
          `محتوى ${chTitle} المستخرج ومفهرس دلالياً لدعم التقييم والأسئلة الذكية.`
        ]
      );

      // 6. Insert book pages in batches
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

      // 7. Create semantic chunks with 768-dim embeddings in batches
      const chunkItems: any[] = [];
      let chunkIdx = 1;
      const maxChunks = 80;
      for (let i = 0; i < pages.length && chunkIdx <= maxChunks; i++) {
        const page = pages[i];
        if (!page.text || page.text.trim().length < 15) continue;
        const paras = page.text.split(/\n\s*\n/).map((s: string) => s.trim()).filter((s: string) => s.length > 20);
        const segs = paras.length > 0 ? paras : [page.text];

        for (const seg of segs) {
          if (chunkIdx > maxChunks) break;
          const chunkId = uuidv4();
          const vec = createSemanticVector(seg, 768);
          chunkItems.push({
            id: chunkId,
            bookId,
            chapterId,
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
      `SELECT * FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC`,
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

export default router;
