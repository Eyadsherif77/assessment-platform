import { Router } from 'express';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { AssessmentAnalyticsService } from '../services/assessmentAnalyticsService.js';

const router = Router();

/**
 * Student Personal Learning Analytics
 * Used by StudentDashboard to render:
 * - Overall cumulative mastery percentage
 * - Topics/units mastery breakdown
 * - Completed exams history with normalized scores and diagnosis
 * - Learning history timeline
 * - Weak & Strong concepts
 * 
 * Can also be queried by authorized teachers, supervisors, and admins for a specific student via ?student_id=...
 */
router.get('/student', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    let targetStudentId = req.user!.id;

    // Allow teacher, supervisor, or admin to query a specific student's analytics
    if (req.query.student_id && ['TEACHER', 'ADMIN', 'GOVERNORATE_SUPERVISOR', 'CENTRAL_ADMIN'].includes(req.user!.role)) {
      targetStudentId = req.query.student_id as string;
    }

    const subjectFilter = (req.query.subject_id as string) || undefined;
    const analytics = await AssessmentAnalyticsService.getStudentAnalytics(targetStudentId, subjectFilter);

    return res.json(analytics);
  } catch (err: any) {
    console.error('Student analytics error:', err);
    return res.status(500).json({ error: 'خطأ في جلب التحليلات التعليمية للطالب' });
  }
});

/**
 * Teacher Class Analytics
 * Used by TeacherDashboard to render:
 * - Teacher subject overview
 * - Enrolled students count in assigned grade
 * - Teacher exams count
 * - Real weighted average score across all student attempts
 * - Per-chapter mastery breakdown
 * - Recent student assessment attempts (deduplicated canonical assessments)
 */
router.get('/teacher', authenticateToken, requireRole(['TEACHER', 'ADMIN']), async (req: AuthenticatedRequest, res) => {
  try {
    const teacherId = req.user!.id;
    const requestedSubjectId = (req.query.subject_id as string) || undefined;
    const requestedGradeId = (req.query.grade_id as string) || undefined;

    const analytics = await AssessmentAnalyticsService.getTeacherAnalytics(
      teacherId,
      requestedSubjectId,
      requestedGradeId
    );

    return res.json(analytics);
  } catch (err: any) {
    console.error('Teacher analytics error:', err);
    return res.status(500).json({ error: 'خطأ في جلب تحليلات المعلم' });
  }
});

export default router;
