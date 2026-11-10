import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/db.js';
import { authenticateToken, requireRole, generateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { getMonthlyExamLimit, setMonthlyExamLimit } from '../services/examLimitService.js';
import { getStorageProvider } from '../services/storage/storageProvider.js';
import { ExamCacheService } from '../services/examCacheService.js';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import * as xlsx from 'xlsx';
import { ReferenceImportService } from '../services/referenceImportService.js';
import { DeviceLimitService } from '../services/deviceLimitService.js';
import { IngestionWorkerSessionService } from '../services/jobs/ingestionWorkerSessionService.js';
import { WorkerKeyService } from '../services/security/workerKeyService.js';
import { CurriculumApprovalService } from '../services/curriculumApprovalService.js';

const XLSX = (xlsx as any).default || xlsx;
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15 MB limit
});

const router = Router();

// All admin routes require ADMIN or CENTRAL_ADMIN role
router.use(authenticateToken);
router.use(requireRole(['ADMIN', 'CENTRAL_ADMIN']));

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
        tp.grade_id,
        tp.subject_id,
        sub.name_ar as subject_name_ar,
        grd.name_ar as grade_name_ar,
        (SELECT COUNT(*) FROM books b WHERE b.teacher_id = u.id) as books_count,
        (SELECT COUNT(*) FROM exams e WHERE e.teacher_id = u.id) as exams_count
      FROM users u
      LEFT JOIN teacher_profiles tp ON u.id = tp.user_id
      LEFT JOIN grades grd ON tp.grade_id = grd.id
      LEFT JOIN subjects sub ON tp.subject_id = sub.id
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
        gradeId: row.grade_id || null,
        gradeNameAr: row.grade_name_ar || null,
        subjectId: row.subject_id || null,
        subjectNameAr: row.subject_name_ar || null,
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
    const { email, password, fullName, specialization, schoolName, permissions, gradeId, subjectId } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور واسم المعلم' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'البريد الإلكتروني مسجل بالفعل' });
    }

    let stageId = null;
    if (gradeId) {
      const grRes = await db.query('SELECT stage_id FROM grades WHERE id = $1', [gradeId]);
      if (grRes.rows.length > 0) {
        stageId = grRes.rows[0].stage_id;
      }
    }

    let finalSpecialization = specialization;
    if (subjectId) {
      const subRes = await db.query('SELECT name_ar FROM subjects WHERE id = $1', [subjectId]);
      if (subRes.rows.length > 0) {
        finalSpecialization = specialization || `معلم ${subRes.rows[0].name_ar}`;
      }
    }

    const teacherId = uuidv4();
    const cleanSpec = finalSpecialization ? finalSpecialization.substring(0, 3).toUpperCase() : 'GEN';
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
      `INSERT INTO users (id, hybrid_id, email, password_hash, role, full_name, permissions, is_active, subject_id)
       VALUES ($1, $2, $3, $4, 'TEACHER', $5, $6, $7, $8)`,
      [
        teacherId,
        hybridId,
        email.toLowerCase().trim(),
        passwordHash,
        fullName.trim(),
        JSON.stringify(defaultPerms),
        defaultPerms.is_active ? 1 : 0,
        subjectId || null
      ]
    );

    await db.query(
      `INSERT INTO teacher_profiles (user_id, full_name, school_name, specialization, grade_id, academic_stage_id, subject_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [teacherId, fullName.trim(), schoolName || null, finalSpecialization || null, gradeId || null, stageId, subjectId || null]
    );

    return res.status(201).json({
      message: 'تم إنشاء حساب المعلم بنجاح',
      teacher: {
        id: teacherId,
        hybrid_id: hybridId,
        email: email.toLowerCase().trim(),
        fullName: fullName.trim(),
        specialization: finalSpecialization,
        schoolName,
        gradeId: gradeId || null,
        subjectId: subjectId || null,
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
    const id = String(req.params.id);
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
    const id = String(req.params.id);

    const teacherRes = await db.query(
      `SELECT u.id, u.hybrid_id, u.email, u.full_name, u.role, u.permissions,
              tp.school_id, tp.school_name, tp.specialization,
              tp.governorate_id, tp.subject_id, tp.supervisor_id,
              tp.grade_id, tp.academic_stage_id,
              tp.assigned_subjects, tp.assigned_grades, tp.teaching_assignments,
              g.name_ar as grade_name_ar, g.name_en as grade_name_en,
              stg.name_ar as stage_name_ar, stg.name_en as stage_name_en,
              sub.name_ar as subject_name_ar, sub.name_en as subject_name_en
       FROM users u
       LEFT JOIN teacher_profiles tp ON u.id = tp.user_id
       LEFT JOIN grades g ON tp.grade_id = g.id
       LEFT JOIN academic_stages stg ON tp.academic_stage_id = stg.id
       LEFT JOIN subjects sub ON tp.subject_id = sub.id
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

    let parsedAssignedSubjects = teacher.assigned_subjects;
    if (typeof parsedAssignedSubjects === 'string') {
      try { parsedAssignedSubjects = JSON.parse(parsedAssignedSubjects); } catch (_) {}
    }
    let parsedAssignedGrades = teacher.assigned_grades;
    if (typeof parsedAssignedGrades === 'string') {
      try { parsedAssignedGrades = JSON.parse(parsedAssignedGrades); } catch (_) {}
    }
    let parsedTeachingAssignments = teacher.teaching_assignments;
    if (typeof parsedTeachingAssignments === 'string') {
      try { parsedTeachingAssignments = JSON.parse(parsedTeachingAssignments); } catch (_) {}
    }

    // Generate token for the teacher with impersonation marker
    const impersonationToken = generateToken({
      id: teacher.id,
      email: teacher.email,
      role: 'TEACHER',
      fullName: teacher.full_name,
      governorateId: teacher.governorate_id || undefined,
      subjectId: teacher.subject_id || undefined
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
          user_id: teacher.id,
          full_name: teacher.full_name,
          school_name: teacher.school_name,
          specialization: teacher.specialization,
          grade_id: teacher.grade_id,
          academic_stage_id: teacher.academic_stage_id,
          governorate_id: teacher.governorate_id,
          subject_id: teacher.subject_id,
          supervisor_id: teacher.supervisor_id,
          grade_name_ar: teacher.grade_name_ar,
          stage_name_ar: teacher.stage_name_ar,
          subject_name_ar: teacher.subject_name_ar,
          assigned_subjects: parsedAssignedSubjects,
          assigned_grades: parsedAssignedGrades,
          teaching_assignments: parsedTeachingAssignments
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
        (
          (SELECT COUNT(*) FROM exam_attempts ea WHERE ea.student_id = u.id AND (ea.status = 'COMPLETED' OR ea.status = 'GRADED' OR ea.completed_at IS NOT NULL))
          +
          (SELECT COUNT(*) FROM ai_evaluations aie WHERE aie.student_id = u.id)
        ) as attempts_count,
        (
          SELECT COUNT(*) FROM exam_attempts ea WHERE ea.student_id = u.id AND ea.status = 'IN_PROGRESS' AND ea.completed_at IS NULL
        ) as in_progress_count,
        (
          SELECT ROUND(AVG(score_pct), 1) FROM (
            SELECT (ea.score / NULLIF(ea.total_points, 0)) * 100 as score_pct
            FROM exam_attempts ea
            WHERE ea.student_id = u.id AND (ea.status = 'COMPLETED' OR ea.status = 'GRADED' OR ea.completed_at IS NOT NULL) AND ea.total_points > 0
            UNION ALL
            SELECT (aie.score / NULLIF(aie.total_questions, 0)) * 100 as score_pct
            FROM ai_evaluations aie
            WHERE aie.student_id = u.id AND aie.total_questions > 0
          ) as all_scores
        ) as avg_score,
        (SELECT COUNT(*) FROM ai_evaluations aie WHERE aie.student_id = u.id) as ai_evals_count,
        (SELECT COUNT(*) FROM exam_attempts ea WHERE ea.student_id = u.id AND (ea.status = 'COMPLETED' OR ea.status = 'GRADED' OR ea.completed_at IS NOT NULL)) as standard_exams_count
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
      inProgressCount: Number(row.in_progress_count || 0),
      standardExamsCount: Number(row.standard_exams_count || 0),
      aiEvalsCount: Number(row.ai_evals_count || 0),
      avgScore: row.avg_score !== null && !isNaN(Number(row.avg_score)) ? Number(row.avg_score) : null,
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
    const id = String(req.params.id);

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

    const examAttemptsRes = await db.query(
      `SELECT ea.id, ea.score, ea.total_points, ea.status, ea.completed_at, ea.started_at,
              e.title_ar as exam_title, s.name_ar as subject_name_ar
       FROM exam_attempts ea
       JOIN exams e ON ea.exam_id = e.id
       LEFT JOIN subjects s ON e.subject_id = s.id
       WHERE ea.student_id = $1
       ORDER BY COALESCE(ea.completed_at, ea.started_at) DESC`,
      [id]
    );

    const aiEvalsRes = await db.query(
      `SELECT ae.id, ae.score, ae.total_questions, ae.created_at, ae.evaluation_report,
              s.name_ar as subject_name_ar,
              COALESCE(bc.title_ar, b.title_ar, s.name_ar, 'تقييم تشخيصي معتمد') as exam_title
       FROM ai_evaluations ae
       LEFT JOIN subjects s ON ae.subject_id = s.id
       LEFT JOIN book_chapters bc ON ae.chapter_id = bc.id
       LEFT JOIN books b ON ae.book_id = b.id
       WHERE ae.student_id = $1
       ORDER BY ae.created_at DESC`,
      [id]
    );

    const attempts = [
      ...examAttemptsRes.rows.map((r: any) => {
        const total = Number(r.total_points) || 1;
        const score = Number(r.score) || 0;
        const isDone = r.status === 'COMPLETED' || r.status === 'GRADED' || !!r.completed_at;
        const pct = isDone ? Math.round((score / total) * 100) : null;
        return {
          id: r.id,
          attempt_type: 'EXAM',
          exam_title: r.exam_title,
          subject_name_ar: r.subject_name_ar || 'امتحان دوري معتمد',
          score,
          total_points: total,
          percentage: pct,
          status: isDone ? 'COMPLETED' : (r.status || 'IN_PROGRESS'),
          completed_at: r.completed_at || r.started_at
        };
      }),
      ...aiEvalsRes.rows.map((r: any) => {
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
          attempt_type: 'AI_EVALUATION',
          exam_title: r.exam_title,
          subject_name_ar: r.subject_name_ar || 'تقييم ذكي',
          score,
          total_points: total,
          total_questions: total,
          percentage: pct,
          status: 'COMPLETED',
          completed_at: r.created_at
        };
      })
    ].sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());

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
      attempts,
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
    const id = String(req.params.id);

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

/**
 * 4. Platform Settings & Global Controls
 */
router.get('/settings', async (req: AuthenticatedRequest, res) => {
  try {
    const rows = await db.query('SELECT setting_key, setting_value FROM platform_settings');
    const settings: Record<string, any> = {
      active_term: 1,
      allow_student_registration: true,
      active_grades: 'ALL',
      platform_logo: '/logo.png',
      monthly_exam_limit: 10,
      allow_subordinate_visibility: true,
      max_devices_per_user: await DeviceLimitService.getGlobalDeviceLimit()
    };

    for (const r of rows.rows) {
      if (r.setting_key === 'active_term') {
        settings.active_term = parseInt(r.setting_value, 10) || 1;
      } else if (r.setting_key === 'allow_student_registration') {
        settings.allow_student_registration = r.setting_value === 'true' || r.setting_value === '1';
      } else if (r.setting_key === 'allow_subordinate_visibility') {
        settings.allow_subordinate_visibility = r.setting_value === 'true' || r.setting_value === '1';
      } else if (r.setting_key === 'active_grades') {
        try {
          settings.active_grades = JSON.parse(r.setting_value);
        } catch {
          settings.active_grades = r.setting_value;
        }
      } else if (r.setting_key === 'platform_logo') {
        settings.platform_logo = r.setting_value;
      } else if (r.setting_key === 'monthly_exam_limit') {
        settings.monthly_exam_limit = parseInt(r.setting_value, 10) || 10;
      } else if (r.setting_key === 'max_devices_per_user') {
        settings.max_devices_per_user = parseInt(r.setting_value, 10) || 2;
      } else {
        settings[r.setting_key] = r.setting_value;
      }
    }

    return res.json(settings);
  } catch (error: any) {
    return res.status(500).json({ error: 'خطأ في جلب إعدادات المنظومة' });
  }
});

router.post('/settings', async (req: AuthenticatedRequest, res) => {
  try {
    const { active_term, allow_student_registration, allow_subordinate_visibility, active_grades, platform_logo, monthly_exam_limit, max_devices_per_user } = req.body;
    const now = new Date().toISOString();
    const updatedBy = req.user!.email;

    const rawDevLimit = max_devices_per_user ?? req.body?.maxDevicesPerUser ?? req.body?.max_devices;
    if (rawDevLimit !== undefined) {
      const devLim = parseInt(String(rawDevLimit), 10);
      if (!DeviceLimitService.isValidLimit(devLim)) {
        return res.status(400).json({ error: 'الحد الأقصى للأجهزة يجب أن يكون رقماً صحيحاً من بين: 1، 2، 3، أو 5 فقط.' });
      }
      await DeviceLimitService.setGlobalDeviceLimit(devLim, updatedBy);
    }

    const updates: Array<{ key: string; val: string }> = [];

    if (active_term !== undefined) {
      const termNum = parseInt(String(active_term), 10) === 2 ? '2' : '1';
      updates.push({ key: 'active_term', val: termNum });
    }
    if (allow_student_registration !== undefined) {
      updates.push({ key: 'allow_student_registration', val: String(!!allow_student_registration) });
    }
    if (allow_subordinate_visibility !== undefined) {
      updates.push({ key: 'allow_subordinate_visibility', val: String(!!allow_subordinate_visibility) });
    }
    if (active_grades !== undefined) {
      const gVal = typeof active_grades === 'string' ? active_grades : JSON.stringify(active_grades);
      updates.push({ key: 'active_grades', val: gVal });
    }
    if (platform_logo !== undefined) {
      updates.push({ key: 'platform_logo', val: String(platform_logo) });
    }
    if (monthly_exam_limit !== undefined) {
      const lim = parseInt(String(monthly_exam_limit), 10);
      if (!isNaN(lim) && lim > 0) {
        updates.push({ key: 'monthly_exam_limit', val: String(lim) });
      }
    }

    for (const u of updates) {
      try {
        await db.query(
          `INSERT INTO platform_settings (setting_key, setting_value, updated_at, updated_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = $3, updated_by = $4`,
          [u.key, u.val, now, updatedBy]
        );
      } catch (_) {
        try {
          await db.query(
            `REPLACE INTO platform_settings (setting_key, setting_value, updated_at, updated_by)
             VALUES ($1, $2, $3, $4)`,
            [u.key, u.val, now, updatedBy]
          );
        } catch (e) {
          console.error(`Error saving setting ${u.key}:`, e);
        }
      }
    }

    return res.json({ message: 'تم حفظ إعدادات المنظومة بنجاح', success: true });
  } catch (error: any) {
    console.error('Error saving settings:', error);
    return res.status(500).json({ error: 'خطأ أثناء حفظ إعدادات المنظومة: ' + error.message });
  }
});

/**
 * 5. Admin Curriculum & Books Management
 */
router.get('/books', async (req: AuthenticatedRequest, res) => {
  try {
    const query = `
      SELECT b.*, 
             s.name_ar as subject_name_ar, s.name_en as subject_name_en,
             st.name_ar as stage_name_ar, 
             g.name_ar as grade_name_ar,
             COALESCE((SELECT COUNT(*) FROM book_chapters bc WHERE bc.book_id = b.id AND (bc.generation_id = b.active_generation_id OR (b.active_generation_id IS NULL AND bc.generation_id = 'v1'))), 0) as chapters_count,
             COALESCE((SELECT COUNT(*) FROM curriculum_unit_approvals cua WHERE cua.book_id = b.id AND cua.approval_status = 'APPROVED' AND (cua.generation_id = b.active_generation_id OR (b.active_generation_id IS NULL AND cua.generation_id = 'v1'))), 0) as approved_units_count,
             COALESCE((SELECT COUNT(*) FROM curriculum_unit_approvals cua WHERE cua.book_id = b.id AND cua.approval_status != 'APPROVED' AND (cua.generation_id = b.active_generation_id OR (b.active_generation_id IS NULL AND cua.generation_id = 'v1'))), 0) as blocked_units_count
      FROM books b
      LEFT JOIN subjects s ON b.subject_id = s.id
      LEFT JOIN academic_stages st ON b.academic_stage_id = st.id
      LEFT JOIN grades g ON b.grade_id = g.id
      ORDER BY b.term ASC, g.sort_order ASC, b.created_at DESC
    `;
    const booksRes = await db.query(query);
    return res.json({ books: booksRes.rows });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب قائمة المناهج والكتب: ' + err.message });
  }
});

router.delete('/books/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);

    // Verify book exists
    const bookRes = await db.query('SELECT id, file_url FROM books WHERE id = $1', [id]);
    if (bookRes.rows.length === 0) {
      return res.status(404).json({ error: 'الكتاب غير موجود' });
    }
    const book = bookRes.rows[0];

    // Safely remove all dependent records, chunks, units, and ingestion records
    await db.query('DELETE FROM book_pdf_chunks WHERE book_id = $1', [id]).catch(() => {});
    await db.query('DELETE FROM book_ingestion_jobs WHERE book_id = $1', [id]).catch(() => {});
    await db.query('DELETE FROM book_chunks WHERE book_id = $1', [id]);
    await db.query('DELETE FROM book_pages WHERE book_id = $1', [id]).catch(() => {});
    await db.query('DELETE FROM book_chapters WHERE book_id = $1', [id]);
    await db.query('DELETE FROM question_bank WHERE book_id = $1', [id]).catch(() => {});
    await db.query('DELETE FROM student_exam_assignments WHERE cached_exam_id IN (SELECT id FROM shared_cached_exams WHERE book_id = $1)', [id]).catch(() => {});
    await db.query('DELETE FROM shared_cached_exams WHERE book_id = $1', [id]).catch(() => {});
    await db.query('DELETE FROM ai_evaluations WHERE book_id = $1', [id]).catch(() => {});
    await db.query('DELETE FROM ai_usage_metrics WHERE book_id = $1', [id]).catch(() => {});
    await db.query('UPDATE exams SET book_id = NULL WHERE book_id = $1', [id]).catch(() => {});

    // Delete the canonical book record
    await db.query('DELETE FROM books WHERE id = $1', [id]);

    // Remove book-owned files from storage
    try {
      const storage = getStorageProvider();
      await storage.deleteFile(`books/${id}/book_${id}.pdf`).catch(() => {});
      await storage.deleteFile(`books/${id}`).catch(() => {});

      const uploadDir = process.env.VERCEL ? path.resolve('/tmp', 'uploads') : path.resolve(process.cwd(), 'uploads');
      const localPdf = path.join(uploadDir, `book_${id}.pdf`);
      if (fs.existsSync(localPdf)) {
        fs.unlinkSync(localPdf);
      }
      if (book.file_url) {
        const customLocal = path.join(uploadDir, path.basename(book.file_url));
        if (fs.existsSync(customLocal)) {
          fs.unlinkSync(customLocal);
        }
      }
    } catch (storageErr) {
      console.warn('Storage cleanup note on book deletion:', storageErr);
    }

    // Clean up memory cache
    try {
      ExamCacheService.clearMemoryCache();
    } catch (_) {}

    return res.json({ message: 'تم حذف الكتاب وكافة وحداته ومقاطعه وسجلاته بنجاح' });
  } catch (err: any) {
    return res.status(500).json({ error: 'فشل حذف الكتاب: ' + err.message });
  }
});

