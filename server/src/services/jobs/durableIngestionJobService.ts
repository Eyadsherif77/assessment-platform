import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/db.js';

export type IngestionJobStage =
  | 'UPLOADED'
  | 'EXTRACTING_PAGES'
  | 'OCR_PROCESSING'
  | 'DETECTING_CHAPTERS'
  | 'CHUNKING_AND_EMBEDDING'
  | 'READINESS_AUDIT'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED';

export type IngestionJobStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'
  | 'RETRYING';

export interface IngestionJobRecord {
  id: string;
  bookId: string;
  fileChecksum: string;
  currentStage: IngestionJobStage;
  status: IngestionJobStatus;
  attemptCount: number;
  maxAttempts: number;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  checkpointData: any;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class DurableIngestionJobService {
  private static readonly DEFAULT_LEASE_SECONDS = 90; // 90s lease per stage
  private static readonly MAX_ATTEMPTS = 3;

  /**
   * Register or retrieve an existing durable ingestion job for a textbook.
   * If an identical file checksum was already successfully processed for the same book,
   * returns the existing job to guarantee idempotency.
   */
  public static async createOrGetJob(params: {
    bookId: string;
    fileChecksum: string;
    initialCheckpoint?: any;
  }): Promise<IngestionJobRecord> {
    const { bookId, fileChecksum, initialCheckpoint = {} } = params;

    // Check if an existing job for this book and checksum is already completed
    const existing = await db.query(
      `SELECT id, book_id, file_checksum, current_stage, status, attempt_count,
              max_attempts, lease_owner, lease_expires_at, checkpoint_data, last_error,
              created_at, updated_at
       FROM book_ingestion_jobs
       WHERE book_id = $1 AND file_checksum = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [bookId, fileChecksum]
    );

    if (existing.rows.length > 0) {
      const existingJob = this.mapRow(existing.rows[0]);
      if (existingJob.status === 'FAILED' || existingJob.status === 'RETRYING' || existingJob.status === 'IN_PROGRESS') {
        await db.query(
          `UPDATE book_ingestion_jobs SET status = 'PENDING', lease_owner = NULL, lease_expires_at = NULL, attempt_count = 0, last_error = NULL WHERE id = $1`,
          [existingJob.id]
        );
        existingJob.status = 'PENDING';
        existingJob.leaseOwner = null;
        existingJob.leaseExpiresAt = null;
        existingJob.attemptCount = 0;
      }
      return existingJob;
    }

    const jobId = `job_ingest_${uuidv4()}`;
    const initialCheckpointJson = JSON.stringify(initialCheckpoint);

    await db.query(
      `INSERT INTO book_ingestion_jobs (
         id, book_id, file_checksum, current_stage, status, attempt_count, max_attempts,
         checkpoint_data
       ) VALUES ($1, $2, $3, 'UPLOADED', 'PENDING', 0, $4, $5)`,
      [jobId, bookId, fileChecksum, this.MAX_ATTEMPTS, initialCheckpointJson]
    );

    return {
      id: jobId,
      bookId,
      fileChecksum,
      currentStage: 'UPLOADED',
      status: 'PENDING',
      attemptCount: 0,
      maxAttempts: this.MAX_ATTEMPTS,
      leaseOwner: null,
      leaseExpiresAt: null,
      checkpointData: initialCheckpoint,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private static isMySql(): boolean {
    if (typeof (db as any).getDialect === 'function') {
      return (db as any).getDialect() === 'mysql';
    }
    return Boolean((db as any).isMySql || (db as any).mode === 'mysql');
  }

  /**
   * Atomically claim a job lease using compare-and-swap (CAS).
   * Prevents concurrent workers from executing the same stage simultaneously.
   */
  public static async claimJob(
    jobId: string,
    workerId: string,
    leaseSeconds = this.DEFAULT_LEASE_SECONDS
  ): Promise<boolean> {
    const isMysql = this.isMySql();

    if (isMysql) {
      const result = await db.query(
        `UPDATE book_ingestion_jobs
         SET status = 'IN_PROGRESS',
             lease_owner = $1,
             lease_expires_at = DATE_ADD(NOW(), INTERVAL $2 SECOND),
             attempt_count = attempt_count + 1,
             updated_at = NOW()
         WHERE id = $3
           AND (status IN ('PENDING', 'RETRYING') OR (status = 'IN_PROGRESS' AND (lease_expires_at IS NULL OR lease_expires_at < NOW() OR lease_owner = $1)))`,
        [workerId, leaseSeconds, jobId]
      );
      return (result as any).rowCount > 0 || (result as any).affectedRows > 0;
    } else {
      // SQLite compatible syntax
      const result = await db.query(
        `UPDATE book_ingestion_jobs
         SET status = 'IN_PROGRESS',
             lease_owner = $1,
             lease_expires_at = datetime('now', '+' || $2 || ' seconds'),
             attempt_count = attempt_count + 1,
             updated_at = datetime('now')
         WHERE id = $3
           AND (status IN ('PENDING', 'RETRYING') OR (status = 'IN_PROGRESS' AND (lease_expires_at IS NULL OR lease_expires_at < datetime('now') OR lease_owner = $1)))`,
        [workerId, leaseSeconds, jobId]
      );
      return (result as any).rowCount > 0;
    }
  }

  /**
   * Heartbeat to extend active lease while performing long-running stages (e.g. multi-page OCR)
   */
  public static async heartbeat(
    jobId: string,
    workerId: string,
    leaseSeconds = this.DEFAULT_LEASE_SECONDS
  ): Promise<boolean> {
    const isMysql = this.isMySql();

    if (isMysql) {
      const result = await db.query(
        `UPDATE book_ingestion_jobs
         SET lease_expires_at = DATE_ADD(NOW(), INTERVAL $1 SECOND),
             updated_at = NOW()
         WHERE id = $2 AND lease_owner = $3 AND status = 'IN_PROGRESS'`,
        [leaseSeconds, jobId, workerId]
      );
      return (result as any).rowCount > 0 || (result as any).affectedRows > 0;
    } else {
      const result = await db.query(
        `UPDATE book_ingestion_jobs
         SET lease_expires_at = datetime('now', '+' || $1 || ' seconds'),
             updated_at = datetime('now')
         WHERE id = $2 AND lease_owner = $3 AND status = 'IN_PROGRESS'`,
        [leaseSeconds, jobId, workerId]
      );
      return (result as any).rowCount > 0;
    }
  }

  /**
   * Persist verified stage output into durable checkpoints.
   * If a restart occurs, the job will resume from this checkpoint rather than repeating completed work.
   */
  public static async saveCheckpoint(
    jobId: string,
    workerId: string,
    nextStage: IngestionJobStage,
    checkpointUpdate: any
  ): Promise<void> {
    // Read current checkpoint to merge incrementally
    const current = await this.getJobById(jobId);
    const merged = { ...(current?.checkpointData || {}), ...checkpointUpdate };
    const jsonStr = JSON.stringify(merged);

    const isMysql = this.isMySql();
    const nowExpr = isMysql ? 'NOW()' : "datetime('now')";

    await db.query(
      `UPDATE book_ingestion_jobs
       SET current_stage = $1,
           checkpoint_data = $2,
           lease_owner = $4,
           last_error = NULL,
           updated_at = ${nowExpr}
       WHERE id = $3 AND (lease_owner = $4 OR lease_owner IS NULL)`,
      [nextStage, jsonStr, jobId, workerId]
    );
  }

  /**
   * Mark job as successfully completed
   */
  public static async markCompleted(
    jobId: string,
    workerId: string,
    finalReport: any
  ): Promise<void> {
    const isMysql = this.isMySql();
    const nowExpr = isMysql ? 'NOW()' : "datetime('now')";

    await db.query(
      `UPDATE book_ingestion_jobs
       SET current_stage = 'COMPLETED',
           status = 'COMPLETED',
           lease_owner = NULL,
           lease_expires_at = NULL,
           checkpoint_data = $1,
           last_error = NULL,
           updated_at = ${nowExpr}
       WHERE id = $2`,
      [JSON.stringify(finalReport), jobId]
    );
  }

  /**
   * Mark job as failed, with bounded retry scheduling if recoverable
   */
  public static async markFailed(
    jobId: string,
    workerId: string,
    errorMsg: string,
    isRecoverable = true
  ): Promise<{ willRetry: boolean; nextStatus: IngestionJobStatus }> {
    const job = await this.getJobById(jobId);
    const attempts = (job?.attemptCount || 1);
    const maxAttempts = (job?.maxAttempts || this.MAX_ATTEMPTS);

    const willRetry = isRecoverable && attempts < maxAttempts;
    const nextStatus: IngestionJobStatus = willRetry ? 'RETRYING' : 'FAILED';
    const finalStage: IngestionJobStage = willRetry ? (job?.currentStage || 'UPLOADED') : 'FAILED';

    const isMysql = this.isMySql();
    const nowExpr = isMysql ? 'NOW()' : "datetime('now')";

    await db.query(
      `UPDATE book_ingestion_jobs
       SET status = $1,
           current_stage = $2,
           lease_owner = NULL,
           lease_expires_at = NULL,
           last_error = $3,
           updated_at = ${nowExpr}
       WHERE id = $4`,
      [nextStatus, finalStage, errorMsg, jobId]
    );

    return { willRetry, nextStatus };
  }

  /**
   * Scan for expired leases or pending jobs that stalled due to worker crashes or redeployments,
   * and return them for resumption.
   */
  public static async recoverStalledJobs(limit = 5): Promise<IngestionJobRecord[]> {
    const isMysql = this.isMySql();

    const whereClause = isMysql
      ? `(status = 'RETRYING' OR (status = 'IN_PROGRESS' AND lease_expires_at < NOW())) AND attempt_count < max_attempts`
      : `(status = 'RETRYING' OR (status = 'IN_PROGRESS' AND (lease_expires_at IS NULL OR lease_expires_at < datetime('now')))) AND attempt_count < max_attempts`;

    const res = await db.query(
      `SELECT id, book_id, file_checksum, current_stage, status, attempt_count,
              max_attempts, lease_owner, lease_expires_at, checkpoint_data, last_error,
              created_at, updated_at
       FROM book_ingestion_jobs
       WHERE ${whereClause}
       ORDER BY updated_at ASC
       LIMIT $1`,
      [limit]
    );

    return res.rows.map(r => this.mapRow(r));
  }

  /**
   * Get job by ID
   */
  public static async getJobById(jobId: string): Promise<IngestionJobRecord | null> {
    const res = await db.query(
      `SELECT id, book_id, file_checksum, current_stage, status, attempt_count,
              max_attempts, lease_owner, lease_expires_at, checkpoint_data, last_error,
              created_at, updated_at
       FROM book_ingestion_jobs
       WHERE id = $1`,
      [jobId]
    );
    return res.rows.length > 0 ? this.mapRow(res.rows[0]) : null;
  }

  /**
   * Get latest job for a book ID
   */
  public static async getJobByBookId(bookId: string): Promise<IngestionJobRecord | null> {
    const res = await db.query(
      `SELECT id, book_id, file_checksum, current_stage, status, attempt_count,
              max_attempts, lease_owner, lease_expires_at, checkpoint_data, last_error,
              created_at, updated_at
       FROM book_ingestion_jobs
       WHERE book_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [bookId]
    );
    return res.rows.length > 0 ? this.mapRow(res.rows[0]) : null;
  }

  /**
   * Resumes and executes a stalled or retrying ingestion job.
   * Atomically acquires the CAS lease, fetches raw PDF chunks from book_pdf_chunks,
   * reconstructs the buffer, and re-executes the ingestion pipeline idempotently.
   */
  public static async executeJobResumption(jobId: string): Promise<{ success: boolean; stage?: string; error?: string }> {
    const job = await this.getJobById(jobId);
    if (!job) return { success: false, error: 'Job not found' };

    const workerId = `worker_resume_${uuidv4().slice(0, 8)}`;
    const claimed = await this.claimJob(jobId, workerId, 120);
    if (!claimed) {
      return { success: false, error: 'Could not claim job: lease currently held by another worker' };
    }

    try {
      // 1. Fetch raw PDF buffer from canonical book_pdf_chunks
      const chunkRows = await db.query(
        `SELECT chunk_data FROM book_pdf_chunks WHERE book_id = $1 ORDER BY chunk_index ASC`,
        [job.bookId]
      );
      if (chunkRows.rows.length === 0) {
        await this.markFailed(jobId, workerId, 'Cannot resume: raw PDF chunks not found in storage', false);
        return { success: false, error: 'Raw PDF chunks missing in book_pdf_chunks' };
      }

      const buffers = chunkRows.rows.map((r: any) => Buffer.isBuffer(r.chunk_data) ? r.chunk_data : Buffer.from(r.chunk_data));
      const fullPdfBuffer = Buffer.concat(buffers);

      // 2. Fetch book metadata
      const bookRows = await db.query(
        `SELECT title_ar, title_en, academic_stage_id, grade_id, subject_id, school_type, term, teacher_id
         FROM books WHERE id = $1`,
        [job.bookId]
      );
      const bookData = bookRows.rows[0] || {};

      // 3. Dynamic import BookIngestionService to avoid circular dependency
      const { BookIngestionService } = await import('../bookIngestionService.js');
      const report = await BookIngestionService.ingestTextbook({
        bookId: job.bookId,
        pdfBuffer: fullPdfBuffer,
        titleAr: bookData.title_ar || 'كتاب مدرسي مستأنف',
        titleEn: bookData.title_en || 'Resumed Textbook',
        academicStageId: bookData.academic_stage_id,
        gradeId: bookData.grade_id,
        subjectId: bookData.subject_id,
        schoolType: bookData.school_type || 'كلاهما',
        term: bookData.term || 1,
        teacherId: bookData.teacher_id,
        options: { forceReingest: true }
      });

      return {
        success: report.status === 'VERIFIED_READY',
        stage: report.status
      };
    } catch (err: any) {
      await this.markFailed(jobId, workerId, `Resumption error: ${err.message}`, true).catch(() => {});
      return { success: false, error: err.message };
    }
  }

  private static mapRow(row: any): IngestionJobRecord {
    let checkpoint: any = {};
    if (row.checkpoint_data) {
      try {
        checkpoint = typeof row.checkpoint_data === 'string'
          ? JSON.parse(row.checkpoint_data)
          : row.checkpoint_data;
      } catch (_) {}
    }

    return {
      id: row.id,
      bookId: row.book_id,
      fileChecksum: row.file_checksum,
      currentStage: row.current_stage,
      status: row.status,
      attemptCount: Number(row.attempt_count || 0),
      maxAttempts: Number(row.max_attempts || this.MAX_ATTEMPTS),
      leaseOwner: row.lease_owner || null,
      leaseExpiresAt: row.lease_expires_at ? new Date(row.lease_expires_at) : null,
      checkpointData: checkpoint,
      lastError: row.last_error || null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}
