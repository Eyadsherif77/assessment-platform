import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { IngestionWorkerSessionService, WorkerSessionRecord } from '../services/jobs/ingestionWorkerSessionService.js';
import { DurableIngestionJobService } from '../services/jobs/durableIngestionJobService.js';

export interface WorkerSyncRequest extends Request {
  workerSession?: WorkerSessionRecord;
}

const router = Router();

/**
 * Authentication Middleware for Cloud Gateway:
 * Derives book and job scope exclusively from server-side session state.
 * Rejects expired, revoked, or invalid tokens.
 */
async function authenticateWorkerSession(req: WorkerSyncRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Worker authentication required: missing Bearer token.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const session = await IngestionWorkerSessionService.verifySession(token);
    req.workerSession = session;
    next();
  } catch (err: any) {
    if (err.message.includes('expired')) {
      return res.status(401).json({ error: err.message, code: 'SESSION_EXPIRED' });
    }
    if (err.message.includes('revoked')) {
      return res.status(403).json({ error: err.message, code: 'SESSION_REVOKED' });
    }
    return res.status(401).json({ error: `Unauthorized worker session: ${err.message}` });
  }
}

// Apply authentication to all worker sync endpoints
router.use(authenticateWorkerSession);

/**
 * Helper to validate idempotency and monotonic sequencing on batch endpoints
 */
async function guardBatch(
  req: WorkerSyncRequest,
  res: Response,
  endpoint: string,
  enforceOrder = true
): Promise<{ valid: boolean; batchSequence: number; idempotencyKey: string; payloadChecksum: string; cachedResponse?: any }> {
  const session = req.workerSession!;
  const seqHeader = req.headers['x-batch-sequence'];
  const idempHeader = req.headers['x-idempotency-key'] as string;

  if (!idempHeader) {
    res.status(400).json({ error: 'Missing required "X-Idempotency-Key" header.' });
    return { valid: false, batchSequence: 0, idempotencyKey: '', payloadChecksum: '' };
  }

  const batchSequence = parseInt(String(seqHeader || '0'), 10);
  const payloadStr = JSON.stringify(req.body || {});
  const payloadChecksum = crypto.createHash('sha256').update(payloadStr).digest('hex');

  const check = await IngestionWorkerSessionService.validateBatchExecution({
    session,
    endpoint,
    batchSequence,
    idempotencyKey: idempHeader,
    payloadChecksum,
    enforceStrictOrder: enforceOrder
  });

  if (!check.valid) {
    res.status(check.statusCode || 400).json({ error: check.error });
    return { valid: false, batchSequence, idempotencyKey: idempHeader, payloadChecksum };
  }

  if (check.isRetry) {
    res.status(200).json({ ...check.cachedResponse, isIdempotentRetry: true });
    return { valid: false, batchSequence, idempotencyKey: idempHeader, payloadChecksum, cachedResponse: check.cachedResponse };
  }

  return { valid: true, batchSequence, idempotencyKey: idempHeader, payloadChecksum };
}

/**
 * 0. GET /api/worker-sync/session/status
 * Lightweight status check allowing local worker to verify session validity
 * and detect cloud revocation before starting expensive OCR batches.
 */
router.get('/session/status', async (req: WorkerSyncRequest, res: Response) => {
  return res.json({
    valid: true,
    status: 'ACTIVE',
    sessionId: req.workerSession!.id,
    bookId: req.workerSession!.book_id,
    jobId: req.workerSession!.job_id,
    generationId: req.workerSession!.generation_id,
    isRevoked: Boolean(req.workerSession!.is_revoked),
    expiresAt: req.workerSession!.expires_at
  });
});

/**
 * 1. POST /api/worker-sync/session/renew
 */
