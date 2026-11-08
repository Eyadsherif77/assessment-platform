/**
 * FARABI AI — PHASE B2.2 TEST SUITE
 * TARGETED SECURITY REMEDIATION, CRYPTOGRAPHIC KEY LIFECYCLE & REAL BROWSER LNA COMPATIBILITY
 *
 * Strict Verification Standards:
 * - Deterministic isolated testing (disposable SQLite DB + Express App + Local Ingestion Worker)
 * - Zero production TiDB Cloud mutations
 * - Zero paid Gemini calls (Mocked OCR and Embeddings)
 * - Real Chrome and Edge browser automation
 */

import http from 'http';
import https from 'https';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import assert from 'assert';
import { execSync, spawn } from 'child_process';
import jwt from 'jsonwebtoken';
import express from 'express';

import { db } from '../src/db/db.js';
import workerSyncRouter from '../src/routes/workerSync.js';
import booksRouter from '../src/routes/books.js';
import adminRouter from '../src/routes/admin.js';
import { WorkerKeyService } from '../src/services/security/workerKeyService.js';
import { generateToken } from '../src/middleware/auth.js';
import { IngestionWorkerSessionService } from '../src/services/jobs/ingestionWorkerSessionService.js';
import { DurableIngestionJobService } from '../src/services/jobs/durableIngestionJobService.js';
import { app as workerApp, server as workerServer } from '../../tools/local-ingestion-worker/src/index.js';
import { workerConfig, durableReplayCache, setWorkerPublicKey } from '../../tools/local-ingestion-worker/src/config.js';
import { LocalIngestionRunner } from '../../tools/local-ingestion-worker/src/localIngestionRunner.js';
import { WorkerGatewayClient } from '../../tools/local-ingestion-worker/src/workerGatewayClient.js';
import { computeEducationalBM25Score } from '../src/services/ai/vectorEmbedding.js';

let serverInstance;
let workerServerInstance;
let baseUrl;
let workerUrl;
let tempDir;
let browserServer;
let browserServerUrl;

// Pre-generated static test keypair
const testKeyPairA = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const testKeyPairB = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

async function setup() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2_2_security_test_'));
  const testDbPath = path.join(tempDir, 'b2_2_test.db');
  process.env.SQLITE_DB_PATH = testDbPath;

  // Configure test static keys
  process.env.WORKER_PRIVATE_KEY_PEM = testKeyPairA.privateKey;
  process.env.WORKER_PUBLIC_KEY_PEM = testKeyPairA.publicKey;
  WorkerKeyService.reset();
  WorkerKeyService.initKeys();
  setWorkerPublicKey(testKeyPairA.publicKey);

  // Cloud Express App
  const cloudApp = express();
  cloudApp.use(express.json());
  cloudApp.use('/api/admin', adminRouter);
  cloudApp.use('/api/worker-sync', workerSyncRouter);
  cloudApp.use('/api/books', booksRouter);

  cloudApp.get('/lna-test-browser', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>LNA Test</title></head>
      <body>
        <div id="result">RUNNING</div>
        <script>
          (async () => {
            try {
              const opts = { method: 'GET', headers: { 'Accept': 'application/json' }, targetAddressSpace: 'loopback' };
              const res = await fetch('${workerUrl}/api/worker/health', opts);
              const data = await res.json();
              document.getElementById('result').innerText = 'STATUS_' + data.status + '_SERVICE_OK';
            } catch (err) {
              document.getElementById('result').innerText = 'ERROR_' + err.message;
            }
          })();
        </script>
      </body>
      </html>
    `);
  });

  await new Promise(resolve => {
    serverInstance = cloudApp.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${serverInstance.address().port}`;
      resolve();
    });
  });

  // Local Worker Express App
  await new Promise(resolve => {
    workerServerInstance = workerApp.listen(0, '127.0.0.1', () => {
      workerUrl = `http://127.0.0.1:${workerServerInstance.address().port}`;
      workerConfig.port = workerServerInstance.address().port;
      workerConfig.gatewayBaseUrl = baseUrl;
      if (!workerConfig.allowedOrigins.includes(baseUrl)) {
        workerConfig.allowedOrigins.push(baseUrl);
      }
      resolve();
    });
  });

  // Seed SQLite schema
  await initSqliteSchema();

  // Seed reference curriculum hierarchy
  const stageId = 'stage_prep_b2';
  const gradeId = 'grade_prep3_b2';
  const subjectId = 'subj_math_b2';

  await db.query(`INSERT OR REPLACE INTO academic_stages (id, code, name_ar, name_en, sort_order) VALUES ($1, 'PREP_B2', 'الإعدادية', 'Preparatory', 2)`, [stageId]);
  await db.query(`INSERT OR REPLACE INTO grades (id, stage_id, code, name_ar, name_en, sort_order) VALUES ($1, $2, 'PREP3_B2', 'الصف الثالث الإعدادي', 'Prep 3', 3)`, [gradeId, stageId]);
  await db.query(`INSERT OR REPLACE INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'MATH_B2', 'الرياضيات', 'Mathematics')`, [subjectId, gradeId]);
}

