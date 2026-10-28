import { db } from '../db/db.js';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AnswerValidationService, ExamValidationSummary, QuestionValidationResult } from './answerValidationService.js';
import { AiUsageMetricsService } from './aiUsageMetricsService.js';
import { validateListeningAndSourceGrounding } from './ai/aiRagEngine.js';

export interface AuthoritativeCurriculumIdentity {
  bookId: string;
  titleAr: string;
  titleEn: string;
  gradeId: string;
  gradeNameAr?: string;
  gradeNameEn?: string;
  academicStageId: string;
  stageNameAr?: string;
  stageNameEn?: string;
  subjectId: string;
  subjectNameAr?: string;
  subjectNameEn?: string;
  term: number;
  schoolType: 'عربي' | 'لغات' | 'كلاهما';
}

export interface ExamGenerationParameters {
  count: number;
  questionTypes?: string[];
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'BALANCED';
  language?: 'ar' | 'en';
  bloomLevels?: string[];
  styleReferenceId?: string | null;
}

export interface CachedExamRecord {
  examId: string;
  configKey: string;
  cacheKey: string; // Backward compatibility alias
  configHash: string;
  contentHash: string;
  versionNumber: number;
  curriculumIdentity: AuthoritativeCurriculumIdentity;
  unitIds: string[];
  unitSetKey: string;
  parameters: ExamGenerationParameters;
  paramHash: string;
  questions: any[];
  assignedStudents: Set<string>;
  createdAt: number;
  provenanceVerified: boolean;
}

export interface CacheLookupResult {
  hit: boolean;
  reason: 'CACHE_HIT' | 'CACHE_MISS' | 'ALL_VERSIONS_ASSIGNED' | 'STUDENT_NO_REPEAT_EXCLUSION' | 'INELIGIBLE_STUDENT' | 'UNAUTHORIZED_TEACHER';
  exam?: CachedExamRecord;
  configKey: string;
  cacheKey: string; // Backward compatibility alias
  configHash: string;
  curriculumIdentity: AuthoritativeCurriculumIdentity;
}

export class ExamCacheService {
  // Optional in-memory L1 cache layer for transient acceleration; authoritative source is always the database
  private static memoryL1 = new Map<string, CachedExamRecord[]>();

  /**
   * Compute authoritative 64-char SHA-256 hash of canonical configuration string.
   */
  public static computeConfigHash(configKey: string): string {
    return crypto.createHash('sha256').update(configKey).digest('hex');
  }

  /**
   * Compute deterministic 64-char SHA-256 content hash of normalized questions array.
   */
  public static computeContentHash(questions: any[]): string {
    const normalized = (questions || []).map(q => ({
      text: (q.question_text || '').trim(),
      type: q.question_type || 'MULTIPLE_CHOICE',
      options: (q.options || []).map((o: any) => typeof o === 'string' ? o.trim() : (o.text || o.option_text || '').trim()).sort(),
      answer: (q.correct_answer || q.answer || '').toString().trim()
    })).sort((a, b) => a.text.localeCompare(b.text));
    return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  }

  /**
   * 1. Resolve complete Authoritative Curriculum Identity from database by exact book ID.
   * Never relies on client-provided names, labels, or guesswork.
   */
  public static async resolveCurriculumIdentity(bookId: string): Promise<AuthoritativeCurriculumIdentity> {
    if (!bookId || typeof bookId !== 'string') {
      throw new Error('INVALID_BOOK_ID: Book ID must be a non-empty string');
    }

    const res = await db.query(
      `SELECT 
         b.id as book_id,
         b.title_ar,
         b.title_en,
         b.academic_stage_id,
         b.grade_id,
         b.subject_id,
         b.term,
         COALESCE(b.school_type, 'كلاهما') as school_type,
         g.name_ar as grade_name_ar,
         g.name_en as grade_name_en,
         s.name_ar as subject_name_ar,
         s.name_en as subject_name_en,
         st.name_ar as stage_name_ar,
         st.name_en as stage_name_en
       FROM books b
       JOIN grades g ON b.grade_id = g.id
       JOIN subjects s ON b.subject_id = s.id
       JOIN academic_stages st ON b.academic_stage_id = st.id
       WHERE b.id = $1`,
      [bookId]
    );

    if (res.rows.length === 0) {
      throw new Error(`BOOK_NOT_FOUND: Authoritative book with ID '${bookId}' does not exist in database`);
    }

    const row = res.rows[0];
    let normSchoolType: 'عربي' | 'لغات' | 'كلاهما' = 'كلاهما';
    if (row.school_type === 'لغات') normSchoolType = 'لغات';
    else if (row.school_type === 'عربي' || row.school_type === 'عام') normSchoolType = 'عربي';

    return {
      bookId: row.book_id,
      titleAr: row.title_ar,
      titleEn: row.title_en,
      gradeId: row.grade_id,
      gradeNameAr: row.grade_name_ar,
      gradeNameEn: row.grade_name_en,
      academicStageId: row.academic_stage_id,
      stageNameAr: row.stage_name_ar,
      stageNameEn: row.stage_name_en,
      subjectId: row.subject_id,
      subjectNameAr: row.subject_name_ar,
      subjectNameEn: row.subject_name_en,
      term: Number(row.term) || 1,
      schoolType: normSchoolType
    };
  }

  /**
   * 2. Validate client-supplied parameters against authoritative database identity.
   */
  public static validateSelectionConsistency(
    identity: AuthoritativeCurriculumIdentity,
    candidate: {
      subjectId?: string;
      gradeId?: string;
      academicStageId?: string;
      term?: number;
      schoolType?: string;
    }
  ): { isValid: boolean; error?: string } {
    if (candidate.subjectId && candidate.subjectId !== identity.subjectId) {
      return {
        isValid: false,
        error: `SUBJECT_MISMATCH: Book belongs to authoritative subject '${identity.subjectId}' but request specified '${candidate.subjectId}'`
      };
    }
    if (candidate.gradeId && candidate.gradeId !== identity.gradeId) {
      return {
        isValid: false,
        error: `GRADE_MISMATCH: Book belongs to authoritative grade '${identity.gradeId}' but request specified '${candidate.gradeId}'`
      };
    }
    if (candidate.academicStageId && candidate.academicStageId !== identity.academicStageId) {
      return {
        isValid: false,
        error: `STAGE_MISMATCH: Book belongs to authoritative stage '${identity.academicStageId}' but request specified '${candidate.academicStageId}'`
      };
    }
    if (candidate.term && Number(candidate.term) !== identity.term) {
      return {
        isValid: false,
        error: `TERM_MISMATCH: Book belongs to academic term ${identity.term} but request specified term ${candidate.term}`
      };
    }
    if (candidate.schoolType && identity.schoolType !== 'كلاهما') {
      const candNorm = candidate.schoolType.replace('ى', 'ي');
      const idNorm = identity.schoolType.replace('ى', 'ي');
      if (candNorm !== idNorm) {
        return {
          isValid: false,
          error: `SCHOOL_TYPE_MISMATCH: Book is restricted to '${identity.schoolType}' but request specified '${candidate.schoolType}'`
        };
      }
    }
    return { isValid: true };
  }