router.post('/session/renew', async (req: WorkerSyncRequest, res: Response) => {
  const token = req.headers['authorization']!.split(' ')[1];
  try {
    const renewed = await IngestionWorkerSessionService.renewSession(token);
    return res.json(renewed);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * 2. POST /api/worker-sync/session/revoke
 */
router.post('/session/revoke', async (req: WorkerSyncRequest, res: Response) => {
  try {
    await IngestionWorkerSessionService.revokeSession(req.workerSession!.id);
    return res.json({ success: true, message: 'Session revoked successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 3. POST /api/worker-sync/pdf-chunks
 */
router.post('/pdf-chunks', async (req: WorkerSyncRequest, res: Response) => {
  const guard = await guardBatch(req, res, 'pdf-chunks', true);
  if (!guard.valid) return;

  const { chunk_index, total_chunks, chunk_base64, file_size_bytes, checksum } = req.body;
  if (chunk_index === undefined || !chunk_base64) {
    return res.status(400).json({ error: 'Missing chunk_index or chunk_base64 payload.' });
  }

  // Validate checksum against session
  if (checksum && checksum !== req.workerSession!.file_checksum) {
    return res.status(400).json({ error: `File checksum mismatch with session: expected ${req.workerSession!.file_checksum}` });
  }

  const chunkBuffer = Buffer.from(chunk_base64, 'base64');
  try {
    await IngestionWorkerSessionService.persistPdfChunk({
      session: req.workerSession!,
      chunkIndex: chunk_index,
      totalChunks: total_chunks,
      chunkData: chunkBuffer,
      fileSizeBytes: file_size_bytes,
      checksum
    });

    const responseData = { success: true, chunkIndex: chunk_index, totalChunks: total_chunks };
    await IngestionWorkerSessionService.recordBatchSuccess({
      sessionId: req.workerSession!.id,
      endpoint: 'pdf-chunks',
      batchSequence: guard.batchSequence,
      idempotencyKey: guard.idempotencyKey,
      payloadChecksum: guard.payloadChecksum,
      responseBody: responseData
    });

    return res.json(responseData);
  } catch (err: any) {
    if (err.message.includes('Sequence conflict') || err.message.includes('Conflicting duplicate')) {
      return res.status(409).json({ error: err.message, code: 'CONFLICT' });
    }
    return res.status(400).json({ error: err.message });
  }
});

/**
 * 4. POST /api/worker-sync/pages
 */
router.post('/pages', async (req: WorkerSyncRequest, res: Response) => {
  const guard = await guardBatch(req, res, 'pages', false);
  if (!guard.valid) return;

  const { pages } = req.body;
  if (!Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: 'Pages array required.' });
  }

  try {
    const savedCount = await IngestionWorkerSessionService.persistPages({
      session: req.workerSession!,
      pages
    });

    const responseData = { success: true, savedPages: savedCount };
    await IngestionWorkerSessionService.recordBatchSuccess({
      sessionId: req.workerSession!.id,
      endpoint: 'pages',
      batchSequence: guard.batchSequence,
      idempotencyKey: guard.idempotencyKey,
      payloadChecksum: guard.payloadChecksum,
      responseBody: responseData
    });

    return res.json(responseData);
  } catch (err: any) {
    if (err.message.includes('Sequence conflict') || err.message.includes('Conflicting duplicate')) {
      return res.status(409).json({ error: err.message, code: 'CONFLICT' });
    }
    return res.status(400).json({ error: err.message });
  }
});

/**
 * 5. POST /api/worker-sync/chapters
 */
router.post('/chapters', async (req: WorkerSyncRequest, res: Response) => {
  const guard = await guardBatch(req, res, 'chapters', false);
  if (!guard.valid) return;

  const { chapters } = req.body;
  if (!Array.isArray(chapters) || chapters.length === 0) {
    return res.status(400).json({ error: 'Chapters array required.' });
  }

  try {
    const savedCount = await IngestionWorkerSessionService.persistChapters({
      session: req.workerSession!,
      chapters
    });

    const responseData = { success: true, savedChapters: savedCount };
    await IngestionWorkerSessionService.recordBatchSuccess({
      sessionId: req.workerSession!.id,
      endpoint: 'chapters',
      batchSequence: guard.batchSequence,
      idempotencyKey: guard.idempotencyKey,
      payloadChecksum: guard.payloadChecksum,
      responseBody: responseData
    });

    return res.json(responseData);
  } catch (err: any) {
    if (err.message.includes('Sequence conflict') || err.message.includes('Conflicting duplicate')) {
      return res.status(409).json({ error: err.message, code: 'CONFLICT' });
    }
    return res.status(400).json({ error: err.message });
  }
});

/**
 * 6. POST /api/worker-sync/semantic-chunks
 */
router.post('/semantic-chunks', async (req: WorkerSyncRequest, res: Response) => {
  const guard = await guardBatch(req, res, 'semantic-chunks', false);
  if (!guard.valid) return;

  const { chunks } = req.body;
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return res.status(400).json({ error: 'Chunks array required.' });
  }

  try {
    const savedCount = await IngestionWorkerSessionService.persistSemanticChunks({
      session: req.workerSession!,
      chunks
    });

    const responseData = { success: true, savedChunks: savedCount, generationId: req.workerSession!.generation_id };
    await IngestionWorkerSessionService.recordBatchSuccess({
      sessionId: req.workerSession!.id,
      endpoint: 'semantic-chunks',
      batchSequence: guard.batchSequence,
      idempotencyKey: guard.idempotencyKey,
      payloadChecksum: guard.payloadChecksum,
      responseBody: responseData
    });

    return res.json(responseData);
  } catch (err: any) {
    if (err.message.includes('Sequence conflict') || err.message.includes('Conflicting duplicate')) {
      return res.status(409).json({ error: err.message, code: 'CONFLICT' });
    }
    return res.status(400).json({ error: err.message });
  }
});

/**
 * 7. POST /api/worker-sync/progress
 */
router.post('/progress', async (req: WorkerSyncRequest, res: Response) => {
  const { stage, processed_pages, total_pages, checkpoint_data } = req.body;
  try {
    await DurableIngestionJobService.saveCheckpoint(
      req.workerSession!.job_id,
      'local_worker',
      stage || 'OCR_PROCESSING',
      {
        processedPages: processed_pages,
        totalPages: total_pages,
        ...checkpoint_data
      }
    );
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 8. POST /api/worker-sync/complete
 */
router.post('/complete', async (req: WorkerSyncRequest, res: Response) => {
  const { total_pages, total_chunks, units_count } = req.body;
  try {
    const result = await IngestionWorkerSessionService.completeSession({
      session: req.workerSession!,
      totalPages: parseInt(String(total_pages || 0), 10),
      totalChunks: parseInt(String(total_chunks || 0), 10),
      unitsCount: parseInt(String(units_count || 0), 10)
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * 9. GET /api/worker-sync/raw-pdf
 * Allows authenticated worker to retrieve the raw PDF chunks stored on the cloud.
 */
router.get('/raw-pdf', async (req: WorkerSyncRequest, res: Response) => {
  try {
    const chunksRes = await IngestionWorkerSessionService.getRawPdfChunks(req.workerSession!.book_id);
    if (!chunksRes || chunksRes.length === 0) {
      return res.status(404).json({ error: 'No raw PDF chunks found for this book in cloud storage.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', chunksRes.length);
    res.setHeader('X-File-Checksum', req.workerSession!.file_checksum);
    return res.send(chunksRes);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve raw PDF: ' + err.message });
  }
});

export default router;

