import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/db.js';
import { authenticateToken, requireRole, generateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { getMonthlyExamLimit, setMonthlyExamLimit } from '../services/examLimitService.js';

const router = Router();

// All admin routes require ADMIN role
router.use(authenticateToken);
router.use(requireRole(['ADMIN']));

/**
 * 1. Overview Statistics
 */
router.get('/overview', async (req: AuthenticatedRequest, res) => {
  try {
    const studentsRes = await db.query(`SELECT COUNT(*) as count FROM users WHERE role = 'STUDENT'`);
    const teachersRes = await db.query(`SELECT COUNT(*) as count FROM users WHERE role = 'TEACHER'`);
    const booksRes = await db.query(`SELECT COUNT(*) as count FROM books`);
    const examsRes = await db.query(`SELECT COUNT(*) as count FROM exams`);
    const attemptsRes = await db.query(`SELECT COUNT(*) as count FROM exam_attempts`);
    const evaluationsRes = await db.query(`SELECT COUNT(*) as count FROM ai_evaluations`);
    const monthlyLimit = await getMonthlyExamLimit();

    return res.json({
      stats: {
        totalStudents: Number(studentsRes.rows[0]?.count || 0),
        totalTeachers: Number(teachersRes.rows[0]?.count || 0),
        totalBooks: Number(booksRes.rows[0]?.count || 0),
        totalExams: Number(examsRes.rows[0]?.count || 0),
        totalExamAttempts: Number(attemptsRes.rows[0]?.count || 0),
        totalAiEvaluations: Number(evaluationsRes.rows[0]?.count || 0),
        monthlyExamLimit: monthlyLimit
      }
    });
  } catch (error: any) {
    console.error('Error fetching admin overview:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء جلب ملخص النظام' });
  }
});

router.get('/monthly-exam-limit', async (req: AuthenticatedRequest, res) => {
  const limit = await getMonthlyExamLimit();
  return res.json({ limit });
});

router.post('/monthly-exam-limit', async (req: AuthenticatedRequest, res) => {
  try {
    const { limit } = req.body;
    const numLimit = parseInt(limit, 10);
    if (isNaN(numLimit) || numLimit < 1) {
      return res.status(400).json({ error: 'الرجاء إدخال رقم صحيح موجب للحد الأقصى للاختبارات' });
    }
    const updatedLimit = await setMonthlyExamLimit(numLimit, req.user!.email);
    return res.json({ success: true, limit: updatedLimit });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في تحديث الحد الشهري للاختبارات' });
  }
});

/**
 * 2. Teachers Management
 */
router.get('/teachers', async (req: AuthenticatedRequest, res) => {
  try {
    const query = `
      SELECT 
        u.id, 
        u.super_id, 
        u.hybrid_id, 
        u.email, 
        u.full_name, 
        u.role, 
        u.is_active, 
        u.permissions, 
        u.created_at,
        tp.school_name, 
        tp.specialization,
        (SELECT COUNT(*) FROM books b WHERE b.teacher_id = u.id) as books_count,
        (SELECT COUNT(*) FROM exams e WHERE e.teacher_id = u.id) as exams_count
      FROM users u
      LEFT JOIN teacher_profiles tp ON u.id = tp.user_id
      WHERE u.role = 'TEACHER'
      ORDER BY u.created_at DESC
    `;
    const result = await db.query(query);

    const teachers = result.rows.map(row => {
      let parsedPerms = {
        can_upload_books: true,
        can_create_exams: true,
        can_delete_content: true,
        can_view_analytics: true,
        is_active: row.is_active !== 0
      };
      if (row.permissions) {
        try {
          const p = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions;
          parsedPerms = { ...parsedPerms, ...p };
        } catch (_) {}
      }
      return {
        id: row.id,
        super_id: row.super_id,
        hybrid_id: row.hybrid_id || `HYBRID-TEA-${row.id.substring(0, 6).toUpperCase()}`,
        email: row.email,
        fullName: row.full_name,
        schoolName: row.school_name || 'غير محدد',
        specialization: row.specialization || 'معلم متخصص',
        isActive: row.is_active !== 0,
        booksCount: Number(row.books_count || 0),
        examsCount: Number(row.exams_count || 0),
        permissions: parsedPerms,
        createdAt: row.created_at
      };
    });

    return res.json({ teachers });
  } catch (error: any) {
    console.error('Error fetching teachers list:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء جلب قائمة المعلمين' });
  }
});

