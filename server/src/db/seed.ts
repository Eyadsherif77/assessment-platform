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

        // 2. Prep 2 Science Textbook
        const p2BookCheck = await db.query(
          `SELECT id FROM books WHERE grade_id = $1 AND subject_id = $2`,
          [prep2Id, prep2ScienceId]
        );

        let prep2BookId = p2BookCheck.rows[0]?.id;
        if (!prep2BookId && prep2ScienceId) {
          prep2BookId = uuidv4();
          await db.query(
            `INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, teacher_id, file_url, file_size, total_pages, processing_status, school_type)
             VALUES ($1, 'كتاب العلوم المنهجي - الصف الثاني الإعدادي', 'Prep 2 Science Textbook', $2, $3, $4, $5, '/uploads/prep2_science.pdf', 15200000, 52, 'COMPLETED', 'كلاهما')`,
            [prep2BookId, prepStageId, prep2Id, prep2ScienceId, teacherId]
          );

          // 3 Chapters
          const ch1Id = uuidv4();
          const ch2Id = uuidv4();
          const ch3Id = uuidv4();

          await db.query(
            `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, description, start_page, end_page)
             VALUES ($1, $2, 1, 'دورية العناصر وخواصها', 'Periodicity of Elements and Their Properties', 'محاولات تصنيف العناصر (الجدول الدوري لمندليف، جدول موزلي، والجدول الدوري الحديث) وتدرج الخواص في الجدول الدوري كالقطر الذري والسالبية والفلزية.', 1, 18)`,
            [ch1Id, prep2BookId]
          );
          await db.query(
            `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, description, start_page, end_page)
             VALUES ($1, $2, 2, 'الغلاف الجوي وحماية كوكب الأرض', 'The Atmosphere and Protecting Planet Earth', 'طبقات الغلاف الجوي وخصائص الضغط والحرارة بها، وتآكل طبقة الأوزون وظاهرة الاحترار العالمي والتغيرات المناخية.', 19, 36)`,
            [ch2Id, prep2BookId]
          );
          await db.query(
            `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, description, start_page, end_page)
             VALUES ($1, $2, 3, 'الحفريات وحماية الأنواع من الانقراض', 'Fossils and Protecting Species from Extinction', 'أنواع الحفريات وتكونها، دور الحفريات في دراسة تطور الكائنات الحية والتنقيب عن البترول، والانقراض والمحميات الطبيعية.', 37, 52)`,
            [ch3Id, prep2BookId]
          );

          // Textbook Pages & Chunks for Chapter 1
          const page1Text = `الوحدة الأولى: دورية العناصر وخواصها
الدرس الأول: محاولات تصنيف العناصر (صفحة 4)
تعددت محاولات العلماء لتصنيف العناصر تبعاً لخواصها بهدف: سهولة دراستها، وإيجاد العلاقة بين العناصر وخواصها الفيزيائية والكيميائية.
1. الجدول الدوري لمندليف: أول جدول دوري حقيقي لتصنيف العناصر، ورتب فيه 67 عنصراً تصاعدياً حسب أوزانها الذرية. تنبأ باكتشاف عناصر جديدة وترك لها خانات فارغة في جدوله وصحح الأوزان الذرية المقدرة خطأ لبعض العناصر.
2. الجدول الدوري لموزلي: اكتشف بعد دراسته للأشعة السينية أن دورية خواص العناصر ترتبط بأعدادها الذرية وليس بأوزانها الذرية. رتب العناصر تصاعدياً حسب أعدادها الذرية، وأضاف المجموعة الصفرية (الغازات الخاملة) وخصص مكاناً أسفل جدوله لعناصر اللانثانيدات والأكتينيدات.
3. الجدول الدوري الحديث: رتبت فيه العناصر تصاعدياً حسب أعدادها الذرية وطريقة ملء مستويات الطاقة الفرعية بالإلكترونات. يتكون الجدول الدوري الحديث من 7 دورات أفقية و 18 مجموعة رأسية.`;

          const page2Text = `الدرس الثاني: تدرج خواص العناصر في الجدول الدوري (صفحة 9)
1. الحجم الذري:
- في الدورة الواحدة: يقل الحجم الذري بزيادة العدد الذري (من اليسار إلى اليمين) بسبب زيادة قوة جذب النواة الموجبة لإلكترونات مستوى الطاقة الخارجي.
- في المجموعة الواحدة: يزداد الحجم الذري بزيادة العدد الذري (من أعلى إلى أسفل) لزيادة عدد مستويات الطاقة المشغولة بالإلكترونات.
أكبر العناصر حجماً ذرياً هو السيزيوم (Cs) ويقع أسفل يسار الجدول الدوري، وأصغر العناصر حجماً ذرياً هو الفلور (F).
2. السالبية الكهربية:
هي مقدرة الذرة في الجزيء التساهمي على جذب إلكترونات الرابطة الكيميائية نحوها.
أعلى العناصر سالبية كهربية هو الفلور (قيمتها 4).
المركب القطبي: مركب تساهمي الفرق في السالبية الكهربية بين عنصريه كبير نسبياً، مثل الماء (H2O) والنشادر (NH3). قطبية جزيء الماء أقوى من قطبية جزيء النشادر لأن الفرق في السالبية الكهربية بين الأكسجين والهيدروجين أكبر من الفرق بين النيتروجين والهيدروجين.`;

          const p1Id = uuidv4();
          const p2Id = uuidv4();
          await db.query(
            `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count) VALUES ($1, $2, $3, $4, $5)`,
            [p1Id, prep2BookId, 4, page1Text, page1Text.length]
          );
          await db.query(
            `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count) VALUES ($1, $2, $3, $4, $5)`,
            [p2Id, prep2BookId, 9, page2Text, page2Text.length]
          );

          await db.query(
            `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [uuidv4(), prep2BookId, ch1Id, prepStageId, prep2Id, prep2ScienceId, 4, 1, page1Text, JSON.stringify({ title: 'محاولات تصنيف العناصر وجدول مندليف وموزلي والجدول الحديث', page: 4 })]
          );
          await db.query(
            `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [uuidv4(), prep2BookId, ch1Id, prepStageId, prep2Id, prep2ScienceId, 9, 2, page2Text, JSON.stringify({ title: 'تدرج الحجم الذري والسالبية الكهربية والمركبات القطبية', page: 9 })]
          );

          // Create initial sample Exam for Prep 2 Science
          const p2ExamId = uuidv4();
          await db.query(
            `INSERT INTO exams (id, title_ar, title_en, description, academic_stage_id, grade_id, subject_id, teacher_id, duration_minutes, total_points, is_published)
             VALUES ($1, 'اختبار تشخيصي: دورية العناصر وتدرج خواصها', 'Prep 2 Diagnostic Assessment: Periodic Table', 'اختبار شامل على محاولات تصنيف العناصر والحجم الذري والسالبية الكهربية', $2, $3, $4, $5, 20, 20, 1)`,
            [p2ExamId, prepStageId, prep2Id, prep2ScienceId, teacherId]
          );

          const q1Id = uuidv4();
          await db.query(
            `INSERT INTO exam_questions (id, exam_id, question_text, points, explanation, order_index)
             VALUES ($1, $2, 'رتب العالم مندليف العناصر في جدوله الدوري تصاعدياً حسب:', 10, 'رتب مندليف العناصر حسب أوزانها الذرية بينما رتبها موزلي حسب أعدادها الذرية (مرجع الكتاب ص 4)', 1)`,
            [q1Id, p2ExamId]
          );
          await db.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, 'أوزانها الذرية', 1)`, [uuidv4(), q1Id]);
          await db.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, 'أعدادها الذرية', 0)`, [uuidv4(), q1Id]);
          await db.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, 'حجمها الذري', 0)`, [uuidv4(), q1Id]);
          await db.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, 'أعداد الكتلة', 0)`, [uuidv4(), q1Id]);

          const q2Id = uuidv4();
          await db.query(
            `INSERT INTO exam_questions (id, exam_id, question_text, points, explanation, order_index)
             VALUES ($1, $2, 'أكبر العناصر حجماً ذرياً في الجدول الدوري يقع في المجموعة الأولى وهو عنصر:', 10, 'عنصر السيزيوم Cs هو أكبر العناصر حجماً ذرياً ويقع أسفل يسار الجدول الدوري (مرجع الكتاب ص 9)', 2)`,
            [q2Id, p2ExamId]
          );
          await db.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, 'السيزيوم (Cs)', 1)`, [uuidv4(), q2Id]);
          await db.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, 'الفلور (F)', 0)`, [uuidv4(), q2Id]);
          await db.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, 'الصوديوم (Na)', 0)`, [uuidv4(), q2Id]);
          await db.query(`INSERT INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, 'الليثيوم (Li)', 0)`, [uuidv4(), q2Id]);

          console.log('📚 Prep 2 (Grade 8) Science textbook & assessment initialized successfully!');
        }

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

    // 8. Textbook: Prep 1 Science
    const bookId = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, teacher_id, file_url, file_size, total_pages, processing_status) VALUES ($1, 'كتاب العلوم المنهجي - الصف الأول الإعدادي', 'Prep 1 Science Textbook', $2, $3, $4, $5, '/uploads/prep1_science.pdf', 14500000, 48, 'COMPLETED')`,
      [bookId, prepId, prep1Id, scienceId, teacherId]
    );

    // Chapters
    const ch1Id = uuidv4();
    const ch2Id = uuidv4();
    const ch3Id = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, description, start_page, end_page) VALUES ($1, $2, 1, 'المادة وخواصها الفيزيائية والكيميائية', 'Matter and Its Physical and Chemical Properties', 'دراسة الكثافة، ودرجة الانصهار، ودرجة الغليان، والصلابة، والتوصيل الكهربائي والحراري، والنشاط الكيميائي للمواد.', 1, 15)`,
      [ch1Id, bookId]
    );
    await db.query(
      `INSERT OR IGNORE INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, description, start_page, end_page) VALUES ($1, $2, 2, 'تركيب المادة والذرة', 'Structure of Matter and the Atom', 'الجزيئات، والذرات، والتركيب الذري، ومستويات الطاقة السبعة، وحساب العدد الذري والكتلي.', 16, 30)`,
      [ch2Id, bookId]
    );
    await db.query(
      `INSERT OR IGNORE INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, description, start_page, end_page) VALUES ($1, $2, 3, 'الطاقة ومصادرها وصورها', 'Energy: Sources, Forms, and Transformations', 'طاقة الوضع، وطاقة الحركة، والطاقة الميكانيكية، وقانون بقاء الطاقة، والتحولات الحيوية للطاقة.', 31, 48)`,
      [ch3Id, bookId]
    );

    // Sample Pages for Chapter 1
    const page1Text = `الوحدة الأولى: المادة وتركيبها
