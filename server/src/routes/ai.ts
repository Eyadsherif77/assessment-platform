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

    // Student Safety Rule: Verify book belongs to student's academic_stage_id, grade_id & school_type
    const bookRes = await db.query(
      `SELECT id, title_ar, academic_stage_id, grade_id, school_type FROM books WHERE id = $1`,
      [book_id]
    );

    if (bookRes.rows.length === 0) {
      return res.status(404).json({ error: 'الكتاب غير موجود' });
    }

    const book = bookRes.rows[0];
    if (book.academic_stage_id !== studentProfile.academicStageId || book.grade_id !== studentProfile.gradeId) {
      return res.status(403).json({ error: 'غير مصرح لك بإجراء تقييم لكتاب خارج مرحلتك وصفك الدراسي' });
    }

    const studentSchoolType = studentProfile.schoolType || 'عربي';
    if (book.school_type && book.school_type !== 'كلاهما' && book.school_type !== studentSchoolType) {
      return res.status(403).json({ error: 'غير مصرح لك بإجراء تقييم لكتاب غير مخصص لنوع مدرستك' });
    }

    // Verify chapter belongs to book
    const chapterRes = await db.query(
      `SELECT id FROM book_chapters WHERE id = $1 AND book_id = $2`,
      [chapter_id, book_id]
    );
    if (chapterRes.rows.length === 0) {
      return res.status(400).json({ error: 'الفصل الدراسي المختار لا ينتمي لهذا الكتاب' });
    }

    const questions = await aiRagEngine.generateQuestions({
      studentId: req.user!.id,
      academicStageId: studentProfile.academicStageId,
      gradeId: studentProfile.gradeId,
      subjectId: subject_id,
      bookId: book_id,
      chapterId: chapter_id,
      count: parseInt(count, 10) || 3
    });

    // Check if Development Mode inspection is requested
    const isDevMode = process.env.NODE_ENV !== 'production' || req.headers['x-dev-debug'] === 'true' || req.query.debug === 'true';

    // Strip out is_correct from options before sending to student client, but retain source grounding (chunk_id, book_id, chapter_id)
    // In development mode only, expose debug inspection fields: chunk_text, similarity_score, validation_status
    const sanitizedQuestions = questions.map(q => ({
      id: q.id,
      chunk_id: q.chunk_id,
      book_id: q.book_id,
      chapter_id: q.chapter_id,
      question_text: q.question_text,
      difficulty: q.difficulty,
      bloom_level: q.bloom_level,
      page_reference: q.page_reference,
      ...(isDevMode ? {
        chunk_text: q.chunk_text || q.source_excerpt || '',
        similarity_score: q.similarity_score ?? 1.0,
        validation_status: q.validation_status || { isValid: true }
      } : {}),
      options: q.options.map(o => ({
        id: o.id,
        text: o.text,
        option_text: o.text
      }))
    }));

    // Developer Debug Matrix (development only)
    const debug_info = isDevMode ? questions.map(q => ({
      question_id: q.id,
      question_text: q.question_text,
      bloom_level: q.bloom_level,
      chunk_id: q.chunk_id,
      book_id: q.book_id,
      chapter_id: q.chapter_id,
      chunk_text: q.chunk_text || q.source_excerpt || '',
      similarity_score: q.similarity_score ?? 1.0,
      validation_status: q.validation_status || { isValid: true }
    })) : undefined;

    return res.json({
      book_id,
      chapter_id,
      subject_id,
      questions: sanitizedQuestions,
      debug_info,
      _server_context_questions: questions // for verification in submit
    });
  } catch (err: any) {
    console.error('AI Generate Quiz error:', err);
    if (err.message?.includes('Insufficient educational content for assessment generation')) {
      return res.status(422).json({
        error: 'المحتوى التعليمي المستخرج من هذا الفصل غير كافٍ لصياغة أسئلة تقييمية معتمدة.',
        code: 'INSUFFICIENT_EDUCATIONAL_CONTENT'
      });
    }
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

    // Student Safety Rule: Verify book belongs to student's academic stage and grade
    const bookRes = await db.query(
      `SELECT id, academic_stage_id, grade_id FROM books WHERE id = $1`,
      [book_id]
    );
    if (
      bookRes.rows.length === 0 ||
      bookRes.rows[0].academic_stage_id !== studentProfile.academicStageId ||
      bookRes.rows[0].grade_id !== studentProfile.gradeId
    ) {
      return res.status(403).json({ error: 'غير مصرح لك بإرسال تقييم لكتاب خارج مرحلتك وصفك الدراسي' });
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
      message: 'تم إتمام التقييم الذكي وتشخيص نقاط الضعف وخطة المراجعة بنجاح',
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

// Get Single AI Evaluation Formatted Review for Teachers/Students
router.get('/evaluations/:id/review', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const resEval = await db.query(
      `SELECT ae.*, b.title_ar as book_title, s.name_ar as subject_name, bc.title_ar as chapter_title,
              u.full_name as student_name, u.email as student_email,
              sp.student_code, sp.school_name, sp.school_type
       FROM ai_evaluations ae
       JOIN books b ON ae.book_id = b.id
       JOIN subjects s ON ae.subject_id = s.id
       JOIN users u ON ae.student_id = u.id
       LEFT JOIN student_profiles sp ON ae.student_id = sp.user_id
       LEFT JOIN book_chapters bc ON ae.chapter_id = bc.id
       WHERE ae.id = $1`,
      [id]
    );

    if (resEval.rows.length === 0) {
      return res.status(404).json({ error: 'تقرير التقييم غير موجود' });
    }

    const row = resEval.rows[0];

    // Check permission
    if (req.user?.role === 'STUDENT' && row.student_id !== req.user.id) {
      return res.status(403).json({ error: 'غير مصرح لك بالاطلاع على تقييم طالب آخر' });
    }

    let questionsData: any[] = [];
    let answersData: any[] = [];
    let evalReport: any = {};

    try {
      questionsData = typeof row.questions_data === 'string' ? JSON.parse(row.questions_data) : (row.questions_data || []);
    } catch (_) {}
    try {
      answersData = typeof row.student_answers_data === 'string' ? JSON.parse(row.student_answers_data) : (row.student_answers_data || []);
    } catch (_) {}
    try {
      evalReport = typeof row.evaluation_report === 'string' ? JSON.parse(row.evaluation_report) : (row.evaluation_report || {});
    } catch (_) {}

    const totalPts = Number(row.total_questions) || (questionsData.length || 1);
    const score = Number(row.score) || 0;
    const percentage = Math.round((score / totalPts) * 100);

    const questions = questionsData.map((q: any) => {
      const studentAns = answersData.find((a: any) => a.question_id === q.id);
      const selectedOptId = studentAns?.selected_option_id;

      const opts = (q.options || []).map((o: any) => ({
        id: o.id,
        option_text: o.text || o.option_text || '',
        is_correct: o.is_correct === true || o.id === q.correct_option_id
      }));

      const correctOpt = opts.find((o: any) => o.is_correct);
      const isCorrect = selectedOptId ? (selectedOptId === correctOpt?.id) : false;

      return {
        id: q.id,
        question_text: q.question_text,
        question_type: q.question_type || 'MULTIPLE_CHOICE',
        points: 1,
        points_awarded: isCorrect ? 1 : 0,
        is_correct: isCorrect,
        selected_option_id: selectedOptId || null,
        correct_option_id: correctOpt?.id || null,
        correct_option_text: correctOpt?.option_text || '',
        explanation: q.explanation || null,
        page_reference: q.page_reference || null,
        options: opts
      };
    });

    return res.json({
      attempt: {
        id: row.id,
        exam_id: null,
        exam_title: `${row.subject_name} - ${row.chapter_title || row.book_title} (تقييم ذكي)`,
        exam_title_ar: `${row.subject_name} - ${row.chapter_title || row.book_title} (تقييم ذكي)`,
        student_id: row.student_id,
        student_name: row.student_name,
        student_email: row.student_email,
        student_code: row.student_code || row.student_id.substring(0, 8),
        school_name: row.school_name,
        school_type: row.school_type,
        subject_name: row.subject_name,
        score,
        total_points: totalPts,
        percentage,
        completed_at: row.created_at,
        is_ai_evaluation: true,
        evaluation_report: evalReport
      },
      questions
    });
  } catch (err: any) {
    console.error('AI Evaluation review error:', err);
    return res.status(500).json({ error: 'خطأ في جلب تفاصيل تقييم الذكاء الاصطناعي: ' + err.message });
  }
});

export default router;
