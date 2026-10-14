import assert from 'assert';

// =============================================================================
// STRICT AIR-GAP SAFETY HARNESS
// =============================================================================
// 1. Scrub external AI and production database credentials in process.env
process.env.DATABASE_URL = 'disabled_airgap_mock';
process.env.TIDB_HOST = 'disabled_airgap_mock';
process.env.GEMINI_API_KEY = 'disabled_airgap_mock';
process.env.GOOGLE_API_KEY = 'disabled_airgap_mock';
process.env.EXAM_INTEGRITY_SECRET = 'airgap_test_secret_32_bytes_long_ok';

// 2. Intercept GeminiClient to guarantee zero external AI API calls
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
let externalAICallCount = 0;
GeminiClient.generateContent = async () => {
  externalAICallCount++;
  throw new Error('FATAL SECURITY VIOLATION: External AI API call attempted during offline test!');
};

// 3. Intercept db.query to guarantee zero production database network connections or writes
import { db } from '../dist/db/db.js';
const interceptedQueries = [];
db.query = async (sql, params) => {
  interceptedQueries.push({ sql: String(sql), params });
  if (String(sql).includes('book_chapters')) {
    return {
      rows: [{
        title_ar: 'الوحدة الثانية: عصر الدولة الوسطى',
        title_en: 'Unit 2: Middle Kingdom',
        chapter_number: 2
      }]
    };
  }
  // All diagnostics, mastery, and history writes return empty rows safely in memory
  return { rows: [] };
};

// Import compiled production code directly
import {
  findBestSupportingPassage,
  truncateAtWordBoundary,
  BLOOM_TO_ARABIC,
  BLOOM_TO_ENGLISH,
  aiRagEngine
} from '../dist/services/ai/aiRagEngine.js';

console.log('================================================================');
console.log('ALFARABI AI — FINAL FOCUSED FEEDBACK VERIFICATION SUITE');
console.log('Production Exports Tested Directly from ../dist/services/ai/aiRagEngine.js');
console.log('Zero External APIs | Zero DB Mutations | Fully Air-Gapped');
console.log('================================================================\n');

// =============================================================================
// SECTION 1: truncateAtWordBoundary() Comprehensive Verification
// =============================================================================
console.log('=== SECTION 1: truncateAtWordBoundary() Verification ===\n');

// 1.1 Long Arabic word crossing character limit
console.log('--- 1.1: Long Arabic word crossing character limit ---');
const arabicCrossing = 'ما الإجراء العسكري الذي اتخذه الملك كامس لتأمين حدود مصر';
const truncArabicCrossing = truncateAtWordBoundary(arabicCrossing, 45);
console.log('Input:     "', arabicCrossing, '"');
console.log('Limit:     45');
console.log('Result:    "', truncArabicCrossing, '"');
assert(!truncArabicCrossing.includes('لتأم'), 'Must NEVER cut "لتأمين" into partial token "لتأم"');
assert(truncArabicCrossing.endsWith('كامس...'), 'Must end cleanly with the last complete word "كامس" + "..."');
assert.strictEqual(truncArabicCrossing, 'ما الإجراء العسكري الذي اتخذه الملك كامس...');
console.log('  [PASS] 1.1 Crossing Arabic word cleanly dropped without partial token.\n');

// 1.2 Unbroken long tokens (no delimiter before limit)
console.log('--- 1.2: Unbroken long tokens (no delimiter before limit) ---');
const longTokenArWithUnderscore = 'فسيكفيكهم_الله_العزيز_الحكيم';
const pureLongTokenAr = 'فسيكفيكهمفأسقيناكموه';
const longTokenEn = 'Supercalifragilisticexpialidocious';

// Limit 8 for longTokenArWithUnderscore: underscore is at index 9, so 0..7 has no delimiter
assert.strictEqual(truncateAtWordBoundary(longTokenArWithUnderscore, 8), '', 'No delimiter before limit 8 returns empty');
// Limit 10 for completely unbroken token: no delimiter exists anywhere
assert.strictEqual(truncateAtWordBoundary(pureLongTokenAr, 10), '', 'Unbroken token with zero delimiters returns empty');
assert.strictEqual(truncateAtWordBoundary(longTokenEn, 12), '', 'Long English token with no delimiter before limit returns empty');
console.log('  [PASS] 1.2 Unbroken tokens return safe empty fallback ""; zero partial words.\n');

