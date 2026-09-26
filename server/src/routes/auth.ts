import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/db.js';
import { generateToken, authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const {
      email,
      username,
      password,
      role,
      fullName,
      governorate,
      governorateId,
      schoolName,
      studentCode,
      student_code,
      term,
      educationType,
      schoolType,
      school_type,
      academicStageId,
      gradeId,
      specialization,
      section
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور' });
    }

    const effectiveRole = (role || 'STUDENT').toUpperCase().trim();
    if (effectiveRole !== 'STUDENT' && effectiveRole !== 'TEACHER') {
      return res.status(400).json({
        error: 'الدور المحدد غير مدعوم للتسجيل الذاتي. يرجى اختيار طالب أو معلم.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = username ? username.trim() : (fullName ? fullName.trim() : cleanEmail.split('@')[0]);
    const displayName = cleanUsername;

    // Check existing email
    const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'البريد الإلكتروني مسجل بالفعل' });
    }

    // Check existing username if provided
    if (cleanUsername) {
      const uExisting = await db.query('SELECT id FROM users WHERE LOWER(username) = $1', [cleanUsername.toLowerCase()]);
      if (uExisting.rows.length > 0) {
        return res.status(400).json({ error: 'اسم المستخدم مسجل بالفعل. يرجى اختيار اسم مستخدم آخر.' });
      }
    }

    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    if (effectiveRole === 'TEACHER') {
      const cleanSpec = specialization ? specialization.substring(0, 3).toUpperCase() : 'GEN';
      const hybridId = `HYBRID-TEA-${cleanSpec}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const defaultPerms = {
        can_upload_books: true,
        can_create_exams: true,
        can_delete_content: true,
        can_view_analytics: true,
        is_active: true
      };

      await db.query(
        `INSERT INTO users (id, hybrid_id, email, username, password_hash, role, full_name, permissions, is_active)
         VALUES ($1, $2, $3, $4, $5, 'TEACHER', $6, $7, 1)`,
        [
          userId,
          hybridId,
          cleanEmail,
          cleanUsername,
          passwordHash,
          displayName,
          JSON.stringify(defaultPerms)
        ]
      );

      await db.query(
        `INSERT INTO teacher_profiles (user_id, full_name, school_name, specialization)
         VALUES ($1, $2, $3, $4)`,
        [userId, displayName, schoolName || null, specialization || null]
      );

      const token = generateToken({
        id: userId,
        email: cleanEmail,
        role: 'TEACHER',
        fullName: displayName
      });

      return res.status(201).json({
        message: 'تم إنشاء حساب المعلم بنجاح',
        token,
        user: {
          id: userId,
          hybrid_id: hybridId,
          email: cleanEmail,
          username: cleanUsername,
          role: 'TEACHER',
          fullName: displayName,
          permissions: defaultPerms,
          profile: {
            user_id: userId,
            full_name: displayName,
            school_name: schoolName || null,
            specialization: specialization || null
          }
        }
      });
    }

    // Student Self-Registration is closed per institutional policy
    // Student accounts must be provisioned by the Governorate Supervisor (مشرف المحافظة)
    return res.status(403).json({
      error: 'تم تعطيل التسجيل الذاتي لحسابات الطلاب. يتم استلام بيانات الحساب (اسم المستخدم وكلمة المرور) حصرياً من مشرف المحافظة أو إدارة المدرسة.'
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الحساب: ' + error.message });
  }
});

// Dedicated Register Teacher Endpoint
router.post('/register-teacher', async (req, res) => {
  try {
    const { email, password, fullName, specialization, schoolName } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور واسم المعلم بالكامل' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'البريد الإلكتروني مسجل بالفعل' });
    }

    const userId = uuidv4();
    const cleanSpec = specialization ? specialization.substring(0, 3).toUpperCase() : 'GEN';
    const hybridId = `HYBRID-TEA-${cleanSpec}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const defaultPerms = {
      can_upload_books: true,
      can_create_exams: true,
      can_delete_content: true,
      can_view_analytics: true,
      is_active: true
    };

    await db.query(
      `INSERT INTO users (id, hybrid_id, email, password_hash, role, full_name, permissions, is_active)
       VALUES ($1, $2, $3, $4, 'TEACHER', $5, $6, 1)`,
      [
        userId,
        hybridId,
        email.toLowerCase().trim(),
        passwordHash,
        fullName.trim(),
        JSON.stringify(defaultPerms)
      ]
    );

    await db.query(
      `INSERT INTO teacher_profiles (user_id, full_name, school_name, specialization)
       VALUES ($1, $2, $3, $4)`,
      [userId, fullName.trim(), schoolName || null, specialization || null]
    );

    const token = generateToken({
      id: userId,
      email: email.toLowerCase().trim(),
      role: 'TEACHER',
      fullName: fullName.trim()
    });

    return res.status(201).json({
      message: 'تم إنشاء حساب المعلم بنجاح',
      token,
      user: {
        id: userId,
        hybrid_id: hybridId,
        email: email.toLowerCase().trim(),
        role: 'TEACHER',
        fullName: fullName.trim(),
        permissions: defaultPerms,
        profile: {
          user_id: userId,
          full_name: fullName.trim(),
          school_name: schoolName || null,
          specialization: specialization || null
        }
      }
    });
  } catch (error: any) {
    console.error('Teacher registration error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء إنشاء حساب المعلم: ' + error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور' });
    }

    const cleanIdent = email.toLowerCase().trim();
    const userRes = await db.query(
      `SELECT id, super_id, hybrid_id, email, username, password_hash, role, full_name, permissions, is_active, governorate_id, subject_id, created_by 
       FROM users 
       WHERE LOWER(email) = $1 OR LOWER(username) = $2`,
      [cleanIdent, cleanIdent]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'البريد الإلكتروني أو اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const user = userRes.rows[0];

    if (user.is_active === 0) {
      return res.status(403).json({ error: 'تم تجميد هذا الحساب من قِبل إدارة المنصة. يرجى التواصل مع الإدارة.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'البريد الإلكتروني أو اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    // Lookup governorate name & subject name if available
    let govName = null;
    let subName = null;
    if (user.governorate_id) {
      const gRes = await db.query('SELECT name_ar FROM governorates WHERE id = $1 LIMIT 1', [user.governorate_id]);
      govName = gRes.rows[0]?.name_ar || null;
    }
    if (user.subject_id) {
      const sRes = await db.query('SELECT name_ar FROM subjects WHERE id = $1 LIMIT 1', [user.subject_id]);
      subName = sRes.rows[0]?.name_ar || null;
    }

    let profileData: any = null;
    if (user.role === 'STUDENT') {
      const sp = await db.query(
        `SELECT sp.*, s.name_ar as stage_name_ar, s.name_en as stage_name_en,
                g.name_ar as grade_name_ar, g.name_en as grade_name_en
         FROM student_profiles sp
         JOIN academic_stages s ON sp.academic_stage_id = s.id
         JOIN grades g ON sp.grade_id = g.id
         WHERE sp.user_id = $1`,
        [user.id]
      );
      profileData = sp.rows[0];
    } else if (user.role === 'TEACHER') {
      const tp = await db.query(`SELECT * FROM teacher_profiles WHERE user_id = $1`, [user.id]);
      profileData = tp.rows[0];
    }

    let permissionsObj = null;
    if (user.permissions) {
      try {
        permissionsObj = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
      } catch (_) {
        permissionsObj = null;
      }
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
      governorateId: user.governorate_id || undefined,
      subjectId: user.subject_id || undefined,
      permissions: permissionsObj || undefined
    });

    return res.json({
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: {
        id: user.id,
        super_id: user.super_id || null,
        hybrid_id: user.hybrid_id || null,
        email: user.email,
        username: user.username || null,
        role: user.role,
        fullName: user.full_name,
        governorate_id: user.governorate_id || null,
        governorate_name: govName,
        subject_id: user.subject_id || null,
        subject_name: subName,
        created_by: user.created_by || null,
        permissions: permissionsObj,
        profile: profileData
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الدخول: ' + error.message });
  }
});

// Me (Current user)
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const userQuery = await db.query(
      `SELECT super_id, hybrid_id, username, permissions, is_active, governorate_id, subject_id, created_by FROM users WHERE id = $1`,
      [user.id]
    );
    const userRow = userQuery.rows[0] || {};

    let govName = null;
    let subName = null;
    if (userRow.governorate_id) {
      const gRes = await db.query('SELECT name_ar FROM governorates WHERE id = $1 LIMIT 1', [userRow.governorate_id]);
      govName = gRes.rows[0]?.name_ar || null;
    }
    if (userRow.subject_id) {
      const sRes = await db.query('SELECT name_ar FROM subjects WHERE id = $1 LIMIT 1', [userRow.subject_id]);
      subName = sRes.rows[0]?.name_ar || null;
    }

    let profileData: any = null;
    if (user.role === 'STUDENT') {
      const sp = await db.query(
        `SELECT sp.*, s.name_ar as stage_name_ar, s.name_en as stage_name_en,
                g.name_ar as grade_name_ar, g.name_en as grade_name_en
         FROM student_profiles sp
         JOIN academic_stages s ON sp.academic_stage_id = s.id
         JOIN grades g ON sp.grade_id = g.id
         WHERE sp.user_id = $1`,
        [user.id]
      );
      profileData = sp.rows[0];
    } else if (user.role === 'TEACHER') {
      const tp = await db.query(`SELECT * FROM teacher_profiles WHERE user_id = $1`, [user.id]);
      profileData = tp.rows[0];
    }

    let permissionsObj = null;
    if (userRow.permissions) {
      try {
        permissionsObj = typeof userRow.permissions === 'string' ? JSON.parse(userRow.permissions) : userRow.permissions;
      } catch (_) {
        permissionsObj = null;
      }
    }

    return res.json({
      user: {
        id: user.id,
        super_id: userRow.super_id || null,
        hybrid_id: userRow.hybrid_id || null,
        email: user.email,
        username: userRow.username || null,
        role: user.role,
        fullName: user.fullName,
        governorate_id: userRow.governorate_id || null,
        governorate_name: govName,
        subject_id: userRow.subject_id || null,
        subject_name: subName,
        created_by: userRow.created_by || null,
        permissions: permissionsObj,
        profile: profileData
      }
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'خطأ في جلب بيانات المستخدم' });
  }
});

// Update Student Profile (Grade, Stage, School Type)
router.put('/profile', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    if (user.role !== 'STUDENT') {
      return res.status(403).json({ error: 'تعديل الملف الشخصي مخصص للطلاب حالياً' });
    }

    const { academicStageId, gradeId, schoolType, schoolName, section } = req.body;
    if (!academicStageId || !gradeId) {
      return res.status(400).json({ error: 'المرحلة الدراسية والصف الدراسي مطلوبان' });
    }

    const effectiveSchoolType = schoolType || 'عربي';

    await db.query(
      `UPDATE student_profiles 
       SET academic_stage_id = $1, grade_id = $2, school_type = $3, 
           school_name = COALESCE($4, school_name), section = COALESCE($5, section)
       WHERE user_id = $6`,
      [academicStageId, gradeId, effectiveSchoolType, schoolName || null, section || null, user.id]
    );

    const sp = await db.query(
      `SELECT sp.*, s.name_ar as stage_name_ar, s.name_en as stage_name_en,
              g.name_ar as grade_name_ar, g.name_en as grade_name_en
       FROM student_profiles sp
       JOIN academic_stages s ON sp.academic_stage_id = s.id
       JOIN grades g ON sp.grade_id = g.id
       WHERE sp.user_id = $1`,
      [user.id]
    );

    return res.json({
      message: 'تم تحديث بيانات الصف الدراسي ونوع المدرسة بنجاح',
      profile: sp.rows[0]
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في تحديث الملف الشخصي: ' + err.message });
  }
});

export default router;
