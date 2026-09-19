import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

export async function seedDatabase(): Promise<void> {
  try {
    // Ensure Secondary grades SEC_2 and SEC_3 always exist
    try {
      const secStageRes = await db.query(`SELECT id FROM academic_stages WHERE code = 'SECONDARY'`);
      if (secStageRes.rows.length > 0) {
        const secStageId = secStageRes.rows[0].id;
        const sec2Check = await db.query(`SELECT id FROM grades WHERE code = 'SEC_2'`);
        if (sec2Check.rows.length === 0) {
          await db.query(
            `INSERT INTO grades (id, stage_id, code, name_ar, name_en, sort_order) VALUES ($1, $2, 'SEC_2', 'الصف الثاني الثانوي', 'Secondary 2 (Grade 11)', 2)`,
            [uuidv4(), secStageId]
          );
        }
        const sec3Check = await db.query(`SELECT id FROM grades WHERE code = 'SEC_3'`);
        if (sec3Check.rows.length === 0) {
          await db.query(
            `INSERT INTO grades (id, stage_id, code, name_ar, name_en, sort_order) VALUES ($1, $2, 'SEC_3', 'الصف الثالث الثانوي', 'Secondary 3 (Grade 12)', 3)`,
            [uuidv4(), secStageId]
          );
        }
      }
    } catch (e) {
      console.warn('Grade sync note:', e);
    }

    // Always ensure Admin / Owner user exists
    try {
      const adminCheck = await db.query(`SELECT id FROM users WHERE email = 'admin@edu.eg'`);
      const passwordHash = await bcrypt.hash('123456', 10);
      if (adminCheck.rows.length === 0) {
        await db.query(
          `INSERT INTO users (id, super_id, email, password_hash, role, full_name, permissions) VALUES ($1, 'SUPER-ADMIN-001', 'admin@edu.eg', $2, 'ADMIN', 'إدارة المنصة (المالك)', '{"is_owner":true}')`,
          [uuidv4(), passwordHash]
        );
        console.log('👑 Admin user initialized: admin@edu.eg (superid: SUPER-ADMIN-001)');
      } else {
        await db.query(`UPDATE users SET super_id = 'SUPER-ADMIN-001' WHERE email = 'admin@edu.eg'`);
      }

      // Always ensure Teacher hybrid_id and permissions are populated
      const defaultTeacherPerms = JSON.stringify({
        can_upload_books: true,
        can_create_exams: true,
        can_delete_content: true,
        can_view_analytics: true,
        is_active: true
      });
      await db.query(
        `UPDATE users SET hybrid_id = 'HYBRID-TEA-SCI-01', permissions = $1 WHERE email = 'teacher@edu.eg' AND (hybrid_id IS NULL OR hybrid_id = '')`,
        [defaultTeacherPerms]
      );

      // Always ensure Prep 2 (Grade 8) curriculum & textbook are seeded
      const prep2GradeRes = await db.query(`SELECT id, stage_id FROM grades WHERE code = 'PREP_2'`);
      if (prep2GradeRes.rows.length > 0) {
        const prep2Id = prep2GradeRes.rows[0].id;
        const prepStageId = prep2GradeRes.rows[0].stage_id;

        // 1. Prep 2 Subjects
        const p2Subjects = [
          { code: 'SCIENCE', name_ar: 'العلوم', name_en: 'Science', icon: 'Atom', sort_order: 1 },
          { code: 'MATH', name_ar: 'الرياضيات', name_en: 'Mathematics', icon: 'Calculator', sort_order: 2 },
          { code: 'ARABIC', name_ar: 'اللغة العربية', name_en: 'Arabic Language', icon: 'BookOpen', sort_order: 3 },
          { code: 'ENGLISH', name_ar: 'اللغة الإنجليزية', name_en: 'English Language', icon: 'Languages', sort_order: 4 }
        ];

        for (const sub of p2Subjects) {
          const subCheck = await db.query(
            `SELECT id FROM subjects WHERE grade_id = $1 AND code = $2`,
            [prep2Id, sub.code]
          );
          if (subCheck.rows.length === 0) {
            await db.query(
              `INSERT INTO subjects (id, grade_id, code, name_ar, name_en, icon, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [uuidv4(), prep2Id, sub.code, sub.name_ar, sub.name_en, sub.icon, sub.sort_order]
            );
          }
        }

        const p2SciSub = await db.query(
          `SELECT id FROM subjects WHERE grade_id = $1 AND code = 'SCIENCE'`,
          [prep2Id]
        );
        const prep2ScienceId = p2SciSub.rows[0]?.id;

        // Teacher id
        const teacherRes = await db.query(`SELECT id FROM users WHERE email = 'teacher@edu.eg'`);
        const teacherId = teacherRes.rows[0]?.id || null;



        // 3. Ensure student2 (Prep 2) profile is fully linked
        const s2Check = await db.query(`SELECT id FROM users WHERE email = 'student2@edu.eg'`);
        const passHash = await bcrypt.hash('123456', 10);
        let s2UserId = s2Check.rows[0]?.id;
        if (!s2UserId) {
          s2UserId = uuidv4();
          await db.query(
            `INSERT INTO users (id, email, password_hash, role, full_name) VALUES ($1, 'student2@edu.eg', $2, 'STUDENT', 'سارة محمد الشريف')`,
            [s2UserId, passHash]
          );
          await db.query(
            `INSERT INTO student_profiles (user_id, full_name, school_name, academic_stage_id, grade_id, school_type)
             VALUES ($1, 'سارة محمد الشريف', 'مدرسة النيل الإعدادية الحديثة', $2, $3, 'عربي')`,
            [s2UserId, prepStageId, prep2Id]
          );
        } else {
          await db.query(
            `UPDATE student_profiles SET academic_stage_id = $1, grade_id = $2 WHERE user_id = $3`,
            [prepStageId, prep2Id, s2UserId]
          );
        }
      }
    } catch (e) {
      console.warn('Admin/Teacher/Prep2 sync note:', e);
    }

    const existingStages = await db.query('SELECT COUNT(*) as count FROM academic_stages');
    if (parseInt(existingStages.rows[0].count, 10) > 0) {
      console.log('🌱 Database already seeded with academic stages. Skipping initial seed.');
      return;
    }

    console.log('🌱 Seeding database with official curriculum, demo accounts, and textbook chunks...');

    // 1. Countries
    const egyptId = uuidv4();
    const ksaId = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO countries (id, code, name_ar, name_en) VALUES ($1, 'EG', 'جمهورية مصر العربية', 'Egypt')`,
      [egyptId]
    );
    await db.query(
      `INSERT OR IGNORE INTO countries (id, code, name_ar, name_en) VALUES ($1, 'SA', 'المملكة العربية السعودية', 'Saudi Arabia')`,
      [ksaId]
    );

    // 2. Governorates
    const cairoId = uuidv4();
    const gizaId = uuidv4();
    const alexId = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO governorates (id, country_id, name_ar, name_en) VALUES ($1, $2, 'محافظة القاهرة', 'Cairo Governorate')`,
      [cairoId, egyptId]
    );
    await db.query(
      `INSERT OR IGNORE INTO governorates (id, country_id, name_ar, name_en) VALUES ($1, $2, 'محافظة الجيزة', 'Giza Governorate')`,
      [gizaId, egyptId]
    );
    await db.query(
      `INSERT OR IGNORE INTO governorates (id, country_id, name_ar, name_en) VALUES ($1, $2, 'محافظة الإسكندرية', 'Alexandria Governorate')`,
      [alexId, egyptId]
    );

    // 3. Schools
    const school1Id = uuidv4();
    const school2Id = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO schools (id, governorate_id, name_ar, name_en) VALUES ($1, $2, 'مدرسة المتفوقين الرسمية لغات', 'Excellence Official Language School')`,
      [school1Id, cairoId]
    );
    await db.query(
      `INSERT OR IGNORE INTO schools (id, governorate_id, name_ar, name_en) VALUES ($1, $2, 'مدرسة النيل الإعدادية الحديثة', 'Al-Neel Modern Preparatory School')`,
      [school2Id, cairoId]
    );

    // 4. Academic Stages
    const primaryId = uuidv4();
    const prepId = uuidv4();
    const secId = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO academic_stages (id, code, name_ar, name_en, sort_order) VALUES ($1, 'PRIMARY', 'المرحلة الابتدائية', 'Primary Education', 1)`,
      [primaryId]
    );
    await db.query(
      `INSERT OR IGNORE INTO academic_stages (id, code, name_ar, name_en, sort_order) VALUES ($1, 'PREPARATORY', 'المرحلة الإعدادية', 'Preparatory Education', 2)`,
      [prepId]
    );
    await db.query(
      `INSERT OR IGNORE INTO academic_stages (id, code, name_ar, name_en, sort_order) VALUES ($1, 'SECONDARY', 'المرحلة الثانوية', 'Secondary Education', 3)`,
      [secId]
    );

    // 5. Grades
    const prep1Id = uuidv4();
    const prep2Id = uuidv4();
    const prep3Id = uuidv4();
    const sec1Id = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO grades (id, stage_id, code, name_ar, name_en, sort_order) VALUES ($1, $2, 'PREP_1', 'الصف الأول الإعدادي', 'Prep 1 (Grade 7)', 1)`,
      [prep1Id, prepId]
    );
    await db.query(
      `INSERT OR IGNORE INTO grades (id, stage_id, code, name_ar, name_en, sort_order) VALUES ($1, $2, 'PREP_2', 'الصف الثاني الإعدادي', 'Prep 2 (Grade 8)', 2)`,
      [prep2Id, prepId]
    );
    await db.query(
      `INSERT OR IGNORE INTO grades (id, stage_id, code, name_ar, name_en, sort_order) VALUES ($1, $2, 'PREP_3', 'الصف الثالث الإعدادي', 'Prep 3 (Grade 9)', 3)`,
      [prep3Id, prepId]
    );
    await db.query(
      `INSERT OR IGNORE INTO grades (id, stage_id, code, name_ar, name_en, sort_order) VALUES ($1, $2, 'SEC_1', 'الصف الأول الثانوي', 'Secondary 1 (Grade 10)', 1)`,
      [sec1Id, secId]
    );

    // 6. Subjects for Prep 1
    const scienceId = uuidv4();
    const mathId = uuidv4();
    const arabicId = uuidv4();
    const englishId = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO subjects (id, grade_id, code, name_ar, name_en, icon, sort_order) VALUES ($1, $2, 'SCIENCE', 'العلوم', 'Science', 'Atom', 1)`,
      [scienceId, prep1Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO subjects (id, grade_id, code, name_ar, name_en, icon, sort_order) VALUES ($1, $2, 'MATH', 'الرياضيات', 'Mathematics', 'Calculator', 2)`,
      [mathId, prep1Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO subjects (id, grade_id, code, name_ar, name_en, icon, sort_order) VALUES ($1, $2, 'ARABIC', 'اللغة العربية', 'Arabic Language', 'BookOpen', 3)`,
      [arabicId, prep1Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO subjects (id, grade_id, code, name_ar, name_en, icon, sort_order) VALUES ($1, $2, 'ENGLISH', 'اللغة الإنجليزية', 'English Language', 'Languages', 4)`,
      [englishId, prep1Id]
    );

    // 7. Users & Profiles
    const passwordHash = await bcrypt.hash('123456', 10);

    // Platform Owner / SuperAdmin (superid architecture)
    const adminId = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO users (id, super_id, email, password_hash, role, full_name, permissions) VALUES ($1, 'SUPER-ADMIN-001', 'admin@edu.eg', $2, 'ADMIN', 'إدارة المنصة (المالك)', '{"is_owner":true}')`,
      [adminId, passwordHash]
    );
    // Ensure existing admin has super_id
    await db.query(
      `UPDATE users SET super_id = 'SUPER-ADMIN-001' WHERE email = 'admin@edu.eg' AND (super_id IS NULL OR super_id = '')`
    );

    // Demo Teacher (hybrid_id architecture + permissions)
    const teacherId = uuidv4();
    const defaultTeacherPermissions = JSON.stringify({
      can_upload_books: true,
      can_create_exams: true,
      can_delete_content: true,
      can_view_analytics: true,
      is_active: true
    });

    await db.query(
      `INSERT OR IGNORE INTO users (id, hybrid_id, email, password_hash, role, full_name, permissions) VALUES ($1, 'HYBRID-TEA-SCI-01', 'teacher@edu.eg', $2, 'TEACHER', 'أ. محمود عبد الرحمن', $3)`,
      [teacherId, passwordHash, defaultTeacherPermissions]
    );
    // Ensure existing teacher has hybrid_id and permissions
    await db.query(
      `UPDATE users SET hybrid_id = 'HYBRID-TEA-SCI-01', permissions = $1 WHERE email = 'teacher@edu.eg' AND (hybrid_id IS NULL OR hybrid_id = '')`,
      [defaultTeacherPermissions]
    );

    await db.query(
      `INSERT OR IGNORE INTO teacher_profiles (user_id, full_name, school_id, school_name, specialization) VALUES ($1, 'أ. محمود عبد الرحمن', $2, 'مدرسة المتفوقين الرسمية لغات', 'معلم أول مادة العلوم')`,
      [teacherId, school1Id]
    );

    // Demo Student 1 (Prep 1)
    const student1Id = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO users (id, email, password_hash, role, full_name) VALUES ($1, 'student@edu.eg', $2, 'STUDENT', 'أحمد علي إبراهيم')`,
      [student1Id, passwordHash]
    );
    await db.query(
      `INSERT OR IGNORE INTO student_profiles (user_id, full_name, country_id, governorate_id, school_id, school_name, academic_stage_id, grade_id) VALUES ($1, 'أحمد علي إبراهيم', $2, $3, $4, 'مدرسة المتفوقين الرسمية لغات', $5, $6)`,
      [student1Id, egyptId, cairoId, school1Id, prepId, prep1Id]
    );

    // Demo Student 2 (Prep 2) - For testing strict grade isolation
    const student2Id = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO users (id, email, password_hash, role, full_name) VALUES ($1, 'student2@edu.eg', $2, 'STUDENT', 'سارة محمد الشريف')`,
      [student2Id, passwordHash]
    );
    await db.query(
      `INSERT OR IGNORE INTO student_profiles (user_id, full_name, country_id, governorate_id, school_id, school_name, academic_stage_id, grade_id) VALUES ($1, 'سارة محمد الشريف', $2, $3, $4, 'مدرسة النيل الإعدادية الحديثة', $5, $6)`,
      [student2Id, egyptId, cairoId, school2Id, prepId, prep2Id]
    );



    console.log('✅ Seed completed successfully! Demo accounts ready:');
    console.log('   👑 Owner/Admin: admin@edu.eg / 123456 (superid: SUPER-ADMIN-001)');
    console.log('   👩‍🏫 Teacher: teacher@edu.eg / 123456 (hybrid_id: HYBRID-TEA-SCI-01)');
    console.log('   👨‍🎓 Student 1 (Prep 1): student@edu.eg / 123456 (id only)');
    console.log('   👩‍🎓 Student 2 (Prep 2): student2@edu.eg / 123456 (id only)');
  } catch (error) {
    console.error('❌ Error during database seeding:', error);
  }
}