// 1.3 Delimiters: Arabic & English punctuation, hyphens, underscores, brackets
console.log('--- 1.3: Delimiter spectrum: hyphens, underscores, punctuation, quotes ---');
// Hyphens:
const hyphenated = 'خطة-عمل-ميدانية لتطوير المناهج';
// At limit 9: falls inside "ميدانية", preceding hyphen boundary is after "عمل"
const truncHyphen = truncateAtWordBoundary(hyphenated, 9);
console.log('Hyphen test at 9:  "', truncHyphen, '"');
assert(!truncHyphen.includes('ميدان') && !truncHyphen.includes('مي'), 'Must not cut into "ميدانية" mid-token');
assert.strictEqual(truncHyphen, 'خطة-عمل...', 'Stops cleanly at hyphen delimiter before "ميدانية"');

// At limit 5: falls inside "عمل", preceding hyphen boundary is after "خطة"
const truncHyphenAt5 = truncateAtWordBoundary(hyphenated, 5);
console.log('Hyphen test at 5:  "', truncHyphenAt5, '"');
assert.strictEqual(truncHyphenAt5, 'خطة...', 'Stops cleanly at hyphen delimiter before "عمل"');

// Underscores:
const underscored = 'first_variable_name_identifier';
const truncUnderscore = truncateAtWordBoundary(underscored, 14);
console.log('Underscore test:   "', truncUnderscore, '"');
assert.strictEqual(truncUnderscore, 'first_variable...');

// Slashes, brackets, quotes:
const complexPunct = 'الوحدة الأولى (تاريخ مصر القديمة) / الفصل الثاني: «عصر الأهرام»';
const truncBracket = truncateAtWordBoundary(complexPunct, 34);
console.log('Bracket/Punct:     "', truncBracket, '"');
assert(!truncBracket.includes('الفصل'), 'Next section not started');
assert(truncBracket.includes('القديمة'));
assert(!truncBracket.endsWith(')...'), 'Closing bracket cleaned before ellipsis');

// Arabic comma (،) and semicolon (؛):
const arabicPunct = 'عصر الرخاء الاقتصادي؛ الملك أمنمحات، ومجموعته الهرمية';
const truncPunct = truncateAtWordBoundary(arabicPunct, 21);
console.log('Arabic punct:      "', truncPunct, '"');
assert.strictEqual(truncPunct, 'عصر الرخاء الاقتصادي...');

// English punctuation:
const englishPunct = 'Gravity, momentum, and velocity; all govern orbital motion.';
const truncEnPunct = truncateAtWordBoundary(englishPunct, 20);
console.log('English punct:     "', truncEnPunct, '"');
assert.strictEqual(truncEnPunct, 'Gravity, momentum...');
console.log('  [PASS] 1.3 All delimiters (hyphens, underscores, brackets, commas, quotes) handled cleanly.\n');

// 1.4 Exact boundary positions & length guarantees
console.log('--- 1.4: Exact boundary positions & length guarantees ---');
const exactFive = 'Word1 Word2'; // length 11
// Exactly equal to length:
assert.strictEqual(truncateAtWordBoundary(exactFive, 11), 'Word1 Word2', 'Length equal to limit returns exact string without ellipsis');
// Boundary falls exactly on space (delimiter at index 5):
const atSpace = truncateAtWordBoundary(exactFive, 5);
assert.strictEqual(atSpace, 'Word1...', 'Space at boundary slices cleanly to preceding word');
// Boundary falls inside second word (e.g. limit 8 falls inside 'Word2'):
const insideWord = truncateAtWordBoundary(exactFive, 8);
assert.strictEqual(insideWord, 'Word1...', 'Inside word falls back to preceding word');