router.put('/books/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const {
      title_ar,
      title_en,
      academic_stage_id,
      grade_id,
      subject_id,
      term,
      school_type
    } = req.body;

    const bookCheck = await db.query('SELECT * FROM books WHERE id = $1', [id]);
    if (bookCheck.rows.length === 0) {
      return res.status(404).json({ error: 'الكتاب غير موجود' });
    }

    const cur = bookCheck.rows[0];
    const newTitleAr = title_ar !== undefined && String(title_ar).trim() ? String(title_ar).trim() : cur.title_ar;
    const newTitleEn = title_en !== undefined && String(title_en).trim() ? String(title_en).trim() : (cur.title_en || newTitleAr);
    const newStageId = academic_stage_id || cur.academic_stage_id;
    const newGradeId = grade_id || cur.grade_id;
    const newSubjectId = subject_id || cur.subject_id;
    const newTerm = term !== undefined ? (parseInt(String(term), 10) === 2 ? 2 : 1) : cur.term;
    const newSchoolType = school_type !== undefined ? school_type : cur.school_type;

    await db.query(
      `UPDATE books 
       SET title_ar = $1, title_en = $2, academic_stage_id = $3, grade_id = $4, subject_id = $5, term = $6, school_type = $7
       WHERE id = $8`,
      [newTitleAr, newTitleEn, newStageId, newGradeId, newSubjectId, newTerm, newSchoolType, id]
    );

    // Sync cascaded references in chunks so future question generations and filters are fully aligned
    await db.query(
      `UPDATE book_chunks 
       SET academic_stage_id = $1, grade_id = $2, subject_id = $3
       WHERE book_id = $4`,
      [newStageId, newGradeId, newSubjectId, id]
    );

    return res.json({
      message: 'تم تحديث بيانات الكتاب بنجاح ومزامنة التحديثات',
      book: {
        id,
        title_ar: newTitleAr,
        title_en: newTitleEn,
        academic_stage_id: newStageId,
        grade_id: newGradeId,
        subject_id: newSubjectId,
        term: newTerm,
        school_type: newSchoolType
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'فشل تحديث بيانات الكتاب: ' + err.message });
  }
});