  /**
   * 3. Normalize and verify requested chapter/unit IDs.
   */
  public static async normalizeAndValidateUnitSelection(
    bookId: string,
    chapterIds: string | string[]
  ): Promise<{ normalizedUnitIds: string[]; unitSetKey: string }> {
    const rawIds = Array.isArray(chapterIds) ? chapterIds : [chapterIds];
    const uniqueIds = [...new Set(rawIds.filter(id => Boolean(id && typeof id === 'string')))];

    if (uniqueIds.length === 0) {
      throw new Error('EMPTY_UNIT_SELECTION: At least one valid chapter/unit ID must be specified');
    }

    for (const chId of uniqueIds) {
      const chRes = await db.query(
        `SELECT id, book_id FROM book_chapters WHERE id = $1 AND book_id = $2`,
        [chId, bookId]
      );
      if (chRes.rows.length === 0) {
        throw new Error(`INVALID_CHAPTER: Chapter '${chId}' does not belong to book '${bookId}'`);
      }
    }

    const normalizedUnitIds = [...uniqueIds].sort();
    const unitSetKey = normalizedUnitIds.join(',');

    return { normalizedUnitIds, unitSetKey };
  }

  /**
   * 4. Normalize content-affecting exam parameters into a canonical hash.
   */
  public static normalizeExamParameters(params: ExamGenerationParameters): {
    normalizedParams: ExamGenerationParameters;
    paramHash: string;
  } {
    const normalizedParams: ExamGenerationParameters = {
      count: Math.max(1, Math.min(50, Number(params.count) || 3)),
      questionTypes: params.questionTypes && params.questionTypes.length > 0 ? [...new Set(params.questionTypes)].sort() : ['MULTIPLE_CHOICE'],
      difficulty: params.difficulty || 'MEDIUM',
      language: params.language || 'ar',
      bloomLevels: params.bloomLevels && params.bloomLevels.length > 0 ? [...new Set(params.bloomLevels)].sort() : undefined,
      styleReferenceId: params.styleReferenceId ? String(params.styleReferenceId).trim() : null
    };

    const serialized = JSON.stringify(normalizedParams);
    const paramHash = crypto.createHash('sha256').update(serialized).digest('hex').slice(0, 16);

    return { normalizedParams, paramHash };
  }

  /**
   * 5. Compute authoritative composite canonical configuration key.
   */
  public static buildCanonicalConfigKey(
    identity: AuthoritativeCurriculumIdentity,
    unitSetKey: string,
    paramHash: string
  ): string {
    return [
      'exam_cache:v1',
      `stage=${identity.academicStageId}`,
      `grade=${identity.gradeId}`,
      `subject=${identity.subjectId}`,
      `book=${identity.bookId}`,
      `term=${identity.term}`,
      `schoolType=${identity.schoolType}`,
      `units=${unitSetKey}`,
      `params=${paramHash}`
    ].join(':');
  }

  // Alias for backward compatibility
  public static buildCanonicalCacheKey(
    identity: AuthoritativeCurriculumIdentity,
    unitSetKey: string,
    paramHash: string
  ): string {
    return this.buildCanonicalConfigKey(identity, unitSetKey, paramHash);
  }

  /**
   * 6. Student Eligibility Authorization Check against live database.
   */
  public static async validateStudentEligibility(
    studentId: string,
    identity: AuthoritativeCurriculumIdentity
  ): Promise<{ isEligible: boolean; reason?: string }> {
    if (!studentId) {
      return { isEligible: false, reason: 'STUDENT_ID_MISSING' };
    }

    const res = await db.query(
      `SELECT user_id, academic_stage_id, grade_id, school_type 
       FROM student_profiles 
       WHERE user_id = $1`,
      [studentId]
    );

    if (res.rows.length === 0) {
      return { isEligible: false, reason: 'STUDENT_PROFILE_NOT_FOUND' };
    }

    const p = res.rows[0];
    if (p.academic_stage_id !== identity.academicStageId) {
      return {
        isEligible: false,
        reason: `STAGE_MISMATCH: Student stage '${p.academic_stage_id}' does not match book stage '${identity.academicStageId}'`
      };
    }

    if (p.grade_id !== identity.gradeId) {
      return {
        isEligible: false,
        reason: `GRADE_MISMATCH: Student grade '${p.grade_id}' does not match book grade '${identity.gradeId}'`
      };
    }

    const studentSchoolType = (p.school_type || 'عربي').trim();
    if (identity.schoolType !== 'كلاهما' && identity.schoolType !== studentSchoolType) {
      return {
        isEligible: false,
        reason: `SCHOOL_TYPE_MISMATCH: Student school type '${studentSchoolType}' does not match book school type '${identity.schoolType}'`
      };
    }

    return { isEligible: true };
  }

  /**
   * 7. Teacher Authorization Check against live database.
   */
  public static async validateTeacherAuthorization(
    teacherId: string,
    identity: AuthoritativeCurriculumIdentity
  ): Promise<{ isAuthorized: boolean; reason?: string }> {
    if (!teacherId) {
      return { isAuthorized: false, reason: 'TEACHER_ID_MISSING' };
    }

    const userRes = await db.query(
      `SELECT u.id, u.role, u.is_active, tp.specialization, tp.subject_id
       FROM users u
       LEFT JOIN teacher_profiles tp ON u.id = tp.user_id
       WHERE u.id = $1`,
      [teacherId]
    );

    if (userRes.rows.length === 0) {
      return { isAuthorized: false, reason: 'TEACHER_NOT_FOUND' };
    }

    const u = userRes.rows[0];
    if (u.role === 'ADMIN' || u.role === 'SUPERVISOR' || u.role === 'CENTRAL_ADMIN') {
      return { isAuthorized: true };
    }

    if (u.role !== 'TEACHER') {
      return { isAuthorized: false, reason: 'USER_NOT_TEACHER' };
    }

    if (u.subject_id && u.subject_id !== identity.subjectId) {
      return {
        isAuthorized: false,
        reason: `TEACHER_SUBJECT_UNAUTHORIZED: Teacher subject '${u.subject_id}' does not match book subject '${identity.subjectId}'`
      };
    }

    return { isAuthorized: true };
  }

