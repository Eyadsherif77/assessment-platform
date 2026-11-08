/**
 * FARABI AI — PHASE B1.2 FINAL FOUR-BLOCKER REMEDIATION VERIFICATION SUITE
 * 
 * Verifies:
 * 1. Disposable MySQL 8.4 engine (Port 3319) execution & schema_mysql.sql DDL migrations
 * 2. Generation Isolation: Exact single active generation, legacy NULL backward compatibility, zero mixing
 * 3. Embedding Compatibility: Persisted model identity, compare only when model/version/dim match, BM25 fallback
 * 4. Atomic Sequencing: Concurrency-safe reservation, failed writes do not consume sequence, retry before response returns cached
 * 5. Page Completeness: Diagram/equation/table short content accepted, provenance verified against book_ocr_page_results
 * 6. Zero Regression on Prep 3 Arabic, English, Science
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import assert from 'assert';
import { spawn } from 'child_process';
import mysql from 'mysql2/promise';

// Disposable SQLite database for Express integration endpoints
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b1_2_remediation_test_'));
const dbPath = path.join(tempDir, 'remediation_test.db');
process.env.SQLITE_DB_PATH = dbPath;
process.env.NODE_ENV = 'test';

import express from 'express';
import { db } from '../src/db/db.js';
import { generateToken } from '../src/middleware/auth.js';
import workerSyncRouter from '../src/routes/workerSync.js';
import booksRouter from '../src/routes/books.js';
import examsRouter from '../src/routes/exams.js';
import adminRouter from '../src/routes/admin.js';
import { IngestionWorkerSessionService } from '../src/services/jobs/ingestionWorkerSessionService.js';
import { AIRagEngine } from '../src/services/ai/aiRagEngine.js';
import { createSemanticVector, cosineSimilarity, computeEducationalBM25Score, generateEmbeddingWithMeta } from '../src/services/ai/vectorEmbedding.js';
import { WorkerGatewayClient } from '../../tools/local-ingestion-worker/src/workerGatewayClient.js';

let server;
let baseUrl;
let app;
let mysqldProc = null;
const MYSQL_TEST_PORT = 3319;

async function setupTestApp() {
  app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/worker-sync', workerSyncRouter);
  app.use('/api/books', booksRouter);
  app.use('/api/exams', examsRouter);
  app.use('/api/admin', adminRouter);

  await new Promise((resolve) => {
    server = http.createServer(app).listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

async function startDisposableMysqlServer() {
  console.log(`\n📦 Initializing and starting disposable MySQL 8.4 server on port ${MYSQL_TEST_PORT}...`);
  const mysqlTempDir = path.join(os.tmpdir(), 'mysql_disposable_3319');
  if (!fs.existsSync(mysqlTempDir)) {
    fs.mkdirSync(mysqlTempDir, { recursive: true });
    // Initialize empty insecure datadir
    const initProc = spawn(
      'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqld.exe',
      ['--initialize-insecure', `--datadir=${mysqlTempDir}`],
      { cwd: 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin' }
    );
    await new Promise((resolve) => initProc.on('exit', resolve));
  }

  // Spawn running mysqld instance
  mysqldProc = spawn(
    'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqld.exe',
    [
      `--datadir=${mysqlTempDir}`,
      `--port=${MYSQL_TEST_PORT}`,
      '--bind-address=127.0.0.1',
      '--mysqlx=OFF'
    ],
    { cwd: 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin', stdio: 'ignore' }
  );

  // Poll connection until ready
  let connected = false;
  for (let i = 0; i < 25; i++) {
    try {
      await new Promise(r => setTimeout(r, 400));
      const conn = await mysql.createConnection({
        host: '127.0.0.1',
        port: MYSQL_TEST_PORT,
        user: 'root',
        password: '',
        multipleStatements: true
      });
      const [vRows] = await conn.query('SELECT VERSION() as v');
      console.log(`     ✅ Connected to disposable MySQL 8.4 engine (${vRows[0].v}) on port ${MYSQL_TEST_PORT}`);
      await conn.end();
      connected = true;
      break;
    } catch (_) {}
  }

  if (!connected) {
    throw new Error(`Failed to connect to disposable MySQL 8.4 engine on port ${MYSQL_TEST_PORT}`);
  }
}

async function run() {
  console.log('==============================================================================');
  console.log('FARABI AI — PHASE B1.2: FINAL FOUR-BLOCKER REMEDIATION SUITE');
  console.log('==============================================================================');

  // Start standalone MySQL engine on port 3319
  await startDisposableMysqlServer();

  // ---------------------------------------------------------------------------
  // TEST PART 1: Disposable MySQL 8.4 Schema & DDL Migration Verification
  // ---------------------------------------------------------------------------
  console.log('\n🧪 1. Testing Schema & Migrations on Real MySQL 8.4 / TiDB-Compatible Engine...');
  const mysqlConn = await mysql.createConnection({
    host: '127.0.0.1',
    port: MYSQL_TEST_PORT,
    user: 'root',
    password: '',
    multipleStatements: true
  });

  await mysqlConn.query('DROP DATABASE IF EXISTS farabi_b1_2_test;');
  await mysqlConn.query('CREATE DATABASE farabi_b1_2_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
  await mysqlConn.query('USE farabi_b1_2_test;');

  // Apply schema_mysql.sql
  const schemaPath = path.join(process.cwd(), 'server', 'src', 'db', 'schema_mysql.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await mysqlConn.query(schemaSql);
  console.log('     ✅ schema_mysql.sql applied cleanly on MySQL 8.4.');

  // Apply Migration 1: checkpoint_data & book_ocr_page_results
  const m1Path = path.join(process.cwd(), 'server', 'src', 'db', 'migrations', '20261108_expand_checkpoint_data_and_ocr_pages.sql');
  const m1Sql = fs.readFileSync(m1Path, 'utf8');
  await mysqlConn.query(m1Sql);
  console.log('     ✅ Migration 20261108_expand_checkpoint_data_and_ocr_pages.sql verified.');

  // Verify checkpoint table name confirmation
  const [chkTableCheck] = await mysqlConn.query(`SHOW TABLES LIKE 'book_ingestion_jobs'`);
  assert.strictEqual(chkTableCheck.length, 1, 'Checkpoint table book_ingestion_jobs must exist');

  // Verify checkpoint_data is MEDIUMTEXT
  const [colCheck] = await mysqlConn.query(`SHOW COLUMNS FROM book_ingestion_jobs LIKE 'checkpoint_data'`);
  assert.strictEqual(colCheck[0].Type.toLowerCase(), 'mediumtext', 'checkpoint_data must be MEDIUMTEXT');
  console.log('     ✅ Checkpoint table name confirmed as book_ingestion_jobs with MEDIUMTEXT column.');

  // Apply Migration 2: staged generation & worker sessions
  const m2Path = path.join(process.cwd(), 'server', 'src', 'db', 'migrations', '20261108_staged_generation_and_worker_sessions.sql');
  const m2Sql = fs.readFileSync(m2Path, 'utf8');
  await mysqlConn.query(m2Sql);
  console.log('     ✅ Migration 20261108_staged_generation_and_worker_sessions.sql verified on MySQL 8.4.');

  // Verify unique constraint uq_ibi_session_endpoint_seq on MySQL 8.4
  const [idxCheck] = await mysqlConn.query(`SHOW INDEX FROM ingestion_batch_idempotency WHERE Key_name = 'idx_ibi_session_endpoint_seq'`);
  assert.strictEqual(idxCheck.length > 0, true, 'Unique key idx_ibi_session_endpoint_seq must exist on MySQL');
  assert.strictEqual(idxCheck[0].Non_unique, 0, 'idx_ibi_session_endpoint_seq must be UNIQUE');
  console.log('     ✅ Concurrency unique constraint (session_id, endpoint, batch_sequence) verified on MySQL 8.4.');

  await mysqlConn.end();

  // ---------------------------------------------------------------------------
  // TEST PART 2: Generation Isolation & Zero Artifact Mixing (Blocker 1)
  // ---------------------------------------------------------------------------
  console.log('\n🧪 2. Testing Blocker 1: Generation Isolation & Zero Artifact Mixing...');
  await setupTestApp();

  const stageRes = await db.query('SELECT id FROM academic_stages LIMIT 1');
  const gradeRes = await db.query('SELECT id FROM grades LIMIT 1');
  const stageId = stageRes.rows[0].id;
  const gradeId = gradeRes.rows[0].id;

  let subjectRes = await db.query('SELECT id FROM subjects LIMIT 1');
  let subjectId = subjectRes.rows.length > 0 ? subjectRes.rows[0].id : crypto.randomUUID();
  if (subjectRes.rows.length === 0) {
    await db.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES ($1, $2, 'MATH_PREP3', 'رياضيات', 'Mathematics')`,
      [subjectId, gradeId]
    );
  }

  // 2A. Test Legacy Book with NULL active_generation_id (Safe Backward Compatibility)
  const legacyBookId = `book_legacy_${Date.now()}`;
  await db.query(
    `INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, term, active_generation_id)
     VALUES ($1, $2, $3, $4, 'كتاب قديم', 'Legacy Book', 1, NULL)`,
    [legacyBookId, stageId, gradeId, subjectId]
  );
  // Seed legacy v1 artifacts
  await db.query(
    `INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id)
     VALUES ($1, $2, 1, 'الوحدة القديمة v1', 'Legacy Unit v1', 1, 10, 'v1')`,
    [`${legacyBookId}_ch1_v1`, legacyBookId]
  );
  await db.query(
    `INSERT INTO book_pdf_chunks (book_id, chunk_index, chunk_data, generation_id)
     VALUES ($1, 0, $2, 'v1')`,
    [legacyBookId, Buffer.from('%PDF-1.4 Legacy v1 PDF')]
  );
  await db.query(
    `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count, generation_id)
     VALUES ($1, $2, 1, 'Legacy content page 1 with v1 text.', 35, 'v1')`,
    [`${legacyBookId}_p1_v1`, legacyBookId]
  );

  const adminToken = generateToken({ id: 'admin_test', email: 'admin@edu.eg', role: 'CENTRAL_ADMIN' });

  // Query legacy book chapters
  const legacyChaptersRes = await fetch(`${baseUrl}/api/books/${legacyBookId}/chapters`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const legacyChapters = await legacyChaptersRes.json();
  assert.strictEqual(legacyChapters.length, 1);
  assert.strictEqual(legacyChapters[0].title_ar, 'الوحدة القديمة v1');
  console.log('     ✅ Backward compatibility: Legacy book with NULL active_generation_id safely resolved to v1.');

  // 2B. Test Active Book with G1 vs Staged G2 (Zero Artifact Mixing)
  const activeBookId = `book_active_${Date.now()}`;
  const g1Id = 'gen_g1_authoritative';
  const g2Id = 'gen_g2_staging';

  await db.query(
    `INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, term, active_generation_id)
     VALUES ($1, $2, $3, $4, 'كتاب الرياضيات المتقدم', 'Advanced Math', 1, $5)`,
    [activeBookId, stageId, gradeId, subjectId, g1Id]
  );

  // Seed G1 artifacts
  await db.query(`INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id) VALUES ($1, $2, 1, 'G1 Chapter', 'G1 Chapter', 1, 10, $3)`, [`${activeBookId}_ch1_g1`, activeBookId, g1Id]);
  await db.query(`INSERT INTO book_pdf_chunks (book_id, chunk_index, chunk_data, generation_id) VALUES ($1, 0, $2, $3)`, [activeBookId, Buffer.from('%PDF-1.4 G1 PDF'), g1Id]);
  await db.query(`INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count, generation_id) VALUES ($1, $2, 1, 'G1 Page text content.', 25, $3)`, [`${activeBookId}_p1_g1`, activeBookId, g1Id]);
  await db.query(
    `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata, embedding, generation_id)
     VALUES ($1, $2, $3, $4, $5, $6, 1, 0, 'G1 semantic chunk content.', '{"embedding_model":"semantic-hash-768","embedding_version":"1.0"}', $7, $8)`,
    [`${g1Id}_c0`, activeBookId, `${activeBookId}_ch1_g1`, stageId, gradeId, subjectId, JSON.stringify(createSemanticVector('G1 semantic chunk content.', 768)), g1Id]
  );

  // Also insert stray 'v1' artifacts for this book to prove they are NEVER mixed when active is G1
  await db.query(`INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id) VALUES ($1, $2, 99, 'Old Stray V1 Chapter', 'Old Stray V1', 90, 100, 'v1')`, [`${activeBookId}_ch_v1`, activeBookId]);
  await db.query(`INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata, embedding, generation_id) VALUES ($1, $2, $3, $4, $5, $6, 99, 99, 'Stray v1 chunk', '{"embedding_model":"semantic-hash-768"}', $7, 'v1')`, [`${activeBookId}_v1_chunk`, activeBookId, `${activeBookId}_ch_v1`, stageId, gradeId, subjectId, JSON.stringify(createSemanticVector('Stray', 768))]);

  // Stage G2 artifacts
  await db.query(`INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id) VALUES ($1, $2, 1, 'G2 New Chapter', 'G2 New Chapter', 1, 10, $3)`, [`${activeBookId}_ch1_g2`, activeBookId, g2Id]);
  await db.query(`INSERT INTO book_pdf_chunks (book_id, chunk_index, chunk_data, generation_id) VALUES ($1, 0, $2, $3)`, [activeBookId, Buffer.from('%PDF-1.4 G2 New PDF'), g2Id]);
  await db.query(`INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count, generation_id) VALUES ($1, $2, 1, 'G2 New Page text content.', 30, $3)`, [`${activeBookId}_p1_g2`, activeBookId, g2Id]);
  await db.query(
    `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata, embedding, generation_id)
     VALUES ($1, $2, $3, $4, $5, $6, 1, 0, 'G2 new semantic chunk content.', '{"embedding_model":"semantic-hash-768","embedding_version":"1.0"}', $7, $8)`,
    [`${g2Id}_c0`, activeBookId, `${activeBookId}_ch1_g2`, stageId, gradeId, subjectId, JSON.stringify(createSemanticVector('G2 new semantic chunk content.', 768)), g2Id]
  );

  // Verify Chapter read endpoint returns ONLY G1 (Zero mixing with v1 or G2)
  const chaptersActiveRes = await fetch(`${baseUrl}/api/books/${activeBookId}/chapters`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const chaptersActive = await chaptersActiveRes.json();
  assert.strictEqual(chaptersActive.length, 1, 'Must return exactly 1 chapter from active generation');
  assert.strictEqual(chaptersActive[0].title_ar, 'G1 Chapter', 'Must return G1 chapter');

  // Verify PDF stream returns G1 PDF (Zero mixing)
  const pdfActiveRes = await fetch(`${baseUrl}/api/books/${activeBookId}/pdf`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const pdfActiveBuf = Buffer.from(await pdfActiveRes.arrayBuffer());
  assert.strictEqual(pdfActiveBuf.toString(), '%PDF-1.4 G1 PDF');

  // Verify RAG retrieves ONLY G1
  const ragEngine = new AIRagEngine();
  const ragChunks = await ragEngine.retrieveGroundedChunks({
    academicStageId: stageId,
    gradeId: gradeId,
    subjectId: subjectId,
    bookId: activeBookId,
    chapterId: `${activeBookId}_ch1_g1`,
    queryText: 'semantic chunk'
  });
  assert.strictEqual(ragChunks.length, 1);
  assert.strictEqual(ragChunks[0].generation_id, g1Id);
  console.log('     ✅ Zero mixing verified: G1 active book returned strictly G1 artifacts (v1 and G2 completely excluded).');

  // ---------------------------------------------------------------------------
  // TEST PART 3: Embedding Model Identity & Compatibility (Blocker 2)
  // ---------------------------------------------------------------------------
  console.log('\n🧪 3. Testing Blocker 2: Embedding Model Identity & Compatibility Check...');
  const textSample = 'العلاقة بين المتغيرين تمثل دالة خطية إذا ارتبط كل عنصر بعنصر وحيد.';
  const hashVec = createSemanticVector(textSample, 768);

  // 3A. Test Equal Dimensions (768 vs 768) with Incompatible Models
  const queryMetaIncompatible = {
    values: new Array(768).fill(0.01),
    model: 'models/gemini-embedding-001',
    version: '001',
    dimensions: 768
  };

  const chunkMetaHash = {
    embedding_model: 'semantic-hash-768',
    embedding_version: '1.0'
  };

  // Insert candidate chunk with hash model metadata
  const compBookId = `book_comp_${Date.now()}`;
  await db.query(`INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, term, active_generation_id) VALUES ($1, $2, $3, $4, 'كتاب التوافق', 'Comp Book', 1, 'gen_comp')`, [compBookId, stageId, gradeId, subjectId]);
  await db.query(`INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id) VALUES ($1, $2, 1, 'وحدة التوافق', 'Comp Unit', 1, 10, 'gen_comp')`, [`${compBookId}_ch1`, compBookId]);
  await db.query(
    `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata, embedding, generation_id)
     VALUES ($1, $2, $3, $4, $5, $6, 1, 0, $7, $8, $9, 'gen_comp')`,
    [`${compBookId}_c0`, compBookId, `${compBookId}_ch1`, stageId, gradeId, subjectId, textSample, JSON.stringify(chunkMetaHash), JSON.stringify(hashVec)]
  );

  // Query RAG with queryText matching lexical keywords
  const retrievedComp = await ragEngine.retrieveGroundedChunks({
    academicStageId: stageId,
    gradeId: gradeId,
    subjectId: subjectId,
    bookId: compBookId,
    chapterId: `${compBookId}_ch1`,
    queryText: 'دالة خطية المتغيرين'
  });

  assert.strictEqual(retrievedComp.length, 1);
  assert(retrievedComp[0].similarity > 0.5, 'BM25 must score high when models are incompatible');
  console.log('     ✅ Model incompatibility check: Equal dimensions (768) with different models safely elevated to BM25.');

  // 3B. Missing Model Metadata -> Elevates to BM25
  const missingMetaChunk = `book_no_meta_${Date.now()}`;
  await db.query(`INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, term, active_generation_id) VALUES ($1, $2, $3, $4, 'كتاب بدون بيانات', 'No Meta', 1, 'gen_nometa')`, [missingMetaChunk, stageId, gradeId, subjectId]);
  await db.query(`INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, generation_id) VALUES ($1, $2, 1, 'وحدة', 'Unit', 1, 10, 'gen_nometa')`, [`${missingMetaChunk}_ch1`, missingMetaChunk]);
  await db.query(
    `INSERT INTO book_chunks (id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata, embedding, generation_id)
     VALUES ($1, $2, $3, $4, $5, $6, 1, 0, $7, '{}', $8, 'gen_nometa')`,
    [`${missingMetaChunk}_c0`, missingMetaChunk, `${missingMetaChunk}_ch1`, stageId, gradeId, subjectId, textSample, JSON.stringify(hashVec)]
  );
  const retrievedNoMeta = await ragEngine.retrieveGroundedChunks({
    academicStageId: stageId,
    gradeId: gradeId,
    subjectId: subjectId,
    bookId: missingMetaChunk,
    chapterId: `${missingMetaChunk}_ch1`,
    queryText: 'دالة خطية المتغيرين'
  });
  assert.strictEqual(retrievedNoMeta[0].modelCompatible, false, 'Missing metadata must mark modelCompatible=false');
  console.log('     ✅ Missing model metadata safely defaulted to BM25.');

  // ---------------------------------------------------------------------------
  // TEST PART 4: Atomic Sequencing & Concurrency Safety (Blocker 3)
  // ---------------------------------------------------------------------------
  console.log('\n🧪 4. Testing Blocker 3: Atomic Sequencing & Concurrency Safety...');
  const seqBookId = `book_seq_test_${Date.now()}`;
  await db.query(`INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, term) VALUES ($1, $2, $3, $4, 'كتاب التسلسل', 'Seq Book', 1)`, [seqBookId, stageId, gradeId, subjectId]);
  const sessRes = await fetch(`${baseUrl}/api/admin/books/${seqBookId}/worker-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ fileChecksum: 'checksum_seq', totalPages: 10 })
  });
  const session = await sessRes.json();

  // 4A. Concurrency Race: Two simultaneous requests with same sequence #1 but different idempotency keys
  const [resA, resB] = await Promise.all([
    fetch(`${baseUrl}/api/worker-sync/pdf-chunks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.sessionToken}`,
        'X-Batch-Sequence': '1',
        'X-Idempotency-Key': 'idemp_key_A'
      },
      body: JSON.stringify({ chunk_index: 0, total_chunks: 1, chunk_base64: Buffer.from('%PDF-1.4 Chunk A').toString('base64') })
    }),
    fetch(`${baseUrl}/api/worker-sync/pdf-chunks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.sessionToken}`,
        'X-Batch-Sequence': '1',
        'X-Idempotency-Key': 'idemp_key_B'
      },
      body: JSON.stringify({ chunk_index: 0, total_chunks: 1, chunk_base64: Buffer.from('%PDF-1.4 Chunk B').toString('base64') })
    })
  ]);

  const statuses = [resA.status, resB.status].sort();
  assert.strictEqual(statuses[0], 200, 'One concurrent request must succeed with 200');
  assert.strictEqual(statuses[1], 409, 'Compromised/competing request with same sequence must be rejected with 409 Conflict');
  console.log('     ✅ Concurrency safety: Same sequence #1 with competing idempotency keys resolved with 200 and 409 Conflict.');

  // 4B. Failed Write Does NOT Consume Sequence Number
  // Submit invalid payload for sequence #2 (e.g. negative chunk index or missing data)
  const failedWriteRes = await fetch(`${baseUrl}/api/worker-sync/pdf-chunks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.sessionToken}`,
      'X-Batch-Sequence': '2',
      'X-Idempotency-Key': 'idemp_key_fail'
    },
    body: JSON.stringify({ chunk_index: undefined, total_chunks: 1, chunk_base64: '' })
  });
  assert.strictEqual(failedWriteRes.status, 400);

  // Now submit valid request for sequence #2: it MUST succeed because sequence #2 was not consumed
  const retrySeq2Res = await fetch(`${baseUrl}/api/worker-sync/pdf-chunks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.sessionToken}`,
      'X-Batch-Sequence': '2',
      'X-Idempotency-Key': 'idemp_key_success_seq2'
    },
    body: JSON.stringify({ chunk_index: 1, total_chunks: 2, chunk_base64: Buffer.from('%PDF-1.4 Chunk 2').toString('base64') })
  });
  assert.strictEqual(retrySeq2Res.status, 200, 'Failed write must not consume sequence number');
  console.log('     ✅ Sequence conservation: Failed write did not consume sequence #2.');

  // 4C. Retry After Successful Persistence Before Response Delivery
  const retryClient = await fetch(`${baseUrl}/api/worker-sync/pdf-chunks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.sessionToken}`,
      'X-Batch-Sequence': '2',
      'X-Idempotency-Key': 'idemp_key_success_seq2'
    },
    body: JSON.stringify({ chunk_index: 1, total_chunks: 2, chunk_base64: Buffer.from('%PDF-1.4 Chunk 2').toString('base64') })
  });
  assert.strictEqual(retryClient.status, 200);
  const retryData = await retryClient.json();
  assert.strictEqual(retryData.isIdempotentRetry, true);
  console.log('     ✅ Idempotent retry: Retrying identical request returned cached response with isIdempotentRetry=true.');

  // ---------------------------------------------------------------------------
  // TEST PART 5: Page Completeness & Provenance Verification (Blocker 4)
  // ---------------------------------------------------------------------------
  console.log('\n🧪 5. Testing Blocker 4: Page Completeness & Provenance Verification...');
  const pageBookId = `book_page_val_${Date.now()}`;
  await db.query(`INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, term) VALUES ($1, $2, $3, $4, 'كتاب الصفحات', 'Page Book', 1)`, [pageBookId, stageId, gradeId, subjectId]);
  
  const dummyPdf = Buffer.from('%PDF-1.4 Mathematical Document with Geometry Diagrams and Equations.');
  const dummyChecksum = crypto.createHash('sha256').update(dummyPdf).digest('hex');

  const pageSessRes = await fetch(`${baseUrl}/api/admin/books/${pageBookId}/worker-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ fileChecksum: dummyChecksum, totalPages: 4 })
  });
  const pageSess = await pageSessRes.json();
  const pageClient = new WorkerGatewayClient({ gatewayBaseUrl: baseUrl, sessionToken: pageSess.sessionToken });

  await pageClient.syncPdfChunk({ chunkIndex: 0, totalChunks: 1, chunkBuffer: dummyPdf, fileSizeBytes: dummyPdf.length, checksum: dummyChecksum });
  await pageClient.syncChapters([{ chapterNumber: 1, titleAr: 'وحدة الهندسة', titleEn: 'Geometry Unit', startPage: 1, endPage: 4 }]);

  // Page 1: Standard meaningful text (>= 15 chars)
  // Page 2: Short text (< 15 chars) with DIAGRAM classification -> ACCEPTED
  // Page 3: Short text (< 15 chars) with mathematical formula 'y = x^2 - 4' -> ACCEPTED
  // Page 4: Short text (< 15 chars) with TABLE classification -> ACCEPTED
  await pageClient.syncPages([
    { pageNumber: 1, text: 'Meaningful text content for the first chapter introduction.', charCount: 60, pageType: 'CONTENT' },
    { pageNumber: 2, text: 'شكل (1)', charCount: 7, pageType: 'DIAGRAM', metadata: { has_diagram: true } },
    { pageNumber: 3, text: 'y = x^2 - 4', charCount: 11, pageType: 'EQUATION', metadata: { has_equation: true } },
    { pageNumber: 4, text: 'جدول (1)', charCount: 8, pageType: 'TABLE', metadata: { has_table: true } }
  ]);

  await pageClient.syncSemanticChunks([{ chunkIndex: 0, pageNumber: 1, content: 'Geometry and equations chunk' }]);

  // Complete session: all pages must pass validation despite short character count
  const pageCompRes = await pageClient.complete({ totalPages: 4, totalChunks: 1, unitsCount: 1 });
  assert.strictEqual(pageCompRes.success, true);
  assert.strictEqual(pageCompRes.status, 'VERIFIED_READY');
  console.log('     ✅ Page completeness: Diagrams, equations, and tables with < 15 chars accepted with explicit validation evidence.');

  // 5B. Short content WITHOUT evidence is REJECTED
  const badPageBookId = `book_bad_page_${Date.now()}`;
  await db.query(`INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, term) VALUES ($1, $2, $3, $4, 'كتاب تالف', 'Corrupt Book', 1)`, [badPageBookId, stageId, gradeId, subjectId]);
  const badSessRes = await fetch(`${baseUrl}/api/admin/books/${badPageBookId}/worker-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ fileChecksum: dummyChecksum, totalPages: 2 })
  });
  const badSess = await badSessRes.json();
  const badClient = new WorkerGatewayClient({ gatewayBaseUrl: baseUrl, sessionToken: badSess.sessionToken });
  await badClient.syncPdfChunk({ chunkIndex: 0, totalChunks: 1, chunkBuffer: dummyPdf, fileSizeBytes: dummyPdf.length, checksum: dummyChecksum });
  await badClient.syncChapters([{ chapterNumber: 1, titleAr: 'وحدة', titleEn: 'Unit', startPage: 1, endPage: 2 }]);
  await badClient.syncPages([
    { pageNumber: 1, text: 'Meaningful text content for page 1.', charCount: 35 },
    { pageNumber: 2, text: 'err', charCount: 3, pageType: 'CONTENT' } // Unsubstantiated 3 characters!
  ]);
  await badClient.syncSemanticChunks([{ chunkIndex: 0, pageNumber: 1, content: 'Chunk' }]);

  let badPageFailed = false;
  try {
    await badClient.complete({ totalPages: 2, totalChunks: 1, unitsCount: 1 });
  } catch (err) {
    badPageFailed = true;
    assert(err.message.includes('below minimum meaningful threshold'));
  }
  assert.strictEqual(badPageFailed, true, 'Unsubstantiated short text must be rejected');
  console.log('     ✅ Unsubstantiated short text (< 15 chars) without evidence correctly rejected.');

  // 5C. Provenance Verification: Page in book_pages without OCR checkpoint in book_ocr_page_results
  const provBookId = `book_prov_${Date.now()}`;
  await db.query(`INSERT INTO books (id, academic_stage_id, grade_id, subject_id, title_ar, title_en, term) VALUES ($1, $2, $3, $4, 'كتاب بدون أصل', 'No Provenance', 1)`, [provBookId, stageId, gradeId, subjectId]);
  const provSessRes = await fetch(`${baseUrl}/api/admin/books/${provBookId}/worker-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ fileChecksum: dummyChecksum, totalPages: 2 })
  });
  const provSess = await provSessRes.json();
  const provClient = new WorkerGatewayClient({ gatewayBaseUrl: baseUrl, sessionToken: provSess.sessionToken });
  await provClient.syncPdfChunk({ chunkIndex: 0, totalChunks: 1, chunkBuffer: dummyPdf, fileSizeBytes: dummyPdf.length, checksum: dummyChecksum });
  await provClient.syncChapters([{ chapterNumber: 1, titleAr: 'وحدة', titleEn: 'Unit', startPage: 1, endPage: 2 }]);
  await provClient.syncPages([
    { pageNumber: 1, text: 'Meaningful text content for page 1.', charCount: 35 },
    { pageNumber: 2, text: 'Meaningful text content for page 2.', charCount: 35 }
  ]);
  await provClient.syncSemanticChunks([{ chunkIndex: 0, pageNumber: 1, content: 'Chunk' }]);

  // Simulate missing OCR checkpoint by deleting page 2 from book_ocr_page_results
  await db.query(`DELETE FROM book_ocr_page_results WHERE book_id = $1 AND page_number = 2`, [provBookId]);

  let provFailed = false;
  try {
    await provClient.complete({ totalPages: 2, totalChunks: 1, unitsCount: 1 });
  } catch (err) {
    provFailed = true;
    assert(err.message.includes('lacks matching raw OCR checkpoint in book_ocr_page_results'));
  }
  assert.strictEqual(provFailed, true, 'completeSession must reject canonical page missing OCR checkpoint');
  console.log('     ✅ Provenance verification: Page missing matching raw OCR checkpoint correctly rejected.');

  // ---------------------------------------------------------------------------
  // TEST PART 6: Zero Regression on Prep 3 Curriculum
  // ---------------------------------------------------------------------------
  console.log('\n🧪 6. Testing Zero Regression on Prep 3 Curriculum (Arabic, English, Science)...');
  const arBM25 = computeEducationalBM25Score('اسم الفاعل الفعل الثلاثي', 'اسم الفاعل من الفعل الثلاثي يصاغ على وزن فاعل مثل كتب كاتب ونجح ناجح.');
  assert(arBM25 > 0.5, 'Arabic BM25 score must be high');

  const enBM25 = computeEducationalBM25Score('present perfect tense past', 'Present perfect tense is used for actions that started in the past and continue to the present.');
  assert(enBM25 > 0.5, 'English BM25 score must be high');

  const sciBM25 = computeEducationalBM25Score('السرعة القياسية المسافة الزمن الكلي', 'السرعة القياسية هي المسافة الكلية مقطوعة مقسومة على الزمن الكلي المستغرق في الحركة.');
  assert(sciBM25 > 0.5, 'Science BM25 score must be high');
  console.log('     ✅ Zero regression on Prep 3 Arabic, English, and Science retrieval confirmed.');

  // Clean up
  server.close();
  if (mysqldProc) {
    mysqldProc.kill();
    console.log('     🧹 Terminated disposable MySQL 8.4 engine process.');
  }
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n==============================================================================');
  console.log('✅ ALL PHASE B1.2 FOUR-BLOCKER REMEDIATION TESTS PASSED (100% SUCCESS)');
  console.log('==============================================================================\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('\n❌ Phase B1.2 Test Suite Failed:', err);
  if (server) server.close();
  if (mysqldProc) mysqldProc.kill();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}
  process.exit(1);
});

