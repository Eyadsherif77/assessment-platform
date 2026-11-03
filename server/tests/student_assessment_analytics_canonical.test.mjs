import assert from 'node:assert';
import { AssessmentAnalyticsService } from '../dist/services/assessmentAnalyticsService.js';

console.log('🧪 Starting Farabi AI Canonical Assessment Analytics Test Suite...\n');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    testsFailed++;
  }
}

// 1. CANONICAL PERCENTAGE CALCULATION TESTS
runTest('Strict canonical percentage calculation (2/5 = 40.0%)', () => {
  const pct = AssessmentAnalyticsService.calculatePercentage(2, 5);
  assert.strictEqual(pct, 40.0);
});

runTest('Strict canonical percentage calculation (3/5 = 60.0%)', () => {
  const pct = AssessmentAnalyticsService.calculatePercentage(3, 5);
  assert.strictEqual(pct, 60.0);
});

runTest('Percentage is strictly clamped to [0, 100] and cannot exceed 100% in ordinary assessment', () => {
  const pctNormal = AssessmentAnalyticsService.calculatePercentage(5, 5);
  assert.strictEqual(pctNormal, 100.0);

  const pctExceeded = AssessmentAnalyticsService.calculatePercentage(6, 5);
  assert.strictEqual(pctExceeded, 100.0, 'Earned marks exceeding total should be capped at 100.0%');
});

runTest('Invalid denominator (<= 0) throws descriptive error', () => {
  assert.throws(() => {
    AssessmentAnalyticsService.calculatePercentage(2, 0);
  }, /Invalid totalMarks/);

  assert.throws(() => {
    AssessmentAnalyticsService.calculatePercentage(2, -1);
  }, /Invalid totalMarks/);
});

// 2. MASTERY STATUS CLASSIFICATION TESTS
runTest('Mastery status classification according to canonical thresholds', () => {
  assert.strictEqual(AssessmentAnalyticsService.getMasteryStatus(85), 'MASTERED');
  assert.strictEqual(AssessmentAnalyticsService.getMasteryStatus(80), 'MASTERED');
  assert.strictEqual(AssessmentAnalyticsService.getMasteryStatus(75), 'PROFICIENT');
  assert.strictEqual(AssessmentAnalyticsService.getMasteryStatus(60), 'PROFICIENT');
  assert.strictEqual(AssessmentAnalyticsService.getMasteryStatus(55), 'DEVELOPING');
  assert.strictEqual(AssessmentAnalyticsService.getMasteryStatus(50), 'DEVELOPING');
  assert.strictEqual(AssessmentAnalyticsService.getMasteryStatus(40), 'NEEDS_WORK');
  assert.strictEqual(AssessmentAnalyticsService.getMasteryStatus(0), 'NEEDS_WORK');
});

// 3. ATTEMPT RECONCILIATION AND DEDUPLICATION TESTS
runTest('Reconciliation of attempt with corrupted total=0 or total=1 from evaluation report', () => {
  const normalized = AssessmentAnalyticsService.normalizeAssessmentData({
    attemptId: 'att_test_1',
    studentId: 'student_s',
    subjectId: 'sub_arabic',
    subjectNameAr: 'اللغة العربية',
    chapterId: 'chap_unit2',
    chapterTitleAr: 'الوحدة 2',
    assessmentType: 'AI_DIAGNOSTIC',
    rawScore: 2,
    rawTotal: 0, // Old bug had total_points = 0
    evaluationReport: {
      score: 2,
      max_score: 5,
      items: [
        { is_correct: true },
        { is_correct: true },
        { is_correct: false },
        { is_correct: false },
        { is_correct: false }
      ]
    },
    completedAt: '2026-11-02T12:00:00Z'
  });

  assert.ok(normalized, 'Normalized assessment should exist');
  assert.strictEqual(normalized.earnedMarks, 2);
  assert.strictEqual(normalized.totalMarks, 5);
  assert.strictEqual(normalized.percentage, 40.0);
  assert.strictEqual(normalized.status, 'NEEDS_WORK');
  assert.strictEqual(normalized.score, 2);
  assert.strictEqual(normalized.total, 5);
});

