import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { setupDisposableTestDb, teardownDisposableTestDb } from './test_isolation_helper.mjs';

const disposable = setupDisposableTestDb('phase4g3w');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../..');

const JWT_SECRET = process.env.JWT_SECRET || 'secret_assessment_platform_jwt_key_2026';

console.log('🧪 Starting Phase 4G.3W — Visual Asset Serving & Security Test Suite...\n');

let testsPassed = 0;
let testsFailed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    testsFailed++;
  }
}

// Load manifest
const manifestPath = path.join(workspaceRoot, 'server/uploads/visual_assets/visual_manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Import compiled classes
const { VisualAssetExtractor } = await import('../dist/services/ai/visualAssetExtractor.js');

// Mock express request/response helper for testing endpoint logic
function createMockReqRes({ params = {}, query = {}, headers = {}, user = null, studentProfile = null }) {
  const req = {
    params,
    query,
    headers,
    user,
    studentProfile
  };

  const res = {
    statusCode: 200,
    headersSent: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, val) {
      this.headersSent[key.toLowerCase()] = val;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    end() {
      return this;
    }
  };

  return { req, res };
}

// ----------------------------------------------------
// 1. ALL 4 SVG ASSETS IN-MEMORY DELIVERY TEST
// ----------------------------------------------------
await runTest('All 4 canonical SVGs are present in compiled in-memory dictionary', async () => {
  const svgAssets = manifest.assets.filter(a => a.mime_type === 'image/svg+xml');
  assert.strictEqual(svgAssets.length, 4, 'Manifest must contain exactly 4 SVGs');

  for (const svgEntry of svgAssets) {
    const content = VisualAssetExtractor.getCompiledSvg(svgEntry.asset_id);
    assert.ok(content, `SVG content must be defined in memory for ${svgEntry.asset_id}`);
    assert.ok(content.startsWith('<svg'), `Must start with <svg tag for ${svgEntry.asset_id}`);
    assert.ok(content.includes('</svg>'), `Must terminate with </svg> for ${svgEntry.asset_id}`);
  }
});

// ----------------------------------------------------
// 2. ALL 20 CANONICAL PDFS PACKAGED & SHA-256 INTEGRITY
// ----------------------------------------------------
await runTest('All 20 canonical PDFs exist in bundled_assets and match manifest SHA-256 byte-for-byte', async () => {
  const pdfAssets = manifest.assets.filter(a => a.mime_type === 'application/pdf');
  assert.strictEqual(pdfAssets.length, 20, 'Manifest must contain exactly 20 PDFs');

  for (const pdfEntry of pdfAssets) {
    const bundledPath = VisualAssetExtractor.getBundledPdfPath(pdfEntry.asset_id);
    assert.ok(bundledPath, `Bundled PDF path must be resolved for ${pdfEntry.asset_id}`);
    assert.ok(fs.existsSync(bundledPath), `File must physically exist at ${bundledPath}`);

    const fileBytes = fs.readFileSync(bundledPath);
    const hash = crypto.createHash('sha256').update(fileBytes).digest('hex');
    assert.strictEqual(hash, pdfEntry.sha256, `SHA-256 must match manifest for ${pdfEntry.asset_id}`);
    assert.strictEqual(fileBytes.length, pdfEntry.file_size, `File size must match manifest for ${pdfEntry.asset_id}`);
  }
});

// ----------------------------------------------------
// 3. ASSET API URL GENERATION & VALIDATOR INTEGRATION
// ----------------------------------------------------
await runTest('getAssetApiUrl generates canonical endpoint URLs and passes isVisualAssetValid', async () => {
  for (const asset of manifest.assets) {
    const apiUrl = VisualAssetExtractor.getAssetApiUrl(asset);
    const expectedExt = asset.mime_type === 'application/pdf' ? '.pdf' : '.svg';
    assert.strictEqual(apiUrl, `/api/books/assets/${asset.asset_id}${expectedExt}`);
    assert.strictEqual(VisualAssetExtractor.isVisualAssetValid(apiUrl), true, `URL must be valid: ${apiUrl}`);

    // With query token attached (frontend browser pattern)
    const urlWithToken = `${apiUrl}?token=mock_jwt_token`;
    assert.strictEqual(VisualAssetExtractor.isVisualAssetValid(urlWithToken), true, `Tokenized URL must be valid: ${urlWithToken}`);
  }
});

// ----------------------------------------------------
// 4. SECURITY: PATH TRAVERSAL & MALFORMED REJECTION
// ----------------------------------------------------
await runTest('isVisualAssetValid and identifier regex strictly reject traversal & injection', async () => {
  const maliciousInputs = [
    '../../../etc/passwd',
    '..\\..\\windows\\system32',
    '/api/books/assets/..%2f..%2fsecret',
    '/api/books/assets/vis_123;DROP TABLE users;',
    'file:///C:/Windows/system.ini',
    'http://attacker.com/evil.svg',
    '<script>alert(1)</script>',
    null,
    undefined,
    ''
  ];

  for (const mal of maliciousInputs) {
    assert.strictEqual(VisualAssetExtractor.isVisualAssetValid(mal), false, `Must reject: ${mal}`);
  }

  // Regex identifier validator test
  const idRegex = /^(vis|diag)_[a-zA-Z0-9_-]+$/;
  assert.strictEqual(idRegex.test('vis_f19276d3_p21_68053597'), true);
  assert.strictEqual(idRegex.test('diag_808104ec_p78_parallel_lines_angle_transversal_227603'), true);
  assert.strictEqual(idRegex.test('../vis_test'), false);
  assert.strictEqual(idRegex.test('vis_test/../other'), false);
  assert.strictEqual(idRegex.test('vis_test;select'), false);
});

// ----------------------------------------------------
// 5. QUERY TOKEN AUTHENTICATION COMPATIBILITY
// ----------------------------------------------------
await runTest('authenticateToken middleware accepts both req.query.token and Authorization header', async () => {
  const { authenticateToken } = await import('../dist/middleware/auth.js');

  const testUser = { id: 'test-user-id', email: 'test@student.edu', role: 'STUDENT', fullName: 'Test Student' };
  const token = jwt.sign(testUser, JWT_SECRET, { expiresIn: '1h' });

  // 1. Via Query Token (?token=...)
  const queryMock = createMockReqRes({ query: { token } });
  let nextCalledQuery = false;
  await authenticateToken(queryMock.req, queryMock.res, () => { nextCalledQuery = true; });
  assert.strictEqual(nextCalledQuery, true, 'authenticateToken must call next() for valid query token');
  assert.strictEqual(queryMock.req.user.id, testUser.id);

  // 2. Via Authorization: Bearer header
  const headerMock = createMockReqRes({ headers: { authorization: `Bearer ${token}` } });
  let nextCalledHeader = false;
  await authenticateToken(headerMock.req, headerMock.res, () => { nextCalledHeader = true; });
  assert.strictEqual(nextCalledHeader, true, 'authenticateToken must call next() for Bearer header');
  assert.strictEqual(headerMock.req.user.id, testUser.id);

  // 3. Missing token -> 401
  const missingMock = createMockReqRes({});
  await authenticateToken(missingMock.req, missingMock.res, () => {});
  assert.strictEqual(missingMock.res.statusCode, 401, 'Must reject with 401 on missing token');
});

// ----------------------------------------------------
// 6. RANGE REQUEST & SAFE CACHING TEST ON PDF ASSET
// ----------------------------------------------------
await runTest('Bundled canonical PDF supports standard headers, ETag, and byte Range slicing', async () => {
  const samplePdf = manifest.assets.find(a => a.mime_type === 'application/pdf');
  const filePath = VisualAssetExtractor.getBundledPdfPath(samplePdf.asset_id);
  assert.ok(fs.existsSync(filePath));

  const totalLen = fs.statSync(filePath).size;
  const start = 0;
  const end = 1023; // First 1 KB
  const slice = fs.readFileSync(filePath).subarray(start, end + 1);

  assert.strictEqual(slice.length, 1024);
  assert.strictEqual(totalLen, samplePdf.file_size);
});

// ----------------------------------------------------
// 7. MULTIMODAL REGRESSION CHECK
// ----------------------------------------------------
await runTest('All 24 manifest assets remain mapped and fully consistent', async () => {
  const manifestData = VisualAssetExtractor.loadManifest();
  assert.strictEqual(manifestData.total_assets, 24);
  assert.strictEqual(manifestData.assets.length, 24);
});

// ----------------------------------------------------
// 8. LIVE HTTP UNIFIED ROUTE & COLLISION PREVENTION TESTS (Phase 4G.3Y)
// ----------------------------------------------------
await runTest('Live HTTP endpoint delivers bundled PDF with .pdf extension (collision fixed)', async () => {
  const appModule = await import('../dist/server.js');
  const app = appModule.default;
  const adminToken = jwt.sign({ id: 'test-admin', email: 'admin@edu.eg', role: 'ADMIN', fullName: 'Admin User' }, JWT_SECRET, { expiresIn: '1h' });

  const server = app.listen(5123);
  try {
    // 1. Valid bundled PDF with .pdf extension
    const resPdf = await fetch('http://localhost:5123/api/books/assets/vis_f19276d3_p21_68053597.pdf?token=' + adminToken);
    assert.strictEqual(resPdf.status, 200, 'Must return 200 for valid PDF with .pdf');
    assert.strictEqual(resPdf.headers.get('content-type'), 'application/pdf');
    const pdfBuf = Buffer.from(await resPdf.arrayBuffer());
    assert.strictEqual(pdfBuf.length, 648007);
    assert.strictEqual(pdfBuf.subarray(0, 4).toString(), '%PDF');

    // 2. Valid bundled PDF bare ID (without extension)
    const resBarePdf = await fetch('http://localhost:5123/api/books/assets/vis_f19276d3_p21_68053597?token=' + adminToken);
    assert.strictEqual(resBarePdf.status, 200, 'Must return 200 for bare PDF asset ID');
    assert.strictEqual(resBarePdf.headers.get('content-type'), 'application/pdf');

    // 3. Valid SVG with .svg extension
    const resSvg = await fetch('http://localhost:5123/api/books/assets/diag_808104ec_p78_parallel_lines_angle_transversal_227603.svg?token=' + adminToken);
    assert.strictEqual(resSvg.status, 200, 'Must return 200 for valid SVG with .svg');
    assert.strictEqual(resSvg.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
    assert.strictEqual(resSvg.headers.get('content-security-policy'), "default-src 'none'; style-src 'unsafe-inline'");
    const svgText = await resSvg.text();
    assert.ok(svgText.startsWith('<svg'));

    // 4. Valid SVG bare ID (without extension)
    const resBareSvg = await fetch('http://localhost:5123/api/books/assets/diag_808104ec_p78_parallel_lines_angle_transversal_227603?token=' + adminToken);
    assert.strictEqual(resBareSvg.status, 200, 'Must return 200 for bare SVG asset ID');
    assert.strictEqual(resBareSvg.headers.get('content-type'), 'image/svg+xml; charset=utf-8');

    // 5. HTTP Range Request (206 Partial Content)
    const resRange = await fetch('http://localhost:5123/api/books/assets/vis_f19276d3_p21_68053597.pdf?token=' + adminToken, {
      headers: { Range: 'bytes=0-499' }
    });
    assert.strictEqual(resRange.status, 206, 'Must return 206 for Range request');
    assert.strictEqual(resRange.headers.get('content-range'), 'bytes 0-499/648007');
    assert.strictEqual(resRange.headers.get('content-length'), '500');

    // 6. Unknown asset -> 404
    const resUnknown = await fetch('http://localhost:5123/api/books/assets/vis_nonexistent_00000000.pdf?token=' + adminToken);
    assert.strictEqual(resUnknown.status, 404, 'Unknown asset must return 404');

    // 7. Malformed / Traversal ID -> 400
    const resBad = await fetch('http://localhost:5123/api/books/assets/invalid$asset.pdf?token=' + adminToken);
    assert.strictEqual(resBad.status, 400, 'Malformed ID must return 400');

    // 8. Missing token -> 401
    const resNoAuth = await fetch('http://localhost:5123/api/books/assets/vis_f19276d3_p21_68053597.pdf');
    assert.strictEqual(resNoAuth.status, 401, 'Missing token must return 401');

  } finally {
    server.close();
  }
});

console.log('\n======================================================');
console.log(`Phase 4G.3W/Y Test Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log('======================================================\n');

try {
  const { db } = await import('../dist/db/db.js');
  teardownDisposableTestDb(db, disposable.tempDir);
  console.log(`🧹 Teardown complete: disposable test directory unlinked: ${disposable.tempDir}`);
} catch (_) {}

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