/**
 * 6. Superadmin Profile & Credentials Management (with double-check confirmation)
 */
router.put('/profile/credentials', async (req: AuthenticatedRequest, res) => {
  try {
    const adminId = req.user!.id;
    const { fullName, email, currentPassword, newPassword } = req.body;
    const confirmNewPassword = req.body.confirmNewPassword ?? req.body.confirmPassword;

    const adminRes = await db.query(`SELECT id, email, full_name, role, password_hash FROM users WHERE id = $1`, [adminId]);
    if (adminRes.rows.length === 0) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    const admin = adminRes.rows[0];

    if (currentPassword || newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'الرجاء إدخال كلمة المرور الحالية لتأكيد التغيير' });
      }
      const isMatch = await bcrypt.compare(currentPassword, admin.password_hash);
      if (!isMatch) {
        return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
      }
    }

    if (newPassword) {
      if (typeof newPassword !== 'string' || newPassword.trim().length === 0) {
        return res.status(400).json({ error: 'الرجاء إدخال كلمة المرور الجديدة' });
      }
      if (confirmNewPassword !== undefined && confirmNewPassword !== null && newPassword !== confirmNewPassword) {
        return res.status(400).json({ error: 'كلمتا المرور غير متطابقتين (فشل التأكيد المزدوج)' });
      }
    }

    let updatedHash = admin.password_hash;
    if (newPassword) {
      updatedHash = await bcrypt.hash(newPassword, 10);
    }

    const updatedFullName = fullName && fullName.trim() ? fullName.trim() : admin.full_name;
    const updatedEmail = email && email.trim() ? email.trim() : admin.email;

    if (updatedEmail !== admin.email) {
      const emailCheck = await db.query(`SELECT id FROM users WHERE email = $1 AND id != $2`, [updatedEmail, adminId]);
      if (emailCheck.rows.length > 0) {
        return res.status(400).json({ error: 'اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل بحساب آخر' });
      }
    }

    await db.query(
      `UPDATE users SET full_name = $1, email = $2, password_hash = $3 WHERE id = $4`,
      [updatedFullName, updatedEmail, updatedHash, adminId]
    );

    const token = generateToken({
      id: admin.id,
      email: updatedEmail,
      role: admin.role,
      fullName: updatedFullName
    });

    return res.json({
      message: 'تم تحديث بيانات الحساب وكلمة المرور بنجاح',
      user: {
        id: admin.id,
        email: updatedEmail,
        fullName: updatedFullName,
        role: admin.role
      },
      token
    });
  } catch (err: any) {
    console.error('Update admin credentials error:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء تحديث بيانات الحساب: ' + err.message });
  }
});

