import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { db } from '../../db/db.js';

export interface StorageMetadata {
  key: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
  sha256: string;
  durable: boolean;
  storageType: 'local-fs' | 'ephemeral-serverless' | 'cloud-blob' | 'database-chunks';
  isPrivate?: boolean;
}

export class StorageConfigurationError extends Error {
  public readonly code = 'STORAGE_CONFIGURATION_MISSING';
  constructor(message: string) {
    super(message);
    this.name = 'StorageConfigurationError';
  }
}

export class StorageIntegrityError extends Error {
  public readonly code = 'STORAGE_INTEGRITY_MISMATCH';
  constructor(message: string) {
    super(message);
    this.name = 'StorageIntegrityError';
  }
}

export function normalizeStorageKey(rawKey: string): string {
  return rawKey
    .replace(/\\/g, '/')
    .replace(/\.\./g, '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .trim();
}

export function extractBookIdFromKey(rawKey: string): string {
  const clean = normalizeStorageKey(rawKey);
  const uuidMatch = clean.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuidMatch) return uuidMatch[0];
  const parts = clean.split('/');
  return parts[parts.length - 1].replace(/\.[^/.]+$/, '').replace(/^book_/, '');
}

export interface IStorageProvider {
  saveFile(key: string, buffer: Buffer, mimeType: string, options?: { isPrivate?: boolean }): Promise<StorageMetadata>;
  getFile(key: string, expectedSha256?: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  deleteFile(key: string): Promise<boolean>;
  getUrl(key: string): string;
  isDurable(): boolean;
  getStorageType(): 'local-fs' | 'ephemeral-serverless' | 'cloud-blob' | 'database-chunks';
  getAbsolutePath?(key: string): string;
}

export class LocalStorageProvider implements IStorageProvider {
  private baseDir: string;
  private isServerless: boolean;

  constructor() {
    this.isServerless = !!process.env.VERCEL;
    if (this.isServerless) {
      this.baseDir = path.resolve('/tmp/uploads');
    } else {
      this.baseDir = path.resolve(__dirname, '../../../../uploads');
    }
    this.ensureBaseDir();
  }

  private ensureBaseDir(): void {
    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true });
      }
    } catch (err: any) {
      console.warn('⚠️ [StorageProvider] Warning creating base storage directory:', err.message);
    }
  }

  public getAbsolutePath(key: string): string {
    const cleanKey = normalizeStorageKey(key);
    return path.join(this.baseDir, cleanKey);
  }

  public isDurable(): boolean {
    // In serverless environments, local filesystem is strictly ephemeral
    return !this.isServerless;
  }

  public getStorageType(): 'local-fs' | 'ephemeral-serverless' | 'cloud-blob' {
    return this.isServerless ? 'ephemeral-serverless' : 'local-fs';
  }

  public getUrl(key: string): string {
    const cleanKey = normalizeStorageKey(key);
    return `/uploads/${cleanKey}`;
  }

  public async saveFile(
    key: string,
    buffer: Buffer,
    mimeType: string,
    options?: { isPrivate?: boolean }
  ): Promise<StorageMetadata> {
    const cleanKey = normalizeStorageKey(key);
    const targetPath = this.getAbsolutePath(cleanKey);
    const parentDir = path.dirname(targetPath);

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(targetPath, buffer);

    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    return {
      key: cleanKey,
      url: this.getUrl(cleanKey),
      sizeBytes: buffer.length,
      mimeType,
      sha256: hash,
      durable: this.isDurable(),
      storageType: this.getStorageType(),
      isPrivate: options?.isPrivate || false
    };
  }

  public async getFile(key: string, expectedSha256?: string): Promise<Buffer> {
    const cleanKey = normalizeStorageKey(key);
    const targetPath = this.getAbsolutePath(cleanKey);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`STORAGE_FILE_NOT_FOUND: Asset key "${cleanKey}" not found at ${targetPath}`);
    }
    const buf = fs.readFileSync(targetPath);

    if (expectedSha256) {
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      if (hash !== expectedSha256) {
        throw new StorageIntegrityError(
          `STORAGE_INTEGRITY_MISMATCH: SHA-256 for key "${cleanKey}" (${hash}) does not match expected checksum (${expectedSha256})`
        );
      }
    }

    return buf;
  }

  public async exists(key: string): Promise<boolean> {
    const cleanKey = normalizeStorageKey(key);
    const targetPath = this.getAbsolutePath(cleanKey);
    return fs.existsSync(targetPath);
  }

  public async deleteFile(key: string): Promise<boolean> {
    const cleanKey = normalizeStorageKey(key);
    const targetPath = this.getAbsolutePath(cleanKey);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      return true;
    }
    return false;
  }
}

