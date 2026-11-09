import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/db.js';
import { VisualAssetExtractor } from './ai/visualAssetExtractor.js';

export type CurriculumApprovalStatus = 'NOT_AUDITED' | 'APPROVED' | 'REJECTED' | 'REVOKED';

export interface CurriculumUnitReviewDetails {
  book: {
    id: string;
    title_ar: string;
    title_en: string;
    stage_name_ar: string;
    grade_name_ar: string;
    subject_name_ar: string;
    term: number;
    total_pages: number;
    processing_status: string;
    processing_error?: string;
    active_generation_id: string;
  };
  unit: {
    id: string;
    chapter_number: number;
    title_ar: string;
    title_en: string;
    start_page: number;
    end_page: number;
    generation_id: string;
  };
  coverage: {
    total_chunks: number;
    total_chars: number;
    embedded_chunks: number;
    out_of_range_chunks: number;
    source_pages_count: number;
  };
  provenance: {
    isValid: boolean;
    issues: string[];
  };
  visualDependencies: {
    type: string;
    assetCount: number;
    isSatisfied: boolean;
  };
  approval: {
    status: CurriculumApprovalStatus;
    approved_by?: string;
    approved_at?: string;
    rejected_by?: string;
    rejected_at?: string;
    rejection_reason?: string;
    revoked_by?: string;
    revoked_at?: string;
    revocation_reason?: string;
    notes?: string;
  };
  readiness: {
    isReadyForApproval: boolean;
    issues: string[];
    warnings: string[];
  };
}

export class CurriculumApprovalService {
  /**
   * List books and unit counts awaiting review or reviewed
   */
  public static async getReviewQueue(filter?: { stageId?: string; gradeId?: string; subjectId?: string; status?: string }): Promise<any[]> {
    let sql = `
      SELECT 
        b.id,
        b.title_ar,
        b.title_en,
        b.total_pages,
        b.processing_status,
        b.processing_error,
        b.term,
        b.school_type,
        COALESCE(b.active_generation_id, 'v1') AS active_generation_id,
        b.created_at,
        s.name_ar AS subject_name_ar,
        g.name_ar AS grade_name_ar,
        st.name_ar AS stage_name_ar,
        COUNT(DISTINCT bc.id) AS total_units,
        COUNT(DISTINCT CASE WHEN cua.approval_status = 'APPROVED' THEN bc.id END) AS approved_units,
        COUNT(DISTINCT CASE WHEN cua.approval_status = 'REJECTED' THEN bc.id END) AS rejected_units,
        COUNT(DISTINCT CASE WHEN cua.approval_status = 'REVOKED' THEN bc.id END) AS revoked_units,
        COUNT(DISTINCT CASE WHEN cua.approval_status IS NULL OR cua.approval_status = 'NOT_AUDITED' THEN bc.id END) AS pending_units
      FROM books b
      LEFT JOIN subjects s ON s.id = b.subject_id
      LEFT JOIN grades g ON g.id = b.grade_id
      LEFT JOIN academic_stages st ON st.id = b.academic_stage_id
      LEFT JOIN book_chapters bc ON bc.book_id = b.id 
        AND bc.generation_id = COALESCE(b.active_generation_id, 'v1')
      LEFT JOIN curriculum_unit_approvals cua ON cua.book_id = b.id 
        AND cua.chapter_id = bc.id 
        AND cua.generation_id = COALESCE(b.active_generation_id, 'v1')
      WHERE 1=1
    `;

    const params: any[] = [];
    if (filter?.stageId) {
      params.push(filter.stageId);
      sql += ` AND b.academic_stage_id = $${params.length}`;
    }
    if (filter?.gradeId) {
      params.push(filter.gradeId);
      sql += ` AND b.grade_id = $${params.length}`;
    }
    if (filter?.subjectId) {
      params.push(filter.subjectId);
      sql += ` AND b.subject_id = $${params.length}`;
    }

    sql += `
      GROUP BY b.id, b.title_ar, b.title_en, b.total_pages, b.processing_status, b.processing_error,
               b.term, b.school_type, b.active_generation_id, b.created_at, s.name_ar, g.name_ar, st.name_ar
      ORDER BY b.created_at DESC
    `;

    const res = await db.query(sql, params);
    return res.rows;
  }