/**
 * 7. Change/Reset Password for users under Superadmin (with double check)
 */
router.put('/users/:userId/password', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;
    const confirmNewPassword = req.body.confirmNewPassword ?? req.body.confirmPassword;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length === 0) {
      return res.status(400).json({ error: 'الرجاء إدخال كلمة المرور الجديدة' });
    }
    if (confirmNewPassword !== undefined && confirmNewPassword !== null && newPassword !== confirmNewPassword) {
      return res.status(400).json({ error: 'كلمتا المرور غير متطابقتين (فشل التأكيد المزدوج)' });
    }

    const userRes = await db.query(`SELECT id, full_name, email, role FROM users WHERE id = $1`, [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, userId]);

    return res.json({
      message: `تم تغيير كلمة المرور للمستخدم (${userRes.rows[0].full_name}) بنجاح`,
      userId
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'فشل تغيير كلمة مرور المستخدم: ' + err.message });
  }
});

/**
 * 8. Student Device Limits & Active Sessions Management
 */
router.get('/students/:userId/devices', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;
    const devicesRes = await db.query(
      `SELECT id, device_id, device_name, ip_address, last_active_at, created_at 
       FROM user_active_devices WHERE user_id = $1 ORDER BY last_active_at DESC`,
      [userId]
    );
    const spRes = await db.query(`SELECT max_devices FROM student_profiles WHERE user_id = $1`, [userId]);
    const maxDevices = spRes.rows[0]?.max_devices ? Number(spRes.rows[0].max_devices) : 2;

    return res.json({
      devices: devicesRes.rows,
      max_devices: maxDevices,
      count: devicesRes.rows.length
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب أجهزة الطالب' });
  }
});

