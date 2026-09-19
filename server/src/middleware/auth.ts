import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret_assessment_platform_jwt_key_2026';

export interface AuthUser {
  id: string;
  email: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
  fullName: string;
}

export interface StudentProfileInfo {
  academicStageId: string;
  gradeId: string;
  schoolId?: string;
  countryId?: string;
  governorateId?: string;
  schoolType: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  studentProfile?: StudentProfileInfo;
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
}

export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || (req.query.token as string);

  if (!token) {
    return res.status(401).json({ error: 'لم يتم توفير رمز المصادقة (Missing Token)' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;

    // If student, attach their verified grade, stage & school_type
    if (decoded.role === 'STUDENT') {
      const profile = await db.query(
        `SELECT academic_stage_id, grade_id, school_id, country_id, governorate_id, school_type 
         FROM student_profiles WHERE user_id = $1`,
        [decoded.id]
      );
      if (profile.rows.length > 0) {
        req.studentProfile = {
          academicStageId: profile.rows[0].academic_stage_id,
          gradeId: profile.rows[0].grade_id,
          schoolId: profile.rows[0].school_id,
          countryId: profile.rows[0].country_id,
          governorateId: profile.rows[0].governorate_id,
          schoolType: profile.rows[0].school_type || 'عربي'
        };
      }
    }

    next();
  } catch (err) {
    return res.status(403).json({ error: 'رمز المصادقة غير صالح أو منتهي الصلاحية' });
  }
}

export function requireRole(allowedRoles: ('STUDENT' | 'TEACHER' | 'ADMIN')[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'ليس لديك صلاحية للوصول إلى هذا المورد' });
    }
    next();
  };
}

/**
 * Strictly enforce that student only queries content matching their own academic stage & grade
 */
export function enforceStudentGrade(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user?.role === 'STUDENT') {
    if (!req.studentProfile) {
      return res.status(403).json({ error: 'الملف الدراسي للطالب غير مكتمل' });
    }

    const requestedStageId = req.query.stage_id || req.body?.academic_stage_id || req.body?.academicStageId;
    const requestedGradeId = req.query.grade_id || req.body?.grade_id || req.body?.gradeId;

    if (requestedStageId && requestedStageId !== req.studentProfile.academicStageId) {
      return res.status(403).json({ 
        error: 'غير مصرح لك بالوصول إلى مواد مرحلة دراسية مختلفة عن مرحلتك المسجلة' 
      });
    }

    if (requestedGradeId && requestedGradeId !== req.studentProfile.gradeId) {
      return res.status(403).json({ 
        error: 'غير مصرح لك بالوصول إلى محتوى صف دراسي آخر غير صفك المسجل' 
      });
    }

    const requestedSchoolType = req.query.school_type || req.body?.school_type;
    if (requestedSchoolType && requestedSchoolType !== 'كلاهما' && requestedSchoolType !== req.studentProfile.schoolType) {
      return res.status(403).json({
        error: 'غير مصرح لك بالوصول إلى محتوى مخصص لنوع مدرسة مختلف عن مدرستك المسجلة'
      });
    }
  }
  next();
}
