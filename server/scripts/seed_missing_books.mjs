import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  const prepStage = await db.query("SELECT id FROM academic_stages WHERE name_ar LIKE '%إعدادي%'");
  const stageId = prepStage.rows[0].id;

  const grades = await db.query("SELECT id, name_ar, code FROM grades WHERE stage_id = $1 ORDER BY sort_order", [stageId]);
  const p1 = grades.rows.find(g => g.code === 'PREP_1');
  const p2 = grades.rows.find(g => g.code === 'PREP_2');
  const p3 = grades.rows.find(g => g.code === 'PREP_3');

  // Subjects
  const subsP1 = (await db.query("SELECT id, code FROM subjects WHERE grade_id = $1", [p1.id])).rows;
  const subsP2 = (await db.query("SELECT id, code FROM subjects WHERE grade_id = $1", [p2.id])).rows;
  const subsP3 = (await db.query("SELECT id, code FROM subjects WHERE grade_id = $1", [p3.id])).rows;

  const mathP1 = subsP1.find(s => s.code === 'MATH')?.id;
  const sciP1 = subsP1.find(s => s.code === 'SCIENCE')?.id;

  const mathP2 = subsP2.find(s => s.code === 'MATH')?.id;
  const sciP2 = subsP2.find(s => s.code === 'SCIENCE')?.id;

  const mathP3 = subsP3.find(s => s.code === 'MATH')?.id;
  const sciP3 = subsP3.find(s => s.code === 'SCIENCE')?.id;

  // Function to create a book if not exists
  async function ensureBook(titleAr, titleEn, stageId, gradeId, subjId, schoolType, units) {
    const existing = await db.query(
      "SELECT id FROM books WHERE grade_id = $1 AND subject_id = $2 AND school_type = $3",
      [gradeId, subjId, schoolType]
    );
    if (existing.rows.length > 0) {
      console.log(`Book already exists: ${titleAr} (${schoolType})`);
      return existing.rows[0].id;
    }

    const bookId = uuidv4();
    await db.query(
      `INSERT INTO books (
         id, title_ar, title_en, academic_stage_id, grade_id, subject_id,
         school_type, term, processing_status, file_size
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 'READY', 2500000)`,
      [bookId, titleAr, titleEn, stageId, gradeId, subjId, schoolType]
    );

    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      await db.query(
        `INSERT INTO book_chapters (
           id, book_id, chapter_number, title_ar, title_en, start_page, end_page
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [uuidv4(), bookId, i + 1, u.title_ar, u.title_en, u.start, u.end]
      );
    }
    console.log(`Created book: ${titleAr} (${schoolType}) with ${units.length} units`);
    return bookId;
  }

  // Units for Arabic Math
  const mathArabicUnits = [
    { title_ar: 'الوحدة الأولى: الأعداد النسبية والجبر', title_en: 'Unit 1: Rational Numbers and Algebra', start: 1, end: 42 },
    { title_ar: 'الوحدة الثانية: الحدود والمقادير الجبرية والإحصاء', title_en: 'Unit 2: Algebraic Expressions and Statistics', start: 43, end: 85 },
    { title_ar: 'الوحدة الثالثة: الهندسة والقياس المستوي', title_en: 'Unit 3: Geometry and Plane Measurement', start: 86, end: 128 }
  ];

  // Units for Arabic Science
  const sciArabicUnits = [
    { title_ar: 'الوحدة الأولى: المادة وخواصها وتركيبها', title_en: 'Unit 1: Matter, Properties and Structure', start: 1, end: 38 },
    { title_ar: 'الوحدة الثانية: الطاقة والحرارة والتحولات الفيزيائية', title_en: 'Unit 2: Energy, Heat and Physical Transformations', start: 39, end: 76 },
    { title_ar: 'الوحدة الثالثة: التنوع والتكيف في الكائنات الحية', title_en: 'Unit 3: Diversity and Adaptation in Living Organisms', start: 77, end: 115 }
  ];

  // Units for English Math
  const mathEnUnits = [
    { title_ar: 'الوحدة الأولى: الأعداد والجبر', title_en: 'Unit 1: Numbers and Algebra', start: 1, end: 40 },
    { title_ar: 'الوحدة الثانية: العلاقات والدوال والنسب المثلثية', title_en: 'Unit 2: Relations, Functions and Trigonometry', start: 41, end: 82 },
    { title_ar: 'الوحدة الثالثة: الهندسة التحليلية والإحصاء', title_en: 'Unit 3: Analytic Geometry and Statistics', start: 83, end: 125 }
  ];

  // Units for English Science
  const sciEnUnits = [
    { title_ar: 'الوحدة الأولى: القوى والحركة والسرعة', title_en: 'Unit 1: Forces, Motion and Velocity', start: 1, end: 36 },
    { title_ar: 'الوحدة الثانية: الضوء والعدسات والمرايا', title_en: 'Unit 2: Light, Lenses and Optical Mirrors', start: 37, end: 74 },
    { title_ar: 'الوحدة الثالثة: التفاعلات الكيميائية والكون', title_en: 'Unit 3: Chemical Reactions and Universe', start: 75, end: 112 }
  ];

  // 1. Prep 1 Arabic Math & Science
  if (mathP1) await ensureBook('كتاب الرياضيات', 'Mathematics Book', stageId, p1.id, mathP1, 'عربى', mathArabicUnits);
  if (sciP1) await ensureBook('كتاب العلوم', 'Science Book', stageId, p1.id, sciP1, 'عربى', sciArabicUnits);

  // 2. Prep 2 Arabic Math & Science
  if (mathP2) await ensureBook('كتاب الرياضيات', 'Mathematics Book', stageId, p2.id, mathP2, 'عربى', mathArabicUnits);
  if (sciP2) await ensureBook('كتاب العلوم', 'Science Book', stageId, p2.id, sciP2, 'عربى', sciArabicUnits);

  // 3. Prep 3 Arabic Math & Science + English Math & Science
  if (mathP3) {
    await ensureBook('كتاب الرياضيات', 'Mathematics Book', stageId, p3.id, mathP3, 'عربى', mathArabicUnits);
    await ensureBook('Math book', 'Math book', stageId, p3.id, mathP3, 'لغات', mathEnUnits);
  }
  if (sciP3) {
    await ensureBook('كتاب العلوم', 'Science Book', stageId, p3.id, sciP3, 'عربى', sciArabicUnits);
    await ensureBook('Science book', 'Science book', stageId, p3.id, sciP3, 'لغات', sciEnUnits);
  }

  // 4. Update Prep 3 students to 'عربى' as requested by the user
  console.log('--- Updating Prep 3 students school_type to arabى ---');
  const upRes = await db.query(
    "UPDATE student_profiles SET school_type = 'عربى', school_name = 'المدرسة الرسمية' WHERE grade_id = $1",
    [p3.id]
  );
  console.log(`Updated ${upRes.rowCount || upRes.rowsAffected || 'all'} Prep 3 students to عربى`);

  process.exit(0);
}

main().catch(console.error);