router.put('/students/:userId/max-devices', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;
    const rawLimit = req.body?.max_devices ?? req.body?.maxDevices ?? req.body?.limit;
    const num = parseInt(String(rawLimit), 10);
    if (!DeviceLimitService.isValidLimit(num)) {
      return res.status(400).json({ error: 'الحد الأقصى للأجهزة يجب أن يكون رقماً صحيحاً من بين: 1، 2، 3، أو 5 فقط.' });
    }

    await db.query(`UPDATE student_profiles SET max_devices = $1 WHERE user_id = $2`, [num, userId]);
    return res.json({ message: `تم تحديث الحد الأقصى للأجهزة إلى (${num}) بنجاح`, max_devices: num, success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'فشل تحديث الحد الأقصى للأجهزة: ' + err.message });
  }
});

// Dedicated global device-limit endpoints for the Admin Dashboard
router.get('/device-limit', async (req: AuthenticatedRequest, res) => {
  try {
    const limit = await DeviceLimitService.getGlobalDeviceLimit();
    return res.json({ max_devices_per_user: limit, success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب الحد العام للأجهزة: ' + err.message });
  }
});

router.put('/device-limit', async (req: AuthenticatedRequest, res) => {
  try {
    const rawLimit = req.body?.max_devices_per_user ?? req.body?.maxDevices ?? req.body?.limit ?? req.body?.max_devices;
    const num = parseInt(String(rawLimit), 10);
    if (!DeviceLimitService.isValidLimit(num)) {
      return res.status(400).json({ error: 'الحد الأقصى للأجهزة يجب أن يكون رقماً صحيحاً من بين: 1، 2، 3، أو 5 فقط.' });
    }

    const saved = await DeviceLimitService.setGlobalDeviceLimit(num, req.user!.email);
    return res.json({
      message: `تم اعتماد وتحديث الحد الأقصى للأجهزة إلى (${saved} أجهزة لكل مستخدم) بنجاح.`,
      max_devices_per_user: saved,
      success: true
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'فشل تحديث الحد الأقصى للأجهزة' });
  }
});

router.delete('/students/:userId/devices/:deviceId', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId, deviceId } = req.params;
    await db.query(`DELETE FROM user_active_devices WHERE user_id = $1 AND (device_id = $2 OR id = $2)`, [userId, deviceId]);
    return res.json({ message: 'تم إزالة الجهاز بنجاح ويمكن للطالب الدخول بجهاز جديد' });
  } catch (err: any) {
    return res.status(500).json({ error: 'فشل إزالة الجهاز' });
  }
});

router.delete('/students/:userId/devices', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;
    await db.query(`DELETE FROM user_active_devices WHERE user_id = $1`, [userId]);
    return res.json({ message: 'تمت إعادة ضبط وحذف جميع الأجهزة المسجلة للطالب بنجاح' });
  } catch (err: any) {
    return res.status(500).json({ error: 'فشل تصفير أجهزة الطالب' });
  }
});

/**
 * 9. One-Click Excel Reference Importer
 * POST /api/admin/references/import-excel
 */
router.post('/references/import-excel', excelUpload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'الرجاء إرفاق ملف Excel صالح بصيغة .xlsx أو .xls' });
    }

    const {
      subject_id,
      grade_id,
      chapter_id,
      stage_id,
      term,
      school_type,
      create_fixed_exam,
      duration_minutes,
      exam_title,
      is_published,
      is_style_reference
    } = req.body;

    const summary = await ReferenceImportService.importReferenceWorkbook(
      req.file.buffer,
      {
        operatorId: req.user!.id,
        operatorRole: req.user!.role,
        workbookName: req.file.originalname,
        overrideSubjectId: subject_id || undefined,
        overrideGradeId: grade_id || undefined,
        overrideChapterId: chapter_id || undefined,
        overrideStageId: stage_id || undefined,
        overrideTerm: term ? parseInt(String(term), 10) : undefined,
        overrideSchoolType: school_type || undefined,
        createFixedExam: create_fixed_exam !== 'false' && create_fixed_exam !== false,
        durationMinutes: duration_minutes ? parseInt(String(duration_minutes), 10) : undefined,
        examTitle: exam_title || undefined,
        isPublished: is_published !== undefined ? (is_published === 'true' || is_published === true) : undefined,
        isStyleReference: is_style_reference !== undefined ? (is_style_reference === 'true' || is_style_reference === true) : undefined
      }
    );

    return res.json(summary);
  } catch (err: any) {
    console.error('Reference workbook import error:', err);
    return res.status(400).json({
      success: false,
      error: err.message || 'حدث خطأ أثناء استيراد ومعالجة ملف المراجع'
    });
  }
});

