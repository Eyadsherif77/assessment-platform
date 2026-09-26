import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/db.js';
import { authenticateToken, requireRole, generateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { getMonthlyExamLimit, setMonthlyExamLimit } from '../services/examLimitService.js';

const router = Router();

// Hierarchy routes are restricted to staff roles (Admin, Central Admin, Governorate Admin, Supervisor)
router.use(authenticateToken);
router.use(requireRole(['ADMIN', 'CENTRAL_ADMIN', 'GOVERNORATE_ADMIN', 'GOVERNORATE_SUPERVISOR', 'SUPERVISOR']));

/**
 * 1. Meta information: Governorates, Subjects, Grades, and caller's allowed scope
 */
router.get('/meta', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;

    // 1. Fetch all 27 governorates cleanly grouped by name
    const govRes = await db.query(
      `SELECT MIN(id) as id, name_ar, MIN(name_en) as name_en 
       FROM governorates 
       GROUP BY name_ar 
       ORDER BY name_ar ASC`
    );

    // 2. Fetch distinct subjects (by name_ar) cleanly grouped
    const subRes = await db.query(
      `SELECT MIN(id) as id, name_ar, MIN(name_en) as name_en, MIN(code) as code, MAX(icon) as icon 
       FROM subjects 
       GROUP BY name_ar 
       ORDER BY MIN(sort_order) ASC, name_ar ASC`
    );

    // 3. Fetch all 12 grades with stage info
    const gradeRes = await db.query(
      `SELECT g.id, g.stage_id, g.code, g.name_ar, g.name_en, g.sort_order,
              s.name_ar as stage_name_ar, s.code as stage_code
       FROM grades g
       JOIN academic_stages s ON g.stage_id = s.id
       ORDER BY s.sort_order ASC, g.sort_order ASC`
    );

    // Determine scope
    const isMaster = user.role === 'ADMIN' || user.role === 'CENTRAL_ADMIN';
    const isGovAdmin = user.role === 'GOVERNORATE_ADMIN';
    const isSupervisor = user.role === 'SUPERVISOR';

    let lockedGovernorateId: string | null = null;
    let lockedGovernorateName: string | null = null;
    let lockedSubjectId: string | null = null;
    let lockedSubjectName: string | null = null;

    if (!isMaster) {
      lockedGovernorateId = user.governorateId || null;
      if (lockedGovernorateId) {
        const g = govRes.rows.find(row => row.id === lockedGovernorateId);
        lockedGovernorateName = g ? g.name_ar : null;
      }
    }

    if (isSupervisor) {
      lockedSubjectId = user.subjectId || null;
      if (lockedSubjectId) {
        const s = subRes.rows.find(row => row.id === lockedSubjectId);
        lockedSubjectName = s ? s.name_ar : null;
      }
    }

    return res.json({
      role: user.role,
      scope: {
        canFilterGovernorate: isMaster,
        canFilterSubject: isMaster || isGovAdmin,
        lockedGovernorateId,
        lockedGovernorateName,
        lockedSubjectId,
        lockedSubjectName
      },
      governorates: govRes.rows,
      subjects: subRes.rows,
      grades: gradeRes.rows,
      monthlyExamLimit: await getMonthlyExamLimit()
    });
  } catch (err: any) {
    console.error('Error in /api/hierarchy/meta:', err);
    return res.status(500).json({ error: 'خطأ في جلب البيانات الوصفية للهيكل الإداري: ' + err.message });
  }
});

/**
 * 2. Overview Statistics for caller's scope
 */
router.get('/stats', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const isMaster = user.role === 'ADMIN' || user.role === 'CENTRAL_ADMIN';
    const isGovAdmin = user.role === 'GOVERNORATE_ADMIN';
    const isSupervisor = user.role === 'SUPERVISOR';

    let examsCount = 0;
    let teachersCount = 0;
    let supervisorsCount = 0;
    let govAdminsCount = 0;
    let questionsCount = 0;

    if (isMaster) {
      const eRes = await db.query(`SELECT COUNT(*) as cnt FROM exams`);
      const tRes = await db.query(`SELECT COUNT(*) as cnt FROM users WHERE role = 'TEACHER'`);
      const sRes = await db.query(`SELECT COUNT(*) as cnt FROM users WHERE role = 'SUPERVISOR'`);
      const gRes = await db.query(`SELECT COUNT(*) as cnt FROM users WHERE role = 'GOVERNORATE_ADMIN'`);
      const qRes = await db.query(`SELECT COUNT(*) as cnt FROM exam_questions`);

      examsCount = Number(eRes.rows[0]?.cnt || 0);
      teachersCount = Number(tRes.rows[0]?.cnt || 0);
      supervisorsCount = Number(sRes.rows[0]?.cnt || 0);
      govAdminsCount = Number(gRes.rows[0]?.cnt || 0);
      questionsCount = Number(qRes.rows[0]?.cnt || 0);
    } else if (isGovAdmin) {
      const govId = user.governorateId;
      const eRes = await db.query(
        `SELECT COUNT(*) as cnt FROM exams e 
         LEFT JOIN users u ON e.teacher_id = u.id 
         WHERE e.governorate_id = $1 OR u.governorate_id = $1`,
        [govId]
      );
      const tRes = await db.query(
        `SELECT COUNT(*) as cnt FROM users WHERE role = 'TEACHER' AND governorate_id = $1`,
        [govId]
      );
      const sRes = await db.query(
        `SELECT COUNT(*) as cnt FROM users WHERE role = 'SUPERVISOR' AND governorate_id = $1`,
        [govId]
      );
      examsCount = Number(eRes.rows[0]?.cnt || 0);
      teachersCount = Number(tRes.rows[0]?.cnt || 0);
      supervisorsCount = Number(sRes.rows[0]?.cnt || 0);
    } else if (isSupervisor) {
      const govId = user.governorateId;
      const subId = user.subjectId;
      const eRes = await db.query(
        `SELECT COUNT(*) as cnt FROM exams e 
         LEFT JOIN users u ON e.teacher_id = u.id 
         WHERE (e.governorate_id = $1 OR u.governorate_id = $1) 
           AND (e.subject_id = $2 OR u.subject_id = $2)`,
        [govId, subId]
      );
      const tRes = await db.query(
        `SELECT COUNT(*) as cnt FROM users WHERE role = 'TEACHER' AND governorate_id = $1 AND (subject_id = $2 OR created_by = $3)`,
        [govId, subId, user.id]
      );
      examsCount = Number(eRes.rows[0]?.cnt || 0);
      teachersCount = Number(tRes.rows[0]?.cnt || 0);
    }

    return res.json({
      stats: {
        examsCount,
        teachersCount,
        supervisorsCount,
        govAdminsCount,
        questionsCount,
        monthlyExamLimit: await getMonthlyExamLimit()
      }
    });
  } catch (err: any) {
    console.error('Error in /api/hierarchy/stats:', err);
    return res.status(500).json({ error: 'خطأ في جلب إحصائيات الهيكل الإداري: ' + err.message });
  }
});

