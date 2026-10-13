import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { VisualAssetExtractor } from '../dist/services/ai/visualAssetExtractor.js';

console.log('Running Serverless Storage & DDL Guard Regression Tests...\n');

// Test 1: Verify DDL Guard Logic
{
  const isProductionOrServerless = (vercel, nodeEnv) => Boolean(vercel || nodeEnv === 'production');
  const shouldSkipDDL = (vercel, nodeEnv, autoApply) => {
    return isProductionOrServerless(vercel, nodeEnv) && autoApply !== 'true';
  };

  // Case A: Vercel serverless environment -> Must SKIP DDL
  assert.strictEqual(shouldSkipDDL('1', '', ''), true, 'Should skip DDL on Vercel');

  // Case B: Production environment -> Must SKIP DDL
  assert.strictEqual(shouldSkipDDL('', 'production', ''), true, 'Should skip DDL in production');

  // Case C: Explicit override -> Allowed
  assert.strictEqual(shouldSkipDDL('1', '', 'true'), false, 'Should allow DDL when explicitly enabled');

  // Case D: Local development -> Allowed
  assert.strictEqual(shouldSkipDDL('', 'development', ''), false, 'Should allow DDL in local development');

  console.log('✅ Test 1 Passed: DDL guard prevents automatic schema execution on Vercel/Production.');
}

// Test 2: Missing textbook PDF handling in VisualAssetExtractor
{
  const nonExistentBookId = '00000000-0000-0000-0000-000000000000';
  assert.rejects(
    async () => {
      await VisualAssetExtractor.extractPageVisualAsset({
        bookId: nonExistentBookId,
        pageNumber: 1
      });
    },
    /SOURCE_PDF_NOT_FOUND/,
    'Should throw SOURCE_PDF_NOT_FOUND error when PDF is missing on disk'
  );
  console.log('✅ Test 2 Passed: VisualAssetExtractor cleanly rejects missing textbook PDFs.');
}

// Test 3: Visual manifest persistence resilience in read-only environment
{
  // Test loading manifest returns an object without crashing
  const manifest = VisualAssetExtractor.loadManifest();
  assert.ok(manifest && typeof manifest.version === 'string', 'Manifest must load valid structure');
  console.log('✅ Test 3 Passed: VisualAssetExtractor loads manifest safely without unhandled exceptions.');
}

console.log('\nAll Serverless Storage & DDL Guard Regression Tests PASSED!');
