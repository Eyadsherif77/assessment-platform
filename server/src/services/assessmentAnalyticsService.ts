import { db } from '../db/db.js';

export interface CanonicalAssessment {
  id: string;
  attemptId: string;
  studentId: string;
  studentName?: string;
  studentCode?: string;
  subjectId: string;
  subject_id?: string;
  subjectNameAr: string;
  subject_name_ar?: string;
  subjectNameEn: string;
  subject_name_en?: string;
  gradeId?: string;
  grade_id?: string;
  chapterId?: string;
  chapter_id?: string;
  chapterTitleAr?: string;
  chapter_title_ar?: string;
  chapterTitleEn?: string;
  chapter_title_en?: string;
  chapterNumber?: number | null;
  chapter_number?: number | null;
  bookId?: string;
  book_id?: string;
  bookTitleAr?: string;
  book_title?: string;
  bookTitleEn?: string;
  book_title_en?: string;
  examId?: string;
  exam_id?: string;
  titleAr: string;
  title_ar?: string;
  titleEn: string;
  title_en?: string;
  assessmentType: 'AI_DIAGNOSTIC' | 'TIMED_EXAM' | 'SCHOOL_EXAM';
  type?: 'AI_DIAGNOSTIC' | 'TIMED_EXAM' | 'SCHOOL_EXAM';
  earnedMarks: number;
  totalMarks: number;
  score: number; // Aliased for backwards compatibility
  total: number; // Aliased for backwards compatibility
  total_points?: number;
  total_questions?: number;
  percentage: number; // Strictly between 0 and 100
  status: 'MASTERED' | 'PROFICIENT' | 'DEVELOPING' | 'NEEDS_WORK';
  completedAt: string; // ISO timestamp
  completed_at?: string;
  createdAt: string; // ISO timestamp
  created_at: string; // Backwards compatibility for existing UI
  report?: any;
}

export interface UnitMastery {
  id: string;
  studentId?: string;
  student_id?: string;
  subjectId: string;
  subject_id: string;
  subjectNameAr: string;
  subject_name_ar: string;
  subjectNameEn: string;
  subject_name_en: string;
  chapterId: string;
  chapter_id: string;
  chapterTitleAr: string;
  chapter_title_ar: string;
  chapterTitleEn: string;
  chapter_title_en: string;
  chapterNumber: number | null;
  chapter_number: number | null;
  bookTitleAr?: string;
  book_title?: string;
  bookTitleEn?: string;
  book_title_en?: string;
  totalAttempted: number;
  total_attempted: number;
  totalCorrect: number;
  total_correct: number;
  masteryPercentage: number;
  mastery_percentage: number;
  status: 'MASTERED' | 'PROFICIENT' | 'DEVELOPING' | 'NEEDS_WORK';
  weakSubtopics: string[];
  weak_subtopics: string;
  strongSubtopics: string[];
  strong_subtopics: string;
  lastAssessedAt: string;
  last_assessed_at: string;
  attemptsCount?: number;
  attempts_count?: number;
}

export interface PeriodicGroup {
  key: string;
  labelAr: string;
  labelEn: string;
  startDate: string;
  endDate: string;
  examsCount: number;
  totalEarned: number;
  totalPossible: number;
  avgPercentage: number;
  highestPercentage: number;
  lowestPercentage: number;
  assessments: CanonicalAssessment[];
}

export class AssessmentAnalyticsService {
  /**
   * Calculate canonical percentage strictly from earnedMarks and totalMarks.
   * Formula: (earnedMarks / totalMarks) * 100
   * 
   * Strict invariants:
   * - totalMarks must be > 0.
   * - earnedMarks must be >= 0.
   * - Does NOT automatically clamp invalid data; verifies and normalizes.
   */
  public static calculatePercentage(earnedMarks: number, totalMarks: number): number {
    if (typeof earnedMarks !== 'number' || isNaN(earnedMarks) || earnedMarks < 0) {
      earnedMarks = 0;
    }
    if (typeof totalMarks !== 'number' || isNaN(totalMarks) || totalMarks <= 0) {
      throw new Error(`Invalid totalMarks in assessment scoring: ${totalMarks}. Denominator must be strictly positive.`);
    }

    // Mathematical formula
    const rawPct = (earnedMarks / totalMarks) * 100;
    const rounded = Number(rawPct.toFixed(1));

    // Valid normalized percentage must be between 0 and 100
    if (rounded < 0) return 0;
    if (rounded > 100) {
      // In ordinary assessments, earnedMarks cannot exceed totalMarks
      return 100;
    }
    return rounded;
  }

  /**
   * Determine pedagogical mastery classification based on canonical thresholds:
   * - MASTERED: >= 80%
   * - PROFICIENT: >= 60% and < 80%
   * - DEVELOPING: >= 50% and < 60%
   * - NEEDS_WORK: < 50%
   */
  public static getMasteryStatus(percentage: number): 'MASTERED' | 'PROFICIENT' | 'DEVELOPING' | 'NEEDS_WORK' {
    if (percentage >= 80) return 'MASTERED';
    if (percentage >= 60) return 'PROFICIENT';
    if (percentage >= 50) return 'DEVELOPING';
    return 'NEEDS_WORK';
  }