/**
 * 2.1 Get Monthly Exam Limit
 */
router.get('/monthly-exam-limit', async (req: AuthenticatedRequest, res) => {
  try {
    const limit = await getMonthlyExamLimit();
    return res.json({ limit });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب الحد الشهري للاختبارات' });
  }
});

/**
 * 2.2 Update Monthly Exam Limit (ADMIN & CENTRAL_ADMIN only)
 */
router.post('/monthly-exam-limit', requireRole(['ADMIN', 'CENTRAL_ADMIN']), async (req: AuthenticatedRequest, res) => {
  try {
    const { limit } = req.body;
    const numLimit = parseInt(limit, 10);
    if (isNaN(numLimit) || numLimit < 1) {
      return res.status(400).json({ error: 'الرجاء إدخال رقم صحيح موجب للحد الأقصى للاختبارات' });
    }
    const updatedLimit = await setMonthlyExamLimit(numLimit, req.user!.email);
    return res.json({
      success: true,
      limit: updatedLimit,
      message: `تم ضبط وتحديث الحد الأقصى للاختبارات شهرياً بنجاح إلى ${updatedLimit} اختباراً لكل طالب.`
    });
  } catch (err: any) {
    console.error('Error updating monthly exam limit:', err);
    return res.status(500).json({ error: 'خطأ في تحديث الحد الشهري للاختبارات' });
  }
});

/**
 * 3. Exams List with Cascading Filters (Governorate -> Subject -> Exams)
 * Everything clickable!
 */
