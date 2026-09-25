import { db } from '../db/db.js';

export interface ExamLimitStatus {
  allowed: boolean;
  limit: number;
  currentCount: number;
  remaining: number;
  message?: string;
}

/**
 * Retrieve the platform-wide monthly exam limit per student.
 * Default is 10 if not set.
 */
export async function getMonthlyExamLimit(): Promise<number> {
  try {
    const res = await db.query(
      `SELECT setting_value FROM platform_settings WHERE setting_key = 'monthly_exam_limit'`
    );
    if (res.rows.length > 0 && res.rows[0].setting_value) {
      const val = parseInt(res.rows[0].setting_value, 10);
      if (!isNaN(val) && val > 0) {
        return val;
      }
    }
  } catch (err) {
    console.error('Error fetching monthly exam limit setting:', err);
  }
  return 10;
}

/**
 * Update the platform-wide monthly exam limit.
 * Callable by ADMIN and CENTRAL_ADMIN.
 */
export async function setMonthlyExamLimit(limit: number, updatedBy: string): Promise<number> {
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
  try {
    // Attempt upsert across TiDB / MySQL / SQLite
    await db.query(
      `INSERT INTO platform_settings (setting_key, setting_value, updated_by)
       VALUES ('monthly_exam_limit', $1, $2)
       ON DUPLICATE KEY UPDATE setting_value = $1, updated_by = $2`,
      [String(safeLimit), updatedBy]
    );
  } catch (err: any) {
    // Fallback for standard SQL / SQLite
    try {
      await db.query(
        `UPDATE platform_settings SET setting_value = $1, updated_by = $2 WHERE setting_key = 'monthly_exam_limit'`,
        [String(safeLimit), updatedBy]
      );
    } catch (fallbackErr) {
      console.error('Error setting monthly exam limit:', fallbackErr);
      throw fallbackErr;
    }
  }
  return safeLimit;
}

/**
 * Get the total count of exams a student has completed in the current month across ALL subjects.
 * (Teacher-added exam attempts + AI evaluations)
 */
export async function getStudentMonthlyExamsCount(studentId: string): Promise<{
  teacherAttempts: number;
  aiEvaluations: number;
  total: number;
}> {
  try {
    const now = new Date();
    // 1st of current month at 00:00:00 UTC
    const startOfMonthUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0))
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');

    const [attemptsRes, aiEvalsRes] = await Promise.all([
      db.query(
        `SELECT COUNT(*) as count FROM exam_attempts WHERE student_id = $1 AND created_at >= $2`,
        [studentId, startOfMonthUtc]
      ),
      db.query(
        `SELECT COUNT(*) as count FROM ai_evaluations WHERE student_id = $1 AND created_at >= $2`,
        [studentId, startOfMonthUtc]
      )
    ]);

    const teacherAttempts = Number(attemptsRes.rows[0]?.count || 0);
    const aiEvaluations = Number(aiEvalsRes.rows[0]?.count || 0);
    const total = teacherAttempts + aiEvaluations;

    return { teacherAttempts, aiEvaluations, total };
  } catch (err) {
    console.error('Error counting student monthly exams:', err);
    return { teacherAttempts: 0, aiEvaluations: 0, total: 0 };
  }
}

/**
 * Check if the student has reached their monthly exam limit.
 */
export async function checkStudentExamLimit(studentId: string): Promise<ExamLimitStatus> {
  const limit = await getMonthlyExamLimit();
  const { total } = await getStudentMonthlyExamsCount(studentId);

  const allowed = total < limit;
  const remaining = Math.max(0, limit - total);

  return {
    allowed,
    limit,
    currentCount: total,
    remaining,
    message: allowed
      ? undefined
      : `عذراً، لقد استنفدت الحد الأقصى المسموح به من الاختبارات لهذا الشهر (${limit} اختبارات شاملة كافة المواد). يمكنك خوض المزيد مع بداية الشهر القادم.`
  };
}
