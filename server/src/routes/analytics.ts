import { Router } from 'express';
import { db } from '../db/db.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { aiRagEngine } from '../services/ai/aiRagEngine.js';

const router = Router();

// Student Personal Learning Analytics (Weak & Strong topics)
router.get('/student', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const studentId = req.user!.id;

    // 1. Mastery per topic/chapter
    const masteryRes = await db.query(
      `SELECT stm.*, 
              s.name_ar as subject_name_ar, s.name_en as subject_name_en,
              COALESCE(bc.title_ar, 'الوحدة العامة') as chapter_title_ar, 
              COALESCE(bc.title_en, 'General Unit') as chapter_title_en,
              COALESCE(b.title_ar, s.name_ar) as book_title,
              COALESCE(b.title_en, s.name_en) as book_title_en
       FROM student_topic_mastery stm
       LEFT JOIN subjects s ON stm.subject_id = s.id
       LEFT JOIN book_chapters bc ON stm.chapter_id = bc.id
       LEFT JOIN books b ON bc.book_id = b.id
       WHERE stm.student_id = $1
       ORDER BY stm.mastery_percentage ASC`,
      [studentId]
    );

    // 2. Learning history timeline
    const historyRes = await db.query(
      `SELECT slh.*, s.name_ar as subject_name, bc.title_ar as chapter_title
       FROM student_learning_history slh
       LEFT JOIN subjects s ON slh.subject_id = s.id
       LEFT JOIN book_chapters bc ON slh.chapter_id = bc.id
       WHERE slh.student_id = $1
       ORDER BY slh.created_at DESC
       LIMIT 20`,
      [studentId]
    );

    // 3. Detailed AI Evaluations and Exam Attempts for real calculations and exam history
    const aiEvalsRes = await db.query(
      `SELECT ae.id, ae.score, ae.total_questions, ae.created_at, ae.evaluation_report,
              b.id as book_id, b.title_ar as book_title_ar, b.title_en as book_title_en,
              s.id as subject_id, s.name_ar as subject_name_ar, s.name_en as subject_name_en,
              bc.id as chapter_id, bc.title_ar as chapter_title_ar, bc.title_en as chapter_title_en,
              bc.chapter_number
       FROM ai_evaluations ae
       LEFT JOIN books b ON ae.book_id = b.id
       LEFT JOIN subjects s ON ae.subject_id = s.id
       LEFT JOIN book_chapters bc ON ae.chapter_id = bc.id
       WHERE ae.student_id = $1
       ORDER BY ae.created_at DESC`,
      [studentId]
    );

    const examsRes = await db.query(
      `SELECT ea.id, ea.score, ea.total_points, ea.completed_at, ea.status,
              e.id as exam_id, e.title_ar as exam_title_ar, e.title_en as exam_title_en,
              e.subject_id as subject_id, e.chapter_id as chapter_id,
              s.name_ar as subject_name_ar, s.name_en as subject_name_en,
              bc.title_ar as chapter_title_ar, bc.title_en as chapter_title_en, bc.chapter_number,
              b.title_ar as book_title_ar, b.title_en as book_title_en
       FROM exam_attempts ea
       JOIN exams e ON ea.exam_id = e.id
       LEFT JOIN subjects s ON e.subject_id = s.id
       LEFT JOIN book_chapters bc ON e.chapter_id = bc.id
       LEFT JOIN books b ON bc.book_id = b.id
       WHERE ea.student_id = $1
         AND (ea.status = 'COMPLETED' OR ea.status = 'GRADED' OR ea.completed_at IS NOT NULL)
       ORDER BY ea.completed_at DESC`,
      [studentId]
    );

    const totalAiCount = aiEvalsRes.rows.length;
    const totalExamsCount = examsRes.rows.length;

    // Build unified completed exams list
    const completedExams = [
      ...aiEvalsRes.rows.map((r: any) => {
        let score = Number(r.score) || 0;
        let total = Number(r.total_questions) || 0;
        let parsedReport: any = null;
        if (r.evaluation_report) {
          try {
            parsedReport = typeof r.evaluation_report === 'string' ? JSON.parse(r.evaluation_report) : r.evaluation_report;
          } catch {}
        }
        if (total <= 0 && parsedReport) {
          if (parsedReport.max_score > 0) {
            total = Number(parsedReport.max_score);
            score = Number(parsedReport.score || 0);
          } else if (parsedReport.provisional_max_score > 0) {
            total = Number(parsedReport.provisional_max_score);
            score = Number(parsedReport.provisional_score || 0);
          } else if (Array.isArray(parsedReport.items) && parsedReport.items.length > 0) {
            total = parsedReport.items.length;
            score = parsedReport.items.filter((i: any) => i.is_correct).length;
          }
        }
        if (total <= 0) total = 1;
        const pct = Math.round((score / total) * 100);
        return {
          id: r.id,
          type: 'AI_DIAGNOSTIC',
          title_ar: r.chapter_title_ar || r.book_title_ar || r.subject_name_ar || 'تقييم تشخيصي معتمد',
          title_en: r.chapter_title_en || r.book_title_en || r.subject_name_en || 'Diagnostic Assessment',
          subject_id: r.subject_id,
          subject_name_ar: r.subject_name_ar || 'المادة الدراسية',
          subject_name_en: r.subject_name_en || 'Subject',
          chapter_id: r.chapter_id,
          chapter_title_ar: r.chapter_title_ar || r.book_title_ar || 'الوحدة الدراسية',
          chapter_title_en: r.chapter_title_en || r.book_title_en || 'Unit',
          chapter_number: r.chapter_number,
          book_title_ar: r.book_title_ar,
          book_title_en: r.book_title_en,
          score,
          total,
          percentage: pct,
          status: pct >= 80 ? 'MASTERED' : pct >= 50 ? 'DEVELOPING' : 'NEEDS_WORK',
          created_at: r.created_at,
          report: parsedReport
        };
      }),
      ...examsRes.rows.map((r: any) => {
        const total = Number(r.total_points) || 1;
        const score = Number(r.score) || 0;
        const pct = Math.round((score / total) * 100);
        return {
          id: r.id,
          type: 'TIMED_EXAM',
          title_ar: r.chapter_title_ar || r.exam_title_ar || 'امتحان مدرسي محدد بوقت',
          title_en: r.chapter_title_en || r.exam_title_en || 'Timed School Exam',
          subject_id: r.subject_id,
          subject_name_ar: r.subject_name_ar || 'المادة الدراسية',
          subject_name_en: r.subject_name_en || 'Subject',
          chapter_id: r.chapter_id,
          chapter_title_ar: r.chapter_title_ar || r.exam_title_ar || 'الوحدة الدراسية',
          chapter_title_en: r.chapter_title_en || r.exam_title_en || 'Unit',
          chapter_number: r.chapter_number || null,
          book_title_ar: r.book_title_ar || null,
          book_title_en: r.book_title_en || null,
          score,
          total,
          percentage: pct,
          status: pct >= 80 ? 'MASTERED' : pct >= 50 ? 'DEVELOPING' : 'NEEDS_WORK',
          created_at: r.completed_at,
          report: null
        };
      })
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Compute real overall mastery percentage across all completed exams/assessments
    let overallMasteryPercentage = 0;
    if (completedExams.length > 0) {
      const sumPcts = completedExams.reduce((acc, cur) => acc + (cur.percentage || 0), 0);
      overallMasteryPercentage = Math.round(sumPcts / completedExams.length);
    } else if (masteryRes.rows.length > 0) {
      const topicSum = masteryRes.rows.reduce((acc: number, r: any) => acc + (Number(r.mastery_percentage) || 0), 0);
      overallMasteryPercentage = Math.round(topicSum / masteryRes.rows.length);
    }

    // Dynamic Unit Mastery Aggregation & Synchronization:
    // If student_topic_mastery is missing records for chapters present in completedExams,
    // calculate chapter mastery directly and upsert into student_topic_mastery
    const existingChapterIds = new Set(masteryRes.rows.map((r: any) => r.chapter_id).filter(Boolean));
    const computedTopics: any[] = [...masteryRes.rows];

    const missingChapters = new Map<string, {
      chapter_id: string;
      subject_id: string;
      chapter_title_ar: string;
      chapter_title_en: string;
      subject_name_ar: string;
      subject_name_en: string;
      book_title: string;
      book_title_en: string;
      totalAttempted: number;
      totalCorrect: number;
      lastDate: string;
    }>();

    for (const exam of completedExams) {
      if (!exam.chapter_id || existingChapterIds.has(exam.chapter_id)) continue;
      const key = exam.chapter_id;
      if (!missingChapters.has(key)) {
        missingChapters.set(key, {
          chapter_id: exam.chapter_id,
          subject_id: exam.subject_id,
          chapter_title_ar: exam.chapter_title_ar || 'الوحدة الدراسية',
          chapter_title_en: exam.chapter_title_en || 'Unit',
          subject_name_ar: exam.subject_name_ar || 'المادة الدراسية',
          subject_name_en: exam.subject_name_en || 'Subject',
          book_title: exam.book_title_ar || exam.subject_name_ar || 'الكتاب المدرسي',
          book_title_en: exam.book_title_en || exam.subject_name_en || 'Textbook',
          totalAttempted: 0,
          totalCorrect: 0,
          lastDate: exam.created_at
        });
      }
      const item = missingChapters.get(key)!;
      item.totalAttempted += (exam.total || 0);
      item.totalCorrect += (exam.score || 0);
      if (new Date(exam.created_at).getTime() > new Date(item.lastDate).getTime()) {
        item.lastDate = exam.created_at;
      }
    }

    for (const ch of missingChapters.values()) {
      const pct = ch.totalAttempted > 0 ? Number(((ch.totalCorrect / ch.totalAttempted) * 100).toFixed(1)) : 0;
      let status: 'MASTERED' | 'PROFICIENT' | 'DEVELOPING' | 'NEEDS_WORK' = 'NEEDS_WORK';
      if (pct >= 85) status = 'MASTERED';
      else if (pct >= 70) status = 'PROFICIENT';
      else if (pct >= 50) status = 'DEVELOPING';

      computedTopics.push({
        id: `computed_${ch.chapter_id}`,
        student_id: studentId,
        subject_id: ch.subject_id,
        chapter_id: ch.chapter_id,
        total_attempted: ch.totalAttempted,
        total_correct: ch.totalCorrect,
        mastery_percentage: pct,
        status,
        weak_subtopics: '[]',
        strong_subtopics: '[]',
        last_assessed_at: ch.lastDate,
        subject_name_ar: ch.subject_name_ar,
        subject_name_en: ch.subject_name_en,
        chapter_title_ar: ch.chapter_title_ar,
        chapter_title_en: ch.chapter_title_en,
        book_title: ch.book_title,
        book_title_en: ch.book_title_en
      });

      // Synchronize in database
      try {
        await aiRagEngine.updateTopicMastery({
          studentId,
          subjectId: ch.subject_id,
          chapterId: ch.chapter_id,
          totalAttempted: ch.totalAttempted,
          totalCorrect: ch.totalCorrect,
          weakTopics: [],
          strongTopics: []
        });
      } catch (_) {}
    }

    // Mastered chapters count (>= 80% mastery)
    const masteredTopicsCount = computedTopics.filter(
      (m: any) => Number(m.mastery_percentage) >= 80 || m.status === 'MASTERED'
    ).length;

    // Calculate real consecutive days streak
    const activityDates = new Set<string>();
    completedExams.forEach((r: any) => {
      if (r.created_at) activityDates.add(new Date(r.created_at).toISOString().split('T')[0]);
    });
    historyRes.rows.forEach((r: any) => {
      if (r.created_at) activityDates.add(new Date(r.created_at).toISOString().split('T')[0]);
    });
    computedTopics.forEach((r: any) => {
      if (r.last_assessed_at) activityDates.add(new Date(r.last_assessed_at).toISOString().split('T')[0]);
    });

    let streakDays = 0;
    if (activityDates.size > 0) {
      const today = new Date();
      for (let d = 0; d < 30; d++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() - d);
        const dateStr = checkDate.toISOString().split('T')[0];
        if (activityDates.has(dateStr)) {
          streakDays++;
        } else if (d === 0) {
          continue;
        } else {
          break;
        }
      }
    }

    // Collect weak vs strong topics
    const weakTopics: string[] = [];
    const strongTopics: string[] = [];

    computedTopics.forEach((item: any) => {
      if (item.status === 'NEEDS_WORK' || item.status === 'DEVELOPING') {
        const weaks = typeof item.weak_subtopics === 'string' ? JSON.parse(item.weak_subtopics || '[]') : item.weak_subtopics;
        if (Array.isArray(weaks)) weakTopics.push(...weaks);
      } else {
        const strongs = typeof item.strong_subtopics === 'string' ? JSON.parse(item.strong_subtopics || '[]') : item.strong_subtopics;
        if (Array.isArray(strongs)) strongTopics.push(...strongs);
      }
    });

    completedExams.forEach((e: any) => {
      if (e.report) {
        if (Array.isArray(e.report.weak_topics)) weakTopics.push(...e.report.weak_topics);
        if (Array.isArray(e.report.strong_topics)) strongTopics.push(...e.report.strong_topics);
      }
    });

    return res.json({
      topics: computedTopics,
      history: historyRes.rows,
      completed_exams: completedExams,
      summary: {
        total_ai_assessments: totalAiCount,
        total_exams_taken: completedExams.length,
        total_attempts: completedExams.length,
        overall_mastery_percentage: overallMasteryPercentage,
        mastered_topics_count: masteredTopicsCount,
        study_streak_days: Math.max(streakDays, completedExams.length > 0 ? 1 : 0),
        weak_topics: [...new Set(weakTopics.filter(Boolean))],
        strong_topics: [...new Set(strongTopics.filter(Boolean))]
      }
    });
  } catch (err: any) {
    console.error('Student analytics error:', err);
    return res.status(500).json({ error: 'خطأ في جلب التحليلات التعليمية للطالب' });
  }
});

