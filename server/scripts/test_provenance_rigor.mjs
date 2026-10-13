import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

const bookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9';

/**
 * Enhanced Strict Provenance Validator
 */
export async function rigorousVerifyProvenance(q, bookId) {
  if (!q.page_reference || q.page_reference <= 0) {
    return { isVerified: false, reason: 'Missing or invalid page_reference' };
  }

  const pageRes = await db.query(
    'SELECT raw_text FROM book_pages WHERE book_id = $1 AND page_number = $2',
    [bookId, q.page_reference]
  );

  if (pageRes.rows.length === 0 || !pageRes.rows[0].raw_text) {
    return { isVerified: false, reason: `Page ${q.page_reference} does not exist or has no extracted text in book_pages` };
  }

  const pageText = pageRes.rows[0].raw_text.toLowerCase();

  // Expanded Arabic educational stop-words list
  const stopWords = new Set([
    'what', 'which', 'where', 'when', 'from', 'with', 'that', 'this', 'have', 'does',
    'ماذا', 'لماذا', 'كيف', 'أين', 'متى', 'الذي', 'التي', 'الذين', 'اللاتي', 'منها',
    'إلى', 'على', 'عن', 'في', 'من', 'مع', 'هذا', 'هذه', 'تلك', 'ذلك', 'كذلك', 'أنه',
    'أنها', 'كان', 'كانت', 'يكون', 'تكون', 'منهج', 'الدراسات', 'الاجتماعية', 'العلوم',
    'الصف', 'الثالث', 'الإعدادي', 'الأول', 'الثاني', 'المصري', 'المصرية', 'الوطنية',
    'التعليم', 'الكتاب', 'الوحدة', 'الدرس', 'العام', 'الدراسي', 'سؤال', 'أجب', 'بين',
    'أحد', 'أهم', 'خلال', 'بعد', 'قبل', 'عام', 'عصر', 'أدى', 'ترتب', 'الدولة', 'الدول',
    'الأوروبية', 'الأوروبي', 'البلاد', 'العالم', 'تاريخ', 'جغرافيا', 'الأخرى', 'قامت', 'وقامت'
  ]);

  // 1. Extract significant question keywords (> 3 chars)
  const qWords = (q.question_text || '')
    .toLowerCase()
    .split(/[^\w\u0600-\u06FF]+/)
    .filter(w => w.length > 3 && !stopWords.has(w));

  const matchedQWords = qWords.filter(w => pageText.includes(w));

  // Also check if any bigram (2 consecutive non-stop words) from question appears in page
  let hasBigramMatch = false;
  for (let i = 0; i < qWords.length - 1; i++) {
    const bigram = `${qWords[i]} ${qWords[i + 1]}`;
    if (pageText.includes(bigram)) {
      hasBigramMatch = true;
      break;
    }
  }

  // 2. Extract correct answer and evaluate its presence on the page
  const correctOpt = q.options?.find(o => o.is_correct)?.text?.toLowerCase()?.trim() || '';
  if (!correctOpt) {
    return { isVerified: false, reason: 'Question has no correct option defined' };
  }

  const ansWords = correctOpt
    .split(/[^\w\u0600-\u06FF]+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  const matchedAnsWords = ansWords.filter(w => pageText.includes(w));
  
  // Exact phrase match or >= 70% of distinctive answer words must appear
  const exactAnswerMatch = pageText.includes(correctOpt);
  const partialAnswerMatch = ansWords.length > 0 && (matchedAnsWords.length / ansWords.length) >= 0.7;
  const isAnswerSupported = exactAnswerMatch || partialAnswerMatch;

  // Rule 1: The correct answer MUST be supported by the page text
  if (!isAnswerSupported) {
    return {
      isVerified: false,
      reason: `Answer "${correctOpt}" is NOT supported on page ${q.page_reference} (matched words: ${matchedAnsWords.join(', ') || 'none'})`
    };
  }

  // Rule 2: The question's topic/premise MUST have sufficient distinct support:
  // Must either have a verbatim bigram match OR at least 50% keyword match with minimum 2 keywords
  const qCoverageRatio = qWords.length > 0 ? (matchedQWords.length / qWords.length) : 0;
  if (!hasBigramMatch && (matchedQWords.length < 2 || qCoverageRatio < 0.5)) {
    return {
      isVerified: false,
      reason: `Question premise is unsupported on page ${q.page_reference}: matched [${matchedQWords.join(', ') || 'none'}] out of [${qWords.join(', ')}] (coverage: ${Math.round(qCoverageRatio * 100)}%, bigram match: false)`
    };
  }

  // Rule 3: Guard against isolated generic answer words (proximity check)
  // If answer is 1 word, it must appear within 250 characters of at least one matched question keyword
  if (ansWords.length <= 1) {
    const ansIdx = pageText.indexOf(correctOpt);
    let hasCloseQWord = false;
    for (const qw of matchedQWords) {
      const qIdx = pageText.indexOf(qw);
      if (Math.abs(qIdx - ansIdx) <= 250) {
        hasCloseQWord = true;
        break;
      }
    }
    if (!hasCloseQWord) {
      return {
        isVerified: false,
        reason: `Answer "${correctOpt}" is disconnected from question subject on page ${q.page_reference} (distance > 250 chars)`
      };
    }
  }

  return {
    isVerified: true,
    matchedKeywords: matchedQWords,
    matchedAnswerWords: matchedAnsWords
  };
}

async function runFourControlledProvenanceTests() {
  console.log('======================================================================');
  console.log('🧪 RUNNING 4 CONTROLLED PROVENANCE TESTS FOR STRICT PIPELINE INTEGRITY');
  console.log('======================================================================\n');

  // CASE 1: Completely unrelated question with plausible page reference
  console.log('--- CASE 1: Completely Unrelated Question with Plausible Page Ref ---');
  const case1 = {
    question_text: 'قاد أحمد عرابي معركة كفر الدوار وتصدى للقوات الإنجليزية بنجاح',
    options: [
      { text: 'أحمد عرابي', is_correct: true },
      { text: 'محمد فريد', is_correct: false }
    ],
    page_reference: 51 // Page 51 is about Muhammad Ali's monopoly, NOT Urabi at Kafr El-Dawar
  };
  const res1 = await rigorousVerifyProvenance(case1, bookId);
  console.log(`Outcome: isVerified = ${res1.isVerified}`);
  if (!res1.isVerified) {
    console.log(`  ✅ PASS: Unrelated question strictly rejected: "${res1.reason}"`);
  } else {
    console.error(`  ❌ FAIL: Case 1 accepted false question!`);
  }

  // CASE 2: Answer appears on page, but question is unsupported (Semantic Mismatch)
  console.log('\n--- CASE 2: Answer Appears on Page, but Question is Unsupported ---');
  // On Page 58, the word "فرنسا" appears (in reference to the mixed ministry).
  // But the question asks about something completely different!
  const case2 = {
    question_text: 'ما هي الدولة الأوروبية التي احتلت دولة الجزائر عام 1830 وقامت بضمها؟',
    options: [
      { text: 'فرنسا', is_correct: true },
      { text: 'إيطاليا', is_correct: false }
    ],
    page_reference: 58 // Page 58 mentions France, but NOT Algeria or 1830 occupation
  };
  const res2 = await rigorousVerifyProvenance(case2, bookId);
  console.log(`Outcome: isVerified = ${res2.isVerified}`);
  if (!res2.isVerified) {
    console.log(`  ✅ PASS: Semantically unsupported question strictly rejected: "${res2.reason}"`);
  } else {
    console.error(`  ❌ FAIL: Case 2 accepted semantic mismatch!`);
  }

  // CASE 3: Correct topic, but incorrect answer (Distractor marked as correct)
  console.log('\n--- CASE 3: Correct Topic, but Incorrect Answer (Unsupported Claim) ---');
  // Page 58 is about the mixed ministry under Nubar Pasha.
  // But the question claims the result was complete cancellation of all foreign debts!
  const case3 = {
    question_text: 'ما النتيجة المترتبة على تشكيل الوزارة المختلطة برئاسة نوبار باشا؟',
    options: [
      { text: 'إلغاء الديون الخارجية بشكل كامل وفوري وتنازل البنوك الأوروبية', is_correct: true },
      { text: 'زيادة التدخل الأجنبي', is_correct: false }
    ],
    page_reference: 58
  };
  const res3 = await rigorousVerifyProvenance(case3, bookId);
  console.log(`Outcome: isVerified = ${res3.isVerified}`);
  if (!res3.isVerified) {
    console.log(`  ✅ PASS: False answer claim strictly rejected: "${res3.reason}"`);
  } else {
    console.error(`  ❌ FAIL: Case 3 accepted incorrect answer claim!`);
  }

  // CASE 4: Valid question whose supporting evidence is present on the cited page
  console.log('\n--- CASE 4: Valid Grounded Question with Verifiable Evidence ---');
  const case4 = {
    question_text: 'ما النتيجة المترتبة على تشكيل الوزارة المختلطة برئاسة نوبار باشا في عصر مصر الحديثة؟',
    options: [
      { text: 'زيادة النفوذ الأجنبي والتدخل في شؤون مصر', is_correct: true },
      { text: 'تحقيق الاستقلال السياسي التام', is_correct: false }
    ],
    page_reference: 58
  };
  const res4 = await rigorousVerifyProvenance(case4, bookId);
  console.log(`Outcome: isVerified = ${res4.isVerified}`);
  if (res4.isVerified) {
    console.log(`  ✅ PASS: Valid grounded question verified successfully!`);
    console.log(`     Matched question keywords:`, res4.matchedKeywords);
    console.log(`     Matched answer words:`, res4.matchedAnswerWords);
  } else {
    console.error(`  ❌ FAIL: Case 4 rejected valid question: "${res4.reason}"`);
  }

  console.log('\n======================================================================');
  const allPassed = !res1.isVerified && !res2.isVerified && !res3.isVerified && res4.isVerified;
  console.log(`🏁 4/4 RIGOROUS PROVENANCE TESTS RESULT: ${allPassed ? '100% SUCCESS' : 'FAILED'}`);
  console.log('======================================================================');

  process.exit(allPassed ? 0 : 1);
}

runFourControlledProvenanceTests().catch(err => {
  console.error(err);
  process.exit(1);
});