الدرس الأول: المادة وخواصها (صفحة 4)
المادة: هي كل ما له كتلة وحجم ويشغل حيزاً من الفراغ.
الكتلة (ك): مقدار ما يحتويه الجسم من مادة، ووحدة قياسها الجرام (جم) أو الكيلوجرام (كجم).
الحجم (ح): الحيز الذي يشغله الجسم في الفراغ، ووحدة قياسه السنتيمتر المكعب (سم3).
الكثافة (ث): هي كتلة وحدة الحجوم من المادة، وتساوي كتلة الجسم مقسومة على حجمه (الكثافة = الكتلة / الحجم).
وحدة قياس الكثافة هي جرام لكل سنتيمتر مكعب (جم/سم3).
ملاحظة هامة: الكثافة خاصية فيزيائية مميزة للمادة الواحدة، فلا توجد مادتان لهما نفس الكثافة.
كثافة الماء النقي تساوي 1 جم/سم3. المواد التي كثافتها أقل من الماء تطفو على سطحه (مثل الخشب والفلين والزيت)، والمواد التي كثافتها أكبر من الماء تغوص فيه (مثل الحديد والنحاس والرصاص).`;

    const page2Text = `الدرس الأول: المادة وخواصها (صفحة 7)
تطبيقات حياتية على الكثافة:
1. لا يستخدم الماء في إطفاء حرائق البترول: لأن كثافة البترول أقل من كثافة الماء فيطفو البترول فوق سطح الماء ويظل الحريق مشتعلاً.
2. تملأ بالونات الاحتفالات بغاز الهيليوم أو غاز الهيدروجين: لأن كثافة الهيليوم والهيدروجين أقل من كثافة الهواء الجوي فترتفع البالونات إلى أعلى.
3. الكشف عن غش المواد: لأن الكثافة خاصية فيزيائية مميزة للمادة، فإن التغير في قيمة كثافة أي مادة (مثل اللبن أو العسل) يدل على عدم نقائها أو غشها التجاري. كثافة اللبن الطبيعي 1.03 جم/سم3.`;

    const page3Text = `الدرس الأول: خواص المادة الفيزيائية والكيميائية (صفحة 11)
