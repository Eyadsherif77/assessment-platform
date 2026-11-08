import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { workerConfig } from './config.js';
import { WorkerGatewayClient } from './workerGatewayClient.js';
import { BookIngestionService } from '../../../server/src/services/bookIngestionService.js';
import { DurableIngestionJobService } from '../../../server/src/services/jobs/durableIngestionJobService.js';
import { db } from '../../../server/src/db/db.js';

export interface LocalIngestionJobRequest {
  bookId?: string;
  titleAr: string;
  titleEn?: string;
  academicStageId: string;
  gradeId: string;
  subjectId: string;
  term: number;
  schoolType: string;
  pdfFilePath: string;
  pdfBuffer?: Buffer;
  fileName?: string;
  ocrProvider?: (pageNumber: number, buffer: Buffer) => Promise<string>;
  gatewayClient?: WorkerGatewayClient;
  sessionToken?: string;
}

export interface IngestionTaskStatus {
  jobId: string;
  bookId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'REQUIRES_REMEDIATION' | 'CANCELLED';
  currentStage: string;
  progress: number;
  processedPages: number;
  totalPages: number;
  lastError?: string;
  startedAt: number;
  updatedAt: number;
}

const activeTasks = new Map<string, IngestionTaskStatus>();

export class LocalIngestionRunner {
  private static workerInstanceId = `windows_worker_${osHostnameSafe()}_${process.pid}`;

  /**
   * Get real-time status of a running or completed local ingestion task
   */
  public static getTaskStatus(jobId: string): IngestionTaskStatus | undefined {
    return activeTasks.get(jobId);
  }

  /**
   * Get active or latest task status for a given book
   */
  public static getTaskByBookId(bookId: string): IngestionTaskStatus | undefined {
    for (const task of activeTasks.values()) {
      if (task.bookId === bookId) {
        return task;
      }
    }
    return undefined;
  }