  /**
   * Reconcile and normalize a raw attempt or evaluation into a CanonicalAssessment.
   */
  public static normalizeAssessmentData(raw: {
    attemptId: string;
    studentId: string;
    studentName?: string;
    studentCode?: string;
    subjectId: string;
    subjectNameAr?: string;
    subjectNameEn?: string;
    gradeId?: string;
    chapterId?: string;
    chapterTitleAr?: string;
    chapterTitleEn?: string;
    chapterNumber?: number | null;
    bookId?: string;
    bookTitleAr?: string;
    bookTitleEn?: string;
    examId?: string;
    titleAr?: string;
    titleEn?: string;
    assessmentType: 'AI_DIAGNOSTIC' | 'TIMED_EXAM' | 'SCHOOL_EXAM';
    rawScore?: number | null;
    rawTotal?: number | null;
    evaluationReport?: any;
    completedAt?: string | null;
    createdAt?: string | null;
  }): CanonicalAssessment | null {
    let earned = Number(raw.rawScore);
    let total = Number(raw.rawTotal);
    let parsedReport: any = null;

    if (raw.evaluationReport) {
      try {
        parsedReport = typeof raw.evaluationReport === 'string'
          ? JSON.parse(raw.evaluationReport)
          : raw.evaluationReport;
      } catch (_) {}
    }

    // Authoritative score recovery from evaluation report if columns were 0 or missing
    if (parsedReport) {
      const repScore = parsedReport.score ?? parsedReport.provisional_score;
      const repMax = parsedReport.max_score ?? parsedReport.provisional_max_score;

      if (typeof repMax === 'number' && repMax > 0) {
        total = repMax;
        if (typeof repScore === 'number' && repScore >= 0) {
          earned = repScore;
        }
      } else if (Array.isArray(parsedReport.items) && parsedReport.items.length > 0) {
        total = parsedReport.items.length;
        earned = parsedReport.items.filter((i: any) => i.is_correct).length;
      }
    }

    // Safety fallback: if total is still missing or <= 0
    if (isNaN(total) || total <= 0) {
      return null; // Exclude invalid / ungradable records
    }

    if (isNaN(earned) || earned < 0) {
      earned = 0;
    }

    // If earned exceeds total due to swapped fields, detect and invert safely
    if (earned > total && total > 0 && earned <= 100 && (total === 1 || total === 0)) {
      // Swapped or erroneous total = 1 bug
      // Do not allow earned > total; if total was falsely 1, reject or reconstruct
      return null;
    }

    let percentage: number;
    try {
      percentage = this.calculatePercentage(earned, total);
    } catch {
      return null;
    }

    const timestamp = raw.completedAt || raw.createdAt || new Date().toISOString();
    const status = this.getMasteryStatus(percentage);

    return {
      id: raw.attemptId,
      attemptId: raw.attemptId,
      studentId: raw.studentId,
      studentName: raw.studentName,
      studentCode: raw.studentCode,
      subjectId: raw.subjectId,
      subject_id: raw.subjectId,
      subjectNameAr: raw.subjectNameAr || 'المادة الدراسية',
      subject_name_ar: raw.subjectNameAr || 'المادة الدراسية',
      subjectNameEn: raw.subjectNameEn || 'Subject',
      subject_name_en: raw.subjectNameEn || 'Subject',
      gradeId: raw.gradeId,
      chapterId: raw.chapterId,
      chapter_id: raw.chapterId,
      chapterTitleAr: raw.chapterTitleAr || 'الوحدة الدراسية',
      chapter_title_ar: raw.chapterTitleAr || 'الوحدة الدراسية',
      chapterTitleEn: raw.chapterTitleEn || 'Unit',
      chapter_title_en: raw.chapterTitleEn || 'Unit',
      chapterNumber: raw.chapterNumber || null,
      chapter_number: raw.chapterNumber || null,
      bookId: raw.bookId,
      bookTitleAr: raw.bookTitleAr,
      book_title: raw.bookTitleAr,
      bookTitleEn: raw.bookTitleEn,
      book_title_en: raw.bookTitleEn,
      examId: raw.examId,
      titleAr: raw.titleAr || raw.chapterTitleAr || 'تقييم معتمد',
      title_ar: raw.titleAr || raw.chapterTitleAr || 'تقييم معتمد',
      titleEn: raw.titleEn || raw.chapterTitleEn || 'Assessment',
      title_en: raw.titleEn || raw.chapterTitleEn || 'Assessment',
      assessmentType: raw.assessmentType,
      type: raw.assessmentType,
      earnedMarks: earned,
      totalMarks: total,
      score: earned,
      total: total,
      total_points: total,
      total_questions: total,
      percentage,
      status,
      completedAt: timestamp,
      completed_at: timestamp,
      createdAt: timestamp,
      created_at: timestamp,
      report: parsedReport
    };
  }

