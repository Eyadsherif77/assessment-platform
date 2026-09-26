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

export default router;