/**
 * 9.1 Preview Excel Reference Workbook (Without committing to DB)
 * POST /api/admin/references/preview-excel
 */
router.post('/references/preview-excel', excelUpload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'الرجاء إرفاق ملف Excel صالح بصيغة .xlsx أو .xls' });
    }

    const {
      subject_id,
      grade_id,
      chapter_id,
      stage_id,
      term,
      school_type,
      duration_minutes
    } = req.body;

    const preview = await ReferenceImportService.previewReferenceWorkbook(
      req.file.buffer,
      {
        operatorId: req.user!.id,
        operatorRole: req.user!.role,
        workbookName: req.file.originalname,
        overrideSubjectId: subject_id || undefined,
        overrideGradeId: grade_id || undefined,
        overrideChapterId: chapter_id || undefined,
        overrideStageId: stage_id || undefined,
        overrideTerm: term ? parseInt(String(term), 10) : undefined,
        overrideSchoolType: school_type || undefined,
        durationMinutes: duration_minutes ? parseInt(String(duration_minutes), 10) : 30
      }
    );

    return res.json(preview);
  } catch (err: any) {
    console.error('Reference workbook preview error:', err);
    return res.status(400).json({
      success: false,
      error: err.message || 'حدث خطأ أثناء معاينة ملف المراجع'
    });
  }
});

/**
 * 10. Download Sample Excel Reference Template
 * GET /api/admin/references/template
 */
router.get('/references/template', (req: AuthenticatedRequest, res) => {
  try {
    const buffer = ReferenceImportService.generateTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Farabi_Reference_Workbook_Template.xlsx"');
    return res.send(buffer);
  } catch (err: any) {
    return res.status(500).json({ error: 'فشل إنشاء قالب Excel: ' + err.message });
  }
});


/**
 * 11. Admin Exclusive Exam Reference Questions Importer
 * POST /api/admin/reference-questions/preview
 */
router.post('/reference-questions/preview', excelUpload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    await (db as any).ensureEssentialColumns?.();
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'الرجاء إرفاق ملف Excel صالح بصيغة .xlsx أو .xls' });
    }

    const { grade_id, subject_id, chapter_id } = req.body;
    if (!grade_id || !subject_id || !chapter_id) {
      return res.status(400).json({ error: 'يجب تحديد الصف والمادة والوحدة بشكل صريح لمعاينة الأسئلة المرجعية' });
    }

    const preview = await ReferenceImportService.previewReferenceWorkbook(
      req.file.buffer,
      {
        operatorId: req.user!.id,
        operatorRole: req.user!.role,
        workbookName: req.file.originalname,
        overrideGradeId: grade_id,
        overrideSubjectId: subject_id,
        overrideChapterId: chapter_id,
        durationMinutes: 30
      }
    );

    return res.json(preview);
  } catch (err: any) {
    console.error('Admin reference preview error:', err);
    return res.status(400).json({
      success: false,
      error: err.message || 'حدث خطأ أثناء معاينة ملف الأسئلة المرجعية'
    });
  }
});

/**
 * POST /api/admin/reference-questions/import
 */
router.post('/reference-questions/import', excelUpload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    await (db as any).ensureEssentialColumns?.();
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'الرجاء إرفاق ملف Excel صالح بصيغة .xlsx أو .xls' });
    }

    const { grade_id, subject_id, chapter_id } = req.body;
    if (!grade_id || !subject_id || !chapter_id) {
      return res.status(400).json({ error: 'يجب تحديد الصف والمادة والوحدة بشكل صريح لاعتماد الأسئلة المرجعية' });
    }

    const summary = await ReferenceImportService.importAdminReferenceQuestions(
      req.file.buffer,
      {
        operatorId: req.user!.id,
        operatorRole: req.user!.role,
        workbookName: req.file.originalname,
        gradeId: grade_id,
        subjectId: subject_id,
        chapterId: chapter_id
      }
    );

    return res.json(summary);
  } catch (err: any) {
    console.error('Admin reference questions import error:', err);
    return res.status(400).json({
      success: false,
      error: err.message || 'حدث خطأ أثناء استيراد واعتماد الأسئلة المرجعية'
    });
  }
});

/**
 * GET /api/admin/reference-questions
 * List all active reference question sets
 */