/**
 * 3. Create Teacher from Admin Portal
 */
router.post('/teachers', async (req: AuthenticatedRequest, res) => {
  try {
    const { email, password, fullName, specialization, schoolName, permissions } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور واسم المعلم' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'البريد الإلكتروني مسجل بالفعل' });
    }

    const teacherId = uuidv4();
    const cleanSpec = specialization ? specialization.substring(0, 3).toUpperCase() : 'GEN';
    const hybridId = `HYBRID-TEA-${cleanSpec}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const passwordHash = await bcrypt.hash(password, 10);

    const defaultPerms = {
      can_upload_books: true,
      can_create_exams: true,
      can_delete_content: true,
      can_view_analytics: true,
      is_active: true,
      ...(permissions || {})
    };

    await db.query(
      `INSERT INTO users (id, hybrid_id, email, password_hash, role, full_name, permissions, is_active)
       VALUES ($1, $2, $3, $4, 'TEACHER', $5, $6, $7)`,
      [
        teacherId,
        hybridId,
        email.toLowerCase().trim(),
        passwordHash,
        fullName.trim(),
        JSON.stringify(defaultPerms),
        defaultPerms.is_active ? 1 : 0
      ]
    );

    await db.query(
      `INSERT INTO teacher_profiles (user_id, full_name, school_name, specialization)
       VALUES ($1, $2, $3, $4)`,
      [teacherId, fullName.trim(), schoolName || null, specialization || null]
    );

    return res.status(201).json({
      message: 'تم إنشاء حساب المعلم بنجاح',
      teacher: {
        id: teacherId,
        hybrid_id: hybridId,
        email: email.toLowerCase().trim(),
        fullName: fullName.trim(),
        specialization,
        schoolName,
        permissions: defaultPerms
      }
    });
  } catch (error: any) {
    console.error('Error creating teacher:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء إنشاء حساب المعلم: ' + error.message });
  }
});

/**
 * 4. Update Teacher Permissions
 */
router.put('/teachers/:id/permissions', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { permissions, is_active } = req.body;

    const teacherCheck = await db.query("SELECT id, permissions FROM users WHERE id = $1 AND role = 'TEACHER'", [id]);
    if (teacherCheck.rows.length === 0) {
      return res.status(404).json({ error: 'حساب المعلم غير موجود' });
    }

    let currentPerms = {
      can_upload_books: true,
      can_create_exams: true,
      can_delete_content: true,
      can_view_analytics: true,
      is_active: true
    };
    if (teacherCheck.rows[0].permissions) {
      try {
        const parsed = typeof teacherCheck.rows[0].permissions === 'string'
          ? JSON.parse(teacherCheck.rows[0].permissions)
          : teacherCheck.rows[0].permissions;
        currentPerms = { ...currentPerms, ...parsed };
      } catch (_) {}
    }

    const updatedPerms = {
      ...currentPerms,
      ...permissions,
      is_active: is_active !== undefined ? Boolean(is_active) : (permissions?.is_active !== undefined ? Boolean(permissions.is_active) : currentPerms.is_active)
    };

    const activeFlag = updatedPerms.is_active ? 1 : 0;

    await db.query(
      'UPDATE users SET permissions = $1, is_active = $2, updated_at = datetime("now") WHERE id = $3',
      [JSON.stringify(updatedPerms), activeFlag, id]
    );

    return res.json({
      message: 'تم تحديث صلاحيات المعلم بنجاح',
      permissions: updatedPerms,
      isActive: updatedPerms.is_active
    });
  } catch (error: any) {
    console.error('Error updating teacher permissions:', error);
    return res.status(500).json({ error: 'فشل في حفظ صلاحيات المعلم' });
  }
});

/**
 * 5. Impersonate Teacher ("Go inside teacher account")
 * Allows Admin to enter any teacher's portal directly
 */
router.post('/impersonate/teacher/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const teacherRes = await db.query(
      `SELECT u.id, u.hybrid_id, u.email, u.full_name, u.role, u.permissions, tp.school_name, tp.specialization
       FROM users u
       LEFT JOIN teacher_profiles tp ON u.id = tp.user_id
       WHERE u.id = $1 AND u.role = 'TEACHER'`,
      [id]
    );

    if (teacherRes.rows.length === 0) {
      return res.status(404).json({ error: 'حساب المعلم غير موجود' });
    }

    const teacher = teacherRes.rows[0];
    let permissionsObj = null;
    if (teacher.permissions) {
      try {
        permissionsObj = typeof teacher.permissions === 'string' ? JSON.parse(teacher.permissions) : teacher.permissions;
      } catch (_) {}
    }

    // Generate token for the teacher with impersonation marker
    const impersonationToken = generateToken({
      id: teacher.id,
      email: teacher.email,
      role: 'TEACHER',
      fullName: teacher.full_name
    });

    return res.json({
      message: `تم الدخول إلى حساب المعلم: ${teacher.full_name}`,
      token: impersonationToken,
      user: {
        id: teacher.id,
        hybrid_id: teacher.hybrid_id,
        email: teacher.email,
        role: 'TEACHER',
        fullName: teacher.full_name,
        permissions: permissionsObj,
        profile: {
          school_name: teacher.school_name,
          specialization: teacher.specialization
        }
      }
    });
  } catch (error: any) {
    console.error('Error impersonating teacher:', error);
    return res.status(500).json({ error: 'فشل الدخول إلى حساب المعلم' });
  }
});

/**
 * 6. Students Management
 */
router.get('/students', async (req: AuthenticatedRequest, res) => {
  try {
    const query = `
      SELECT 
        u.id, 
        u.email, 
        u.full_name, 
        u.role, 
        u.is_active, 
        u.created_at,
        sp.academic_stage_id, 
        sp.grade_id, 
        sp.section, 
        sp.school_type, 
        sp.school_name,
        s.name_ar as stage_name_ar, 
        g.name_ar as grade_name_ar,
        (SELECT COUNT(*) FROM exam_attempts ea WHERE ea.student_id = u.id) as attempts_count,
        (SELECT ROUND(AVG(score), 1) FROM exam_attempts ea WHERE ea.student_id = u.id) as avg_score,
        (SELECT COUNT(*) FROM ai_evaluations aie WHERE aie.student_id = u.id) as ai_evals_count
      FROM users u
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      LEFT JOIN academic_stages s ON sp.academic_stage_id = s.id
      LEFT JOIN grades g ON sp.grade_id = g.id
      WHERE u.role = 'STUDENT'
      ORDER BY u.created_at DESC
    `;
    const result = await db.query(query);

    const students = result.rows.map(row => ({
      id: row.id, // Student has plain id only!
      email: row.email,
      fullName: row.full_name,
      stageNameAr: row.stage_name_ar || 'غير محدد',
      gradeNameAr: row.grade_name_ar || 'غير محدد',
      schoolName: row.school_name || 'غير محدد',
      schoolType: row.school_type || 'عربي',
      section: row.section || null,
      attemptsCount: Number(row.attempts_count || 0),
      aiEvalsCount: Number(row.ai_evals_count || 0),
      avgScore: row.avg_score !== null ? Number(row.avg_score) : null,
      isActive: row.is_active !== 0,
      createdAt: row.created_at
    }));

    return res.json({ students });
  } catch (error: any) {
    console.error('Error fetching students list:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء جلب قائمة الطلاب' });
  }
});

/**
 * 7. Student Account Diagnostics & Details
 */
router.get('/students/:id/details', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const studentRes = await db.query(
      `SELECT u.id, u.email, u.full_name, u.created_at,
              sp.academic_stage_id, sp.grade_id, sp.school_name, sp.section, sp.school_type,
              s.name_ar as stage_name_ar, g.name_ar as grade_name_ar
       FROM users u
       LEFT JOIN student_profiles sp ON u.id = sp.user_id
       LEFT JOIN academic_stages s ON sp.academic_stage_id = s.id
       LEFT JOIN grades g ON sp.grade_id = g.id
       WHERE u.id = $1 AND u.role = 'STUDENT'`,
      [id]
    );

    if (studentRes.rows.length === 0) {
      return res.status(404).json({ error: 'حساب الطالب غير موجود' });
    }

    const student = studentRes.rows[0];

    const attempts = await db.query(
      `SELECT ea.id, ea.score, ea.total_points, ea.status, ea.completed_at, e.title_ar as exam_title
       FROM exam_attempts ea
       JOIN exams e ON ea.exam_id = e.id
       WHERE ea.student_id = $1
       ORDER BY ea.completed_at DESC`,
      [id]
    );

    const topicMastery = await db.query(
      `SELECT stm.*, sub.name_ar as subject_name_ar, bc.title_ar as chapter_title_ar
       FROM student_topic_mastery stm
       JOIN subjects sub ON stm.subject_id = sub.id
       JOIN book_chapters bc ON stm.chapter_id = bc.id
       WHERE stm.student_id = $1`,
      [id]
    );

    return res.json({
      student,
      attempts: attempts.rows,
      topicMastery: topicMastery.rows
    });
  } catch (error: any) {
    console.error('Error fetching student details:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء جلب تفاصيل الطالب' });
  }
});

/**
 * 8. Impersonate Student ("Go inside student account")
 */
router.post('/impersonate/student/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const studentRes = await db.query(
      `SELECT u.id, u.email, u.full_name, u.role,
              sp.academic_stage_id, sp.grade_id, sp.school_name, sp.section, sp.school_type,
              s.name_ar as stage_name_ar, s.name_en as stage_name_en,
              g.name_ar as grade_name_ar, g.name_en as grade_name_en
       FROM users u
       LEFT JOIN student_profiles sp ON u.id = sp.user_id
       LEFT JOIN academic_stages s ON sp.academic_stage_id = s.id
       LEFT JOIN grades g ON sp.grade_id = g.id
       WHERE u.id = $1 AND u.role = 'STUDENT'`,
      [id]
    );

    if (studentRes.rows.length === 0) {
      return res.status(404).json({ error: 'حساب الطالب غير موجود' });
    }

    const student = studentRes.rows[0];

    const impersonationToken = generateToken({
      id: student.id,
      email: student.email,
      role: 'STUDENT',
      fullName: student.full_name
    });

    return res.json({
      message: `تم الدخول إلى حساب الطالب: ${student.full_name}`,
      token: impersonationToken,
      user: {
        id: student.id,
        email: student.email,
        role: 'STUDENT',
        fullName: student.full_name,
        profile: {
          academic_stage_id: student.academic_stage_id,
          grade_id: student.grade_id,
          school_name: student.school_name,
          section: student.section,
          school_type: student.school_type,
          stage_name_ar: student.stage_name_ar,
          stage_name_en: student.stage_name_en,
          grade_name_ar: student.grade_name_ar,
          grade_name_en: student.grade_name_en
        }
      }
    });
  } catch (error: any) {
    console.error('Error impersonating student:', error);
    return res.status(500).json({ error: 'فشل الدخول إلى حساب الطالب' });
  }
});

export default router;
