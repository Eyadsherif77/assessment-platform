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

    // 8. Prep 1 Science Book & Chapters & Chunks
    const [p1SciRows]: any = await pool.query('SELECT id FROM subjects WHERE grade_id = ? AND code = ?', [prep1Id, 'SCIENCE']);
    const prep1ScienceId = p1SciRows[0]?.id;

    if (prep1ScienceId) {
      const [bRows]: any = await pool.query('SELECT id FROM books WHERE grade_id = ? AND subject_id = ?', [prep1Id, prep1ScienceId]);
      let prep1BookId = bRows[0]?.id;
      if (!prep1BookId) {
        prep1BookId = uuidv4();
        await pool.query(
          `INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, teacher_id, file_url, file_size, total_pages, processing_status, school_type)
           VALUES (?, 'كتاب العلوم المنهجي - الصف الأول الإعدادي', 'Prep 1 Science Textbook', ?, ?, ?, ?, '/uploads/prep1_science.pdf', 14500000, 48, 'COMPLETED', 'كلاهما')`,
          [prep1BookId, prepStageId, prep1Id, prep1ScienceId, teacherId]
        );

        const ch1Id = uuidv4();
        const ch2Id = uuidv4();
        const ch3Id = uuidv4();

        await pool.query(
          `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, description, start_page, end_page)
           VALUES (?, ?, 1, 'المادة وخواصها الفيزيائية والكيميائية', 'Matter and Its Physical and Chemical Properties', 'المادة، الكتلة، الحجم، الكثافة وتطبيقاتها الحياتية، ودرجة الانصهار والغليان والتوصيل الحراري والكهربي.', 1, 16)`,
          [ch1Id, prep1BookId]
        );
        await pool.query(
          `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, description, start_page, end_page)
           VALUES (?, ?, 2, 'تركيب المادة والذرة', 'Structure of Matter and the Atom', 'الجزيئات والذرات، حركة الجزيئات، التركيب الذري للمادة، ومستويات الطاقة والتوزيع الإلكتروني.', 17, 32)`,
          [ch2Id, prep1BookId]
        );
        await pool.query(
          `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, description, start_page, end_page)
           VALUES (?, ?, 3, 'الطاقة: مصادرها وصورها وتحولاتها', 'Energy: Sources, Forms, and Transformations', 'مفهوم الطاقة والشغل، طاقة الوضع والحركة، قانون بقاء الطاقة الميكانيكية، وتحولات الطاقة في التطبيقات الحياتية.', 33, 48)`,
          [ch3Id, prep1BookId]
        );

        // Prep 1 Chapter 1 Chunks
        const chunk1 = `الوحدة الأولى: المادة وتركيبها
الدرس الأول: المادة وخواصها (صفحة 4)
المادة هي كل ما له كتلة وحجم ويشغل حيزاً من الفراغ.
الكتلة: مقدار ما يحتويه الجسم من مادة وتُقاس بوحدة الجرام (g) أو الكيلوجرام (kg).
الحجم: الحيز الذي يشغله الجسم من الفراغ ويُقاس بوحدة السنتيمتر المكعب (cm³) أو اللتر.
تختلف المواد عن بعضها في خواص فيزيائية وكيميائية متعددة منها: اللون والطعم والرائحة، الكثافة، درجة الانصهار، درجة الغليان، درجة الصلابة، والتوصيل الكهربي والحراري.`;

        const chunk2 = `الدرس الأول: المادة وخواصها (صفحة 7)
تطبيقات حياتية على الكثافة:
1. لا يستخدم الماء في إطفاء حرائق البترول لأن كثافة البترول أقل من كثافة الماء فيطفو البترول فوق سطح الماء ويظل الحريق مشتعلاً.
2. تملأ بالونات الاحتفالات بغاز الهيليوم أو الهيدروجين لترتفع إلى أعلى في الهواء لأن كثافة الهيليوم والهيدروجين أقل من كثافة الهواء.
3. يمكن الكشف عن غش اللبن أو المواد النقية بالتعرف على كثافتها، لأن الكثافة خاصية مميزة لكل مادة نقية وأي تغير في قيمتها يدل على عدم نقائها (كثافة اللبن النقي 1.03 جم/سم³).`;

        const chunk3 = `الدرس الأول: خواص المادة الفيزيائية والكيميائية (صفحة 11)
التوصيل الكهربي والتوصيل الحراري:
- مواد جيدة التوصيل للكهرباء: مثل المعادن (النحاس والألمنيوم والفضة)، وبعض المحاليل (محاليل القلويات والأحماض ومحاليل الأملاح مثل ملح الطعام في الماء).
- مواد رديئة التوصيل للكهرباء: مثل بعض المواد الصلبة (الكبريت والفوسفور والخشب والبلاستيك)، وبعض المحاليل (محلول السكر في الماء ومحلول كلوريد الهيدروجين في البنزين)، والغازات في الظروف العادية.
تصنع أسلاك الكهرباء من النحاس أو الألمنيوم وتغطى بطبقة من البلاستيك لأن النحاس والألمنيوم جيد التوصيل للكهرباء بينما البلاستيك رديء التوصيل.`;

        await pool.query(
          `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata) VALUES (?, ?, ?, ?, ?, ?, 4, 1, ?, ?)`,
          [uuidv4(), prep1BookId, ch1Id, prepStageId, prep1Id, prep1ScienceId, chunk1, JSON.stringify({ page: 4, title: 'المادة والكتلة والحجم والخواص العامة' })]
        );
        await pool.query(
          `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata) VALUES (?, ?, ?, ?, ?, ?, 7, 2, ?, ?)`,
          [uuidv4(), prep1BookId, ch1Id, prepStageId, prep1Id, prep1ScienceId, chunk2, JSON.stringify({ page: 7, title: 'تطبيقات الكثافة وحرائق البترول والبالونات' })]
        );
        await pool.query(
          `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata) VALUES (?, ?, ?, ?, ?, ?, 11, 3, ?, ?)`,
          [uuidv4(), prep1BookId, ch1Id, prepStageId, prep1Id, prep1ScienceId, chunk3, JSON.stringify({ page: 11, title: 'التوصيل الكهربي والحراري والمحاليل' })]
        );

        // Prep 1 Scheduled Exam
        const examId = uuidv4();
        await pool.query(
          `INSERT INTO exams (id, title_ar, title_en, teacher_id, academic_stage_id, grade_id, subject_id, book_id, chapter_id, duration_minutes, is_published)
           VALUES (?, 'امتحان تشخيصي تجريبي: المادة وخواصها', 'Prep 1 Diagnostic Assessment: Matter & Density', ?, ?, ?, ?, ?, ?, 15, 1)`,
          [examId, teacherId, prepStageId, prep1Id, prep1ScienceId, prep1BookId, ch1Id]
        );

        const q1Id = uuidv4();
        await pool.query(
          `INSERT INTO exam_questions (id, exam_id, question_text, points, explanation, order_index)
           VALUES (?, ?, 'علل: لا يُستخدم الماء في إطفاء حرائق البترول؟', 1, 'لأن كثافة البترول أقل من كثافة الماء فيطفو فوق سطحه ويظل الحريق مشتعلاً (كتاب العلوم ص 7)', 1)`,
          [q1Id, examId]
        );
        await pool.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES (?, ?, 'لأن كثافة البترول أقل من كثافة الماء فيطفو فوق سطحه ويظل مشتعلاً', 1)`, [uuidv4(), q1Id]);
        await pool.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES (?, ?, 'لأن الماء يتفاعل كيميائياً مع البترول وينفجر', 0)`, [uuidv4(), q1Id]);
        await pool.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES (?, ?, 'لأن كثافة الماء أقل من كثافة البترول فيتبخر سريعاً', 0)`, [uuidv4(), q1Id]);
        await pool.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES (?, ?, 'لأن البترول يذوب في الماء البارد', 0)`, [uuidv4(), q1Id]);

        const q2Id = uuidv4();
        await pool.query(
          `INSERT INTO exam_questions (id, exam_id, question_text, points, explanation, order_index)
           VALUES (?, ?, 'أي من المواد والمحاليل التالية يُعتبر من المواد رديئة التوصيل للكهرباء؟', 1, 'محلول السكر في الماء من المحاليل رديئة التوصيل للكهرباء (كتاب العلوم ص 11)', 2)`,
          [q2Id, examId]
        );
        await pool.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES (?, ?, 'محلول السكر في الماء', 1)`, [uuidv4(), q2Id]);
        await pool.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES (?, ?, 'محلول ملح الطعام في الماء', 0)`, [uuidv4(), q2Id]);
        await pool.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES (?, ?, 'محلول الصودا الكاوية (القلويات)', 0)`, [uuidv4(), q2Id]);
        await pool.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES (?, ?, 'سلك من النحاس النقي', 0)`, [uuidv4(), q2Id]);

        console.log('📚 Prep 1 Textbook and Exam seeded successfully!');
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
