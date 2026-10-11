import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { connect } from '@tidbcloud/serverless';
import { randomUUID } from 'crypto';

const PREP_1_GRADE_ID = '4baa5084-112d-45e5-908e-1ae67ea8b4e8';
const PREP_STAGE_ID = '61998777-4c5f-4e51-bc0a-38de938c842a';
const ADMIN_ID = 'admin-owner-001';

const examsData = [
  // 1. ARABIC
  {
    title_ar: 'اختبار اللغة العربية الشامل - الصف الأول الإعدادي',
    title_en: 'Comprehensive Arabic Exam - Prep 1',
    subject_id: 'af2bad44-13b7-4bea-9ac9-10dff02bc9a7',
    book_id: '0758fc7a-c9b2-4e25-a32b-6cacb6bb418d',
    duration_minutes: 30,
    questions: [
      {
        question_text: 'ما إعراب كلمة (العِلْمُ) في الجملة الآتية: «العِلْمُ نُورٌ يَهْدِي القُلُوبَ»؟',
        explanation: 'الاسم المرفوع الذي يقع في صدر الجملة الاسمية يُعرب مبتدأ مرفوع وعلامة رفعه الضمة الظاهرة.',
        options: [
          { text: 'مبتدأ مرفوع وعلامة رفعه الضمة الظاهرة', is_correct: 1 },
          { text: 'خبر مرفوع وعلامة رفعه الضمة الظاهرة', is_correct: 0 },
          { text: 'فاعل مرفوع وعلامة رفعه الضمة الظاهرة', is_correct: 0 },
          { text: 'مفعول به منصوب وعلامة نصبه الفتحة', is_correct: 0 }
        ]
      },
      {
        question_text: 'أيٌّ من الكلمات الآتية تبدأ بـ «همزة قطع» معللاً السبب؟',
        explanation: 'الفعل الماضي الرباعي ومصدره وأمره يكتب دائماً بهمزات قطع، مثل كلمة (أَحْسَنَ).',
        options: [
          { text: 'أَحْسَنَ (فعل ماضٍ رباعي)', is_correct: 1 },
          { text: 'اِسْتَخْرَجَ (فعل سداسي)', is_correct: 0 },
          { text: 'اِعْتَمَدَ (فعل خماسي)', is_correct: 0 },
          { text: 'القَلَمُ (مسبوق بأل التعريف)', is_correct: 0 }
        ]
      },
      {
        question_text: 'عيّن نوع الخبر في الجملة التالية: «المُعَلِّمُ شَرْحُهُ وَاضِحٌ»:',
        explanation: 'الخبر يتكون من جملة اسمية مكونة من مبتدأ ثانٍ متصل بضمير عائد وخبر له (شرحه واضح).',
        options: [
          { text: 'خبر جملة اسمية', is_correct: 1 },
          { text: 'خبر مفرد', is_correct: 0 },
          { text: 'خبر جملة فعلية', is_correct: 0 },
          { text: 'خبر شبه جملة', is_correct: 0 }
        ]
      },
      {
        question_text: 'ما علامة جزم الفعل المضارع الصحيح الآخر في جملة: «لَا تُهْمِلْ وَاجِبَكَ المَدْرَسِيَّ»؟',
        explanation: 'يُجزم الفعل المضارع الصحيح الآخر بالسكون عند سبقه بأداة جزم مثل (لا الناهية).',
        options: [
          { text: 'السكون الظاهر على آخره', is_correct: 1 },
          { text: 'حذف النون', is_correct: 0 },
          { text: 'حذف حرف العلة', is_correct: 0 },
          { text: 'الكسرة المقدرة', is_correct: 0 }
        ]
      },
      {
        question_text: 'مَيِّز الضمير المنفصل الدال على المتكلم في الآتي:',
        explanation: '(نَحْنُ) هو ضمير بارز منفصل للمتكلم المعظم نفسه أو الجمع.',
        options: [
          { text: 'نَحْنُ', is_correct: 1 },
          { text: 'أَنْتُمْ', is_correct: 0 },
          { text: 'هُمْ', is_correct: 0 },
          { text: 'هُمَا', is_correct: 0 }
        ]
      }
    ]
  },

  // 2. ENGLISH
  {
    title_ar: 'اختبار اللغة الإنجليزية المعياري - الصف الأول الإعدادي',
    title_en: 'Standard English Language Exam - Prep 1',
    subject_id: '33634475-0cc9-43a9-b2c4-271bc31e49c8',
    book_id: '21e1d639-9f59-4a58-a8f8-8373b8e7fc90',
    duration_minutes: 30,
    questions: [
      {
        question_text: 'Choose the correct answer: Mona usually ________ up at 6:30 AM every school day.',
        explanation: 'With singular subjects (Mona / she) in the Present Simple tense expressing routine, we add -s/-es to the verb.',
        options: [
          { text: 'wakes', is_correct: 1 },
          { text: 'wake', is_correct: 0 },
          { text: 'waking', is_correct: 0 },
          { text: 'is waking', is_correct: 0 }
        ]
      },
      {
        question_text: 'Choose the correct comparative adjective: A plane is ________ than a train.',
        explanation: 'For short adjectives like "fast", the comparative form takes the suffix "-er" followed by "than".',
        options: [
          { text: 'faster', is_correct: 1 },
          { text: 'fastest', is_correct: 0 },
          { text: 'more fast', is_correct: 0 },
          { text: 'as fast', is_correct: 0 }
        ]
      },
      {
        question_text: 'Look! The students ________ basketball in the school playground right now.',
        explanation: 'The key phrase "right now" with "Look!" indicates an action happening at the moment of speaking (Present Continuous: are + verb-ing).',
        options: [
          { text: 'are playing', is_correct: 1 },
          { text: 'play', is_correct: 0 },
          { text: 'played', is_correct: 0 },
          { text: 'plays', is_correct: 0 }
        ]
      },
      {
        question_text: 'Which sentence correctly uses the possessive form?',
        explanation: 'For a singular noun ending without s, we add apostrophe + s (\'s) to show possession.',
        options: [
          { text: "This is Ahmed's new notebook.", is_correct: 1 },
          { text: "This is Ahmeds' new notebook.", is_correct: 0 },
          { text: "This is Ahmeds new notebook.", is_correct: 0 },
          { text: "This is of Ahmed notebook.", is_correct: 0 }
        ]
      },
      {
        question_text: 'Complete with the appropriate preposition: We always have our science lesson ________ Tuesday mornings.',
        explanation: 'We use the preposition "on" with days of the week and specific mornings/afternoons of days.',
        options: [
          { text: 'on', is_correct: 1 },
          { text: 'in', is_correct: 0 },
          { text: 'at', is_correct: 0 },
          { text: 'by', is_correct: 0 }
        ]
      }
    ]
  },

  // 3. MATHEMATICS
  {
    title_ar: 'اختبار مادة الرياضيات - الجبر والهندسة - الصف الأول الإعدادي',
    title_en: 'Mathematics Exam (Algebra & Geometry) - Prep 1',
    subject_id: '639c0854-028f-4b74-9734-0e9cb2778844',
    book_id: '808104ec-b861-434b-80c6-579f715d8bdf',
    duration_minutes: 30,
    questions: [
      {
        question_text: 'العدد النسبي يكون على صورة \\frac{a}{b} بشرط أن يكون المقام b مساوياً لـ:',
        explanation: 'تعريف العدد النسبي يشترط أن يكون المقام b ≠ 0 (لا يساوي صفراً) لأن القسمة على صفر ليس لها معنى.',
        options: [
          { text: 'b \\neq 0 (لا يساوي صفراً)', is_correct: 1 },
          { text: 'b = 0', is_correct: 0 },
          { text: 'b > 1 دائماً', is_correct: 0 },
          { text: 'b عدد سالب فقط', is_correct: 0 }
        ]
      },
      {
        question_text: 'حل المعادلة الخطية الآتية في مجموعة الأعداد النسبية: 2x + 6 = 18 هو x = ؟',
        explanation: 'بطرح 6 من الطرفين: 2x = 12، وبالقسمة على 2: x = 6.',
        options: [
          { text: '6', is_correct: 1 },
          { text: '12', is_correct: 0 },
          { text: '3', is_correct: 0 },
          { text: '9', is_correct: 0 }
        ]
      },
      {
        question_text: 'ما هو المعكوس الجمعي للعدد النسبي -\\frac{3}{7}؟',
        explanation: 'المعكوس الجمعي لأي عدد نسبي هو نفس العدد مع تغيير إشارته فقط، فمعكوس -3/7 هو +3/7.',
        options: [
          { text: '+\\frac{3}{7}', is_correct: 1 },
          { text: '-\\frac{7}{3}', is_correct: 0 },
          { text: '+\\frac{7}{3}', is_correct: 0 },
          { text: '0', is_correct: 0 }
        ]
      },
      {
        question_text: 'مجموع قياسات الزوايا الداخلية لأي مثلث يساوي بالدرجات:',
        explanation: 'النظرية الهندسية الأساسية: مجموع قياسات زوايا المثلث الداخلة = 180° دائماً.',
        options: [
          { text: '180^\\circ', is_correct: 1 },
          { text: '360^\\circ', is_correct: 0 },
          { text: '90^\\circ', is_correct: 0 },
          { text: '270^\\circ', is_correct: 0 }
        ]
      },
      {
        question_text: 'الزاويتان المتتامتان هما زاويتان مجموع قياسيهما معاً يساوي:',
        explanation: 'الزاويتان المتتامتان مجموعهما 90°، والزاويتان المتكاملتان مجموعهما 180°.',
        options: [
          { text: '90^\\circ', is_correct: 1 },
          { text: '180^\\circ', is_correct: 0 },
          { text: '360^\\circ', is_correct: 0 },
          { text: '45^\\circ', is_correct: 0 }
        ]
      }
    ]
  },

  // 4. SCIENCE
  {
    title_ar: 'اختبار العلوم المتكاملة والطبيعية - الصف الأول الإعدادي',
    title_en: 'Integrated Science Exam - Prep 1',
    subject_id: '5ebb5fc2-6edb-4f65-9057-bdb09ccae74e',
    book_id: 'd7bbfca2-6d8f-461b-8e39-2015981e86ec',
    duration_minutes: 30,
    questions: [
      {
        question_text: 'يُحسب قانون الكثافة (Density) من العلاقة الرياضية الفيزيائية:',
        explanation: 'الكثافة هي كتلة وحدة الحجوم من المادة، وتُحسب بقسمة الكتلة على الحجم (D = M / V).',
        options: [
          { text: 'الكثافة = الكتلة ÷ الحجم (D = \\frac{M}{V})', is_correct: 1 },
          { text: 'الكثافة = الكتلة × الحجم (D = M \\times V)', is_correct: 0 },
          { text: 'الكثافة = الحجم ÷ الكتلة (D = \\frac{V}{M})', is_correct: 0 },
          { text: 'الكثافة = الوزن × الارتفاع', is_correct: 0 }
        ]
      },
      {
        question_text: 'الجسيمات سالبة الشحنة الكهربائية التي تدور حول نواة الذرة هي:',
        explanation: 'الإلكترونات (e⁻) تدور حول النواة في مستويات الطاقة وتحمل شحنة سالبة، بينما البروتونات موجبة داخل النواة.',
        options: [
          { text: 'الإلكترونات (Electrons, e^-)', is_correct: 1 },
          { text: 'البروتونات (Protons, p^+)', is_correct: 0 },
          { text: 'النيوترونات (Neutrons, n^0)', is_correct: 0 },
          { text: 'الفوتونات الضوئية', is_correct: 0 }
        ]
      },
      {
        question_text: 'الصيغة الكيميائية لجزيء الماء النقي تتكون من رابطة بين عنصري الهيدروجين والأكسجين كالتالي:',
        explanation: 'يتكون جزيء الماء من ذرتي هيدروجين مرتبطتين بذرة أكسجين تساهمياً وصيغته H₂O.',
        options: [
          { text: 'H_2O (ذرتان هيدروجين وذرة أكسجين)', is_correct: 1 },
          { text: 'CO_2 (ذرة كربون وذرتا أكسجين)', is_correct: 0 },
          { text: 'NaCl (كلوريد الصوديوم)', is_correct: 0 },
          { text: 'O_2 (جزيء الأكسجين)', is_correct: 0 }
        ]
      },
      {
        question_text: 'طاقة الحركة (Kinetic Energy) لجسم متحرك تتناسب طردياً مع مربع سرعته وتُعطى بالعلاقة:',
        explanation: 'طاقة الحركة KE = 0.5 × الكتلة × (السرعة)²',
        options: [
          { text: 'KE = \\frac{1}{2} m v^2', is_correct: 1 },
          { text: 'KE = m \\times g \\times h', is_correct: 0 },
          { text: 'KE = \\frac{m}{v}', is_correct: 0 },
          { text: 'KE = 2 m v', is_correct: 0 }
        ]
      },
      {
        question_text: 'تنتقل الحرارة في الأجسام المعدنية الصلبة بواسطة ظاهرة:',
        explanation: 'تنتقل الحرارة في المواد الصلبة المعدنية عن طريق التوصيل (Conduction).',
        options: [
          { text: 'التوصيل (Conduction)', is_correct: 1 },
          { text: 'الحمل (Convection)', is_correct: 0 },
          { text: 'الإشعاع (Radiation)', is_correct: 0 },
          { text: 'الاحتكاك فقط', is_correct: 0 }
        ]
      }
    ]
  },

  // 5. SOCIAL STUDIES
  {
    title_ar: 'اختبار مادة الدراسات الاجتماعية (جغرافيا وتاريخ) - الصف الأول الإعدادي',
    title_en: 'Social Studies Exam (Geography & History) - Prep 1',
    subject_id: 'sub_prep_1_social_studies',
    book_id: 'fa2a1525-c46f-4b34-9f48-b762be88e5c5',
    duration_minutes: 30,
    questions: [
      {
        question_text: 'أجسام فضائية كبيرة الحجم ملتهبة ومضيئة تشع ضوءاً وحرارة هي:',
        explanation: 'النجوم هي أجسام فضائية غازية ملتهبة ومضيئة تشع ضوءاً وحرارة وتختلف ألوانها حسب حرارتها.',
        options: [
          { text: 'النجوم', is_correct: 1 },
          { text: 'الكواكب', is_correct: 0 },
          { text: 'الأقمار', is_correct: 0 },
          { text: 'النيازك', is_correct: 0 }
        ]
      },
      {
        question_text: 'المؤسس التاريخي للأسرة الفرعونية الأولى والذي قام بتوحيد قطري مصر (الشمال والجنوب) عام 3200 ق.م هو:',
        explanation: 'الملك مينا (نعرمر) حاكم طيبة هو موحد القطرين ومؤسس الأسرة الأولى في تاريخ مصر القديم.',
        options: [
          { text: 'الملك مينا (نعرمر)', is_correct: 1 },
          { text: 'الملك خوفو', is_correct: 0 },
          { text: 'الملك سنفرو', is_correct: 0 },
          { text: 'الملك أحمس', is_correct: 0 }
        ]
      },
      {
        question_text: 'المجرة الفضائية التي تنتمي إليها مجموعتنا الشمسية تُعرف باسم مجرة:',
        explanation: 'مجرتنا حلزونية الشكل وتعرف باسم مجرة التبانة أو الدرب اللبني.',
        options: [
          { text: 'سكة التبانة (الدرب اللبني)', is_correct: 1 },
          { text: 'مجرة أندروميدا', is_correct: 0 },
          { text: 'المجرة البيضاوية', is_correct: 0 },
          { text: 'مجرة الكوكبة الشمالية', is_correct: 0 }
        ]
      },
      {
        question_text: 'يقع نهر النيل في قارة أفريقيا ويصب مياهه العذبة شمالاً في:',
        explanation: 'ينحدر نهر النيل من الجنوب إلى الشمال ليصب في البحر المتوسط.',
        options: [
          { text: 'البحر الأبيض المتوسط', is_correct: 1 },
          { text: 'البحر الأحمر', is_correct: 0 },
          { text: 'المحيط الهندي', is_correct: 0 },
          { text: 'بحيرة فيكتوريا', is_correct: 0 }
        ]
      },
      {
        question_text: 'عصر بناة الأهرامات يطلق تاريخياً على عصر الدولة:',
        explanation: 'سُمي عصر الدولة القديمة بعصر بناة الأهرامات لكثرة ما شيده ملوكها من أهرامات ضخمة كأهرامات الجيزة.',
        options: [
          { text: 'الدولة القديمة', is_correct: 1 },
          { text: 'الدولة الوسطى', is_correct: 0 },
          { text: 'الدولة الحديثة', is_correct: 0 },
          { text: 'العصر المتأخر', is_correct: 0 }
        ]
      }
    ]
  }
];

