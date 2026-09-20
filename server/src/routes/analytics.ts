import { Router } from 'express';
import { db } from '../db/db.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Student Personal Learning Analytics (Weak & Strong topics)
router.get('/student', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const studentId = req.user!.id;

    // 1. Mastery per topic/chapter
    const masteryRes = await db.query(
      `SELECT stm.*, 
              s.name_ar as subject_name_ar, s.name_en as subject_name_en,
              COALESCE(bc.title_ar, 'الفصل العام') as chapter_title_ar, 
              COALESCE(bc.title_en, 'General Chapter') as chapter_title_en,
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
      `SELECT ea.id, ea.score, ea.total_points, ea.completed_at,
              e.title_ar as exam_title_ar, e.title_en as exam_title_en,
              s.name_ar as subject_name_ar, s.name_en as subject_name_en
       FROM exam_attempts ea
       LEFT JOIN exams e ON ea.exam_id = e.id
       LEFT JOIN subjects s ON e.subject_id = s.id
       WHERE ea.student_id = $1
       ORDER BY ea.completed_at DESC`,
      [studentId]
    );

    const totalAiCount = aiEvalsRes.rows.length;
    const totalExamsCount = examsRes.rows.length;
    const rawAttemptsCount = totalAiCount + totalExamsCount;
    const totalAttempts = Math.max(rawAttemptsCount, masteryRes.rows.length, historyRes.rows.length);

    // Build unified completed exams list
    const completedExams = [
      ...aiEvalsRes.rows.map((r: any) => {
        const qCount = Number(r.total_questions) || 1;
        const score = Number(r.score) || 0;
        const pct = Math.round((score / qCount) * 100);
        let parsedReport = null;
        try {
          parsedReport = typeof r.evaluation_report === 'string' ? JSON.parse(r.evaluation_report) : r.evaluation_report;
        } catch {}
        return {
          id: r.id,
          type: 'AI_DIAGNOSTIC',
          title_ar: r.chapter_title_ar || r.book_title_ar || r.subject_name_ar || 'تقييم تشخيصي ذكي',
          title_en: r.chapter_title_en || r.book_title_en || r.subject_name_en || 'AI Diagnostic Assessment',
          subject_name_ar: r.subject_name_ar || 'المادة الدراسية',
          subject_name_en: r.subject_name_en || 'Subject',
          chapter_title_ar: r.chapter_title_ar || r.book_title_ar,
          chapter_title_en: r.chapter_title_en || r.book_title_en,
          chapter_number: r.chapter_number,
          book_title_ar: r.book_title_ar,
          book_title_en: r.book_title_en,
          score,
          total: qCount,
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
          title_ar: r.exam_title_ar || 'امتحان مدرسي محدد بوقت',
          title_en: r.exam_title_en || 'Timed School Exam',
          subject_name_ar: r.subject_name_ar || 'المادة الدراسية',
          subject_name_en: r.subject_name_en || 'Subject',
          chapter_title_ar: r.exam_title_ar,
          chapter_title_en: r.exam_title_en,
          chapter_number: null,
          book_title_ar: null,
          book_title_en: null,
          score,
          total,
          percentage: pct,
          status: pct >= 80 ? 'MASTERED' : pct >= 50 ? 'DEVELOPING' : 'NEEDS_WORK',
          created_at: r.completed_at,
          report: null
        };
      })
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Compute real overall mastery percentage across all real student activities
    let scoreSumPercentages = 0;
    let totalScoredCount = 0;

    for (const aiRow of aiEvalsRes.rows) {
      const qCount = Number(aiRow.total_questions) || 1;
      const score = Number(aiRow.score) || 0;
      scoreSumPercentages += (score / qCount) * 100;
      totalScoredCount++;
    }

    for (const exRow of examsRes.rows) {
      const totalPts = Number(exRow.total_points) || 1;
      const score = Number(exRow.score) || 0;
      scoreSumPercentages += (score / totalPts) * 100;
      totalScoredCount++;
    }

    // If direct evaluation rows are empty but student topic mastery records exist,
    // calculate average mastery directly from the evaluated chapters
    let overallMasteryPercentage = 0;
    if (totalScoredCount > 0) {
      overallMasteryPercentage = Math.round(scoreSumPercentages / totalScoredCount);
    } else if (masteryRes.rows.length > 0) {
      const topicSum = masteryRes.rows.reduce((acc: number, r: any) => acc + (Number(r.mastery_percentage) || 0), 0);
      overallMasteryPercentage = Math.round(topicSum / masteryRes.rows.length);
    }

    // Mastered chapters count (>= 80% mastery)
    const masteredTopicsCount = masteryRes.rows.filter(
      (m: any) => Number(m.mastery_percentage) >= 80 || m.status === 'MASTERED'
    ).length;

    // Calculate real consecutive days streak
    const activityDates = new Set<string>();
    aiEvalsRes.rows.forEach((r: any) => {
      if (r.created_at) activityDates.add(new Date(r.created_at).toISOString().split('T')[0]);
    });
    examsRes.rows.forEach((r: any) => {
      if (r.completed_at) activityDates.add(new Date(r.completed_at).toISOString().split('T')[0]);
    });
    historyRes.rows.forEach((r: any) => {
      if (r.created_at) activityDates.add(new Date(r.created_at).toISOString().split('T')[0]);
    });
    masteryRes.rows.forEach((r: any) => {
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
          // If not active today, check if active yesterday
          continue;
        } else {
          break;
        }
      }
    }

    // Collect weak vs strong topics
    const weakTopics: string[] = [];
    const strongTopics: string[] = [];

    masteryRes.rows.forEach((item: any) => {
      if (item.status === 'NEEDS_WORK' || item.status === 'DEVELOPING') {
        const weaks = typeof item.weak_subtopics === 'string' ? JSON.parse(item.weak_subtopics) : item.weak_subtopics;
        if (Array.isArray(weaks)) weakTopics.push(...weaks);
      } else {
        const strongs = typeof item.strong_subtopics === 'string' ? JSON.parse(item.strong_subtopics) : item.strong_subtopics;
        if (Array.isArray(strongs)) strongTopics.push(...strongs);
      }
    });

    return res.json({
      topics: masteryRes.rows,
      history: historyRes.rows,
      completed_exams: completedExams,
      summary: {
        total_ai_assessments: Math.max(totalAiCount, masteryRes.rows.length),
        total_exams_taken: totalAttempts,
        total_attempts: totalAttempts,
        overall_mastery_percentage: overallMasteryPercentage,
        mastered_topics_count: masteredTopicsCount,
        study_streak_days: Math.max(streakDays, totalAttempts > 0 ? 1 : 0),
        weak_topics: [...new Set(weakTopics)],
        strong_topics: [...new Set(strongTopics)]
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
    // Total students, total exams, total attempts
    const statsRes = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM student_profiles) as total_students,
        (SELECT COUNT(*) FROM exams WHERE teacher_id = $1) as total_my_exams,
        (SELECT COUNT(*) FROM exam_attempts ea JOIN exams e ON ea.exam_id = e.id WHERE e.teacher_id = $1) as total_attempts,
        (SELECT AVG(ea.score) FROM exam_attempts ea JOIN exams e ON ea.exam_id = e.id WHERE e.teacher_id = $1) as avg_score
    `, [req.user!.id]);

    // Recent attempts on teacher exams
    const attemptsRes = await db.query(`
      SELECT ea.id, ea.score, ea.total_points, ea.completed_at,
             u.full_name as student_name, e.title_ar as exam_title
      FROM exam_attempts ea
      JOIN exams e ON ea.exam_id = e.id
      JOIN users u ON ea.student_id = u.id
      WHERE e.teacher_id = $1
      ORDER BY ea.completed_at DESC
      LIMIT 15
    `, [req.user!.id]);

    return res.json({
      stats: statsRes.rows[0],
      recent_attempts: attemptsRes.rows
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب تحليلات المعلم' });
  }
});

export default router;
