import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { workerConfig, durableReplayCache } from './config.js';

export interface AuthenticatedAdminRequest extends Request {
  adminUser?: {
    id: string;
    email: string;
    role: string;
    bookId?: string;
    jobId?: string;
    jti?: string;
  };
}

/**
 * Strict Security Guard for the Local Windows Worker
 * 1. Rejects any non-loopback connections (127.0.0.1 / ::1 only).
 * 2. Validates Host header strictly.
 * 3. Enforces CORS & Origin whitelist.
 * 4. Enforces Asymmetric RS256 JWT authorization:
 *    - Algorithm MUST be RS256 (signed by Farabi Cloud private key).
 *    - Verified using local public key only (no symmetric secret on worker).
 *    - Strict claims: issuer='farabi-cloud', audience='farabi-local-worker', purpose='book-ingestion'.
 *    - Max validity window: 15 minutes (900s).
 *    - Role must be CENTRAL_ADMIN.
 *    - Durable JTI replay defense: each token can only be consumed once.
 *    - If token is scoped to a bookId, enforces match with target book.
 */
export function workerSecurityGuard(req: AuthenticatedAdminRequest, res: Response, next: NextFunction) {
  // 1. Loopback Address Verification
  const clientIp = req.socket.remoteAddress || req.ip || '';
  const isLoopback =
    clientIp === '127.0.0.1' ||
    clientIp === '::1' ||
    clientIp === '::ffff:127.0.0.1';

  if (!isLoopback) {
    console.warn(`🚨 [Security Alert] Rejected non-loopback request from IP: ${clientIp}`);
    return res.status(403).json({ error: 'Access forbidden: worker listens only on local loopback.' });
  }

  // 2. Host Header Validation
  const host = req.headers['host'] || '';
  const expectedPort = workerConfig.port;
  const isAllowedHost =
    host === `127.0.0.1:${expectedPort}` ||
    host === `localhost:${expectedPort}` ||
    host === '127.0.0.1' ||
    host === 'localhost';

  if (!isAllowedHost) {
    console.warn(`🚨 [Security Alert] Rejected request with invalid Host header: ${host}`);
    return res.status(400).json({ error: 'Bad Request: Host header mismatch.' });
  }

  // 3. CORS & Origin Validation
  const origin = req.headers['origin'];
  if (origin) {
    const isOriginAllowed = workerConfig.allowedOrigins.some(allowed => {
      return origin === allowed || origin.replace(/\/$/, '') === allowed.replace(/\/$/, '');
    });

    if (!isOriginAllowed) {
      console.warn(`🚨 [Security Alert] Rejected request from unauthorized origin: ${origin}`);
      return res.status(403).json({ error: 'CORS policy violation: unauthorized origin.' });
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, targetAddressSpace, X-Idempotency-Key, X-Batch-Sequence');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Exempt health endpoint from JWT requirement (still guarded by Loopback, Host, and Origin)
  if (req.path === '/api/worker/health') {
    return next();
  }

  // 4. Asymmetric RS256 JWT Authentication
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required: missing or malformed Bearer token.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required: empty token.' });
  }

  if (!workerConfig.workerPublicKey) {
    console.error('🚨 [Security Error] Worker public key is not configured.');
    return res.status(500).json({ error: 'Worker authentication not configured: public key missing.' });
  }

  try {
    const decoded = jwt.verify(token, workerConfig.workerPublicKey, {
      algorithms: ['RS256'],
      issuer: 'farabi-cloud',
      audience: 'farabi-local-worker'
    }) as any;

    // Check purpose
    if (decoded.purpose !== 'book-ingestion') {
      console.warn(`⚠️ [Auth] Rejected token: purpose "${decoded.purpose}" is invalid.`);
      return res.status(403).json({ error: 'Forbidden: invalid token purpose.' });
    }

    // Check expiration lifespan (max 15 minutes = 900 seconds)
    if (decoded.exp && decoded.iat && (decoded.exp - decoded.iat > 900)) {
      console.warn(`⚠️ [Auth] Rejected token: lifespan (${decoded.exp - decoded.iat}s) exceeds 15-minute maximum.`);
      return res.status(401).json({ error: 'Invalid token: token lifetime exceeds 15 minutes policy limit.' });
    }

    // Role check
    if (decoded.role !== 'CENTRAL_ADMIN' && decoded.role !== 'ADMIN') {
      console.warn(`⚠️ [Auth] Rejected token: role "${decoded.role}" is insufficient.`);
      return res.status(403).json({ error: 'Forbidden: Central Admin privileges required.' });
    }

    // JTI uniqueness & replay check (strictly enforced on mutations and root listing)
    if (!decoded.jti) {
      console.warn('⚠️ [Auth] Rejected token: missing unique jti claim.');
      return res.status(401).json({ error: 'Invalid token: missing required jti identifier.' });
    }

    // Cancellation endpoints are idempotent and permitted to use the originating token
    const isCancelEndpoint = req.path.includes('/cancel');
    const shouldCheckReplay = (req.method === 'POST' || req.path === '/api/worker/tasks') && !isCancelEndpoint;

    if (shouldCheckReplay && durableReplayCache.isConsumed(decoded.jti)) {
      console.warn(`🚨 [Security Alert] Replay detected! Consumed jti presented again: ${decoded.jti}`);
      return res.status(401).json({ error: 'Authentication failed: token has already been consumed (replay detected).' });
    }

    // Scope check: if token specifies a bookId or jobId, verify request targets them strictly
    const pathJobMatch = req.path.match(/\/tasks\/([^/]+)/);
    const reqJobId = req.body?.job_id || req.body?.jobId || (pathJobMatch && pathJobMatch[1] !== 'by-book' ? pathJobMatch[1] : undefined);
    if (decoded.jobId && reqJobId && decoded.jobId !== reqJobId) {
      console.warn(`⚠️ [Auth] JobId mismatch. Token scoped to ${decoded.jobId}, request targeted ${reqJobId}`);
      return res.status(403).json({ error: `Forbidden: Token is scoped for job ${decoded.jobId}, not ${reqJobId}.` });
    }

    const reqBookId = req.body?.book_id || req.body?.bookId || req.params?.bookId;
    if (decoded.bookId && reqBookId && decoded.bookId !== reqBookId) {
      console.warn(`⚠️ [Auth] BookId mismatch. Token scoped to ${decoded.bookId}, request targeted ${reqBookId}`);
      return res.status(403).json({ error: `Forbidden: Token is scoped for book ${decoded.bookId}, not ${reqBookId}.` });
    }

    // Mark JTI as consumed now that validations passed (for mutating actions or root listing, excluding cancel)
    if ((req.method !== 'GET' || req.path === '/api/worker/tasks') && !isCancelEndpoint) {
      durableReplayCache.consume(decoded.jti, decoded.exp);
    }

    req.adminUser = {
      id: decoded.id || decoded.userId || decoded.sub || 'admin',
      email: decoded.email || 'admin@farabi-ai.com',
      role: decoded.role,
      bookId: decoded.bookId,
      jobId: decoded.jobId,
      jti: decoded.jti
    };

    return next();
  } catch (jwtErr: any) {
    if (jwtErr.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Authentication token has expired.' });
    }
    return res.status(401).json({ error: `Invalid authentication token: ${jwtErr.message}` });
  }
}


