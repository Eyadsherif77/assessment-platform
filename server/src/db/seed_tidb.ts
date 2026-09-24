import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

export async function seedTiDB(): Promise<void> {
  console.log('🌱 Connecting to TiDB Cloud for seeding...');
  const pool = mysql.createPool({
    host: process.env.TIDB_HOST || 'gateway01.ap-northeast-1.prod.aws.tidbcloud.com',
    port: parseInt(process.env.TIDB_PORT || '4000', 10),
    user: process.env.TIDB_USER || '2kR2JL3LpY5osZZ.root',
    password: process.env.TIDB_PASSWORD || 'ixY87b7ytYiR4Shu',
    database: process.env.TIDB_DATABASE || 'assessment_platform',
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 10
  });

  try {
    const passwordHash = await bcrypt.hash('123456', 10);

    // 1. Countries
    const countryId = uuidv4();
    const [cRows]: any = await pool.query('SELECT id FROM countries WHERE code = ?', ['EG']);
    let cId = cRows[0]?.id;
    if (!cId) {
      cId = countryId;
      await pool.query(
        'INSERT INTO countries (id, code, name_ar, name_en) VALUES (?, ?, ?, ?)',
        [cId, 'EG', 'جمهورية مصر العربية', 'Egypt']
      );
    }

    // 2. Governorates
    const [gRows]: any = await pool.query('SELECT id FROM governorates WHERE country_id = ?', [cId]);
    let cairoId = gRows[0]?.id;
    if (!cairoId) {
      cairoId = uuidv4();
      await pool.query(
        'INSERT INTO governorates (id, country_id, name_ar, name_en) VALUES (?, ?, ?, ?)',
        [cairoId, cId, 'القاهرة', 'Cairo']
      );
    }

    // 3. Schools
    const [sRows]: any = await pool.query('SELECT id FROM schools WHERE governorate_id = ?', [cairoId]);
    let schoolId = sRows[0]?.id;
    if (!schoolId) {
      schoolId = uuidv4();
      await pool.query(
        'INSERT INTO schools (id, governorate_id, name_ar, name_en) VALUES (?, ?, ?, ?)',
        [schoolId, cairoId, 'مدرسة النصر الرسمية للغات', 'Al-Nasr Official Language School']
      );
    }

    // 4. Academic Stages
    const stages = [
      { code: 'PRIMARY', name_ar: 'المرحلة الابتدائية', name_en: 'Primary Stage', sort: 1 },
      { code: 'PREPARATORY', name_ar: 'المرحلة الإعدادية', name_en: 'Preparatory Stage', sort: 2 },
      { code: 'SECONDARY', name_ar: 'المرحلة الثانوية', name_en: 'Secondary Stage', sort: 3 }
    ];

    const stageMap = new Map<string, string>();
    for (const s of stages) {
      const [rows]: any = await pool.query('SELECT id FROM academic_stages WHERE code = ?', [s.code]);
      let sId = rows[0]?.id;
      if (!sId) {
        sId = uuidv4();
        await pool.query(
          'INSERT INTO academic_stages (id, code, name_ar, name_en, sort_order) VALUES (?, ?, ?, ?, ?)',
          [sId, s.code, s.name_ar, s.name_en, s.sort]
        );
      }
      stageMap.set(s.code, sId);
    }

    // 5. Grades
    const prepStageId = stageMap.get('PREPARATORY')!;
    const priStageId = stageMap.get('PRIMARY')!;
    const secStageId = stageMap.get('SECONDARY')!;

    const gradesList = [
      { stageId: priStageId, code: 'PRI_4', name_ar: 'الصف الرابع الابتدائي', name_en: 'Primary 4 (Grade 4)', sort: 1 },
      { stageId: priStageId, code: 'PRI_5', name_ar: 'الصف الخامس الابتدائي', name_en: 'Primary 5 (Grade 5)', sort: 2 },
      { stageId: priStageId, code: 'PRI_6', name_ar: 'الصف السادس الابتدائي', name_en: 'Primary 6 (Grade 6)', sort: 3 },
      { stageId: prepStageId, code: 'PREP_1', name_ar: 'الصف الأول الإعدادي', name_en: 'Preparatory 1 (Grade 7)', sort: 1 },
      { stageId: prepStageId, code: 'PREP_2', name_ar: 'الصف الثاني الإعدادي', name_en: 'Preparatory 2 (Grade 8)', sort: 2 },
      { stageId: prepStageId, code: 'PREP_3', name_ar: 'الصف الثالث الإعدادي', name_en: 'Preparatory 3 (Grade 9)', sort: 3 },
      { stageId: secStageId, code: 'SEC_1', name_ar: 'الصف الأول الثانوي', name_en: 'Secondary 1 (Grade 10)', sort: 1 },
      { stageId: secStageId, code: 'SEC_2', name_ar: 'الصف الثاني الثانوي', name_en: 'Secondary 2 (Grade 11)', sort: 2 },
      { stageId: secStageId, code: 'SEC_3', name_ar: 'الصف الثالث الثانوي', name_en: 'Secondary 3 (Grade 12)', sort: 3 }
    ];

    const gradeMap = new Map<string, string>();
    for (const g of gradesList) {
      const [rows]: any = await pool.query('SELECT id FROM grades WHERE code = ?', [g.code]);
      let gId = rows[0]?.id;
      if (!gId) {
        gId = uuidv4();
        await pool.query(
          'INSERT INTO grades (id, stage_id, code, name_ar, name_en, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
          [gId, g.stageId, g.code, g.name_ar, g.name_en, g.sort]
        );
      }
      gradeMap.set(g.code, gId);
    }

    // 6. Subjects for Prep 1 and Prep 2
    const prep1Id = gradeMap.get('PREP_1')!;
    const prep2Id = gradeMap.get('PREP_2')!;
    const prep3Id = gradeMap.get('PREP_3')!;

    const prepSubjects = [
      { code: 'SCIENCE', name_ar: 'العلوم', name_en: 'Science', icon: 'Atom', sort: 1 },
      { code: 'MATH', name_ar: 'الرياضيات', name_en: 'Mathematics', icon: 'Calculator', sort: 2 },
      { code: 'ARABIC', name_ar: 'اللغة العربية', name_en: 'Arabic Language', icon: 'BookOpen', sort: 3 },
      { code: 'ENGLISH', name_ar: 'اللغة الإنجليزية', name_en: 'English Language', icon: 'Languages', sort: 4 }
    ];

    for (const gid of [prep1Id, prep2Id, prep3Id]) {
      for (const sub of prepSubjects) {
        const [rows]: any = await pool.query('SELECT id FROM subjects WHERE grade_id = ? AND code = ?', [gid, sub.code]);
        if (rows.length === 0) {
          await pool.query(
            'INSERT INTO subjects (id, grade_id, code, name_ar, name_en, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [uuidv4(), gid, sub.code, sub.name_ar, sub.name_en, sub.icon, sub.sort]
          );
        }
      }
    }

    // 7. Users
    // Admin
    const [adminRows]: any = await pool.query('SELECT id FROM users WHERE email = ?', ['admin@edu.eg']);
    let adminId = adminRows[0]?.id;
    if (!adminId) {
      adminId = uuidv4();
      await pool.query(
        'INSERT INTO users (id, super_id, email, password_hash, role, full_name, permissions) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [adminId, 'SUPER-ADMIN-001', 'admin@edu.eg', passwordHash, 'ADMIN', 'إدارة المنصة (المالك)', '{"is_owner":true}']
      );
      console.log('👑 Admin seeded: admin@edu.eg');
    }

    // Teacher
    const [teacherRows]: any = await pool.query('SELECT id FROM users WHERE email = ?', ['teacher@edu.eg']);
    let teacherId = teacherRows[0]?.id;
    if (!teacherId) {
      teacherId = uuidv4();
      const perms = JSON.stringify({
        can_upload_books: true,
        can_create_exams: true,
        can_delete_content: true,
        can_view_analytics: true,
        is_active: true
      });
      await pool.query(
        'INSERT INTO users (id, hybrid_id, email, password_hash, role, full_name, permissions) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [teacherId, 'HYBRID-TEA-SCI-01', 'teacher@edu.eg', passwordHash, 'TEACHER', 'أستاذ أحمد محمود (معلم خبير علوم)', perms]
      );
      await pool.query(
        'INSERT INTO teacher_profiles (user_id, full_name, school_id, school_name, specialization) VALUES (?, ?, ?, ?, ?)',
        [teacherId, 'أستاذ أحمد محمود (معلم خبير علوم)', schoolId, 'مدرسة النصر الرسمية للغات', 'العلوم والفيزياء']
      );
      console.log('👩‍🏫 Teacher seeded: teacher@edu.eg');
    }

    // 8. Seed Hierarchy Accounts in TiDB
    const [cairoGovRows]: any = await pool.query("SELECT id FROM governorates WHERE name_ar LIKE '%قاهرة%' OR name_en LIKE '%Cairo%' LIMIT 1");
    const cairoGovId = cairoGovRows[0]?.id || 'gov-eg-01';

    const [arabicSubRows]: any = await pool.query("SELECT id FROM subjects WHERE code = 'ARABIC' OR name_ar LIKE '%عرب%' LIMIT 1");
    const arabicSubId = arabicSubRows[0]?.id || null;

    // Central Admin
    const [centralRows]: any = await pool.query('SELECT id FROM users WHERE email = ?', ['central@edu.eg']);
    let centralAdminId = centralRows[0]?.id;
    if (!centralAdminId) {
      centralAdminId = uuidv4();
      await pool.query(
        'INSERT INTO users (id, super_id, email, password_hash, role, full_name, permissions) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [centralAdminId, 'SUPER-CENTRAL-001', 'central@edu.eg', passwordHash, 'CENTRAL_ADMIN', 'الأمين المركزي العام للجمهورية', '{"can_view_all_governorates":true,"can_manage_gov_admins":true,"can_view_exams":true}']
      );
      console.log('🏛️ Central Admin seeded in TiDB: central@edu.eg');
    }

    // Cairo Governorate Admin
    const [gRows2]: any = await pool.query('SELECT id FROM users WHERE email = ?', ['gov.cairo@edu.eg']);
    let govAdminId = gRows2[0]?.id;
    if (!govAdminId) {
      govAdminId = uuidv4();
      await pool.query(
        'INSERT INTO users (id, super_id, email, password_hash, role, full_name, governorate_id, created_by, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [govAdminId, 'SUPER-GOV-CAI-01', 'gov.cairo@edu.eg', passwordHash, 'GOVERNORATE_ADMIN', 'أمين محافظة القاهرة (التعليم العام)', cairoGovId, centralAdminId, '{"can_view_gov_exams":true,"can_manage_supervisors":true}']
      );
      console.log('🏢 Governorate Admin seeded in TiDB: gov.cairo@edu.eg');
    }

    // Cairo Arabic Supervisor
    const [supRows]: any = await pool.query('SELECT id FROM users WHERE email = ?', ['sup.arabic.cairo@edu.eg']);
    let supId = supRows[0]?.id;
    if (!supId) {
      supId = uuidv4();
      await pool.query(
        'INSERT INTO users (id, super_id, email, password_hash, role, full_name, governorate_id, subject_id, created_by, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [supId, 'HYB-SUP-ARA-01', 'sup.arabic.cairo@edu.eg', passwordHash, 'SUPERVISOR', 'الموجه الأول للغة العربية - القاهرة', cairoGovId, arabicSubId, govAdminId, '{"can_view_subject_exams":true,"can_manage_teachers":true}']
      );
      console.log('📐 Arabic Supervisor seeded in TiDB: sup.arabic.cairo@edu.eg');
    }

    // Link teacher and exams to Cairo
    await pool.query(
      'UPDATE users SET governorate_id = ?, subject_id = ?, created_by = ? WHERE email = ? AND (governorate_id IS NULL OR governorate_id = "")',
      [cairoGovId, arabicSubId, supId, 'teacher@edu.eg']
    );
    await pool.query(
      'UPDATE exams SET governorate_id = ? WHERE governorate_id IS NULL OR governorate_id = ""',
      [cairoGovId]
    );

    // Demo Students
    const studentList = [
      { email: 'prep1@edu.eg', name: 'زياد محمد الشريف', gradeCode: 'PREP_1' },
      { email: 'prep2@edu.eg', name: 'عمر شريف علي', gradeCode: 'PREP_2' },
      { email: 'prep3@edu.eg', name: 'مريم أحمد حسان', gradeCode: 'PREP_3' }
    ];

    for (const st of studentList) {
      const [stRows]: any = await pool.query('SELECT id FROM users WHERE email = ?', [st.email]);
      if (stRows.length === 0) {
        const sUserId = uuidv4();
        const gId = gradeMap.get(st.gradeCode)!;
        await pool.query(
          'INSERT INTO users (id, email, password_hash, role, full_name) VALUES (?, ?, ?, ?, ?)',
          [sUserId, st.email, passwordHash, 'STUDENT', st.name]
        );
        await pool.query(
          'INSERT INTO student_profiles (user_id, full_name, school_id, school_name, academic_stage_id, grade_id, school_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [sUserId, st.name, schoolId, 'مدرسة النصر الرسمية للغات', prepStageId, gId, 'كلاهما']
        );
        console.log(`👨‍🎓 Student seeded: ${st.email} (${st.gradeCode})`);
      }
    }



    console.log('🎉 TiDB Cloud Database fully seeded and operational!');
    await pool.end();
  } catch (err) {
    console.error('❌ Seeding error:', err);
    await pool.end();
    throw err;
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed_tidb.ts')) {
  seedTiDB().then(() => process.exit(0)).catch(() => process.exit(1));
}