  /**
   * Resolve authoritative subject ID for a teacher from their profile/account.
   */
  public static async resolveTeacherSubjectId(teacherId: string): Promise<string | null> {
    if (!teacherId) return null;
    const res = await db.query(
      `SELECT u.subject_id as user_subject_id, tp.subject_id as profile_subject_id, tp.specialization
       FROM users u
       LEFT JOIN teacher_profiles tp ON u.id = tp.user_id
       WHERE u.id = $1`,
      [teacherId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    if (row.profile_subject_id) return row.profile_subject_id;
    if (row.user_subject_id) return row.user_subject_id;
    if (row.specialization) {
      const specClean = row.specialization.replace(/^(اللغة|مادة|معلم أول|معلم)\s+/i, '').trim();
      const sRes = await db.query(
        `SELECT id FROM subjects WHERE name_ar LIKE $1 OR name_en LIKE $1 LIMIT 1`,
        [`%${specClean}%`]
      );
      if (sRes.rows.length > 0) return sRes.rows[0].id;
    }
    return null;
  }

  /**
   * Load style guidance from a designated style reference exam.
   * - Enforces exact curriculum scope match (subject, grade, stage, term, unit).
   * - Enforces teacher ownership/authorization.
   * - Teaches style only (wording, structure, options, difficulty) - never copies questions or treats answer key as facts.
   * - Uses zero paid AI calls (extracts style pattern directly from database).
   * - Safe fallback on missing reference or retrieval failure without blocking exam generation.
   */
  public static async loadStyleGuidanceForReference(
    styleReferenceId: string,
    identity: AuthoritativeCurriculumIdentity,
    options?: {
      teacherId?: string;
      userRole?: string;
      chapterId?: string;
    }
  ): Promise<{ styleGuidance: string | null; error?: string; status?: number }> {
    if (!styleReferenceId || typeof styleReferenceId !== 'string') {
      return { styleGuidance: null };
    }

    try {
      const examRes = await db.query(
        `SELECT id, teacher_id, subject_id, academic_stage_id, grade_id, term, chapter_id, is_style_reference
         FROM exams WHERE id = $1`,
        [styleReferenceId.trim()]
      );

      // Missing reference fallback: fail safe, do not block generation
      if (examRes.rows.length === 0) {
        console.warn(`⚠️ [StyleReference] Reference '${styleReferenceId}' not found. Falling back to default generation.`);
        return { styleGuidance: null };
      }

      const ref = examRes.rows[0];

      // Ownership & authorization check
      const isAdmin = options?.userRole === 'ADMIN' || options?.userRole === 'SUPERVISOR' || options?.userRole === 'CENTRAL_ADMIN';
      if (options?.teacherId && !isAdmin && ref.teacher_id !== options.teacherId) {
        return {
          styleGuidance: null,
          error: 'UNAUTHORIZED_REFERENCE: مرجع الأسلوب المختار لا ينتمي إلى حسابك',
          status: 403
        };
      }

      // Exact scope matching checks (fails closed on mismatch)
      if (ref.subject_id !== identity.subjectId) {
        return {
          styleGuidance: null,
          error: `STYLE_REFERENCE_SUBJECT_MISMATCH: مرجع الأسلوب يتبع مادة '${ref.subject_id}' والمطلوب '${identity.subjectId}'`,
          status: 400
        };
      }

      if (ref.grade_id && ref.grade_id !== identity.gradeId) {
        return {
          styleGuidance: null,
          error: `STYLE_REFERENCE_GRADE_MISMATCH: مرجع الأسلوب يتبع الصف '${ref.grade_id}' والمطلوب '${identity.gradeId}'`,
          status: 400
        };
      }

      if (ref.academic_stage_id && ref.academic_stage_id !== identity.academicStageId) {
        return {
          styleGuidance: null,
          error: `STYLE_REFERENCE_STAGE_MISMATCH: مرجع الأسلوب يتبع المرحلة '${ref.academic_stage_id}' والمطلوب '${identity.academicStageId}'`,
          status: 400
        };
      }

      if (ref.term && Number(ref.term) !== identity.term) {
        return {
          styleGuidance: null,
          error: `STYLE_REFERENCE_TERM_MISMATCH: مرجع الأسلوب للترم ${ref.term} والمطلوب الترم ${identity.term}`,
          status: 400
        };
      }

      if (options?.chapterId && ref.chapter_id && ref.chapter_id !== options.chapterId) {
        return {
          styleGuidance: null,
          error: `STYLE_REFERENCE_UNIT_MISMATCH: مرجع الأسلوب يتبع الوحدة '${ref.chapter_id}' والمطلوب '${options.chapterId}'`,
          status: 400
        };
      }

      // Zero paid AI calls: Extract style pattern directly from database questions
      const qRes = await db.query(
        `SELECT eq.question_text, eq.question_type, eq.points,
                eqo.option_text, eqo.is_correct
         FROM exam_questions eq
         LEFT JOIN exam_question_options eqo ON eq.id = eqo.question_id
         WHERE eq.exam_id = $1
         ORDER BY eq.order_index ASC
         LIMIT 40`,
        [ref.id]
      );

      if (qRes.rows.length === 0) {
        return { styleGuidance: null };
      }

      // Group options by question_text
      const questionsMap = new Map<string, { text: string; options: string[] }>();
      for (const row of qRes.rows) {
        if (!questionsMap.has(row.question_text)) {
          questionsMap.set(row.question_text, { text: row.question_text, options: [] });
        }
        if (row.option_text) {
          questionsMap.get(row.question_text)!.options.push(row.option_text);
        }
      }

      const sampleQuestions = Array.from(questionsMap.values()).slice(0, 4);
      const styleLines: string[] = [
        `نماذج من صياغة وبنية الأسئلة المعتمدة لدى المعلم للاسترشاد بطريقة الصياغة وطول الخيارات وأسلوب المشتتات:`
      ];

      sampleQuestions.forEach((sq, idx) => {
        styleLines.push(`${idx + 1}. صيغة السؤال: "${sq.text}"`);
        if (sq.options.length > 0) {
          styleLines.push(`   أمثلة على طول وشكل الخيارات: [${sq.options.slice(0, 4).map(o => `"${o}"`).join('، ')}]`);
        }
      });

      styleLines.push(
        `تنبيه صارم: استخدم هذه النماذج كمرجع لأسلوب الصياغة ومستوى الصعوبة وشكل الخيارات فقط. لا تنسخ هذه الأسئلة أو إجاباتها، واعتمد حصرياً على نصوص الكتاب المدرسي المرفق كمصدر وحيد للمحتوى والإجابات الصحيحة.`
      );

      return { styleGuidance: styleLines.join('\n') };
    } catch (dbErr: any) {
      console.warn(`⚠️ [StyleReference] Safe retrieval fallback on error:`, dbErr?.message || dbErr);
      return { styleGuidance: null };
    }
  }

  /**
   * 8. Verify Exam Questions Provenance against Database Source Pages & Chunks.
   * Strict Validation Rules:
   * 1. Every question must have valid, verifiable source provenance.
   * 2. Every page_reference must exist in book_pages for the exact authoritative book_id.
   * 3. Every chunk_id or source_chunk_id must exist in book_chunks for the same authoritative book_id.
   * 4. If a question supplies both a page reference and a chunk reference, validate both and
   *    verify their mutual relationship: chunk.page_number must match page_reference.
   *    Reject contradictory references.
   * 5. If selected units or chapters are specified, verify that the source page/chunk belongs
   *    to the requested curriculum scope using authoritative chapter and book relationships.
   * 6. Fails closed: Missing, contradictory, invalid, or unverifiable provenance returns isVerified: false.
   */
  public static async verifyExamQuestionsProvenance(
    questions: any[],
    bookId: string,
    selectedUnitOrChapterIds?: string[]
  ): Promise<{ isVerified: boolean; reason?: string }> {
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return { isVerified: false, reason: 'EMPTY_QUESTIONS' };
    }

    if (!bookId) {
      return { isVerified: false, reason: 'BOOK_ID_MISSING' };
    }

    // Verify authoritative book exists
    const bookRes = await db.query('SELECT id FROM books WHERE id = $1', [bookId]);
    if (bookRes.rows.length === 0) {
      return { isVerified: false, reason: `BOOK_NOT_FOUND: Book ${bookId} does not exist in authoritative database` };
    }

    // Resolve chapter scope if chapters specified
    const allowedChapterMap = new Map<string, { startPage: number; endPage: number }>();
    let hasChapterScopeFilter = false;

    if (selectedUnitOrChapterIds && Array.isArray(selectedUnitOrChapterIds) && selectedUnitOrChapterIds.length > 0) {
      hasChapterScopeFilter = true;
      const chaptersRes = await db.query(
        'SELECT id, start_page, end_page FROM book_chapters WHERE book_id = $1',
        [bookId]
      );
      const allBookChapters = chaptersRes.rows;
      for (const chId of selectedUnitOrChapterIds) {
        const found = allBookChapters.find((r: any) => r.id === chId);
        if (found) {
          allowedChapterMap.set(chId, {
            startPage: Number(found.start_page) || 1,
            endPage: Number(found.end_page) || 1
          });
        }
      }

      if (allowedChapterMap.size === 0) {
        return {
          isVerified: false,
          reason: `INVALID_CHAPTER_SELECTION: None of the selected chapters belong to book ${bookId}`
        };
      }
    }

    for (const q of questions) {
      const pageRef = q.page_reference ? Number(q.page_reference) : null;
      const chunkId = q.chunk_id || q.source_chunk_id || null;

      if (!pageRef && !chunkId) {
        return { isVerified: false, reason: 'UNGROUNDED_QUESTION: Question missing both page_reference and chunk_id' };
      }

      let verifiedPageNumber: number | null = null;
      let chunkRow: any = null;

      // 1. Validate chunk_id if present
      if (chunkId) {
        const cRes = await db.query(
          'SELECT id, book_id, chapter_id, page_number FROM book_chunks WHERE book_id = $1 AND id = $2',
          [bookId, chunkId]
        );
        if (cRes.rows.length === 0) {
          return { isVerified: false, reason: `CHUNK_NOT_FOUND: Chunk ${chunkId} does not belong to book ${bookId}` };
        }
        chunkRow = cRes.rows[0];
        verifiedPageNumber = Number(chunkRow.page_number);
      }

      // 2. Validate page_reference if present
      if (pageRef && pageRef > 0) {
        const pRes = await db.query(
          'SELECT page_number FROM book_pages WHERE book_id = $1 AND page_number = $2',
          [bookId, pageRef]
        );
        if (pRes.rows.length === 0) {
          return { isVerified: false, reason: `PAGE_NOT_FOUND: Page ${pageRef} does not exist in book ${bookId}` };
        }
        verifiedPageNumber = pageRef;
      }

      // 3. Dual-reference cross-validation: verify relationship between page and chunk
      if (pageRef && pageRef > 0 && chunkRow) {
        if (Number(chunkRow.page_number) !== pageRef) {
          return {
            isVerified: false,
            reason: `CONTRADICTORY_PROVENANCE: Question specifies page ${pageRef} but referenced chunk ${chunkId} belongs to page ${chunkRow.page_number}`
          };
        }
      }

      // 4. Curriculum scope validation against selected chapters
      if (hasChapterScopeFilter) {
        let isWithinScope = false;

        // If chunk belongs directly to an allowed chapter
        if (chunkRow && chunkRow.chapter_id && allowedChapterMap.has(chunkRow.chapter_id)) {
          isWithinScope = true;
        }

        // Check if verified page falls within start_page and end_page of any allowed chapter
        if (!isWithinScope && verifiedPageNumber !== null) {
          for (const [_, range] of allowedChapterMap.entries()) {
            if (verifiedPageNumber >= range.startPage && verifiedPageNumber <= range.endPage) {
              isWithinScope = true;
              break;
            }
          }
        }

        if (!isWithinScope) {
          return {
            isVerified: false,
            reason: `PROVENANCE_OUTSIDE_UNIT_SCOPE: Question source (Page ${verifiedPageNumber || pageRef}, Chunk ${chunkId || 'none'}) is outside the scope of selected chapters`
          };
        }
      }
    }

    return { isVerified: true };
  }

  /**
   * 9. Query Shared Cache for an Eligible Student.
   * Multi-Version Aware:
   *   - Excludes any cached exam version the student has ALREADY received.
   *   - If an unassigned version exists for this canonical config, reuses it (CACHE_HIT).
   *   - If all existing versions have been assigned to this student, returns ALL_VERSIONS_ASSIGNED
   *     so a fresh version can be generated and persisted.
   */
  public static async getCachedExamForStudent(params: {
    studentId: string;
    bookId: string;
    chapterIds: string | string[];
    examParams: ExamGenerationParameters;
    clientCandidate?: {
      subjectId?: string;
      gradeId?: string;
      academicStageId?: string;
      term?: number;
      schoolType?: string;
    };
  }): Promise<CacheLookupResult> {
    // A. Resolve authoritative curriculum identity
    const identity = await this.resolveCurriculumIdentity(params.bookId);

    // B. Validate selection consistency
    if (params.clientCandidate) {
      const consistency = this.validateSelectionConsistency(identity, params.clientCandidate);
      if (!consistency.isValid) {
        throw new Error(consistency.error);
      }
    }

    // C. Validate student eligibility
    const eligibility = await this.validateStudentEligibility(params.studentId, identity);
    if (!eligibility.isEligible) {
      return {
        hit: false,
        reason: 'INELIGIBLE_STUDENT',
        configKey: '',
        cacheKey: '',
        configHash: '',
        curriculumIdentity: identity
      };
    }

    // D. Normalize units & parameters
    const { normalizedUnitIds, unitSetKey } = await this.normalizeAndValidateUnitSelection(params.bookId, params.chapterIds);
    const { normalizedParams, paramHash } = this.normalizeExamParameters(params.examParams);

    // E. Compute canonical configuration key and hash
    const configKey = this.buildCanonicalConfigKey(identity, unitSetKey, paramHash);
    const configHash = this.computeConfigHash(configKey);

    const requestedCount = Number(normalizedParams.count) || 1;

    // F. Lookup in persistent database: Find oldest verified cached exam version that satisfies full requested count and is NOT yet assigned to this student
    const candidateRes = await db.query(
      `SELECT sce.*
       FROM shared_cached_exams sce
       WHERE sce.config_hash = $1
         AND sce.provenance_verified = 1
         AND sce.total_questions >= $3
         AND sce.id NOT IN (
           SELECT sea.cached_exam_id
           FROM student_exam_assignments sea
           WHERE sea.student_id = $2
           UNION
           SELECT ea.exam_id
           FROM exam_attempts ea
           WHERE ea.student_id = $2
         )
       ORDER BY sce.version_number ASC, sce.created_at ASC
       LIMIT 1`,
      [configHash, params.studentId, requestedCount]
    );

    if (candidateRes.rows.length === 0) {
      // Check if any verified versions exist for this configuration satisfying the requested question count
      const totalVersionsRes = await db.query(
        `SELECT count(*) as cnt FROM shared_cached_exams WHERE config_hash = $1 AND provenance_verified = 1 AND total_questions >= $2`,
        [configHash, requestedCount]
      );
      const totalVersions = Number(totalVersionsRes.rows[0].cnt);

      const reason = totalVersions > 0 ? 'ALL_VERSIONS_ASSIGNED' : 'CACHE_MISS';
      return {
        hit: false,
        reason,
        configKey,
        cacheKey: configKey,
        configHash,
        curriculumIdentity: identity
      };
    }

    const row = candidateRes.rows[0];

    // Load all currently assigned students for this specific version
    const assignmentsRes = await db.query(
      `SELECT student_id FROM student_exam_assignments WHERE cached_exam_id = $1`,
      [row.id]
    );
    const assignedStudents = new Set<string>(assignmentsRes.rows.map((r: any) => r.student_id));

    // Parse questions and parameters
    let parsedQuestions: any[] = [];
    try {
      parsedQuestions = typeof row.questions_data === 'string' ? JSON.parse(row.questions_data) : row.questions_data;
    } catch (_) {
      parsedQuestions = [];
    }

    if (!Array.isArray(parsedQuestions) || parsedQuestions.length < requestedCount) {
      console.warn(`⚠️ [ExamCacheService] Cached exam ${row.id} has ${Array.isArray(parsedQuestions) ? parsedQuestions.length : 0} questions, expected ${requestedCount}. Skipping incomplete cache record.`);
      return {
        hit: false,
        reason: 'CACHE_MISS',
        configKey,
        cacheKey: configKey,
        configHash,
        curriculumIdentity: identity
      };
    }

    const allQuestionsValid = parsedQuestions.every(q => 
      q && typeof q.question_text === 'string' && q.question_text.trim().length > 0 &&
      Array.isArray(q.options) && q.options.length > 0
    );

    if (!allQuestionsValid) {
      console.warn(`⚠️ [ExamCacheService] Cached exam ${row.id} contains structurally malformed questions or missing options. Skipping corrupted cache record.`);
      return {
        hit: false,
        reason: 'CACHE_MISS',
        configKey,
        cacheKey: configKey,
        configHash,
        curriculumIdentity: identity
      };
    }

    // Verify textbook grounding & listening audio availability for cached questions
    const allQuestionsGrounded = parsedQuestions.every(q => {
      const gResult = validateListeningAndSourceGrounding(q, q.chunk_text || q.source_excerpt || '');
      return gResult.isValid;
    });

    if (!allQuestionsGrounded) {
      console.warn(`⚠️ [ExamCacheService] Cached exam ${row.id} contains question(s) that fail textbook grounding or listening source checks. Skipping cache record.`);
      return {
        hit: false,
        reason: 'CACHE_MISS',
        configKey,
        cacheKey: configKey,
        configHash,
        curriculumIdentity: identity
      };
    }

    // Verify all curriculum identity dimensions on row match requested identity
    const identityMatches =
      row.book_id === identity.bookId &&
      row.academic_stage_id === identity.academicStageId &&
      row.grade_id === identity.gradeId &&
      row.subject_id === identity.subjectId &&
      Number(row.term) === Number(identity.term) &&
      row.school_type === identity.schoolType;

    if (!identityMatches) {
      console.warn(`⚠️ [ExamCacheService] Cached exam ${row.id} identity dimensions do not match requested identity. Skipping record.`);
      return {
        hit: false,
        reason: 'CACHE_MISS',
        configKey,
        cacheKey: configKey,
        configHash,
        curriculumIdentity: identity
      };
    }

    let parsedParameters: ExamGenerationParameters = normalizedParams;
    try {
      parsedParameters = typeof row.parameters_json === 'string' ? JSON.parse(row.parameters_json) : row.parameters_json;
    } catch (_) {}

    let parsedUnits: string[] = normalizedUnitIds;
    try {
      parsedUnits = typeof row.unit_ids === 'string' ? JSON.parse(row.unit_ids) : row.unit_ids;
    } catch (_) {}

    const examRecord: CachedExamRecord = {
      examId: row.id,
      configKey: row.config_key,
      cacheKey: row.config_key,
      configHash: row.config_hash,
      contentHash: row.content_hash,
      versionNumber: Number(row.version_number) || 1,
      curriculumIdentity: identity,
      unitIds: parsedUnits,
      unitSetKey: row.unit_set_key,
      parameters: parsedParameters,
      paramHash: row.param_hash,
      questions: parsedQuestions,
      assignedStudents,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      provenanceVerified: Boolean(row.provenance_verified)
    };

    return {
      hit: true,
      reason: 'CACHE_HIT',
      exam: examRecord,
      configKey,
      cacheKey: configKey,
      configHash,
      curriculumIdentity: identity
    };
  }

  /**
   * 10. Store an authoritative exam version in the shared cache.
   * Multi-Version Aware:
   *   - Increments version_number for the canonical config_hash.
   *   - Enforces unique content_hash per config to avoid duplicate identical versions.
   *   - Verifies question provenance before marking provenance_verified = 1.
   */
  public static async storeExamInCache(params: {
    examId?: string;
    identity: AuthoritativeCurriculumIdentity;
    unitIds: string[];
    examParams: ExamGenerationParameters;
    questions: any[];
    assignedStudentId?: string;
    skipProvenanceCheck?: boolean; // strictly for test fixtures
    generationSessionId?: string;
  }): Promise<CachedExamRecord> {
    const normalizedUnits = [...new Set(params.unitIds)].sort();
    const unitSetKey = normalizedUnits.join(',');
    const { normalizedParams, paramHash } = this.normalizeExamParameters(params.examParams);
    const configKey = this.buildCanonicalConfigKey(params.identity, unitSetKey, paramHash);
    const configHash = this.computeConfigHash(configKey);

    // Enforce that incomplete exams are never stored in the shared cache
    const expectedCount = Number(params.examParams.count) || 0;
    if (expectedCount > 0 && params.questions.length < expectedCount) {
      throw new Error(`INCOMPLETE_EXAM_CANNOT_BE_CACHED: Cannot store exam with ${params.questions.length} questions when ${expectedCount} were requested`);
    }

    // Validate Question Structure and Answer Key Correctness
    const validationSummary = AnswerValidationService.validateExamQuestions(params.questions);
    if (validationSummary.hasRejectedAnswers || !validationSummary.allStructurallyValid) {
      const rejectedReason = validationSummary.results.find(r => r.answerKeyStatus === 'REJECTED')?.reason 
        || 'Question structural validation failed';
      throw new Error(`ANSWER_VALIDATION_REJECTED: ${rejectedReason}`);
    }

    // Annotate questions with explicit validation metadata
    const annotatedQuestions = params.questions.map((q, idx) => {
      const val = validationSummary.results[idx];
      return {
        ...q,
        structural_valid: val ? val.isStructurallyValid : false,
        answer_key_status: val ? val.answerKeyStatus : 'ANSWER_KEY_UNVERIFIED',
        verification_method: val ? val.verificationMethod : 'STRUCTURE_ONLY',
        requires_teacher_review: val ? val.requiresTeacherReview : true
      };
    });

    const contentHash = this.computeContentHash(annotatedQuestions);

    const examId = params.examId || `cached_exam_${uuidv4()}`;
    const questionsJson = JSON.stringify(annotatedQuestions);
    const paramsWithSession = {
      ...normalizedParams,
      ...(params.generationSessionId ? { generationSessionId: params.generationSessionId } : {})
    };
    const paramsJson = JSON.stringify(paramsWithSession);
    const unitsJson = JSON.stringify(normalizedUnits);

    // Verify Question Provenance
    let isProvenanceVerified = false;
    if (params.skipProvenanceCheck) {
      isProvenanceVerified = true;
    } else {
      const provCheck = await this.verifyExamQuestionsProvenance(
        annotatedQuestions,
        params.identity.bookId,
        params.unitIds
      );
      if (!provCheck.isVerified) {
        console.warn('⚠️ [ExamCacheService provenance check failed]:', provCheck.reason);
      }
      isProvenanceVerified = provCheck.isVerified;
    }
    const provenanceVerifiedInt = isProvenanceVerified ? 1 : 0;

    // Calculate next version number for this config_hash
    const nextVerRes = await db.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_ver FROM shared_cached_exams WHERE config_hash = $1`,
      [configHash]
    );
    const versionNumber = Number(nextVerRes.rows[0].next_ver) || 1;

    let finalExamId = examId;
    let finalQuestions = params.questions;
    let finalVersion = versionNumber;

    try {
      await db.query(
        `INSERT INTO shared_cached_exams (
           id, config_key, config_hash, content_hash, version_number,
           book_id, academic_stage_id, grade_id, subject_id,
           term, school_type, unit_ids, unit_set_key, parameters_json, param_hash,
           questions_data, total_questions, provenance_verified
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          examId,
          configKey,
          configHash,
          contentHash,
          versionNumber,
          params.identity.bookId,
          params.identity.academicStageId,
          params.identity.gradeId,
          params.identity.subjectId,
          params.identity.term,
          params.identity.schoolType,
          unitsJson,
          unitSetKey,
          paramsJson,
          paramHash,
          questionsJson,
          params.questions.length,
          provenanceVerifiedInt
        ]
      );
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      if (
        errMsg.includes('Duplicate') ||
        errMsg.includes('uq_config_content') ||
        errMsg.includes('UNIQUE') ||
        err?.code === 'ER_DUP_ENTRY'
      ) {
        // Another concurrent worker generated the exact same question content under this config.
        // Retrieve and reuse the existing authoritative record.
        const existing = await db.query(
          `SELECT id, version_number, questions_data FROM shared_cached_exams WHERE config_hash = $1 AND content_hash = $2 LIMIT 1`,
          [configHash, contentHash]
        );
        if (existing.rows.length > 0) {
          finalExamId = existing.rows[0].id;
          finalVersion = Number(existing.rows[0].version_number) || 1;
          try {
            finalQuestions = typeof existing.rows[0].questions_data === 'string'
              ? JSON.parse(existing.rows[0].questions_data)
              : existing.rows[0].questions_data;
          } catch (_) {}
        }
      } else {
        throw err;
      }
    }

