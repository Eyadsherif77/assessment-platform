import dotenv from 'dotenv';
dotenv.config();
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

async function runResetAndMigrate() {
  console.log('🚀 Starting Database Migration & Clean Reset...');
  await db.init();

  // 1. Alter users table to ensure username column
  try {
    console.log('📦 Updating users table schema...');
    await db.query('ALTER TABLE users ADD COLUMN username VARCHAR(100) NULL;');
    console.log('✅ Added username column to users');
  } catch (e: any) {
    console.log('ℹ️ username column already exists or:', e.message);
  }

  // 2. Alter student_profiles table to ensure student_code, term, governorate_name
  try {
    console.log('📦 Updating student_profiles schema...');
    await db.query('ALTER TABLE student_profiles ADD COLUMN student_code VARCHAR(100) NULL;');
    console.log('✅ Added student_code to student_profiles');
  } catch (e: any) {
    console.log('ℹ️ student_code column already exists or:', e.message);
  }

  try {
    await db.query('ALTER TABLE student_profiles ADD COLUMN term VARCHAR(50) NULL;');
    console.log('✅ Added term to student_profiles');
  } catch (e: any) {
    console.log('ℹ️ term column already exists or:', e.message);
  }

  try {
    await db.query('ALTER TABLE student_profiles ADD COLUMN governorate_name VARCHAR(100) NULL;');
    console.log('✅ Added governorate_name to student_profiles');
  } catch (e: any) {
    console.log('ℹ️ governorate_name column already exists or:', e.message);
  }

  // 3. Clean Wipe all data (Reset to zero)
  console.log('🧹 Wiping all user, book, exam, and attempt data to start clean from zero...');
  const wipeStatements = [
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

  for (const sql of wipeStatements) {
    try {
      await db.query(sql);
      console.log(`  ✓ Executed: ${sql}`);
    } catch (err: any) {
      console.warn(`  ⚠️ Warning on ${sql}:`, err.message);
    }
  }

  // 4. Verify & Seed Egypt and 27 Governorates
  console.log('🇪🇬 Ensuring Egypt reference and 27 governorates exist...');
  const egyptId = 'country-eg-001';
  try {
    await db.query(
      `INSERT INTO countries (id, code, name_ar, name_en) 
       VALUES ($1, 'EG', 'جمهورية مصر العربية', 'Egypt')
       ON DUPLICATE KEY UPDATE name_ar = VALUES(name_ar)`,
      [egyptId]
    );
  } catch (_) {
    // SQLite syntax fallback if needed
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

  // 5. Verify Prep Stage and Prep 3 Grade
  console.log('🎓 Ensuring Preparatory stage and Prep 3 grade are active...');
  const prepStageId = '61998777-4c5f-4e51-bc0a-38de938c842a';
  const prep3GradeId = '2f0f4f5a-7c5c-4136-a935-33c79effca3d';

  try {
    await db.query(
      `INSERT INTO academic_stages (id, code, name_ar, name_en, sort_order)
       VALUES ($1, 'PREPARATORY', 'المرحلة الإعدادية', 'Preparatory Stage', 2)
       ON DUPLICATE KEY UPDATE name_ar = VALUES(name_ar)`,
      [prepStageId]
    );
  } catch (_) {}

  try {
    await db.query(
      `INSERT INTO grades (id, stage_id, code, name_ar, name_en, sort_order)
       VALUES ($1, $2, 'PREP_3', 'الصف الثالث الإعدادي', 'Preparatory 3 (Grade 9)', 3)
       ON DUPLICATE KEY UPDATE name_ar = VALUES(name_ar)`,
      [prep3GradeId, prepStageId]
    );
  } catch (_) {}

  // 6. Verify Counts
  const uCount = await db.query('SELECT COUNT(*) as c FROM users;');
  const bCount = await db.query('SELECT COUNT(*) as c FROM books;');
  const gCount = await db.query('SELECT COUNT(*) as c FROM governorates;');
  console.log(`\n🎉 Reset Complete!`);
  console.log(`   - Users count: ${uCount.rows[0]?.c ?? 0}`);
  console.log(`   - Books count: ${bCount.rows[0]?.c ?? 0}`);
  console.log(`   - Governorates count: ${gCount.rows[0]?.c ?? 0}`);
  process.exit(0);
}

runResetAndMigrate().catch(err => {
  console.error('Fatal Migration Error:', err);
  process.exit(1);
});