  /**
   * Fetch all unified, deduplicated canonical assessments for a student.
   * Eliminates the duplicate counts caused by querying both ai_evaluations and exam_attempts.
   */
  public static async getCanonicalAssessmentsForStudent(
    studentId: string,
    subjectFilter?: string
  ): Promise<CanonicalAssessment[]> {
    // 1. Fetch AI evaluations
    let aiSql = `
      SELECT ae.id, ae.score, ae.total_questions, ae.created_at, ae.evaluation_report,
             b.id as book_id, b.title_ar as book_title_ar, b.title_en as book_title_en,
             s.id as subject_id, s.name_ar as subject_name_ar, s.name_en as subject_name_en,
             bc.id as chapter_id, bc.title_ar as chapter_title_ar, bc.title_en as chapter_title_en,
             bc.chapter_number,
             u.full_name as student_name, sp.student_code
      FROM ai_evaluations ae
      JOIN users u ON ae.student_id = u.id
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      LEFT JOIN books b ON ae.book_id = b.id
      LEFT JOIN subjects s ON ae.subject_id = s.id
      LEFT JOIN book_chapters bc ON ae.chapter_id = bc.id
      WHERE ae.student_id = $1
    `;
    const aiParams: any[] = [studentId];
    if (subjectFilter && subjectFilter !== 'all') {
      aiSql += ` AND (ae.subject_id = $2 OR s.name_ar = $2)`;
      aiParams.push(subjectFilter);
    }
    aiSql += ` ORDER BY ae.created_at DESC`;

    // 2. Fetch completed exam attempts (excluding IN_PROGRESS / ABANDONED)
    let examSql = `
      SELECT ea.id, ea.score, ea.total_points, ea.completed_at, ea.started_at, ea.status,
             e.id as exam_id, e.title_ar as exam_title_ar, e.title_en as exam_title_en,
             e.subject_id as subject_id, e.chapter_id as chapter_id,
             s.name_ar as subject_name_ar, s.name_en as subject_name_en,
             bc.title_ar as chapter_title_ar, bc.title_en as chapter_title_en, bc.chapter_number,
             b.title_ar as book_title_ar, b.title_en as book_title_en,
             u.full_name as student_name, sp.student_code,
             (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) as eq_count,
             (SELECT COALESCE(SUM(points), 0) FROM exam_questions eq WHERE eq.exam_id = e.id) as eq_points
      FROM exam_attempts ea
      JOIN exams e ON ea.exam_id = e.id
      JOIN users u ON ea.student_id = u.id
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      LEFT JOIN subjects s ON e.subject_id = s.id
      LEFT JOIN book_chapters bc ON e.chapter_id = bc.id
      LEFT JOIN books b ON bc.book_id = b.id
      WHERE ea.student_id = $1
        AND (ea.status = 'COMPLETED' OR ea.status = 'GRADED' OR ea.completed_at IS NOT NULL)
    `;
    const examParams: any[] = [studentId];
    if (subjectFilter && subjectFilter !== 'all') {
      examSql += ` AND (e.subject_id = $2 OR s.name_ar = $2)`;
      examParams.push(subjectFilter);
    }
    examSql += ` ORDER BY ea.completed_at DESC`;

    const [aiRes, examRes] = await Promise.all([
      db.query(aiSql, aiParams),
      db.query(examSql, examParams)
    ]);

    const assessmentMap = new Map<string, CanonicalAssessment>();

    // Process AI evaluations first (richer diagnosis report)
    for (const r of aiRes.rows) {
      const canonical = this.normalizeAssessmentData({
        attemptId: r.id,
        studentId: studentId,
        studentName: r.student_name,
        studentCode: r.student_code,
        subjectId: r.subject_id,
        subjectNameAr: r.subject_name_ar,
        subjectNameEn: r.subject_name_en,
        chapterId: r.chapter_id,
        chapterTitleAr: r.chapter_title_ar,
        chapterTitleEn: r.chapter_title_en,
        chapterNumber: r.chapter_number,
        bookId: r.book_id,
        bookTitleAr: r.book_title_ar,
        bookTitleEn: r.book_title_en,
        titleAr: r.chapter_title_ar || r.book_title_ar || r.subject_name_ar,
        titleEn: r.chapter_title_en || r.book_title_en || r.subject_name_en,
        assessmentType: 'AI_DIAGNOSTIC',
        rawScore: r.score,
        rawTotal: r.total_questions,
        evaluationReport: r.evaluation_report,
        createdAt: r.created_at,
        completedAt: r.created_at
      });

      if (canonical) {
        assessmentMap.set(canonical.attemptId, canonical);
      }
    }

    // Process exam_attempts, deduplicating with matching AI evaluation attempts
    for (const r of examRes.rows) {
      if (assessmentMap.has(r.id)) {
        // Attempt already reconciled from ai_evaluations report!
        // Enhance with exam title if available
        const existing = assessmentMap.get(r.id)!;
        if (!existing.titleAr && r.exam_title_ar) {
          existing.titleAr = r.exam_title_ar;
        }
        if (r.chapter_id && !existing.chapterId) {
          existing.chapterId = r.chapter_id;
        }
        continue;
      }

      // Standalone timed/school exam
      let totalPts = Number(r.total_points);
      if (isNaN(totalPts) || totalPts <= 0) {
        const eqPts = Number(r.eq_points);
        const eqCnt = Number(r.eq_count);
        totalPts = eqPts > 0 ? eqPts : eqCnt > 0 ? eqCnt : 0;
      }

      if (totalPts <= 0) {
        continue; // Exclude corrupted attempts with zero possible marks
      }

      const canonical = this.normalizeAssessmentData({
        attemptId: r.id,
        studentId: studentId,
        studentName: r.student_name,
        studentCode: r.student_code,
        subjectId: r.subject_id,
        subjectNameAr: r.subject_name_ar,
        subjectNameEn: r.subject_name_en,
        chapterId: r.chapter_id,
        chapterTitleAr: r.chapter_title_ar,
        chapterTitleEn: r.chapter_title_en,
        chapterNumber: r.chapter_number,
        bookTitleAr: r.book_title_ar,
        bookTitleEn: r.book_title_en,
        examId: r.exam_id,
        titleAr: r.chapter_title_ar || r.exam_title_ar || 'امتحان محدد بوقت',
        titleEn: r.chapter_title_en || r.exam_title_en || 'Timed Exam',
        assessmentType: 'TIMED_EXAM',
        rawScore: r.score,
        rawTotal: totalPts,
        completedAt: r.completed_at,
        createdAt: r.started_at || r.completed_at
      });

      if (canonical) {
        assessmentMap.set(canonical.attemptId, canonical);
      }
    }

    return Array.from(assessmentMap.values()).sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
  }

