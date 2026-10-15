import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/db.js';
import { authenticateToken, requireRole, enforceStudentGrade, AuthenticatedRequest } from '../middleware/auth.js';
import { aiRagEngine, GroundedQuestion } from '../services/ai/aiRagEngine.js';
import { GeminiClient, GeminiProviderError } from '../services/ai/geminiClient.js';
import { checkStudentExamLimit } from '../services/examLimitService.js';
import { ExamCacheService } from '../services/examCacheService.js';
import { signExamAttemptToken, verifyExamAttemptToken, ExamAttemptTokenPayload } from '../services/answerValidationService.js';
import { ReadinessValidator } from '../services/readinessValidator.js';
import { VisualAssetExtractor } from '../services/ai/visualAssetExtractor.js';
import { AiUsageMetricsService } from '../services/aiUsageMetricsService.js';

const router = Router();

// Generate AI Grounded Assessment
router.post('/generate-quiz', authenticateToken, requireRole(['STUDENT']), enforceStudentGrade, async (req: AuthenticatedRequest, res) => {
  try {
    const { book_id, chapter_id, subject_id, count = 3, difficulty, exam_type } = req.body;

    if (!book_id || !chapter_id || !subject_id) {
      return res.status(400).json({ error: 'الرجاء اختيار المادة والكتاب والفصل الدراسي للتقييم' });
    }

    // Fail closed immediately if the textbook is a placeholder or not yet available
    if (typeof book_id === 'string' && book_id.startsWith('placeholder_')) {
      return res.status(422).json({
        error: 'عذراً، كتاب الوزارة المعتمد لهذه المادة قيد التجهيز والرفع ولم يتم اعتماده بعد.',
        code: 'SUBJECT_TEXTBOOK_UNAVAILABLE'
      });
    }

    // Normalize difficulty to canonical enum
    const validDifficulties = ['EASY', 'MEDIUM', 'HARD', 'BALANCED'] as const;
    let normalizedDifficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'BALANCED' = 'MEDIUM';
    if (difficulty && typeof difficulty === 'string') {
      const upper = difficulty.toUpperCase().trim();
      if (validDifficulties.includes(upper as any)) {
        normalizedDifficulty = upper as any;
      }
    }

    // Check student's monthly exam limit across all subjects
    const limitStatus = await checkStudentExamLimit(req.user!.id);
    if (!limitStatus.allowed) {
      return res.status(403).json({
        error: limitStatus.message,
        code: 'MONTHLY_EXAM_LIMIT_REACHED',
        limit: limitStatus.limit,
        currentCount: limitStatus.currentCount
      });
    }

    const studentProfile = req.studentProfile;
    if (!studentProfile) {
      return res.status(403).json({ error: 'بيانات الملف الدراسي للطالب غير متوفرة' });
    }

    // 1. Authoritative Curriculum Identity Resolution (Graceful fail-closed if book not found)
    let identity;
    try {
      identity = await ExamCacheService.resolveCurriculumIdentity(book_id);
    } catch (idErr: any) {
      if (idErr.message && idErr.message.includes('BOOK_NOT_FOUND')) {
        return res.status(422).json({
          error: 'عذراً، كتاب الوزارة المعتمد لهذه المادة قيد التجهيز والرفع ولم يتم اعتماده بعد.',
          code: 'SUBJECT_TEXTBOOK_UNAVAILABLE'
        });
      }
      throw idErr;
    }

    // 2. Validate Selection Consistency against DB authoritative truth
    const consistency = ExamCacheService.validateSelectionConsistency(identity, {
      subjectId: subject_id,
      gradeId: studentProfile.gradeId,
      academicStageId: studentProfile.academicStageId
    });
    if (!consistency.isValid) {
      return res.status(400).json({ error: consistency.error });
    }

    // 3. Validate Student Eligibility (Stage, Grade, School Type)
    const eligibility = await ExamCacheService.validateStudentEligibility(req.user!.id, identity);
    if (!eligibility.isEligible) {
      return res.status(403).json({ error: eligibility.reason });
    }

    // 4. Verify chapter belongs to book and normalize unit selection
    await ExamCacheService.normalizeAndValidateUnitSelection(book_id, chapter_id);

    // 4.5 Explicit Readiness Gate (Phase 4G.3J & Phase 4G.3K & Phase 4G.3AB)
    // Fail closed if the unit is marked BLOCKED or NOT_AUDITED in the curriculum inventory or database
    const readiness = await ReadinessValidator.getUnitReadinessAsync(book_id, chapter_id);
    if (!readiness.isEligibleForAI) {
      return res.status(403).json({
        error: `هذه الوحدة غير مؤهلة حالياً لتوليد التقييم الآلي: ${readiness.reason}`,
        code: 'UNIT_READINESS_BLOCKED',
        readiness: {
          status: readiness.status,
          reason: readiness.reason,
          visual_dependencies: readiness.visualDependencies,
          required_actions: readiness.requiredActions
        }
      });
    }

    // 5. Shared Exam Cache Lookup with Strict Curriculum Identity, Difficulty & Student No-Repeat Rule
    const parsedCount = parseInt(count, 10) || 3;
    const cacheResult = await ExamCacheService.getCachedExamForStudent({
      studentId: req.user!.id,
      bookId: book_id,
      chapterIds: chapter_id,
      examParams: { count: parsedCount, difficulty: normalizedDifficulty }
    });

    let questions: any[] = [];
    let cachedExamId: string = '';
    let configHash: string = cacheResult.configHash;
    let contentHash: string = '';
    let versionNumber: number = 1;
    let isFallbackExam = false;

    if (cacheResult.hit && cacheResult.exam) {
      console.log(`⚡ [Shared Exam Cache HIT] Reusing cached exam for student ${req.user!.id} (Book: ${identity.titleAr})`);
      questions = cacheResult.exam.questions;
      cachedExamId = cacheResult.exam.examId;
      configHash = cacheResult.exam.configHash;
      contentHash = cacheResult.exam.contentHash;
      versionNumber = cacheResult.exam.versionNumber || 1;
      await ExamCacheService.recordStudentAssignment(cacheResult.cacheKey, req.user!.id, cacheResult.exam.examId);
      // Record cache hit event in telemetry (0 provider tokens, $0.00 provider cost)
      AiUsageMetricsService.recordCacheHit({
        studentId: req.user!.id,
        bookId: book_id,
        chapterId: chapter_id,
        configHash: cacheResult.exam.configHash,
        cachedExamId: cacheResult.exam.examId
      }).catch(e => console.warn('⚠️ [routes/ai.ts] recordCacheHit error:', e?.message || e));
    } else {
      console.log(`🔄 [Shared Exam Cache ${cacheResult.reason}] Coordinating fresh exam generation for student ${req.user!.id}`);

      // Record cache miss in telemetry
      AiUsageMetricsService.recordCacheMiss({
        studentId: req.user!.id,
        bookId: book_id,
        chapterId: chapter_id,
        configHash: cacheResult.configHash,
        reason: cacheResult.reason
      }).catch(e => console.warn('⚠️ [routes/ai.ts] recordCacheMiss error:', e?.message || e));

      // Multi-instance concurrency coordination: only 1 Vercel instance generates for this configHash at a time
      const lock = await ExamCacheService.acquireGenerationLock(configHash, 45000);
      let generationLockAcquired = lock.acquired;
      let activeLockId = lock.lockId;

      if (!generationLockAcquired) {
        console.log(`⏳ [Multi-Instance Coordination] Another instance generating for config ${configHash.slice(0, 8)}. Awaiting concurrent result...`);
        const awaitedExam = await ExamCacheService.waitForConcurrentGeneration(configHash, parsedCount, 35000);
        if (awaitedExam) {
          console.log(`⚡ [Multi-Instance Coordination] Reused exam generated concurrently!`);
          questions = awaitedExam.questions;
          cachedExamId = awaitedExam.examId;
          configHash = awaitedExam.configHash;
          contentHash = awaitedExam.contentHash;
          versionNumber = awaitedExam.versionNumber || 1;
          await ExamCacheService.recordStudentAssignment(awaitedExam.configKey, req.user!.id, awaitedExam.examId);
          AiUsageMetricsService.recordCacheHit({
            studentId: req.user!.id,
            bookId: book_id,
            chapterId: chapter_id,
            configHash: awaitedExam.configHash,
            cachedExamId: awaitedExam.examId
          }).catch(e => console.warn('⚠️ [routes/ai.ts] recordCacheHit error:', e?.message || e));
        } else {
          // Awaited exam not available. Attempt to acquire the lock before launching generation
          const retryLock = await ExamCacheService.acquireGenerationLock(configHash, 45000);
          if (retryLock.acquired) {
            generationLockAcquired = true;
            activeLockId = retryLock.lockId;
          } else {
            // Lock is STILL actively held by another instance.
            // Check if a verified fallback exam satisfying the count exists
            const fallback = await ExamCacheService.getVerifiedFallbackExam({
              bookId: book_id,
              chapterIds: chapter_id,
              examParams: { count: parsedCount, difficulty: normalizedDifficulty }
            });
            if (fallback && fallback.questions && fallback.questions.length >= parsedCount) {
              console.log(`🛡️ [Verified Cache Fallback] Coordination timeout; serving verified exam version ${fallback.versionNumber} for student ${req.user!.id}`);
              questions = fallback.questions;
              cachedExamId = fallback.examId;
              configHash = fallback.configHash;
              contentHash = fallback.contentHash;
              versionNumber = fallback.versionNumber || 1;
              isFallbackExam = true;
              await ExamCacheService.recordStudentAssignment(fallback.configKey, req.user!.id, fallback.examId);
              AiUsageMetricsService.recordCacheHit({
                studentId: req.user!.id,
                bookId: book_id,
                chapterId: chapter_id,
                configHash: fallback.configHash,
                cachedExamId: fallback.examId
              }).catch(e => console.warn('⚠️ [routes/ai.ts] recordCacheHit error:', e?.message || e));
            } else {
              // Bounded wait exhausted and lock is still held; fail closed with retryable 503 rather than duplicate Gemini calls
              throw new GeminiProviderError('TEMPORARY_OVERLOAD', 15000, 'concurrent generation in progress');
            }
          }
        }
      }

      if (questions.length === 0) {
        try {
          questions = await aiRagEngine.generateQuestions({
            studentId: req.user!.id,
            academicStageId: identity.academicStageId,
            gradeId: identity.gradeId,
            subjectId: identity.subjectId,
            bookId: identity.bookId,
            chapterId: chapter_id,
            count: parsedCount,
            difficulty: normalizedDifficulty
          });

          if (!questions || questions.length < parsedCount) {
            throw new Error(`INCOMPLETE_EXAM_GENERATED: Only ${questions?.length || 0}/${parsedCount} questions verified`);
          }

          // Cache the generated exam with authoritative identity and assign to current student
          const stored = await ExamCacheService.storeExamInCache({
            examId: `ai_exam_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            identity,
            unitIds: [chapter_id],
            examParams: { count: parsedCount, difficulty: normalizedDifficulty },
            questions,
            assignedStudentId: req.user!.id
          });
          cachedExamId = stored.examId;
          configHash = stored.configHash;
          contentHash = stored.contentHash;
          versionNumber = stored.versionNumber || 1;
        } catch (genErr: any) {
          console.warn('⚠️ AI generation failed, checking verified cache fallback:', genErr?.name || genErr?.message || genErr);
          // If questions were already successfully generated, the failure occurred during persistence or student assignment.
          // Do NOT mask database or assignment failures as a provider outage; fail closed immediately.
          if (questions && questions.length >= parsedCount) {
            throw genErr;
          }
          // Verified Cache Fallback: If Gemini hits 429 quota exhaustion or 503 overload, check if a verified cached exam exists
          const fallback = await ExamCacheService.getVerifiedFallbackExam({
            bookId: book_id,
            chapterIds: chapter_id,
            examParams: { count: parsedCount, difficulty: normalizedDifficulty }
          });

          if (fallback && fallback.questions && fallback.questions.length >= parsedCount) {
            console.log(`🛡️ [Verified Cache Fallback] Provider unavailable; serving verified exam version ${fallback.versionNumber} for student ${req.user!.id}`);
            questions = fallback.questions;
            cachedExamId = fallback.examId;
            configHash = fallback.configHash;
            contentHash = fallback.contentHash;
            versionNumber = fallback.versionNumber || 1;
            isFallbackExam = true;
            await ExamCacheService.recordStudentAssignment(fallback.configKey, req.user!.id, fallback.examId);
            AiUsageMetricsService.recordCacheHit({
              studentId: req.user!.id,
              bookId: book_id,
              chapterId: chapter_id,
              configHash: fallback.configHash,
              cachedExamId: fallback.examId
            }).catch(e => console.warn('⚠️ [routes/ai.ts] recordCacheHit error:', e?.message || e));
          } else {
            // No compatible verified cached exam exists; fail closed and bubble up provider error
            throw genErr;
          }
        } finally {
          if (generationLockAcquired && activeLockId) {
            await ExamCacheService.releaseGenerationLock(configHash, activeLockId);
          }
        }
      }
    }

    // Issue cryptographic attempt token bound to authenticated student and authoritative exam version
    const attemptPayload: ExamAttemptTokenPayload = {
      schema_version: 'v1',
      attempt_id: `att_${uuidv4()}`,
      student_id: req.user!.id,
      cached_exam_id: cachedExamId,
      config_hash: configHash,
      content_hash: contentHash,
      version_number: versionNumber,
      question_ids: questions.map(q => q.id),
      issued_at: Date.now(),
      expires_at: Date.now() + 2 * 60 * 60 * 1000 // 2 hours validity
    };
    const attempt_token = signExamAttemptToken(attemptPayload);

    // Strip out is_correct, explanation, correct option IDs before sending to student client
    const sanitizedQuestions = questions.map(q => {
      const isValidDiagram = q.diagram_url && VisualAssetExtractor.isVisualAssetValid(q.diagram_url);
      return {
        id: q.id,
        chunk_id: q.chunk_id,
        book_id: q.book_id,
        chapter_id: q.chapter_id,
        question_text: q.question_text,
        difficulty: q.difficulty,
        bloom_level: q.bloom_level,
        diagram_url: isValidDiagram ? q.diagram_url : undefined,
        has_visual_dependency: Boolean(q.has_visual_dependency || isValidDiagram),
        options: (q.options || []).map((o: any) => ({
          id: o.id,
          text: o.text || o.option_text
        }))
      };
    });

    if (sanitizedQuestions.length < parsedCount) {
      return res.status(503).json({
        error: `لم نتمكن من استيفاء عدد الأسئلة المطلوب بالكامل (${sanitizedQuestions.length} من أصل ${parsedCount} أسئلة معتمدة) مع الالتزام بمعايير الجودة والتوثيق من كتاب الوزارة. يرجى المحاولة مرة أخرى بعد قليل.`,
        code: 'INSUFFICIENT_VERIFIED_QUESTIONS',
        requested_count: parsedCount,
        generated_count: sanitizedQuestions.length,
        retryable: true
      });
    }

    return res.json({
      book_id,
      chapter_id,
      subject_id,
      attempt_token,
      questions: sanitizedQuestions,
      requested_count: parsedCount,
      generated_count: sanitizedQuestions.length,
      is_partial: false,
      is_fallback: isFallbackExam,
      exam_status: 'COMPLETE',
      fallback_notice: isFallbackExam
        ? 'تم إعداد هذا الاختبار المعتمد من بنك أسئلة كتاب الوزارة نظراً لضغط مؤقت على خدمة الذكاء الاصطناعي.'
        : null,
      partial_notice: null
    });
  } catch (err: any) {
    console.error('AI Generate Quiz error:', err?.name === 'GeminiProviderError' ? err.message : err);

    const sendProviderError = (category: string, retryAfterMs?: number) => {
      const retrySec = Math.min(120, Math.max(10, Math.ceil((retryAfterMs ?? 30_000) / 1000)));
      if (category === 'AUTHENTICATION' || category === 'INVALID_CONFIGURATION') {
        return res.status(500).json({
          error: 'خدمة الذكاء الاصطناعي غير مهيأة بشكل صحيح حالياً. يرجى إبلاغ إدارة المنصة. هذا لا يعني أن محتوى وحدتك ناقص.',
          code: category === 'AUTHENTICATION' ? 'AI_AUTH_ERROR' : 'AI_CONFIG_ERROR',
          retryable: false
        });
      }
      if (category === 'QUOTA_EXHAUSTED') {
        return res.status(503).json({
          error: 'خدمة توليد الأسئلة وصلت مؤقتاً إلى حد الاستخدام المسموح. هذا لا يعني أن محتوى الوحدة المختارة ناقص. يرجى المحاولة لاحقاً، وقد يستغرق عودة الخدمة بعض الوقت.',
          code: 'AI_QUOTA_EXHAUSTED',
          retryable: false
        });
      }
      res.setHeader('Retry-After', String(retrySec));
      return res.status(503).json({
        error: 'خدمة توليد الأسئلة غير متاحة مؤقتاً بسبب ضغط على الخدمة. هذا لا يعني أن محتوى الوحدة المختارة ناقص. يرجى المحاولة مرة أخرى بعد قليل.',
        code: 'AI_PROVIDER_UNAVAILABLE',
        retryable: true,
        retry_after_seconds: retrySec
      });
    };

    if (!process.env.GEMINI_API_KEY) {
      return sendProviderError('INVALID_CONFIGURATION');
    }

    if (err instanceof GeminiProviderError) {
      return sendProviderError(err.category, err.retryAfterMs);
    }

    if (err.message?.includes('[GEMINI_AUTH_ERROR]')) {
      return sendProviderError('AUTHENTICATION');
    }

    if (
      err.message?.includes('quota') ||
      err.message?.includes('rate limit') ||
      err.message?.includes('TIMEOUT') ||
      err.message?.includes('fetch failed')
    ) {
      return sendProviderError('TEMPORARY_OVERLOAD');
    }

    if (
      err.message?.includes('لا توجد مقتطفات تعليمية معتمدة') ||
      err.message?.includes('Insufficient educational content for assessment generation')
    ) {
      return res.status(422).json({
        error: 'المحتوى التعليمي المعتمد لهذه الوحدة غير كافٍ حالياً لصياغة أسئلة امتحانية (يرجى مراجعة فهرسة كتاب الوزارة).',
        code: 'INSUFFICIENT_UNIT_CONTENT'
      });
    }

    if (err.message?.includes('EXAM_GENERATION_FAILED')) {
      return res.status(503).json({
        error: 'تعذر استخراج العدد الكافي من الأسئلة المطابقة لمعايير الجودة والتحقق لهذه الوحدة حالياً. يرجى المحاولة مرة أخرى.',
        code: 'EXAM_GENERATION_FAILED',
        retryable: true
      });
    }

    return res.status(500).json({ error: 'حدث خطأ غير متوقع أثناء توليد التقييم الذكي. يرجى المحاولة لاحقاً.', code: 'INTERNAL_ERROR' });
  }
});

// Evaluate Student Answers with Server-Authoritative Grading
router.post('/evaluate', authenticateToken, requireRole(['STUDENT']), enforceStudentGrade, async (req: AuthenticatedRequest, res) => {
  try {
    const { attempt_token, answers } = req.body;

    if (!attempt_token || typeof attempt_token !== 'string') {
      return res.status(400).json({
        error: 'رمز محاولة الاختبار المعتمد مطلوب.',
        code: 'ATTEMPT_TOKEN_REQUIRED'
      });
    }

    // Explicit rejection of client-controlled questions or answer keys
    if (req.body.questions) {
      return res.status(400).json({
        error: 'لا يمكن إرسال أسئلة الاختبار من جهة العميل. يتم تحميل الأسئلة حصرياً من الخادم المعتمد.',
        code: 'LEGACY_SUBMISSION_REJECTED'
      });
    }

    let normalizedAnswers: Array<{ question_id: string; selected_option_id: string }> = [];
    if (Array.isArray(answers)) {
      normalizedAnswers = answers;
    } else if (answers && typeof answers === 'object') {
      normalizedAnswers = Object.entries(answers).map(([qId, optId]) => ({
        question_id: qId,
        selected_option_id: String(optId)
      }));
    } else {
      return res.status(400).json({
        error: 'قائمة إجابات الطالب غير صحيحة.',
        code: 'INVALID_ANSWERS_PAYLOAD'
      });
    }

    // 1. Verify Attempt Token Signature, Expiry, and Format
    const tokenResult = verifyExamAttemptToken(attempt_token);
    if (!tokenResult.valid || !tokenResult.payload) {
      return res.status(401).json({
        error: 'رمز محاولة الاختبار غير صالح أو منتهي الصلاحية أو تم التلاعب به.',
        code: tokenResult.error || 'INVALID_ATTEMPT_TOKEN'
      });
    }

    const payload = tokenResult.payload;

    // 2. Strict Student Ownership Check
    if (payload.student_id !== req.user!.id) {
      return res.status(403).json({
        error: 'غير مصرح لك بإرسال محاولة اختبار خاصة بطالب آخر.',
        code: 'STUDENT_IDENTITY_MISMATCH'
      });
    }

    // 3. Safe, Idempotent Attempt Handling and Recovery
    const existingAttempt = await db.query(
      `SELECT id, student_id, book_id, chapter_id, subject_id, score, total_questions,
              questions_data, student_answers_data, evaluation_report
       FROM ai_evaluations WHERE id = $1`,
      [payload.attempt_id]
    );

    if (existingAttempt.rows.length > 0) {
      const existingRow = existingAttempt.rows[0];

      // A. Strict Student Ownership Check on existing attempt
      if (existingRow.student_id !== req.user!.id) {
        return res.status(403).json({
          error: 'غير مصرح لك باسترجاع محاولة اختبار خاصة بطالب آخر.',
          code: 'STUDENT_IDENTITY_MISMATCH'
        });
      }

      // B. Ensure submitted answers match original attempt (No tampering with original answers on retry)
      let storedAnswers: any[] = [];
      try {
        storedAnswers = typeof existingRow.student_answers_data === 'string'
          ? JSON.parse(existingRow.student_answers_data)
          : existingRow.student_answers_data;
      } catch (_) {}

      // Compare normalizedAnswers with storedAnswers
      const isAnswersMatch = Array.isArray(storedAnswers) &&
        storedAnswers.length === normalizedAnswers.length &&
        storedAnswers.every(sa => {
          const matching = normalizedAnswers.find(na => na.question_id === sa.question_id);
          return matching && String(matching.selected_option_id) === String(sa.selected_option_id);
        });

      if (!isAnswersMatch) {
        return res.status(409).json({
          error: 'لا يمكن تعديل إجابات محاولة تم تسليمها وتقييمها مسبقاً.',
          code: 'ATTEMPT_ANSWER_MISMATCH'
        });
      }

      // C. Safe Evaluation Recovery: Check if dependent operations (learning history) were completed
      let report: any;
      try {
        report = typeof existingRow.evaluation_report === 'string'
          ? JSON.parse(existingRow.evaluation_report)
          : existingRow.evaluation_report;
      } catch (_) {
        report = {};
      }

      // Check if student_learning_history was recorded
      const historyCheck = await db.query(
        `SELECT id FROM student_learning_history WHERE reference_id = $1`,
        [payload.attempt_id]
      );

      // If learning history is missing, perform safe idempotent recovery without double-counting
      if (historyCheck.rows.length === 0 && (report.authoritative_max_score || 0) > 0 && report.authoritative_percentage !== null) {
        console.log(`🔄 [AI Evaluation Recovery] Attempt ${payload.attempt_id} exists but missing learning history. Recovering analytics safely...`);
        await aiRagEngine.recoverEvaluationAnalytics({
          attemptId: payload.attempt_id,
          studentId: req.user!.id,
          subjectId: existingRow.subject_id,
          chapterId: existingRow.chapter_id,
          report
        });
        report.analytics_synced = true;
      }

      return res.json({
        message: 'تم استرجاع تقرير التقييم المعتمد لهذه المحاولة بنجاح (استرداد آمن)',
        report,
        recovered: true
      });
    }

    // 4. Load Authoritative Cached Exam Questions from Database
    const examRes = await db.query(
      `SELECT id, config_hash, content_hash, version_number, questions_data,
              book_id, academic_stage_id, grade_id, subject_id, unit_ids
       FROM shared_cached_exams
       WHERE id = $1`,
      [payload.cached_exam_id]
    );

    if (examRes.rows.length === 0) {
      return res.status(404).json({
        error: 'الاختبار المعتمد غير موجود في سجلات الخادم.',
        code: 'CACHED_EXAM_NOT_FOUND'
      });
    }

    const cachedRow = examRes.rows[0];
    if (cachedRow.content_hash !== payload.content_hash) {
      return res.status(409).json({
        error: 'تعارض في نسخة محتوى الاختبار المعتمد.',
        code: 'EXAM_CONTENT_MISMATCH'
      });
    }

    const authoritativeQuestions: GroundedQuestion[] = typeof cachedRow.questions_data === 'string'
      ? JSON.parse(cachedRow.questions_data)
      : cachedRow.questions_data;

    // 5. Strict Question Membership & Answer Integrity Validation
    const authQuestionMap = new Map<string, GroundedQuestion>();
    for (const aq of authoritativeQuestions) {
      authQuestionMap.set(aq.id, aq);
    }

    const seenAnsweredQuestions = new Set<string>();
    for (const ans of normalizedAnswers) {
      if (!ans || typeof ans !== 'object' || !ans.question_id) {
        return res.status(400).json({
          error: 'بيانات الإجابة غير مكتملة.',
          code: 'MALFORMED_ANSWER_ITEM'
        });
      }
      if (!authQuestionMap.has(ans.question_id)) {
        return res.status(400).json({
          error: `معرف السؤال '${ans.question_id}' لا ينتمي لهذا الاختبار المعتمد.`,
          code: 'FOREIGN_QUESTION_SUBMITTED'
        });
      }
      if (seenAnsweredQuestions.has(ans.question_id)) {
        return res.status(400).json({
          error: `تكرار إجابة السؤال '${ans.question_id}'.`,
          code: 'DUPLICATE_QUESTION_ANSWERED'
        });
      }
      seenAnsweredQuestions.add(ans.question_id);

      const targetQ = authQuestionMap.get(ans.question_id)!;
      if (ans.selected_option_id) {
        const optionExists = targetQ.options.some(o => o.id === ans.selected_option_id);
        if (!optionExists) {
          return res.status(400).json({
            error: `معرف الخيار المحدد '${ans.selected_option_id}' غير صالح للسؤال '${ans.question_id}'.`,
            code: 'UNKNOWN_OPTION_SUBMITTED'
          });
        }
      }
    }

    // 6. Check student's monthly exam limit
    const limitStatus = await checkStudentExamLimit(req.user!.id);
    if (!limitStatus.allowed) {
      return res.status(403).json({
        error: limitStatus.message,
        code: 'MONTHLY_EXAM_LIMIT_REACHED',
        limit: limitStatus.limit,
        currentCount: limitStatus.currentCount
      });
    }

    const studentProfile = req.studentProfile;
    if (!studentProfile) {
      return res.status(403).json({ error: 'بيانات الملف الدراسي للطالب غير متوفرة' });
    }

    // 7. Verify Academic Scope
    if (
      cachedRow.academic_stage_id !== studentProfile.academicStageId ||
      cachedRow.grade_id !== studentProfile.gradeId
    ) {
      return res.status(403).json({ error: 'غير مصرح لك بإرسال تقييم لكتاب خارج مرحلتك وصفك الدراسي' });
    }

    // 8. Grade Authoritatively with attemptId binding
    let report: any;
    try {
      report = await aiRagEngine.evaluateSubmission({
        studentId: req.user!.id,
        academicStageId: studentProfile.academicStageId,
        gradeId: studentProfile.gradeId,
        subjectId: cachedRow.subject_id,
        bookId: cachedRow.book_id,
        chapterId: authoritativeQuestions[0]?.chapter_id || '',
        attemptId: payload.attempt_id,
        questions: authoritativeQuestions,
        studentAnswers: normalizedAnswers
      });
    } catch (evalErr: any) {
      const msg = String(evalErr?.message || '');
      if (
        msg.includes('Duplicate') ||
        msg.includes('UNIQUE') ||
        msg.includes('SQLITE_CONSTRAINT') ||
        evalErr?.code === 'ER_DUP_ENTRY'
      ) {
        // Safe concurrent resolution: if another concurrent worker committed the row, retrieve it for the authenticated student
        const raceAttempt = await db.query(
          `SELECT id, student_id, evaluation_report FROM ai_evaluations WHERE id = $1`,
          [payload.attempt_id]
        );
        if (raceAttempt.rows.length > 0 && raceAttempt.rows[0].student_id === req.user!.id) {
          try {
            const raceReport = typeof raceAttempt.rows[0].evaluation_report === 'string'
              ? JSON.parse(raceAttempt.rows[0].evaluation_report)
              : raceAttempt.rows[0].evaluation_report;
            return res.json({
              message: 'تم استرجاع تقرير التقييم المعتمد لهذه المحاولة بنجاح (تسوية تزامن)',
              report: raceReport,
              recovered: true
            });
          } catch (_) {}
        }
        return res.status(409).json({
          error: 'تم تسليم وتقييم هذه المحاولة مسبقاً (تعارض تزامن).',
          code: 'ATTEMPT_ALREADY_EVALUATED'
        });
      }
      throw evalErr;
    }

    return res.json({
      message: 'تم إتمام التقييم الذكي وتشخيص نقاط الضعف وخطة المراجعة بنجاح',
      report
    });
  } catch (err: any) {
    console.error('AI Evaluate error:', err);
    return res.status(500).json({ error: 'خطأ أثناء تقييم الإجابات: ' + err.message });
  }
});

// Get Student AI Evaluation History
router.get('/evaluations', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const studentId = req.user!.id;
    const resEvaluations = await db.query(
      `SELECT ae.id, ae.score, ae.total_questions, ae.created_at,
              b.title_ar as book_title, s.name_ar as subject_name,
              bc.title_ar as chapter_title,
              ae.evaluation_report
       FROM ai_evaluations ae
       JOIN books b ON ae.book_id = b.id
       JOIN subjects s ON ae.subject_id = s.id
       LEFT JOIN book_chapters bc ON ae.chapter_id = bc.id
       WHERE ae.student_id = $1
       ORDER BY ae.created_at DESC`,
      [studentId]
    );

    return res.json(resEvaluations.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب سجل التقييمات' });
  }
});

// Get Single AI Evaluation Details
router.get('/evaluations/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const resEval = await db.query(
      `SELECT ae.*, b.title_ar as book_title, s.name_ar as subject_name, bc.title_ar as chapter_title
       FROM ai_evaluations ae
       JOIN books b ON ae.book_id = b.id
       JOIN subjects s ON ae.subject_id = s.id
       LEFT JOIN book_chapters bc ON ae.chapter_id = bc.id
       WHERE ae.id = $1`,
      [id]
    );

    if (resEval.rows.length === 0) {
      return res.status(404).json({ error: 'تقرير التقييم غير موجود' });
    }

    return res.json(resEval.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: 'خطأ في جلب تفاصيل التقييم' });
  }
});

// Get Single AI Evaluation Formatted Review for Teachers/Students
router.get('/evaluations/:id/review', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const resEval = await db.query(
      `SELECT ae.*, b.title_ar as book_title, s.name_ar as subject_name, bc.title_ar as chapter_title,
              u.full_name as student_name, u.email as student_email,
              sp.student_code, sp.school_name, sp.school_type
       FROM ai_evaluations ae
       JOIN books b ON ae.book_id = b.id
       JOIN subjects s ON ae.subject_id = s.id
       JOIN users u ON ae.student_id = u.id
       LEFT JOIN student_profiles sp ON ae.student_id = sp.user_id
       LEFT JOIN book_chapters bc ON ae.chapter_id = bc.id
       WHERE ae.id = $1`,
      [id]
    );

    if (resEval.rows.length === 0) {
      return res.status(404).json({ error: 'تقرير التقييم غير موجود' });
    }

    const row = resEval.rows[0];

    // Check permission
    if (req.user?.role === 'STUDENT' && row.student_id !== req.user.id) {
      return res.status(403).json({ error: 'غير مصرح لك بالاطلاع على تقييم طالب آخر' });
    }

    let questionsData: any[] = [];
    let answersData: any[] = [];
    let evalReport: any = {};

    try {
      questionsData = typeof row.questions_data === 'string' ? JSON.parse(row.questions_data) : (row.questions_data || []);
    } catch (_) {}
    try {
      answersData = typeof row.student_answers_data === 'string' ? JSON.parse(row.student_answers_data) : (row.student_answers_data || []);
    } catch (_) {}
    try {
      evalReport = typeof row.evaluation_report === 'string' ? JSON.parse(row.evaluation_report) : (row.evaluation_report || {});
    } catch (_) {}

    const totalPts = Number(row.total_questions) || (questionsData.length || 1);
    const score = Number(row.score) || 0;
    const percentage = Math.round((score / totalPts) * 100);

    const questions = questionsData.map((q: any) => {
      const studentAns = answersData.find((a: any) => a.question_id === q.id);
      const selectedOptId = studentAns?.selected_option_id;

      const opts = (q.options || []).map((o: any) => ({
        id: o.id,
        option_text: o.text || o.option_text || '',
        is_correct: o.is_correct === true || o.id === q.correct_option_id
      }));

      const correctOpt = opts.find((o: any) => o.is_correct);
      const isCorrect = selectedOptId ? (selectedOptId === correctOpt?.id) : false;

      return {
        id: q.id,
        question_text: q.question_text,
        question_type: q.question_type || 'MULTIPLE_CHOICE',
        points: 1,
        points_awarded: isCorrect ? 1 : 0,
        is_correct: isCorrect,
        selected_option_id: selectedOptId || null,
        correct_option_id: correctOpt?.id || null,
        correct_option_text: correctOpt?.option_text || '',
        explanation: q.explanation || null,
        page_reference: q.page_reference || null,
        options: opts
      };
    });

    return res.json({
      attempt: {
        id: row.id,
        exam_id: null,
        exam_title: `${row.subject_name} - ${row.chapter_title || row.book_title} (تقييم ذكي)`,
        exam_title_ar: `${row.subject_name} - ${row.chapter_title || row.book_title} (تقييم ذكي)`,
        student_id: row.student_id,
        student_name: row.student_name,
        student_email: row.student_email,
        student_code: row.student_code || row.student_id.substring(0, 8),
        school_name: row.school_name,
        school_type: row.school_type,
        subject_name: row.subject_name,
        score,
        total_points: totalPts,
        percentage,
        completed_at: row.created_at,
        is_ai_evaluation: true,
        evaluation_report: evalReport
      },
      questions
    });
  } catch (err: any) {
    console.error('AI Evaluation review error:', err);
    return res.status(500).json({ error: 'خطأ في جلب تفاصيل تقييم الذكاء الاصطناعي: ' + err.message });
  }
});

// ── Gemini Diagnostic Endpoint (Phase 4G.3AX) ──────────────────────────────
// Safe, admin-only endpoint.  No key text is ever included in the response.
// Returns: key_configured (bool), candidate_models[], and a live connectivity
// probe result for each model (status / category only — no secrets, no quota-heavy calls).
router.get('/diagnostic', authenticateToken, requireRole(['ADMIN', 'CENTRAL_ADMIN']), async (_req, res) => {
  const apiKeyConfigured = !!(process.env.GEMINI_API_KEY);
  const candidateModels = GeminiClient.candidateModels;

  const probeResults: Array<{model: string; status: string; category?: string; httpStatus?: number; message?: string}> = [];

  for (const model of candidateModels) {
    if (!apiKeyConfigured) {
      probeResults.push({ model, status: 'SKIP', category: 'INVALID_CONFIGURATION' });
      continue;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res2 = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word OK.' }] }], generationConfig: { maxOutputTokens: 64 } }),
          signal: controller.signal
        }
      );
      clearTimeout(timer);
      if (res2.ok) {
        const data = await res2.json();
        const rawParts = data.candidates?.[0]?.content?.parts || [];
        const textParts = rawParts.filter((p: any) => !p.thought && typeof p.text === 'string' && p.text.trim().length > 0);
        const text = (textParts.length > 0 ? textParts : rawParts)
          .map((p: any) => p.text || '')
          .join('')
          .trim();
        probeResults.push({ model, status: text.length > 0 ? 'PASS' : 'EMPTY_RESPONSE', httpStatus: res2.status, message: text });
      } else {
        const errData = await res2.json().catch(() => ({}));
        let msg: string = errData.error?.message || '';
        if (process.env.GEMINI_API_KEY) {
          msg = msg.split(process.env.GEMINI_API_KEY).join('[REDACTED]');
        }
        let category = 'UNKNOWN';
        if (res2.status === 401 || res2.status === 403) category = 'AUTHENTICATION';
        else if (res2.status === 429) category = 'QUOTA_EXHAUSTED';
        else if (res2.status === 404 || res2.status === 400) category = 'INVALID_CONFIGURATION';
        else if (res2.status >= 500) category = 'TEMPORARY_OVERLOAD';
        probeResults.push({ model, status: 'FAIL', category, httpStatus: res2.status, message: msg });
      }
    } catch (e: any) {
      const isTimeout = e?.name === 'AbortError' || /aborted/i.test(e?.message || '');
      probeResults.push({ model, status: 'FAIL', category: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR' });
    }
  }

  // Probe ListModels to identify available models or project-level API issues
  let availableModels: string[] = [];
  let listModelsError: string | null = null;
  if (apiKeyConfigured) {
    try {
      const listRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY! }
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        availableModels = (listData.models || []).map((m: any) => m.name.replace('models/', ''));
      } else {
        const listErr = await listRes.json().catch(() => ({}));
        let errMsg = listErr.error?.message || `HTTP ${listRes.status}`;
        if (process.env.GEMINI_API_KEY) errMsg = errMsg.split(process.env.GEMINI_API_KEY).join('[REDACTED]');
        listModelsError = errMsg;
      }
    } catch (e: any) {
      listModelsError = e.message;
    }
  }

  const overallPass = probeResults.some(r => r.status === 'PASS');
  return res.json({
    api_key_configured: apiKeyConfigured,
    candidate_models: candidateModels,
    available_models: availableModels.slice(0, 15),
    list_models_error: listModelsError,
    probe_results: probeResults,
    overall: overallPass ? 'PASS' : 'FAIL',
    timestamp: new Date().toISOString()
  });
});

export default router;
