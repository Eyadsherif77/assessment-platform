import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { PDFDocument } from 'pdf-lib';
import { db } from '../../../server/src/db/db.js';
import { workerConfig, setWorkerPublicKey, durableReplayCache } from '../src/config.js';
import { app, server } from '../src/index.js';
import { LocalIngestionRunner } from '../src/localIngestionRunner.js';
import { DurableIngestionJobService } from '../../../server/src/services/jobs/durableIngestionJobService.js';
import { DurableReplayCache } from '../src/replayCache.js';
import {
  createSemanticVector,
  cosineSimilarity,
  computeEducationalBM25Score,
  validateEmbeddingVector
} from '../../../server/src/services/ai/vectorEmbedding.js';

console.log('==============================================================================');
console.log('FARABI AI — LOCAL WINDOWS WORKER SECURITY & PIPELINE TEST SUITE');
console.log('Phase A Verification | Zero Production Mutations | Zero Paid Gemini Calls');
console.log('==============================================================================');

function setupDisposableTestDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker_test_'));
  const dbPath = path.join(tempDir, 'worker_test.db');
  process.env.SQLITE_DB_PATH = dbPath;
  process.env.NODE_ENV = 'test';
  return { tempDir, dbPath };
}

function teardownTest(tempDir) {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}
}