درجة الانصهار: هي درجة الحرارة التي تبدأ عندها المادة في التحول من الحالة الصلبة إلى الحالة السائلة.
درجة الغليان: هي درجة الحرارة التي تبدأ عندها المادة في التحول من الحالة السائلة إلى الحالة الغازية.
التوصيل الكهربائي:
- مواد جيدة التوصيل للكهرباء: المعادن (النحاس، الألومنيوم، الفضة)، وبعض المحاليل مثل محاليل القلويات، والأحماض، والأملاح (مثل محلول ملح الطعام).
- مواد رديئة التوصيل للكهرباء: الخشب، البلاستيك، الكبريت، الفسفور، ومحلول السكر في الماء، ومحلول كلوريد الهيدروجين في البنزين.
النشاط الكيميائي للفلزات:
- فلزات نشطة جداً كيميائياً: تتفاعل مع الأكسجين فور تعرضها للهواء الرطب مثل البوتاسيوم والصوديوم (لذا تحفظ تحت سطح الكيروسين لمنع تفاعلها مع رطوبة الهواء).
- فلزات نشطة نسبياً: تتفاعل مع الأكسجين بعد فترة مثل الحديد والألومنيوم (لذا تطلى أعمدة الإنارة بالبويات لحمايتها من الصدأ).
- فلزات ضعيفة النشاط: يصعب تفاعلها مع الأكسجين مثل الذهب والفضة والبلاتين (لذا تستخدم في صناعة الحلي).`;

    const p1Id = uuidv4();
    const p2Id = uuidv4();
    const p3Id = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO book_pages (id, book_id, page_number, raw_text, char_count) VALUES ($1, $2, 4, $3, $4)`,
      [p1Id, bookId, page1Text, page1Text.length]
    );
    await db.query(
      `INSERT OR IGNORE INTO book_pages (id, book_id, page_number, raw_text, char_count) VALUES ($1, $2, 7, $3, $4)`,
      [p2Id, bookId, page2Text, page2Text.length]
    );
    await db.query(
      `INSERT OR IGNORE INTO book_pages (id, book_id, page_number, raw_text, char_count) VALUES ($1, $2, 11, $3, $4)`,
      [p3Id, bookId, page3Text, page3Text.length]
    );

    // Book Chunks for Vector Retrieval / RAG
    const chunk1Id = uuidv4();
    const chunk2Id = uuidv4();
    const chunk3Id = uuidv4();

    const meta1 = JSON.stringify({ title: 'مفهوم الكثافة وقانونها والطفو والغوص', page: 4 });
    const meta2 = JSON.stringify({ title: 'تطبيقات الكثافة وحرائق البترول وبالونات الهيليوم', page: 7 });
    const meta3 = JSON.stringify({ title: 'التوصيل الكهربائي والنشاط الكيميائي للفلزات وحفظ الصوديوم', page: 11 });

    await db.query(
      `INSERT OR IGNORE INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata) VALUES ($1, $2, $3, $4, $5, $6, 4, 1, $7, $8)`,
      [chunk1Id, bookId, ch1Id, prepId, prep1Id, scienceId, page1Text, meta1]
    );
    await db.query(
      `INSERT OR IGNORE INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata) VALUES ($1, $2, $3, $4, $5, $6, 7, 2, $7, $8)`,
      [chunk2Id, bookId, ch1Id, prepId, prep1Id, scienceId, page2Text, meta2]
    );
    await db.query(
      `INSERT OR IGNORE INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata) VALUES ($1, $2, $3, $4, $5, $6, 11, 3, $7, $8)`,
      [chunk3Id, bookId, ch1Id, prepId, prep1Id, scienceId, page3Text, meta3]
    );

    // 9. Question Bank for Chapter 1
    const bankId = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO question_banks (id, subject_id, academic_stage_id, grade_id, title, description, created_by) VALUES ($1, $2, $3, $4, 'بنك أسئلة العلوم - وحدة المادة وخواصها', 'أسئلة بنك المعرفة والتقويم الشامل لمنهج الصف الأول الإعدادي', $5)`,
      [bankId, scienceId, prepId, prep1Id, teacherId]
    );

    // Question 1: Density & Petroleum
    const qb1Id = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO question_bank_items (id, bank_id, chapter_id, question_text, question_type, difficulty, bloom_level, explanation, source_chunk_id, page_reference) VALUES ($1, $2, $3, 'علل: لا يستخدم الماء في إطفاء حرائق البترول؟', 'MULTIPLE_CHOICE', 'MEDIUM', 'APPLICATION', 'لأن كثافة البترول أقل من كثافة الماء، فيطفو البترول فوق الماء ويظل مشتعلاً.', $4, 7)`,
      [qb1Id, bankId, ch1Id, chunk2Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO question_bank_options (id, question_item_id, option_text, is_correct) VALUES ($1, $2, 'لأن كثافة زيت البترول أقل من كثافة الماء فيطفو لأعلى ويظل مشتعلاً', 1)`,
      [uuidv4(), qb1Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO question_bank_options (id, question_item_id, option_text, is_correct) VALUES ($1, $2, 'لأن الماء يتفاعل كيميائياً وينفجر مع البترول', 0)`,
      [uuidv4(), qb1Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO question_bank_options (id, question_item_id, option_text, is_correct) VALUES ($1, $2, 'لأن درجة غليان البترول أعلى بكثير من الماء', 0)`,
      [uuidv4(), qb1Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO question_bank_options (id, question_item_id, option_text, is_correct) VALUES ($1, $2, 'لأن البترول يذوب فورياً في الماء البارد', 0)`,
      [uuidv4(), qb1Id]
    );

    // Question 2: Sodium Storage
    const qb2Id = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO question_bank_items (id, bank_id, chapter_id, question_text, question_type, difficulty, bloom_level, explanation, source_chunk_id, page_reference) VALUES ($1, $2, $3, 'يحفظ عنصر الصوديوم والبوتاسيوم في المعمل تحت سطح الكيروسين، والسبب هو:', 'MULTIPLE_CHOICE', 'EASY', 'COMPREHENSION', 'الصوديوم فلز نشط جداً يتفاعل لحظياً مع أكسجين الهواء الرطب، فيحفظ تحت الكيروسين لعزله عن الرطوبة.', $4, 11)`,
      [qb2Id, bankId, ch1Id, chunk3Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO question_bank_options (id, question_item_id, option_text, is_correct) VALUES ($1, $2, 'لمنع تفاعلهما السريع مع أكسجين الهواء الجوي الرطب', 1)`,
      [uuidv4(), qb2Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO question_bank_options (id, question_item_id, option_text, is_correct) VALUES ($1, $2, 'لزيادة كثافة الصوديوم ومنعه من التبخر', 0)`,
      [uuidv4(), qb2Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO question_bank_options (id, question_item_id, option_text, is_correct) VALUES ($1, $2, 'لخفض درجة انصهارهما وتحويلهما لسائل', 0)`,
      [uuidv4(), qb2Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO question_bank_options (id, question_item_id, option_text, is_correct) VALUES ($1, $2, 'لأن الكيروسين يمنع التوصيل الكهربائي للفلز', 0)`,
      [uuidv4(), qb2Id]
    );

    // Question 3: Density Calculation
    const qb3Id = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO question_bank_items (id, bank_id, chapter_id, question_text, question_type, difficulty, bloom_level, explanation, source_chunk_id, page_reference) VALUES ($1, $2, $3, 'قطعة من الحديد كتلتها 78 جرام وحجمها 10 سم3، فإن كثافتها تساوي:', 'MULTIPLE_CHOICE', 'MEDIUM', 'APPLICATION', 'الكثافة = الكتلة / الحجم = 78 / 10 = 7.8 جم/سم3 وتغوص في الماء لأنها أكبر من كثافة الماء (1 جم/سم3).', $4, 4)`,
      [qb3Id, bankId, ch1Id, chunk1Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO question_bank_options (id, question_item_id, option_text, is_correct) VALUES ($1, $2, '7.8 جم/سم3 وتغوص في الماء', 1)`,
      [uuidv4(), qb3Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO question_bank_options (id, question_item_id, option_text, is_correct) VALUES ($1, $2, '780 جم/سم3 وتطفو فوق الماء', 0)`,
      [uuidv4(), qb3Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO question_bank_options (id, question_item_id, option_text, is_correct) VALUES ($1, $2, '0.128 جم/سم3 وتطفو فوق الماء', 0)`,
      [uuidv4(), qb3Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO question_bank_options (id, question_item_id, option_text, is_correct) VALUES ($1, $2, '68 جم/سم3 وتتحول لغاز', 0)`,
      [uuidv4(), qb3Id]
    );

    // 10. Active Teacher Exam for Prep 1
    const examId = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO exams (id, title_ar, title_en, teacher_id, academic_stage_id, grade_id, subject_id, book_id, chapter_id, duration_minutes, is_published) VALUES ($1, 'اختبار تقييم درس المادة وخواصها - الأسبوع الأول', 'Matter and its Properties Diagnostic Quiz', $2, $3, $4, $5, $6, $7, 20, 1)`,
      [examId, teacherId, prepId, prep1Id, scienceId, bookId, ch1Id]
    );

    // Exam Questions
    const eq1Id = uuidv4();
    const eq2Id = uuidv4();
    const eq3Id = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO exam_questions (id, exam_id, question_item_id, question_text, points, explanation, order_index) VALUES ($1, $2, $3, 'علل: لا يستخدم الماء في إطفاء حرائق البترول؟', 1, 'كثافة البترول أقل من الماء فيطفو ويظل مشتعلاً.', 1)`,
      [eq1Id, examId, qb1Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO exam_questions (id, exam_id, question_item_id, question_text, points, explanation, order_index) VALUES ($1, $2, $3, 'يحفظ عنصر الصوديوم في المعمل تحت سطح الكيروسين بسبب:', 1, 'منع تفاعله مع الهواء الرطب.', 2)`,
      [eq2Id, examId, qb2Id]
    );
    await db.query(
      `INSERT OR IGNORE INTO exam_questions (id, exam_id, question_item_id, question_text, points, explanation, order_index) VALUES ($1, $2, $3, 'مكعب كتلته 78 جم وحجمه 10 سم3 تكون كثافته:', 1, 'الكثافة = 78 / 10 = 7.8 جم/سم3.', 3)`,
      [eq3Id, examId, qb3Id]
    );

    // Exam Question Options
    await db.query(`INSERT OR IGNORE INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, 'لأن كثافة زيت البترول أقل من كثافة الماء فيطفو لأعلى ويظل مشتعلاً', 1)`, [uuidv4(), eq1Id]);
    await db.query(`INSERT OR IGNORE INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, 'لأن الماء يتفاعل كيميائياً وينفجر مع البترول', 0)`, [uuidv4(), eq1Id]);
    await db.query(`INSERT OR IGNORE INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, 'لأن درجة غليان البترول أعلى بكثير من الماء', 0)`, [uuidv4(), eq1Id]);
    await db.query(`INSERT OR IGNORE INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, 'لأن البترول يذوب فورياً في الماء البارد', 0)`, [uuidv4(), eq1Id]);

    await db.query(`INSERT OR IGNORE INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, 'لمنع تفاعله السريع مع أكسجين الهواء الجوي الرطب', 1)`, [uuidv4(), eq2Id]);
    await db.query(`INSERT OR IGNORE INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, 'لزيادة كثافة الصوديوم ومنعه من التبخر', 0)`, [uuidv4(), eq2Id]);
    await db.query(`INSERT OR IGNORE INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, 'لخفض درجة انصهاره وتحويله لسائل', 0)`, [uuidv4(), eq2Id]);
    await db.query(`INSERT OR IGNORE INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, 'لأن الكيروسين يمنع التوصيل الكهربائي', 0)`, [uuidv4(), eq2Id]);

    await db.query(`INSERT OR IGNORE INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, '7.8 جم/سم3 وتغوص في الماء', 1)`, [uuidv4(), eq3Id]);
    await db.query(`INSERT OR IGNORE INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, '780 جم/سم3 وتطفو فوق الماء', 0)`, [uuidv4(), eq3Id]);
    await db.query(`INSERT OR IGNORE INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, '0.128 جم/سم3 وتطفو فوق الماء', 0)`, [uuidv4(), eq3Id]);
    await db.query(`INSERT OR IGNORE INTO exam_question_options (id, question_id, option_text, is_correct) VALUES ($1, $2, '68 جم/سم3 وتتحول لغاز', 0)`, [uuidv4(), eq3Id]);

    // 11. Initial Topic Mastery for أحمد علي إبراهيم (Prep 1 Student)
    const masteryId = uuidv4();
    await db.query(
      `INSERT OR IGNORE INTO student_topic_mastery (id, student_id, subject_id, chapter_id, total_attempted, total_correct, mastery_percentage, status, weak_subtopics, strong_subtopics) VALUES ($1, $2, $3, $4, 10, 7, 70.0, 'DEVELOPING', $5, $6)`,
      [
        masteryId, student1Id, scienceId, ch1Id,
        JSON.stringify(['حساب كثافة الأجسام غير المنتظمة', 'تحديد المواد رديئة التوصيل الكهربائي']),
        JSON.stringify(['تطبيقات كثافة البترول والبالونات', 'النشاط الكيميائي للفلزات وحفظ الصوديوم'])
      ]
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