  /**
   * Retrieve exhaustive review details for a specific curriculum unit
   */
  public static async getUnitReviewDetails(chapterId: string): Promise<CurriculumUnitReviewDetails> {
    const chapterRes = await db.query(`
      SELECT 
        bc.id AS chapter_id,
        bc.book_id,
        bc.chapter_number,
        bc.title_ar AS unit_title_ar,
        bc.title_en AS unit_title_en,
        bc.start_page,
        bc.end_page,
        bc.generation_id AS unit_generation_id,
        b.title_ar AS book_title_ar,
        b.title_en AS book_title_en,
        b.total_pages,
        b.processing_status,
        b.processing_error,
        b.term,
        COALESCE(b.active_generation_id, 'v1') AS active_generation_id,
        s.name_ar AS subject_name_ar,
        g.name_ar AS grade_name_ar,
        st.name_ar AS stage_name_ar
      FROM book_chapters bc
      JOIN books b ON b.id = bc.book_id
      LEFT JOIN subjects s ON s.id = b.subject_id
      LEFT JOIN grades g ON g.id = b.grade_id
      LEFT JOIN academic_stages st ON st.id = b.academic_stage_id
      WHERE bc.id = $1
    `, [chapterId]);

    if (chapterRes.rows.length === 0) {
      throw new Error(`الوحدة الدراسية المطلوبة غير موجودة في النظام (معرف: ${chapterId})`);
    }

    const row = chapterRes.rows[0];
    const activeGen = row.active_generation_id || 'v1';

    // 1. Chunk statistics for this unit in active generation
    const chunkStatsRes = await db.query(`
      SELECT 
        COUNT(*) AS total_chunks,
        COALESCE(SUM(LENGTH(content)), 0) AS total_chars,
        COUNT(CASE WHEN embedding IS NOT NULL AND LENGTH(embedding) > 50 THEN 1 END) AS embedded_chunks,
        COUNT(CASE WHEN page_number < $3 OR page_number > $4 THEN 1 END) AS out_of_range_chunks
      FROM book_chunks
      WHERE book_id = $1 
        AND generation_id = $2
        AND (chapter_id = $5 OR (page_number >= $3 AND page_number <= $4))
    `, [row.book_id, activeGen, row.start_page, row.end_page, chapterId]);

    const cStats = chunkStatsRes.rows[0];
    const totalChunks = parseInt(String(cStats.total_chunks || '0'), 10);
    const totalChars = parseInt(String(cStats.total_chars || '0'), 10);
    const embeddedChunks = parseInt(String(cStats.embedded_chunks || '0'), 10);
    const outOfRangeChunks = parseInt(String(cStats.out_of_range_chunks || '0'), 10);

    // 2. Source pages count in active generation
    const pagesRes = await db.query(`
      SELECT COUNT(*) AS count
      FROM book_pages
      WHERE book_id = $1 
        AND generation_id = $2
        AND page_number >= $3 
        AND page_number <= $4
    `, [row.book_id, activeGen, row.start_page, row.end_page]);
    const sourcePagesCount = parseInt(String(pagesRes.rows[0]?.count || '0'), 10);

    // 3. Provenance validation
    const issues: string[] = [];
    const warnings: string[] = [];

    if (row.unit_generation_id !== activeGen) {
      issues.push(`جيل معالجة الوحدة (${row.unit_generation_id}) لا يطابق جيل المعالجة النشط للكتاب (${activeGen})`);
    }

    if (row.start_page > row.end_page) {
      issues.push(`نطاق صفحات الوحدة غير صالح: يبدأ من ${row.start_page} وينتهي عند ${row.end_page}`);
    }
    if (row.start_page < 1 || (row.total_pages > 0 && row.end_page > row.total_pages)) {
      issues.push(`نطاق صفحات الوحدة خارج حدود صفحات ملف الكتاب (1 إلى ${row.total_pages})`);
    }

    if (totalChunks < 2) {
      issues.push(`عدد المقاطع المستخرجة في جيل المعالجة النشط أقل من الحد الأدنى (${totalChunks} / 2)`);
    }
    if (totalChars < 100) {
      issues.push(`حجم النص المستخرج في جيل المعالجة النشط غير كافٍ (${totalChars} / 100 حرف)`);
    }
    if (outOfRangeChunks > 0) {
      issues.push(`يوجد ${outOfRangeChunks} مقاطع خارج النطاق المحدد لصفحات الوحدة`);
    }

    // Check if chunks have conflicting generation ids
    const foreignGenChunksRes = await db.query(`
      SELECT COUNT(*) as count 
      FROM book_chunks 
      WHERE book_id = $1 AND chapter_id = $2 AND generation_id != $3
    `, [row.book_id, chapterId, activeGen]);
    const foreignGenChunks = parseInt(String(foreignGenChunksRes.rows[0]?.count || '0'), 10);
    if (foreignGenChunks > 0) {
      warnings.push(`توجد ${foreignGenChunks} مقاطع تنتمي لأجيال معالجة أقدم أو مختلفة`);
    }

    // 4. Visual Dependencies Check
    const titleAr = (row.book_title_ar || '').toLowerCase();
    let visualType = 'NONE';
    if (titleAr.includes('هندسة') || titleAr.includes('geometry')) {
      visualType = 'GEOMETRY_DIAGRAMS';
    } else if (titleAr.includes('جغرافيا') || titleAr.includes('خريطة') || titleAr.includes('خرائط')) {
      visualType = 'CARTOGRAPHIC_MAPS';
    }

    let visualAssetCount = 0;
    let isVisualSatisfied = true;
    if (visualType !== 'NONE') {
      const assets = VisualAssetExtractor.getAssetsForChapter(row.book_id, chapterId);
      visualAssetCount = assets.length;
      if (visualAssetCount === 0) {
        issues.push(`المقرر يتطلب أصولاً بصرية (${visualType})، ولكن لم يتم اعتماد أي مخططات بصرية لهذه الوحدة`);
        isVisualSatisfied = false;
      }
    }

    // 5. Existing approval record
    const approvalRes = await db.query(`
      SELECT * FROM curriculum_unit_approvals 
      WHERE book_id = $1 AND chapter_id = $2 AND generation_id = $3
    `, [row.book_id, chapterId, activeGen]);

    const appRow = approvalRes.rows[0];
    const approvalStatus: CurriculumApprovalStatus = appRow?.approval_status || 'NOT_AUDITED';

    return {
      book: {
        id: row.book_id,
        title_ar: row.book_title_ar,
        title_en: row.book_title_en,
        stage_name_ar: row.stage_name_ar || 'غير محدد',
        grade_name_ar: row.grade_name_ar || 'غير محدد',
        subject_name_ar: row.subject_name_ar || 'غير محدد',
        term: row.term || 1,
        total_pages: row.total_pages || 0,
        processing_status: row.processing_status,
        processing_error: row.processing_error,
        active_generation_id: activeGen
      },
      unit: {
        id: row.chapter_id,
        chapter_number: row.chapter_number,
        title_ar: row.unit_title_ar,
        title_en: row.unit_title_en,
        start_page: row.start_page,
        end_page: row.end_page,
        generation_id: row.unit_generation_id
      },
      coverage: {
        total_chunks: totalChunks,
        total_chars: totalChars,
        embedded_chunks: embeddedChunks,
        out_of_range_chunks: outOfRangeChunks,
        source_pages_count: sourcePagesCount
      },
      provenance: {
        isValid: issues.length === 0,
        issues
      },
      visualDependencies: {
        type: visualType,
        assetCount: visualAssetCount,
        isSatisfied: isVisualSatisfied
      },
      approval: {
        status: approvalStatus,
        approved_by: appRow?.approved_by,
        approved_at: appRow?.approved_at,
        rejected_by: appRow?.rejected_by,
        rejected_at: appRow?.rejected_at,
        rejection_reason: appRow?.rejection_reason,
        revoked_by: appRow?.revoked_by,
        revoked_at: appRow?.revoked_at,
        revocation_reason: appRow?.revocation_reason,
        notes: appRow?.notes
      },
      readiness: {
        isReadyForApproval: issues.length === 0 && row.processing_status === 'COMPLETED',
        issues,
        warnings
      }
    };
  }

