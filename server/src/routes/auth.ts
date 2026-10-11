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

    // Check student self-registration policy
    const regSetting = await db.query(`SELECT setting_value FROM platform_settings WHERE setting_key = 'allow_student_registration'`);
    const isAllowed = regSetting.rows.length === 0 || regSetting.rows[0].setting_value === 'true' || regSetting.rows[0].setting_value === '1';
    if (!isAllowed) {
      return res.status(403).json({
        error: 'تم تعطيل التسجيل الذاتي لحسابات الطلاب حالياً بقرار من إدارة المنصة. يتم استلام بيانات الحساب حصرياً من إدارة المدرسة أو مشرف المحافظة.'
      });
    }

    // Check active grades restriction
    if (gradeId) {
      const gradesSetting = await db.query(`SELECT setting_value FROM platform_settings WHERE setting_key = 'active_grades'`);
      if (gradesSetting.rows.length > 0 && gradesSetting.rows[0].setting_value !== 'ALL') {
        try {
          const activeGrades = JSON.parse(gradesSetting.rows[0].setting_value);
          if (Array.isArray(activeGrades) && activeGrades.length > 0 && !activeGrades.includes(gradeId)) {
            return res.status(400).json({ error: 'هذا الصف الدراسي غير مفعّل حالياً على المنصة بقرار من الإدارة.' });
          }
        } catch (_) {}
      }
    }

    // Resolve stage from grade
    let resolvedStageId = academicStageId || null;
    let resolvedGradeName = '';
    let resolvedStageName = '';
    if (gradeId) {
      const grRes = await db.query(
        `SELECT g.id, g.name_ar as grade_name, g.stage_id, s.name_ar as stage_name
         FROM grades g
         LEFT JOIN academic_stages s ON g.stage_id = s.id
         WHERE g.id = $1`,
        [gradeId]
      );
      if (grRes.rows.length > 0) {
        resolvedStageId = grRes.rows[0].stage_id;
        resolvedGradeName = grRes.rows[0].grade_name;
        resolvedStageName = grRes.rows[0].stage_name;
      }
    }

    const autoStudentCode = `STU-${Math.floor(100000 + Math.random() * 900000)}`;
    const effectiveSchoolType = schoolType || 'عربي';

    await db.query(
      `INSERT INTO users (id, email, username, password_hash, role, full_name, is_active, initial_password)
       VALUES ($1, $2, $3, $4, 'STUDENT', $5, 1, $6)`,
      [userId, cleanEmail, cleanUsername, passwordHash, displayName, password]
    );

    await db.query(
      `INSERT INTO student_profiles (
        user_id, full_name, governorate_id, school_name,
        academic_stage_id, grade_id, school_type, student_code
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        displayName,
        governorateId || null,
        schoolName || 'المدرسة الرسمية',
        resolvedStageId,
        gradeId || null,
        effectiveSchoolType,
        autoStudentCode
      ]
    );

    const regDeviceId = (req.body?.deviceId || req.body?.device_id || req.headers['x-device-id'] || '').toString().trim();
    const regDeviceName = (req.body?.deviceName || req.body?.device_name || req.headers['user-agent'] || 'جهاز التسجيل').toString().slice(0, 100);
    const regClientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim().slice(0, 45);
    const initialDeviceId = regDeviceId || ('fp_' + Buffer.from(regClientIp + '_' + (req.headers['user-agent'] || '')).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24));

    try {
      await db.query(
        `INSERT INTO user_active_devices (id, user_id, device_id, device_name, ip_address, last_active_at)
         VALUES ($1, $2, $3, $4, $5, datetime('now'))`,
        [uuidv4(), userId, initialDeviceId, regDeviceName, regClientIp]
      );
    } catch (_) {}

    const token = generateToken({
      id: userId,
      email: cleanEmail,
      role: 'STUDENT',
      fullName: displayName
    });

    return res.status(201).json({
      message: 'تم إنشاء حساب الطالب بنجاح',
      token,
      user: {
        id: userId,
        email: cleanEmail,
        username: cleanUsername,
        role: 'STUDENT',
        fullName: displayName,
        profile: {
          user_id: userId,
          full_name: displayName,
          school_name: schoolName || 'المدرسة الرسمية',
          academic_stage_id: resolvedStageId,
          grade_id: gradeId || null,
          school_type: effectiveSchoolType,
          student_code: autoStudentCode,
          grade_name_ar: resolvedGradeName,
          stage_name_ar: resolvedStageName
        }
      }
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الحساب: ' + error.message });
  }
});

// Dedicated Register Teacher Endpoint
router.post('/register-teacher', async (req, res) => {
  try {
    const { email, password, fullName, specialization, schoolName, gradeId, assignedSubjects, assignedGrades } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور واسم المعلم بالكامل' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'البريد الإلكتروني مسجل بالفعل' });
    }

    // Prepare assigned subjects & grades arrays
    let finalAssignedSubjects: string[] = [];
    if (Array.isArray(assignedSubjects) && assignedSubjects.length > 0) {
      finalAssignedSubjects = assignedSubjects.map(s => String(s).trim()).filter(Boolean);
    } else if (specialization) {
      finalAssignedSubjects = [specialization.trim()];
    }

    let finalAssignedGrades: string[] = [];
    if (Array.isArray(assignedGrades) && assignedGrades.length > 0) {
      finalAssignedGrades = assignedGrades.map(g => String(g).trim()).filter(Boolean);
    } else if (gradeId) {
      finalAssignedGrades = [String(gradeId).trim()];
    }

    const primaryGradeId = finalAssignedGrades[0] || gradeId || null;
    let stageId = null;
    let gradeNameAr = null;
    if (primaryGradeId) {
      const grRes = await db.query('SELECT stage_id, name_ar FROM grades WHERE id = $1', [primaryGradeId]);
      if (grRes.rows.length > 0) {
        stageId = grRes.rows[0].stage_id;
        gradeNameAr = grRes.rows[0].name_ar;
      }
    }

    const primarySpecialization = finalAssignedSubjects.join('، ') || specialization || 'عام';
    const userId = uuidv4();
    const cleanSpec = primarySpecialization.substring(0, 3).toUpperCase();
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
      `INSERT INTO teacher_profiles (
         user_id, full_name, school_name, specialization, grade_id, academic_stage_id,
         assigned_subjects, assigned_grades
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        fullName.trim(),
        schoolName || null,
        primarySpecialization,
        primaryGradeId,
        stageId,
        JSON.stringify(finalAssignedSubjects),
        JSON.stringify(finalAssignedGrades)
      ]
    );

    const token = generateToken({
      id: userId,
      email: email.toLowerCase().trim(),
      role: 'TEACHER',
      fullName: fullName.trim()
    });

    return res.status(201).json({
      message: 'تم إنشاء حساب المعلم بنجاح وتثبيت المواد والصفوف المعتمدة',
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
          specialization: primarySpecialization,
          grade_id: primaryGradeId,
          academic_stage_id: stageId,
          grade_name_ar: gradeNameAr,
          assigned_subjects: finalAssignedSubjects,
          assigned_grades: finalAssignedGrades
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
      `SELECT u.id, u.super_id, u.hybrid_id, u.email, u.username, u.password_hash, u.role, u.full_name, u.permissions, u.is_active, u.governorate_id, u.subject_id, u.created_by 
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE LOWER(u.email) = $1 
          OR LOWER(u.username) = $2 
          OR LOWER(u.super_id) = $3 
          OR LOWER(u.hybrid_id) = $4
          OR LOWER(sp.student_code) = $5
       LIMIT 1`,
      [cleanIdent, cleanIdent, cleanIdent, cleanIdent, cleanIdent]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'البيانات المدخلة غير صحيحة (تأكد من البريد أو اسم المستخدم أو الكود وكلمة المرور)' });
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

      // Student Device Session Limiting (Max devices allowed per student, default 2)
      let rawDeviceId = (req.body?.deviceId || req.body?.device_id || req.headers['x-device-id'] || '').toString().trim();
      const rawDeviceName = (req.body?.deviceName || req.body?.device_name || req.headers['user-agent'] || 'متصفح الطالب').toString().slice(0, 100);
      const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim().slice(0, 45);

      if (!rawDeviceId) {
        // Fallback fingerprint to prevent bypassing device limiting
        rawDeviceId = 'fp_' + Buffer.from(clientIp + '_' + (req.headers['user-agent'] || '')).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
      }

      const allowedMax = profileData?.max_devices ? Math.max(1, Number(profileData.max_devices)) : 2;
      const currentDevices = await db.query(
        `SELECT id, device_id, device_name, ip_address, last_active_at FROM user_active_devices WHERE user_id = $1`,
        [user.id]
      );

      const existingDevice = currentDevices.rows.find((d: any) => d.device_id === rawDeviceId);
      if (existingDevice) {
        // Update device activity timestamp & IP
        await db.query(
          `UPDATE user_active_devices SET last_active_at = datetime('now'), ip_address = $1 WHERE user_id = $2 AND device_id = $3`,
          [clientIp, user.id, rawDeviceId]
        );
      } else {
        // New device attempting to log in
        if (currentDevices.rows.length >= allowedMax) {
          return res.status(403).json({
            error: `تم بلوغ الحد الأقصى للأجهزة المسموح بها لهذا الحساب (${allowedMax} أجهزة كحد أقصى). يرجى تسجيل الخروج من أحد أجهزتك السابقة أو مراجعة إدارة المنصة لزيادة حد الأجهزة المصرح بها.`,
            code: 'DEVICE_LIMIT_EXCEEDED',
            max_devices: allowedMax,
            current_devices_count: currentDevices.rows.length,
            active_devices: currentDevices.rows.map((d: any) => ({
              id: d.id,
              device_id: d.device_id,
              device_name: d.device_name,
              last_active_at: d.last_active_at
            }))
          });
        }

        // Register new active device
        await db.query(
          `INSERT INTO user_active_devices (id, user_id, device_id, device_name, ip_address, last_active_at)
           VALUES ($1, $2, $3, $4, $5, datetime('now'))`,
          [uuidv4(), user.id, rawDeviceId, rawDeviceName, clientIp]
        );
      }
    } else if (user.role === 'TEACHER') {
      const tp = await db.query(
        `SELECT tp.*, g.name_ar as grade_name_ar, g.name_en as grade_name_en,
                s.name_ar as stage_name_ar, s.name_en as stage_name_en
         FROM teacher_profiles tp
         LEFT JOIN grades g ON tp.grade_id = g.id
         LEFT JOIN academic_stages s ON tp.academic_stage_id = s.id
         WHERE tp.user_id = $1`,
        [user.id]
      );
      profileData = tp.rows[0];
      if (profileData) {
        if (typeof profileData.assigned_subjects === 'string') {
          try { profileData.assigned_subjects = JSON.parse(profileData.assigned_subjects); } catch (_) { profileData.assigned_subjects = [profileData.assigned_subjects]; }
        }
        if (typeof profileData.assigned_grades === 'string') {
          try { profileData.assigned_grades = JSON.parse(profileData.assigned_grades); } catch (_) { profileData.assigned_grades = [profileData.assigned_grades]; }
        }
        if (typeof profileData.teaching_assignments === 'string') {
          try { profileData.teaching_assignments = JSON.parse(profileData.teaching_assignments); } catch (_) { profileData.teaching_assignments = []; }
        }
      }
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
      const tp = await db.query(
        `SELECT tp.*, g.name_ar as grade_name_ar, g.name_en as grade_name_en,
                s.name_ar as stage_name_ar, s.name_en as stage_name_en
         FROM teacher_profiles tp
         LEFT JOIN grades g ON tp.grade_id = g.id
         LEFT JOIN academic_stages s ON tp.academic_stage_id = s.id
         WHERE tp.user_id = $1`,
        [user.id]
      );
      profileData = tp.rows[0];
      if (profileData) {
        if (typeof profileData.assigned_subjects === 'string') {
          try { profileData.assigned_subjects = JSON.parse(profileData.assigned_subjects); } catch (_) { profileData.assigned_subjects = [profileData.assigned_subjects]; }
        }
        if (typeof profileData.assigned_grades === 'string') {
          try { profileData.assigned_grades = JSON.parse(profileData.assigned_grades); } catch (_) { profileData.assigned_grades = [profileData.assigned_grades]; }
        }
        if (typeof profileData.teaching_assignments === 'string') {
          try { profileData.teaching_assignments = JSON.parse(profileData.teaching_assignments); } catch (_) { profileData.teaching_assignments = []; }
        }
      }
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
    console.error('Update student profile error:', err);
    return res.status(500).json({ error: 'خطأ في تحديث البيانات الدراسية' });
  }
});

// Get active devices for current user
router.get('/devices', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const devices = await db.query(
      `SELECT id, device_id, device_name, ip_address, last_active_at, created_at
       FROM user_active_devices
       WHERE user_id = $1
       ORDER BY last_active_at DESC`,
      [req.user!.id]
    );

    let maxDevices = 2;
    if (req.user!.role === 'STUDENT') {
      const sp = await db.query(`SELECT max_devices FROM student_profiles WHERE user_id = $1`, [req.user!.id]);
      if (sp.rows[0]?.max_devices) {
        maxDevices = Number(sp.rows[0].max_devices);
      }
    }

    return res.json({
      devices: devices.rows,
      max_devices: maxDevices,
      count: devices.rows.length
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب بيانات الأجهزة المسجلة' });
  }
});

// Logout / Disconnect a device
router.delete('/devices/:deviceId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { deviceId } = req.params;
    await db.query(
      `DELETE FROM user_active_devices WHERE user_id = $1 AND (device_id = $2 OR id = $2)`,
      [req.user!.id, deviceId]
    );
    return res.json({ message: 'تم إلغاء تفعيل وتسجيل الخروج من الجهاز بنجاح' });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في حذف الجهاز' });
  }
});

export default router;