    const assignedStudents = new Set<string>();

    if (params.assignedStudentId) {
      await this.recordStudentAssignment(configKey, params.assignedStudentId, finalExamId);
      assignedStudents.add(params.assignedStudentId);
    }

    if (params.generationSessionId && finalExamId) {
      await AiUsageMetricsService.linkSessionToExam(params.generationSessionId, finalExamId).catch(err => {
        console.warn('⚠️ [ExamCacheService] linkSessionToExam error:', err?.message || err);
      });
    }

    const record: CachedExamRecord = {
      examId: finalExamId,
      configKey,
      cacheKey: configKey,
      configHash,
      contentHash,
      versionNumber: finalVersion,
      curriculumIdentity: params.identity,
      unitIds: normalizedUnits,
      unitSetKey,
      parameters: normalizedParams,
      paramHash,
      questions: finalQuestions,
      assignedStudents,
      createdAt: Date.now(),
      provenanceVerified: isProvenanceVerified
    };

    return record;
  }

  /**
   * 11. Record that a student was assigned / took this specific cached exam version.
   * Guarantees at the database level that assigning the same version to the same student is impossible.
   */
  public static async recordStudentAssignment(
    configKey: string,
    studentId: string,
    cachedExamId: string
  ): Promise<{ success: boolean; duplicate: boolean }> {
    if (!studentId || !configKey || !cachedExamId) {
      throw new Error(`INVALID_ASSIGNMENT_PARAMETERS: studentId, configKey, and cachedExamId are all required (received studentId='${studentId}', configKey='${configKey}', cachedExamId='${cachedExamId}')`);
    }

    const configHash = this.computeConfigHash(configKey);
    const assignmentId = `asgn_${uuidv4()}`;

    try {
      await db.query(
        `INSERT INTO student_exam_assignments (
           id, cached_exam_id, student_id, config_hash, status
         ) VALUES ($1, $2, $3, $4, 'ASSIGNED')`,
        [assignmentId, cachedExamId, studentId, configHash]
      );

      return { success: true, duplicate: false };
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      if (
        errMsg.includes('Duplicate') ||
        errMsg.includes('uq_student_cached_exam') ||
        errMsg.includes('UNIQUE') ||
        err?.code === 'ER_DUP_ENTRY'
      ) {
        return { success: false, duplicate: true };
      }
      throw err;
    }
  }

  /**
   * Clear in-memory cache only.
   */
  public static clearMemoryCache(): void {
    this.memoryL1.clear();
  }

  /**
   * Full cache clear (both in-memory and database tables).
   * Used for isolated test tear-downs to guarantee clean slate.
   */
  public static async clearCache(options?: { memoryOnly?: boolean }): Promise<void> {
    this.memoryL1.clear();
    if (!options?.memoryOnly) {
      await db.query(`DELETE FROM student_exam_assignments WHERE id IS NOT NULL`);
      await db.query(`DELETE FROM shared_cached_exams WHERE id IS NOT NULL`);
    }
  }

  /**
   * Return number of persistent cached exams in the database.
   */
  public static async getCacheSize(): Promise<number> {
    const res = await db.query(`SELECT count(*) as cnt FROM shared_cached_exams`);
    return Number(res.rows[0].cnt);
  }

  /**
   * 12. Multi-Instance Concurrency Control.
   * Prevents multiple serverless instances from triggering concurrent duplicate Gemini generations
   * for the exact same configuration key/hash.
   */
  public static async acquireGenerationLock(
    configHash: string,
    ttlMs: number = 45000
  ): Promise<{ acquired: boolean; lockId: string }> {
    const lockId = uuidv4();
    const lockKey = `lock:${configHash.slice(0, 58)}`;
    const expiresAt = Date.now() + ttlMs;
    const lockPayload = JSON.stringify({ lockId, expiresAt });

    try {
      await db.query(
        `INSERT INTO platform_settings (setting_key, setting_value, updated_at, updated_by)
         VALUES ($1, $2, CURRENT_TIMESTAMP, $3)`,
        [lockKey, lockPayload, lockId]
      );
      return { acquired: true, lockId };
    } catch (err: any) {
      // Lock row already exists; check if it has expired
      try {
        const existing = await db.query(
          `SELECT setting_value FROM platform_settings WHERE setting_key = $1`,
          [lockKey]
        );
        if (existing.rows.length > 0) {
          const val = JSON.parse(existing.rows[0].setting_value || '{}');
          if (val.expiresAt && Date.now() > val.expiresAt) {
            // Expired lock: take over with an atomic update (CAS on setting_value and recording new lockId in updated_by)
            const updateRes = await db.query(
              `UPDATE platform_settings
               SET setting_value = $1, updated_by = $4, updated_at = CURRENT_TIMESTAMP
               WHERE setting_key = $2 AND setting_value = $3`,
              [lockPayload, lockKey, existing.rows[0].setting_value, lockId]
            );
            if (updateRes.rowCount > 0) {
              return { acquired: true, lockId };
            }
          }
        }
      } catch (_) {}

      return { acquired: false, lockId: '' };
    }
  }

  /**
   * Release generation lock after generation completes or fails.
   * Performs exact owner-token comparison using updated_by column, with LIKE fallback for legacy rows.
   */
  public static async releaseGenerationLock(configHash: string, lockId: string): Promise<void> {
    if (!configHash || !lockId) return;
    const lockKey = `lock:${configHash.slice(0, 58)}`;
    try {
      await db.query(
        `DELETE FROM platform_settings WHERE setting_key = $1 AND (updated_by = $2 OR setting_value LIKE $3)`,
        [lockKey, lockId, `%"lockId":"${lockId}"%`]
      );
    } catch (_) {}
  }

  /**
   * Wait for a concurrent instance to finish generation and store the result in shared_cached_exams.
   * Supports positional arguments, an options object, and provides legacy fallback for argument order.
   */
  public static async waitForConcurrentGeneration(
    configHash: string,
    expectedCountOrOptions: number | {
      expectedCount?: number;
      maxWaitMs?: number;
      pollIntervalMs?: number;
      identity?: AuthoritativeCurriculumIdentity;
      studentId?: string;
    } = 1,
    maxWaitMs: number = 35000,
    pollIntervalMs: number = 2000,
    studentIdOption?: string
  ): Promise<CachedExamRecord | null> {
    let expectedCount = 1;
    let actualMaxWaitMs = maxWaitMs;
    let actualPollIntervalMs = pollIntervalMs;
    let expectedIdentity: AuthoritativeCurriculumIdentity | undefined;
    let studentIdToExclude: string | undefined = studentIdOption;

    if (typeof expectedCountOrOptions === 'object' && expectedCountOrOptions !== null) {
      expectedCount = Number(expectedCountOrOptions.expectedCount) || 1;
      actualMaxWaitMs = Number(expectedCountOrOptions.maxWaitMs) || 35000;
      actualPollIntervalMs = Number(expectedCountOrOptions.pollIntervalMs) || 2000;
      expectedIdentity = expectedCountOrOptions.identity;
      if (expectedCountOrOptions.studentId) {
        studentIdToExclude = expectedCountOrOptions.studentId;
      }
    } else if (typeof expectedCountOrOptions === 'number') {
      // Defensive fallback for legacy call site: if 2nd arg > 100, caller passed (configHash, maxWaitMs)
      if (expectedCountOrOptions > 100 && maxWaitMs === 35000) {
        actualMaxWaitMs = expectedCountOrOptions;
        expectedCount = 1;
      } else {
        expectedCount = Math.max(1, expectedCountOrOptions);
        actualMaxWaitMs = maxWaitMs;
        actualPollIntervalMs = pollIntervalMs;
      }
    }

    const start = Date.now();
    while (Date.now() - start < actualMaxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, actualPollIntervalMs));

      let queryStr = `
        SELECT sce.* FROM shared_cached_exams sce
        WHERE sce.config_hash = $1
          AND sce.provenance_verified = 1
          AND sce.total_questions >= $2
      `;
      const queryParams: any[] = [configHash, expectedCount];

      if (studentIdToExclude) {
        queryParams.push(studentIdToExclude);
        queryStr += ` AND sce.id NOT IN (
          SELECT sea.cached_exam_id
          FROM student_exam_assignments sea
          WHERE sea.student_id = $${queryParams.length}
          UNION
          SELECT ea.exam_id
          FROM exam_attempts ea
          WHERE ea.student_id = $${queryParams.length}
        )`;
      }

      queryStr += ` ORDER BY sce.version_number DESC, sce.created_at DESC LIMIT 1`;

      const res = await db.query(queryStr, queryParams);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        let questions: any[] = [];
        try {
          questions = typeof row.questions_data === 'string' ? JSON.parse(row.questions_data) : row.questions_data;
        } catch (_) {
          questions = [];
        }

        const isValidArray = Array.isArray(questions) && questions.length >= expectedCount;
        const allQuestionsValid = isValidArray && questions.every(q =>
          q && typeof q.question_text === 'string' && q.question_text.trim().length > 0 &&
          Array.isArray(q.options) && q.options.length > 0
        );

        if (allQuestionsValid) {
          const resolvedIdentity = await this.resolveCurriculumIdentity(row.book_id);

          if (expectedIdentity) {
            const matches =
              row.book_id === expectedIdentity.bookId &&
              row.academic_stage_id === expectedIdentity.academicStageId &&
              row.grade_id === expectedIdentity.gradeId &&
              row.subject_id === expectedIdentity.subjectId &&
              Number(row.term) === Number(expectedIdentity.term) &&
              row.school_type === expectedIdentity.schoolType;

            if (!matches) {
              console.warn(`⚠️ [ExamCacheService] waitForConcurrentGeneration: cached exam ${row.id} identity dimensions do not match expected identity. Skipping.`);
              continue;
            }
          }

          return {
            examId: row.id,
            configKey: row.config_key,
            cacheKey: row.config_key,
            configHash: row.config_hash,
            contentHash: row.content_hash,
            versionNumber: Number(row.version_number) || 1,
            curriculumIdentity: resolvedIdentity,
            unitIds: typeof row.unit_ids === 'string' ? JSON.parse(row.unit_ids) : row.unit_ids,
            unitSetKey: row.unit_set_key,
            parameters: typeof row.parameters_json === 'string' ? JSON.parse(row.parameters_json) : row.parameters_json,
            paramHash: row.param_hash,
            questions,
            assignedStudents: new Set(),
            createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
            provenanceVerified: Boolean(row.provenance_verified)
          };
        }
      }
    }
    return null;
  }

  /**
   * 13. Query Verified Cache Fallback.
   * If Gemini is unavailable, quota-exhausted (429), or overloaded (503),
   * retrieves the most recent verified exam for the exact canonical configuration
   * (curriculum, book, exact unit selection, language, verified provenance).
   *
   * STRICT ISSUE 5 REMEDIATION:
   * - If studentId is provided, validates student eligibility (stage, grade, school_type).
   * - Excludes ANY cached exam version that this student has already been assigned or attempted.
   * - Fails closed (returns null) if no eligible, unattempted verified exam exists,
   *   preventing an already-completed exam from ever being returned as a new exam upon generation failure/retry.
   */
  public static async getVerifiedFallbackExam(params: {
    bookId: string;
    chapterIds: string | string[];
    examParams: ExamGenerationParameters;
    studentId?: string;
    clientCandidate?: {
      subjectId?: string;
      gradeId?: string;
      academicStageId?: string;
      term?: number;
      schoolType?: string;
    };
  }): Promise<CachedExamRecord | null> {
    const identity = await this.resolveCurriculumIdentity(params.bookId);

    // Enforce student eligibility if studentId is provided
    if (params.studentId) {
      const eligibility = await this.validateStudentEligibility(params.studentId, identity);
      if (!eligibility.isEligible) {
        console.warn(`🛡️ [ExamCacheService.getVerifiedFallbackExam] Ineligible student ${params.studentId}: ${eligibility.reason}`);
        return null;
      }
    }

    if (params.clientCandidate) {
      const consistency = this.validateSelectionConsistency(identity, params.clientCandidate);
      if (!consistency.isValid) return null;
    }

    const { normalizedUnitIds, unitSetKey } = await this.normalizeAndValidateUnitSelection(params.bookId, params.chapterIds);
    const { normalizedParams, paramHash } = this.normalizeExamParameters(params.examParams);

    const configKey = this.buildCanonicalConfigKey(identity, unitSetKey, paramHash);
    const configHash = this.computeConfigHash(configKey);
    const requestedCount = Number(normalizedParams.count) || 1;

    // Find the latest verified exam for this exact configuration satisfying the full requested count
    // Exclude any exam already assigned to or attempted by this student!
    let queryStr = `
      SELECT sce.*
      FROM shared_cached_exams sce
      WHERE sce.config_hash = $1
        AND sce.provenance_verified = 1
        AND sce.total_questions >= $2
    `;
    const queryParams: any[] = [configHash, requestedCount];

    if (params.studentId) {
      queryParams.push(params.studentId);
      queryStr += ` AND sce.id NOT IN (
        SELECT sea.cached_exam_id
        FROM student_exam_assignments sea
        WHERE sea.student_id = $${queryParams.length}
        UNION
        SELECT ea.exam_id
        FROM exam_attempts ea
        WHERE ea.student_id = $${queryParams.length}
      )`;
    }

    queryStr += ` ORDER BY sce.version_number DESC, sce.created_at DESC LIMIT 1`;

    const res = await db.query(queryStr, queryParams);

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    let questions: any[] = [];
    try {
      questions = typeof row.questions_data === 'string' ? JSON.parse(row.questions_data) : row.questions_data;
    } catch (_) {
      return null;
    }

    const isValidArray = Array.isArray(questions) && questions.length >= requestedCount;
    const allQuestionsValid = isValidArray && questions.every(q =>
      q && typeof q.question_text === 'string' && q.question_text.trim().length > 0 &&
      Array.isArray(q.options) && q.options.length > 0
    );

    if (!allQuestionsValid) {
      return null;
    }

    // Verify all curriculum identity dimensions match requested identity
    const identityMatches =
      row.book_id === identity.bookId &&
      row.academic_stage_id === identity.academicStageId &&
      row.grade_id === identity.gradeId &&
      row.subject_id === identity.subjectId &&
      Number(row.term) === Number(identity.term) &&
      row.school_type === identity.schoolType;

    if (!identityMatches) {
      console.warn(`⚠️ [ExamCacheService] Fallback exam ${row.id} identity dimensions do not match requested identity. Rejecting.`);
      return null;
    }

    return {
      examId: row.id,
      configKey: row.config_key,
      cacheKey: row.config_key,
      configHash: row.config_hash,
      contentHash: row.content_hash,
      versionNumber: Number(row.version_number) || 1,
      curriculumIdentity: identity,
      unitIds: normalizedUnitIds,
      unitSetKey: row.unit_set_key,
      parameters: normalizedParams,
      paramHash: row.param_hash,
      questions,
      assignedStudents: new Set(),
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      provenanceVerified: Boolean(row.provenance_verified)
    };
  }
}