  /**
   * Approve a specific curriculum unit after independent server-side validation
   */
  public static async approveUnit(
    adminUserId: string,
    chapterId: string,
    bookId: string,
    notes?: string
  ): Promise<{ success: boolean; approval: any }> {
    if (!adminUserId) {
      throw new Error('معرف المدير غير مصرح به');
    }

    // Security check: Reject synthetic mock fixtures from persistent DB approval
    if (bookId.startsWith('mock_') || chapterId.startsWith('mock_')) {
      throw new Error('لا يمكن اعتماد وحدات اختبارية اصطناعية في قاعدة البيانات');
    }

    const review = await this.getUnitReviewDetails(chapterId);

    // Verify book ownership matches parameter
    if (review.book.id !== bookId) {
      throw new Error('معرف الكتاب المقدم لا يتطابق مع معرف الكتاب الفعلي لهذه الوحدة');
    }

    // Independent validation: cannot approve if provenance has issues
    if (!review.provenance.isValid || review.provenance.issues.length > 0) {
      throw new Error(`لا يمكن اعتماد الوحدة: توجد مشاكل في سلامة البيانات (${review.provenance.issues.join(' | ')})`);
    }

    // Must be in COMPLETED ingestion status
    if (review.book.processing_status !== 'COMPLETED') {
      throw new Error(`لا يمكن اعتماد الوحدة: معالجة الكتاب لم تكتمل بنجاح (الحالة الحالية: ${review.book.processing_status})`);
    }

    const activeGen = review.book.active_generation_id;
    const nowIso = new Date().toISOString();

    // Check if approval record exists for this (book_id, chapter_id, generation_id)
    const existing = await db.query(`
      SELECT id FROM curriculum_unit_approvals 
      WHERE book_id = $1 AND chapter_id = $2 AND generation_id = $3
    `, [bookId, chapterId, activeGen]);

    let approvalId: string;
    if (existing.rows.length > 0) {
      approvalId = existing.rows[0].id;
      await db.query(`
        UPDATE curriculum_unit_approvals
        SET approval_status = 'APPROVED',
            approved_by = $1,
            approved_at = $2,
            rejected_by = NULL,
            rejected_at = NULL,
            rejection_reason = NULL,
            revoked_by = NULL,
            revoked_at = NULL,
            revocation_reason = NULL,
            notes = $3,
            updated_at = $2
        WHERE id = $4
      `, [adminUserId, nowIso, notes || null, approvalId]);
    } else {
      approvalId = `cua_${uuidv4().replace(/-/g, '').slice(0, 24)}`;
      await db.query(`
        INSERT INTO curriculum_unit_approvals (
          id, book_id, chapter_id, generation_id, approval_status,
          approved_by, approved_at, notes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'APPROVED', $5, $6, $7, $6, $6)
      `, [approvalId, bookId, chapterId, activeGen, adminUserId, nowIso, notes || null]);
    }

    return {
      success: true,
      approval: {
        id: approvalId,
        book_id: bookId,
        chapter_id: chapterId,
        generation_id: activeGen,
        approval_status: 'APPROVED',
        approved_by: adminUserId,
        approved_at: nowIso,
        notes: notes || null
      }
    };
  }