// Invariant: The content (excluding ellipsis) MUST NEVER exceed maxChars
for (let len = 1; len <= exactFive.length + 5; len++) {
  const res = truncateAtWordBoundary(exactFive, len);
  const baseContent = res.replace(/\.\.\.$/, '');
  assert(baseContent.length <= len, `Base content length ${baseContent.length} exceeded limit ${len}`);
}
console.log('  [PASS] 1.4 Exact boundary positions verified; output content never exceeds maxChars.\n');

// 1.5 Exhaustive sweep proof across Arabic sentence
console.log('--- 1.5: Exhaustive sweep: Zero partial tokens across all cutoffs 1..60 ---');
const arabicSentence = 'الملك سنوسرت الثالث قام بتأمين الحدود الجنوبية وتنشيط التجارة';
const validTokens = arabicSentence.split(/\s+/);

for (let len = 1; len <= arabicSentence.length; len++) {
  const res = truncateAtWordBoundary(arabicSentence, len);
  if (res.length > 0) {
    const raw = res.replace(/\.\.\.$/, '').trim();
    if (raw.length > 0) {
      const lastToken = raw.split(/[\s،؛!؟.,;:—_–\-«»"'\(\)\[\]\/\\]+/).filter(Boolean).pop();
      if (lastToken) {
        assert(
          validTokens.includes(lastToken),
          `Cutoff ${len} produced partial word "${lastToken}" in "${res}"`
        );
      }
    }
  }
}
console.log('  [PASS] 1.5 Sweep proof: truncateAtWordBoundary NEVER returns a partial word token across all lengths.\n');


// =============================================================================
// SECTION 2: findBestSupportingPassage() Robustness & Adversarial Tests
// =============================================================================
console.log('=== SECTION 2: findBestSupportingPassage() Robustness & Adversarial Tests ===\n');

// 2.1 Adversarial Generic Keyword Match (Arabic)
console.log('--- 2.1: Adversarial generic keyword match (Arabic) ---');
// Question is about Ottoman Empire capital, sharing generic word "الدولة" with an Old Kingdom sentence
const qOttoman = 'ما هي عاصمة الدولة العثمانية التي استمرت قروناً طويلة في التاريخ الإسلامي؟';
const chunkOldKingdomGeneric = `
اهتمت الدولة القديمة ببناء الأهرامات الضخمة في الجيزة لدفن ملوك الفراعنة.
تعتبر الزراعة والتجارة من الأنشطة الاقتصادية الأساسية التي نشأت على ضفاف نهر النيل.
اشتهر الملك خوفو ببناء الهرم الأكبر الذي يعد من عجائب العالم القديم.
`;
const advResultAr = findBestSupportingPassage(qOttoman, chunkOldKingdomGeneric);
console.log('Question:         "', qOttoman, '"');
console.log('Generic Match Excerpt:', advResultAr === '' ? '<EMPTY STRING (REJECTED)>' : advResultAr);
assert.strictEqual(
  advResultAr,
  '',
  'Must return empty string when only generic keyword (e.g. الدولة) overlaps; no misleading citation'
);
console.log('  [PASS] 2.1 Incidental generic keyword overlap correctly rejected with empty string.\n');

// 2.2 Adversarial Generic Keyword Match (English)
console.log('--- 2.2: Adversarial generic keyword match (English) ---');
const qMitochondria = 'Explain the biochemical function of mitochondria and ATP synthesis in cellular respiration.';
const chunkMembraneGeneric = `
The cell membrane regulates the transport of molecules into and out of the cell.
Phospholipid bilayers provide structural integrity to various biological membranes.
Diffusion allows water and nutrients to move passively along concentration gradients.
`;
const advResultEn = findBestSupportingPassage(qMitochondria, chunkMembraneGeneric);
console.log('Question:         "', qMitochondria, '"');
console.log('Generic Match Excerpt:', advResultEn === '' ? '<EMPTY STRING (REJECTED)>' : advResultEn);
assert.strictEqual(
  advResultEn,
  '',
  'Must return empty string when only generic keyword (e.g. cell) overlaps; no misleading citation'
);
console.log('  [PASS] 2.2 Incidental generic English overlap correctly rejected with empty string.\n');

// 2.3 Authentic Substantive Match (Arabic)
console.log('--- 2.3: Authentic substantive match (Arabic) ---');
const qKamose = 'ما الإجراء العسكري الذي اتخذه الملك كامس لتأمين حدود مصر الجنوبية في صراعه ضد الهكسوس؟';
const chunkAuthenticAr = `
الفصل الثاني: عصر الدولة الوسطى. يبدأ هذا العصر بحكام طيبة الذين قادوا حركة التحرير ضد الهكسوس.
الملك سقنن رع الثاني سقط شهيداً في معركة الشرف دفاعاً عن وطنه مصر.
ثم خلفه ابنه الأكبر الملك كامس الذي واصل الحرب وقام بحملة عسكرية مفاجئة على أرض كوش لتأمين الحدود الجنوبية لمصر وقطع الإمدادات عن العدو الهكسوسي قبل الزحف شمالاً.
تولى بعده الملك أحمس الأول قيادة الجيش وطرد الهكسوس نهائياً من مصر.
`;
const authResultAr = findBestSupportingPassage(qKamose, chunkAuthenticAr);
console.log('Authentic Match Result:\n  "', authResultAr, '"');
assert(authResultAr.length > 0, 'Must find supporting passage for substantive match');
assert(authResultAr.includes('كامس'), 'Excerpt must contain key subject "كامس"');
assert(authResultAr.includes('الحدود الجنوبية'), 'Excerpt must contain topical context "الحدود الجنوبية"');
assert(authResultAr.endsWith('...'), 'Excerpt properly truncated at word boundary with ellipsis');
console.log('  [PASS] 2.3 Authentic Arabic question correctly matches substantive supporting passage.\n');

// 2.4 Authentic Substantive Match (English)
console.log('--- 2.4: Authentic substantive match (English) ---');
const qCanal = 'What was the economic impact of digging the Sesostris canal in ancient Egypt?';
const chunkAuthenticEn = `
During the Twelfth Dynasty, agricultural expansion was prioritized by the pharaohs.
King Senusret III ordered the excavation of the Sesostris canal connecting the Nile to the Red Sea, which greatly stimulated international maritime trade and economic growth between Egypt and neighboring lands.
Fortresses were also erected along the southern frontier to protect trade routes.
`;
const authResultEn = findBestSupportingPassage(qCanal, chunkAuthenticEn);
console.log('Authentic Match Result (En):\n  "', authResultEn, '"');
assert(authResultEn.length > 0, 'Must find supporting passage for substantive English match');
assert(authResultEn.includes('maritime'), 'Excerpt contains relevant context');
assert(authResultEn.endsWith('...'), 'Excerpt properly truncated at word boundary with ellipsis');
console.log('  [PASS] 2.4 Authentic English question correctly matches substantive supporting passage.\n');

// 2.5 Empty or Malformed Input Safety
console.log('--- 2.5: Empty or malformed input safety ---');
assert.strictEqual(findBestSupportingPassage('', 'Valid content text that has plenty of characters.'), '');
assert.strictEqual(findBestSupportingPassage('Valid question text?', ''), '');
assert.strictEqual(findBestSupportingPassage('   ', '   '), '');
assert.strictEqual(findBestSupportingPassage('سؤال', 'نص قصير جداً'), '', 'Short text < 15 chars returns empty string');
console.log('  [PASS] 2.5 Empty or boundary input safely returns empty string without error.\n');


// =============================================================================
// SECTION 3: End-to-End Feedback Integration & Scoring Invariance
// =============================================================================
console.log('=== SECTION 3: End-to-End evaluateSubmission() Verification ===\n');

// 3.1 Arabic Submission (Mixed: Question 1 has excerpt, Question 2 has zero excerpt)
console.log('--- 3.1: Arabic Submission Diagnostic Feedback ---');
const arabicQuestions = [
  {
    id: 'q_ar_substantive',
    book_id: 'b_egypt',
    chapter_id: 'ch_middle',
    question_text: qKamose,
    difficulty: 'MEDIUM',
    bloom_level: 'KNOWLEDGE',
    page_reference: 40,
    source_excerpt: authResultAr,
    explanation: 'تفسير معتمد لبطولة الملك كامس',
    chunk_text: chunkAuthenticAr,
    options: [
      { id: 'opt_ar_wrong', text: 'التراجع للدفاع عن طيبة فقط', is_correct: false },
      { id: 'opt_ar_right', text: 'شن حملة مفاجئة على كوش لتأمين الحدود', is_correct: true }
    ],
    validation_status: { isValid: true, issues: [] }
  },
  {
    id: 'q_ar_generic_no_excerpt',
    book_id: 'b_egypt',
    chapter_id: 'ch_middle',
    question_text: qOttoman,
    difficulty: 'HARD',
    bloom_level: 'ANALYSIS',
    page_reference: 42,
    source_excerpt: advResultAr, // explicitly empty string from adversarial check!
    explanation: 'تفسير تاريخي',
    chunk_text: chunkOldKingdomGeneric,
    options: [
      { id: 'opt_ar_wrong2', text: 'بغداد', is_correct: false },
      { id: 'opt_ar_right2', text: 'إسطنبول (القسطنطينية)', is_correct: true }
    ],
    validation_status: { isValid: true, issues: [] }
  }
];

const arabicReport = await aiRagEngine.evaluateSubmission({
  studentId: 'student_arabic',
  academicStageId: 'prep_stage',
  gradeId: 'grade_1',
  subjectId: 'history',
  bookId: 'b_egypt',
  chapterId: 'ch_middle',
  attemptId: 'attempt_ar_001',
  questions: arabicQuestions,
  studentAnswers: [
    { question_id: 'q_ar_substantive', selected_option_id: 'opt_ar_wrong' },       // wrong
    { question_id: 'q_ar_generic_no_excerpt', selected_option_id: 'opt_ar_wrong2' } // wrong
  ]
});

// Scoring verification:
assert.strictEqual(arabicReport.provisional_score, 0, 'Provisional score must be 0 for wrong answers');
assert.strictEqual(arabicReport.provisional_max_score, 2, 'Provisional max score must be 2');

// Item 1 (With excerpt):
const reportItem1 = arabicReport.items[0];
console.log('Arabic Item 1 Study Rec (with excerpt):\n  "', reportItem1.study_recommendation, '"');
assert(reportItem1.study_recommendation.includes('وراجع النص التالي بعناية:'), 'Must quote verified passage');
assert(reportItem1.study_recommendation.includes('مهارة التعلم: تذكر ومعرفة.'), 'Must localize KNOWLEDGE to تذكر ومعرفة');
assert(!reportItem1.study_recommendation.includes('KNOWLEDGE'), 'Must NEVER expose raw enum KNOWLEDGE');

// Item 2 (Without excerpt — generic overlap rejected):
const reportItem2 = arabicReport.items[1];
console.log('Arabic Item 2 Study Rec (no excerpt):\n  "', reportItem2.study_recommendation, '"');
assert(reportItem2.study_recommendation.includes('وراجع محتوى الدرس بعناية لتثبيت المفاهيم.'), 'Safe fallback section guidance');
assert(!reportItem2.study_recommendation.includes('وراجع النص التالي بعناية: ""'), 'Must NEVER quote empty string');
assert(reportItem2.study_recommendation.includes('مهارة التعلم: التحليل والنقد.'), 'Must localize ANALYSIS to التحليل والنقد');
assert(!reportItem2.study_recommendation.includes('ANALYSIS'), 'Must NEVER expose raw enum ANALYSIS');

// Weak topics formatting:
for (const wt of arabicReport.weak_topics) {
  console.log('Arabic weak topic entry:', wt);
  assert(wt.startsWith('صفحة '), 'Must start with page prefix');
  assert(!wt.includes('لتأم...'), 'Must never end with partial token');
}
console.log('  [PASS] 3.1 Arabic feedback correctly differentiates authentic vs rejected excerpt recommendations.\n');


// 3.2 English Submission (Mixed: Question 1 has excerpt, Question 2 has zero excerpt)
console.log('--- 3.2: English Submission Diagnostic Feedback ---');
const englishQuestions = [
  {
    id: 'q_en_substantive',
    book_id: 'b_egypt',
    chapter_id: 'ch_middle',
    question_text: qCanal,
    difficulty: 'MEDIUM',
    bloom_level: 'APPLICATION',
    page_reference: 38,
    source_excerpt: authResultEn,
    explanation: 'The canal boosted trade.',
    chunk_text: chunkAuthenticEn,
    options: [
      { id: 'opt_en_wrong', text: 'It decreased Nile floods', is_correct: false },
      { id: 'opt_en_right', text: 'It boosted maritime trade', is_correct: true }
    ],
    validation_status: { isValid: true, issues: [] }
  },
  {
    id: 'q_en_generic_no_excerpt',
    book_id: 'b_egypt',
    chapter_id: 'ch_middle',
    question_text: qMitochondria,
    difficulty: 'HARD',
    bloom_level: 'EVALUATION',
    page_reference: 44,
    source_excerpt: advResultEn, // explicitly empty string from adversarial check!
    explanation: 'Mitochondria generate ATP.',
    chunk_text: chunkMembraneGeneric,
    options: [
      { id: 'opt_en_wrong2', text: 'Digest proteins', is_correct: false },
      { id: 'opt_en_right2', text: 'Synthesize ATP via oxidative phosphorylation', is_correct: true }
    ],
    validation_status: { isValid: true, issues: [] }
  }
];

const englishReport = await aiRagEngine.evaluateSubmission({
  studentId: 'student_english',
  academicStageId: 'prep_stage',
  gradeId: 'grade_1',
  subjectId: 'science',
  bookId: 'b_egypt',
  chapterId: 'ch_middle',
  attemptId: 'attempt_en_001',
  questions: englishQuestions,
  studentAnswers: [
    { question_id: 'q_en_substantive', selected_option_id: 'opt_en_wrong' },        // wrong
    { question_id: 'q_en_generic_no_excerpt', selected_option_id: 'opt_en_wrong2' }  // wrong
  ]
});

// Item 1 (With excerpt):
const enItem1 = englishReport.items[0];
console.log('English Item 1 Study Rec (with excerpt):\n  "', enItem1.study_recommendation, '"');
assert(enItem1.study_recommendation.includes('🎯 Review Plan: Open "Unit 2: Middle Kingdom" → Page 38'));
assert(enItem1.study_recommendation.includes('revisit the following passage:'));
assert(enItem1.study_recommendation.includes('Skill focus: Application & Practice.'));
assert(!enItem1.study_recommendation.includes('APPLICATION.'));

// Item 2 (Without excerpt — generic overlap rejected):
const enItem2 = englishReport.items[1];
console.log('English Item 2 Study Rec (no excerpt):\n  "', enItem2.study_recommendation, '"');
assert(enItem2.study_recommendation.includes('review the section carefully to reinforce the concept.'));
assert(!enItem2.study_recommendation.includes('revisit the following passage: ""'));
assert(enItem2.study_recommendation.includes('Skill focus: Evaluation & Judgment.'));
assert(!enItem2.study_recommendation.includes('EVALUATION.'));

console.log('  [PASS] 3.2 English feedback correctly differentiates authentic vs rejected excerpt recommendations.\n');


// =============================================================================
// SECTION 4: Scoring and Answer-Key Invariance Verification
// =============================================================================
console.log('--- 3.3: Scoring and Answer-Key Invariance Verification ---');

// Case A: Deterministically verified arithmetic question
const deterministicMathQuestions = [
  {
    id: 'q_math_det',
    book_id: 'b1',
    chapter_id: 'ch1',
    question_text: 'ما ناتج جمع: 12 + 8 = ؟',
    difficulty: 'EASY',
    bloom_level: 'APPLICATION',
    page_reference: 10,
    source_excerpt: '',
    explanation: '12 + 8 = 20',
    options: [
      { id: 'opt_m1', text: '18', is_correct: false },
      { id: 'opt_m2', text: '20', is_correct: true }
    ],
    validation_status: { isValid: true, issues: [] }
  }
];

const mathReport = await aiRagEngine.evaluateSubmission({
  studentId: 'st_math',
  academicStageId: 'stg',
  gradeId: 'grd',
  subjectId: 'sbj',
  bookId: 'b1',
  chapterId: 'ch1',
  attemptId: 'att_math',
  questions: deterministicMathQuestions,
  studentAnswers: [
    { question_id: 'q_math_det', selected_option_id: 'opt_m2' } // correct!
  ]
});

assert.strictEqual(mathReport.provisional_score, 1, 'Provisional score must be 1 for correct answer');
assert.strictEqual(mathReport.authoritative_score, 1, 'Authoritative score must be 1 for deterministic verified question');
assert.strictEqual(mathReport.authoritative_max_score, 1, 'Authoritative max score must be 1');
assert.strictEqual(mathReport.items[0].is_correct, true, 'is_correct must be true');
assert.strictEqual(mathReport.items[0].points, 1, 'points must be 1');
assert.strictEqual(mathReport.items[0].authoritative_points, 1, 'authoritative_points must be 1');
assert.strictEqual(mathReport.items[0].answer_key_status, 'DETERMINISTICALLY_VERIFIED', 'Status must be DETERMINISTICALLY_VERIFIED');

// Case B: Semantic question requiring review (fail-closed authoritative score = 0, provisional = 1)
const semanticQuestions = [
  {
    id: 'q_sem',
    book_id: 'b1',
    chapter_id: 'ch1',
    question_text: 'ما أسباب انتصار المصريين القدماء في معركة التحرير؟',
    difficulty: 'MEDIUM',
    bloom_level: 'UNDERSTANDING',
    page_reference: 12,
    source_excerpt: '',
    explanation: 'الوحدة الوطنية والقيادة الحكيمة',
    options: [
      { id: 'opt_s1', text: 'خيار خاطئ', is_correct: false },
      { id: 'opt_s2', text: 'الوحدة الوطنية وتطوير سلاح العجلات الحربية', is_correct: true }
    ],
    validation_status: { isValid: true, issues: [] }
  }
];

const semReport = await aiRagEngine.evaluateSubmission({
  studentId: 'st_sem',
  academicStageId: 'stg',
  gradeId: 'grd',
  subjectId: 'sbj',
  bookId: 'b1',
  chapterId: 'ch1',
  attemptId: 'att_sem',
  questions: semanticQuestions,
  studentAnswers: [
    { question_id: 'q_sem', selected_option_id: 'opt_s2' } // correct!
  ]
});

assert.strictEqual(semReport.provisional_score, 1, 'Provisional score must be 1 for correct option');
assert.strictEqual(semReport.authoritative_score, 0, 'Authoritative score fails closed to 0 for semantic question pending review');
assert.strictEqual(semReport.items[0].is_correct, true, 'is_correct must be true');
assert.strictEqual(semReport.items[0].answer_key_status, 'PENDING_REVIEW', 'Status must be PENDING_REVIEW');

console.log('  [PASS] 3.3 Scoring, answer keys, and deterministic points calculation are completely unchanged.\n');

// =============================================================================
// SECTION 4: Air-Gap Verification Audit
// =============================================================================
console.log('=== SECTION 4: Air-Gap Verification Audit ===\n');
assert.strictEqual(externalAICallCount, 0, 'PROVED: Zero external AI API calls were made.');
assert(interceptedQueries.length >= 4, `PROVED: All database queries (${interceptedQueries.length}) were routed strictly in memory.`);
console.log(`  [PASS] 4. Air-Gap verified: ${interceptedQueries.length} database operations intercepted in memory; 0 network queries; 0 external AI calls.\n`);

console.log('================================================================');
console.log('🎉 ALL PRODUCTION REGRESSION TESTS PASSED GREEN (100%)!');
console.log('================================================================\n');
