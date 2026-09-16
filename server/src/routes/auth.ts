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
      password,
      role,
      fullName,
      countryId,
      governorateId,
      schoolId,
      schoolName,
      academicStageId,
      gradeId,
      specialization,
      section,
      schoolType,
      school_type
    } = req.body;

    if (!email || !password || !role || !fullName) {
      return res.status(400).json({ error: 'الرجاء إدخال كافة البيانات الأساسية المطلوبة' });
    }

    if (role !== 'STUDENT' && role !== 'TEACHER') {
      return res.status(400).json({ error: 'نوع الحساب يجب أن يكون طالب أو معلم' });
    }

    // Check existing email
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'البريد الإلكتروني مسجل بالفعل' });
    }

    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    await db.query(
      `INSERT INTO users (id, email, password_hash, role, full_name) VALUES ($1, $2, $3, $4, $5)`,
      [userId, email.toLowerCase().trim(), passwordHash, role, fullName.trim()]
    );

    if (role === 'STUDENT') {
      if (!academicStageId || !gradeId) {
        return res.status(400).json({ error: 'يجب اختيار المرحلة الدراسية والصف الدراسي للطالب' });
      }

      const effectiveSchoolType = schoolType || school_type || 'عربي';

      await db.query(
        `INSERT INTO student_profiles (
           user_id, full_name, country_id, governorate_id, school_id, school_name, academic_stage_id, grade_id, section, school_type
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          userId,
          fullName.trim(),
          countryId || null,
          governorateId || null,
          schoolId || null,
          schoolName || null,
          academicStageId,
          gradeId,
          section || null,
          effectiveSchoolType
        ]
      );
    } else if (role === 'TEACHER') {
      await db.query(
        `INSERT INTO teacher_profiles (
           user_id, full_name, school_id, school_name, specialization
         ) VALUES ($1, $2, $3, $4, $5)`,
        [userId, fullName.trim(), schoolId || null, schoolName || null, specialization || null]
      );
    }

    const token = generateToken({
      id: userId,
      email: email.toLowerCase().trim(),
      role,
      fullName: fullName.trim()
    });

    return res.status(201).json({
      message: 'تم إنشاء الحساب بنجاح',
      token,
      user: {
        id: userId,
        email: email.toLowerCase().trim(),
        role,
        fullName: fullName.trim()
      }
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الحساب: ' + error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور' });
    }

    const userRes = await db.query(
      `SELECT id, email, password_hash, role, full_name FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }

    const user = userRes.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
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

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name
    });

    return res.json({
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
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

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        profile: profileData
      }
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'خطأ في جلب بيانات المستخدم' });
  }
});

export default router;