router.get('/exams', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const isMaster = user.role === 'ADMIN' || user.role === 'CENTRAL_ADMIN';
    const isGovAdmin = user.role === 'GOVERNORATE_ADMIN';
    const isSupervisor = user.role === 'SUPERVISOR';

    const reqGov = req.query.governorate_id as string;
    const reqSub = req.query.subject_id as string;
    const reqGrade = req.query.grade_id as string;
    const search = (req.query.search as string || '').trim();

    let sql = `
      SELECT 
        e.id, 
        e.title_ar, 
        e.title_en, 
        e.duration_minutes, 
        e.is_published, 
        e.school_type,
        e.created_at,
        u.id as teacher_id,
        u.full_name as teacher_name,
        COALESCE(e.governorate_id, u.governorate_id) as effective_gov_id,
        g.name_ar as governorate_name,
        s.id as subject_id,
        s.name_ar as subject_name_ar,
        s.code as subject_code,
        gr.name_ar as grade_name_ar,
        st.name_ar as stage_name_ar,
        (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) as questions_count,
        (SELECT COUNT(*) FROM exam_attempts ea WHERE ea.exam_id = e.id) as submissions_count,
        (SELECT ROUND(AVG(ea.score), 1) FROM exam_attempts ea WHERE ea.exam_id = e.id) as avg_score
      FROM exams e
      JOIN users u ON e.teacher_id = u.id
      JOIN subjects s ON e.subject_id = s.id
      JOIN grades gr ON e.grade_id = gr.id
      JOIN academic_stages st ON e.academic_stage_id = st.id
      LEFT JOIN governorates g ON (e.governorate_id = g.id OR u.governorate_id = g.id)
    `;

    const conditions: string[] = [];
    const params: any[] = [];

    // Scope restrictions
    if (isGovAdmin) {
      params.push(user.governorateId);
      conditions.push(`(e.governorate_id = $${params.length} OR u.governorate_id = $${params.length})`);
    } else if (isSupervisor) {
      params.push(user.governorateId);
      conditions.push(`(e.governorate_id = $${params.length} OR u.governorate_id = $${params.length})`);

      params.push(user.subjectId);
      conditions.push(`(e.subject_id = $${params.length} OR u.subject_id = $${params.length})`);
    } else if (isMaster) {
      if (reqGov && reqGov !== 'ALL') {
        params.push(reqGov);
        conditions.push(`(e.governorate_id = $${params.length} OR u.governorate_id = $${params.length})`);
      }
    }

    // Subject filter for Master or GovAdmin
    if ((isMaster || isGovAdmin) && reqSub && reqSub !== 'ALL') {
      params.push(reqSub);
      conditions.push(`e.subject_id = $${params.length}`);
    }

    // Grade filter for any supervisory role
    if (reqGrade && reqGrade !== 'ALL') {
      params.push(reqGrade);
      conditions.push(`e.grade_id = $${params.length}`);
    }

    // Search query
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(e.title_ar LIKE $${params.length} OR u.full_name LIKE $${params.length})`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY e.created_at DESC LIMIT 200';

    const result = await db.query(sql, params);
    return res.json({ exams: result.rows });
  } catch (err: any) {
    console.error('Error in /api/hierarchy/exams:', err);
    return res.status(500).json({ error: 'خطأ في جلب اختبارات الهيكل الإداري: ' + err.message });
  }
});

/**
 * 4. Clickable Exam Inspector - View full questions, options, solution key
 */
router.get('/exams/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const examRes = await db.query(
      `SELECT 
        e.*, 
        u.full_name as teacher_name, 
        u.email as teacher_email,
        g.name_ar as governorate_name,
        s.name_ar as subject_name_ar,
        gr.name_ar as grade_name_ar,
        st.name_ar as stage_name_ar,
        (SELECT COUNT(*) FROM exam_attempts ea WHERE ea.exam_id = e.id) as submissions_count,
        (SELECT ROUND(AVG(ea.score), 1) FROM exam_attempts ea WHERE ea.exam_id = e.id) as avg_score
       FROM exams e
       JOIN users u ON e.teacher_id = u.id
       JOIN subjects s ON e.subject_id = s.id
       JOIN grades gr ON e.grade_id = gr.id
       JOIN academic_stages st ON e.academic_stage_id = st.id
       LEFT JOIN governorates g ON (e.governorate_id = g.id OR u.governorate_id = g.id)
       WHERE e.id = $1`,
      [id]
    );

    if (examRes.rows.length === 0) {
      return res.status(404).json({ error: 'الاختبار غير موجود' });
    }

    const exam = examRes.rows[0];

    // Fetch questions and options
    const qRes = await db.query(
      `SELECT eq.id, eq.question_text, eq.question_type, eq.points, eq.explanation, eq.order_index
       FROM exam_questions eq
       WHERE eq.exam_id = $1
       ORDER BY eq.order_index ASC`,
      [id]
    );

    const questions = [];
    for (const q of qRes.rows) {
      const optRes = await db.query(
        `SELECT id, option_text, is_correct 
         FROM exam_question_options 
         WHERE question_id = $1`,
        [q.id]
      );
      questions.push({
        ...q,
        options: optRes.rows
      });
    }

    return res.json({
      exam,
      questions
    });
  } catch (err: any) {
    console.error('Error inspecting exam:', err);
    return res.status(500).json({ error: 'خطأ في استعراض تفاصيل الاختبار: ' + err.message });
  }
});

/**
 * 5. Subordinates Management (Cascading Downward Visibility)
 * - ADMIN -> sees CENTRAL_ADMIN, GOVERNORATE_ADMIN, GOVERNORATE_SUPERVISOR, SUPERVISOR, TEACHER
 * - CENTRAL_ADMIN -> sees GOVERNORATE_ADMIN, GOVERNORATE_SUPERVISOR, SUPERVISOR, TEACHER
 * - GOVERNORATE_ADMIN -> sees GOVERNORATE_SUPERVISOR, SUPERVISOR, TEACHER in their governorate
 * - SUPERVISOR -> sees TEACHER in their subject & governorate
 */
router.get('/subordinates', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const filterRole = (req.query.role as string || '').trim().toUpperCase();
    const filterGrade = (req.query.grade_id as string || '').trim();
    const params: any[] = [];
    const conditions: string[] = [];

    // Determine allowed subordinate roles based on hierarchy tier
    let allowedRoles: string[] = [];
    if (user.role === 'ADMIN') {
      allowedRoles = ['CENTRAL_ADMIN', 'GOVERNORATE_ADMIN', 'GOVERNORATE_SUPERVISOR', 'SUPERVISOR', 'TEACHER'];
    } else if (user.role === 'CENTRAL_ADMIN') {
      allowedRoles = ['GOVERNORATE_ADMIN', 'GOVERNORATE_SUPERVISOR', 'SUPERVISOR', 'TEACHER'];
    } else if (user.role === 'GOVERNORATE_ADMIN') {
      allowedRoles = ['GOVERNORATE_SUPERVISOR', 'SUPERVISOR', 'TEACHER'];
      if (user.governorateId) {
        params.push(user.governorateId);
        conditions.push(`u.governorate_id = $${params.length}`);
      }
    } else if (user.role === 'SUPERVISOR') {
      allowedRoles = ['TEACHER'];
      if (user.governorateId) {
        params.push(user.governorateId);
        conditions.push(`u.governorate_id = $${params.length}`);
      }
      if (user.subjectId) {
        params.push(user.subjectId);
        conditions.push(`(u.subject_id = $${params.length} OR u.created_by = '${user.id}')`);
      }
    } else {
      allowedRoles = [];
    }

    if (filterRole && filterRole !== 'ALL' && allowedRoles.includes(filterRole)) {
      params.push(filterRole);
      conditions.push(`u.role = $${params.length}`);
    } else {
      if (allowedRoles.length > 0) {
        const placeholders = allowedRoles.map(r => {
          params.push(r);
          return `$${params.length}`;
        }).join(', ');
        conditions.push(`u.role IN (${placeholders})`);
      } else {
        conditions.push('1 = 0');
      }
    }

    // Filter by grade_id if provided (applies to teachers and exams)
    if (filterGrade && filterGrade !== 'ALL') {
      params.push(filterGrade);
      const gradeParam = params.length;
      conditions.push(`(
        u.role != 'TEACHER' OR 
        EXISTS (SELECT 1 FROM exams e WHERE e.teacher_id = u.id AND e.grade_id = $${gradeParam}) OR
        tp.specialization LIKE '%' || (SELECT name_ar FROM grades WHERE id = $${gradeParam}) || '%'
      )`);
    }

    const sql = `
      SELECT 
        u.id, 
        u.email, 
        u.username, 
        u.full_name, 
        u.role, 
        u.is_active, 
        u.permissions, 
        u.governorate_id, 
        u.subject_id, 
        u.created_by,
        u.created_at,
        g.name_ar as governorate_name,
        s.name_ar as subject_name_ar,
        tp.school_name,
        tp.specialization,
        (SELECT COUNT(*) FROM exams e WHERE e.teacher_id = u.id) as exams_count,
        (SELECT COUNT(*) FROM users sub WHERE sub.created_by = u.id) as subordinates_count
      FROM users u
      LEFT JOIN governorates g ON u.governorate_id = g.id
      LEFT JOIN subjects s ON u.subject_id = s.id
      LEFT JOIN teacher_profiles tp ON u.id = tp.user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY u.created_at DESC
    `;

    const result = await db.query(sql, params);

    const subordinates = result.rows.map(row => {
      let parsedPerms = {
        can_view_exams: true,
        can_create_subordinates: true,
        can_edit_permissions: true,
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
        email: row.email,
        username: row.username,
        fullName: row.full_name,
        role: row.role,
        isActive: row.is_active !== 0,
        governorateId: row.governorate_id,
        governorateName: row.governorate_name,
        subjectId: row.subject_id,
        subjectName: row.subject_name_ar,
        schoolName: row.school_name,
        specialization: row.specialization,
        examsCount: Number(row.exams_count || 0),
        subordinatesCount: Number(row.subordinates_count || 0),
        permissions: parsedPerms,
        createdAt: row.created_at
      };
    });

    return res.json({ allowedRoles, subordinates });
  } catch (err: any) {
    console.error('Error fetching subordinates:', err);
    return res.status(500).json({ error: 'خطأ في جلب المرؤوسين: ' + err.message });
  }
});

/**
 * 6. Create Subordinate Account
 * Multi-tier cascading provisioning:
 * - ADMIN creates: CENTRAL_ADMIN, GOVERNORATE_ADMIN, GOVERNORATE_SUPERVISOR, SUPERVISOR, TEACHER
 * - CENTRAL_ADMIN creates: GOVERNORATE_ADMIN, GOVERNORATE_SUPERVISOR, SUPERVISOR, TEACHER
 * - GOVERNORATE_ADMIN creates: GOVERNORATE_SUPERVISOR, SUPERVISOR, TEACHER (locked to governorate)
 * - SUPERVISOR creates: TEACHER (locked to governorate & subject)
 */
router.post('/subordinates', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const {
      fullName,
      email,
      username,
      password,
      governorateId,
      subjectId,
      schoolName,
      specialization,
      permissions
    } = req.body;

    const requestedRole = (req.body.targetRole || req.body.role || '').trim().toUpperCase();

    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'الاسم بالكامل والبريد الإلكتروني وكلمة المرور مطلوبة' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = (username || fullName).trim();

    // Check unique email
    const emailCheck = await db.query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'البريد الإلكتروني مسجل بالفعل' });
    }

    let targetRole: string = '';
    let assignedGovId: string | null = null;
    let assignedSubId: string | null = null;

    if (user.role === 'ADMIN') {
      const allowed = ['CENTRAL_ADMIN', 'GOVERNORATE_ADMIN', 'GOVERNORATE_SUPERVISOR', 'SUPERVISOR', 'TEACHER'];
      targetRole = allowed.includes(requestedRole) ? requestedRole : 'CENTRAL_ADMIN';
      assignedGovId = governorateId || null;
      assignedSubId = subjectId || null;
    } else if (user.role === 'CENTRAL_ADMIN') {
      const allowed = ['GOVERNORATE_ADMIN', 'GOVERNORATE_SUPERVISOR', 'SUPERVISOR', 'TEACHER'];
      targetRole = allowed.includes(requestedRole) ? requestedRole : 'GOVERNORATE_ADMIN';
      if ((targetRole === 'GOVERNORATE_ADMIN' || targetRole === 'GOVERNORATE_SUPERVISOR') && !governorateId) {
        return res.status(400).json({ error: 'يجب اختيار المحافظة التابع لها المستخدم' });
      }
      if ((targetRole === 'SUPERVISOR' || targetRole === 'TEACHER') && (!governorateId || !subjectId)) {
        return res.status(400).json({ error: 'يجب اختيار المحافظة والمادة التابع لها المستخدم' });
      }
      assignedGovId = governorateId || null;
      assignedSubId = subjectId || null;
    } else if (user.role === 'GOVERNORATE_ADMIN') {
      const allowed = ['GOVERNORATE_SUPERVISOR', 'SUPERVISOR', 'TEACHER'];
      targetRole = allowed.includes(requestedRole) ? requestedRole : 'GOVERNORATE_SUPERVISOR';
      assignedGovId = user.governorateId || governorateId || null;
      if ((targetRole === 'SUPERVISOR' || targetRole === 'TEACHER') && !subjectId) {
        return res.status(400).json({ error: 'يجب اختيار المادة المسندة' });
      }
      assignedSubId = subjectId || null;
    } else if (user.role === 'SUPERVISOR') {
      targetRole = 'TEACHER';
      assignedGovId = user.governorateId || null;
      assignedSubId = user.subjectId || subjectId || null;
    } else {
      return res.status(403).json({ error: 'غير مصرح لك بإنشاء مستخدمين' });
    }

    const newUserId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    const defaultPerms = {
      can_view_exams: true,
      can_create_subordinates: true,
      can_edit_permissions: true,
      can_upload_books: true,
      can_create_exams: true,
      is_active: true,
      ...(permissions || {})
    };

    const activeFlag = defaultPerms.is_active !== false ? 1 : 0;
    const hybridId = `HYB-${targetRole.substring(0, 3)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    await db.query(
      `INSERT INTO users (
        id, hybrid_id, email, username, password_hash, role, full_name, 
        governorate_id, subject_id, created_by, permissions, initial_password, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        newUserId,
        hybridId,
        cleanEmail,
        cleanUsername,
        passwordHash,
        targetRole,
        fullName.trim(),
        assignedGovId,
        assignedSubId,
        user.id,
        JSON.stringify(defaultPerms),
        password.trim(),
        activeFlag
      ]
    );

    // If teacher, create profile
    if (targetRole === 'TEACHER') {
      await db.query(
        `INSERT INTO teacher_profiles (user_id, full_name, school_name, specialization, governorate_id, subject_id, supervisor_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          newUserId,
          fullName.trim(),
          schoolName || null,
          specialization || null,
          assignedGovId,
          assignedSubId,
          user.id
        ]
      );
    }

    return res.status(201).json({
      message: 'تم إنشاء الحساب بنجاح ضمن الهيكل الإداري',
      user: {
        id: newUserId,
        email: cleanEmail,
        username: cleanUsername,
        fullName: fullName.trim(),
        role: targetRole,
        governorateId: assignedGovId,
        subjectId: assignedSubId,
        initialPassword: password.trim(),
        permissions: defaultPerms
      }
    });
  } catch (err: any) {
    console.error('Error creating subordinate:', err);
    return res.status(500).json({ error: 'خطأ في إنشاء الحساب التابع: ' + err.message });
  }
});

