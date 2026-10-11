import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';

const EGYPTIAN_GOVERNORATES = [
  { ar: 'القاهرة', en: 'Cairo' },
  { ar: 'الجيزة', en: 'Giza' },
  { ar: 'الإسكندرية', en: 'Alexandria' },
  { ar: 'الدقهلية', en: 'Dakahlia' },
  { ar: 'البحر الأحمر', en: 'Red Sea' },
  { ar: 'البحيرة', en: 'Beheira' },
  { ar: 'الفيوم', en: 'Fayoum' },
  { ar: 'الغربية', en: 'Gharbia' },
  { ar: 'الإسماعيلية', en: 'Ismailia' },
  { ar: 'المنوفية', en: 'Monufia' },
  { ar: 'المنيا', en: 'Minya' },
  { ar: 'القليوبية', en: 'Qalyubia' },
  { ar: 'الوادي الجديد', en: 'New Valley' },
  { ar: 'السويس', en: 'Suez' },
  { ar: 'أسوان', en: 'Aswan' },
  { ar: 'أسيوط', en: 'Assiut' },
  { ar: 'بني سويف', en: 'Beni Suef' },
  { ar: 'بورسعيد', en: 'Port Said' },
  { ar: 'دمياط', en: 'Damietta' },
  { ar: 'الشرقية', en: 'Sharkia' },
  { ar: 'جنوب سيناء', en: 'South Sinai' },
  { ar: 'كفر الشيخ', en: 'Kafr El Sheikh' },
  { ar: 'مطروح', en: 'Matrouh' },
  { ar: 'الأقصر', en: 'Luxor' },
  { ar: 'قنا', en: 'Qena' },
  { ar: 'شمال سيناء', en: 'North Sinai' },
  { ar: 'سوهاج', en: 'Sohag' }
];