export interface BlobSdkClient {
  put(pathname: string, body: any, options: any): Promise<any>;
  del(url: string | string[], options?: any): Promise<any>;
  head(url: string, options?: any): Promise<any>;
  get?(url: string, options?: any): Promise<any>;
}

export class VercelBlobStorageProvider implements IStorageProvider {
  private token: string | undefined;
  private sdkClient: BlobSdkClient | null = null;
  private keyUrlMap = new Map<string, { url: string; sha256: string; size: number; isPrivate: boolean }>();

  constructor(options?: { token?: string; sdkClient?: BlobSdkClient }) {
    this.token = options?.token || process.env.BLOB_READ_WRITE_TOKEN;
    this.sdkClient = options?.sdkClient || null;
  }

  private async getClient(): Promise<BlobSdkClient> {
    if (this.sdkClient) return this.sdkClient;
    const blobModule = await import('@vercel/blob');
    return blobModule;
  }

  public assertConfigured(): void {
    if (!this.token && !this.sdkClient) {
      throw new StorageConfigurationError(
        'BLOB_CONFIGURATION_MISSING: Environment variable BLOB_READ_WRITE_TOKEN is required for durable cloud storage on Vercel. Ephemeral local storage fallback is strictly forbidden in production.'
      );
    }
  }

  public isDurable(): boolean {
    return true;
  }

  public getStorageType(): 'cloud-blob' {
    return 'cloud-blob';
  }

  public getUrl(key: string): string {
    const cleanKey = normalizeStorageKey(key);
    const cached = this.keyUrlMap.get(cleanKey);
    if (cached && !cached.isPrivate) {
      return cached.url;
    }
    // Protected API proxy endpoint so private/scoped Blob URLs are never directly exposed
    return `/api/books/storage/${encodeURIComponent(cleanKey)}`;
  }

  public async saveFile(
    key: string,
    buffer: Buffer,
    mimeType: string,
    options?: { isPrivate?: boolean }
  ): Promise<StorageMetadata> {
    this.assertConfigured();
    const cleanKey = normalizeStorageKey(key);
    const client = await this.getClient();
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const isPrivate = Boolean(options?.isPrivate);

    const blob = await client.put(cleanKey, buffer, {
      access: isPrivate ? 'private' : 'public',
      token: this.token,
      addRandomSuffix: false,
      contentType: mimeType
    });

    this.keyUrlMap.set(cleanKey, { url: blob.url, sha256: hash, size: buffer.length, isPrivate });

    return {
      key: cleanKey,
      url: isPrivate ? this.getUrl(cleanKey) : blob.url,
      sizeBytes: buffer.length,
      mimeType,
      sha256: hash,
      durable: true,
      storageType: 'cloud-blob',
      isPrivate
    };
  }