/**
 * 7. Toggle Permissions or Active Status of Subordinate
 */
router.patch('/subordinates/:id/permissions', async (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.user!;
    const { id } = req.params;
    const { permissions, is_active } = req.body;

    const subCheck = await db.query(
      `SELECT id, role, permissions, is_active, created_by, governorate_id FROM users WHERE id = $1`,
      [id]
    );

    if (subCheck.rows.length === 0) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const sub = subCheck.rows[0];

    // Hierarchy authorization check:
    // ADMIN can edit CENTRAL_ADMIN
    // CENTRAL_ADMIN can edit GOVERNORATE_ADMIN
    // GOVERNORATE_ADMIN can edit SUPERVISOR in their governorate
    // SUPERVISOR can edit TEACHER in their subject/governorate
    let authorized = false;
    if (caller.role === 'ADMIN') authorized = true;
    if (caller.role === 'CENTRAL_ADMIN' && ['GOVERNORATE_ADMIN', 'GOVERNORATE_SUPERVISOR', 'SUPERVISOR', 'TEACHER'].includes(sub.role)) authorized = true;
    if (caller.role === 'GOVERNORATE_ADMIN' && ['GOVERNORATE_SUPERVISOR', 'SUPERVISOR', 'TEACHER'].includes(sub.role) && (!sub.governorate_id || sub.governorate_id === caller.governorateId)) authorized = true;
    if (caller.role === 'SUPERVISOR' && sub.role === 'TEACHER' && (sub.created_by === caller.id || sub.governorate_id === caller.governorateId)) authorized = true;

    // Super Admin can always edit any staff
    if (caller.role === 'ADMIN') authorized = true;

    if (!authorized) {
      return res.status(403).json({ error: 'غير مصرح لك بتعديل صلاحيات هذا المستخدم وفقاً للهيكل الإداري' });
    }

    let currentPerms: any = {
      can_view_exams: true,
      can_create_subordinates: true,
      can_edit_permissions: true,
      is_active: sub.is_active !== 0
    };

    if (sub.permissions) {
      try {
        const p = typeof sub.permissions === 'string' ? JSON.parse(sub.permissions) : sub.permissions;
        currentPerms = { ...currentPerms, ...p };
      } catch (_) {}
    }

    const updatedPerms = {
      ...currentPerms,
      ...(permissions || {})
    };

    let newActiveFlag = sub.is_active;
    if (is_active !== undefined) {
      newActiveFlag = is_active ? 1 : 0;
      updatedPerms.is_active = Boolean(is_active);
    } else if (permissions?.is_active !== undefined) {
      newActiveFlag = permissions.is_active ? 1 : 0;
    }

    await db.query(
      `UPDATE users SET permissions = $1, is_active = $2, updated_at = NOW() WHERE id = $3`,
      [JSON.stringify(updatedPerms), newActiveFlag, id]
    );

    return res.json({
      message: 'تم تحديث الصلاحيات بنجاح',
      permissions: updatedPerms,
      isActive: newActiveFlag !== 0
    });
  } catch (err: any) {
    console.error('Error updating permissions:', err);
    return res.status(500).json({ error: 'خطأ في تحديث الصلاحيات: ' + err.message });
  }
});