async function initSqliteSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title_ar TEXT NOT NULL,
      title_en TEXT,
      academic_stage_id TEXT,
      grade_id TEXT,
      subject_id TEXT,
      term INTEGER DEFAULT 1,
      school_type TEXT DEFAULT 'كلاهما',
      total_pages INTEGER DEFAULT 0,
      active_generation_id TEXT,
      processing_status TEXT DEFAULT 'PENDING',
      processing_error TEXT,
      file_checksum TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS book_pages (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      raw_text TEXT,
      char_count INTEGER DEFAULT 0,
      generation_id TEXT NOT NULL DEFAULT 'v1',
      page_type TEXT DEFAULT 'CONTENT',
      metadata TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book_id, generation_id, page_number)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS book_chapters (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      chapter_number INTEGER NOT NULL,
      title_ar TEXT NOT NULL,
      title_en TEXT NOT NULL,
      start_page INTEGER NOT NULL,
      end_page INTEGER NOT NULL,
      generation_id TEXT NOT NULL DEFAULT 'v1',
      UNIQUE(book_id, generation_id, chapter_number)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS book_chunks (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      chapter_id TEXT,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding TEXT,
      embedding_model TEXT NOT NULL DEFAULT 'semantic-hash-768',
      embedding_version TEXT NOT NULL DEFAULT '1.0',
      generation_id TEXT NOT NULL DEFAULT 'v1'
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS book_pdf_chunks (
      book_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_data BLOB NOT NULL,
      generation_id TEXT NOT NULL DEFAULT 'v1',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (book_id, generation_id, chunk_index)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ingestion_worker_sessions (
      id TEXT PRIMARY KEY,
      session_token_hash TEXT NOT NULL,
      book_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      file_checksum TEXT NOT NULL,
      generation_id TEXT NOT NULL,
      admin_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      is_revoked INTEGER NOT NULL DEFAULT 0,
      last_batch_sequence INTEGER NOT NULL DEFAULT 0,
      total_pages INTEGER NOT NULL DEFAULT 0,
      processed_pages_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ingestion_batch_idempotency (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      batch_sequence INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL,
      payload_checksum TEXT NOT NULL,
      response_body TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(session_id, idempotency_key),
      UNIQUE(session_id, endpoint, batch_sequence)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS book_ingestion_jobs (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      status TEXT NOT NULL,
      current_stage TEXT NOT NULL,
      total_pages INTEGER DEFAULT 0,
      processed_pages INTEGER DEFAULT 0,
      checkpoint_data TEXT,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS book_ocr_page_results (
      job_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      extracted_text TEXT NOT NULL,
      char_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (job_id, page_number)
    );
  `);
}

async function teardown() {
  if (serverInstance) serverInstance.close();
  if (workerServerInstance) workerServerInstance.close();
  if (workerServer) workerServer.close();
  if (browserServer) browserServer.close();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}
}

async function runTests() {
  console.log('==============================================================================');
  console.log('FARABI AI — PHASE B2.2: SECURITY REMEDIATION & REAL BROWSER COMPATIBILITY');
  console.log('==============================================================================\n');

  try {
    await setup();

    // -------------------------------------------------------------------------
    // 1. RS256 KEY LIFECYCLE & MULTI-INSTANCE VERIFICATION
    // -------------------------------------------------------------------------
    console.log('🧪 1. Testing Production Mode Fails Closed When Private Key Is Missing...');
    {
      const origEnv = process.env.NODE_ENV;
      const origKey = process.env.WORKER_PRIVATE_KEY_PEM;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.WORKER_PRIVATE_KEY_PEM;
        WorkerKeyService.reset();

        assert.throws(
          () => WorkerKeyService.initKeys(),
          (err) => {
            return err.message.includes('CRITICAL SECURITY CONFIGURATION ERROR') &&
                   err.message.includes('WORKER_PRIVATE_KEY_PEM');
          },
          'Expected initKeys() to fail closed in production without private key'
        );
        console.log('     ✅ Production mode strictly failed closed with descriptive error.');
      } finally {
        process.env.NODE_ENV = origEnv;
        process.env.WORKER_PRIVATE_KEY_PEM = origKey;
        WorkerKeyService.reset();
        WorkerKeyService.initKeys();
      }
    }

    console.log('🧪 2. Testing Production Mode Rejects Malformed / Invalid Private Keys...');
    {
      const origKey = process.env.WORKER_PRIVATE_KEY_PEM;
      try {
        process.env.WORKER_PRIVATE_KEY_PEM = '-----BEGIN RSA PRIVATE KEY-----\nINVALID_CORRUPT_KEY\n-----END RSA PRIVATE KEY-----';
        WorkerKeyService.reset();

        assert.throws(
          () => WorkerKeyService.initKeys(),
          (err) => {
            return err.message.includes('CRITICAL SECURITY FAILURE: Invalid WORKER_PRIVATE_KEY_PEM format');
          },
          'Expected initKeys() to fail closed on malformed key'
        );
        console.log('     ✅ Malformed private key was strictly rejected.');
      } finally {
        process.env.WORKER_PRIVATE_KEY_PEM = origKey;
        WorkerKeyService.reset();
        WorkerKeyService.initKeys();
      }
    }

    console.log('🧪 3. Testing Key Stability Across Simulated Independent Serverless Instances...');
    {
      // Instance 1 mints token
      WorkerKeyService.reset();
      const tokenInstance1 = WorkerKeyService.signWorkerAuthToken({
        adminUserId: 'admin-001',
        email: 'admin@farabi-ai.com',
        role: 'CENTRAL_ADMIN',
        bookId: 'book-sim-100',
        jobId: 'job-sim-100',
        generationId: 'gen-sim-100'
      });

      // Instance 2 (Cold Start simulation: in-memory state cleared)
      WorkerKeyService.reset();
      const keys2 = WorkerKeyService.initKeys();

      // Instance 2 verifies token from Instance 1
      const decoded = jwt.verify(tokenInstance1, keys2.publicKey, {
        algorithms: ['RS256'],
        issuer: 'farabi-cloud',
        audience: 'farabi-local-worker'
      });

      assert.strictEqual(decoded.bookId, 'book-sim-100');
      assert.strictEqual(decoded.jobId, 'job-sim-100');
      console.log('     ✅ Independent Vercel instances share identical signing & verification behavior.');
    }

    console.log('🧪 4. Testing Mismatched Keypair Verification Rejection...');
    {
      // Sign with Keypair A
      WorkerKeyService.reset();
      process.env.WORKER_PRIVATE_KEY_PEM = testKeyPairA.privateKey;
      process.env.WORKER_PUBLIC_KEY_PEM = testKeyPairA.publicKey;
      WorkerKeyService.initKeys();

      const tokenA = WorkerKeyService.signWorkerAuthToken({
        adminUserId: 'admin-001',
        email: 'admin@farabi-ai.com',
        role: 'CENTRAL_ADMIN',
        bookId: 'book-mismatch',
        jobId: 'job-mismatch',
        generationId: 'gen-mismatch'
      });

      // Attempt to verify using Keypair B public key
      assert.throws(
        () => jwt.verify(tokenA, testKeyPairB.publicKey, { algorithms: ['RS256'] }),
        (err) => err.name === 'JsonWebTokenError',
        'Mismatched key must throw JsonWebTokenError'
      );
      console.log('     ✅ Mismatched cryptographic keys rejected cleanly.');
    }

    // -------------------------------------------------------------------------
    // 2. REMOTE REVOCATION & CANCELLATION LIFECYCLE
    // -------------------------------------------------------------------------
    console.log('🧪 5. Testing Revocation With Browser Closed (Remote Gateway Check)...');
    {
      const bookId = 'book_remote_revocation_test';
      const fileChecksum = crypto.randomBytes(32).toString('hex');
      const genId = 'gen_revocation_closed';

      await db.query(`
        INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status)
        VALUES ($1, 'stage_prep_b2', 'grade_prep3_b2', 'subj_math_b2', 'كتاب فحص الإلغاء', 'Revocation Book', 20, 'PENDING')
      `, [bookId]);

      // Mint valid session
      const sess = await IngestionWorkerSessionService.createSession({
        bookId,
        jobId: 'job_revocation_closed',
        fileChecksum,
        generationId: genId,
        adminUserId: 'admin_test',
        totalPages: 20
      });

      const gatewayClient = new WorkerGatewayClient({
        gatewayBaseUrl: baseUrl,
        sessionToken: sess.sessionToken
      });

      // Initial status check -> ACTIVE
      const preCheck = await gatewayClient.checkSessionStatus();
      assert.strictEqual(preCheck.valid, true);
      assert.strictEqual(preCheck.isRevoked, false);
      assert.strictEqual(preCheck.status, 'ACTIVE');

      // Admin revokes session on cloud (browser tab closed)
      await IngestionWorkerSessionService.revokeSession(sess.sessionId);

      // Worker checks session status before batch -> REVOKED (HTTP 403)
      const postCheck = await gatewayClient.checkSessionStatus();
      assert.strictEqual(postCheck.valid, false);
      assert.strictEqual(postCheck.isRevoked, true);
      assert.strictEqual(postCheck.status, 'REVOKED');

      console.log('     ✅ Remote revocation detected prior to batch execution without browser assistance.');
    }

    console.log('🧪 6. Testing Worker Halts and Refuses Ingestion on Revoked Session...');
    {
      const bookId = 'book_refuse_start_test';
      const fileChecksum = crypto.randomBytes(32).toString('hex');

      await db.query(`
        INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, total_pages, processing_status)
        VALUES ($1, 'stage_prep_b2', 'grade_prep3_b2', 'subj_math_b2', 'كتاب رفض البدء', 'Refuse Start Book', 10, 'PENDING')
      `, [bookId]);

      const sess = await IngestionWorkerSessionService.createSession({
        bookId,
        jobId: 'job_refuse_start',
        fileChecksum,
        generationId: 'gen_refuse_start',
        adminUserId: 'admin_test',
        totalPages: 10
      });

      // Revoke immediately
      await IngestionWorkerSessionService.revokeSession(sess.sessionId);

      // Attempt to start session ingestion on worker
      await assert.rejects(
        () => LocalIngestionRunner.startSessionIngestion({
          bookId,
          jobId: 'job_refuse_start',
          sessionToken: sess.sessionToken,
          generationId: 'gen_refuse_start',
          gatewayBaseUrl: baseUrl
        }),
        (err) => err.message.includes('revoked by administrator'),
        'Worker must refuse to start session on revoked token'
      );

      console.log('     ✅ Worker refused to start ingestion on revoked session.');
    }

    console.log('🧪 7. Testing Network Interruption Handling During Status Checks...');
    {
      // Point client to a dead port to simulate network failure
      const clientWithBadNetwork = new WorkerGatewayClient({
        gatewayBaseUrl: 'http://127.0.0.1:59999',
        sessionToken: 'test-token'
      });

      const netResult = await clientWithBadNetwork.checkSessionStatus();
      assert.strictEqual(netResult.isNetworkError, true);
      assert.strictEqual(netResult.status, 'NETWORK_ERROR');
      assert.strictEqual(netResult.isRevoked, false);
      // Valid is true to prevent premature catastrophic abort on transient packet drop
      assert.strictEqual(netResult.valid, true);

      console.log('     ✅ Network interruption handled safely without premature state corruption.');
    }

    // -------------------------------------------------------------------------
    // 3. JTI & TOKEN LIFECYCLE AUDIT
    // -------------------------------------------------------------------------
    console.log('🧪 8. Testing Single-Use JTI Replay Defense On Start vs Safe Status Polling...');
    {
      const bookId = 'book_jti_lifecycle';
      const authToken = WorkerKeyService.signWorkerAuthToken({
        adminUserId: 'admin-1',
        email: 'admin@edu.eg',
        role: 'CENTRAL_ADMIN',
        bookId,
        jobId: 'job_jti_test',
        generationId: 'gen_jti_test'
      });

      // 1. First start request -> Accepted (status 202 or 400 if body incomplete, but passed auth)
      const res1 = await fetch(`${workerUrl}/api/worker/session/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'Origin': 'https://farabi-ai.com'
        },
        body: JSON.stringify({ bookId, jobId: 'job_jti_test', sessionToken: 'dummy' })
      });
      // Auth passed (not 401)
      assert.notStrictEqual(res1.status, 401);

      // 2. Replay identical start request -> Must be rejected with HTTP 401 Replay Detected
      const res2 = await fetch(`${workerUrl}/api/worker/session/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'Origin': 'https://farabi-ai.com'
        },
        body: JSON.stringify({ bookId, jobId: 'job_jti_test', sessionToken: 'dummy' })
      });
      assert.strictEqual(res2.status, 401);
      const errJson = await res2.json();
      assert.ok(errJson.error.includes('replay detected') || errJson.error.includes('consumed'));

      // 3. Status polling with the same token (GET) -> Must NOT be rejected as replay
      const resGet = await fetch(`${workerUrl}/api/worker/tasks/job_jti_test`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Origin': 'https://farabi-ai.com'
        }
      });
      assert.notStrictEqual(resGet.status, 401);

      // 4. Cancellation with the token -> Allowed (not blocked by replay)
      const resCancel = await fetch(`${workerUrl}/api/worker/tasks/job_jti_test/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Origin': 'https://farabi-ai.com'
        }
      });
      assert.notStrictEqual(resCancel.status, 401);

      console.log('     ✅ JTI single-use mutation defense verified alongside safe status polling & cancellation.');
    }

    // -------------------------------------------------------------------------
    // 4. REAL CHROMIUM LOCAL NETWORK ACCESS (LNA) VERIFICATION
    // -------------------------------------------------------------------------
    console.log('🧪 9. Testing CORS Preflight and Chromium LNA Header Exchange...');
    {
      const preflightRes = await fetch(`${workerUrl}/api/worker/health`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://farabi-ai.com',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'authorization, targetAddressSpace',
          'Access-Control-Request-Private-Network': 'true'
        }
      });

      assert.strictEqual(preflightRes.status, 204);
      assert.strictEqual(preflightRes.headers.get('access-control-allow-origin'), 'https://farabi-ai.com');
      assert.strictEqual(preflightRes.headers.get('access-control-allow-private-network'), 'true');
      const allowHeaders = preflightRes.headers.get('access-control-allow-headers') || '';
      assert.ok(allowHeaders.toLowerCase().includes('targetaddressspace'));

      console.log('     ✅ Chromium Local Network Access (LNA) preflight headers verified.');
    }

    console.log('🧪 10. Testing Untrusted Origin Rejection by Local Worker Guard...');
    {
      const evilRes = await fetch(`${workerUrl}/api/worker/health`, {
        headers: {
          'Origin': 'https://untrusted-malicious-domain.xyz'
        }
      });
      assert.strictEqual(evilRes.status, 403);
      const evilBody = await evilRes.json();
      assert.ok(evilBody.error.includes('CORS policy violation'));

      console.log('     ✅ Untrusted external origin strictly rejected with HTTP 403.');
    }

    console.log('🧪 11. Testing Real Google Chrome Browser LNA Fetch Execution...');
    {
      const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      if (fs.existsSync(chromePath)) {
        const chromeVersion = execSync(`powershell -Command "(Get-Item '${chromePath}').VersionInfo.ProductVersion"`).toString().trim();
        console.log(`     🌐 Detected Google Chrome Version: ${chromeVersion}`);

        // Run headless Chrome asynchronously so Node event loop can serve the HTTP request
        const browserRes = await new Promise((resolve, reject) => {
          const child = spawn(chromePath, [
            '--headless=new',
            '--virtual-time-budget=3000',
            '--dump-dom',
            `${baseUrl}/lna-test-browser`
          ]);
          let stdout = '';
          let stderr = '';
          child.stdout.on('data', d => { stdout += d.toString(); });
          child.stderr.on('data', d => { stderr += d.toString(); });
          child.on('close', code => resolve({ code, stdout, stderr }));
          child.on('error', reject);
        });

        assert.ok(browserRes.stdout.includes('STATUS_ONLINE_SERVICE_OK'), `Expected Chrome to read worker status, got: ${browserRes.stdout}`);
        console.log(`     ✅ Google Chrome ${chromeVersion} successfully queried local loopback worker.`);
      } else {
        console.log('     ⚠️ Google Chrome executable not found at standard path. Skipping Chrome test.');
      }
    }

    console.log('🧪 12. Testing Real Microsoft Edge Browser LNA Fetch Execution...');
    {
      const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
      if (fs.existsSync(edgePath)) {
        const edgeVersion = execSync(`powershell -Command "(Get-Item '${edgePath}').VersionInfo.ProductVersion"`).toString().trim();
        console.log(`     🌐 Detected Microsoft Edge Version: ${edgeVersion}`);

        const browserRes = await new Promise((resolve, reject) => {
          const child = spawn(edgePath, [
            '--headless=new',
            '--virtual-time-budget=3000',
            '--dump-dom',
            `${baseUrl}/lna-test-browser`
          ]);
          let stdout = '';
          let stderr = '';
          child.stdout.on('data', d => { stdout += d.toString(); });
          child.stderr.on('data', d => { stderr += d.toString(); });
          child.on('close', code => resolve({ code, stdout, stderr }));
          child.on('error', reject);
        });

        assert.ok(browserRes.stdout.includes('STATUS_ONLINE_SERVICE_OK'), `Expected Edge to read worker status, got: ${browserRes.stdout}`);
        console.log(`     ✅ Microsoft Edge ${edgeVersion} successfully queried local loopback worker.`);
      } else {
        console.log('     ⚠️ Microsoft Edge executable not found at standard path. Skipping Edge test.');
      }
    }

    // -------------------------------------------------------------------------
    // 5. PREP 3 CURRICULUM ZERO REGRESSION
    // -------------------------------------------------------------------------
    console.log('🧪 13. Testing Prep 3 Arabic, English, and Science BM25 Regression...');
    {
      const arabicText = 'اسم الفاعل يصاغ من الفعل الثلاثي على وزن فاعل مثل كتب كاتب وقرأ قارئ.';
      const arabicScore = computeEducationalBM25Score('اسم الفاعل الفعل الثلاثي', arabicText);
      assert.ok(arabicScore > 0.5, `Expected Arabic BM25 score > 0.5, got ${arabicScore}`);

      const englishText = 'Present perfect tense is used for actions that started in the past and continue to the present.';
      const englishScore = computeEducationalBM25Score('present perfect tense past', englishText);
      assert.ok(englishScore > 0.5, `Expected English BM25 score > 0.5, got ${englishScore}`);

      const scienceText = 'السرعة القياسية هي المسافة الكلية مقطوعة مقسومة على الزمن الكلي المستغرق في الحركة.';
      const scienceScore = computeEducationalBM25Score('السرعة القياسية المسافة الزمن الكلي', scienceText);
      assert.ok(scienceScore > 0.5, `Expected Science BM25 score > 0.5, got ${scienceScore}`);

      console.log('     ✅ Prep 3 Arabic, English, and Science retrieval verified with zero regression.');
    }

    console.log('\n==============================================================================');
    console.log('✅ ALL PHASE B2.2 TARGETED SECURITY & BROWSER TESTS PASSED (100% SUCCESS)');
    console.log('==============================================================================\n');

  } catch (err) {
    console.error('\n❌ Test Suite Failed:', err);
    process.exit(1);
  } finally {
    await teardown();
  }
}

runTests();