  public async getFile(key: string, expectedSha256?: string): Promise<Buffer> {
    this.assertConfigured();
    const cleanKey = normalizeStorageKey(key);
    const cached = this.keyUrlMap.get(cleanKey);
    const targetUrlOrPath = cached?.url || cleanKey;

    const client = await this.getClient();
    let retrievedBuffer: Buffer | null = null;

    if (client.get) {
      try {
        const resp = await client.get(targetUrlOrPath, {
          token: this.token,
          access: cached?.isPrivate ? 'private' : 'public'
        });
        if (resp) {
          if (Buffer.isBuffer(resp)) {
            retrievedBuffer = resp;
          } else if (typeof resp.arrayBuffer === 'function') {
            const ab = await resp.arrayBuffer();
            retrievedBuffer = Buffer.from(ab);
          } else if (resp.stream) {
            const chunks: Buffer[] = [];
            for await (const chunk of resp.stream) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            retrievedBuffer = Buffer.concat(chunks);
          }
        }
      } catch (err: any) {
        console.warn(`[VercelBlobStorageProvider] client.get notice: ${err.message}`);
      }
    }

    if (!retrievedBuffer && cached?.url) {
      const res = await fetch(cached.url);
      if (!res.ok) {
        throw new Error(
          `BLOB_FILE_NOT_FOUND: Failed to retrieve "${cleanKey}" from Blob store (${res.status} ${res.statusText})`
        );
      }
      const arrayBuf = await res.arrayBuffer();
      retrievedBuffer = Buffer.from(arrayBuf);
    }

    if (!retrievedBuffer) {
      throw new Error(`BLOB_FILE_NOT_FOUND: Asset key "${cleanKey}" not found in Blob registry`);
    }

    if (expectedSha256) {
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256').update(retrievedBuffer).digest('hex');
      if (hash !== expectedSha256) {
        throw new StorageIntegrityError(
          `STORAGE_INTEGRITY_MISMATCH: SHA-256 for key "${cleanKey}" (${hash}) does not match expected checksum (${expectedSha256})`
        );
      }
    }

    return retrievedBuffer;
  }

  public async exists(key: string): Promise<boolean> {
    this.assertConfigured();
    const cleanKey = normalizeStorageKey(key);
    const cached = this.keyUrlMap.get(cleanKey);
    if (cached) return true;

    try {
      const client = await this.getClient();
      const meta = await client.head(cleanKey, { token: this.token });
      return !!meta;
    } catch {
      return false;
    }
  }