/**
 * 8. Impersonate Hierarchy Subordinate
 * Allows higher supervisory ranks to instantly step into subordinate accounts
 */
router.post('/impersonate/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.user!;
    const { id } = req.params;

    const userRes = await db.query(
      `SELECT u.id, u.super_id, u.hybrid_id, u.email, u.username, u.full_name, u.role, 
              u.permissions, u.is_active, u.governorate_id, u.subject_id, u.created_by,
              g.name_ar as governorate_name, s.name_ar as subject_name
       FROM users u
       LEFT JOIN governorates g ON u.governorate_id = g.id
       LEFT JOIN subjects s ON u.subject_id = s.id
       WHERE u.id = $1`,
      [id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const target = userRes.rows[0];

    // Check authority:
    let authorized = false;
    if (caller.role === 'ADMIN') authorized = true;
    if (caller.role === 'CENTRAL_ADMIN' && ['GOVERNORATE_ADMIN', 'GOVERNORATE_SUPERVISOR', 'SUPERVISOR', 'TEACHER'].includes(target.role)) authorized = true;
    if (caller.role === 'GOVERNORATE_ADMIN' && ['GOVERNORATE_SUPERVISOR', 'SUPERVISOR', 'TEACHER'].includes(target.role) && (!target.governorate_id || target.governorate_id === caller.governorateId)) authorized = true;
    if (caller.role === 'SUPERVISOR' && target.role === 'TEACHER' && (target.created_by === caller.id || target.governorate_id === caller.governorateId)) authorized = true;

    if (!authorized) {
      return res.status(403).json({ error: 'غير مصرح لك بالدخول إلى حساب هذا المستخدم وفقاً للهيكل الإداري' });
    }

    let permissionsObj = null;
    if (target.permissions) {
      try {
        permissionsObj = typeof target.permissions === 'string' ? JSON.parse(target.permissions) : target.permissions;
      } catch (_) {}
    }

    let profileData: any = null;
    if (target.role === 'TEACHER') {
      const tp = await db.query(`SELECT * FROM teacher_profiles WHERE user_id = $1`, [target.id]);
      profileData = tp.rows[0] || null;
    }

    const impersonationToken = generateToken({
      id: target.id,
      email: target.email,
      role: target.role,
      fullName: target.full_name,
      governorateId: target.governorate_id || undefined,
      subjectId: target.subject_id || undefined,
      permissions: permissionsObj || undefined
    });

    return res.json({
      message: `تم الدخول بنجاح إلى حساب: ${target.full_name}`,
      token: impersonationToken,
      user: {
        id: target.id,
        super_id: target.super_id || null,
        hybrid_id: target.hybrid_id || null,
        email: target.email,
        username: target.username || null,
        role: target.role,
        fullName: target.full_name,
        governorate_id: target.governorate_id || null,
        governorate_name: target.governorate_name || null,
        subject_id: target.subject_id || null,
        subject_name: target.subject_name || null,
        permissions: permissionsObj,
        profile: profileData
      }
    });
  } catch (err: any) {
    console.error('Error impersonating hierarchy user:', err);
    return res.status(500).json({ error: 'خطأ أثناء محاولة الدخول للحساب: ' + err.message });
  }
});

/**
 * 8. Supervisory Analysis: Exams activity and student performance for subordinates
 * - CENTRAL_ADMIN: Analyzes all 27 governorates / Governorate Admins (monthly & weekly)
 * - GOVERNORATE_ADMIN: Analyzes Supervisors in his governorate across subjects (monthly & weekly)
 * - SUPERVISOR: Analyzes Teachers in his subject and governorate (monthly & weekly)
 */