  /**
   * Reject a specific curriculum unit with an explicit reason
   */
  public static async rejectUnit(
    adminUserId: string,
    chapterId: string,
    bookId: string,
    reason: string
  ): Promise<{ success: boolean; approval: any }> {
    if (!adminUserId) throw new Error('معرف المدير غير مصرح به');
    if (!reason || reason.trim().length === 0) {
      throw new Error('يجب تقديم سبب واضح لرفض اعتماد الوحدة');
    }

    const review = await this.getUnitReviewDetails(chapterId);
    if (review.book.id !== bookId) {
      throw new Error('معرف الكتاب لا يتطابق مع معرف كتاب الوحدة');
    }

    const activeGen = review.book.active_generation_id;
    const nowIso = new Date().toISOString();

    const existing = await db.query(`
      SELECT id FROM curriculum_unit_approvals 
      WHERE book_id = $1 AND chapter_id = $2 AND generation_id = $3
    `, [bookId, chapterId, activeGen]);

    let approvalId: string;
    if (existing.rows.length > 0) {
      approvalId = existing.rows[0].id;
      await db.query(`
        UPDATE curriculum_unit_approvals
        SET approval_status = 'REJECTED',
            rejected_by = $1,
            rejected_at = $2,
            rejection_reason = $3,
            updated_at = $2
        WHERE id = $4
      `, [adminUserId, nowIso, reason.trim(), approvalId]);
    } else {
      approvalId = `cua_${uuidv4().replace(/-/g, '').slice(0, 24)}`;
      await db.query(`
        INSERT INTO curriculum_unit_approvals (
          id, book_id, chapter_id, generation_id, approval_status,
          rejected_by, rejected_at, rejection_reason, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'REJECTED', $5, $6, $7, $6, $6)
      `, [approvalId, bookId, chapterId, activeGen, adminUserId, nowIso, reason.trim()]);
    }

    return {
      success: true,
      approval: {
        id: approvalId,
        book_id: bookId,
        chapter_id: chapterId,
        generation_id: activeGen,
        approval_status: 'REJECTED',
        rejected_by: adminUserId,
        rejected_at: nowIso,
        rejection_reason: reason.trim()
      }
    };
  }