  /**
   * Cancel an active task (Idempotent: safe to call repeatedly)
   */
  public static cancelTask(jobId: string): boolean {
    const task = activeTasks.get(jobId);
    if (task) {
      task.status = 'CANCELLED';
      task.lastError = 'Cancelled by administrator.';
      task.currentStage = 'CANCELLED';
      task.updatedAt = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Start or resume textbook ingestion from an authenticated cloud session.
   * Downloads raw PDF from gateway if not present in local storage.
   */
  public static async startSessionIngestion(params: {
    bookId: string;
    jobId: string;
    sessionToken: string;
    generationId: string;
    gatewayBaseUrl?: string;
    titleAr?: string;
    titleEn?: string;
    academicStageId?: string;
    gradeId?: string;
    subjectId?: string;
    term?: number;
    schoolType?: string;
    ocrProvider?: (pageNumber: number, buffer: Buffer) => Promise<string>;
  }): Promise<{ jobId: string; status: string }> {
    const {
      bookId,
      sessionToken,
      gatewayBaseUrl,
      ocrProvider
    } = params;

    const gatewayClient = new WorkerGatewayClient({
      gatewayBaseUrl: gatewayBaseUrl || workerConfig.gatewayBaseUrl,
      sessionToken
    });

    // 0. Pre-flight check: Refuse to start if session is already revoked or expired
    const preCheck = await gatewayClient.checkSessionStatus();
    if (preCheck.isRevoked) {
      throw new Error('Cannot start ingestion: Cloud session has already been revoked by administrator.');
    }
    if (preCheck.isExpired) {
      throw new Error('Cannot start ingestion: Cloud session has expired.');
    }

    const archivePath = path.join(workerConfig.localStorageDir, `${bookId}.pdf`);
    let pdfBuffer: Buffer;

    if (fs.existsSync(archivePath)) {
      pdfBuffer = fs.readFileSync(archivePath);
      console.log(`📂 [Local Storage] Using existing local archive PDF for book ${bookId} (${pdfBuffer.length} bytes).`);
    } else {
      console.log(`⬇️ [Cloud Storage] Local archive PDF not found for book ${bookId}. Downloading from Cloud Gateway...`);
      pdfBuffer = await gatewayClient.downloadRawPdf();
      try {
        fs.writeFileSync(archivePath, pdfBuffer);
        console.log(`💾 [Local Storage] Saved downloaded PDF to ${archivePath}`);
      } catch (saveErr: any) {
        console.warn(`⚠️ [Local Storage] Could not cache PDF to ${archivePath}: ${saveErr.message}`);
      }
    }

    const taskJobId = params.jobId || `job_local_${bookId.slice(0, 8)}`;

    // Launch ingestion asynchronously
    const taskPromise = this.executeIngestion({
      bookId,
      titleAr: params.titleAr || `كتاب منهج ${bookId.slice(0, 6)}`,
      titleEn: params.titleEn || `Book ${bookId.slice(0, 6)}`,
      academicStageId: params.academicStageId || 'default_stage',
      gradeId: params.gradeId || 'default_grade',
      subjectId: params.subjectId || 'default_subject',
      term: params.term || 1,
      schoolType: params.schoolType || 'كلاهما',
      pdfFilePath: archivePath,
      pdfBuffer,
      gatewayClient,
      ocrProvider
    });

    taskPromise.catch(err => {
      console.error(`🚨 [Local Worker] Session ingestion failed for book ${bookId}:`, err.message);
    });

    return {
      jobId: taskJobId,
      status: 'IN_PROGRESS'
    };
  }

  /**
   * List all tracked local tasks
   */
  public static listTasks(): IngestionTaskStatus[] {
    return Array.from(activeTasks.values());
  }

  /**
   * Execute or resume textbook ingestion using the shared engine
   */
  public static async executeIngestion(params: LocalIngestionJobRequest): Promise<any> {
    const {
      titleAr,
      titleEn,
      academicStageId,
      gradeId,
      subjectId,
      term = 1,
      schoolType = 'كلاهما',
      pdfFilePath,
      ocrProvider,
      fileName = path.basename(pdfFilePath)
    } = params;

    // 1. Read and validate local PDF buffer
    let pdfBuffer: Buffer;
    if (params.pdfBuffer) {
      pdfBuffer = params.pdfBuffer;
    } else {
      if (!fs.existsSync(pdfFilePath)) {
        throw new Error(`Textbook PDF file not found at: ${pdfFilePath}`);
      }
      pdfBuffer = fs.readFileSync(pdfFilePath);
    }

    if (pdfBuffer.length < 10) {
      throw new Error('PDF file is empty or corrupted.');
    }

    // PDF Magic Bytes Check: %PDF-
    const header = pdfBuffer.subarray(0, 5).toString('ascii');
    if (!header.startsWith('%PDF')) {
      throw new Error(`Invalid PDF file format. Expected %PDF header, received: ${header}`);
    }

    // 2. Compute stable checksum & bookId
    const fileChecksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    const bookId = params.bookId || uuidv4();

    // 3. Save local archive copy
    const archivePath = path.join(workerConfig.localStorageDir, `${bookId}.pdf`);
    if (!fs.existsSync(archivePath) && pdfFilePath !== archivePath) {
      try {
        fs.writeFileSync(archivePath, pdfBuffer);
        console.log(`💾 [Local Storage] Archived original PDF at: ${archivePath}`);
      } catch (saveErr: any) {
        console.warn(`⚠️ [Local Storage] Notice: could not write archive copy to ${archivePath}: ${saveErr.message}`);
      }
    }

    // 4. Initialize Gateway Client (if session provided or configured)
    const gatewayClient = params.gatewayClient || (params.sessionToken ? new WorkerGatewayClient({ sessionToken: params.sessionToken }) : null);

    // 5. Track local task in memory
    const jobId = `job_local_${bookId.slice(0, 8)}`;
    const taskState: IngestionTaskStatus = {
      jobId,
      bookId,
      status: 'IN_PROGRESS',
      currentStage: 'INITIALIZING',
      progress: 10,
      processedPages: 0,
      totalPages: 0,
      startedAt: Date.now(),
      updatedAt: Date.now()
    };
    activeTasks.set(jobId, taskState);

    // 6. Ensure canonical raw PDF chunks are uploaded via Gateway
    if (gatewayClient) {
      const initCheck = await gatewayClient.checkSessionStatus();
      if (initCheck.isRevoked) {
        taskState.status = 'CANCELLED';
        taskState.lastError = 'Ingestion aborted: Cloud session was revoked before PDF upload.';
        taskState.currentStage = 'REVOKED';
        taskState.updatedAt = Date.now();
        return taskState;
      }
      if (initCheck.isExpired) {
        taskState.status = 'FAILED';
        taskState.lastError = 'Ingestion aborted: Cloud session expired.';
        taskState.currentStage = 'EXPIRED';
        taskState.updatedAt = Date.now();
        return taskState;
      }
      await this.uploadPdfChunksViaGateway(gatewayClient, pdfBuffer, fileChecksum, taskState);
    }

    // 7. Execute ingestion loop across bounded batches until 100% complete
    let isFinished = false;
    let finalReport: any = null;

    try {
      while (!isFinished) {
        // A. Check local cancellation
        if (taskState.status === 'CANCELLED' || taskState.status === 'FAILED') {
          console.warn(`🛑 [Local Worker] Aborting execution loop: Task is ${taskState.status}.`);
          break;
        }

        // B. Check remote cloud session validity before each OCR batch
        if (gatewayClient) {
          const cloudCheck = await gatewayClient.checkSessionStatus();
          if (cloudCheck.isRevoked) {
            console.warn(`🛑 [Local Worker] Cloud session REVOCATION detected before batch. Halting local processing immediately.`);
            taskState.status = 'CANCELLED';
            taskState.lastError = 'Ingestion stopped: Cloud session has been revoked by administrator.';
            taskState.currentStage = 'REVOKED';
            taskState.updatedAt = Date.now();
            break;
          }
          if (cloudCheck.isExpired) {
            console.warn(`⏳ [Local Worker] Cloud session EXPIRED before batch. Halting local processing.`);
            taskState.status = 'FAILED';
            taskState.lastError = 'Ingestion stopped: Cloud session expired.';
            taskState.currentStage = 'EXPIRED';
            taskState.updatedAt = Date.now();
            break;
          }
          if (cloudCheck.isNetworkError) {
            console.warn(`⚠️ [Local Worker] Cloud session check encountered network blip (${cloudCheck.error}). Preserving checkpoints and continuing safely.`);
          }
        }

        console.log(`🚀 [Local Worker] Executing ingestion step for book "${titleAr}"...`);

        finalReport = await BookIngestionService.ingestTextbook({
          bookId,
          pdfBuffer,
          fileName,
          titleAr,
          titleEn,
          academicStageId,
          gradeId,
          subjectId,
          schoolType,
          term,
          options: {
            ocrProvider,
            forceReingest: true
          }
        });

        taskState.status = finalReport.status === 'VERIFIED_READY' ? 'COMPLETED' : (finalReport.status as any);
        taskState.totalPages = finalReport.totalPages;
        taskState.updatedAt = Date.now();

        if (finalReport.status === 'VERIFIED_READY') {
          console.log(`✅ [Local Worker] Ingestion successful for "${titleAr}". Book activated and VERIFIED_READY.`);
          isFinished = true;
          taskState.progress = 100;
          taskState.currentStage = 'COMPLETED';

          // Sync completion to cloud gateway if active
          if (gatewayClient) {
            console.log(`☁️ [Cloud Gateway Sync] Streaming extracted artifacts to Cloud Gateway...`);
            const sourceBookId = finalReport.bookId || bookId;

            // 1. Sync Pages
            try {
              const pagesRes = await db.query(
                'SELECT page_number, raw_text, char_count FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC',
                [sourceBookId]
              );
              if (pagesRes.rows.length > 0) {
                const pagesPayload = pagesRes.rows.map((r: any) => ({
                  pageNumber: Number(r.page_number),
                  text: String(r.raw_text || ''),
                  charCount: Number(r.char_count || 0),
                  pageType: 'CONTENT'
                }));
                await gatewayClient.syncPages(pagesPayload);
                console.log(`✅ [Cloud Gateway Sync] Synced ${pagesPayload.length} pages to Cloud Gateway.`);
              }
            } catch (pErr: any) {
              console.warn('⚠️ [Cloud Gateway Sync] Pages sync warning:', pErr.message);
            }

            // 2. Sync Chapters
            try {
              const chaptersRes = await db.query(
                'SELECT chapter_number, title_ar, title_en, start_page, end_page FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC',
                [sourceBookId]
              );
              if (chaptersRes.rows.length > 0) {
                const chaptersPayload = chaptersRes.rows.map((r: any) => ({
                  chapterNumber: Number(r.chapter_number),
                  titleAr: String(r.title_ar || ''),
                  titleEn: String(r.title_en || ''),
                  startPage: Number(r.start_page || 1),
                  endPage: Number(r.end_page || 1)
                }));
                await gatewayClient.syncChapters(chaptersPayload);
                console.log(`✅ [Cloud Gateway Sync] Synced ${chaptersPayload.length} chapters to Cloud Gateway.`);
              }
            } catch (cErr: any) {
              console.warn('⚠️ [Cloud Gateway Sync] Chapters sync warning:', cErr.message);
            }

            // 3. Sync Semantic Chunks
            try {
              const chunksRes = await db.query(
                'SELECT id, chapter_id, page_number, content, embedding, embedding_model, embedding_version FROM book_chunks WHERE book_id = $1 ORDER BY page_number ASC',
                [sourceBookId]
              );
              if (chunksRes.rows.length > 0) {
                const chunksPayload = chunksRes.rows.map((r: any, idx: number) => ({
                  chunkIndex: idx,
                  pageNumber: Number(r.page_number || 1),
                  content: String(r.content || ''),
                  chapterId: r.chapter_id || undefined,
                  embedding: r.embedding ? (typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding) : undefined,
                  embeddingModel: r.embedding_model || 'semantic-hash-768',
                  embeddingVersion: r.embedding_version || '1.0'
                }));
                await gatewayClient.syncSemanticChunks(chunksPayload);
                console.log(`✅ [Cloud Gateway Sync] Synced ${chunksPayload.length} semantic chunks to Cloud Gateway.`);
              }
            } catch (chunkErr: any) {
              console.warn('⚠️ [Cloud Gateway Sync] Chunks sync warning:', chunkErr.message);
            }

            // 4. Complete session on Cloud Gateway
            await gatewayClient.complete({
              totalPages: finalReport.totalPages,
              totalChunks: finalReport.totalChunks || 10,
              unitsCount: finalReport.units?.length || 1
            }).catch(e => {
              if (e.message.includes('revoked') || e.message.includes('403')) {
                taskState.status = 'CANCELLED';
                taskState.lastError = 'Gateway completion rejected: session was revoked.';
              } else {
                console.warn('Gateway completion notice:', e.message);
              }
            });
          }
          break;
        } else if (finalReport.status === 'PROCESSING') {
          // Bounded batch completed; continue locally
          console.log(`🔄 [Local Worker] Batch completed. Proceeding to next batch locally...`);
          taskState.currentStage = 'OCR_PROCESSING';
          taskState.progress = Math.min(90, (taskState.progress || 20) + 15);

          if (gatewayClient) {
            await gatewayClient.syncProgress({
              stage: 'OCR_PROCESSING',
              processedPages: finalReport.processedPages || 20,
              totalPages: finalReport.totalPages || 112
            }).catch(e => {
              if (e.message.includes('revoked') || e.message.includes('403')) {
                taskState.status = 'CANCELLED';
                taskState.lastError = 'Gateway progress rejected: session was revoked.';
                isFinished = true;
              }
            });
            if (taskState.status === 'CANCELLED') {
              break;
            }
          }

          // 500ms pacing delay between batches
          await new Promise(r => setTimeout(r, 500));
        } else {
          // BLOCKED or REQUIRES_REMEDIATION
          console.warn(`⚠️ [Local Worker] Ingestion paused with status ${finalReport.status}.`);
          taskState.status = finalReport.status as any;
          taskState.lastError = finalReport.issues?.map((i: any) => i.message).join('; ');
          isFinished = true;
          break;
        }
      }

      return finalReport || taskState;
    } catch (err: any) {
      if (err.message.includes('revoked') || err.message.includes('403')) {
        taskState.status = 'CANCELLED';
        taskState.lastError = 'Session revoked by administrator.';
        taskState.updatedAt = Date.now();
        return taskState;
      }
      console.error(`❌ [Local Worker] Ingestion error:`, err.message);
      taskState.status = 'FAILED';
      taskState.lastError = err.message;
      taskState.updatedAt = Date.now();
      throw err;
    }
  }

  /**
   * Splits raw PDF into 1MB chunks and streams through Cloud Gateway (ZERO direct DB access)
   */
  private static async uploadPdfChunksViaGateway(
    gatewayClient: WorkerGatewayClient,
    fullPdfBuffer: Buffer,
    checksum: string,
    taskState?: IngestionTaskStatus
  ): Promise<void> {
    console.log(`☁️ [Cloud Storage Sync] Uploading raw PDF chunks via Cloud Gateway...`);
    const CHUNK_SIZE = 1024 * 1024; // 1 MB chunks
    const totalChunks = Math.ceil(fullPdfBuffer.length / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      if (taskState && (taskState.status === 'CANCELLED' || taskState.status === 'FAILED')) {
        console.warn(`🛑 [Cloud Storage Sync] Chunk upload aborted: task is ${taskState.status}.`);
        return;
      }
      const slice = fullPdfBuffer.subarray(i * CHUNK_SIZE, Math.min(fullPdfBuffer.length, (i + 1) * CHUNK_SIZE));
      await gatewayClient.syncPdfChunk({
        chunkIndex: i,
        totalChunks,
        chunkBuffer: slice,
        fileSizeBytes: fullPdfBuffer.length,
        checksum
      });
    }
    console.log(`✅ [Cloud Storage Sync] Streamed ${totalChunks} raw PDF chunks through Cloud Gateway.`);
  }
}

function osHostnameSafe(): string {
  try {
    return process.env.COMPUTERNAME || 'pc';
  } catch (_) {
    return 'node';
  }
}
