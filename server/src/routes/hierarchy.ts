import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/db.js';
import { authenticateToken, requireRole, generateToken, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Hierarchy routes are restricted to staff roles (Admin, Central Admin, Governorate Admin, Supervisor)
router.use(authenticateToken);
router.use(requireRole(['ADMIN', 'CENTRAL_ADMIN', 'GOVERNORATE_ADMIN', 'SUPERVISOR']));

/**
 * 1. Meta information: Governorates, Subjects, and caller's allowed scope
 */
router.get('/meta', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;

    // 1. Fetch all governorates
    const govRes = await db.query(
      `SELECT id, name_ar, name_en FROM governorates ORDER BY name_ar ASC`
    );

    // 2. Fetch distinct subjects (by name_ar)
    const subRes = await db.query(
      `SELECT MIN(id) as id, name_ar, name_en, code, MAX(icon) as icon 
       FROM subjects 
       GROUP BY name_ar, name_en, code 
       ORDER BY sort_order ASC, name_ar ASC`
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
      subjects: subRes.rows
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
        questionsCount
      }
    });
  } catch (err: any) {
    console.error('Error in /api/hierarchy/stats:', err);
    return res.status(500).json({ error: 'خطأ في جلب إحصائيات الهيكل الإداري: ' + err.message });
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
 * 5. Subordinates Management (List immediate subordinates)
 * - ADMIN -> sees CENTRAL_ADMIN
 * - CENTRAL_ADMIN -> sees GOVERNORATE_ADMIN
 * - GOVERNORATE_ADMIN -> sees SUPERVISOR in their governorate
 * - SUPERVISOR -> sees TEACHER in their subject & governorate
 */
router.get('/subordinates', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    let targetRole: string = '';
    const params: any[] = [];
    const conditions: string[] = [];

    if (user.role === 'ADMIN') {
      targetRole = 'CENTRAL_ADMIN';
      conditions.push(`u.role = 'CENTRAL_ADMIN'`);
    } else if (user.role === 'CENTRAL_ADMIN') {
      targetRole = 'GOVERNORATE_ADMIN';
      conditions.push(`u.role = 'GOVERNORATE_ADMIN'`);
    } else if (user.role === 'GOVERNORATE_ADMIN') {
      targetRole = 'SUPERVISOR';
      conditions.push(`u.role = 'SUPERVISOR'`);
      params.push(user.governorateId);
      conditions.push(`u.governorate_id = $${params.length}`);
    } else if (user.role === 'SUPERVISOR') {
      targetRole = 'TEACHER';
      conditions.push(`u.role = 'TEACHER'`);
      params.push(user.governorateId);
      conditions.push(`u.governorate_id = $${params.length}`);
      if (user.subjectId) {
        params.push(user.subjectId);
        conditions.push(`(u.subject_id = $${params.length} OR u.created_by = '${user.id}')`);
      }
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

    return res.json({ targetRole, subordinates });
  } catch (err: any) {
    console.error('Error fetching subordinates:', err);
    return res.status(500).json({ error: 'خطأ في جلب المرؤوسين: ' + err.message });
  }
});

/**
 * 6. Create Subordinate Account
 * Enforces strict downward provisioning:
 * - ADMIN creates CENTRAL_ADMIN
 * - CENTRAL_ADMIN creates GOVERNORATE_ADMIN (assigns governorate_id)
 * - GOVERNORATE_ADMIN creates SUPERVISOR (assigns subject_id, locked to caller's governorate)
 * - SUPERVISOR creates TEACHER (locked to caller's governorate & subject)
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
      targetRole = 'CENTRAL_ADMIN';
    } else if (user.role === 'CENTRAL_ADMIN') {
      targetRole = 'GOVERNORATE_ADMIN';
      if (!governorateId) {
        return res.status(400).json({ error: 'يجب اختيار المحافظة التابع لها أمين المحافظة' });
      }
      assignedGovId = governorateId;
    } else if (user.role === 'GOVERNORATE_ADMIN') {
      targetRole = 'SUPERVISOR';
      if (!subjectId) {
        return res.status(400).json({ error: 'يجب اختيار المادة المسندة للموجه' });
      }
      assignedGovId = user.governorateId || governorateId;
      assignedSubId = subjectId;
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
        governorate_id, subject_id, created_by, permissions, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
    if (caller.role === 'ADMIN' && sub.role === 'CENTRAL_ADMIN') authorized = true;
    if (caller.role === 'CENTRAL_ADMIN' && sub.role === 'GOVERNORATE_ADMIN') authorized = true;
    if (caller.role === 'GOVERNORATE_ADMIN' && sub.role === 'SUPERVISOR' && sub.governorate_id === caller.governorateId) authorized = true;
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
    if (caller.role === 'CENTRAL_ADMIN' && ['GOVERNORATE_ADMIN', 'SUPERVISOR', 'TEACHER'].includes(target.role)) authorized = true;
    if (caller.role === 'GOVERNORATE_ADMIN' && ['SUPERVISOR', 'TEACHER'].includes(target.role) && target.governorate_id === caller.governorateId) authorized = true;
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

export default router;