// 4. WEIGHTED CUMULATIVE MASTERY FORMULA TESTS
runTest('Weighted cumulative mastery formula across multiple assessments', () => {
  const assessments = [
    {
      id: 'att_1',
      attemptId: 'att_1',
      studentId: 'student_s',
      subjectId: 'sub_arabic',
      subjectNameAr: 'اللغة العربية',
      subjectNameEn: 'Arabic',
      chapterId: 'chap_1',
      titleAr: 'الوحدة 1',
      titleEn: 'Unit 1',
      assessmentType: 'AI_DIAGNOSTIC',
      earnedMarks: 3,
      totalMarks: 5,
      score: 3,
      total: 5,
      percentage: 60.0,
      status: 'PROFICIENT',
      completedAt: '2026-11-02T10:00:00Z',
      createdAt: '2026-11-02T10:00:00Z',
      created_at: '2026-11-02T10:00:00Z'
    },
    {
      id: 'att_2',
      attemptId: 'att_2',
      studentId: 'student_s',
      subjectId: 'sub_arabic',
      subjectNameAr: 'اللغة العربية',
      subjectNameEn: 'Arabic',
      chapterId: 'chap_2',
      titleAr: 'الوحدة 2',
      titleEn: 'Unit 2',
      assessmentType: 'AI_DIAGNOSTIC',
      earnedMarks: 2,
      totalMarks: 5,
      score: 2,
      total: 5,
      percentage: 40.0,
      status: 'NEEDS_WORK',
      completedAt: '2026-11-02T11:00:00Z',
      createdAt: '2026-11-02T11:00:00Z',
      created_at: '2026-11-02T11:00:00Z'
    }
  ];

  const cumulative = AssessmentAnalyticsService.calculateCumulativeMastery(assessments);

  assert.strictEqual(cumulative.totalAssessments, 2, 'Total completed assessments must be 2, not 4');
  assert.strictEqual(cumulative.totalEarnedMarks, 5, 'Total earned marks: 3 + 2 = 5');
  assert.strictEqual(cumulative.totalPossibleMarks, 10, 'Total possible marks: 5 + 5 = 10');
  assert.strictEqual(cumulative.cumulativePercentage, 50.0, 'Cumulative percentage must be (5 / 10) * 100 = 50.0%, NOT 150%');
});

