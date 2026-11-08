import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WorkerKeyService {
  private static privateKeyPem: string | null = null;
  private static publicKeyPem: string | null = null;

  private static getKeysDir(): string {
    const keysDir = path.resolve(__dirname, '../../../keys');
    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }
    return keysDir;
  }

  private static getWorkerKeysDir(): string {
    const workerKeysDir = path.resolve(__dirname, '../../../../tools/local-ingestion-worker/keys');
    if (!fs.existsSync(workerKeysDir)) {
      fs.mkdirSync(workerKeysDir, { recursive: true });
    }
    return workerKeysDir;
  }

  /**
   * Resets cached in-memory keys (used for test isolation & multi-instance simulation).
   */
  public static reset(): void {
    this.privateKeyPem = null;
    this.publicKeyPem = null;
  }

  /**
   * Initializes or loads the 2048-bit RSA keypair.
   *
   * SECURITY ENFORCEMENT:
   * - In production (NODE_ENV === 'production'), WORKER_PRIVATE_KEY_PEM is strictly required.
   *   If missing, invalid, or malformed, it FAILS CLOSED immediately.
   *   Ephemeral fallback generation and filesystem writes are strictly forbidden in production.
   * - In non-production (development/test), local filesystem fallback or auto-generation is permitted.
   *
   * KEY ROTATION LIMITATION:
   * Multi-key rotation (JWKS with 'kid' grace periods) is not supported in this version.
   * Key rotation requires updating WORKER_PRIVATE_KEY_PEM on Vercel and WORKER_PUBLIC_KEY_PEM on
   * the local worker simultaneously. Outstanding tokens minted under the old key will be rejected.
   */
  public static initKeys(): { publicKey: string; privateKey: string } {
    if (this.privateKeyPem && this.publicKeyPem) {
      return { publicKey: this.publicKeyPem, privateKey: this.privateKeyPem };
    }

    const isProduction = process.env.NODE_ENV === 'production';

    // 1. Check environment variables
    const envPriv = process.env.WORKER_PRIVATE_KEY_PEM;
    const envPub = process.env.WORKER_PUBLIC_KEY_PEM;

    if (envPriv) {
      const formattedPriv = envPriv.replace(/\\n/g, '\n').trim();
      try {
        // Validate private key structure
        crypto.createPrivateKey(formattedPriv);
      } catch (keyErr: any) {
        throw new Error(`CRITICAL SECURITY FAILURE: Invalid WORKER_PRIVATE_KEY_PEM format: ${keyErr.message}`);
      }

      this.privateKeyPem = formattedPriv;

      if (envPub) {
        this.publicKeyPem = envPub.replace(/\\n/g, '\n').trim();
      } else {
        // Derive public key from valid private key
        const privKeyObj = crypto.createPrivateKey(formattedPriv);
        const derivedPub = crypto.createPublicKey(privKeyObj).export({ type: 'spki', format: 'pem' }) as string;
        this.publicKeyPem = derivedPub;
      }

      return { publicKey: this.publicKeyPem, privateKey: this.privateKeyPem };
    }

    // 2. Strict Production Failure: NEVER generate ephemeral fallback keys in production
    if (isProduction) {
      throw new Error(
        'CRITICAL SECURITY CONFIGURATION ERROR: Production environment requires WORKER_PRIVATE_KEY_PEM ' +
        'to be explicitly configured in environment variables. Ephemeral key generation and filesystem ' +
        'writes are strictly prohibited in production Vercel serverless environments.'
      );
    }

    // 3. Development / Test Fallback: Check local filesystem
    const keysDir = this.getKeysDir();
    const privateKeyPath = path.join(keysDir, 'worker_private_key.pem');
    const publicKeyPath = path.join(keysDir, 'worker_public_key.pem');

    if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
      this.privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
      this.publicKeyPem = fs.readFileSync(publicKeyPath, 'utf8');
      return { publicKey: this.publicKeyPem, privateKey: this.privateKeyPem };
    }

    // 4. Development / Test Auto-generation
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    this.privateKeyPem = privateKey;
    this.publicKeyPem = publicKey;

    try {
      fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
      fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });

      // Also copy public key to local worker keys dir so it can verify in dev without manual config
      const workerKeysDir = this.getWorkerKeysDir();
      fs.writeFileSync(path.join(workerKeysDir, 'worker_public_key.pem'), publicKey, { mode: 0o644 });
    } catch (_) {}

    return { publicKey, privateKey };
  }

  public static getPublicKey(): string {
    if (!this.publicKeyPem) {
      this.initKeys();
    }
    return this.publicKeyPem!;
  }

  public static getPrivateKey(): string {
    if (!this.privateKeyPem) {
      this.initKeys();
    }
    return this.privateKeyPem!;
  }

  /**
   * Mints an Asymmetric RS256 JWT token for the Local Windows Worker.
   * Scoped to the specific book, job, and generation.
   * Maximum lifespan: 15 minutes (900 seconds).
   */
  public static signWorkerAuthToken(params: {
    adminUserId: string;
    email: string;
    role: string;
    bookId: string;
    jobId: string;
    generationId: string;
  }): string {
    const privateKey = this.getPrivateKey();
    const jti = crypto.randomUUID();

    return jwt.sign(
      {
        id: params.adminUserId,
        email: params.email,
        role: params.role,
        purpose: 'book-ingestion',
        bookId: params.bookId,
        jobId: params.jobId,
        generationId: params.generationId,
        jti
      },
      privateKey,
      {
        algorithm: 'RS256',
        issuer: 'farabi-cloud',
        audience: 'farabi-local-worker',
        expiresIn: '15m'
      }
    );
  }
}

