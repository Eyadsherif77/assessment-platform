import { Router } from 'express';
import { db } from '../db/db.js';
import { authenticateToken, requireRole, enforceStudentGrade, AuthenticatedRequest } from '../middleware/auth.js';
import { aiRagEngine } from '../services/ai/aiRagEngine.js';

const router = Router();

// Generate AI Grounded Assessment
router.post('/generate-quiz', authenticateToken, requireRole(['STUDENT']), enforceStudentGrade, async (req: AuthenticatedRequest, res) => {
  try {
    const { book_id, chapter_id, subject_id, count = 3 } = req.body;

    if (!book_id || !chapter_id || !subject_id) {
      return res.status(400).json({ error: 'الرجاء اختيار المادة والكتاب والفصل الدراسي للتقييم' });
    }

    const studentProfile = req.studentProfile;
    if (!studentProfile) {
      return res.status(403).json({ error: 'بيانات الملف الدراسي للطالب غير متوفرة' });
    }

    // Verify book belongs to student's grade
    const bookRes = await db.query(
      `SELECT id, title_ar, academic_stage_id, grade_id FROM books WHERE id = $1`,
      [book_id]
    );

    if (bookRes.rows.length === 0) {
      return res.status(404).json({ error: 'الكتاب غير موجود' });
    }

    if (bookRes.rows[0].grade_id !== studentProfile.gradeId) {
      return res.status(403).json({ error: 'غير مصرح لك بإجراء تقييم لكتاب خارج صفك الدراسي' });
    }

    const questions = await aiRagEngine.generateQuestions({
      academicStageId: studentProfile.academicStageId,
      gradeId: studentProfile.gradeId,
      subjectId: subject_id,
      bookId: book_id,
      chapterId: chapter_id,
      count: parseInt(count, 10) || 3
    });

    // Strip out is_correct from options before sending to student client
    const sanitizedQuestions = questions.map(q => ({
      id: q.id,
      question_text: q.question_text,
      difficulty: q.difficulty,
      bloom_level: q.bloom_level,
      page_reference: q.page_reference,
      options: q.options.map(o => ({
        id: o.id,
        text: o.text
      }))
    }));

    return res.json({
      book_id,
      chapter_id,
      subject_id,
      questions: sanitizedQuestions,
      _server_context_questions: questions // for verification in submit
    });
  } catch (err: any) {
    console.error('AI Generate Quiz error:', err);
    return res.status(500).json({ error: 'خطأ في توليد التقييم الذكي: ' + err.message });
  }
});

// Evaluate Student Answers with RAG diagnosis & Study Prescription
router.post('/evaluate', authenticateToken, requireRole(['STUDENT']), enforceStudentGrade, async (req: AuthenticatedRequest, res) => {
  try {
    const { book_id, chapter_id, subject_id, questions, answers } = req.body;

    if (!book_id || !chapter_id || !subject_id || !Array.isArray(questions) || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'بيانات التقييم غير مكتملة' });
    }

    const studentProfile = req.studentProfile;
    if (!studentProfile) {
      return res.status(403).json({ error: 'بيانات الملف الدراسي للطالب غير متوفرة' });
    }

    const report = await aiRagEngine.evaluateSubmission({
      studentId: req.user!.id,
      academicStageId: studentProfile.academicStageId,
      gradeId: studentProfile.gradeId,
      subjectId: subject_id,
      bookId: book_id,
      chapterId: chapter_id,
      questions: questions,
      studentAnswers: answers
    });

    return res.json({
      message: 'تم إتمام التقييم الذكي وتشخيص نقاط الضعف وخطة العلاج بنجاح',
      report
    });
  } catch (err: any) {
    console.error('AI Evaluate error:', err);
    return res.status(500).json({ error: 'خطأ أثناء تقييم الإجابات: ' + err.message });
  }
});

// Get Student AI Evaluation History
router.get('/evaluations', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const studentId = req.user!.id;
    const resEvaluations = await db.query(
      `SELECT ae.id, ae.score, ae.total_questions, ae.created_at,
              b.title_ar as book_title, s.name_ar as subject_name,
              bc.title_ar as chapter_title,
              ae.evaluation_report
       FROM ai_evaluations ae
       JOIN books b ON ae.book_id = b.id
       JOIN subjects s ON ae.subject_id = s.id
       LEFT JOIN book_chapters bc ON ae.chapter_id = bc.id
       WHERE ae.student_id = $1
       ORDER BY ae.created_at DESC`,
      [studentId]
    );

    return res.json(resEvaluations.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب سجل التقييمات' });
  }
});

// Get Single AI Evaluation Details
router.get('/evaluations/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const resEval = await db.query(
      `SELECT ae.*, b.title_ar as book_title, s.name_ar as subject_name, bc.title_ar as chapter_title
       FROM ai_evaluations ae
       JOIN books b ON ae.book_id = b.id
       JOIN subjects s ON ae.subject_id = s.id
       LEFT JOIN book_chapters bc ON ae.chapter_id = bc.id
       WHERE ae.id = $1`,
      [id]
    );

    if (resEval.rows.length === 0) {
      return res.status(404).json({ error: 'تقرير التقييم غير موجود' });
    }

    return res.json(resEval.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب تفاصيل التقييم' });
  }
});

export default router;
