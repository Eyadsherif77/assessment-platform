import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/db.js';
import { authenticateToken, requireRole, enforceStudentGrade, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// List exams
router.get('/', authenticateToken, enforceStudentGrade, async (req: AuthenticatedRequest, res) => {
  try {
    let sql = `
      SELECT e.*, s.name_ar as subject_name_ar, s.name_en as subject_name_en,
             st.name_ar as stage_name_ar, g.name_ar as grade_name_ar,
             u.full_name as teacher_name,
             COALESCE(e.school_type, b.school_type, 'كلاهما') as effective_school_type,
             (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) as questions_count
      FROM exams e
      JOIN subjects s ON e.subject_id = s.id
      JOIN academic_stages st ON e.academic_stage_id = st.id
      JOIN grades g ON e.grade_id = g.id
      JOIN users u ON e.teacher_id = u.id
      LEFT JOIN books b ON e.book_id = b.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    // Students only see published exams matching their stage, grade & school_type
    if (req.user?.role === 'STUDENT' && req.studentProfile) {
      params.push(req.studentProfile.academicStageId);
      conditions.push(`e.academic_stage_id = $${params.length}`);

      if (req.studentProfile.gradeId) {
        params.push(req.studentProfile.gradeId);
        params.push(req.studentProfile.academicStageId);
        conditions.push(`(e.grade_id = $${params.length - 1} OR e.grade_id IS NULL OR e.academic_stage_id = $${params.length})`);
      }

      conditions.push(`e.is_published = 1`);

      const studentSchoolType = (req.studentProfile.schoolType || 'عربي').trim();
      const normStudentSchoolType = studentSchoolType.replace('ى', 'ي');
      params.push(studentSchoolType);
      params.push(normStudentSchoolType);
      conditions.push(`(
        COALESCE(e.school_type, b.school_type, 'كلاهما') IN ('كلاهما', 'both', 'Both', 'عربي ولغات', 'عام ولغات')
        OR COALESCE(e.school_type, b.school_type) IS NULL
        OR COALESCE(e.school_type, b.school_type) = $${params.length - 1}
        OR COALESCE(e.school_type, b.school_type) = $${params.length}
        OR REPLACE(COALESCE(e.school_type, b.school_type, ''), 'ى', 'ي') = $${params.length}
      )`);
    } else if (req.user?.role === 'TEACHER') {
      // Teachers see their own exams or all
      if (req.query.my_only === 'true') {
        params.push(req.user.id);
        conditions.push(`e.teacher_id = $${params.length}`);
      }
      if (req.query.stage_id) {
        params.push(req.query.stage_id);
        conditions.push(`e.academic_stage_id = $${params.length}`);
      }
      if (req.query.grade_id) {
        params.push(req.query.grade_id);
        conditions.push(`e.grade_id = $${params.length}`);
      }
      if (req.query.school_type) {
        params.push(req.query.school_type);
        conditions.push(`(e.school_type = $${params.length} OR e.school_type = 'كلاهما')`);
      }
    }

    if (req.query.subject_id) {
      params.push(req.query.subject_id);
      conditions.push(`e.subject_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }

    sql += ` ORDER BY e.created_at DESC`;
    const result = await db.query(sql, params);
    return res.json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب الاختبارات: ' + err.message });
  }
});

// Create exam (Teachers only)
router.post('/', authenticateToken, requireRole(['TEACHER', 'ADMIN']), async (req: AuthenticatedRequest, res) => {
  try {
    const {
      title_ar,
      title_en,
      academic_stage_id,
      grade_id,
      subject_id,
      book_id,
      chapter_id,
      duration_minutes = 30,
      is_published = false,
      school_type = 'كلاهما',
      questions
    } = req.body;

    if (!title_ar || !subject_id) {
      return res.status(400).json({ error: 'الرجاء إدخال البيانات الأساسية للاختبار' });
    }

    const prepStageId = '61998777-4c5f-4e51-bc0a-38de938c842a'; // المرحلة الإعدادية
    const prep3GradeId = '2f0f4f5a-7c5c-4136-a935-33c79effca3d'; // الصف الثالث الإعدادي

    const examId = uuidv4();
    await db.query(
      `INSERT INTO exams (
         id, title_ar, title_en, teacher_id, academic_stage_id, grade_id, subject_id,
         book_id, chapter_id, duration_minutes, is_published, school_type
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        examId,
        title_ar.trim(),
        title_en ? title_en.trim() : title_ar.trim(),
        req.user!.id,
        prepStageId,
        prep3GradeId,
        subject_id,
        book_id || null,
        chapter_id || null,
        duration_minutes,
        is_published ? 1 : 0,
        school_type || 'كلاهما'
      ]
    );

    if (Array.isArray(questions) && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const qId = uuidv4();
        await db.query(
          `INSERT INTO exam_questions (id, exam_id, question_text, points, page_reference, explanation, order_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            qId,
            examId,
            q.question_text.trim(),
            q.points || 1,
            q.page_reference ? String(q.page_reference).trim() : null,
            q.explanation || null,
            i + 1
          ]
        );

        if (Array.isArray(q.options)) {
          for (const opt of q.options) {
            await db.query(
              `INSERT INTO exam_question_options (id, question_id, option_text, is_correct)
               VALUES ($1, $2, $3, $4)`,
              [uuidv4(), qId, opt.option_text.trim(), opt.is_correct ? 1 : 0]
            );
          }
        }
      }
    }

    return res.status(201).json({ message: 'تم إنشاء الاختبار بنجاح', id: examId });
  } catch (err: any) {
    console.error('Exam create error:', err);
    return res.status(500).json({ error: 'خطأ في إنشاء الاختبار' });
  }
});

