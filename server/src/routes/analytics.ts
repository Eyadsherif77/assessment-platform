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

    // 3. Aggregate stats
    const totalAiEvalRes = await db.query(
      `SELECT COUNT(*) as count, AVG(score) as avg_score FROM ai_evaluations WHERE student_id = $1`,
      [studentId]
    );

    const totalExamsRes = await db.query(
      `SELECT COUNT(*) as count, AVG(score) as avg_score FROM exam_attempts WHERE student_id = $1`,
      [studentId]
    );

    // Collect weak vs strong topics
    const weakTopics: string[] = [];
    const strongTopics: string[] = [];

    masteryRes.rows.forEach(item => {
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
        total_ai_assessments: parseInt(totalAiEvalRes.rows[0]?.count || '0', 10),
        total_exams_taken: parseInt(totalExamsRes.rows[0]?.count || '0', 10),
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
