import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/db.js';
import { authenticateToken, requireRole, enforceStudentGrade, AuthenticatedRequest } from '../middleware/auth.js';
import { checkStudentExamLimit, getMonthlyExamLimit } from '../services/examLimitService.js';
import { ExamCacheService } from '../services/examCacheService.js';

const router = Router();

// Get Monthly Exam Limit Status for current student
router.get('/monthly-limit-status', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user?.role !== 'STUDENT') {
      const limit = await getMonthlyExamLimit();
      return res.json({ limit, currentCount: 0, remaining: limit, isLimitReached: false });
    }
    const status = await checkStudentExamLimit(req.user.id);
    return res.json({
      limit: status.limit,
      currentCount: status.currentCount,
      remaining: status.remaining,
      isLimitReached: !status.allowed,
      message: status.message
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب بيانات الحد الشهري للاختبارات' });
  }
});

// List exams
router.get('/', authenticateToken, enforceStudentGrade, async (req: AuthenticatedRequest, res) => {
  try {
    let sql = `
      SELECT e.*, s.name_ar as subject_name_ar, s.name_en as subject_name_en,
             st.name_ar as stage_name_ar, g.name_ar as grade_name_ar,
             u.full_name as teacher_name,
             COALESCE(e.school_type, b.school_type, 'كلاهما') as effective_school_type,
             (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) as questions_count,
             (SELECT COUNT(*) FROM exam_attempts ea WHERE ea.exam_id = e.id) as submissions_count
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
      // If subject_id is not specified in query, filter teacher exams by their specialization
      if (!req.query.subject_id) {
        let spec = (req.teacherProfile?.specialization || '').trim();
        if (!spec && req.user?.id) {
          const tRes = await db.query(`SELECT specialization FROM teacher_profiles WHERE user_id = $1`, [req.user.id]);
          spec = (tRes.rows[0]?.specialization || '').trim();
        }
        if (spec) {
          const specClean = spec.replace(/^(اللغة|مادة|معلم أول|معلم)\s+/i, '').trim().toLowerCase();
          if (specClean.includes('عرب') || specClean.includes('arabic')) {
            conditions.push(`(s.code = 'ARABIC' OR s.name_ar LIKE '%عرب%' OR LOWER(s.name_en) LIKE '%arabic%')`);
          } else if (specClean.includes('رياض') || specClean.includes('math')) {
            conditions.push(`(s.code = 'MATH' OR s.name_ar LIKE '%رياض%' OR LOWER(s.name_en) LIKE '%math%')`);
          } else if (specClean.includes('علوم') || specClean.includes('science')) {
            conditions.push(`(s.code = 'SCIENCE' OR s.name_ar LIKE '%علوم%' OR LOWER(s.name_en) LIKE '%science%')`);
          } else if (specClean.includes('انجليز') || specClean.includes('إنجليز') || specClean.includes('english')) {
            conditions.push(`(s.code = 'ENGLISH' OR s.name_ar LIKE '%إنجليز%' OR s.name_ar LIKE '%انجليز%' OR LOWER(s.name_en) LIKE '%english%')`);
          }
        }
      }
    }

    if (req.query.subject_id) {
      params.push(req.query.subject_id);
      conditions.push(`e.subject_id = $${params.length}`);
    }

    // Term filter: explicit query or default to active_term for students and teachers
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
      conditions.push(`(e.term = $${params.length} OR e.term IS NULL)`);
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

// Create exam (Teachers & Supervisors)
router.post('/', authenticateToken, requireRole(['TEACHER', 'ADMIN', 'SUPERVISOR', 'CENTRAL_ADMIN']), async (req: AuthenticatedRequest, res) => {
  try {
    const {
      title_ar,
      title_en,
      academic_stage_id,
      grade_id,
      subject_id,
      book_id,
      chapter_id,
      term,
      duration_minutes = 30,
      is_published = false,
      school_type = 'كلاهما',
      governorate_id,
      questions
    } = req.body;

    if (!title_ar || !subject_id) {
      return res.status(400).json({ error: 'الرجاء إدخال البيانات الأساسية للاختبار' });
    }

    // Resolve term from body or active platform term
    let finalTerm = term ? (parseInt(String(term), 10) === 2 ? 2 : 1) : null;
    if (!finalTerm) {
      try {
        const termSetting = await db.query(`SELECT setting_value FROM platform_settings WHERE setting_key = 'active_term'`);
        finalTerm = termSetting.rows.length > 0 ? (parseInt(termSetting.rows[0].setting_value, 10) || 1) : 1;
      } catch (_) {
        finalTerm = 1;
      }
    }

    let finalStageId = academic_stage_id;
    let finalGradeId = grade_id;
    let finalSubjectId = subject_id;
    let finalSchoolType = school_type || 'كلاهما';
    let finalExamTerm = finalTerm;

    if (book_id) {
      // Authoritative curriculum identity resolution
      const identity = await ExamCacheService.resolveCurriculumIdentity(book_id);

      // Validate teacher authorization
      const tAuth = await ExamCacheService.validateTeacherAuthorization(req.user!.id, identity);
      if (!tAuth.isAuthorized) {
        return res.status(403).json({ error: tAuth.reason || 'غير مصرح للمعلم بإنشاء اختبار لهذه المادة أو الكتاب' });
      }

      // Check selection consistency against authoritative DB record
      const consistency = ExamCacheService.validateSelectionConsistency(identity, {
        subjectId: subject_id,
        gradeId: grade_id,
        academicStageId: academic_stage_id,
        term: finalTerm,
        schoolType: school_type
      });
      if (!consistency.isValid) {
        return res.status(400).json({ error: consistency.error });
      }

      // Validate chapter belongs to book
      if (chapter_id) {
        await ExamCacheService.normalizeAndValidateUnitSelection(book_id, chapter_id);
      }

      finalStageId = identity.academicStageId;
      finalGradeId = identity.gradeId;
      finalSubjectId = identity.subjectId;
      finalSchoolType = identity.schoolType;
      finalExamTerm = identity.term;
    } else {
      finalStageId = academic_stage_id || '61998777-4c5f-4e51-bc0a-38de938c842a'; // المرحلة الإعدادية
      finalGradeId = grade_id || '2f0f4f5a-7c5c-4136-a935-33c79effca3d'; // الصف الثالث الإعدادي
    }

    const creatorGovId = governorate_id || req.user?.governorateId || null;
    const is_style_reference = (req.body.is_style_reference === true || req.body.is_style_reference === 1 || req.body.is_style_reference === '1') ? 1 : 0;
    const examId = uuidv4();
    await db.query(
      `INSERT INTO exams (
         id, title_ar, title_en, teacher_id, academic_stage_id, grade_id, subject_id,
         book_id, chapter_id, duration_minutes, is_published, is_style_reference, school_type, governorate_id, term
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        examId,
        title_ar.trim(),
        title_en ? title_en.trim() : title_ar.trim(),
        req.user!.id,
        finalStageId,
        finalGradeId,
        finalSubjectId,
        book_id || null,
        chapter_id || null,
        duration_minutes,
        is_published ? 1 : 0,
        is_style_reference,
        finalSchoolType,
        creatorGovId,
        finalExamTerm
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

// Toggle style reference status (Teacher or Admin)
router.patch('/:id/style-reference', authenticateToken, requireRole(['TEACHER', 'ADMIN', 'SUPERVISOR', 'CENTRAL_ADMIN']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { is_style_reference } = req.body;
    const val = (is_style_reference === true || is_style_reference === 1 || is_style_reference === '1') ? 1 : 0;

    const examCheck = await db.query('SELECT id, teacher_id FROM exams WHERE id = $1', [id]);
    if (examCheck.rows.length === 0) {
      return res.status(404).json({ error: 'الاختبار غير موجود' });
    }

    const exam = examCheck.rows[0];
    const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPERVISOR' || req.user!.role === 'CENTRAL_ADMIN';
    if (!isAdmin && exam.teacher_id !== req.user!.id) {
      return res.status(403).json({ error: 'غير مصرح بتعديل اختبار لمعلم آخر' });
    }

    await db.query('UPDATE exams SET is_style_reference = $1 WHERE id = $2', [val, id]);

    return res.json({
      message: val ? 'تم تعيين الاختبار كمرجع لأسلوب الأسئلة' : 'تم إلغاء تعيين مرجع الأسلوب',
      id,
      is_style_reference: val
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في تحديث تعيين مرجع الأسلوب: ' + err.message });
  }
});

// Query eligible style references for teachers (exact scope matching: subject, grade, term, unit)
router.get('/style-references', authenticateToken, requireRole(['TEACHER', 'ADMIN', 'SUPERVISOR', 'CENTRAL_ADMIN']), async (req: AuthenticatedRequest, res) => {
  try {
    const { grade_id, term, chapter_id, subject_id } = req.query;

    let targetSubjectId = subject_id as string | undefined;
    const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPERVISOR' || req.user!.role === 'CENTRAL_ADMIN';

    // The teacher's subject comes from their authenticated account; do not ask them to select it again.
    if (!isAdmin) {
      targetSubjectId = await ExamCacheService.resolveTeacherSubjectId(req.user!.id) || undefined;
      if (!targetSubjectId) {
        return res.status(403).json({ error: 'لا يمكن تحديد مادة المعلم المعتمدة' });
      }
    }

    let sql = `
      SELECT e.id, e.title_ar, e.title_en, e.created_at, e.term, e.grade_id, e.chapter_id, e.subject_id,
             (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) AS questions_count
      FROM exams e
      WHERE e.is_style_reference = 1
    `;
    const params: any[] = [];

    if (!isAdmin) {
      params.push(req.user!.id);
      sql += ` AND e.teacher_id = $${params.length}`;
    }

    if (targetSubjectId) {
      params.push(targetSubjectId);
      sql += ` AND e.subject_id = $${params.length}`;
    }

    if (grade_id) {
      params.push(grade_id);
      sql += ` AND e.grade_id = $${params.length}`;
    }

    if (term) {
      params.push(Number(term));
      sql += ` AND e.term = $${params.length}`;
    }

    if (chapter_id) {
      params.push(chapter_id);
      sql += ` AND e.chapter_id = $${params.length}`;
    }

    sql += ` ORDER BY e.created_at DESC`;

    const result = await db.query(sql, params);
    return res.json({ style_references: result.rows });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب مراجع الأسلوب: ' + err.message });
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

    const isTeacher = req.user?.role === 'TEACHER' || req.user?.role === 'ADMIN' || req.user?.role === 'SUPERVISOR' || req.user?.role === 'CENTRAL_ADMIN';

    const questionsWithOptions = await Promise.all(
      questionsRes.rows.map(async q => {
        const optSql = isTeacher
          ? `SELECT id, option_text, is_correct FROM exam_question_options WHERE question_id = $1`
          : `SELECT id, option_text FROM exam_question_options WHERE question_id = $1`;
        const optionsRes = await db.query(optSql, [q.id]);
        return {
          id: q.id,
          question_text: q.question_text,
          points: q.points,
          page_reference: q.page_reference,
          order_index: q.order_index,
          ...(isTeacher ? { explanation: q.explanation } : {}),
          options: optionsRes.rows.map(opt => ({
            id: opt.id,
            option_text: opt.option_text,
            ...(isTeacher ? { is_correct: opt.is_correct } : {})
          }))
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

// View submissions / attempts for an exam with student details (Teacher / Admin)
router.get('/:id/submissions', authenticateToken, requireRole(['TEACHER', 'ADMIN']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const sql = `
      SELECT ea.id, ea.exam_id, ea.student_id, ea.score, ea.total_points, ea.status, ea.completed_at,
             u.full_name as student_name, u.email as student_email,
             sp.student_code, sp.school_name, sp.school_type,
             ROUND((ea.score / NULLIF(ea.total_points, 0)) * 100, 1) as percentage
      FROM exam_attempts ea
      JOIN users u ON ea.student_id = u.id
      LEFT JOIN student_profiles sp ON ea.student_id = sp.user_id
      WHERE ea.exam_id = $1
      ORDER BY ea.completed_at DESC
    `;
    const result = await db.query(sql, [id]);
    return res.json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب تسليمات الطلاب: ' + err.message });
  }
});

// Review student exam attempt with questions, options, and student selected answers
router.get('/attempts/:attemptId/review', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { attemptId } = req.params;

    // 1. Fetch attempt and exam details
    const attemptRes = await db.query(`
      SELECT ea.id, ea.exam_id, ea.student_id, ea.score, ea.total_points, ea.status, ea.completed_at,
             u.full_name as student_name, u.email as student_email,
             sp.student_code, sp.school_name, sp.school_type,
             e.title_ar as exam_title_ar, e.title_en as exam_title_en,
             e.teacher_id, e.subject_id,
             s.name_ar as subject_name_ar, s.name_en as subject_name_en,
             g.name_ar as grade_name_ar
      FROM exam_attempts ea
      JOIN exams e ON ea.exam_id = e.id
      JOIN users u ON ea.student_id = u.id
      LEFT JOIN student_profiles sp ON ea.student_id = sp.user_id
      JOIN subjects s ON e.subject_id = s.id
      JOIN grades g ON e.grade_id = g.id
      WHERE ea.id = $1
    `, [attemptId]);

    if (attemptRes.rows.length === 0) {
      return res.status(404).json({ error: 'سجل المحاولة غير موجود' });
    }

    const attempt = attemptRes.rows[0];

    // Check permission: Student can only review their own attempt; Teachers / Admins can review
    if (req.user?.role === 'STUDENT' && attempt.student_id !== req.user.id) {
      return res.status(403).json({ error: 'غير مصرح لك بالاطلاع على محاولة طالب آخر' });
    }

    // 2. Fetch questions for this exam
    const questionsRes = await db.query(`
      SELECT eq.id, eq.question_text, eq.question_type, eq.points, eq.page_reference, eq.explanation, eq.order_index
      FROM exam_questions eq
      WHERE eq.exam_id = $1
      ORDER BY eq.order_index ASC, eq.id ASC
    `, [attempt.exam_id]);

    // 3. Fetch all options for these questions
    const questionIds = questionsRes.rows.map((q: any) => q.id);
    let optionsMap: Record<string, any[]> = {};
    if (questionIds.length > 0) {
      const placeholders = questionIds.map((_, i) => `$${i + 1}`).join(',');
      const optRes = await db.query(`
        SELECT eqo.id, eqo.question_id, eqo.option_text, eqo.is_correct
        FROM exam_question_options eqo
        WHERE eqo.question_id IN (${placeholders})
        ORDER BY eqo.id ASC
      `, questionIds);

      for (const opt of optRes.rows) {
        if (!optionsMap[opt.question_id]) {
          optionsMap[opt.question_id] = [];
        }
        optionsMap[opt.question_id].push(opt);
      }
    }

    // 4. Fetch student's submitted answers
    const answersRes = await db.query(`
      SELECT sa.id, sa.question_id, sa.selected_option_id, sa.answer_text, sa.is_correct, sa.points_awarded
      FROM student_answers sa
      WHERE sa.attempt_id = $1
    `, [attemptId]);

    const answersMap: Record<string, any> = {};
    for (const ans of answersRes.rows) {
      answersMap[ans.question_id] = ans;
    }

    // 5. Assemble questions with options and student choices
    const questions = questionsRes.rows.map((q: any) => {
      const studentAns = answersMap[q.id] || null;
      const opts = (optionsMap[q.id] || []).map((o: any) => ({
        id: o.id,
        option_text: o.option_text,
        is_correct: o.is_correct === 1 || o.is_correct === true
      }));

      const correctOpt = opts.find((o: any) => o.is_correct);

      return {
        id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        points: q.points,
        points_awarded: studentAns ? Number(studentAns.points_awarded) : 0,
        is_correct: studentAns ? (studentAns.is_correct === 1 || studentAns.is_correct === true) : false,
        selected_option_id: studentAns?.selected_option_id || null,
        answer_text: studentAns?.answer_text || null,
        correct_option_id: correctOpt?.id || null,
        correct_option_text: correctOpt?.option_text || '',
        explanation: q.explanation || null,
        page_reference: q.page_reference || null,
        options: opts
      };
    });

    const totalPts = Number(attempt.total_points) || 1;
    const score = Number(attempt.score) || 0;
    const percentage = Math.round((score / totalPts) * 100);

    return res.json({
      attempt: {
        id: attempt.id,
        exam_id: attempt.exam_id,
        exam_title: attempt.exam_title_ar || attempt.exam_title_en,
        exam_title_ar: attempt.exam_title_ar,
        exam_title_en: attempt.exam_title_en,
        student_id: attempt.student_id,
        student_name: attempt.student_name,
        student_email: attempt.student_email,
        student_code: attempt.student_code || attempt.student_id.substring(0, 8),
        school_name: attempt.school_name,
        school_type: attempt.school_type,
        subject_name: attempt.subject_name_ar || attempt.subject_name_en,
        grade_name: attempt.grade_name_ar,
        score,
        total_points: totalPts,
        percentage,
        completed_at: attempt.completed_at
      },
      questions
    });
  } catch (err: any) {
    console.error('Exam review error:', err);
    return res.status(500).json({ error: 'خطأ في جلب تفاصيل ورقة إجابات الطالب: ' + err.message });
  }
});

export default router;