async function seed() {
  const conn = connect({
    host: process.env.TIDB_HOST,
    username: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE
  });

  console.log('Seeding Prep 1 exams...');

  for (const examData of examsData) {
    const examId = 'exam_prep1_' + randomUUID().substring(0, 8);
    console.log(`Inserting Exam: ${examData.title_ar} (${examId})`);

    await conn.execute(`
      INSERT INTO exams (
        id, title_ar, title_en, teacher_id, academic_stage_id, grade_id, 
        subject_id, book_id, duration_minutes, is_published, created_at, 
        total_points, passing_marks, school_type, term, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), 10, 5, 'كلاهما', 1, ?)
    `, [
      examId,
      examData.title_ar,
      examData.title_en,
      ADMIN_ID,
      PREP_STAGE_ID,
      PREP_1_GRADE_ID,
      examData.subject_id,
      examData.book_id,
      examData.duration_minutes,
      'اختبار قياسي منهجي موثق مطابق للكتاب المدرسي الرسمي'
    ]);

    let order = 1;
    for (const q of examData.questions) {
      const qId = 'q_p1_' + randomUUID().substring(0, 8);
      await conn.execute(`
        INSERT INTO exam_questions (
          id, exam_id, question_text, question_type, points, explanation, order_index
        ) VALUES (?, ?, ?, 'mcq', 2, ?, ?)
      `, [qId, examId, q.question_text, q.explanation, order++]);

      for (const opt of q.options) {
        const optId = 'opt_' + randomUUID().substring(0, 8);
        await conn.execute(`
          INSERT INTO exam_question_options (
            id, question_id, option_text, is_correct
          ) VALUES (?, ?, ?, ?)
        `, [optId, qId, opt.text, opt.is_correct]);
      }
    }
  }

  console.log('Successfully seeded all 5 Prep 1 exams!');
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
