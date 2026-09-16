import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/db.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// List question banks
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { stage_id, grade_id, subject_id } = req.query;
    let sql = `
      SELECT qb.*, s.name_ar as subject_name_ar, st.name_ar as stage_name_ar, g.name_ar as grade_name_ar,
             (SELECT COUNT(*) FROM question_bank_items qbi WHERE qbi.bank_id = qb.id) as questions_count
      FROM question_banks qb
      JOIN subjects s ON qb.subject_id = s.id
      JOIN academic_stages st ON qb.academic_stage_id = st.id
      JOIN grades g ON qb.grade_id = g.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (stage_id) {
      params.push(stage_id);
      conditions.push(`qb.academic_stage_id = $${params.length}`);
    }
    if (grade_id) {
      params.push(grade_id);
      conditions.push(`qb.grade_id = $${params.length}`);
    }
    if (subject_id) {
      params.push(subject_id);
      conditions.push(`qb.subject_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }

    sql += ` ORDER BY qb.created_at DESC`;
    const result = await db.query(sql, params);
    return res.json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب بنوك الأسئلة: ' + err.message });
  }
});

// Create question bank (Teacher/Admin)
router.post('/', authenticateToken, requireRole(['TEACHER', 'ADMIN']), async (req: AuthenticatedRequest, res) => {
  try {
    const { subject_id, academic_stage_id, grade_id, title, description } = req.body;
    if (!subject_id || !academic_stage_id || !grade_id || !title) {
      return res.status(400).json({ error: 'الرجاء إدخال الحقول الإلزامية لبنك الأسئلة' });
    }

    const bankId = uuidv4();
    await db.query(
      `INSERT INTO question_banks (id, subject_id, academic_stage_id, grade_id, title, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [bankId, subject_id, academic_stage_id, grade_id, title.trim(), description || null, req.user!.id]
    );

    return res.status(201).json({ message: 'تم إنشاء بنك الأسئلة بنجاح', id: bankId });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في إنشاء بنك الأسئلة' });
  }
});

// Get question bank items
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const bankRes = await db.query(`SELECT * FROM question_banks WHERE id = $1`, [id]);
    if (bankRes.rows.length === 0) {
      return res.status(404).json({ error: 'بنك الأسئلة غير موجود' });
    }

    const itemsRes = await db.query(
      `SELECT * FROM question_bank_items WHERE bank_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    const questionsWithOptions = await Promise.all(
      itemsRes.rows.map(async item => {
        const optionsRes = await db.query(
          `SELECT id, option_text, is_correct FROM question_bank_options WHERE question_item_id = $1`,
          [item.id]
        );
        return {
          ...item,
          options: optionsRes.rows
        };
      })
    );

    return res.json({
      bank: bankRes.rows[0],
      items: questionsWithOptions
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب محتويات بنك الأسئلة' });
  }
});

// Add item to question bank
router.post('/:id/items', authenticateToken, requireRole(['TEACHER', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      chapter_id,
      question_text,
      question_type = 'MULTIPLE_CHOICE',
      difficulty = 'MEDIUM',
      bloom_level = 'COMPREHENSION',
      explanation,
      page_reference,
      options
    } = req.body;

    if (!question_text || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'يجب إدخال نص السؤال وخيارين على الأقل' });
    }

    const itemId = uuidv4();
    await db.query(
      `INSERT INTO question_bank_items (
         id, bank_id, chapter_id, question_text, question_type, difficulty,
         bloom_level, explanation, page_reference
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        itemId,
        id,
        chapter_id || null,
        question_text.trim(),
        question_type,
        difficulty,
        bloom_level,
        explanation || null,
        page_reference ? parseInt(page_reference, 10) : null
      ]
    );

    for (const opt of options) {
      await db.query(
        `INSERT INTO question_bank_options (id, question_item_id, option_text, is_correct)
         VALUES ($1, $2, $3, $4)`,
        [uuidv4(), itemId, opt.option_text.trim(), opt.is_correct ? 1 : 0]
      );
    }

    return res.status(201).json({ message: 'تمت إضافة السؤال لبنك الأسئلة بنجاح', id: itemId });
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في إضافة السؤال' });
  }
});

export default router;