// 5. UNIT/CHAPTER MASTERY ACCUMULATION TESTS
runTest('Unit mastery calculation groups and isolates marks strictly per unit', () => {
  const assessments = [
    {
      id: 'att_1',
      attemptId: 'att_1',
      studentId: 'student_s',
      subjectId: 'sub_arabic',
      subjectNameAr: 'اللغة العربية',
      subjectNameEn: 'Arabic',
      chapterId: 'chap_1',
      chapterTitleAr: 'الوحدة 1',
      chapterTitleEn: 'Unit 1',
      chapterNumber: 1,
      assessmentType: 'AI_DIAGNOSTIC',
      earnedMarks: 3,
      totalMarks: 5,
      score: 3,
      total: 5,
      percentage: 60.0,
      status: 'PROFICIENT',
      completedAt: '2026-11-02T10:00:00Z',
      createdAt: '2026-11-02T10:00:00Z',
      created_at: '2026-11-02T10:00:00Z'
    },
    {
      id: 'att_2',
      attemptId: 'att_2',
      studentId: 'student_s',
      subjectId: 'sub_arabic',
      subjectNameAr: 'اللغة العربية',
      subjectNameEn: 'Arabic',
      chapterId: 'chap_2',
      chapterTitleAr: 'الوحدة 2',
      chapterTitleEn: 'Unit 2',
      chapterNumber: 2,
      assessmentType: 'AI_DIAGNOSTIC',
      earnedMarks: 2,
      totalMarks: 5,
      score: 2,
      total: 5,
      percentage: 40.0,
      status: 'NEEDS_WORK',
      completedAt: '2026-11-02T11:00:00Z',
      createdAt: '2026-11-02T11:00:00Z',
      created_at: '2026-11-02T11:00:00Z'
    }
  ];

  const unitMastery = AssessmentAnalyticsService.calculateUnitMastery(assessments);

  assert.strictEqual(unitMastery.length, 2);

  const unit1 = unitMastery.find(u => u.chapterId === 'chap_1');
  assert.ok(unit1);
  assert.strictEqual(unit1.totalAttempted, 5);
  assert.strictEqual(unit1.totalCorrect, 3);
  assert.strictEqual(unit1.masteryPercentage, 60.0);
  assert.strictEqual(unit1.status, 'PROFICIENT');

  const unit2 = unitMastery.find(u => u.chapterId === 'chap_2');
  assert.ok(unit2);
  assert.strictEqual(unit2.totalAttempted, 5);
  assert.strictEqual(unit2.totalCorrect, 2);
  assert.strictEqual(unit2.masteryPercentage, 40.0);
  assert.strictEqual(unit2.status, 'NEEDS_WORK');
});

// 6. PERIODIC ANALYTICS AGGREGATION TESTS
runTest('Periodic analytics grouping and statistics', () => {
  const assessments = [
    {
      id: 'att_1',
      attemptId: 'att_1',
      studentId: 'student_s',
      subjectId: 'sub_arabic',
      subjectNameAr: 'اللغة العربية',
      subjectNameEn: 'Arabic',
      chapterId: 'chap_1',
      titleAr: 'الوحدة 1',
      titleEn: 'Unit 1',
      assessmentType: 'AI_DIAGNOSTIC',
      earnedMarks: 3,
      totalMarks: 5,
      score: 3,
      total: 5,
      percentage: 60.0,
      status: 'PROFICIENT',
      completedAt: '2026-11-02T10:00:00Z',
      createdAt: '2026-11-02T10:00:00Z',
      created_at: '2026-11-02T10:00:00Z'
    },
    {
      id: 'att_2',
      attemptId: 'att_2',
      studentId: 'student_s',
      subjectId: 'sub_arabic',
      subjectNameAr: 'اللغة العربية',
      subjectNameEn: 'Arabic',
      chapterId: 'chap_2',
      titleAr: 'الوحدة 2',
      titleEn: 'Unit 2',
      assessmentType: 'AI_DIAGNOSTIC',
      earnedMarks: 2,
      totalMarks: 5,
      score: 2,
      total: 5,
      percentage: 40.0,
      status: 'NEEDS_WORK',
      completedAt: '2026-11-02T11:00:00Z',
      createdAt: '2026-11-02T11:00:00Z',
      created_at: '2026-11-02T11:00:00Z'
    }
  ];

  const periodic = AssessmentAnalyticsService.calculatePeriodicAnalytics(assessments);

  assert.strictEqual(periodic.highestPercentage, 60.0, 'Highest percentage must be 60%, not 300%');
  assert.strictEqual(periodic.lowestPercentage, 40.0, 'Lowest percentage must be 40%');
  assert.strictEqual(periodic.overallAverage, 50.0, 'Overall average must be 50.0%, not 150%');
  assert.ok(periodic.monthlyGroups.length > 0, 'Should have at least 1 month group');
  assert.strictEqual(periodic.monthlyGroups[0].examsCount, 2);
  assert.strictEqual(periodic.monthlyGroups[0].avgPercentage, 50.0);
});

console.log(`\n========================================`);
console.log(`Test Results: ${testsPassed} Passed, ${testsFailed} Failed.`);
console.log(`========================================\n`);

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