  /**
   * Calculate cumulative mastery percentage across all valid completed assessments.
   * Weighted formula: (sum earnedMarks / sum totalMarks) * 100
   */
  public static calculateCumulativeMastery(assessments: CanonicalAssessment[]): {
    cumulativePercentage: number;
    totalEarnedMarks: number;
    totalPossibleMarks: number;
    totalAssessments: number;
  } {
    if (!assessments || assessments.length === 0) {
      return {
        cumulativePercentage: 0,
        totalEarnedMarks: 0,
        totalPossibleMarks: 0,
        totalAssessments: 0
      };
    }

    const totalEarned = assessments.reduce((sum, a) => sum + a.earnedMarks, 0);
    const totalPossible = assessments.reduce((sum, a) => sum + a.totalMarks, 0);

    if (totalPossible <= 0) {
      return {
        cumulativePercentage: 0,
        totalEarnedMarks: 0,
        totalPossibleMarks: 0,
        totalAssessments: assessments.length
      };
    }

    const cumulativePercentage = this.calculatePercentage(totalEarned, totalPossible);

    return {
      cumulativePercentage,
      totalEarnedMarks: totalEarned,
      totalPossibleMarks: totalPossible,
      totalAssessments: assessments.length
    };
  }

  /**
   * Calculate unit/chapter mastery strictly from assessments belonging to each unit.
   * Weighted formula per unit: (sum unit earnedMarks / sum unit totalMarks) * 100
   */
  public static calculateUnitMastery(
    assessments: CanonicalAssessment[],
    curriculumChapters: any[] = []
  ): UnitMastery[] {
    const unitMap = new Map<string, {
      chapterId: string;
      chapterNumber: number | null;
      chapterTitleAr: string;
      chapterTitleEn: string;
      subjectId: string;
      subjectNameAr: string;
      subjectNameEn: string;
      bookTitleAr?: string;
      bookTitleEn?: string;
      earnedMarks: number;
      totalMarks: number;
      attemptsCount: number;
      lastAssessedAt: string;
      weakTopics: Set<string>;
      strongTopics: Set<string>;
    }>();

    // Initialize with curriculum chapters if provided
    for (const ch of curriculumChapters) {
      if (!ch.id) continue;
      unitMap.set(ch.id, {
        chapterId: ch.id,
        chapterNumber: ch.chapter_number || null,
        chapterTitleAr: ch.title_ar || 'الوحدة الدراسية',
        chapterTitleEn: ch.title_en || 'Unit',
        subjectId: ch.subject_id || '',
        subjectNameAr: ch.subject_name_ar || '',
        subjectNameEn: ch.subject_name_en || '',
        bookTitleAr: ch.book_title,
        bookTitleEn: ch.book_title_en,
        earnedMarks: 0,
        totalMarks: 0,
        attemptsCount: 0,
        lastAssessedAt: '',
        weakTopics: new Set<string>(),
        strongTopics: new Set<string>()
      });
    }

    // Accumulate marks per unit
    for (const a of assessments) {
      if (!a.chapterId) continue;
      if (!unitMap.has(a.chapterId)) {
        unitMap.set(a.chapterId, {
          chapterId: a.chapterId,
          chapterNumber: a.chapterNumber || null,
          chapterTitleAr: a.chapterTitleAr || 'الوحدة الدراسية',
          chapterTitleEn: a.chapterTitleEn || 'Unit',
          subjectId: a.subjectId,
          subjectNameAr: a.subjectNameAr,
          subjectNameEn: a.subjectNameEn,
          bookTitleAr: a.bookTitleAr,
          bookTitleEn: a.bookTitleEn,
          earnedMarks: 0,
          totalMarks: 0,
          attemptsCount: 0,
          lastAssessedAt: a.completedAt,
          weakTopics: new Set<string>(),
          strongTopics: new Set<string>()
        });
      }

      const unit = unitMap.get(a.chapterId)!;
      unit.earnedMarks += a.earnedMarks;
      unit.totalMarks += a.totalMarks;
      unit.attemptsCount++;

      if (!unit.lastAssessedAt || new Date(a.completedAt).getTime() > new Date(unit.lastAssessedAt).getTime()) {
        unit.lastAssessedAt = a.completedAt;
      }

      if (a.report) {
        if (Array.isArray(a.report.weak_topics)) {
          a.report.weak_topics.forEach((t: string) => unit.weakTopics.add(t));
        }
        if (Array.isArray(a.report.strong_topics)) {
          a.report.strong_topics.forEach((t: string) => unit.strongTopics.add(t));
        }
      }
    }

    const results: UnitMastery[] = [];

    for (const u of unitMap.values()) {
      let pct = 0;
      if (u.totalMarks > 0) {
        pct = this.calculatePercentage(u.earnedMarks, u.totalMarks);
      }
      const status = u.totalMarks > 0 ? this.getMasteryStatus(pct) : 'NEEDS_WORK';

      const weakArr = Array.from(u.weakTopics);
      const strongArr = Array.from(u.strongTopics);

      results.push({
        id: `unit_mastery_${u.chapterId}`,
        studentId: '',
        student_id: '',
        subjectId: u.subjectId,
        subject_id: u.subjectId,
        subjectNameAr: u.subjectNameAr,
        subject_name_ar: u.subjectNameAr,
        subjectNameEn: u.subjectNameEn,
        subject_name_en: u.subjectNameEn,
        chapterId: u.chapterId,
        chapter_id: u.chapterId,
        chapterTitleAr: u.chapterTitleAr,
        chapter_title_ar: u.chapterTitleAr,
        chapterTitleEn: u.chapterTitleEn,
        chapter_title_en: u.chapterTitleEn,
        chapterNumber: u.chapterNumber,
        chapter_number: u.chapterNumber,
        bookTitleAr: u.bookTitleAr,
        book_title: u.bookTitleAr,
        bookTitleEn: u.bookTitleEn,
        book_title_en: u.bookTitleEn,
        totalAttempted: u.totalMarks,
        total_attempted: u.totalMarks,
        totalCorrect: u.earnedMarks,
        total_correct: u.earnedMarks,
        masteryPercentage: pct,
        mastery_percentage: pct,
        status,
        weakSubtopics: weakArr,
        weak_subtopics: JSON.stringify(weakArr),
        strongSubtopics: strongArr,
        strong_subtopics: JSON.stringify(strongArr),
        lastAssessedAt: u.lastAssessedAt,
        last_assessed_at: u.lastAssessedAt,
        attemptsCount: u.attemptsCount,
        attempts_count: u.attemptsCount
      });
    }

    return results.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
  }

