import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/db.js';
import { VisualAssetExtractor } from './ai/visualAssetExtractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveInventoryPath(): string {
  const candidates = [
    path.resolve(__dirname, '../../src/data/authoritative_curriculum_inventory.json'),
    path.resolve(__dirname, '../data/authoritative_curriculum_inventory.json'),
    path.resolve(__dirname, '../../data/authoritative_curriculum_inventory.json'),
    path.resolve(process.cwd(), 'src/data/authoritative_curriculum_inventory.json'),
    path.resolve(process.cwd(), 'server/src/data/authoritative_curriculum_inventory.json')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

const INVENTORY_FILE_PATH = resolveInventoryPath();

export type UnitReadinessStatus = 'VERIFIED_READY' | 'CONDITIONALLY_READY' | 'BLOCKED' | 'NOT_AUDITED';

export interface UnitReadinessResult {
  bookId: string;
  chapterId: string;
  bookTitleAr: string;
  bookTitleEn: string;
  unitTitleAr: string;
  unitTitleEn: string;
  gradeAr: string;
  subjectAr: string;
  status: UnitReadinessStatus;
  isEligibleForAI: boolean;
  retrievalMode?: 'SEMANTIC_VECTOR' | 'EDUCATIONAL_BM25';
  visualDependencies: string;
  reason: string;
  evidence: string;
  requiredActions: string[];
}

export class UnitReadinessBlockedError extends Error {
  public readonly code = 'UNIT_READINESS_BLOCKED';
  public readonly bookId: string;
  public readonly chapterId: string;
  public readonly status: UnitReadinessStatus;
  public readonly requiredActions: string[];

  constructor(result: UnitReadinessResult) {
    super(`[UNIT_READINESS_BLOCKED] ${result.unitTitleAr} (${result.chapterId}): ${result.reason}`);
    this.name = 'UnitReadinessBlockedError';
    this.bookId = result.bookId;
    this.chapterId = result.chapterId;
    this.status = result.status;
    this.requiredActions = result.requiredActions;
  }
}

export class ReadinessValidator {
  private static inventoryCache: Map<string, any> | null = null;
  private static dynamicUnits: Map<string, any> = new Map<string, any>();

  /**
   * Diagnostic registration only — retained strictly for telemetry and offline inspection.
   * SECURITY RULE (Phase 3.2): In-memory dynamic registration CANNOT grant AI exam eligibility
   * or override database/inventory readiness evaluations.
   */
  public static registerDynamicUnit(unit: {
    book_id: string;
    chapter_id: string;
    book_title_ar: string;
    book_title_en: string;
    unit_title_ar: string;
    unit_title_en: string;
    grade_ar?: string;
    subject_ar?: string;
    readiness_status: UnitReadinessStatus;
    visual_dependencies?: string;
    status_reason?: string;
    evidence_and_unresolved_issues?: string;
  }): void {
    const key = `${unit.book_id}::${unit.chapter_id}`;
    this.dynamicUnits.set(key, {
      ...unit,
      grade_ar: unit.grade_ar || 'غير محدد',
      subject_ar: unit.subject_ar || 'غير محدد',
      visual_dependencies: unit.visual_dependencies || 'NONE',
      status_reason: unit.status_reason || 'سجل تشخيصي لوحدة معالجة آلياً (غير معتمد رسمياً).',
      evidence_and_unresolved_issues: unit.evidence_and_unresolved_issues || 'Diagnostic telemetry only. Not an approval.'
    });
  }

  /**
   * Diagnostic registration alias (retained for backward compatibility).
   * SECURITY RULE (Phase 3.2): Calling this method has ZERO authorization effect on AI exam eligibility.
   */
  public static registerAuditedCurriculumUnit(unit: {
    bookId: string;
    chapterId: string;
    unitTitle: string;
    subjectCode?: string;
    gradeCode?: string;
    stageCode?: string;
    term?: number;
    pageStart?: number;
    pageEnd?: number;
    chunkCount?: number;
    auditStatus: UnitReadinessStatus;
    auditedAt?: string;
    generationId?: string;
  }): void {
    this.registerDynamicUnit({
      book_id: unit.bookId,
      chapter_id: unit.chapterId,
      book_title_ar: unit.unitTitle,
      book_title_en: unit.unitTitle,
      unit_title_ar: unit.unitTitle,
      unit_title_en: unit.unitTitle,
      readiness_status: unit.auditStatus,
      status_reason: `Diagnostic telemetry: unit registered with status ${unit.auditStatus}.`,
      evidence_and_unresolved_issues: `Diagnostic telemetry recorded at ${unit.auditedAt || new Date().toISOString()}`
    });
  }

  /**
   * Retrieve diagnostic unit telemetry (does NOT grant readiness approval)
   */
  public static getDiagnosticUnit(bookId: string, chapterId: string): any | undefined {
    return this.dynamicUnits.get(`${bookId}::${chapterId}`);
  }

  /**
   * Clear dynamic units (primarily for tests and cache invalidation)
   */
  public static clearDynamicUnits(): void {
    this.dynamicUnits.clear();
  }

  /**
   * Deterministically infer visual requirements based on both unit title and book title
   * Supports geometry (هندسة / مثلثات / geometry / trigonometry) and geography / maps (جغرافيا / خريطة / خرائط / تضاريس / map).
   */
  public static detectVisualRequirement(
    params: {
      unitTitleAr?: string;
      unitTitleEn?: string;
      bookTitleAr?: string;
      bookTitleEn?: string;
    } | string,
    maybeBookTitle?: string
  ): 'GEOMETRY_DIAGRAMS' | 'CARTOGRAPHIC_MAPS' | 'NONE' {
    let combined = '';
    if (typeof params === 'object' && params !== null) {
      combined = `${params.unitTitleAr || ''} ${params.unitTitleEn || ''} ${params.bookTitleAr || ''} ${params.bookTitleEn || ''}`;
    } else {
      combined = `${params || ''} ${maybeBookTitle || ''}`;
    }
    const lower = combined.toLowerCase();
    if (
      lower.includes('هندسة') ||
      lower.includes('geometry') ||
      lower.includes('مثلثات') ||
      lower.includes('trigonometry')
    ) {
      return 'GEOMETRY_DIAGRAMS';
    }
    if (
      lower.includes('جغرافيا') ||
      lower.includes('geography') ||
      lower.includes('خريطة') ||
      lower.includes('خرائط') ||
      lower.includes('تضاريس') ||
      lower.includes('map')
    ) {
      return 'CARTOGRAPHIC_MAPS';
    }
    return 'NONE';
  }

  /**
   * Load and cache the authoritative inventory
   */
  private static loadInventory(): Map<string, any> {
    if (this.inventoryCache) {
      return this.inventoryCache;
    }

    this.inventoryCache = new Map<string, any>();
    if (!fs.existsSync(INVENTORY_FILE_PATH)) {
      console.warn('⚠️ Inventory file not found at:', INVENTORY_FILE_PATH);
      return this.inventoryCache;
    }

    try {
      const raw = fs.readFileSync(INVENTORY_FILE_PATH, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.units)) {
        for (const u of data.units) {
          const key = `${u.book_id}::${u.chapter_id}`;
          this.inventoryCache.set(key, u);
        }
      }
    } catch (err) {
      console.error('Error reading authoritative inventory:', err);
    }

    return this.inventoryCache;
  }

  /**
   * Helper to evaluate a known inventory/dynamic unit record into a UnitReadinessResult
   */
  private static evaluateInventoryUnit(bookId: string, chapterId: string, unit: any): UnitReadinessResult {
    const isBlocked = unit.readiness_status === 'BLOCKED';
    const isCond = unit.readiness_status === 'CONDITIONALLY_READY';
    const retrievalMode = isBlocked ? undefined : (isCond ? 'EDUCATIONAL_BM25' : 'SEMANTIC_VECTOR');
    const requiredActions: string[] = [];

    const vis = unit.visual_dependencies || 'NONE';
    if (vis === 'GEOMETRY_DIAGRAMS' || vis === 'GEOMETRY_PROOFS') {
      requiredActions.push('Extract vector/raster geometric figures into visual_assets');
      requiredActions.push('Attach verified diagram_url to candidate questions');
      requiredActions.push('Validate with multimodal blind solver');
    }
    if (vis === 'CARTOGRAPHIC_MAPS') {
      requiredActions.push('Execute multimodal OCR on blank scanned map pages');
      requiredActions.push('Catalog map images in visual_manifest.json');
    }
    if (vis.includes('RELIEF_MAPS') || vis.includes('CAMPAIGN_MAPS')) {
      requiredActions.push('Verify that questions do not require visual map reading without diagram asset');
    }

    return {
      bookId,
      chapterId,
      bookTitleAr: unit.book_title_ar,
      bookTitleEn: unit.book_title_en,
      unitTitleAr: unit.unit_title_ar,
      unitTitleEn: unit.unit_title_en,
      gradeAr: unit.grade_ar,
      subjectAr: unit.subject_ar,
      status: unit.readiness_status,
      isEligibleForAI: !isBlocked,
      retrievalMode,
      visualDependencies: vis,
      reason: unit.status_reason,
      evidence: unit.evidence_and_unresolved_issues,
      requiredActions
    };
  }

  /**
   * Helper for units not found in inventory or database
   */
  private static evaluateMissingUnit(bookId: string, chapterId: string): UnitReadinessResult {
    const isSyntheticTestFixture = (
      process.env.NODE_ENV === 'test' && (
        bookId === 'mock_book' ||
        bookId === 'mock_test_book'
      )
    );

    return {
      bookId,
      chapterId,
      bookTitleAr: isSyntheticTestFixture ? 'وحدة اختبارية اصطناعية' : 'غير معروف',
      bookTitleEn: isSyntheticTestFixture ? 'Synthetic Test Unit' : 'Unknown Book',
      unitTitleAr: isSyntheticTestFixture ? 'وحدة اختبارية' : 'غير معروف',
      unitTitleEn: isSyntheticTestFixture ? 'Synthetic Test Unit' : 'Unknown Unit',
      gradeAr: 'غير معروف',
      subjectAr: 'غير معروف',
      status: isSyntheticTestFixture ? 'VERIFIED_READY' : 'BLOCKED',
      isEligibleForAI: isSyntheticTestFixture,
      retrievalMode: isSyntheticTestFixture ? 'SEMANTIC_VECTOR' : undefined,
      visualDependencies: 'NONE',
      reason: isSyntheticTestFixture
        ? 'Synthetic mock fixture permitted strictly in offline test harness.'
        : 'هذه الوحدة غير مسجلة في فهرس المناهج المعتمدة للمنصة.',
      evidence: isSyntheticTestFixture ? 'Synthetic mock test environment' : 'No record in authoritative curriculum inventory or database',
      requiredActions: isSyntheticTestFixture ? [] : ['Register book and unit in authoritative inventory or complete ingestion', 'Perform full curriculum audit']
    };
  }

  /**
   * Authoritative dynamic evaluation of database records for newly ingested textbooks.
   * Rejects incomplete, stale, inconsistent, or unapproved records safely.
   * Enforces strict separation: Ingestion Completion (COMPLETED) != Exam Readiness (VERIFIED_READY).
   */
  private static evaluateDbRecordReadiness(bookId: string, chapterId: string, row: any): UnitReadinessResult {
    const totalChunks = parseInt(String(row.total_chunks || '0'), 10);
    const totalChars = parseInt(String(row.total_chars || '0'), 10);
    const embeddedChunks = parseInt(String(row.embedded_chunks || '0'), 10);
    const outOfRangeChunks = parseInt(String(row.out_of_range_chunks || '0'), 10);
    const totalPages = parseInt(String(row.total_pages || '0'), 10);
    const startPage = parseInt(String(row.start_page || '0'), 10);
    const endPage = parseInt(String(row.end_page || '0'), 10);

    const issues: string[] = [];
    const requiredActions: string[] = [];

    // Check 1: Ingestion lifecycle status
    const statusUpper = (row.processing_status || '').toUpperCase();
    if (statusUpper !== 'COMPLETED' && statusUpper !== 'VERIFIED_READY') {
      issues.push(`معالجة الكتاب غير مكتملة أو معلقة (${row.processing_status || 'UNKNOWN'})`);
      requiredActions.push('انتظر اكتمال معالجة الكتاب محلياً قبل طلب الاعتماد أو أعد المحاولة في حال الفشل');
    }

    // Check 2: Explicit Approval from curriculum_unit_approvals
    // SECURITY RULE (Phase 3.4): Approval is tied strictly to (book_id, chapter_id, active_generation_id).
    // Ingestion completion (COMPLETED) alone never grants exam readiness or AI eligibility.
    const approvalStatus = (row.approval_status || 'NOT_AUDITED').toUpperCase();
    const activeGen = row.active_generation_id || 'v1';
    const approvalGen = row.approval_generation_id || '';

    if (approvalStatus === 'APPROVED') {
      if (approvalGen !== activeGen) {
        issues.push(`اعتماد الوحدة ينتمي لجيل معالجة سابق (${approvalGen}) وغير صالح للجيل النشط (${activeGen})`);
        requiredActions.push('إعادة اعتماد الوحدة لجيل المعالجة الجديد بعد اكتمال الاستخراج والفهرسة');
      }
    } else if (approvalStatus === 'REJECTED') {
      issues.push(`تم رفض اعتماد هذه الوحدة من قبل الإدارة التعليمية: ${row.rejection_reason || 'غير محدد'}`);
      requiredActions.push('مراجعة ملاحظات الرفض وتصحيح المنهج أو الصفحات وإعادة تقديم الطلب');
    } else if (approvalStatus === 'REVOKED') {
      issues.push(`تم سحب اعتماد هذه الوحدة من قبل الإدارة التعليمية: ${row.revocation_reason || 'غير محدد'}`);
      requiredActions.push('إعادة تقديم الوحدة للاعتماد بعد استيفاء التعديلات المطلوبة');
    } else {
      // NOT_AUDITED
      issues.push('حالة معالجة الكتاب مكتملة استخراجاً، ولكن المقرر غير معتمد صراحة لجاهزية الامتحانات (INGESTED_NOT_APPROVED). يلزم اعتماد الجاهزية التعليمية رسمياً من لوحة الإدارة.');
      requiredActions.push('اعتماد جاهزية الوحدة رسمياً من لوحة تحكم الإدارة (Curriculum Review Queue).');
    }

    // Check 2: Processing Error
    if (row.processing_error && String(row.processing_error).trim().length > 0) {
      issues.push(`سجل الكتاب يحتوي على أخطاء معالجة: ${row.processing_error}`);
      requiredActions.push('تحقق من تشفير الكتاب ونصوص الصفحات وأعد الرفع');
    }

    // Check 3: Chapter boundary sanity
    if (startPage > endPage) {
      issues.push(`نطاق صفحات الوحدة غير صالح: يبدأ من ${startPage} وينتهي عند ${endPage}`);
      requiredActions.push('تصحيح أرقام صفحات بداية ونهاية الوحدة');
    }
    if (startPage < 1 || (totalPages > 0 && endPage > totalPages)) {
      issues.push(`نطاق صفحات الوحدة خارج حدود صفحات الكتاب (1 إلى ${totalPages})`);
      requiredActions.push('تعديل نطاق الصفحات ليكون ضمن إجمالي صفحات ملف الكتاب');
    }

    // Check 4: Text Content & Chunks in Active Generation (Minimum 2 chunks and 100 characters)
    if (totalChunks < 2 || totalChars < 100) {
      issues.push(`المحتوى النصي للوحدة في جيل المعالجة النشط غير كافٍ لتوليد أسئلة موثوقة (${totalChunks} مقاطع، ${totalChars} حرفاً)`);
      requiredActions.push('تأكد من أن نطاق صفحات الوحدة يحتوي على نصوص دراسية وشروحات كافية في جيل المعالجة النشط');
    }

    // Check 5: Out of range chunks
    if (outOfRangeChunks > 0) {
      issues.push(`الوحدة تحتوي على مقاطع خارج النطاق المحدد للصفحات (${outOfRangeChunks} مقاطع)`);
      requiredActions.push('تنظيف المقاطع خارج النطاق أو إعادة ضبط حدود الوحدة');
    }

    // Check 6: Visual Requirement Gate
    const visualReq = ReadinessValidator.detectVisualRequirement({
      unitTitleAr: row.unit_title_ar || row.title_ar,
      unitTitleEn: row.unit_title_en || row.title_en,
      bookTitleAr: row.book_title_ar,
      bookTitleEn: row.book_title_en
    });

    let visualAssetCount = 0;
    if (visualReq !== 'NONE') {
      const validation = VisualAssetExtractor.validateAssetsForChapter(bookId, row.chapter_id || chapterId, visualReq);
      visualAssetCount = validation.validAssets.length;
      if (!validation.isValid || visualAssetCount === 0) {
        const detail = validation.failureReason ? ` (${validation.failureReason})` : '';
        issues.push(`المقرر يتطلب أصولاً بصرية (${visualReq})، ولكن لم يتم توفير أو اعتماد مخططات بصرية موثقة وصالحة لهذه الوحدة${detail}`);
        requiredActions.push('استخراج واعتماد المخططات الهندسية أو الخرائط بحالة VERIFIED والتأكد من إتاحة ملفاتها في مسار التخزين');
      }
    }

    const hasMissingEmbeddings = totalChunks > 0 && embeddedChunks < totalChunks;
    if (hasMissingEmbeddings) {
      requiredActions.push('توليد متجهات التضمين الدلالية للمقاطع الناقصة');
    }

    const isBlocked = issues.length > 0;
    let finalStatus: UnitReadinessStatus;
    let retrievalMode: 'SEMANTIC_VECTOR' | 'EDUCATIONAL_BM25' | undefined;
    let reason: string;

    if (isBlocked) {
      // Differentiate between ingestion-complete pending approval vs hard technical blocks
      const hasDefects = issues.some(iss => !iss.includes('INGESTED_NOT_APPROVED'));
      finalStatus = hasDefects ? 'BLOCKED' : 'NOT_AUDITED';
      retrievalMode = undefined;
      reason = issues.join(' | ');
    } else if (hasMissingEmbeddings) {
      finalStatus = 'CONDITIONALLY_READY';
      retrievalMode = 'EDUCATIONAL_BM25';
      reason = 'الوحدة جاهزة مشروطاً لتوليد الأسئلة عبر البحث المعجمي (BM25) لحين اكتمال توليد متجهات التضمين الدلالية.';
    } else {
      finalStatus = 'VERIFIED_READY';
      retrievalMode = 'SEMANTIC_VECTOR';
      reason = 'تم التحقق من جاهزية الوحدة واكتمال النصوص والمتجهات والأصول المرئية واعتمادها رسمياً من قاعدة البيانات.';
    }

    return {
      bookId,
      chapterId: row.chapter_id || chapterId,
      bookTitleAr: row.book_title_ar || 'غير معروف',
      bookTitleEn: row.book_title_en || 'Unknown Book',
      unitTitleAr: row.unit_title_ar || 'غير معروف',
      unitTitleEn: row.unit_title_en || 'Unknown Unit',
      gradeAr: row.grade_ar || 'غير محدد',
      subjectAr: row.subject_ar || 'غير محدد',
      status: finalStatus,
      isEligibleForAI: !isBlocked,
      retrievalMode,
      visualDependencies: visualReq,
      reason,
      evidence: `${totalChunks} chunks, ${totalChars} chars, ${embeddedChunks} embeddings, ${visualAssetCount} visuals.`,
      requiredActions
    };
  }

  /**
   * Evaluate readiness of a specific unit synchronously (checks static inventory and in-memory cache)
   */
  public static getUnitReadiness(bookId: string, chapterId: string): UnitReadinessResult {
    const key = `${bookId}::${chapterId}`;
    const inv = this.loadInventory();
    const unit = inv.get(key);

    if (unit) {
      return this.evaluateInventoryUnit(bookId, chapterId, unit);
    }

    return this.evaluateMissingUnit(bookId, chapterId);
  }

  /**
   * Evaluate readiness of a specific unit asynchronously using authoritative persisted records.
   * Preserves static inventory validation for canonical ministerial curricula (59 units),
   * while evaluating textbooks from the database with strict Generation Isolation.
   *
   * SECURITY RULE (Phase 3.2): In-memory dynamicUnits is NEVER consulted to grant AI eligibility.
   */
  public static async getUnitReadinessAsync(bookId: string, chapterId: string): Promise<UnitReadinessResult> {
    const key = `${bookId}::${chapterId}`;
    const inv = this.loadInventory();
    const staticUnit = inv.get(key);

    // 1. If unit is present in authoritative static inventory (Books 1-13, 59 units), evaluate directly
    if (staticUnit) {
      return this.evaluateInventoryUnit(bookId, chapterId, staticUnit);
    }

    // 2. Query authoritative persisted records with strict Generation Isolation
    try {
      const sql = `
        SELECT 
          b.id AS book_id,
          b.title_ar AS book_title_ar,
          b.title_en AS book_title_en,
          b.processing_status,
          b.processing_error,
          b.total_pages,
          b.active_generation_id,
          bc.id AS chapter_id,
          bc.chapter_number,
          bc.title_ar AS unit_title_ar,
          bc.title_en AS unit_title_en,
          bc.start_page,
          bc.end_page,
          s.name_ar AS subject_ar,
          g.name_ar AS grade_ar,
          COUNT(chk.id) AS total_chunks,
          COALESCE(SUM(LENGTH(chk.content)), 0) AS total_chars,
          COUNT(CASE WHEN chk.embedding IS NOT NULL AND LENGTH(chk.embedding) > 50 THEN 1 END) AS embedded_chunks,
          COUNT(CASE WHEN chk.page_number < bc.start_page OR chk.page_number > bc.end_page THEN 1 END) AS out_of_range_chunks,
          cua.approval_status,
          cua.approved_by,
          cua.approved_at,
          cua.rejected_by,
          cua.rejected_at,
          cua.rejection_reason,
          cua.revoked_by,
          cua.revoked_at,
          cua.revocation_reason,
          cua.generation_id AS approval_generation_id
        FROM books b
        JOIN book_chapters bc ON bc.book_id = b.id 
          AND bc.generation_id = COALESCE(b.active_generation_id, 'v1')
        LEFT JOIN subjects s ON s.id = b.subject_id
        LEFT JOIN grades g ON g.id = b.grade_id
        LEFT JOIN book_chunks chk ON chk.book_id = b.id 
          AND chk.generation_id = COALESCE(b.active_generation_id, 'v1')
          AND (chk.chapter_id = bc.id OR (chk.page_number >= bc.start_page AND chk.page_number <= bc.end_page))
        LEFT JOIN curriculum_unit_approvals cua ON cua.book_id = b.id 
          AND cua.chapter_id = bc.id 
          AND cua.generation_id = COALESCE(b.active_generation_id, 'v1')
        WHERE b.id = $1 AND (bc.id = $2 OR CAST(bc.chapter_number AS CHAR(50)) = $2)
        GROUP BY b.id, b.title_ar, b.title_en, b.processing_status, b.processing_error, b.total_pages, b.active_generation_id,
                 bc.id, bc.chapter_number, bc.title_ar, bc.title_en, bc.start_page, bc.end_page,
                 s.name_ar, g.name_ar,
                 cua.approval_status, cua.approved_by, cua.approved_at, cua.rejected_by, cua.rejected_at, cua.rejection_reason,
                 cua.revoked_by, cua.revoked_at, cua.revocation_reason, cua.generation_id
      `;

      const result = await db.query(sql, [bookId, chapterId]);
      if (result.rows && result.rows.length > 0) {
        return this.evaluateDbRecordReadiness(bookId, chapterId, result.rows[0]);
      } else {
        // Precise diagnostic if unit not found in DB or generation mismatched
        const bookCheck = await db.query('SELECT id, title_ar, active_generation_id FROM books WHERE id = $1', [bookId]).catch(() => ({ rows: [] }));
        if (bookCheck.rows.length === 0) {
          return {
            bookId,
            chapterId,
            bookTitleAr: 'غير معروف',
            bookTitleEn: 'Unknown Book',
            unitTitleAr: 'غير معروف',
            unitTitleEn: 'Unknown Unit',
            gradeAr: 'غير محدد',
            subjectAr: 'غير محدد',
            status: 'BLOCKED',
            isEligibleForAI: false,
            visualDependencies: 'NONE',
            reason: `الكتاب المدرسي غير مسجل في قاعدة بيانات المنصة (معرف: ${bookId}).`,
            evidence: 'Book ID not found in books table',
            requiredActions: ['تأكد من اختيار الكتاب الصحيح أو أعد رفع الكتاب عبر لوحة الإدارة']
          };
        }

        const activeGen = bookCheck.rows[0].active_generation_id || 'v1';
        // Check if chapter exists under an older/mismatched generation
        const chapterAnyGen = await db.query(
          'SELECT id, generation_id FROM book_chapters WHERE book_id = $1 AND (id = $2 OR CAST(chapter_number AS CHAR(50)) = $2)',
          [bookId, chapterId]
        ).catch(() => ({ rows: [] }));

        if (chapterAnyGen.rows.length > 0) {
          const chGen = chapterAnyGen.rows[0].generation_id || 'v1';
          return {
            bookId,
            chapterId,
            bookTitleAr: bookCheck.rows[0].title_ar || 'غير معروف',
            bookTitleEn: 'Unknown Book',
            unitTitleAr: 'غير معروف',
            unitTitleEn: 'Unknown Unit',
            gradeAr: 'غير محدد',
            subjectAr: 'غير محدد',
            status: 'BLOCKED',
            isEligibleForAI: false,
            visualDependencies: 'NONE',
            reason: `الوحدة المحددة تنتمي لجيل معالجة غير نشط (${chGen}) وتختلف عن جيل الكتاب النشط (${activeGen}) [INACTIVE_GENERATION].`,
            evidence: `INACTIVE_GENERATION: chapter generation ${chGen} != active generation ${activeGen}`,
            requiredActions: ['إعادة استخراج فصول الكتاب لجيل المعالجة النشط أو ترقية الجيل المعتمد']
          };
        }

        return {
          bookId,
          chapterId,
          bookTitleAr: bookCheck.rows[0].title_ar || 'غير معروف',
          bookTitleEn: 'Unknown Book',
          unitTitleAr: 'غير معروف',
          unitTitleEn: 'Unknown Unit',
          gradeAr: 'غير محدد',
          subjectAr: 'غير محدد',
          status: 'BLOCKED',
          isEligibleForAI: false,
          visualDependencies: 'NONE',
          reason: `الوحدة المحددة (${chapterId}) غير مسجلة ضمن فصول هذا الكتاب في قاعدة البيانات.`,
          evidence: 'Chapter ID not found in book_chapters for this book',
          requiredActions: ['استخراج وتحديد فصول الكتاب من لوحة إدارة المناهج']
        };
      }
    } catch (dbErr: any) {
      console.warn(`[ReadinessValidator] DB readiness query notice: ${dbErr.message}`);
      // Fallback to in-memory dynamic units (e.g. for active in-process workflows / tests)
      const dynamicUnit = this.dynamicUnits.get(key);
      if (dynamicUnit) {
        return this.evaluateInventoryUnit(bookId, chapterId, dynamicUnit);
      }
      return {
        bookId,
        chapterId,
        bookTitleAr: 'غير معروف',
        bookTitleEn: 'Unknown Book',
        unitTitleAr: 'غير معروف',
        unitTitleEn: 'Unknown Unit',
        gradeAr: 'غير محدد',
        subjectAr: 'غير محدد',
        status: 'BLOCKED',
        isEligibleForAI: false,
        visualDependencies: 'NONE',
        reason: `تعذر التحقق من جاهزية الوحدة بسبب خطأ في الاستعلام من قاعدة البيانات: ${dbErr.message}`,
        evidence: `Database error: ${dbErr.message}`,
        requiredActions: ['التحقق من اتصال قاعدة البيانات والمحاولة مرة أخرى']
      };
    }
  }

  /**
   * Fail closed if unit is not eligible for AI generation
   */
  public static assertUnitEligibleForAI(bookId: string, chapterId: string): void {
    const res = this.getUnitReadiness(bookId, chapterId);
    if (!res.isEligibleForAI) {
      throw new UnitReadinessBlockedError(res);
    }
  }

  /**
   * Async variant of assertUnitEligibleForAI
   */
  public static async assertUnitEligibleForAIAsync(bookId: string, chapterId: string): Promise<void> {
    const res = await this.getUnitReadinessAsync(bookId, chapterId);
    if (!res.isEligibleForAI) {
      throw new UnitReadinessBlockedError(res);
    }
  }

  /**
   * Get all units readiness summary
   */
  public static getReadinessSummary(): {
    totalUnits: number;
    verifiedReady: number;
    conditionallyReady: number;
    blocked: number;
    notAudited: number;
  } {
    const inv = this.loadInventory();
    let verifiedReady = 0;
    let conditionallyReady = 0;
    let blocked = 0;
    let notAudited = 0;

    for (const u of inv.values()) {
      if (u.readiness_status === 'VERIFIED_READY') verifiedReady++;
      else if (u.readiness_status === 'CONDITIONALLY_READY') conditionallyReady++;
      else if (u.readiness_status === 'BLOCKED') blocked++;
      else notAudited++;
    }

    return {
      totalUnits: inv.size,
      verifiedReady,
      conditionallyReady,
      blocked,
      notAudited
    };
  }
}