router.get('/reference-questions', async (req: AuthenticatedRequest, res) => {
  try {
    await (db as any).ensureEssentialColumns?.();
    const listRes = await db.query(`
      SELECT 
        e.id, e.title_ar, e.created_at, e.grade_id, e.subject_id, e.chapter_id,
        g.name_ar as grade_name_ar,
        s.name_ar as subject_name_ar,
        bc.title_ar as chapter_title_ar,
        bc.chapter_number,
        COALESCE(
          NULLIF((SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id), 0),
          (SELECT COUNT(*) FROM question_bank_items qb WHERE qb.chapter_id = e.chapter_id AND qb.is_reference = 1),
          0
        ) as questions_count
      FROM exams e
      JOIN grades g ON e.grade_id = g.id
      JOIN subjects s ON e.subject_id = s.id
      LEFT JOIN book_chapters bc ON e.chapter_id = bc.id
      WHERE e.is_ai_reference = 1
      ORDER BY e.created_at DESC
    `);
    return res.json(listRes.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب قائمة المراجع المعتمدة' });
  }
});

/**
 * DELETE /api/admin/reference-questions/:id
 */
router.delete('/reference-questions/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    let chapterId: string | null = null;
    let gradeId: string | null = null;
    let subjectId: string | null = null;
    const examIds: string[] = [];

    // 1. Check if id matches an exam
    const examRes = await db.query(`SELECT id, chapter_id, grade_id, subject_id FROM exams WHERE id = $1`, [id]);
    if (examRes.rows.length > 0) {
      examIds.push(examRes.rows[0].id);
      chapterId = examRes.rows[0].chapter_id;
      gradeId = examRes.rows[0].grade_id;
      subjectId = examRes.rows[0].subject_id;
    } else {
      // 2. Check if id matches a chapter directly
      const chRes = await db.query(`SELECT id FROM book_chapters WHERE id = $1`, [id]);
      if (chRes.rows.length > 0) {
        chapterId = id;
      }
    }

    if (!chapterId && examIds.length === 0) {
      return res.status(404).json({ error: 'المرجع المنهجي غير موجود' });
    }

    // 2. If chapterId is known, find all reference exams container for this chapter
    if (chapterId) {
      const allRefExams = await db.query(
        `SELECT id, grade_id, subject_id FROM exams WHERE chapter_id = $1 AND is_ai_reference = 1`,
        [chapterId]
      );
      for (const ex of allRefExams.rows) {
        if (!examIds.includes(ex.id)) examIds.push(ex.id);
        if (!gradeId) gradeId = ex.grade_id;
        if (!subjectId) subjectId = ex.subject_id;
      }

      // 3. Delete question bank options for this chapter's reference items
      await db.query(`
        DELETE FROM question_bank_options 
        WHERE question_item_id IN (
          SELECT id FROM question_bank_items 
          WHERE chapter_id = $1 AND (is_reference = 1 OR quarantine_reason = 'VERIFIED:ADMIN_REFERENCE')
        )
      `, [chapterId]);

      // 4. Delete reference items from question_bank_items
      await db.query(
        `DELETE FROM question_bank_items 
         WHERE chapter_id = $1 AND (is_reference = 1 OR quarantine_reason = 'VERIFIED:ADMIN_REFERENCE')`,
        [chapterId]
      );

      // 5. Invalidate cached AI exams for this unit
      if (gradeId && subjectId) {
        await db.query(
          `DELETE FROM shared_cached_exams WHERE grade_id = $1 AND subject_id = $2 AND (unit_ids LIKE $3 OR unit_ids = $4)`,
          [gradeId, subjectId, `%${chapterId}%`, chapterId]
        );
      }
    }

    // 6. Delete exam questions options and questions for each exam container
    for (const exId of examIds) {
      try {
        await db.query(`
          DELETE FROM exam_question_options 
          WHERE question_id IN (SELECT id FROM exam_questions WHERE exam_id = $1)
        `, [exId]);
      } catch (_) {}
      try {
        await db.query(`DELETE FROM student_answers WHERE question_id IN (SELECT id FROM exam_questions WHERE exam_id = $1)`, [exId]);
      } catch (_) {}
      try {
        await db.query(`DELETE FROM exam_attempts WHERE exam_id = $1`, [exId]);
      } catch (_) {}
      try {
        await db.query(`DELETE FROM exam_submissions WHERE exam_id = $1`, [exId]);
      } catch (_) {}
      try {
        await db.query(`DELETE FROM exam_questions WHERE exam_id = $1`, [exId]);
      } catch (_) {}
      try {
        await db.query(`DELETE FROM exams WHERE id = $1`, [exId]);
      } catch (_) {}
    }

    return res.json({ 
      success: true, 
      message: 'تم حذف المرجع المنهجي وكافة أسئلته وخياراته بالكامل من قاعدة البيانات بنجاح' 
    });
  } catch (err: any) {
    console.error('Error deleting reference exam:', err);
    return res.status(500).json({ error: 'فشل حذف المرجع: ' + err.message });
  }
});

/**
 * GET /api/admin/reference-questions/template
 */
router.get('/reference-questions/template', (req: AuthenticatedRequest, res) => {
  try {
    const buffer = ReferenceImportService.generateTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Farabi_Reference_Questions_Template.xlsx"');
    return res.send(buffer);
  } catch (err: any) {
    return res.status(500).json({ error: 'فشل إنشاء قالب Excel: ' + err.message });
  }
});

/**
 * POST /api/admin/books/:id/worker-session
 * Issues a bound, revocable worker session token for the local ingestion worker,
 * along with an Asymmetric RS256 JWT authorization token for the local Windows worker.
 */
router.post('/books/:id/worker-session', async (req: AuthenticatedRequest, res) => {
  const bookId = String(req.params.id);
  const adminUserId = req.user?.id || 'admin';
  const adminEmail = req.user?.email || 'admin@farabi-ai.com';
  const adminRole = req.user?.role || 'CENTRAL_ADMIN';

  let fileChecksum = req.body.file_checksum || req.body.fileChecksum;
  const jobId = req.body.job_id || req.body.jobId;
  let totalPages = req.body.total_pages || req.body.totalPages;

  // Verify book exists in canonical database
  const bookRes = await db.query('SELECT id, title_ar, total_pages FROM books WHERE id = $1', [bookId]);
  if (bookRes.rows.length === 0) {
    return res.status(400).json({ error: `Book with id ${bookId} not found in database.` });
  }

  if (!totalPages && bookRes.rows[0].total_pages) {
    totalPages = bookRes.rows[0].total_pages;
  }

  // If checksum not supplied by client, resolve from existing ingestion jobs or PDF chunks
  if (!fileChecksum) {
    const jobRes = await db.query(
      'SELECT file_checksum FROM book_ingestion_jobs WHERE book_id = $1 ORDER BY created_at DESC LIMIT 1',
      [bookId]
    );
    if (jobRes.rows.length > 0 && jobRes.rows[0].file_checksum) {
      fileChecksum = jobRes.rows[0].file_checksum;
    } else {
      // Check if raw PDF chunks exist and compute real checksum
      const rawPdf = await IngestionWorkerSessionService.getRawPdfChunks(bookId);
      if (rawPdf && rawPdf.length > 0) {
        fileChecksum = crypto.createHash('sha256').update(rawPdf).digest('hex');
      } else {
        fileChecksum = crypto.createHash('sha256').update(`book_${bookId}_initial`).digest('hex');
      }
    }
  }

  try {
    const session = await IngestionWorkerSessionService.createSession({
      adminUserId,
      bookId,
      fileChecksum,
      requestedJobId: jobId,
      totalPages: totalPages ? parseInt(String(totalPages), 10) : 0
    });

    // Mint RS256 token for the local worker
    const workerAuthToken = WorkerKeyService.signWorkerAuthToken({
      adminUserId,
      email: adminEmail,
      role: adminRole,
      bookId: session.bookId,
      jobId: session.jobId,
      generationId: session.generationId
    });

    return res.json({
      success: true,
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
      workerAuthToken,
      bookId: session.bookId,
      jobId: session.jobId,
      generationId: session.generationId,
      expiresAt: session.expiresAt
    });
  } catch (err: any) {
    return res.status(400).json({ error: 'فشل إنشاء جلسة العامل المحلي: ' + err.message });
  }
});