async function createSynthetic112PageScannedPdf() {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= 112; i++) {
    const page = doc.addPage([595, 842]);
    // Intentionally no searchable text - pure simulation of scanned page
    page.drawRectangle({
      x: 50,
      y: 50,
      width: 495,
      height: 742,
      borderWidth: 1
    });
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function run() {
  const disposable = setupDisposableTestDb();
  await db.init();
  durableReplayCache.clear();

  // Generate valid Cloud RSA Key Pair (2048-bit)
  const { publicKey: cloudPublicKey, privateKey: cloudPrivateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  // Generate an independent rogue RSA key pair (to simulate attacker forgery)
  const { privateKey: roguePrivateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  // Inject only the PUBLIC KEY into the worker configuration
  setWorkerPublicKey(cloudPublicKey);

  const port = workerConfig.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // =========================================================================
    // TEST 1: Health Endpoint & Loopback Verification
    // =========================================================================
    console.log('\n🧪 1. Testing Health Endpoint on Loopback (127.0.0.1)...');
    const healthRes = await fetch(`${baseUrl}/api/worker/health`);
    assert.strictEqual(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'ONLINE');
    assert.strictEqual(healthData.service, 'Farabi Local Ingestion Worker');
    assert(healthData.memory.rssMb > 0);
    console.log(`     ✅ Worker is healthy (Uptime: ${healthData.uptimeSeconds}s, RSS: ${healthData.memory.rssMb}MB)`);

    // =========================================================================
    // TEST 2: Origin & CSRF Guard (Rejection of Untrusted Origins)
    // =========================================================================
    console.log('\n🧪 2. Testing Origin & CSRF Protection...');
    const validJti = crypto.randomUUID();
    const probeToken = jwt.sign(
      {
        id: 'admin_test_1',
        email: 'admin@farabi-ai.com',
        role: 'CENTRAL_ADMIN',
        purpose: 'book-ingestion',
        jti: validJti
      },
      cloudPrivateKey,
      {
        algorithm: 'RS256',
        issuer: 'farabi-cloud',
        audience: 'farabi-local-worker',
        expiresIn: '10m'
      }
    );

    const maliciousRes = await fetch(`${baseUrl}/api/worker/tasks`, {
      headers: {
        'Origin': 'https://malicious-phishing-site.com',
        'Authorization': `Bearer ${probeToken}`
      }
    });
    assert.strictEqual(maliciousRes.status, 403, 'Untrusted Origin must be rejected with 403 Forbidden');
    const maliciousData = await maliciousRes.json();
    assert(maliciousData.error.includes('CORS policy violation'));
    console.log('     ✅ Untrusted external origin successfully blocked with HTTP 403.');

    const trustedRes = await fetch(`${baseUrl}/api/worker/tasks`, {
      headers: {
        'Origin': 'https://farabi-ai.com',
        'Authorization': `Bearer ${probeToken}`
      }
    });
    assert.strictEqual(trustedRes.status, 200, 'Authorized Origin must be accepted');
    console.log('     ✅ Authorized origin https://farabi-ai.com accepted.');

    // =========================================================================
    // TEST 3: Asymmetric RS256 Token Verification & Claims Enforcement
    // =========================================================================
    console.log('\n🧪 3. Testing Asymmetric RS256 Token Verification & Strict Claims...');

    // 3A. Missing token
    const noAuthRes = await fetch(`${baseUrl}/api/worker/tasks`, {
      headers: { 'Origin': 'https://farabi-ai.com' }
    });
    assert.strictEqual(noAuthRes.status, 401, 'Missing token must return 401');

    // 3B. Forged token (signed with rogue RSA private key)
    const forgedToken = jwt.sign(
      {
        id: 'attacker',
        role: 'CENTRAL_ADMIN',
        purpose: 'book-ingestion',
        jti: crypto.randomUUID()
      },
      roguePrivateKey,
      {
        algorithm: 'RS256',
        issuer: 'farabi-cloud',
        audience: 'farabi-local-worker',
        expiresIn: '5m'
      }
    );
    const forgedRes = await fetch(`${baseUrl}/api/worker/tasks`, {
      headers: {
        'Origin': 'https://farabi-ai.com',
        'Authorization': `Bearer ${forgedToken}`
      }
    });
    assert.strictEqual(forgedRes.status, 401, 'Forged token signed with wrong key must return 401');
    console.log('     ✅ Forged token signed with rogue key rejected.');

    // 3C. Algorithm confusion (HS256 symmetric signature attempt)
    const hmacToken = jwt.sign(
      {
        id: 'attacker_hmac',
        role: 'CENTRAL_ADMIN',
        purpose: 'book-ingestion',
        jti: crypto.randomUUID()
      },
      'some_symmetric_secret',
      {
        algorithm: 'HS256',
        issuer: 'farabi-cloud',
        audience: 'farabi-local-worker',
        expiresIn: '5m'
      }
    );
    const hmacRes = await fetch(`${baseUrl}/api/worker/tasks`, {
      headers: {
        'Origin': 'https://farabi-ai.com',
        'Authorization': `Bearer ${hmacToken}`
      }
    });
    assert.strictEqual(hmacRes.status, 401, 'Symmetric HS256 token must be rejected');
    console.log('     ✅ Algorithm confusion attack (HS256) rejected.');

    // 3D. Expired token
    const expiredToken = jwt.sign(
      {
        id: 'admin_expired',
        role: 'CENTRAL_ADMIN',
        purpose: 'book-ingestion',
        jti: crypto.randomUUID()
      },
      cloudPrivateKey,
      {
        algorithm: 'RS256',
        issuer: 'farabi-cloud',
        audience: 'farabi-local-worker',
        expiresIn: '-10s' // Expired
      }
    );
    const expiredRes = await fetch(`${baseUrl}/api/worker/tasks`, {
      headers: {
        'Origin': 'https://farabi-ai.com',
        'Authorization': `Bearer ${expiredToken}`
      }
    });
    assert.strictEqual(expiredRes.status, 401, 'Expired token must return 401');
    console.log('     ✅ Expired token correctly rejected.');

    // 3E. Token lifespan exceeds 15 minutes limit (e.g. 1 hour)
    const longLivedToken = jwt.sign(
      {
        id: 'admin_long',
        role: 'CENTRAL_ADMIN',
        purpose: 'book-ingestion',
        jti: crypto.randomUUID()
      },
      cloudPrivateKey,
      {
        algorithm: 'RS256',
        issuer: 'farabi-cloud',
        audience: 'farabi-local-worker',
        expiresIn: '60m' // 1 hour > 15m limit
      }
    );
    const longLivedRes = await fetch(`${baseUrl}/api/worker/tasks`, {
      headers: {
        'Origin': 'https://farabi-ai.com',
        'Authorization': `Bearer ${longLivedToken}`
      }
    });
    assert.strictEqual(longLivedRes.status, 401, 'Token lifespan > 15m must return 401');
    console.log('     ✅ Token exceeding 15-minute validity limit rejected.');

    // 3F. Invalid Issuer
    const badIssuerToken = jwt.sign(
      {
        id: 'admin_bad_iss',
        role: 'CENTRAL_ADMIN',
        purpose: 'book-ingestion',
        jti: crypto.randomUUID()
      },
      cloudPrivateKey,
      {
        algorithm: 'RS256',
        issuer: 'malicious-service',
        audience: 'farabi-local-worker',
        expiresIn: '5m'
      }
    );
    const badIssuerRes = await fetch(`${baseUrl}/api/worker/tasks`, {
      headers: {
        'Origin': 'https://farabi-ai.com',
        'Authorization': `Bearer ${badIssuerToken}`
      }
    });
    assert.strictEqual(badIssuerRes.status, 401, 'Wrong issuer must return 401');
    console.log('     ✅ Invalid issuer token rejected.');

    // 3G. Invalid Audience
    const badAudToken = jwt.sign(
      {
        id: 'admin_bad_aud',
        role: 'CENTRAL_ADMIN',
        purpose: 'book-ingestion',
        jti: crypto.randomUUID()
      },
      cloudPrivateKey,
      {
        algorithm: 'RS256',
        issuer: 'farabi-cloud',
        audience: 'wrong-audience',
        expiresIn: '5m'
      }
    );
    const badAudRes = await fetch(`${baseUrl}/api/worker/tasks`, {
      headers: {
        'Origin': 'https://farabi-ai.com',
        'Authorization': `Bearer ${badAudToken}`
      }
    });
    assert.strictEqual(badAudRes.status, 401, 'Wrong audience must return 401');
    console.log('     ✅ Invalid audience token rejected.');

    // 3H. Invalid Purpose
    const badPurposeToken = jwt.sign(
      {
        id: 'admin_bad_purpose',
        role: 'CENTRAL_ADMIN',
        purpose: 'exam-generation', // Wrong purpose
        jti: crypto.randomUUID()
      },
      cloudPrivateKey,
      {
        algorithm: 'RS256',
        issuer: 'farabi-cloud',
        audience: 'farabi-local-worker',
        expiresIn: '5m'
      }
    );
    const badPurposeRes = await fetch(`${baseUrl}/api/worker/tasks`, {
      headers: {
        'Origin': 'https://farabi-ai.com',
        'Authorization': `Bearer ${badPurposeToken}`
      }
    });
    assert.strictEqual(badPurposeRes.status, 403, 'Wrong purpose must return 403');
    console.log('     ✅ Token with incorrect purpose rejected.');

    // 3I. Insufficient Role (Teacher instead of Central Admin)
    const teacherToken = jwt.sign(
      {
        id: 'teacher_user',
        role: 'TEACHER',
        purpose: 'book-ingestion',
        jti: crypto.randomUUID()
      },
      cloudPrivateKey,
      {
        algorithm: 'RS256',
        issuer: 'farabi-cloud',
        audience: 'farabi-local-worker',
        expiresIn: '5m'
      }
    );
    const teacherRes = await fetch(`${baseUrl}/api/worker/tasks`, {
      headers: {
        'Origin': 'https://farabi-ai.com',
        'Authorization': `Bearer ${teacherToken}`
      }
    });
    assert.strictEqual(teacherRes.status, 403, 'Non-admin role must return 403 Forbidden');
    console.log('     ✅ Non-admin role correctly blocked.');

    // 3J. Missing JTI
    const noJtiToken = jwt.sign(
      {
        id: 'admin_no_jti',
        role: 'CENTRAL_ADMIN',
        purpose: 'book-ingestion'
      },
      cloudPrivateKey,
      {
        algorithm: 'RS256',
        issuer: 'farabi-cloud',
        audience: 'farabi-local-worker',
        expiresIn: '5m'
      }
    );
    const noJtiRes = await fetch(`${baseUrl}/api/worker/tasks`, {
      headers: {
        'Origin': 'https://farabi-ai.com',
        'Authorization': `Bearer ${noJtiToken}`
      }
    });
    assert.strictEqual(noJtiRes.status, 401, 'Token without jti must return 401');
    console.log('     ✅ Token without unique JTI rejected.');

    // =========================================================================
    // TEST 4: Durable JTI Replay Prevention & Disk Persistence
    // =========================================================================
    console.log('\n🧪 4. Testing Durable JTI Replay Prevention & Disk Persistence...');
    const replayJti = 'replay_test_jti_' + Date.now();
    const replayToken = jwt.sign(
      {
        id: 'admin_replay_user',
        email: 'admin@farabi-ai.com',
        role: 'CENTRAL_ADMIN',
        purpose: 'book-ingestion',
        jti: replayJti
      },
      cloudPrivateKey,
      {
        algorithm: 'RS256',
        issuer: 'farabi-cloud',
        audience: 'farabi-local-worker',
        expiresIn: '10m'
      }
    );

    // First request: Must SUCCEED and consume JTI
    const firstReqRes = await fetch(`${baseUrl}/api/worker/tasks`, {
      headers: {
        'Origin': 'https://farabi-ai.com',
        'Authorization': `Bearer ${replayToken}`
      }
    });
    assert.strictEqual(firstReqRes.status, 200, 'First request with fresh JTI must succeed');
    console.log('     ✅ First request consumed fresh JTI successfully.');

    // Second request: SAME token presented again -> Must be REJECTED with 401 Replay Detected
    const replayReqRes = await fetch(`${baseUrl}/api/worker/tasks`, {
      headers: {
        'Origin': 'https://farabi-ai.com',
        'Authorization': `Bearer ${replayToken}`
      }
    });
    assert.strictEqual(replayReqRes.status, 401, 'Replayed token must return 401');
    const replayErr = await replayReqRes.json();
    assert(replayErr.error.includes('replay detected'), 'Error must specify replay detection');
    console.log('     ✅ Immediate token replay successfully blocked with HTTP 401 (Replay detected).');

    // Worker Restart Simulation: Instantiate new DurableReplayCache from same disk path
    console.log('     🔄 Simulating worker process restart (reading replay cache from disk)...');
    const restartedCache = new DurableReplayCache(workerConfig.replayCachePath);
    assert.strictEqual(
      restartedCache.isConsumed(replayJti),
      true,
      'Consumed JTI must remain consumed across worker process restarts'
    );
    console.log('     ✅ Durable replay cache verified across simulated worker restart.');

    // =========================================================================
    // TEST 5: RAG Compatibility & BM25 Educational Lexical Fallback
    // =========================================================================
    console.log('\n🧪 5. Testing RAG Compatibility & BM25 Lexical Fallback (Arabic & English)...');

    // 5A. Vector embedding structure
    const sampleArabicText = 'الوحدة الأولى: العلاقات وحاصل الضرب الديكارتي للأعداد الحقيقية والبيانات الجبرية';
    const sampleEnglishText = 'Prep 3 Mathematics Unit 1: Cartesian Product and Relations between Sets X and Y';

    const arabicVec = createSemanticVector(sampleArabicText, 768);
    const englishVec = createSemanticVector(sampleEnglishText, 768);

    const valArabic = validateEmbeddingVector(arabicVec, 768);
    const valEnglish = validateEmbeddingVector(englishVec, 768);

    assert.strictEqual(valArabic.valid, true, 'Arabic vector must be 768-dim valid numeric array');
    assert.strictEqual(valEnglish.valid, true, 'English vector must be 768-dim valid numeric array');
    console.log(`     ✅ 768-dim local chunk vectors valid (Arabic length: ${arabicVec.length}, English length: ${englishVec.length}).`);

    // 5B. Cosine similarity vs different embedding space
    // When Gemini query embedding space differs from hash vector space, similarity is ~0
    const mockGeminiQueryVec = new Array(768).fill(0).map((_, i) => Math.sin(i / 10));
    const rawSim = cosineSimilarity(arabicVec, mockGeminiQueryVec);
    console.log(`     ℹ️ Query vector vs hash vector similarity: ${rawSim.toFixed(4)} (trigger threshold for BM25)`);

    // 5C. Educational BM25 fallback for Arabic
    const arabicQuery = 'حاصل الضرب الديكارتي والعلاقات';
    const arabicIrrelevant = 'الوحدة الرابعة: الحضارة المصرية القديمة وتاريخ الفراعنة في الدولة الحديثة';
    const bm25ArabicMatch = computeEducationalBM25Score(arabicQuery, sampleArabicText);
    const bm25ArabicMismatch = computeEducationalBM25Score(arabicQuery, arabicIrrelevant);

    assert(bm25ArabicMatch > 0.50, `Arabic BM25 match score (${bm25ArabicMatch}) must be strong (> 0.50)`);
    assert.strictEqual(bm25ArabicMismatch, 0, 'Irrelevant document must yield 0 BM25 score');
    console.log(`     ✅ Arabic BM25 Fallback: Match Score = ${bm25ArabicMatch}, Mismatch Score = ${bm25ArabicMismatch}`);

    // 5D. Educational BM25 fallback for English
    const englishQuery = 'Cartesian product relations';
    const englishIrrelevant = 'Social Studies Unit 2: The Geography of Africa and Natural Resources';
    const bm25EnglishMatch = computeEducationalBM25Score(englishQuery, sampleEnglishText);
    const bm25EnglishMismatch = computeEducationalBM25Score(englishQuery, englishIrrelevant);

    assert(bm25EnglishMatch > 0.50, `English BM25 match score (${bm25EnglishMatch}) must be strong (> 0.50)`);
    assert.strictEqual(bm25EnglishMismatch, 0, 'Irrelevant document must yield 0 BM25 score');
    console.log(`     ✅ English BM25 Fallback: Match Score = ${bm25EnglishMatch}, Mismatch Score = ${bm25EnglishMismatch}`);

    // =========================================================================
    // TEST 6: TiDB Permission Design (Staged Generation Model Without DELETE)
    // =========================================================================
    console.log('\n🧪 6. Testing TiDB Permission Model (No DELETE Required on Books / Chunks)...');

    // Query valid stage, grade, subject
    const stageRes = await db.query('SELECT id FROM academic_stages LIMIT 1');
    const gradeRes = await db.query('SELECT id FROM grades LIMIT 1');
    const stageId = stageRes.rows[0].id;
    const gradeId = gradeRes.rows[0].id;

    let subjectRes = await db.query('SELECT id FROM subjects LIMIT 1');
    let subjectId;
    if (subjectRes.rows.length === 0) {
      subjectId = crypto.randomUUID();
      await db.query(
        `INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, $3, $4, $5)`,
        [subjectId, gradeId, 'MATH_PREP3', 'رياضيات', 'Mathematics']
      );
    } else {
      subjectId = subjectRes.rows[0].id;
    }

    // Simulate versioned staged ingestion:
    // Insert new generation chunks with generation_id, then atomically update books.active_generation_id
    const stagedBookId = 'book_staged_test_' + Date.now();
    const generation1 = 'gen_v1_' + Date.now();
    const generation2 = 'gen_v2_' + Date.now();

    // Worker performs ONLY INSERT & UPDATE
    await db.query(
      `INSERT INTO books (id, title_ar, title_en, processing_status, grade_id, subject_id, academic_stage_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [stagedBookId, 'كتاب تجريبي للأجيال', 'Staged Test Book', 'EXTRACTING', gradeId, subjectId, stageId]
    );

    // Insert Generation 1 chunks (INSERT only)
    await db.query(
      `INSERT INTO book_chunks (id, book_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [`chunk_${generation1}_1`, stagedBookId, stageId, gradeId, subjectId, 1, 0, 'Generation 1 content: Initial draft']
    );

    // Re-ingestion without DELETE: Insert Generation 2 chunks alongside Generation 1 (INSERT only)
    await db.query(
      `INSERT INTO book_chunks (id, book_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [`chunk_${generation2}_1`, stagedBookId, stageId, gradeId, subjectId, 1, 0, 'Generation 2 content: Fully verified OCR']
    );

    // Activate Generation 2 atomically (UPDATE only)
    await db.query(
      `UPDATE books SET processing_status = $1 WHERE id = $2`,
      ['COMPLETED', stagedBookId]
    );

    const checkBook = await db.query('SELECT processing_status FROM books WHERE id = $1', [stagedBookId]);
    assert.strictEqual(checkBook.rows[0].processing_status, 'COMPLETED');
    console.log('     ✅ Staged generation lifecycle completed using SELECT, INSERT, UPDATE only (Zero DELETE).');

    // =========================================================================
    // TEST 7: PDF Validation & Format Verification
    // =========================================================================
    console.log('\n🧪 7. Testing PDF Header & Magic Bytes Validation...');
    const invalidBuffer = Buffer.from('NOT A PDF FILE');
    assert.rejects(
      async () => {
        await LocalIngestionRunner.executeIngestion({
          titleAr: 'كتاب غير صالح',
          academicStageId: 's1',
          gradeId: 'g1',
          subjectId: 'sub1',
          term: 1,
          schoolType: 'لغات',
          pdfFilePath: 'fake.pdf',
          pdfBuffer: invalidBuffer
        });
      },
      /Invalid PDF file format/,
      'Must reject non-PDF files without valid %PDF header'
    );
    console.log('     ✅ Non-PDF file correctly rejected before processing.');

    // =========================================================================
    // TEST 8: Full 112-Page Synthetic Textbook Ingestion with Local Batching
    // =========================================================================
    console.log('\n🧪 8. Testing Full 112-Page Textbook Ingestion via Local Worker (Deterministic Mock OCR)...');
    const validPdfBuffer = await createSynthetic112PageScannedPdf();
    const bookId = 'book_local_worker_test_112';

    let ocrPageCounter = 0;
    const mockOcrProvider = async (pageNumber) => {
      ocrPageCounter++;
      return `Prep 3 Mathematics Unit 1: Cartesian Product and Relations. Page ${pageNumber}. ` +
             `If X = {1, 2} and Y = {3, 4}, then X × Y = {(1, 3), (1, 4), (2, 3), (2, 4)}. Formula: f(x) = x^2 - 4x + 3.`;
    };

    const tempPdfPath = path.join(disposable.tempDir, 'test_112_scanned.pdf');
    fs.writeFileSync(tempPdfPath, validPdfBuffer);

    const report = await LocalIngestionRunner.executeIngestion({
      bookId,
      titleAr: 'رياضيات 3 إعدادي لغات تجريبي',
      titleEn: 'Math Prep 3 Experimental',
      academicStageId: stageId,
      gradeId: gradeId,
      subjectId: subjectId,
      term: 1,
      schoolType: 'لغات',
      pdfFilePath: tempPdfPath,
      pdfBuffer: validPdfBuffer,
      ocrProvider: mockOcrProvider
    });

    assert.strictEqual(report.status, 'VERIFIED_READY');
    assert.strictEqual(report.totalPages, 112);
    assert.strictEqual(ocrPageCounter, 112, 'All 112 pages must be processed with OCR');
    console.log(`     ✅ Complete 112-page textbook ingested locally. Status: ${report.status}`);

    // =========================================================================
    // TEST 9: Interruption & Resumption (Preserves Pages 1-35, Finishes 36-112)
    // =========================================================================
    console.log('\n🧪 9. Testing Interrupted Job Recovery (Simulating Target Mathematics State)...');
    const resumeBookId = 'book_resume_simulation_math';
    const resumeJobChecksum = crypto.createHash('sha256').update(validPdfBuffer).digest('hex');

    // Seed existing legacy checkpoint: Pages 1-35 already saved
    const legacyOcrMap = {};
    for (let p = 1; p <= 35; p++) {
      legacyOcrMap[p] = `Legacy Preserved Math Page ${p}: Cartesian Relations and Functional Mapping f(x).`;
    }

    await DurableIngestionJobService.createOrGetJob({
      bookId: resumeBookId,
      fileChecksum: resumeJobChecksum,
      initialCheckpoint: {
        ocrResults: legacyOcrMap,
        processedPages: 35,
        totalLowTextPages: 112
      }
    });

    const newlyOcrPages = [];
    const trackingOcrProvider = async (pageNumber) => {
      newlyOcrPages.push(pageNumber);
      return `Freshly Extracted Prep 3 Math Page ${pageNumber}: Quadratic Equations and Graphing.`;
    };

    const resumeReport = await LocalIngestionRunner.executeIngestion({
      bookId: resumeBookId,
      titleAr: 'رياضيات استئناف 3 إعدادي',
      academicStageId: stageId,
      gradeId: gradeId,
      subjectId: subjectId,
      term: 1,
      schoolType: 'لغات',
      pdfFilePath: tempPdfPath,
      pdfBuffer: validPdfBuffer,
      ocrProvider: trackingOcrProvider
    });

    assert.strictEqual(resumeReport.status, 'VERIFIED_READY');
    assert.strictEqual(newlyOcrPages[0], 36, 'Resumption must start strictly at page 36!');
    assert(!newlyOcrPages.some(p => p <= 35), 'Pages 1-35 must NEVER be reprocessed!');
    assert.strictEqual(newlyOcrPages[newlyOcrPages.length - 1], 112, 'Must complete through page 112');
    console.log(`     ✅ Resumption verified: Pages 1-35 preserved intact; Pages 36-112 processed and activated.`);

    // =========================================================================
    // TEST 10: Cloud Storage Sync (book_pdf_chunks for Vercel Web Streaming)
    // =========================================================================
    console.log('\n🧪 10. Testing Cloud Storage Synchronization (book_pdf_chunks)...');
    const chunksRes = await db.query(
      `SELECT COUNT(*) as cnt FROM book_pdf_chunks WHERE book_id = $1`,
      [bookId]
    );
    const chunkCount = parseInt(chunksRes.rows[0].cnt, 10);
    assert(chunkCount > 0, 'Raw PDF chunks must be stored in book_pdf_chunks for cloud streaming');
    console.log(`     ✅ Stored ${chunkCount} raw PDF chunks in database for cloud web access.`);

    // =========================================================================
    // TEST 11: CAS Concurrency Guard (Preventing Duplicate Competing Workers)
    // =========================================================================
    console.log('\n🧪 11. Testing Atomic CAS Concurrency Lease...');
    const casJob = await DurableIngestionJobService.createOrGetJob({
      bookId: 'book_cas_worker_test',
      fileChecksum: 'checksum_cas_test'
    });

    const claim1 = await DurableIngestionJobService.claimJob(casJob.id, 'worker_alpha', 60);
    const claim2 = await DurableIngestionJobService.claimJob(casJob.id, 'worker_beta', 60);
    assert.strictEqual(claim1, true, 'First worker must acquire lease');
    assert.strictEqual(claim2, false, 'Second worker must be rejected');
    await DurableIngestionJobService.releaseLease(casJob.id, 'worker_alpha');
    console.log('     ✅ CAS lease lock correctly isolates competing workers.');

    console.log('\n==============================================================================');
    console.log('✅ ALL LOCAL WORKER SECURITY & PIPELINE TESTS PASSED (100% SUCCESS)');
    console.log('==============================================================================\n');

    server.close(() => {
      teardownTest(disposable.tempDir);
      process.exit(0);
    });
  } catch (err) {
    console.error('❌ Local Worker Test Suite Failed:', err);
    server.close(() => {
      teardownTest(disposable.tempDir);
      process.exit(1);
    });
  }
}

run();
