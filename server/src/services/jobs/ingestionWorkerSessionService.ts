import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/db.js';
import { DurableIngestionJobService } from './durableIngestionJobService.js';

export interface WorkerSessionRecord {
  id: string;
  session_token_hash: string;
  book_id: string;
  job_id: string;
  file_checksum: string;
  generation_id: string;
  admin_user_id: string;
  created_at: number;
  expires_at: number;
  is_revoked: number;
  last_batch_sequence: number;
  total_pages: number;
  processed_pages_count: number;
}

export interface BatchValidationResult {
  valid: boolean;
  isRetry?: boolean;
  cachedResponse?: any;
  error?: string;
  statusCode?: number;
}

export class IngestionWorkerSessionService {
  private static MAX_SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours max lifetime
  private static SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes per renewal

  /**
   * 1. Create a new bound worker session for a verified book and job.
   */
  public static async createSession(params: {
    adminUserId: string;
    bookId: string;
    fileChecksum: string;
    requestedJobId?: string;
    totalPages?: number;
  }): Promise<{
    sessionId: string;
    sessionToken: string;
    bookId: string;
    jobId: string;
    generationId: string;
    expiresAt: number;
  }> {
    const { adminUserId, bookId, fileChecksum, requestedJobId, totalPages = 0 } = params;

    // Verify book exists in database
    const bookRes = await db.query('SELECT id, title_ar, title_en FROM books WHERE id = $1', [bookId]);
    if (bookRes.rows.length === 0) {
      throw new Error(`Target book "${bookId}" not found in database.`);
    }

    // Ensure durable job exists or acquire it
    let jobId = requestedJobId;
    if (!jobId) {
      const job = await DurableIngestionJobService.createOrGetJob({
        bookId,
        fileChecksum
      });
      jobId = job.id;
    }

    const sessionId = uuidv4();
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const sessionToken = `fws_${sessionId}_${rawSecret}`;
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const generationId = `gen_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = Date.now();
    const expiresAt = now + this.SESSION_TTL_MS;

    await db.query(
      `INSERT INTO ingestion_worker_sessions (
         id, session_token_hash, book_id, job_id, file_checksum, generation_id,
         admin_user_id, created_at, expires_at, is_revoked, last_batch_sequence,
         total_pages, processed_pages_count
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, $10, 0)`,
      [
        sessionId,
        tokenHash,
        bookId,
        jobId,
        fileChecksum,
        generationId,
        adminUserId,
        now,
        expiresAt,
        totalPages
      ]
    );

    return {
      sessionId,
      sessionToken,
      bookId,
      jobId,
      generationId,
      expiresAt
    };
  }

  /**
   * 2. Verify incoming session bearer token and return active session record.
   */
  public static async verifySession(sessionToken: string): Promise<WorkerSessionRecord> {
    if (!sessionToken || !sessionToken.startsWith('fws_')) {
      throw new Error('Invalid or missing worker session token format.');
    }

    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const res = await db.query(
      `SELECT * FROM ingestion_worker_sessions WHERE session_token_hash = $1`,
      [tokenHash]
    );

    if (res.rows.length === 0) {
      throw new Error('Worker session not found.');
    }

    const session: WorkerSessionRecord = res.rows[0];

    if (session.is_revoked === 1) {
      throw new Error('Worker session has been revoked by administration.');
    }

    if (Date.now() > session.expires_at) {
      throw new Error('Worker session has expired. Session renewal required.');
    }

    return session;
  }

  /**
   * 3. Renew an active session (bounded to max session duration).
   */
  public static async renewSession(sessionToken: string): Promise<{ success: boolean; expiresAt: number }> {
    const session = await this.verifySession(sessionToken);
    const now = Date.now();
    const maxExpiry = session.created_at + this.MAX_SESSION_DURATION_MS;

    if (now >= maxExpiry) {
      throw new Error('Worker session reached maximum allowed lifetime (2 hours). Re-authentication required.');
    }

    const newExpiresAt = Math.min(maxExpiry, now + this.SESSION_TTL_MS);

    await db.query(
      `UPDATE ingestion_worker_sessions SET expires_at = $1 WHERE id = $2`,
      [newExpiresAt, session.id]
    );

    return { success: true, expiresAt: newExpiresAt };
  }

  /**
   * 4. Revoke a session immediately.
   */
  public static async revokeSession(sessionId: string): Promise<void> {
    await db.query(
      `UPDATE ingestion_worker_sessions SET is_revoked = 1 WHERE id = $1`,
      [sessionId]
    );
  }

  /**
   * 5. Check idempotency and batch sequencing.
   */
  public static async validateBatchExecution(params: {
    session: WorkerSessionRecord;
    endpoint: string;
    batchSequence: number;
    idempotencyKey: string;
    payloadChecksum: string;
    enforceStrictOrder?: boolean;
  }): Promise<BatchValidationResult> {
    const { session, endpoint, batchSequence, idempotencyKey, payloadChecksum, enforceStrictOrder = true } = params;

    // Check existing idempotency key for this session
    const existing = await db.query(
      `SELECT payload_checksum, response_body, batch_sequence 
       FROM ingestion_batch_idempotency 
       WHERE session_id = $1 AND idempotency_key = $2`,
      [session.id, idempotencyKey]
    );

    if (existing.rows.length > 0) {
      const match = existing.rows[0];
      if (match.payload_checksum === payloadChecksum) {
        // Safe idempotent retry! Return cached response
        let cached = { success: true, message: 'Idempotent retry' };
        try {
          if (match.response_body) cached = JSON.parse(match.response_body);
        } catch (_) {}
        return { valid: true, isRetry: true, cachedResponse: cached };
      } else {
        // Conflicting duplicate! Same key, different payload
        return {
          valid: false,
          statusCode: 409,
          error: `Conflicting duplicate request: idempotency key "${idempotencyKey}" was previously submitted with a different payload.`
        };
      }
    }

    // Monotonic sequence verification for ordered batches (per-session & per-endpoint)
    if (enforceStrictOrder && batchSequence > 0) {
      const seqRes = await db.query(
        `SELECT COALESCE(MAX(batch_sequence), 0) as last_seq 
         FROM ingestion_batch_idempotency 
         WHERE session_id = $1 AND endpoint = $2`,
        [session.id, endpoint]
      );
      const lastSeq = parseInt(seqRes.rows[0]?.last_seq || '0', 10);
      const expectedSequence = lastSeq + 1;
      if (batchSequence !== expectedSequence) {
        const isConflict = batchSequence <= lastSeq;
        return {
          valid: false,
          statusCode: isConflict ? 409 : 400,
          error: isConflict
            ? `Sequence conflict for endpoint "${endpoint}": sequence #${batchSequence} has already been committed (current sequence is #${lastSeq}).`
            : `Out-of-order batch detected for endpoint "${endpoint}": expected sequence #${expectedSequence}, received #${batchSequence}.`
        };
      }
    }

    return { valid: true, isRetry: false };
  }

  /**
   * 6. Record successful batch execution in idempotency log and update sequence.
   */
  public static async recordBatchSuccess(params: {
    sessionId: string;
    endpoint: string;
    batchSequence: number;
    idempotencyKey: string;
    payloadChecksum: string;
    responseBody: any;
  }): Promise<void> {
    const { sessionId, endpoint, batchSequence, idempotencyKey, payloadChecksum, responseBody } = params;
    const recordId = uuidv4();
    const now = Date.now();
    const responseJson = JSON.stringify(responseBody);

    try {
      await db.query(
        `INSERT INTO ingestion_batch_idempotency (
           id, session_id, endpoint, batch_sequence, idempotency_key, payload_checksum, response_body, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [recordId, sessionId, endpoint, batchSequence, idempotencyKey, payloadChecksum, responseJson, now]
      );
    } catch (err: any) {
      const msg = err.message || '';
      if (
        msg.includes('UNIQUE') ||
        msg.includes('Duplicate entry') ||
        err.code === 'ER_DUP_ENTRY' ||
        err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        err.code === 'SQLITE_CONSTRAINT'
      ) {
        throw new Error(
          `Sequence conflict: sequence #${batchSequence} for endpoint "${endpoint}" has already been claimed by another concurrent request.`
        );
      }
      throw err;
    }

    await db.query(
      `UPDATE ingestion_worker_sessions 
       SET last_batch_sequence = CASE WHEN last_batch_sequence > $1 THEN last_batch_sequence ELSE $1 END 
       WHERE id = $2`,
      [batchSequence, sessionId]
    );
  }

  /**
   * 7. Persist raw PDF Chunk into book_pdf_chunks.
   */
  public static async persistPdfChunk(params: {
    session: WorkerSessionRecord;
    chunkIndex: number;
    totalChunks: number;
    chunkData: Buffer;
    fileSizeBytes: number;
    checksum: string;
  }): Promise<void> {
    const { session, chunkIndex, chunkData } = params;

    // Enforce size limit (max 5MB per chunk)
    if (chunkData.length > 5 * 1024 * 1024) {
      throw new Error(`PDF chunk #${chunkIndex} exceeds maximum permitted chunk size (5MB).`);
    }

    await db.query(
      `INSERT INTO book_pdf_chunks (book_id, chunk_index, chunk_data, generation_id) VALUES ($1, $2, $3, $4)
       ON DUPLICATE KEY UPDATE chunk_data = VALUES(chunk_data), generation_id = VALUES(generation_id)`,
      [session.book_id, chunkIndex, chunkData, session.generation_id]
    ).catch(async () => {
      // SQLite fallback for testing
      await db.query(
        `INSERT OR REPLACE INTO book_pdf_chunks (book_id, chunk_index, chunk_data, generation_id) VALUES ($1, $2, $3, $4)`,
        [session.book_id, chunkIndex, chunkData, session.generation_id]
      );
    });
  }

  /**
   * Retrieve canonical raw PDF chunks for a book.
   */
  public static async getRawPdfChunks(bookId: string): Promise<Buffer | null> {
    const res = await db.query(
      `SELECT chunk_index, chunk_data 
       FROM book_pdf_chunks 
       WHERE book_id = $1 
       ORDER BY chunk_index ASC`,
      [bookId]
    );
    if (res.rows.length === 0) return null;
    const buffers = res.rows.map((r: any) => Buffer.isBuffer(r.chunk_data) ? r.chunk_data : Buffer.from(r.chunk_data));
    return Buffer.concat(buffers);
  }

  /**
   * 8. Persist extracted OCR pages into book_ocr_page_results and book_pages.
   */
  public static async persistPages(params: {
    session: WorkerSessionRecord;
    pages: { 
      pageNumber: number; 
      text: string; 
      charCount: number;
      pageType?: string;
      metadata?: any;
    }[];
  }): Promise<number> {
    const { session, pages } = params;
    let saved = 0;

    for (const page of pages) {
      if (!page.pageNumber || page.pageNumber < 1) {
        throw new Error(`Invalid page number: ${page.pageNumber}`);
      }

      const pageType = page.pageType || 'CONTENT';
      const metaObj = {
        page_type: pageType,
        char_count: page.charCount,
        ...(page.metadata || {})
      };
      const metaStr = JSON.stringify(metaObj);

      // 1. Save to dedicated per-page durable table (book_ocr_page_results)
      await db.query(
        `INSERT INTO book_ocr_page_results (job_id, book_id, page_number, extracted_text, char_count)
         VALUES ($1, $2, $3, $4, $5)
         ON DUPLICATE KEY UPDATE extracted_text = VALUES(extracted_text), char_count = VALUES(char_count)`,
        [session.job_id, session.book_id, page.pageNumber, page.text, page.charCount]
      ).catch(async () => {
        // SQLite fallback
        await db.query(
          `INSERT OR REPLACE INTO book_ocr_page_results (job_id, book_id, page_number, extracted_text, char_count)
           VALUES ($1, $2, $3, $4, $5)`,
          [session.job_id, session.book_id, page.pageNumber, page.text, page.charCount]
        );
      });

      // 2. Upsert into canonical book_pages without DELETE, isolated by generation_id
      const pageId = `${session.generation_id}_p${page.pageNumber}`;
      await db.query(
        `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count, generation_id, page_type, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON DUPLICATE KEY UPDATE raw_text = VALUES(raw_text), char_count = VALUES(char_count), page_type = VALUES(page_type), metadata = VALUES(metadata)`,
        [pageId, session.book_id, page.pageNumber, page.text, page.charCount, session.generation_id, pageType, metaStr]
      ).catch(async () => {
        // SQLite fallback with page_type & metadata
        try {
          await db.query(
            `INSERT OR REPLACE INTO book_pages (id, book_id, page_number, raw_text, char_count, generation_id, page_type, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [pageId, session.book_id, page.pageNumber, page.text, page.charCount, session.generation_id, pageType, metaStr]
          );
        } catch (_) {
          await db.query(
            `INSERT OR REPLACE INTO book_pages (id, book_id, page_number, raw_text, char_count, generation_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [pageId, session.book_id, page.pageNumber, page.text, page.charCount, session.generation_id]
          );
        }
      });

      saved++;
    }

    await db.query(
      `UPDATE ingestion_worker_sessions 
       SET processed_pages_count = processed_pages_count + $1 
       WHERE id = $2`,
      [saved, session.id]
    );

    return saved;
  }

  /**
   * 9. Persist detected chapters into book_chapters.
   */
  public static async persistChapters(params: {
    session: WorkerSessionRecord;
    chapters: { chapterNumber: number; titleAr: string; titleEn: string; startPage: number; endPage: number }[];
  }): Promise<number> {
    const { session, chapters } = params;

    // Validate chapter boundary ordering
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      if (ch.startPage > ch.endPage) {
        throw new Error(`Invalid chapter boundary for "${ch.titleAr}": startPage (${ch.startPage}) > endPage (${ch.endPage}).`);
      }
      if (i > 0 && ch.startPage <= chapters[i - 1].startPage) {
        throw new Error(`Chapter "${ch.titleAr}" startPage (${ch.startPage}) must be strictly after previous chapter.`);
      }
    }

    let saved = 0;
    for (const ch of chapters) {
      const chId = `${session.generation_id}_ch${ch.chapterNumber}`;
      await db.query(
        `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON DUPLICATE KEY UPDATE title_ar = VALUES(title_ar), title_en = VALUES(title_en), start_page = VALUES(start_page), end_page = VALUES(end_page)`,
        [chId, session.book_id, ch.chapterNumber, ch.titleAr, ch.titleEn, ch.startPage, ch.endPage, session.generation_id]
      ).catch(async () => {
        // SQLite fallback
        await db.query(
          `INSERT OR REPLACE INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [chId, session.book_id, ch.chapterNumber, ch.titleAr, ch.titleEn, ch.startPage, ch.endPage, session.generation_id]
        );
      });
      saved++;
    }

    return saved;
  }

  /**
   * 10. Persist semantic chunks tagged with session.generation_id (Zero DELETE).
   */
  public static async persistSemanticChunks(params: {
    session: WorkerSessionRecord;
    chunks: {
      chunkIndex: number;
      pageNumber: number;
      chapterNumber?: number;
      content: string;
      embedding?: any;
      embeddingModel?: string;
      embeddingVersion?: string;
      metadata?: any;
    }[];
  }): Promise<number> {
    const { session, chunks } = params;

    // Query subject / grade metadata from book
    const bRow = await db.query(
      `SELECT academic_stage_id, grade_id, subject_id FROM books WHERE id = $1`,
      [session.book_id]
    );
    if (bRow.rows.length === 0) {
      throw new Error(`Book ${session.book_id} not found.`);
    }

    const { academic_stage_id, grade_id, subject_id } = bRow.rows[0];
    let saved = 0;

    for (const c of chunks) {
      const chunkId = `${session.generation_id}_c${c.chunkIndex}_p${c.pageNumber}`;
      let chapterId: string | null = null;
      if (c.chapterNumber) {
        const genChId = `${session.generation_id}_ch${c.chapterNumber}`;
        const legacyChId = `${session.book_id}_ch${c.chapterNumber}`;
        const chExists = await db.query(
          `SELECT id FROM book_chapters WHERE id = $1 OR id = $2`,
          [genChId, legacyChId]
        );
        if (chExists.rows.length > 0) {
          chapterId = chExists.rows[0].id;
        }
      }
      const embeddingStr = c.embedding ? (typeof c.embedding === 'string' ? c.embedding : JSON.stringify(c.embedding)) : null;
      const chunkModel = c.embeddingModel || (c.embedding ? 'semantic-hash-768' : 'none');
      const chunkVersion = c.embeddingVersion || '1.0';
      const metadataObj = {
        page: c.pageNumber,
        generation: session.generation_id,
        embedding_model: chunkModel,
        embedding_version: chunkVersion,
        ...(c.metadata || {})
      };
      const metadataJson = JSON.stringify(metadataObj);

      await db.query(
        `INSERT INTO book_chunks (
           id, book_id, chapter_id, academic_stage_id, grade_id, subject_id,
           page_number, chunk_index, content, metadata, embedding, generation_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          chunkId,
          session.book_id,
          chapterId,
          academic_stage_id,
          grade_id,
          subject_id,
          c.pageNumber,
          c.chunkIndex,
          c.content,
          metadataJson,
          embeddingStr,
          session.generation_id
        ]
      ).catch(async () => {
        // SQLite fallback in tests
        await db.query(
          `INSERT OR REPLACE INTO book_chunks (
             id, book_id, chapter_id, academic_stage_id, grade_id, subject_id,
             page_number, chunk_index, content, metadata, embedding, generation_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            chunkId,
            session.book_id,
            chapterId,
            academic_stage_id,
            grade_id,
            subject_id,
            c.pageNumber,
            c.chunkIndex,
            c.content,
            metadataJson,
            embeddingStr,
            session.generation_id
          ]
        );
      });
      saved++;
    }

    return saved;
  }

  /**
   * Helper to validate page completeness and content quality.
   * Does NOT reject valid equation, diagram, table, or structural pages.
   */
  public static isPageValid(pageRow: any): { valid: boolean; reason?: string } {
    const text = (pageRow.raw_text || '').trim();
    const charCount = typeof pageRow.char_count === 'number' ? pageRow.char_count : text.length;

    // 1. Meaningful textual content (>= 15 characters)
    if (charCount >= 15 && text.length >= 15) {
      return { valid: true };
    }

    // 2. Extract metadata and page_type
    let meta: any = {};
    if (pageRow.metadata) {
      try {
        meta = typeof pageRow.metadata === 'string' ? JSON.parse(pageRow.metadata) : pageRow.metadata;
      } catch (_) {}
    }

    const pageType = (meta.page_type || meta.pageType || pageRow.page_type || '').toUpperCase();
    const validStructuralTypes = [
      'DIAGRAM', 'EQUATION', 'TABLE', 'ILLUSTRATION', 'MAP', 'BLANK', 'COVER', 'FORMULA', 'EXERCISE'
    ];
    if (validStructuralTypes.includes(pageType)) {
      return { valid: true };
    }

    if (
      meta.has_diagram ||
      meta.has_equation ||
      meta.has_table ||
      meta.has_visual_content ||
      meta.is_blank ||
      meta.is_cover ||
      meta.diagram_detected ||
      meta.equation_detected ||
      meta.table_detected
    ) {
      return { valid: true };
    }

    // 3. Mathematical or equation symbols in short text
    const hasMathSymbols = /[=+\-*/^√π<>≤≥∫∑\\]/.test(text) || /^[0-9xXyYzZ\s=+\-*/^().,]+$/.test(text);
    if (hasMathSymbols && text.length >= 3) {
      return { valid: true };
    }

    return {
      valid: false,
      reason: `page #${pageRow.page_number} text length (${text.length} chars) is below minimum meaningful threshold (15 chars) without explicit equation, diagram, or structural metadata.`
    };
  }

  /**
   * 11. Independent Verification and Atomic Generation Promotion.
   */
  public static async completeSession(params: {
    session: WorkerSessionRecord;
    totalPages: number;
    totalChunks: number;
    unitsCount: number;
  }): Promise<{ success: boolean; status: string; activeGenerationId: string }> {
    const { session, totalPages, totalChunks, unitsCount } = params;

    // 1. Independent Cloud Validation: Raw PDF Chunks Reassembly and SHA-256 Checksum Verification
    const pdfRows = await db.query(
      `SELECT chunk_index, chunk_data 
       FROM book_pdf_chunks 
       WHERE book_id = $1 AND generation_id = $2 
       ORDER BY chunk_index ASC`,
      [session.book_id, session.generation_id]
    );
    if (pdfRows.rows.length === 0) {
      throw new Error(`Verification failed: raw PDF chunks missing for generation "${session.generation_id}".`);
    }
    // Verify contiguity of PDF chunk indices
    for (let i = 0; i < pdfRows.rows.length; i++) {
      if (pdfRows.rows[i].chunk_index !== i) {
        throw new Error(`Verification failed: missing PDF chunk at index #${i}.`);
      }
    }
    // Reconstruct raw buffer and check SHA-256 against session file checksum
    const pdfBuffers = pdfRows.rows.map((r: any) => Buffer.isBuffer(r.chunk_data) ? r.chunk_data : Buffer.from(r.chunk_data));
    const assembledPdf = Buffer.concat(pdfBuffers);
    const assembledChecksum = crypto.createHash('sha256').update(assembledPdf).digest('hex');

    if (session.file_checksum && assembledChecksum !== session.file_checksum) {
      throw new Error(
        `Verification failed: Reconstructed PDF checksum mismatch. Expected: ${session.file_checksum}, Reconstructed: ${assembledChecksum}.`
      );
    }

    // 2. Independent Cloud Validation: Sequential Page Coverage and Content Quality
    const pagesRes = await db.query(
      `SELECT page_number, char_count, raw_text, page_type, metadata 
       FROM book_pages 
       WHERE book_id = $1 AND generation_id = $2 
       ORDER BY page_number ASC`,
      [session.book_id, session.generation_id]
    );
    const savedPages = pagesRes.rows;
    if (savedPages.length === 0) {
      throw new Error(`Verification failed: zero canonical pages saved for generation "${session.generation_id}".`);
    }
    if (totalPages > 0 && savedPages.length < totalPages) {
      throw new Error(
        `Verification failed: saved pages count (${savedPages.length}) is less than expected total pages (${totalPages}).`
      );
    }

    // Check sequential continuity without gaps and verify content validity
    const expectedPageLimit = totalPages > 0 ? totalPages : savedPages.length;
    for (let p = 1; p <= expectedPageLimit; p++) {
      const pageRow = savedPages.find((r: any) => r.page_number === p);
      if (!pageRow) {
        throw new Error(`Verification failed: missing page #${p} in sequence (1..${expectedPageLimit}).`);
      }
      const pageValidity = IngestionWorkerSessionService.isPageValid(pageRow);
      if (!pageValidity.valid) {
        throw new Error(`Verification failed: ${pageValidity.reason}`);
      }
    }

    // Provenance Verification: Ensure every canonical page in book_pages has a matching raw OCR checkpoint in book_ocr_page_results
    const provenanceRes = await db.query(
      `SELECT bp.page_number
       FROM book_pages bp
       LEFT JOIN book_ocr_page_results bopr
         ON bopr.book_id = bp.book_id 
        AND bopr.job_id = $1 
        AND bopr.page_number = bp.page_number
       WHERE bp.book_id = $2 
         AND bp.generation_id = $3
         AND bopr.page_number IS NULL
       LIMIT 1`,
      [session.job_id, session.book_id, session.generation_id]
    );
    if (provenanceRes.rows.length > 0) {
      throw new Error(
        `Verification failed: canonical page #${provenanceRes.rows[0].page_number} lacks matching raw OCR checkpoint in book_ocr_page_results.`
      );
    }

    // 3. Independent Cloud Validation: Chapters Coverage
    const chaptersRes = await db.query(
      `SELECT chapter_number, start_page, end_page 
       FROM book_chapters 
       WHERE book_id = $1 AND generation_id = $2 
       ORDER BY chapter_number ASC`,
      [session.book_id, session.generation_id]
    );
    if (unitsCount > 0 && chaptersRes.rows.length < unitsCount) {
      throw new Error(
        `Verification failed: detected chapters count (${chaptersRes.rows.length}) is less than expected units (${unitsCount}).`
      );
    }
    for (const ch of chaptersRes.rows) {
      if (ch.start_page > ch.end_page || ch.start_page < 1) {
        throw new Error(`Verification failed: chapter #${ch.chapter_number} has invalid page range (${ch.start_page}..${ch.end_page}).`);
      }
    }

    // 4. Independent Cloud Validation: Semantic Chunks Check
    const chunksCheck = await db.query(
      `SELECT COUNT(*) as cnt 
       FROM book_chunks 
       WHERE book_id = $1 AND generation_id = $2`,
      [session.book_id, session.generation_id]
    );
    const savedChunksCount = parseInt(chunksCheck.rows[0]?.cnt || '0', 10);
    if (savedChunksCount === 0) {
      throw new Error(`Verification failed: zero semantic chunks found for generation "${session.generation_id}".`);
    }

    // 5. Atomic Generation Promotion: Single SQL Update (Crash-Safe, Zero DELETE)
    await db.query(
      `UPDATE books 
       SET active_generation_id = $1, 
           processing_status = 'COMPLETED',
           total_pages = $2,
           processing_error = NULL
       WHERE id = $3`,
      [session.generation_id, totalPages || savedPages.length, session.book_id]
    );

    // 6. Update Durable Job Status
    await DurableIngestionJobService.markCompleted(session.job_id, 'cloud_gateway', {
      totalPages: totalPages || savedPages.length,
      totalChunks: savedChunksCount,
      unitsCount: chaptersRes.rows.length || unitsCount,
      activeGenerationId: session.generation_id
    }).catch(() => {});

    // 7. Mark Session Completed
    await db.query(
      `UPDATE ingestion_worker_sessions SET processed_pages_count = $1 WHERE id = $2`,
      [savedPages.length, session.id]
    );

    return {
      success: true,
      status: 'VERIFIED_READY',
      activeGenerationId: session.generation_id
    };
  }
}