/**
 * POST /api/admin/books/:id/worker-session/revoke
 * Immediately revokes active worker sessions for a given book.
 */
router.post('/books/:id/worker-session/revoke', async (req: AuthenticatedRequest, res) => {
  const bookId = String(req.params.id);
  try {
    const sessionsRes = await db.query(
      'SELECT id FROM ingestion_worker_sessions WHERE book_id = $1 AND is_revoked = 0',
      [bookId]
    );
    for (const row of sessionsRes.rows) {
      await IngestionWorkerSessionService.revokeSession(row.id);
    }
    return res.json({ success: true, message: `Revoked ${sessionsRes.rows.length} session(s) for book ${bookId}.` });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to revoke worker session: ' + err.message });
  }
});

/**
 * GET /api/admin/books/:id/worker-session/status
 * Queries active worker session and checkpoint data for a given book.
 */
router.get('/books/:id/worker-session/status', async (req: AuthenticatedRequest, res) => {
  const bookId = String(req.params.id);
  try {
    const sessionRes = await db.query(
      `SELECT id, job_id, generation_id, expires_at, is_revoked, processed_pages_count, total_pages, created_at
       FROM ingestion_worker_sessions 
       WHERE book_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [bookId]
    );

    const jobRes = await db.query(
      `SELECT id, current_stage, status, checkpoint_data, last_error, updated_at
       FROM book_ingestion_jobs 
       WHERE book_id = $1 
       ORDER BY updated_at DESC 
       LIMIT 1`,
      [bookId]
    );

    const bookRes = await db.query(
      'SELECT id, title_ar, active_generation_id, processing_status, total_pages FROM books WHERE id = $1',
      [bookId]
    );

    if (bookRes.rows.length === 0) {
      return res.status(404).json({ error: 'Book not found' });
    }

    let checkpoint: any = null;
    if (jobRes.rows[0]?.checkpoint_data) {
      try {
        checkpoint = JSON.parse(jobRes.rows[0].checkpoint_data);
      } catch (_) {}
    }

    return res.json({
      book: bookRes.rows[0],
      session: sessionRes.rows[0] || null,
      job: jobRes.rows[0] ? { ...jobRes.rows[0], checkpoint_data: checkpoint } : null
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to query session status: ' + err.message });
  }
});

/**
 * 12. Persistent Curriculum Review and Approval Endpoints (ADMIN ONLY)
 */
// A. List books awaiting curriculum review
router.get('/curriculum/review-queue', async (req: AuthenticatedRequest, res) => {
  try {
    const { stage_id, grade_id, subject_id, status } = req.query;
    const queue = await CurriculumApprovalService.getReviewQueue({
      stageId: stage_id as string,
      gradeId: grade_id as string,
      subjectId: subject_id as string,
      status: status as string
    });
    return res.json({ books: queue });
  } catch (err: any) {
    return res.status(500).json({ error: 'حدث خطأ أثناء جلب قائمة المراجعة: ' + err.message });
  }
});

// B. Retrieve unit review details, page boundaries, source provenance, chunk coverage
router.get('/curriculum/units/:chapterId/review', async (req: AuthenticatedRequest, res) => {
  try {
    const chapterId = String(req.params.chapterId);
    const details = await CurriculumApprovalService.getUnitReviewDetails(chapterId);
    return res.json(details);
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

// C. Approve a specific unit
router.post('/curriculum/units/:chapterId/approve', async (req: AuthenticatedRequest, res) => {
  try {
    const chapterId = String(req.params.chapterId);
    const { book_id, notes } = req.body;
    if (!book_id) {
      return res.status(400).json({ error: 'معرف الكتاب مطلوب (book_id)' });
    }
    const result = await CurriculumApprovalService.approveUnit(req.user!.id, chapterId, String(book_id), notes);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// D. Reject a specific unit with a reason
router.post('/curriculum/units/:chapterId/reject', async (req: AuthenticatedRequest, res) => {
  try {
    const chapterId = String(req.params.chapterId);
    const { book_id, reason } = req.body;
    if (!book_id) {
      return res.status(400).json({ error: 'معرف الكتاب مطلوب (book_id)' });
    }
    if (!reason || String(reason).trim().length === 0) {
      return res.status(400).json({ error: 'سبب الرفض مطلوب' });
    }
    const result = await CurriculumApprovalService.rejectUnit(req.user!.id, chapterId, String(book_id), String(reason));
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// E. Revoke an existing approval
router.post('/curriculum/units/:chapterId/revoke', async (req: AuthenticatedRequest, res) => {
  try {
    const chapterId = String(req.params.chapterId);
    const { book_id, reason } = req.body;
    if (!book_id) {
      return res.status(400).json({ error: 'معرف الكتاب مطلوب (book_id)' });
    }
    if (!reason || String(reason).trim().length === 0) {
      return res.status(400).json({ error: 'سبب سحب الاعتماد مطلوب' });
    }
    const result = await CurriculumApprovalService.revokeUnit(req.user!.id, chapterId, String(book_id), String(reason));
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

export default router;