  /**
   * Revoke an active approval with an explicit reason
   */
  public static async revokeUnit(
    adminUserId: string,
    chapterId: string,
    bookId: string,
    reason: string
  ): Promise<{ success: boolean; approval: any }> {
    if (!adminUserId) throw new Error('معرف المدير غير مصرح به');
    if (!reason || reason.trim().length === 0) {
      throw new Error('يجب تقديم سبب واضح لسحب اعتماد الوحدة');
    }

    const review = await this.getUnitReviewDetails(chapterId);
    if (review.book.id !== bookId) {
      throw new Error('معرف الكتاب لا يتطابق مع معرف كتاب الوحدة');
    }

    const activeGen = review.book.active_generation_id;
    const nowIso = new Date().toISOString();

    const existing = await db.query(`
      SELECT id, approval_status FROM curriculum_unit_approvals 
      WHERE book_id = $1 AND chapter_id = $2 AND generation_id = $3
    `, [bookId, chapterId, activeGen]);

    if (existing.rows.length === 0 || existing.rows[0].approval_status !== 'APPROVED') {
      throw new Error('لا يمكن سحب اعتماد وحدة غير معتمدة حالياً');
    }

    const approvalId = existing.rows[0].id;
    await db.query(`
      UPDATE curriculum_unit_approvals
      SET approval_status = 'REVOKED',
          revoked_by = $1,
          revoked_at = $2,
          revocation_reason = $3,
          updated_at = $2
      WHERE id = $4
    `, [adminUserId, nowIso, reason.trim(), approvalId]);

    return {
      success: true,
      approval: {
        id: approvalId,
        book_id: bookId,
        chapter_id: chapterId,
        generation_id: activeGen,
        approval_status: 'REVOKED',
        revoked_by: adminUserId,
        revoked_at: nowIso,
        revocation_reason: reason.trim()
      }
    };
  }
}