// Toggle publish status (Teacher only)
router.patch('/:id/publish', authenticateToken, requireRole(['TEACHER', 'ADMIN']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { is_published } = req.body;

    const publishVal = (is_published === true || is_published === 1 || is_published === '1') ? 1 : 0;
    await db.query(
      `UPDATE exams SET is_published = $1 WHERE id = $2 AND (teacher_id = $3 OR $4 = 'ADMIN')`,
      [publishVal, id, req.user!.id, req.user!.role]
    );

    return res.json({ message: 'تم تحديث حالة نشر الاختبار بنجاح' });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في تحديث حالة النشر' });
  }
});

// Get Exam Details and Questions (Student or Teacher)
router.get('/:id', authenticateToken, enforceStudentGrade, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const examRes = await db.query(
      `SELECT e.*, s.name_ar as subject_name_ar, st.name_ar as stage_name_ar, g.name_ar as grade_name_ar,
              u.full_name as teacher_name
       FROM exams e
       JOIN subjects s ON e.subject_id = s.id
       JOIN academic_stages st ON e.academic_stage_id = st.id
       JOIN grades g ON e.grade_id = g.id
       JOIN users u ON e.teacher_id = u.id
       WHERE e.id = $1`,
      [id]
    );

    if (examRes.rows.length === 0) {
      return res.status(404).json({ error: 'الاختبار غير موجود' });
    }

    const exam = examRes.rows[0];

    // Enforce student access
    if (req.user?.role === 'STUDENT' && req.studentProfile) {
      if (exam.academic_stage_id !== req.studentProfile.academicStageId && exam.grade_id !== req.studentProfile.gradeId) {
        return res.status(403).json({ error: 'هذا الاختبار غير مخصص لمرحلتك أو صفك الدراسي' });
      }
      if (!exam.is_published) {
        return res.status(403).json({ error: 'هذا الاختبار غير منشور حالياً' });
      }
      const studentSchoolType = (req.studentProfile.schoolType || 'عربي').trim().replace('ى', 'ي');
      const examSchoolType = (exam.school_type || 'كلاهما').trim().replace('ى', 'ي');
      const isBoth = ['كلاهما', 'both', 'عربي ولغات', 'عام ولغات'].includes(examSchoolType);
      if (!isBoth && examSchoolType && examSchoolType !== studentSchoolType) {
        return res.status(403).json({ error: 'هذا الاختبار غير مخصص لنوع مدرستك' });
      }
    }

    // Fetch questions
    const questionsRes = await db.query(
      `SELECT id, question_text, points, page_reference, explanation, order_index FROM exam_questions WHERE exam_id = $1 ORDER BY order_index ASC`,
      [id]
    );

    const isTeacher = req.user?.role === 'TEACHER' || req.user?.role === 'ADMIN';

    const questionsWithOptions = await Promise.all(
      questionsRes.rows.map(async q => {
        const optSql = isTeacher
          ? `SELECT id, option_text, is_correct FROM exam_question_options WHERE question_id = $1`
          : `SELECT id, option_text FROM exam_question_options WHERE question_id = $1`;
        const optionsRes = await db.query(optSql, [q.id]);
        return {
          ...q,
          options: optionsRes.rows
        };
      })
    );

    return res.json({
      exam,
      questions: questionsWithOptions
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب بيانات الاختبار' });
  }
});