  /**
   * Calculate periodic grouping (Monthly and Weekly) using canonical timestamps.
   */
  public static calculatePeriodicAnalytics(assessments: CanonicalAssessment[]): {
    monthlyGroups: PeriodicGroup[];
    weeklyGroups: PeriodicGroup[];
    overallAverage: number;
    highestPercentage: number;
    lowestPercentage: number;
  } {
    const monthMap = new Map<string, {
      startDate: Date;
      endDate: Date;
      labelAr: string;
      labelEn: string;
      assessments: CanonicalAssessment[];
    }>();

    const weekMap = new Map<string, {
      startDate: Date;
      endDate: Date;
      labelAr: string;
      labelEn: string;
      assessments: CanonicalAssessment[];
    }>();

    for (const a of assessments) {
      const d = new Date(a.completedAt);
      if (isNaN(d.getTime())) continue;

      // Month Group (YYYY-MM)
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(monthKey)) {
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        const labelAr = d.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
        const labelEn = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        monthMap.set(monthKey, {
          startDate: monthStart,
          endDate: monthEnd,
          labelAr,
          labelEn,
          assessments: []
        });
      }
      monthMap.get(monthKey)!.assessments.push(a);

      // Week Group (Saturday to Friday)
      const day = d.getDay(); // 0 is Sun, 6 is Sat
      const offset = (day + 1) % 7;
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - offset);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
      if (!weekMap.has(weekKey)) {
        const labelAr = `${weekStart.getDate()} ${weekStart.toLocaleDateString('ar-EG', { month: 'short' })} - ${weekEnd.getDate()} ${weekEnd.toLocaleDateString('ar-EG', { month: 'short', year: 'numeric' })}`;
        const labelEn = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        weekMap.set(weekKey, {
          startDate: weekStart,
          endDate: weekEnd,
          labelAr,
          labelEn,
          assessments: []
        });
      }
      weekMap.get(weekKey)!.assessments.push(a);
    }

    const toPeriodicGroup = (key: string, data: any): PeriodicGroup => {
      const earned = data.assessments.reduce((sum: number, a: CanonicalAssessment) => sum + a.earnedMarks, 0);
      const total = data.assessments.reduce((sum: number, a: CanonicalAssessment) => sum + a.totalMarks, 0);
      const avgPct = total > 0 ? this.calculatePercentage(earned, total) : 0;
      const pcts = data.assessments.map((a: CanonicalAssessment) => a.percentage);

      return {
        key,
        labelAr: data.labelAr,
        labelEn: data.labelEn,
        startDate: data.startDate.toISOString(),
        endDate: data.endDate.toISOString(),
        examsCount: data.assessments.length,
        totalEarned: earned,
        totalPossible: total,
        avgPercentage: avgPct,
        highestPercentage: pcts.length > 0 ? Math.max(...pcts) : 0,
        lowestPercentage: pcts.length > 0 ? Math.min(...pcts) : 0,
        assessments: data.assessments
      };
    };

    const monthlyGroups = Array.from(monthMap.entries()).map(([k, v]) => toPeriodicGroup(k, v));
    const weeklyGroups = Array.from(weekMap.entries()).map(([k, v]) => toPeriodicGroup(k, v));

    const allPcts = assessments.map(a => a.percentage);
    const cumulative = this.calculateCumulativeMastery(assessments);

    return {
      monthlyGroups,
      weeklyGroups,
      overallAverage: cumulative.cumulativePercentage,
      highestPercentage: allPcts.length > 0 ? Math.max(...allPcts) : 0,
      lowestPercentage: allPcts.length > 0 ? Math.min(...allPcts) : 0
    };
  }

  /**
   * Complete, unified student analytics response.
   * Consumed by StudentDashboard and authorized Teacher detailed views.
   */
  public static async getStudentAnalytics(studentId: string, subjectFilter?: string): Promise<any> {
    const assessments = await this.getCanonicalAssessmentsForStudent(studentId, subjectFilter);

    // Fetch curriculum chapters for student's subjects to show accurate unit mastery
    const curriculumRes = await db.query(`
      SELECT bc.id, bc.chapter_number, bc.title_ar, bc.title_en,
             b.title_ar as book_title, b.title_en as book_title_en,
             s.id as subject_id, s.name_ar as subject_name_ar, s.name_en as subject_name_en
      FROM book_chapters bc
      JOIN books b ON bc.book_id = b.id
      JOIN subjects s ON b.subject_id = s.id
      ORDER BY s.id ASC, bc.chapter_number ASC
    `);

    // Compute unit mastery from canonical deduplicated assessments
    const unitMastery = this.calculateUnitMastery(assessments, curriculumRes.rows);

    // Filter unit mastery to only include assessed chapters or relevant subject chapters
    const computedTopics = unitMastery.filter(u => u.totalAttempted > 0 || (subjectFilter && subjectFilter !== 'all' && (u.subjectId === subjectFilter || u.subjectNameAr === subjectFilter)));

    // Cumulative weighted calculation
    const cumulative = this.calculateCumulativeMastery(assessments);

    // Mastered chapters count (>= 80% mastery)
    const masteredTopicsCount = computedTopics.filter(u => u.masteryPercentage >= 80).length;

    // Consecutive activity days streak
    const activityDates = new Set<string>();
    assessments.forEach(a => {
      activityDates.add(new Date(a.completedAt).toISOString().split('T')[0]);
    });

    let streakDays = 0;
    if (activityDates.size > 0) {
      const today = new Date();
      for (let d = 0; d < 30; d++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() - d);
        const dateStr = checkDate.toISOString().split('T')[0];
        if (activityDates.has(dateStr)) {
          streakDays++;
        } else if (d === 0) {
          continue;
        } else {
          break;
        }
      }
    }

    // Collect weak & strong topics from canonical assessments
    const weakTopics: string[] = [];
    const strongTopics: string[] = [];
    assessments.forEach(a => {
      if (a.report) {
        if (Array.isArray(a.report.weak_topics)) weakTopics.push(...a.report.weak_topics);
        if (Array.isArray(a.report.strong_topics)) strongTopics.push(...a.report.strong_topics);
      }
    });

    // Student learning history from database
    const historyRes = await db.query(
      `SELECT slh.*, s.name_ar as subject_name, bc.title_ar as chapter_title
       FROM student_learning_history slh
       LEFT JOIN subjects s ON slh.subject_id = s.id
       LEFT JOIN book_chapters bc ON slh.chapter_id = bc.id
       WHERE slh.student_id = $1
       ORDER BY slh.created_at DESC LIMIT 20`,
      [studentId]
    );

    return {
      topics: computedTopics,
      history: historyRes.rows,
      completed_exams: assessments,
      summary: {
        total_ai_assessments: assessments.filter(a => a.assessmentType === 'AI_DIAGNOSTIC').length,
        total_exams_taken: assessments.length,
        total_attempts: assessments.length,
        overall_mastery_percentage: cumulative.cumulativePercentage,
        mastered_topics_count: masteredTopicsCount,
        study_streak_days: Math.max(streakDays, assessments.length > 0 ? 1 : 0),
        weak_topics: [...new Set(weakTopics.filter(Boolean))],
        strong_topics: [...new Set(strongTopics.filter(Boolean))]
      }
    };
  }

  /**
   * Complete, unified teacher analytics response.
   * Strictly enforces teacher subject and grade authorization.
   * Uses the EXACT same canonical assessment calculations.
   */
  public static async getTeacherAnalytics(
    teacherId: string,
    requestedSubjectId?: string,
    requestedGradeId?: string
  ): Promise<any> {
    // 1. Get teacher profile details
    const profileRes = await db.query(
      `SELECT specialization, subject_id, grade_id, academic_stage_id 
       FROM teacher_profiles WHERE user_id = $1`,
      [teacherId]
    );
    const teacherProfileRow = profileRes.rows[0];
    let specialization = (teacherProfileRow?.specialization || '').trim();
    let profileSubjectId = teacherProfileRow?.subject_id || null;
    let profileGradeId = requestedGradeId || teacherProfileRow?.grade_id || null;

    // 2. Identify corresponding subject
    let subjectId: string | null = requestedSubjectId || profileSubjectId || null;
    let subjectNameAr = specialization;
    const allSubjects = await db.query(`SELECT id, name_ar, name_en, code, grade_id FROM subjects`);

    if (subjectId) {
      const found = allSubjects.rows.find((s: any) => s.id === subjectId);
      if (found) {
        subjectNameAr = found.name_ar;
        if (!specialization) specialization = found.name_ar;
      }
    } else if (specialization && allSubjects.rows.length > 0) {
      const specClean = specialization.replace(/^(اللغة|مادة|معلم أول|معلم)\s+/i, '').trim().toLowerCase();
      const matched = allSubjects.rows.find((s: any) => {
        if (profileGradeId && s.grade_id && s.grade_id !== profileGradeId) return false;
        const ar = (s.name_ar || '').trim().toLowerCase();
        const en = (s.name_en || '').trim().toLowerCase();
        const code = (s.code || '').toUpperCase();
        if (ar === specialization.toLowerCase() || en === specialization.toLowerCase()) return true;
        if (ar.includes(specClean) || specClean.includes(ar)) return true;
        if (en.includes(specClean) || specClean.includes(en)) return true;
        if ((specClean.includes('عرب') || specClean.includes('arabic')) && (code === 'ARABIC' || ar.includes('عرب'))) return true;
        if ((specClean.includes('رياض') || specClean.includes('math')) && (code === 'MATH' || ar.includes('رياض'))) return true;
        if ((specClean.includes('علوم') || specClean.includes('science')) && (code === 'SCIENCE' || ar.includes('علوم'))) return true;
        if ((specClean.includes('انجليز') || specClean.includes('english')) && (code === 'ENGLISH' || ar.includes('انجليز'))) return true;
        return false;
      }) || allSubjects.rows.find((s: any) => {
        const ar = (s.name_ar || '').trim().toLowerCase();
        const en = (s.name_en || '').trim().toLowerCase();
        const code = (s.code || '').toUpperCase();
        return (ar.includes(specClean) || en.includes(specClean) || (specClean.includes('انجليز') && code === 'ENGLISH'));
      });

      if (matched) {
        subjectId = matched.id;
        subjectNameAr = matched.name_ar;
      }
    }

    // 3. Count total students in teacher's grade
    let totalStudentsSql = `SELECT COUNT(*) as count FROM student_profiles sp`;
    const totalStudentsParams: any[] = [];
    if (profileGradeId) {
      totalStudentsSql += ` WHERE sp.grade_id = $1`;
      totalStudentsParams.push(profileGradeId);
    }
    const totalStudentsRes = await db.query(totalStudentsSql, totalStudentsParams);
    const totalStudents = Number(totalStudentsRes.rows[0]?.count) || 0;

    // 4. Count teacher exams
    let myExamsSql = `SELECT COUNT(*) as count FROM exams WHERE (teacher_id = $1 OR teacher_id = 'admin-owner-001')`;
    const myExamsParams: any[] = [teacherId];
    if (subjectId) {
      myExamsSql += ` AND (subject_id = $2 OR subject_id IN (
        SELECT s2.id FROM subjects s1 JOIN subjects s2 ON (s1.code = s2.code OR s1.name_ar = s2.name_ar) WHERE s1.id = $2
      ))`;
      myExamsParams.push(subjectId);
    }
    const myExamsRes = await db.query(myExamsSql, myExamsParams);
    const totalMyExams = Number(myExamsRes.rows[0]?.count) || 0;

    // 5. Retrieve all student assessments for students in this teacher's subject & grade
    // First, find all student IDs belonging to the teacher's grade scope
    let studentIdsSql = `SELECT user_id FROM student_profiles`;
    const studentIdsParams: any[] = [];
    if (profileGradeId) {
      studentIdsSql += ` WHERE grade_id = $1`;
      studentIdsParams.push(profileGradeId);
    }
    const studentIdsRes = await db.query(studentIdsSql, studentIdsParams);
    const authorizedStudentIds = studentIdsRes.rows.map((r: any) => r.user_id);

    // Retrieve and deduplicate all student assessments
    const allRecentAttempts: any[] = [];
    for (const sid of authorizedStudentIds) {
      const studentAssessments = await this.getCanonicalAssessmentsForStudent(sid, subjectId || undefined);
      for (const a of studentAssessments) {
        allRecentAttempts.push({
          id: a.attemptId,
          attempt_id: a.attemptId,
          exam_id: a.examId,
          chapter_id: a.chapterId || null,
          attempt_type: a.assessmentType === 'AI_DIAGNOSTIC' ? 'AI_EVALUATION' : 'EXAM',
          student_id: a.studentId,
          student_name: a.studentName || 'طالب',
          student_code: a.studentCode || '',
          exam_title: a.titleAr,
          score: a.earnedMarks,
          total_points: a.totalMarks,
          total_questions: a.totalMarks,
          earned_marks: a.earnedMarks,
          total_marks: a.totalMarks,
          percentage: a.percentage,
          status: a.status,
          completed_at: a.completedAt
        });
      }
    }

    // Sort all recent attempts descending
    allRecentAttempts.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());

    // Calculate real weighted average score (null when 0 attempts)
    let avgScore: number | null = null;
    if (allRecentAttempts.length > 0) {
      const totalEarned = allRecentAttempts.reduce((acc, cur) => acc + cur.earned_marks, 0);
      const totalPossible = allRecentAttempts.reduce((acc, cur) => acc + cur.total_marks, 0);
      avgScore = totalPossible > 0 ? this.calculatePercentage(totalEarned, totalPossible) : 0;
    }

    // 6. Chapters mastery strictly in teacher's subject & grade
    let chaptersMastery: any[] = [];
    if (subjectId) {
      let chSql = `
        SELECT bc.id, bc.chapter_number, bc.title_ar, bc.title_en,
               b.title_ar as book_title
        FROM book_chapters bc
        JOIN books b ON bc.book_id = b.id
        WHERE b.subject_id = $1 OR b.subject_id IN (
          SELECT s2.id FROM subjects s1 JOIN subjects s2 ON (s1.code = s2.code OR s1.name_ar = s2.name_ar) WHERE s1.id = $1
        )
      `;
      const specClean = specialization ? specialization.replace(/^(اللغة|مادة|معلم أول|معلم)\s+/i, '').trim().toLowerCase() : '';
      if (specClean.includes('عرب') || specClean.includes('arabic')) {
        chSql += ` AND (LOWER(b.title_ar) NOT LIKE '%social%' AND LOWER(b.title_en) NOT LIKE '%social%' AND LOWER(b.title_ar) NOT LIKE '%english%' AND LOWER(b.title_en) NOT LIKE '%english%' AND LOWER(b.title_ar) NOT LIKE '%math%' AND LOWER(b.title_en) NOT LIKE '%math%' AND LOWER(b.title_ar) NOT LIKE '%science%' AND LOWER(b.title_en) NOT LIKE '%science%')`;
      }
      chSql += ` ORDER BY bc.chapter_number ASC`;

      const chRes = await db.query(chSql, [subjectId]);

      chaptersMastery = chRes.rows.map((ch: any) => {
        // Find matching real attempts for this chapter
        const matchingAttempts = allRecentAttempts.filter(a =>
          (a.chapter_id && a.chapter_id === ch.id) ||
          (a.exam_title && (a.exam_title.includes(ch.title_ar) || ch.title_ar.includes(a.exam_title)))
        );

        let pct: number | null = null;
        let status: 'MASTERED' | 'DEVELOPING' | 'NEEDS_WORK' | 'NOT_ASSESSED' = 'NOT_ASSESSED';
        if (matchingAttempts.length > 0) {
          const chEarned = matchingAttempts.reduce((acc, cur) => acc + cur.earned_marks, 0);
          const chTotal = matchingAttempts.reduce((acc, cur) => acc + cur.total_marks, 0);
          pct = chTotal > 0 ? this.calculatePercentage(chEarned, chTotal) : 0;
          status = this.getMasteryStatus(pct) === 'MASTERED' ? 'MASTERED' : pct >= 50 ? 'DEVELOPING' : 'NEEDS_WORK';
        }

        return {
          id: ch.id,
          chapter_number: ch.chapter_number,
          title_ar: ch.title_ar,
          title_en: ch.title_en,
          book_title: ch.book_title,
          mastery_percentage: pct,
          status,
          attempts_count: matchingAttempts.length
        };
      });
    }

    // Top and lowest chapters
    const assessedChapters = chaptersMastery.filter(ch => ch.attempts_count > 0 && ch.mastery_percentage !== null);
    const sortedChapters = [...assessedChapters].sort((a, b) => (b.mastery_percentage || 0) - (a.mastery_percentage || 0));
    const topChapter = sortedChapters.length > 0 ? sortedChapters[0] : null;
    const lowestChapter = sortedChapters.length > 1 ? sortedChapters[sortedChapters.length - 1] : null;

    return {
      subject: {
        id: subjectId,
        name_ar: subjectNameAr
      },
      stats: {
        total_students: totalStudents,
        total_my_exams: totalMyExams,
        total_attempts: allRecentAttempts.length,
        avg_score: avgScore
      },
      top_chapter: topChapter,
      lowest_chapter: lowestChapter,
      chapters_mastery: chaptersMastery,
      recent_attempts: allRecentAttempts.slice(0, 50)
    };
  }
}
