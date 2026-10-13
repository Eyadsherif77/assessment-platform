import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StorageMetadata {
  key: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
  sha256: string;
  durable: boolean;
  storageType: 'local-fs' | 'ephemeral-serverless' | 'cloud-blob';
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

export interface IStorageProvider {
  saveFile(key: string, buffer: Buffer, mimeType: string, options?: { isPrivate?: boolean }): Promise<StorageMetadata>;
  getFile(key: string, expectedSha256?: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  deleteFile(key: string): Promise<boolean>;
  getUrl(key: string): string;
  isDurable(): boolean;
  getStorageType(): 'local-fs' | 'ephemeral-serverless' | 'cloud-blob';
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

let activeStorageProvider: IStorageProvider | null = null;

export function getStorageProvider(): IStorageProvider {
  if (activeStorageProvider) {
    return activeStorageProvider;
  }

  const isVercel = !!process.env.VERCEL || process.env.NODE_ENV === 'production';
  const hasBlobToken = !!process.env.BLOB_READ_WRITE_TOKEN;
  const forceBlob = process.env.STORAGE_PROVIDER === 'vercel-blob';

  if (hasBlobToken || forceBlob) {
    activeStorageProvider = new VercelBlobStorageProvider();
  } else if (isVercel) {
    // In production Vercel without token, initialize VercelBlobStorageProvider so it fails-closed upon storage calls
    // It NEVER silently falls back to LocalStorageProvider or /tmp/uploads
    activeStorageProvider = new VercelBlobStorageProvider();
  } else {
    // Local development
    activeStorageProvider = new LocalStorageProvider();
  }

  return activeStorageProvider;
}

export function setStorageProvider(provider: IStorageProvider | null): void {
  activeStorageProvider = provider;
}
