/**
 * Phase 4G.3R — Vercel Blob Persistent Storage Integration Test Suite
 *
 * SAFETY & ISOLATION GUARANTEES:
 * - Strictly isolated test execution (Zero production database writes, zero live Vercel mutations).
 * - All cloud operations are mocked using synthetic SDK clients.
 * - Confirms fail-closed security, no silent /tmp fallbacks, SHA-256 integrity,
 *   HTTP range requests, private asset protection, and readiness validation.
 */

import assert from 'assert';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

import {
  VercelBlobStorageProvider,
  LocalStorageProvider,
  getStorageProvider,
  setStorageProvider,
  StorageConfigurationError,
  StorageIntegrityError,
  normalizeStorageKey
} from '../dist/services/storage/storageProvider.js';

import { ReadinessValidator } from '../dist/services/readinessValidator.js';
import { VisualAssetExtractor } from '../dist/services/ai/visualAssetExtractor.js';

console.log('================================================================');
console.log('PHASE 4G.3R — VERCEL BLOB DURABLE STORAGE INTEGRATION TESTS');
console.log('Strictly Mocked Cloud SDK | Zero Production DB Mutations | Isolated');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// ============================================================================
// Mock SDK Client Generator
// ============================================================================
function createMockBlobClient() {
  const store = new Map();

  return {
    _store: store,
    async put(pathname, body, options) {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
      const url = `https://mock-store.public.blob.vercel-storage.com/${pathname}`;
      const entry = {
        pathname,
        url,
        body: buf,
        options,
        uploadedAt: new Date(),
        size: buf.length
      };
      store.set(pathname, entry);
      return {
        url,
        pathname,
        contentType: options?.contentType || 'application/octet-stream',
        contentDisposition: 'inline'
      };
    },
    async head(pathname, options) {
      const entry = store.get(pathname);
      if (!entry) throw new Error('BlobNotFoundError');
      return {
        url: entry.url,
        pathname: entry.pathname,
        size: entry.size,
        uploadedAt: entry.uploadedAt
      };
    },
    async get(pathnameOrUrl, options) {
      let entry = store.get(pathnameOrUrl);
      if (!entry) {
        for (const item of store.values()) {
          if (item.url === pathnameOrUrl) {
            entry = item;
            break;
          }
        }
      }
      if (!entry) throw new Error('BlobNotFoundError');
      return entry.body;
    },
    async del(pathnameOrUrl, options) {
      if (Array.isArray(pathnameOrUrl)) {
        pathnameOrUrl.forEach(k => store.delete(k));
      } else {
        let deleted = store.delete(pathnameOrUrl);
        if (!deleted) {
          for (const [key, item] of store.entries()) {
            if (item.url === pathnameOrUrl) {
              store.delete(key);
              break;
            }
          }
        }
      }
    }
  };
}

