import crypto from 'crypto';
import { workerConfig } from './config.js';

export interface WorkerGatewayClientOptions {
  gatewayBaseUrl?: string;
  sessionToken: string;
}

export class WorkerGatewayClient {
  private gatewayBaseUrl: string;
  private sessionToken: string;
  private endpointSequences = new Map<string, number>();

  constructor(options: WorkerGatewayClientOptions) {
    this.gatewayBaseUrl = options.gatewayBaseUrl || workerConfig.gatewayBaseUrl;
    this.sessionToken = options.sessionToken;
  }

  private nextSequence(endpoint: string): number {
    const current = this.endpointSequences.get(endpoint) || 0;
    const next = current + 1;
    this.endpointSequences.set(endpoint, next);
    return next;
  }

  private async postJson(endpoint: string, payload: any, enforceOrder = true): Promise<any> {
    const seq = this.nextSequence(endpoint);
    const payloadStr = JSON.stringify(payload);
    const idempKey = `idemp_${endpoint}_seq${seq}_${crypto.randomBytes(8).toString('hex')}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.sessionToken}`,
      'X-Idempotency-Key': idempKey,
      'X-Batch-Sequence': String(seq)
    };

    const url = `${this.gatewayBaseUrl}/api/worker-sync/${endpoint}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: payloadStr
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`Cloud Gateway error (${res.status} on ${endpoint}): ${errBody.error || res.statusText}`);
    }

    return await res.json();
  }

  /**
   * 0. Check Session Status and Cloud Revocation State.
   * Handles network blips gracefully without false aborts.
   */
  public async checkSessionStatus(): Promise<{
    valid: boolean;
    isRevoked: boolean;
    isExpired: boolean;
    isNetworkError?: boolean;
    status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'NETWORK_ERROR' | 'ERROR';
    error?: string;
  }> {
    const url = `${this.gatewayBaseUrl}/api/worker-sync/session/status`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`
        }
      });

      if (res.status === 403) {
        return { valid: false, isRevoked: true, isExpired: false, status: 'REVOKED', error: 'Session has been revoked by administrator.' };
      }
      if (res.status === 401) {
        return { valid: false, isRevoked: false, isExpired: true, status: 'EXPIRED', error: 'Session has expired.' };
      }
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return { valid: false, isRevoked: false, isExpired: false, status: 'ERROR', error: errJson.error || res.statusText };
      }

      const body = await res.json();
      const revoked = Boolean(body.isRevoked);
      return {
        valid: !revoked,
        isRevoked: revoked,
        isExpired: false,
        status: revoked ? 'REVOKED' : 'ACTIVE'
      };
    } catch (netErr: any) {
      // Network interruption
      return {
        valid: true,
        isRevoked: false,
        isExpired: false,
        isNetworkError: true,
        status: 'NETWORK_ERROR',
        error: `Network error reaching gateway: ${netErr.message}`
      };
    }
  }

  /**
   * 1. Renew Session
   */
  public async renewSession(): Promise<{ success: boolean; expiresAt: number }> {
    const url = `${this.gatewayBaseUrl}/api/worker-sync/session/renew`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.sessionToken}`
      }
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`Failed to renew worker session: ${errBody.error || res.statusText}`);
    }

    return await res.json();
  }

  /**
   * 2. Revoke Session
   */
  public async revokeSession(): Promise<{ success: boolean }> {
    const url = `${this.gatewayBaseUrl}/api/worker-sync/session/revoke`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.sessionToken}`
      }
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`Failed to revoke session: ${errBody.error || res.statusText}`);
    }

    return await res.json();
  }

  /**
   * 3. Download canonical raw PDF from the Cloud Gateway
   */
  public async downloadRawPdf(): Promise<Buffer> {
    const url = `${this.gatewayBaseUrl}/api/worker-sync/raw-pdf`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.sessionToken}`
      }
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`Failed to download raw PDF from gateway: ${errBody.error || res.statusText}`);
    }

    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  /**
   * 4. Sync PDF Chunk
   */
  public async syncPdfChunk(params: {
    chunkIndex: number;
    totalChunks: number;
    chunkBuffer: Buffer;
    fileSizeBytes: number;
    checksum: string;
  }): Promise<{ success: boolean; chunkIndex: number; totalChunks: number }> {
    const base64Data = params.chunkBuffer.toString('base64');
    return await this.postJson('pdf-chunks', {
      chunk_index: params.chunkIndex,
      total_chunks: params.totalChunks,
      chunk_base64: base64Data,
      file_size_bytes: params.fileSizeBytes,
      checksum: params.checksum
    }, true);
  }

  /**
   * 5. Sync Pages (OCR Results)
   */
  public async syncPages(pages: { 
    pageNumber: number; 
    text: string; 
    charCount: number;
    pageType?: string;
    metadata?: any;
  }[]): Promise<{ success: boolean; savedPages: number }> {
    return await this.postJson('pages', { pages }, false);
  }

  /**
   * 6. Sync Chapters
   */
  public async syncChapters(chapters: { chapterNumber: number; titleAr: string; titleEn: string; startPage: number; endPage: number }[]): Promise<{ success: boolean; savedChapters: number }> {
    return await this.postJson('chapters', { chapters }, false);
  }

  /**
   * 7. Sync Semantic Chunks
   */
  public async syncSemanticChunks(chunks: {
    chunkIndex: number;
    pageNumber: number;
    content: string;
    chapterId?: string;
    metadata?: any;
    embedding?: number[];
    embeddingModel?: string;
    embeddingVersion?: string;
  }[]): Promise<{ success: boolean; savedChunks: number; generationId: string }> {
    return await this.postJson('semantic-chunks', { chunks }, false);
  }

  /**
   * 8. Sync Progress Checkpoint
   */
  public async syncProgress(params: {
    stage: string;
    processedPages: number;
    totalPages: number;
    checkpointData?: any;
  }): Promise<{ success: boolean }> {
    const url = `${this.gatewayBaseUrl}/api/worker-sync/progress`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.sessionToken}`
      },
      body: JSON.stringify({
        stage: params.stage,
        processed_pages: params.processedPages,
        total_pages: params.totalPages,
        checkpoint_data: params.checkpointData
      })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`Failed to sync progress to gateway: ${errBody.error || res.statusText}`);
    }

    return await res.json();
  }

  /**
   * 9. Finalize and Complete Generation
   */
  public async complete(params: {
    totalPages: number;
    totalChunks: number;
    unitsCount: number;
  }): Promise<{ success: boolean; status: string; activeGenerationId: string }> {
    const url = `${this.gatewayBaseUrl}/api/worker-sync/complete`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.sessionToken}`
      },
      body: JSON.stringify({
        total_pages: params.totalPages,
        total_chunks: params.totalChunks,
        units_count: params.unitsCount
      })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`Failed to complete ingestion: ${errBody.error || res.statusText}`);
    }

    return await res.json();
  }
}
