import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

const bookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9';

const SAMPLE_PAGES = [
  { unit: 1, page: 11, desc: 'الجغرافيا: موقع ومظاهر سطح قارات العالم الجديد' },
  { unit: 1, page: 29, desc: 'الجغرافيا: الكشوف الجغرافية (كولومبوس وماجلان)' },
  { unit: 2, page: 42, desc: 'التاريخ: حملة فريزر، الزعامة الشعبية، مذبحة القلعة 1811' },
  { unit: 2, page: 51, desc: 'التاريخ: نظام الاحتكار في عصر محمد علي' },
  { unit: 3, page: 65, desc: 'الجغرافيا: نُظم الغابات والحشائش (غابات الأمازون)' },
  { unit: 3, page: 84, desc: 'الجغرافيا: التغير المناخي والأمن الغذائي' },
  { unit: 4, page: 93, desc: 'التاريخ: الثورة العرابية وأحمد عرابي' },
  { unit: 4, page: 101, desc: 'التاريخ: كفاح مصطفى كامل وحادثة دنشواي 1906' }
];

async function auditOcrQuality() {
  console.log('=== STEP 5: ARABIC OCR QUALITY & VISUAL CONTENT AUDIT ===\n');

  for (const s of SAMPLE_PAGES) {
    const res = await db.query(
      'SELECT page_number, char_count, raw_text FROM book_pages WHERE book_id = $1 AND page_number = $2',
      [bookId, s.page]
    );

    if (res.rows.length === 0) {
      console.log(`Page ${s.page} not found in DB!`);
      continue;
    }

    const row = res.rows[0];
    const text = row.raw_text;

    // Check specific linguistic qualities
    const hasArabicNumbers = /[\u0660-\u0669]/.test(text);
    const hasEnglishNumbers = /[0-9]/.test(text);
    const hasDiacritics = /[\u064B-\u0652]/.test(text); // Harakat (Fatha, Damma, Kasra, Sukun, Tanween, Shadda)
    const hasDates = /(١٨\d\d|18\d\d|١٩\d\d|19\d\d|١٥\d\d|15\d\d)/.test(text);
    const hasQuestions = /(ما المقصود|بم تفسر|ما النتائج|توقع|قارن|علل|\؟)/.test(text);

    console.log(`----------------------------------------------------------------------`);
    console.log(`Unit ${s.unit} | PDF Page ${s.page} (${s.desc})`);
    console.log(`Length: ${row.char_count} chars`);
    console.log(`Linguistic Analysis:`);
    console.log(`  - Arabic Numerals (١٢٣): ${hasArabicNumbers ? 'YES' : 'NO'}`);
    console.log(`  - Standard Numerals (123): ${hasEnglishNumbers ? 'YES' : 'NO'}`);
    console.log(`  - Arabic Diacritics (تَشْكِيل): ${hasDiacritics ? 'YES' : 'NO'}`);
    console.log(`  - Historical Dates (سنوات وأعوام): ${hasDates ? 'YES' : 'NO'}`);
    console.log(`  - Printed Exercises/Questions (أسئلة الكتاب): ${hasQuestions ? 'YES' : 'NO'}`);

    console.log(`\nText Excerpt (First 350 chars):`);
    console.log(`"${text.substring(0, 350).replace(/\n+/g, ' ')}..."\n`);
  }

  // Also check map-only pages
  console.log(`======================================================================`);
  console.log(`VISUAL-ONLY CONTENT (MAPS & FULL-PAGE ILLUSTRATIONS) AUDIT:`);
  console.log(`======================================================================`);
  const visualPages = [21, 27, 66, 75];
  for (const vp of visualPages) {
    const res = await db.query(
      'SELECT page_number, char_count, raw_text FROM book_pages WHERE book_id = $1 AND page_number = $2',
      [bookId, vp]
    );
    console.log(`PDF Page ${vp}: Length = ${res.rows[0]?.char_count || 0} chars (Classified as: FULL_PAGE_MAP_OR_ILLUSTRATION)`);
  }

  process.exit(0);
}

auditOcrQuality().catch(err => {
  console.error(err);
  process.exit(1);
});