// Submit Exam Answers (Student only)
router.post('/:id/submit', authenticateToken, requireRole(['STUDENT']), enforceStudentGrade, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { answers } = req.body; // Array of { question_id, selected_option_id }

    const examRes = await db.query('SELECT * FROM exams WHERE id = $1', [id]);
    if (examRes.rows.length === 0) {
      return res.status(404).json({ error: 'الاختبار غير موجود' });
    }

    const exam = examRes.rows[0];
    if (exam.academic_stage_id !== req.studentProfile?.academicStageId && exam.grade_id !== req.studentProfile?.gradeId) {
      return res.status(403).json({ error: 'الاختبار غير مخصص لمرحلتك أو صفك الدراسي' });
    }
    const studentSchoolType = (req.studentProfile?.schoolType || 'عربي').trim().replace('ى', 'ي');
    const examSchoolType = (exam.school_type || 'كلاهما').trim().replace('ى', 'ي');
    const isBoth = ['كلاهما', 'both', 'عربي ولغات', 'عام ولغات'].includes(examSchoolType);
    if (!isBoth && examSchoolType && examSchoolType !== studentSchoolType) {
      return res.status(403).json({ error: 'الاختبار غير مخصص لنوع مدرستك' });
    }

    // Fetch all questions and their correct options
    const questionsRes = await db.query(
      `SELECT eq.id, eq.points, eq.explanation, eq.question_text, eq.page_reference,
              eqo.id as correct_option_id, eqo.option_text as correct_option_text
       FROM exam_questions eq
       JOIN exam_question_options eqo ON eq.id = eqo.question_id AND eqo.is_correct = 1
       WHERE eq.exam_id = $1`,
      [id]
    );

    let totalScore = 0;
    let totalPoints = 0;
    const itemResults: any[] = [];
    const attemptId = uuidv4();

    // Start attempt record
    await db.query(
      `INSERT INTO exam_attempts (id, exam_id, student_id, score, total_points, status)
       VALUES ($1, $2, $3, 0, 0, 'COMPLETED')`,
      [attemptId, id, req.user!.id]
    );

    for (const q of questionsRes.rows) {
      totalPoints += q.points;
      const studentSub = Array.isArray(answers) ? answers.find((a: any) => a.question_id === q.id) : null;
      const selectedOptId = studentSub?.selected_option_id;

      const isCorrect = selectedOptId === q.correct_option_id;
      const pointsAwarded = isCorrect ? q.points : 0;
      totalScore += pointsAwarded;

      // Fetch selected option text
      let selectedText = 'لم يتم اختيار إجابة';
      if (selectedOptId) {
        const optRes = await db.query('SELECT option_text FROM exam_question_options WHERE id = $1', [selectedOptId]);
        if (optRes.rows.length > 0) {
          selectedText = optRes.rows[0].option_text;
        }
      }

      await db.query(
        `INSERT INTO student_answers (
           id, attempt_id, question_id, selected_option_id, is_correct, points_awarded
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), attemptId, q.id, selectedOptId || null, isCorrect ? 1 : 0, pointsAwarded]
      );

      itemResults.push({
        question_id: q.id,
        question_text: q.question_text,
        selected_option_id: selectedOptId,
        selected_text: selectedText,
        correct_option_id: q.correct_option_id,
        correct_text: q.correct_option_text,
        is_correct: isCorrect,
        points_awarded: pointsAwarded,
        max_points: q.points,
        explanation: q.explanation,
        page_reference: q.page_reference
      });
    }

    // Update attempt with final score
    await db.query(
      `UPDATE exam_attempts SET score = $2, total_points = $3, completed_at = datetime('now') WHERE id = $1`,
      [attemptId, totalScore, totalPoints]
    );

    const percentage = totalPoints > 0 ? Number(((totalScore / totalPoints) * 100).toFixed(1)) : 0;

    // Record into student learning history
    await db.query(
      `INSERT INTO student_learning_history (
         id, student_id, event_type, reference_id, subject_id, chapter_id, score_percentage
       ) VALUES ($1, $2, 'EXAM', $3, $4, $5, $6)`,
      [uuidv4(), req.user!.id, attemptId, exam.subject_id, exam.chapter_id, percentage]
    );

    return res.json({
      message: 'تم تصحيح وتسجيل نتائج الاختبار فورياً',
      attempt_id: attemptId,
      score: totalScore,
      total_points: totalPoints,
      percentage,
      passed: percentage >= 50,
      breakdown: itemResults
    });
  } catch (err: any) {
    console.error('Exam submit error:', err);
    return res.status(500).json({ error: 'خطأ في تسجيل وتصحيح إجابات الاختبار' });
  }
});

// View attempts for an exam
router.get('/:id/attempts', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    let sql = `
      SELECT ea.*, u.full_name as student_name, u.email as student_email
      FROM exam_attempts ea
      JOIN users u ON ea.student_id = u.id
      WHERE ea.exam_id = $1
    `;
    const params: any[] = [id];

    if (req.user?.role === 'STUDENT') {
      params.push(req.user.id);
      sql += ` AND ea.student_id = $2`;
    }

    sql += ` ORDER BY ea.completed_at DESC`;
    const result = await db.query(sql, params);
    return res.json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب نتائج المحاولات' });
  }
});

export default router;