  public async deleteFile(key: string): Promise<boolean> {
    this.assertConfigured();
    const cleanKey = normalizeStorageKey(key);
    const cached = this.keyUrlMap.get(cleanKey);
    const client = await this.getClient();

    try {
      await client.del(cached?.url || cleanKey, { token: this.token });
      this.keyUrlMap.delete(cleanKey);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Universal durable storage provider backed by TiDB Cloud / database `book_pdf_chunks`.
 * Guarantees zero external token dependencies, 100% durable persistence on serverless (Vercel),
 * binary chunk integrity, and fast HTTP Range chunk retrieval.
 */
export class DatabaseChunkStorageProvider implements IStorageProvider {
  private fallbackLocal: LocalStorageProvider;

  constructor() {
    this.fallbackLocal = new LocalStorageProvider();
  }

  public isDurable(): boolean {
    return true;
  }

  public getStorageType(): 'database-chunks' {
    return 'database-chunks';
  }

  public getUrl(key: string): string {
    const bookId = extractBookIdFromKey(key);
    return `/api/books/${bookId}/pdf`;
  }

  public async saveFile(
    key: string,
    buffer: Buffer,
    mimeType: string,
    options?: { isPrivate?: boolean }
  ): Promise<StorageMetadata> {
    const bookId = extractBookIdFromKey(key);
    const CHUNK_SIZE = 2 * 1024 * 1024;
    const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(buffer.length, (i + 1) * CHUNK_SIZE);
      const chunkSlice = buffer.slice(start, end);
      await db.query(
        `REPLACE INTO book_pdf_chunks (book_id, chunk_index, chunk_data) VALUES ($1, $2, $3)`,
        [bookId, i, chunkSlice]
      );
    }

    // Mirror to local disk if running in non-serverless dev
    if (!process.env.VERCEL) {
      await this.fallbackLocal.saveFile(key, buffer, mimeType, options).catch(() => {});
    }

    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    return {
      key: normalizeStorageKey(key),
      url: this.getUrl(key),
      sizeBytes: buffer.length,
      mimeType,
      sha256: hash,
      durable: true,
      storageType: 'database-chunks',
      isPrivate: options?.isPrivate || false
    };
  }

  public async getFile(key: string, expectedSha256?: string): Promise<Buffer> {
    const bookId = extractBookIdFromKey(key);
    const rowsRes = await db.query(
      `SELECT chunk_index, chunk_data FROM book_pdf_chunks WHERE book_id = $1 ORDER BY chunk_index ASC`,
      [bookId]
    );

    if (rowsRes.rows.length === 0) {
      // Fallback to local storage provider
      return await this.fallbackLocal.getFile(key, expectedSha256);
    }

    const buffers = rowsRes.rows.map((r: any) => {
      const raw = r.chunk_data;
      return Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    });
    const fullBuffer = Buffer.concat(buffers);

    if (expectedSha256) {
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256').update(fullBuffer).digest('hex');
      if (hash !== expectedSha256) {
        throw new StorageIntegrityError(
          `STORAGE_INTEGRITY_MISMATCH: SHA-256 for key "${key}" (${hash}) does not match expected checksum (${expectedSha256})`
        );
      }
    }

    return fullBuffer;
  }

  /**
   * Efficient range read: only queries and concatenates the specific 2MB chunks covering [start, end].
   */
  public async getFileRange(key: string, start: number, end: number): Promise<Buffer> {
    const bookId = extractBookIdFromKey(key);
    const CHUNK_SIZE = 2 * 1024 * 1024;
    const startChunk = Math.floor(start / CHUNK_SIZE);
    const endChunk = Math.floor(end / CHUNK_SIZE);

    const rowsRes = await db.query(
      `SELECT chunk_index, chunk_data FROM book_pdf_chunks 
       WHERE book_id = $1 AND chunk_index BETWEEN $2 AND $3 
       ORDER BY chunk_index ASC`,
      [bookId, startChunk, endChunk]
    );

    if (rowsRes.rows.length === 0) {
      const full = await this.fallbackLocal.getFile(key);
      return full.subarray(start, end + 1);
    }

    const buffers = rowsRes.rows.map((r: any) => {
      const raw = r.chunk_data;
      return Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    });
    const combined = Buffer.concat(buffers);
    const offsetInFirstChunk = start - (startChunk * CHUNK_SIZE);
    const requestedLength = end - start + 1;

    return combined.subarray(offsetInFirstChunk, offsetInFirstChunk + requestedLength);
  }

  public async exists(key: string): Promise<boolean> {
    const bookId = extractBookIdFromKey(key);
    try {
      const countRes = await db.query(
        `SELECT COUNT(*) as cnt FROM book_pdf_chunks WHERE book_id = $1`,
        [bookId]
      );
      const cnt = parseInt(countRes.rows[0]?.cnt || '0', 10);
      if (cnt > 0) return true;
    } catch (_) {}

    return await this.fallbackLocal.exists(key);
  }

  public async deleteFile(key: string): Promise<boolean> {
    const bookId = extractBookIdFromKey(key);
    try {
      await db.query(`DELETE FROM book_pdf_chunks WHERE book_id = $1`, [bookId]);
    } catch (_) {}
    await this.fallbackLocal.deleteFile(key).catch(() => {});
    return true;
  }
}

let activeStorageProvider: IStorageProvider | null = null;

export function getStorageProvider(): IStorageProvider {
  if (activeStorageProvider) {
    return activeStorageProvider;
  }

  const hasBlobToken = !!process.env.BLOB_READ_WRITE_TOKEN;
  const forceBlob = process.env.STORAGE_PROVIDER === 'vercel-blob';
  const forceDb = process.env.STORAGE_PROVIDER === 'database-chunks';

  if ((hasBlobToken || forceBlob) && !forceDb) {
    activeStorageProvider = new VercelBlobStorageProvider();
  } else {
    // Canonical durable storage provider: TiDB Cloud book_pdf_chunks
    activeStorageProvider = new DatabaseChunkStorageProvider();
  }

  return activeStorageProvider;
}

export function setStorageProvider(provider: IStorageProvider | null): void {
  activeStorageProvider = provider;
}