router.get('/supervisory-analysis', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const isMaster = user.role === 'ADMIN' || user.role === 'CENTRAL_ADMIN';
    const isGovAdmin = user.role === 'GOVERNORATE_ADMIN';
    const isSupervisor = user.role === 'SUPERVISOR';

    const timeframe = (req.query.timeframe as string) === 'weekly' ? 'weekly' : 'monthly';
    const reqGov = req.query.governorate_id as string;
    const reqSub = req.query.subject_id as string;

    // Determine effective governorate and subject
    let effectiveGovId: string | null = null;
    let effectiveSubId: string | null = null;

    if (isGovAdmin || isSupervisor) {
      effectiveGovId = user.governorateId || null;
    } else if (isMaster && reqGov && reqGov !== 'ALL') {
      effectiveGovId = reqGov;
    }

    if (isSupervisor) {
      effectiveSubId = user.subjectId || null;
    } else if (reqSub && reqSub !== 'ALL') {
      effectiveSubId = reqSub;
    }

    // 1. Fetch reference governorates and subjects
    const govRes = await db.query(
      `SELECT MIN(id) as id, name_ar, MIN(name_en) as name_en 
       FROM governorates 
       GROUP BY name_ar 
       ORDER BY name_ar ASC`
    );
    const subRes = await db.query(
      `SELECT MIN(id) as id, name_ar, MIN(name_en) as name_en, MIN(code) as code 
       FROM subjects 
       GROUP BY name_ar 
       ORDER BY MIN(sort_order) ASC, name_ar ASC`
    );

    const allGovs = govRes.rows;
    const allSubjects = subRes.rows;

    // 2. Fetch all teacher exams with teacher & subject information
    const examsRes = await db.query(
      `SELECT 
        e.id, e.title_ar, e.created_at, e.subject_id, e.teacher_id, e.is_published,
        COALESCE(e.governorate_id, u.governorate_id) as governorate_id,
        u.full_name as teacher_name,
        u.email as teacher_email,
        s.name_ar as subject_name_ar,
        g.name_ar as governorate_name,
        'TEACHER_EXAM' as exam_source
       FROM exams e
       LEFT JOIN users u ON e.teacher_id = u.id
       LEFT JOIN subjects s ON e.subject_id = s.id
       LEFT JOIN governorates g ON (e.governorate_id = g.id OR u.governorate_id = g.id)`
    );

    // 3. Fetch all exam attempts with score and exam_id
    const attemptsRes = await db.query(
      `SELECT ea.id, ea.exam_id, ea.score, ea.total_points, ea.status, ea.completed_at, ea.started_at 
       FROM exam_attempts ea`
    );

    // Map attempts by exam_id
    const attemptsByExam: { [examId: string]: any[] } = {};
    attemptsRes.rows.forEach((att: any) => {
      if (!attemptsByExam[att.exam_id]) attemptsByExam[att.exam_id] = [];
      attemptsByExam[att.exam_id].push(att);
    });

    // 4. Fetch all AI Generated Assessments from ai_evaluations
    const aiEvalsRes = await db.query(
      `SELECT 
        ae.id,
        ae.score,
        ae.total_questions,
        ae.created_at,
        ae.subject_id,
        b.teacher_id,
        COALESCE(sp.governorate_id, su.governorate_id, tu.governorate_id) as governorate_id,
        tu.full_name as teacher_name,
        tu.email as teacher_email,
        s.name_ar as subject_name_ar,
        g.name_ar as governorate_name,
        'AI_GENERATED' as exam_source
       FROM ai_evaluations ae
       LEFT JOIN books b ON ae.book_id = b.id
       LEFT JOIN student_profiles sp ON ae.student_id = sp.user_id
       LEFT JOIN users su ON ae.student_id = su.id
       LEFT JOIN users tu ON b.teacher_id = tu.id
       LEFT JOIN subjects s ON ae.subject_id = s.id
       LEFT JOIN governorates g ON (COALESCE(sp.governorate_id, su.governorate_id, tu.governorate_id) = g.id)`
    );

    // 5. Timeframe calculations (Monthly vs Weekly)
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfCurrentWeek = new Date(now);
    startOfCurrentWeek.setDate(now.getDate() - 7);
    startOfCurrentWeek.setHours(0, 0, 0, 0);

    const cutoffDate = timeframe === 'weekly' ? startOfCurrentWeek : startOfCurrentMonth;

    // Filter teacher exams within caller's overarching scope
    const scopedTeacherExams = examsRes.rows.filter((ex: any) => {
      if (effectiveGovId && ex.governorate_id !== effectiveGovId) return false;
      if (effectiveSubId && ex.subject_id !== effectiveSubId) return false;
      return true;
    });

    // Filter AI generated assessments within caller's overarching scope
    const scopedAiEvals = aiEvalsRes.rows.filter((ev: any) => {
      if (effectiveGovId && ev.governorate_id !== effectiveGovId) return false;
      if (effectiveSubId && ev.subject_id !== effectiveSubId) return false;
      return true;
    });

    const periodTeacherExams = scopedTeacherExams.filter((ex: any) => {
      const d = new Date(ex.created_at || now);
      return d >= cutoffDate;
    });

    const periodAiEvals = scopedAiEvals.filter((ev: any) => {
      const d = new Date(ev.created_at || now);
      return d >= cutoffDate;
    });

    // Combined overall KPIs in period
    let totalAttemptsCount = 0;
    let totalScoreSum = 0;
    let passingAttemptsCount = 0;
    let teacherAttemptsCount = 0;

    // A) Process teacher exam attempts
    periodTeacherExams.forEach((ex: any) => {
      const atts = attemptsByExam[ex.id] || [];
      atts.forEach((a: any) => {
        totalAttemptsCount++;
        teacherAttemptsCount++;
        const totalPts = Number(a.total_points) || 0;
        const rawScore = Number(a.score) || 0;
        const scorePct = totalPts > 0 ? (rawScore / totalPts) * 100 : rawScore;
        totalScoreSum += scorePct;
        if (scorePct >= 50) passingAttemptsCount++;
      });
    });

    // B) Process AI generated evaluations (each evaluation is a completed student attempt)
    periodAiEvals.forEach((ev: any) => {
      totalAttemptsCount++;
      const totalQ = Number(ev.total_questions) || 0;
      const rawSc = Number(ev.score) || 0;
      const scorePct = totalQ > 0 ? (rawSc / totalQ) * 100 : (rawSc <= 5 ? rawSc * 20 : rawSc);
      totalScoreSum += scorePct;
      if (scorePct >= 50) passingAttemptsCount++;
    });

    const averageScore = totalAttemptsCount > 0 ? Math.round((totalScoreSum / totalAttemptsCount) * 10) / 10 : 0;
    const passRate = totalAttemptsCount > 0 ? Math.round((passingAttemptsCount / totalAttemptsCount) * 100) : 0;

    // 6. Build Subordinates Analysis based on Caller's Role
    let subordinatesAnalysis: any[] = [];

    if (isMaster) {
      // Caller is ADMIN or CENTRAL_ADMIN: Analyze each of the 27 Governorates
      const govAdminsRes = await db.query(
        `SELECT id, full_name, email, governorate_id, is_active FROM users WHERE role = 'GOVERNORATE_ADMIN'`
      );
      const govAdminsByGovId: { [govId: string]: any } = {};
      govAdminsRes.rows.forEach((ga: any) => {
        if (ga.governorate_id) govAdminsByGovId[ga.governorate_id] = ga;
      });

      const targetGovs = (effectiveGovId && effectiveGovId !== 'ALL')
        ? allGovs.filter(g => g.id === effectiveGovId)
        : allGovs;

      subordinatesAnalysis = targetGovs.map(gov => {
        const adminUser = govAdminsByGovId[gov.id];
        const govTeacherExams = scopedTeacherExams.filter(e => e.governorate_id === gov.id);
        const govPeriodTeacherExams = govTeacherExams.filter(e => new Date(e.created_at || now) >= cutoffDate);
        const govAiEvals = scopedAiEvals.filter(e => e.governorate_id === gov.id);
        const govPeriodAiEvals = govAiEvals.filter(e => new Date(e.created_at || now) >= cutoffDate);

        let govAttempts = 0;
        let govScoreSum = 0;
        let govPassing = 0;
        const activeTeachersSet = new Set<string>();

        // Teacher exams
        govPeriodTeacherExams.forEach(e => {
          if (e.teacher_id) activeTeachersSet.add(e.teacher_id);
          const atts = attemptsByExam[e.id] || [];
          atts.forEach(a => {
            govAttempts++;
            const totalPts = Number(a.total_points) || 0;
            const raw = Number(a.score) || 0;
            const pct = totalPts > 0 ? (raw / totalPts) * 100 : raw;
            govScoreSum += pct;
            if (pct >= 50) govPassing++;
          });
        });

        // AI evaluations
        govPeriodAiEvals.forEach(ev => {
          if (ev.teacher_id) activeTeachersSet.add(ev.teacher_id);
          govAttempts++;
          const tQ = Number(ev.total_questions) || 0;
          const rS = Number(ev.score) || 0;
          const pct = tQ > 0 ? (rS / tQ) * 100 : (rS <= 5 ? rS * 20 : rS);
          govScoreSum += pct;
          if (pct >= 50) govPassing++;
        });

        const govAvgScore = govAttempts > 0 ? Math.round((govScoreSum / govAttempts) * 10) / 10 : 0;
        const govPassRate = govAttempts > 0 ? Math.round((govPassing / govAttempts) * 100) : 0;

        return {
          id: gov.id,
          targetType: 'GOVERNORATE',
          title: `محافظة ${gov.name_ar}`,
          titleEn: gov.name_en || gov.name_ar,
          governorateId: gov.id,
          governorateName: gov.name_ar,
          subordinateName: adminUser ? adminUser.full_name : 'لم يتم التعيين بعد',
          subordinateEmail: adminUser ? adminUser.email : null,
          subordinateId: adminUser ? adminUser.id : null,
          hasAssignedUser: Boolean(adminUser),
          totalExams: govPeriodTeacherExams.length + govPeriodAiEvals.length,
          teacherExams: govPeriodTeacherExams.length,
          generatedExams: govPeriodAiEvals.length,
          lifetimeExams: govTeacherExams.length + govAiEvals.length,
          totalAttempts: govAttempts,
          averageScore: govAvgScore,
          passRate: govPassRate,
          activeStaffCount: activeTeachersSet.size,
          status: govAvgScore >= 75 ? 'EXCELLENT' : (govAvgScore >= 50 ? 'GOOD' : 'NEEDS_SUPPORT')
        };
      });

    } else if (isGovAdmin) {
      // Caller is GOVERNORATE_ADMIN: Analyze Supervisors across subjects in his governorate
      const myGovId = user.governorateId;
      const supervisorsRes = await db.query(
        `SELECT id, full_name, email, subject_id, is_active FROM users WHERE role = 'SUPERVISOR' AND governorate_id = $1`,
        [myGovId]
      );
      const supervisorsBySubId: { [subId: string]: any } = {};
      supervisorsRes.rows.forEach((s: any) => {
        if (s.subject_id) supervisorsBySubId[s.subject_id] = s;
      });

      const targetSubjects = (effectiveSubId && effectiveSubId !== 'ALL')
        ? allSubjects.filter(s => s.id === effectiveSubId)
        : allSubjects;

      subordinatesAnalysis = targetSubjects.map(sub => {
        const supervisorUser = supervisorsBySubId[sub.id];
        const subTeacherExams = scopedTeacherExams.filter(e => e.subject_id === sub.id && e.governorate_id === myGovId);
        const subPeriodTeacherExams = subTeacherExams.filter(e => new Date(e.created_at || now) >= cutoffDate);
        const subAiEvals = scopedAiEvals.filter(e => e.subject_id === sub.id && e.governorate_id === myGovId);
        const subPeriodAiEvals = subAiEvals.filter(e => new Date(e.created_at || now) >= cutoffDate);

        let subAttempts = 0;
        let subScoreSum = 0;
        let subPassing = 0;
        const activeTeachersSet = new Set<string>();

        // Teacher exams
        subPeriodTeacherExams.forEach(e => {
          if (e.teacher_id) activeTeachersSet.add(e.teacher_id);
          const atts = attemptsByExam[e.id] || [];
          atts.forEach(a => {
            subAttempts++;
            const totalPts = Number(a.total_points) || 0;
            const raw = Number(a.score) || 0;
            const pct = totalPts > 0 ? (raw / totalPts) * 100 : raw;
            subScoreSum += pct;
            if (pct >= 50) subPassing++;
          });
        });

        // AI evaluations
        subPeriodAiEvals.forEach(ev => {
          if (ev.teacher_id) activeTeachersSet.add(ev.teacher_id);
          subAttempts++;
          const tQ = Number(ev.total_questions) || 0;
          const rS = Number(ev.score) || 0;
          const pct = tQ > 0 ? (rS / tQ) * 100 : (rS <= 5 ? rS * 20 : rS);
          subScoreSum += pct;
          if (pct >= 50) subPassing++;
        });

        const subAvgScore = subAttempts > 0 ? Math.round((subScoreSum / subAttempts) * 10) / 10 : 0;
        const subPassRate = subAttempts > 0 ? Math.round((subPassing / subAttempts) * 100) : 0;

        return {
          id: sub.id,
          targetType: 'SUBJECT_SUPERVISOR',
          title: `مادة ${sub.name_ar}`,
          titleEn: sub.name_en || sub.name_ar,
          subjectId: sub.id,
          subjectName: sub.name_ar,
          governorateId: myGovId,
          governorateName: allGovs.find((g: any) => g.id === myGovId)?.name_ar || 'المحافظة',
          subordinateName: supervisorUser ? supervisorUser.full_name : 'لم يتم التعيين بعد',
          subordinateEmail: supervisorUser ? supervisorUser.email : null,
          subordinateId: supervisorUser ? supervisorUser.id : null,
          hasAssignedUser: Boolean(supervisorUser),
          totalExams: subPeriodTeacherExams.length + subPeriodAiEvals.length,
          teacherExams: subPeriodTeacherExams.length,
          generatedExams: subPeriodAiEvals.length,
          lifetimeExams: subTeacherExams.length + subAiEvals.length,
          totalAttempts: subAttempts,
          averageScore: subAvgScore,
          passRate: subPassRate,
          activeStaffCount: activeTeachersSet.size,
          status: subAvgScore >= 75 ? 'EXCELLENT' : (subAvgScore >= 50 ? 'GOOD' : 'NEEDS_SUPPORT')
        };
      });

    } else if (isSupervisor) {
      // Caller is SUPERVISOR: Analyze Teachers in his subject and governorate
      const myGovId = user.governorateId;
      const mySubId = user.subjectId;

      const teachersRes = await db.query(
        `SELECT u.id, u.full_name, u.email, tp.school_name 
         FROM users u
         LEFT JOIN teacher_profiles tp ON u.id = tp.user_id
         WHERE u.role = 'TEACHER' AND u.governorate_id = $1 AND (u.subject_id = $2 OR u.created_by = $3)`,
        [myGovId, mySubId, user.id]
      );

      subordinatesAnalysis = teachersRes.rows.map(teacher => {
        const teacherExams = scopedTeacherExams.filter(e => e.teacher_id === teacher.id);
        const teacherPeriodExams = teacherExams.filter(e => new Date(e.created_at || now) >= cutoffDate);
        const teacherAiEvals = scopedAiEvals.filter(e => e.teacher_id === teacher.id);
        const teacherPeriodAiEvals = teacherAiEvals.filter(e => new Date(e.created_at || now) >= cutoffDate);

        let tAttempts = 0;
        let tScoreSum = 0;
        let tPassing = 0;

        teacherPeriodExams.forEach(e => {
          const atts = attemptsByExam[e.id] || [];
          atts.forEach(a => {
            tAttempts++;
            const totalPts = Number(a.total_points) || 0;
            const raw = Number(a.score) || 0;
            const pct = totalPts > 0 ? (raw / totalPts) * 100 : raw;
            tScoreSum += pct;
            if (pct >= 50) tPassing++;
          });
        });

        teacherPeriodAiEvals.forEach(ev => {
          tAttempts++;
          const tQ = Number(ev.total_questions) || 0;
          const rS = Number(ev.score) || 0;
          const pct = tQ > 0 ? (rS / tQ) * 100 : (rS <= 5 ? rS * 20 : rS);
          tScoreSum += pct;
          if (pct >= 50) tPassing++;
        });

        const tAvgScore = tAttempts > 0 ? Math.round((tScoreSum / tAttempts) * 10) / 10 : 0;
        const tPassRate = tAttempts > 0 ? Math.round((tPassing / tAttempts) * 100) : 0;

        return {
          id: teacher.id,
          targetType: 'TEACHER',
          title: teacher.full_name,
          titleEn: teacher.full_name,
          subjectId: mySubId,
          subjectName: allSubjects.find((s: any) => s.id === mySubId)?.name_ar || 'المادة التخصصية',
          governorateId: myGovId,
          governorateName: allGovs.find((g: any) => g.id === myGovId)?.name_ar || 'المحافظة',
          subordinateName: teacher.full_name,
          subordinateEmail: teacher.email,
          subordinateId: teacher.id,
          schoolName: teacher.school_name || 'المدرسة المسجلة',
          hasAssignedUser: true,
          totalExams: teacherPeriodExams.length + teacherPeriodAiEvals.length,
          teacherExams: teacherPeriodExams.length,
          generatedExams: teacherPeriodAiEvals.length,
          lifetimeExams: teacherExams.length + teacherAiEvals.length,
          totalAttempts: tAttempts,
          averageScore: tAvgScore,
          passRate: tPassRate,
          activeStaffCount: 1,
          status: tAvgScore >= 75 ? 'EXCELLENT' : (tAvgScore >= 50 ? 'GOOD' : 'NEEDS_SUPPORT')
        };
      });
    }

    // 7. Trend Breakdown (4 slots for Monthly or 4 Weeks for Weekly) combining both sources
    const trendList: any[] = [];
    if (timeframe === 'weekly') {
      for (let i = 3; i >= 0; i--) {
        const wEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        const wStart = new Date(wEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
        const labelAr = i === 0 ? 'الأسبوع الحالي' : `منذ ${i} أسبوع`;
        const labelEn = i === 0 ? 'Current Week' : `${i}w ago`;

        const wTeacherExams = scopedTeacherExams.filter(e => {
          const d = new Date(e.created_at || now);
          return d >= wStart && d <= wEnd;
        });

        const wAiEvals = scopedAiEvals.filter(e => {
          const d = new Date(e.created_at || now);
          return d >= wStart && d <= wEnd;
        });

        let wAtts = 0;
        let wScore = 0;

        wTeacherExams.forEach(e => {
          const atts = attemptsByExam[e.id] || [];
          atts.forEach(a => {
            wAtts++;
            const tP = Number(a.total_points) || 0;
            const rS = Number(a.score) || 0;
            wScore += tP > 0 ? (rS / tP) * 100 : rS;
          });
        });

        wAiEvals.forEach(ev => {
          wAtts++;
          const tQ = Number(ev.total_questions) || 0;
          const rS = Number(ev.score) || 0;
          wScore += tQ > 0 ? (rS / tQ) * 100 : (rS <= 5 ? rS * 20 : rS);
        });

        trendList.push({
          label: labelAr,
          labelEn,
          examsCount: wTeacherExams.length + wAiEvals.length,
          teacherExamsCount: wTeacherExams.length,
          generatedExamsCount: wAiEvals.length,
          attemptsCount: wAtts,
          avgScore: wAtts > 0 ? Math.round((wScore / wAtts) * 10) / 10 : 0
        });
      }
    } else {
      // Monthly trend for last 4 months
      const monthNamesAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
      const monthNamesEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      for (let i = 3; i >= 0; i--) {
        const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
        const mEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);

        const mLabelAr = monthNamesAr[targetDate.getMonth()];
        const mLabelEn = monthNamesEn[targetDate.getMonth()];

        const mTeacherExams = scopedTeacherExams.filter(e => {
          const d = new Date(e.created_at || now);
          return d >= mStart && d <= mEnd;
        });

        const mAiEvals = scopedAiEvals.filter(e => {
          const d = new Date(e.created_at || now);
          return d >= mStart && d <= mEnd;
        });

        let mAtts = 0;
        let mScore = 0;

        mTeacherExams.forEach(e => {
          const atts = attemptsByExam[e.id] || [];
          atts.forEach(a => {
            mAtts++;
            const tP = Number(a.total_points) || 0;
            const rS = Number(a.score) || 0;
            mScore += tP > 0 ? (rS / tP) * 100 : rS;
          });
        });

        mAiEvals.forEach(ev => {
          mAtts++;
          const tQ = Number(ev.total_questions) || 0;
          const rS = Number(ev.score) || 0;
          mScore += tQ > 0 ? (rS / tQ) * 100 : (rS <= 5 ? rS * 20 : rS);
        });

        trendList.push({
          label: mLabelAr,
          labelEn: mLabelEn,
          examsCount: mTeacherExams.length + mAiEvals.length,
          teacherExamsCount: mTeacherExams.length,
          generatedExamsCount: mAiEvals.length,
          attemptsCount: mAtts,
          avgScore: mAtts > 0 ? Math.round((mScore / mAtts) * 10) / 10 : 0
        });
      }
    }

    // 8. Active Subordinates Count in Period
    const activeSubordinatesCount = subordinatesAnalysis.filter(s => s.totalExams > 0).length;

    return res.json({
      role: user.role,
      scope: {
        canFilterGovernorate: isMaster,
        canFilterSubject: isMaster || isGovAdmin,
        effectiveGovId,
        effectiveSubId,
        timeframe
      },
      kpis: {
        totalExams: periodTeacherExams.length + periodAiEvals.length,
        generatedExamsCount: periodAiEvals.length,
        teacherExamsCount: periodTeacherExams.length,
        lifetimeExams: scopedTeacherExams.length + scopedAiEvals.length,
        lifetimeGeneratedExams: scopedAiEvals.length,
        lifetimeTeacherExams: scopedTeacherExams.length,
        totalAttempts: totalAttemptsCount,
        teacherAttemptsCount,
        generatedAttemptsCount: periodAiEvals.length,
        averageScore,
        passRate,
        activeSubordinatesCount,
        totalSubordinatesCount: subordinatesAnalysis.length
      },
      subordinatesAnalysis,
      timelineTrend: trendList
    });
  } catch (err: any) {
    console.error('Error in supervisory analysis:', err);
    return res.status(500).json({ error: 'خطأ في جلب تحليلات الرقابة الإشرافية: ' + err.message });
  }
});

export default router;
