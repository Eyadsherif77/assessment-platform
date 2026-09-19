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
      `SELECT stm.*, s.name_ar as subject_name_ar, s.name_en as subject_name_en,
              bc.title_ar as chapter_title_ar, bc.title_en as chapter_title_en,
              b.title_ar as book_title
       FROM student_topic_mastery stm
       JOIN subjects s ON stm.subject_id = s.id
       JOIN book_chapters bc ON stm.chapter_id = bc.id
       JOIN books b ON bc.book_id = b.id
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

    // 3. Detailed AI Evaluations and Exam Attempts for real calculations
    const aiEvalsRes = await db.query(
      `SELECT score, total_questions, created_at FROM ai_evaluations WHERE student_id = $1 ORDER BY created_at DESC`,
      [studentId]
    );

    const examsRes = await db.query(
      `SELECT score, total_points, completed_at FROM exam_attempts WHERE student_id = $1 ORDER BY completed_at DESC`,
      [studentId]
    );

    const totalAiCount = aiEvalsRes.rows.length;
    const totalExamsCount = examsRes.rows.length;
    const rawAttemptsCount = totalAiCount + totalExamsCount;
    const totalAttempts = Math.max(rawAttemptsCount, masteryRes.rows.length, historyRes.rows.length);

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