async function cleanResetDatabase() {
  console.log('🔄 Initializing Database Connection for Complete Clean Reset...');
  await db.init();

  // 1. Ensure schema modifications for multi-subject and multi-grade teacher profiles
  console.log('📦 Ensuring teacher_profiles schema has assigned_subjects and assigned_grades...');
  try {
    await db.query('ALTER TABLE teacher_profiles ADD COLUMN assigned_subjects TEXT NULL;');
    console.log('  ✓ Added assigned_subjects column to teacher_profiles');
  } catch (e: any) {
    console.log('  ℹ️ assigned_subjects column already exists or:', e.message);
  }

  try {
    await db.query('ALTER TABLE teacher_profiles ADD COLUMN assigned_grades TEXT NULL;');
    console.log('  ✓ Added assigned_grades column to teacher_profiles');
  } catch (e: any) {
    console.log('  ℹ️ assigned_grades column already exists or:', e.message);
  }

  // 2. Wipe ALL users, books, exams, evaluations, chunks, and attempts to start from real zero
  console.log('🧹 Wiping all user accounts, books, exams, chunks, and evaluations...');
  const wipeList = [
    'DELETE FROM student_answers;',
    'DELETE FROM exam_attempts;',
    'DELETE FROM ai_evaluations;',
    'DELETE FROM student_topic_mastery;',
    'DELETE FROM student_learning_history;',
    'DELETE FROM exam_question_options;',
    'DELETE FROM exam_questions;',
    'DELETE FROM exams;',
    'DELETE FROM question_bank_options;',
    'DELETE FROM question_bank_items;',
    'DELETE FROM question_banks;',
    'DELETE FROM book_chunks;',
    'DELETE FROM book_pdf_chunks;',
    'DELETE FROM file_upload_chunks;',
    'DELETE FROM book_pages;',
    'DELETE FROM book_chapters;',
    'DELETE FROM books;',
    'DELETE FROM student_profiles;',
    'DELETE FROM teacher_profiles;',
    'DELETE FROM users;'
  ];

  for (const sql of wipeList) {
    try {
      await db.query(sql);
      console.log(`  ✓ Executed: ${sql}`);
    } catch (err: any) {
      console.warn(`  ⚠️ Notice on ${sql}:`, err.message);
    }
  }

  // 3. Ensure Egypt and 27 Governorates exist
  console.log('🇪🇬 Verifying Egypt and 27 Governorates...');
  const egyptId = 'country-eg-001';
  try {
    await db.query(
      `INSERT INTO countries (id, code, name_ar, name_en) 
       VALUES ($1, 'EG', 'جمهورية مصر العربية', 'Egypt')
       ON DUPLICATE KEY UPDATE name_ar = VALUES(name_ar)`,
      [egyptId]
    );
  } catch (_) {
    try {
      await db.query(
        `INSERT OR IGNORE INTO countries (id, code, name_ar, name_en) 
         VALUES ($1, 'EG', 'جمهورية مصر العربية', 'Egypt')`,
        [egyptId]
      );
    } catch (e) {}
  }

  for (let i = 0; i < EGYPTIAN_GOVERNORATES.length; i++) {
    const gov = EGYPTIAN_GOVERNORATES[i];
    const govId = `gov-eg-${String(i + 1).padStart(2, '0')}`;
    try {
      await db.query(
        `INSERT INTO governorates (id, country_id, name_ar, name_en)
         VALUES ($1, $2, $3, $4)
         ON DUPLICATE KEY UPDATE name_ar = VALUES(name_ar)`,
        [govId, egyptId, gov.ar, gov.en]
      );
    } catch (_) {
      try {
        await db.query(
          `INSERT OR IGNORE INTO governorates (id, country_id, name_ar, name_en)
           VALUES ($1, $2, $3, $4)`,
          [govId, egyptId, gov.ar, gov.en]
        );
      } catch (e) {}
    }
  }

  // 4. Ensure Academic Stages (Primary, Preparatory, Secondary)
  console.log('🎓 Verifying Academic Stages and 12 Grades...');
  const stages = [
    { id: 'stage-primary', code: 'PRIMARY', name_ar: 'المرحلة الابتدائية', name_en: 'Primary Stage', sort: 1 },
    { id: '61998777-4c5f-4e51-bc0a-38de938c842a', code: 'PREPARATORY', name_ar: 'المرحلة الإعدادية', name_en: 'Preparatory Stage', sort: 2 },
    { id: 'stage-secondary', code: 'SECONDARY', name_ar: 'المرحلة الثانوية', name_en: 'Secondary Stage', sort: 3 }
  ];

  for (const s of stages) {
    try {
      await db.query(
        `INSERT INTO academic_stages (id, code, name_ar, name_en, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         ON DUPLICATE KEY UPDATE name_ar = VALUES(name_ar)`,
        [s.id, s.code, s.name_ar, s.name_en, s.sort]
      );
    } catch (_) {
      try {
        await db.query(
          `INSERT OR IGNORE INTO academic_stages (id, code, name_ar, name_en, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [s.id, s.code, s.name_ar, s.name_en, s.sort]
        );
      } catch (e) {}
    }
  }

  const prepStageId = '61998777-4c5f-4e51-bc0a-38de938c842a';
  const priStageId = 'stage-primary';
  const secStageId = 'stage-secondary';

  const gradesList = [
    { id: 'grade-pri-1', stageId: priStageId, code: 'PRIM_1', name_ar: 'الصف الأول الابتدائي', name_en: 'Primary 1', sort: 1 },
    { id: 'grade-pri-2', stageId: priStageId, code: 'PRIM_2', name_ar: 'الصف الثاني الابتدائي', name_en: 'Primary 2', sort: 2 },
    { id: 'grade-pri-3', stageId: priStageId, code: 'PRIM_3', name_ar: 'الصف الثالث الابتدائي', name_en: 'Primary 3', sort: 3 },
    { id: 'grade-pri-4', stageId: priStageId, code: 'PRIM_4', name_ar: 'الصف الرابع الابتدائي', name_en: 'Primary 4', sort: 4 },
    { id: 'grade-pri-5', stageId: priStageId, code: 'PRIM_5', name_ar: 'الصف الخامس الابتدائي', name_en: 'Primary 5', sort: 5 },
    { id: 'grade-pri-6', stageId: priStageId, code: 'PRIM_6', name_ar: 'الصف السادس الابتدائي', name_en: 'Primary 6', sort: 6 },
    { id: 'grade-prep-1', stageId: prepStageId, code: 'PREP_1', name_ar: 'الصف الأول الإعدادي', name_en: 'Prep 1', sort: 7 },
    { id: 'grade-prep-2', stageId: prepStageId, code: 'PREP_2', name_ar: 'الصف الثاني الإعدادي', name_en: 'Prep 2', sort: 8 },
    { id: '2f0f4f5a-7c5c-4136-a935-33c79effca3d', stageId: prepStageId, code: 'PREP_3', name_ar: 'الصف الثالث الإعدادي', name_en: 'Prep 3', sort: 9 },
    { id: 'grade-sec-1', stageId: secStageId, code: 'SEC_1', name_ar: 'الصف الأول الثانوي', name_en: 'Secondary 1', sort: 10 },
    { id: 'grade-sec-2', stageId: secStageId, code: 'SEC_2', name_ar: 'الصف الثاني الثانوي', name_en: 'Secondary 2', sort: 11 },
    { id: 'grade-sec-3', stageId: secStageId, code: 'SEC_3', name_ar: 'الصف الثالث الثانوي', name_en: 'Secondary 3', sort: 12 }
  ];

  for (const g of gradesList) {
    try {
      await db.query(
        `INSERT INTO grades (id, stage_id, code, name_ar, name_en, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON DUPLICATE KEY UPDATE name_ar = VALUES(name_ar)`,
        [g.id, g.stageId, g.code, g.name_ar, g.name_en, g.sort]
      );
    } catch (_) {
      try {
        await db.query(
          `INSERT OR IGNORE INTO grades (id, stage_id, code, name_ar, name_en, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [g.id, g.stageId, g.code, g.name_ar, g.name_en, g.sort]
        );
      } catch (e) {}
    }
  }

  // 5. Ensure core subjects exist for key grades (Prep 3, Prep 1, Prep 2, etc.)
  console.log('📚 Verifying Core Curriculum Subjects...');
  const coreSubjects = [
    { code: 'SCIENCE', name_ar: 'العلوم', name_en: 'Science', icon: 'Atom' },
    { code: 'MATH', name_ar: 'الرياضيات', name_en: 'Mathematics', icon: 'Calculator' },
    { code: 'ARABIC', name_ar: 'اللغة العربية', name_en: 'Arabic Language', icon: 'BookOpen' },
    { code: 'ENGLISH', name_ar: 'اللغة الإنجليزية', name_en: 'English Language', icon: 'Languages' },
    { code: 'SOCIAL_STUDIES', name_ar: 'الدراسات الاجتماعية', name_en: 'Social Studies', icon: 'Globe' }
  ];

  for (const g of gradesList) {
    for (const sub of coreSubjects) {
      const subId = `sub-${g.code.toLowerCase()}-${sub.code.toLowerCase()}`;
      try {
        await db.query(
          `INSERT INTO subjects (id, grade_id, code, name_ar, name_en, icon, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, 1)
           ON DUPLICATE KEY UPDATE name_ar = VALUES(name_ar)`,
          [subId, g.id, sub.code, sub.name_ar, sub.name_en, sub.icon]
        );
      } catch (_) {
        try {
          await db.query(
            `INSERT OR IGNORE INTO subjects (id, grade_id, code, name_ar, name_en, icon, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, 1)`,
            [subId, g.id, sub.code, sub.name_ar, sub.name_en, sub.icon]
          );
        } catch (e) {}
      }
    }
  }

  // 6. Seed the clean Initial Central Admin user (Owner)
  console.log('👑 Seeding clean Initial Owner/Admin user (admin@edu.eg)...');
  const passwordHash = await bcrypt.hash('123456', 10);
  const adminId = 'admin-owner-001';
  const adminPermissions = JSON.stringify({
    is_owner: true,
    can_upload_books: true,
    can_create_exams: true,
    can_delete_content: true,
    can_view_analytics: true
  });

  try {
    await db.query(
      `INSERT INTO users (
         id, super_id, email, username, password_hash, role, full_name, permissions, is_active
       ) VALUES ($1, 'SUPER-ADMIN-001', 'admin@edu.eg', 'admin', $2, 'ADMIN', 'إدارة المنصة (المالك)', $3, 1)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'ADMIN', is_active = 1`,
      [adminId, passwordHash, adminPermissions]
    );
  } catch (_) {
    try {
      await db.query(
        `INSERT OR IGNORE INTO users (
           id, super_id, email, username, password_hash, role, full_name, permissions, is_active
         ) VALUES ($1, 'SUPER-ADMIN-001', 'admin@edu.eg', 'admin', $2, 'ADMIN', 'إدارة المنصة (المالك)', $3, 1)`,
        [adminId, passwordHash, adminPermissions]
      );
    } catch (e) {}
  }

  // 7. Verify final counts
  const uCount = await db.query('SELECT COUNT(*) as c FROM users;');
  const bCount = await db.query('SELECT COUNT(*) as c FROM books;');
  const eCount = await db.query('SELECT COUNT(*) as c FROM exams;');
  const gCount = await db.query('SELECT COUNT(*) as c FROM grades;');
  const sCount = await db.query('SELECT COUNT(*) as c FROM subjects;');

  console.log('\n========================================');
  console.log('🎉 REAL CLEAN RESET COMPLETED SUCCESSFULLY!');
  console.log('========================================');
  console.log(`👤 Users count: ${uCount.rows[0]?.c ?? 0} (Only 1 Admin: admin@edu.eg)`);
  console.log(`📚 Books count: ${bCount.rows[0]?.c ?? 0} (Clean Zero)`);
  console.log(`📝 Exams count: ${eCount.rows[0]?.c ?? 0} (Clean Zero)`);
  console.log(`🎓 Grades count: ${gCount.rows[0]?.c ?? 0} (All 12 Grades Active)`);
  console.log(`📖 Subjects count: ${sCount.rows[0]?.c ?? 0} (All Core Subjects Configured)`);
  console.log('========================================\n');
}

cleanResetDatabase()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal Clean Reset Error:', err);
    process.exit(1);
  });