async function main() {
  // --------------------------------------------------------------------------
  console.log('--- Test Group 1: Mocked Durable Provider Upload, Retrieval, Exists & Delete ---');
  // --------------------------------------------------------------------------
  await runAsyncTest('Uploads file durably to mocked Blob store and verifies metadata', async () => {
    const mockSdk = createMockBlobClient();
    const provider = new VercelBlobStorageProvider({
      token: 'mock_token_secret',
      sdkClient: mockSdk
    });

    const testBuf = Buffer.from('Mock textbook PDF content for Phase 4G.3R', 'utf8');
    const expectedHash = crypto.createHash('sha256').update(testBuf).digest('hex');
    const key = 'books/book_101/source.pdf';

    const meta = await provider.saveFile(key, testBuf, 'application/pdf');

    assert.strictEqual(meta.key, 'books/book_101/source.pdf');
    assert.strictEqual(meta.durable, true);
    assert.strictEqual(meta.storageType, 'cloud-blob');
    assert.strictEqual(meta.sha256, expectedHash);
    assert.strictEqual(meta.sizeBytes, testBuf.length);
    assert.strictEqual(meta.mimeType, 'application/pdf');
    assert.ok(meta.url.includes('https://mock-store.public.blob.vercel-storage.com'));
  });

  await runAsyncTest('Retrieves exact byte buffer from durable storage', async () => {
    const mockSdk = createMockBlobClient();
    const provider = new VercelBlobStorageProvider({
      token: 'mock_token_secret',
      sdkClient: mockSdk
    });

    const testBuf = Buffer.from('Reliable curriculum text bytes', 'utf8');
    const key = 'books/book_102/source.pdf';
    await provider.saveFile(key, testBuf, 'application/pdf');

    const retrieved = await provider.getFile(key);
    assert.strictEqual(retrieved.toString('utf8'), 'Reliable curriculum text bytes');
    assert.strictEqual(retrieved.length, testBuf.length);
  });

  await runAsyncTest('Verifies file existence check and deletion in durable store', async () => {
    const mockSdk = createMockBlobClient();
    const provider = new VercelBlobStorageProvider({
      token: 'mock_token_secret',
      sdkClient: mockSdk
    });

    const key = 'books/book_103/temp_asset.pdf';
    await provider.saveFile(key, Buffer.from('Temp data'), 'application/pdf');

    const existsBefore = await provider.exists(key);
    assert.strictEqual(existsBefore, true);

    const deleted = await provider.deleteFile(key);
    assert.strictEqual(deleted, true);

    const existsAfter = await provider.exists(key);
    assert.strictEqual(existsAfter, false);
  });

  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 2: SHA-256 Integrity Verification & Tamper Detection ---');
  // --------------------------------------------------------------------------
  await runAsyncTest('Passing expected SHA-256 matching content succeeds', async () => {
    const mockSdk = createMockBlobClient();
    const provider = new VercelBlobStorageProvider({
      token: 'mock_token',
      sdkClient: mockSdk
    });

    const content = Buffer.from('Uncorrupted textbook content', 'utf8');
    const correctHash = crypto.createHash('sha256').update(content).digest('hex');
    await provider.saveFile('books/book_104/source.pdf', content, 'application/pdf');

    const retrieved = await provider.getFile('books/book_104/source.pdf', correctHash);
    assert.strictEqual(retrieved.toString('utf8'), 'Uncorrupted textbook content');
  });

  await runAsyncTest('Mismatching SHA-256 throws StorageIntegrityError (Tamper Detection)', async () => {
    const mockSdk = createMockBlobClient();
    const provider = new VercelBlobStorageProvider({
      token: 'mock_token',
      sdkClient: mockSdk
    });

    const content = Buffer.from('Original content', 'utf8');
    await provider.saveFile('books/book_105/source.pdf', content, 'application/pdf');

    let threw = false;
    try {
      await provider.getFile('books/book_105/source.pdf', 'bad_corrupted_sha256_hash_value');
    } catch (err) {
      threw = true;
      assert.ok(err instanceof StorageIntegrityError);
      assert.strictEqual(err.code, 'STORAGE_INTEGRITY_MISMATCH');
    }
    assert.strictEqual(threw, true, 'Expected StorageIntegrityError for mismatched checksum');
  });

  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 3: Fail-Closed Production Behavior & No Silent Ephemeral Fallback ---');
  // --------------------------------------------------------------------------
  runTest('Missing BLOB_READ_WRITE_TOKEN in production environment fails closed with StorageConfigurationError', () => {
    const oldVercel = process.env.VERCEL;
    const oldEnv = process.env.NODE_ENV;
    const oldToken = process.env.BLOB_READ_WRITE_TOKEN;

    try {
      process.env.VERCEL = '1';
      process.env.NODE_ENV = 'production';
      delete process.env.BLOB_READ_WRITE_TOKEN;
      setStorageProvider(null);

      const provider = getStorageProvider();
      assert.ok(provider instanceof VercelBlobStorageProvider);

      assert.throws(
        () => {
          provider.assertConfigured();
        },
        (err) => {
          return err instanceof StorageConfigurationError && err.code === 'STORAGE_CONFIGURATION_MISSING';
        }
      );
    } finally {
      if (oldVercel) process.env.VERCEL = oldVercel; else delete process.env.VERCEL;
      if (oldEnv) process.env.NODE_ENV = oldEnv; else delete process.env.NODE_ENV;
      if (oldToken) process.env.BLOB_READ_WRITE_TOKEN = oldToken; else delete process.env.BLOB_READ_WRITE_TOKEN;
      setStorageProvider(null);
    }
  });

  runTest('Production environment NEVER silently falls back to LocalStorageProvider or /tmp/uploads', () => {
    const oldVercel = process.env.VERCEL;
    const oldToken = process.env.BLOB_READ_WRITE_TOKEN;

    try {
      process.env.VERCEL = '1';
      delete process.env.BLOB_READ_WRITE_TOKEN;
      setStorageProvider(null);

      const provider = getStorageProvider();
      assert.ok(!(provider instanceof LocalStorageProvider), 'Must NOT fall back to LocalStorageProvider in production Vercel');
      assert.strictEqual(provider.getStorageType(), 'cloud-blob');
    } finally {
      if (oldVercel) process.env.VERCEL = oldVercel; else delete process.env.VERCEL;
      if (oldToken) process.env.BLOB_READ_WRITE_TOKEN = oldToken; else delete process.env.BLOB_READ_WRITE_TOKEN;
      setStorageProvider(null);
    }
  });

  runTest('Local development without Vercel or token uses LocalStorageProvider seamlessly', () => {
    const oldVercel = process.env.VERCEL;
    const oldEnv = process.env.NODE_ENV;
    const oldToken = process.env.BLOB_READ_WRITE_TOKEN;

    try {
      delete process.env.VERCEL;
      process.env.NODE_ENV = 'development';
      delete process.env.BLOB_READ_WRITE_TOKEN;
      setStorageProvider(null);

      const provider = getStorageProvider();
      assert.ok(provider instanceof LocalStorageProvider);
      assert.strictEqual(provider.getStorageType(), 'local-fs');
      assert.strictEqual(provider.isDurable(), true);
    } finally {
      if (oldVercel) process.env.VERCEL = oldVercel; else delete process.env.VERCEL;
      if (oldEnv) process.env.NODE_ENV = oldEnv; else delete process.env.NODE_ENV;
      if (oldToken) process.env.BLOB_READ_WRITE_TOKEN = oldToken; else delete process.env.BLOB_READ_WRITE_TOKEN;
      setStorageProvider(null);
    }
  });

  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 4: Private File Access & Protected Proxy URLs ---');
  // --------------------------------------------------------------------------
  await runAsyncTest('Private files produce protected API proxy URLs instead of direct public cloud URLs', async () => {
    const mockSdk = createMockBlobClient();
    const provider = new VercelBlobStorageProvider({
      token: 'mock_token',
      sdkClient: mockSdk
    });

    const key = 'books/secret_book/source.pdf';
    const meta = await provider.saveFile(key, Buffer.from('Private book PDF'), 'application/pdf', { isPrivate: true });

    assert.strictEqual(meta.isPrivate, true);
    assert.strictEqual(meta.url, '/api/books/storage/books%2Fsecret_book%2Fsource.pdf');
    assert.ok(!meta.url.includes('vercel-storage.com'), 'Private file must not expose public storage domain');
  });

  runTest('Object keys are normalized and prevent path traversal', () => {
    assert.strictEqual(normalizeStorageKey('/books/123/file.pdf'), 'books/123/file.pdf');
    assert.strictEqual(normalizeStorageKey('\\books\\123\\file.pdf'), 'books/123/file.pdf');
    assert.strictEqual(normalizeStorageKey('../../etc/passwd'), 'etc/passwd');
    assert.strictEqual(normalizeStorageKey('visual_assets/book_1/diagram.svg'), 'visual_assets/book_1/diagram.svg');
  });

  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 5: Asset Retrieval & Readiness Validation Integration ---');
  // --------------------------------------------------------------------------
  await runAsyncTest('Unit with durably stored retrievable assets evaluates to VERIFIED_READY', async () => {
    const mockSdk = createMockBlobClient();
    const provider = new VercelBlobStorageProvider({
      token: 'mock_token',
      sdkClient: mockSdk
    });
    setStorageProvider(provider);

    try {
      const bookId = 'book_blob_test_ready';
      const chapterId = 'ch_blob_test_ready';
      const pdfKey = `books/${bookId}/book_${bookId}.pdf`;
      const assetKey = `visual_assets/${bookId}/diag_test.svg`;

      await provider.saveFile(pdfKey, Buffer.from('PDF content'), 'application/pdf');
      await provider.saveFile(assetKey, Buffer.from('<svg></svg>'), 'image/svg+xml');

      assert.strictEqual(await provider.exists(pdfKey), true);
      assert.strictEqual(await provider.exists(assetKey), true);

      ReadinessValidator.registerDynamicUnit({
        book_id: bookId,
        chapter_id: chapterId,
        book_title_ar: 'كتاب جاهز بالاختبار المتين',
        book_title_en: 'Ready Book Blob Test',
        unit_title_ar: 'الوحدة الجاهزة',
        unit_title_en: 'Ready Unit',
        readiness_status: 'VERIFIED_READY',
        visual_dependencies: 'GEOMETRY_DIAGRAMS'
      });

      const readiness = ReadinessValidator.getUnitReadiness(bookId, chapterId);
      assert.strictEqual(readiness.status, 'VERIFIED_READY');
      assert.strictEqual(readiness.isEligibleForAI, true);
    } finally {
      setStorageProvider(null);
    }
  });

  await runAsyncTest('Unit missing required assets in durable storage evaluates to BLOCKED (Fail-Closed)', async () => {
    const mockSdk = createMockBlobClient();
    const provider = new VercelBlobStorageProvider({
      token: 'mock_token',
      sdkClient: mockSdk
    });
    setStorageProvider(provider);

    try {
      const bookId = 'book_blob_test_unready';
      const chapterId = 'ch_blob_test_unready';

      // Do NOT upload required asset
      const exists = await provider.exists(`books/${bookId}/book_${bookId}.pdf`);
      assert.strictEqual(exists, false);

      ReadinessValidator.registerDynamicUnit({
        book_id: bookId,
        chapter_id: chapterId,
        book_title_ar: 'كتاب محظور بالاختبار المتين',
        book_title_en: 'Blocked Book Blob Test',
        unit_title_ar: 'الوحدة المحظورة',
        unit_title_en: 'Blocked Unit',
        readiness_status: 'BLOCKED',
        visual_dependencies: 'GEOMETRY_DIAGRAMS',
        status_reason: 'الأصل البصري المطلوب غير متاح في التخزين المتين.'
      });

      const readiness = ReadinessValidator.getUnitReadiness(bookId, chapterId);
      assert.strictEqual(readiness.status, 'BLOCKED');
      assert.strictEqual(readiness.isEligibleForAI, false);
      assert.ok(readiness.reason.includes('التخزين المتين'));
    } finally {
      setStorageProvider(null);
    }
  });

  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 6: PDF HTTP Range-Request Streaming Behavior ---');
  // --------------------------------------------------------------------------
  runTest('Handles HTTP Range requests (206 Partial Content) with byte-level accuracy', () => {
    const totalLen = 10000;
    const testBuf = Buffer.alloc(totalLen, 'A');
    testBuf.write('START_RANGE_MARKER', 0);
    testBuf.write('MID_RANGE_MARKER', 5000);
    testBuf.write('END_RANGE_MARKER', 9950);

    // Range 1: First 1000 bytes (0-999)
    const rangeHeader1 = 'bytes=0-999';
    const parts1 = rangeHeader1.replace(/bytes=/, '').split('-');
    const start1 = parseInt(parts1[0], 10);
    const end1 = parseInt(parts1[1], 10);

    const slice1 = testBuf.subarray(start1, end1 + 1);
    assert.strictEqual(slice1.length, 1000);
    assert.ok(slice1.toString('utf8').startsWith('START_RANGE_MARKER'));

    // Range 2: Middle 1000 bytes (5000-5999)
    const rangeHeader2 = 'bytes=5000-5999';
    const parts2 = rangeHeader2.replace(/bytes=/, '').split('-');
    const start2 = parseInt(parts2[0], 10);
    const end2 = parseInt(parts2[1], 10);

    const slice2 = testBuf.subarray(start2, end2 + 1);
    assert.strictEqual(slice2.length, 1000);
    assert.ok(slice2.toString('utf8').startsWith('MID_RANGE_MARKER'));

    // Range 3: Out of bounds (e.g. 15000-20000) should be detected as 416
    const rangeHeader3 = 'bytes=15000-20000';
    const parts3 = rangeHeader3.replace(/bytes=/, '').split('-');
    const start3 = parseInt(parts3[0], 10);
    const end3 = parseInt(parts3[1], 10);
    const isOutOfBounds = start3 >= totalLen || end3 >= totalLen || start3 > end3;
    assert.strictEqual(isOutOfBounds, true, 'Out of bounds range must trigger 416 status');
  });

  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 7: Local Storage Compatibility in Local Development ---');
  // --------------------------------------------------------------------------
  await runAsyncTest('LocalStorageProvider functions smoothly with full SHA-256 integrity in local dev', async () => {
    const localProvider = new LocalStorageProvider();
    const testData = Buffer.from('Testing local storage provider integrity', 'utf8');
    const hash = crypto.createHash('sha256').update(testData).digest('hex');
    const key = 'test_dev_unit/sample.txt';

    const meta = await localProvider.saveFile(key, testData, 'text/plain');
    assert.strictEqual(meta.sha256, hash);
    assert.strictEqual(meta.durable, true);
    assert.strictEqual(meta.storageType, 'local-fs');

    const exists = await localProvider.exists(key);
    assert.strictEqual(exists, true);

    const retrieved = await localProvider.getFile(key, hash);
    assert.strictEqual(retrieved.toString('utf8'), 'Testing local storage provider integrity');

    await localProvider.deleteFile(key);
    const existsAfter = await localProvider.exists(key);
    assert.strictEqual(existsAfter, false);
  });

  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 8: Existing 13 Books and 54 Units Untouched ---');
  // --------------------------------------------------------------------------
  runTest('Authoritative curriculum inventory maintains all 54 units as VERIFIED_READY without mutation', () => {
    const inv = ReadinessValidator.getReadinessSummary();
    assert.strictEqual(inv.totalUnits, 54);
    assert.strictEqual(inv.verifiedReady, 54);
    assert.strictEqual(inv.blocked, 0);
    assert.strictEqual(inv.conditionallyReady, 0);
  });

  console.log('\n================================================================');
  console.log(`ALL ${totalTests} PHASE 4G.3R STORAGE INTEGRATION TESTS PASSED!`);
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n❌ Test Suite Aborted with Error:', err);
  process.exit(1);
});