// Teacher Class Analytics
router.get('/teacher', authenticateToken, requireRole(['TEACHER', 'ADMIN']), async (req: AuthenticatedRequest, res) => {
  try {
    const teacherId = req.user!.id;

    // 1. Get teacher profile details
    const profileRes = await db.query(`SELECT specialization, subject_id, grade_id, academic_stage_id FROM teacher_profiles WHERE user_id = $1`, [teacherId]);
    const teacherProfileRow = profileRes.rows[0];
    let specialization = (teacherProfileRow?.specialization || req.teacherProfile?.specialization || '').trim();
    let profileSubjectId = teacherProfileRow?.subject_id || req.teacherProfile?.subjectId || null;
    let profileGradeId = teacherProfileRow?.grade_id || req.teacherProfile?.gradeId || null;

    // 2. Identify corresponding subject
    let subjectId: string | null = (req.query.subject_id as string) || profileSubjectId || null;
    let subjectNameAr = specialization;
    const allSubjects = await db.query(`SELECT id, name_ar, name_en, code, grade_id FROM subjects`);

    if (subjectId) {
      const found = allSubjects.rows.find((s: any) => s.id === subjectId);
      if (found) {
        subjectNameAr = found.name_ar;
        if (!specialization) specialization = found.name_ar;
      }
    } else if (specialization && allSubjects.rows.length > 0) {
      const specClean = specialization.replace(/^(اللغة|مادة|معلم أول|معلم)\s+/i, '').trim().toLowerCase();
      // Match candidate subjects, prioritizing teacher's assigned grade
      const matched = allSubjects.rows.find((s: any) => {
        if (profileGradeId && s.grade_id && s.grade_id !== profileGradeId) return false;
        const ar = (s.name_ar || '').trim().toLowerCase();
        const en = (s.name_en || '').trim().toLowerCase();
        const code = (s.code || '').toUpperCase();
        if (ar === specialization.toLowerCase() || en === specialization.toLowerCase()) return true;
        if (ar.includes(specClean) || specClean.includes(ar)) return true;
        if (en.includes(specClean) || specClean.includes(en)) return true;
        if ((specClean.includes('عرب') || specClean.includes('arabic')) && (code === 'ARABIC' || ar.includes('عرب'))) return true;
        if ((specClean.includes('رياض') || specClean.includes('math')) && (code === 'MATH' || ar.includes('رياض'))) return true;
        if ((specClean.includes('علوم') || specClean.includes('science')) && (code === 'SCIENCE' || ar.includes('علوم'))) return true;
        if ((specClean.includes('انجليز') || specClean.includes('english')) && (code === 'ENGLISH' || ar.includes('انجليز'))) return true;
        return false;
      }) || allSubjects.rows.find((s: any) => {
        const ar = (s.name_ar || '').trim().toLowerCase();
        const en = (s.name_en || '').trim().toLowerCase();
        const code = (s.code || '').toUpperCase();
        return (ar.includes(specClean) || en.includes(specClean) || (specClean.includes('انجليز') && code === 'ENGLISH'));
      });

      if (matched) {
        subjectId = matched.id;
        subjectNameAr = matched.name_ar;
      }
    }

    // 3. Stats (strictly scoped to teacher's grade if assigned)
    let totalStudentsSql = `SELECT COUNT(*) as count FROM student_profiles sp`;
    const totalStudentsParams: any[] = [];
    if (profileGradeId) {
      totalStudentsSql += ` WHERE sp.grade_id = $1`;
      totalStudentsParams.push(profileGradeId);
    }
    const totalStudentsRes = await db.query(totalStudentsSql, totalStudentsParams);
    const totalStudents = Number(totalStudentsRes.rows[0]?.count) || 0;

    let myExamsSql = `SELECT COUNT(*) as count FROM exams WHERE (teacher_id = $1 OR teacher_id = 'admin-owner-001')`;
    const myExamsParams: any[] = [teacherId];
    if (subjectId) {
      myExamsSql += ` AND (subject_id = $2 OR subject_id IN (
        SELECT s2.id FROM subjects s1 JOIN subjects s2 ON (s1.code = s2.code OR s1.name_ar = s2.name_ar) WHERE s1.id = $2
      ))`;
      myExamsParams.push(subjectId);
    }
    const myExamsRes = await db.query(myExamsSql, myExamsParams);
    const totalMyExams = Number(myExamsRes.rows[0]?.count) || 0;

    // 4. Completed student attempts on teacher exams in this subject
    let examAttemptsSql = `
      SELECT ea.id, ea.exam_id, ea.score, ea.total_points, ea.completed_at,
             u.full_name as student_name, sp.student_code, e.title_ar as exam_title,
             e.chapter_id
      FROM exam_attempts ea
      JOIN exams e ON ea.exam_id = e.id
      JOIN users u ON ea.student_id = u.id
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      WHERE (e.teacher_id = $1 OR e.teacher_id = 'admin-owner-001' OR e.teacher_id IS NULL)
        AND (ea.status = 'COMPLETED' OR ea.status = 'GRADED' OR ea.completed_at IS NOT NULL)
    `;
    const examAttemptsParams: any[] = [teacherId];
    if (subjectId) {
      examAttemptsSql += ` AND (e.subject_id = $2 OR e.subject_id IN (
        SELECT s2.id FROM subjects s1 JOIN subjects s2 ON (s1.code = s2.code OR s1.name_ar = s2.name_ar) WHERE s1.id = $2
      ))`;
      examAttemptsParams.push(subjectId);
    }
    if (profileGradeId) {
      examAttemptsParams.push(profileGradeId);
      examAttemptsSql += ` AND (e.grade_id = $${examAttemptsParams.length} OR e.grade_id IS NULL)`;
    }
    examAttemptsSql += ` ORDER BY ea.completed_at DESC LIMIT 50`;
    const examAttemptsRes = await db.query(examAttemptsSql, examAttemptsParams);

    // 5. Student AI/Chapter evaluations in this teacher's subject
    let aiAttemptsRes: any = { rows: [] };
    if (subjectId) {
      aiAttemptsRes = await db.query(`
        SELECT ae.id, ae.score, ae.total_questions, ae.created_at, ae.chapter_id, ae.evaluation_report,
               u.full_name as student_name,
               sp.student_code,
               COALESCE(bc.title_ar, b.title_ar, s.name_ar, 'تقييم تشخيصي معتمد') as exam_title
        FROM ai_evaluations ae
        JOIN users u ON ae.student_id = u.id
        LEFT JOIN student_profiles sp ON u.id = sp.user_id
        LEFT JOIN book_chapters bc ON ae.chapter_id = bc.id
        LEFT JOIN books b ON ae.book_id = b.id
        LEFT JOIN subjects s ON ae.subject_id = s.id
        WHERE ae.subject_id = $1
           OR ae.subject_id IN (
             SELECT s2.id FROM subjects s1 
             JOIN subjects s2 ON (s1.code = s2.code OR s1.name_ar = s2.name_ar) 
             WHERE s1.id = $1
           )
           OR b.subject_id = $1
        ORDER BY ae.created_at DESC
        LIMIT 50
      `, [subjectId]);
    }

    // Combine recent student attempts
    const recentAttempts = [
      ...examAttemptsRes.rows.map((r: any) => {
        const total = Number(r.total_points) || 1;
        const score = Number(r.score) || 0;
        const pct = Math.round((score / total) * 100);
        return {
          id: r.id,
          attempt_id: r.id,
          exam_id: r.exam_id,
          chapter_id: r.chapter_id || null,
          attempt_type: 'EXAM',
          student_name: r.student_name,
          student_code: r.student_code || '',
          exam_title: r.exam_title,
          score,
          total_points: total,
          percentage: pct,
          status: pct >= 80 ? 'MASTERED' : pct >= 50 ? 'DEVELOPING' : 'NEEDS_WORK',
          completed_at: r.completed_at
        };
      }),
      ...aiAttemptsRes.rows.map((r: any) => {
        let total = Number(r.total_questions) || 0;
        let score = Number(r.score) || 0;
        if (total <= 0 && r.evaluation_report) {
          try {
            const rep = typeof r.evaluation_report === 'string' ? JSON.parse(r.evaluation_report) : r.evaluation_report;
            if (rep.max_score > 0) {
              total = Number(rep.max_score);
              score = Number(rep.score || 0);
            } else if (rep.provisional_max_score > 0) {
              total = Number(rep.provisional_max_score);
              score = Number(rep.provisional_score || 0);
            } else if (Array.isArray(rep.items) && rep.items.length > 0) {
              total = rep.items.length;
              score = rep.items.filter((i: any) => i.is_correct).length;
            }
          } catch {}
        }
        if (total <= 0) total = 1;
        const pct = Math.round((score / total) * 100);
        return {
          id: r.id,
          attempt_id: r.id,
          chapter_id: r.chapter_id || null,
          attempt_type: 'AI_EVALUATION',
          student_name: r.student_name,
          student_code: r.student_code || '',
          exam_title: r.exam_title,
          score,
          total_points: total,
          total_questions: total,
          percentage: pct,
          status: pct >= 80 ? 'MASTERED' : pct >= 50 ? 'DEVELOPING' : 'NEEDS_WORK',
          completed_at: r.created_at
        };
      })
    ].sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());

    // Calculate real average score (null when 0 attempts)
    let avgScore: number | null = null;
    if (recentAttempts.length > 0) {
      const sum = recentAttempts.reduce((acc, cur) => acc + cur.percentage, 0);
      avgScore = Math.round(sum / recentAttempts.length);
    }

    // 6. Chapters mastery strictly in teacher's subject & grade
    let chaptersMastery: any[] = [];
    if (subjectId) {
      let chSql = `
        SELECT bc.id, bc.chapter_number, bc.title_ar, bc.title_en,
               b.title_ar as book_title
        FROM book_chapters bc
        JOIN books b ON bc.book_id = b.id
        WHERE b.subject_id = $1 OR b.subject_id IN (
          SELECT s2.id FROM subjects s1 JOIN subjects s2 ON (s1.code = s2.code OR s1.name_ar = s2.name_ar) WHERE s1.id = $1
        )
      `;
      const specClean = specialization ? specialization.replace(/^(اللغة|مادة|معلم أول|معلم)\s+/i, '').trim().toLowerCase() : '';
      if (specClean.includes('عرب') || specClean.includes('arabic')) {
        chSql += ` AND (LOWER(b.title_ar) NOT LIKE '%social%' AND LOWER(b.title_en) NOT LIKE '%social%' AND LOWER(b.title_ar) NOT LIKE '%english%' AND LOWER(b.title_en) NOT LIKE '%english%' AND LOWER(b.title_ar) NOT LIKE '%math%' AND LOWER(b.title_en) NOT LIKE '%math%' AND LOWER(b.title_ar) NOT LIKE '%science%' AND LOWER(b.title_en) NOT LIKE '%science%')`;
      }
      chSql += ` ORDER BY bc.chapter_number ASC`;

      const chRes = await db.query(chSql, [subjectId]);

      chaptersMastery = chRes.rows.map((ch: any) => {
        // Find matching real attempts for this chapter
        const matchingAttempts = recentAttempts.filter(a => 
          (a.chapter_id && a.chapter_id === ch.id) ||
          (a.exam_title && (a.exam_title.includes(ch.title_ar) || ch.title_ar.includes(a.exam_title)))
        );

        let pct: number | null = null;
        let status: 'MASTERED' | 'DEVELOPING' | 'NEEDS_WORK' | 'NOT_ASSESSED' = 'NOT_ASSESSED';
        if (matchingAttempts.length > 0) {
          pct = Math.round(matchingAttempts.reduce((acc, cur) => acc + cur.percentage, 0) / matchingAttempts.length);
          status = pct >= 80 ? 'MASTERED' : pct >= 50 ? 'DEVELOPING' : 'NEEDS_WORK';
        }

        return {
          id: ch.id,
          chapter_number: ch.chapter_number,
          title_ar: ch.title_ar,
          title_en: ch.title_en,
          book_title: ch.book_title,
          mastery_percentage: pct,
          status,
          attempts_count: matchingAttempts.length
        };
      });
    }

    // Top and lowest chapters (only from chapters with real attempts)
    const assessedChapters = chaptersMastery.filter(ch => ch.attempts_count > 0 && ch.mastery_percentage !== null);
    const sortedChapters = [...assessedChapters].sort((a, b) => (b.mastery_percentage || 0) - (a.mastery_percentage || 0));
    const topChapter = sortedChapters.length > 0 ? sortedChapters[0] : null;
    const lowestChapter = sortedChapters.length > 1 ? sortedChapters[sortedChapters.length - 1] : null;

    return res.json({
      subject: {
        id: subjectId,
        name_ar: subjectNameAr
      },
      stats: {
        total_students: totalStudents,
        total_my_exams: totalMyExams,
        total_attempts: recentAttempts.length,
        avg_score: avgScore
      },
      top_chapter: topChapter,
      lowest_chapter: lowestChapter,
      chapters_mastery: chaptersMastery,
      recent_attempts: recentAttempts
    });
  } catch (err: any) {
    console.error('Teacher analytics error:', err);
    return res.status(500).json({ error: 'خطأ في جلب تحليلات المعلم' });
  }
});

export default router;
