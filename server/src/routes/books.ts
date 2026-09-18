import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/db.js';
import { authenticateToken, requireRole, enforceStudentGrade, AuthenticatedRequest } from '../middleware/auth.js';
import { jobQueue } from '../services/jobs/jobQueue.js';

const router = Router();

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
      // Optional query filters for teachers
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
