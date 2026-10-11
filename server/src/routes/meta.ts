import { Router } from 'express';
import { db } from '../db/db.js';

const router = Router();

// Get all stages with their grades
router.get('/stages', async (req, res) => {
  try {
    const stages = await db.query('SELECT * FROM academic_stages ORDER BY sort_order ASC');
    const grades = await db.query('SELECT * FROM grades ORDER BY sort_order ASC');

    const result = stages.rows.map(stage => ({
      ...stage,
      grades: grades.rows.filter(g => g.stage_id === stage.id)
    }));

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب المراحل الدراسية: ' + err.message });
  }
});

// Get all 12 grades with stage info
router.get('/grades', async (req, res) => {
  try {
    const grades = await db.query(`
      SELECT g.id, g.stage_id, g.code, g.name_ar, g.name_en, g.sort_order,
             s.name_ar as stage_name_ar, s.name_en as stage_name_en, s.code as stage_code
      FROM grades g
      JOIN academic_stages s ON g.stage_id = s.id
      ORDER BY s.sort_order ASC, g.sort_order ASC
    `);
    return res.json(grades.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب الصفوف الدراسية: ' + err.message });
  }
});

// Get grades for a specific stage
router.get('/stages/:stageId/grades', async (req, res) => {
  try {
    const { stageId } = req.params;
    const grades = await db.query(
      'SELECT * FROM grades WHERE stage_id = $1 ORDER BY sort_order ASC',
      [stageId]
    );
    return res.json(grades.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب الصفوف الدراسية' });
  }
});

// Get all subjects (optionally filtered by gradeId or stageId)
router.get('/subjects', async (req, res) => {
  try {
    const { gradeId } = req.query;
    if (gradeId) {
      const subjects = await db.query(
        'SELECT * FROM subjects WHERE grade_id = $1 ORDER BY sort_order ASC',
        [gradeId]
      );
      return res.json(subjects.rows);
    }
    const subjects = await db.query(`
      SELECT s.*, g.name_ar as grade_name_ar, g.code as grade_code, st.name_ar as stage_name_ar
      FROM subjects s
      JOIN grades g ON s.grade_id = g.id
      JOIN academic_stages st ON g.stage_id = st.id
      ORDER BY st.sort_order ASC, g.sort_order ASC, s.sort_order ASC
    `);
    return res.json(subjects.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب المواد الدراسية: ' + err.message });
  }
});

// Get subjects for a specific grade
router.get('/grades/:gradeId/subjects', async (req, res) => {
  try {
    const { gradeId } = req.params;
    const subjects = await db.query(
      'SELECT * FROM subjects WHERE grade_id = $1 ORDER BY sort_order ASC',
      [gradeId]
    );
    return res.json(subjects.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب المواد الدراسية' });
  }
});

// Get countries, governorates, and schools
router.get('/locations', async (req, res) => {
  try {
    const countries = await db.query('SELECT * FROM countries ORDER BY name_ar ASC');
    const governorates = await db.query('SELECT * FROM governorates ORDER BY name_ar ASC');
    const schools = await db.query('SELECT * FROM schools ORDER BY name_ar ASC');

    const result = countries.rows.map(country => ({
      ...country,
      governorates: governorates.rows
        .filter(gov => gov.country_id === country.id)
        .map(gov => ({
          ...gov,
          schools: schools.rows.filter(s => s.governorate_id === gov.id)
        }))
    }));

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب المواقع والمدارس' });
  }
});

// Get global platform settings (publicly accessible for branding and behavior)
router.get('/platform-settings', async (req, res) => {
  try {
    const rows = await db.query('SELECT setting_key, setting_value FROM platform_settings');
    const settings: Record<string, any> = {
      active_term: 1,
      allow_student_registration: true,
      active_grades: 'ALL',
      platform_logo: '/logo.png',
      monthly_exam_limit: 10,
      allow_subordinate_visibility: true
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
      } else {
        settings[r.setting_key] = r.setting_value;
      }
    }

    return res.json(settings);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب إعدادات المنظومة: ' + err.message });
  }
});

export default router;
