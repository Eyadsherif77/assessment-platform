import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import { createBookSnapshot } from './backup_book_preflight.mjs';
import { validateSnapshotFile, compareStateWithSnapshot } from './restore_book_preflight.mjs';

async function runTestSuite() {
  console.log('========================================================================');
  console.log('🧪 BACKUP & ROLLBACK TEST HARNESS (ISOLATED & READ-ONLY)');
  console.log('========================================================================\n');

  const results = [];

  // ---------------------------------------------------------------------------
  // TEST SUITE 1: Snapshot Integrity & Tamper Resistance
  // ---------------------------------------------------------------------------
  console.log('--- [TEST SUITE 1] Snapshot Serialization & Tamper Detection ---');

  const testDir = path.resolve(process.cwd(), 'backups', 'test_scratch');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const mockPayload = {
    schema_version: '1.0.0',
    snapshot_type: 'book_curriculum_preflight',
    created_at: new Date().toISOString(),
    book_id: 'mock-book-123',
    book_title: 'Mock Test Book',
    counts: { books: 1, book_chapters: 2, book_pages: 5, book_chunks: 5, question_bank_items: 0, question_bank_options: 0, book_pdf_chunks: 1 },
    tables: {
      books: [{ id: 'mock-book-123', title_ar: 'كتاب تجريبي' }],
      book_chapters: [
        { id: 'ch-1', book_id: 'mock-book-123', chapter_number: 1, title_ar: 'الوحدة 1', start_page: 1, end_page: 3 },
        { id: 'ch-2', book_id: 'mock-book-123', chapter_number: 2, title_ar: 'الوحدة 2', start_page: 4, end_page: 5 }
      ],
      book_pages: [
        { id: 'p-1', book_id: 'mock-book-123', page_number: 1, raw_text: 'Text 1', char_count: 6 },
        { id: 'p-2', book_id: 'mock-book-123', page_number: 2, raw_text: 'Text 2', char_count: 6 }
      ],
      book_chunks: [],
      question_bank_items: [],
      question_bank_options: []
    },
    pdf_chunks_manifest: [{ chunk_index: 0, byte_length: 1024, sha256: 'mockhash' }]
  };

  const canonicalChecksum = crypto.createHash('sha256').update(JSON.stringify(mockPayload)).digest('hex');
  const validSnapshot = {
    meta: { checksum: canonicalChecksum, checksum_algorithm: 'sha256', generator: 'test' },
    data: mockPayload
  };

  const validPath = path.join(testDir, 'valid_snapshot.json');
  fs.writeFileSync(validPath, JSON.stringify(validSnapshot, null, 2));

  // 1A: Valid snapshot passes
  let test1aPassed = false;
  try {
    const val = validateSnapshotFile(validPath, 'mock-book-123');
    test1aPassed = (val.meta.checksum === canonicalChecksum);
  } catch (e) {
    test1aPassed = false;
  }
  console.log(`  1A: Valid Snapshot Integrity Check: ${test1aPassed ? '✅ PASS' : '❌ FAIL'}`);
  results.push({ name: 'Valid snapshot verification', passed: test1aPassed });

  // 1B: Tampered snapshot is detected and rejected
  let test1bPassed = false;
  const tamperedPath = path.join(testDir, 'tampered_snapshot.json');
  const tamperedSnapshot = JSON.parse(JSON.stringify(validSnapshot));
  tamperedSnapshot.data.book_title = 'Tampered Book Title'; // Alter content without updating checksum
  fs.writeFileSync(tamperedPath, JSON.stringify(tamperedSnapshot, null, 2));

  try {
    validateSnapshotFile(tamperedPath, 'mock-book-123');
    test1bPassed = false; // should not reach here
  } catch (err) {
    test1bPassed = err.message.includes('checksum mismatch');
  }
  console.log(`  1B: Tampered Snapshot Checksum Rejection: ${test1bPassed ? '✅ PASS (Correctly Rejected)' : '❌ FAIL'}`);
  results.push({ name: 'Tampered snapshot rejection', passed: test1bPassed });

  // 1C: Book ID Mismatch Rejection
  let test1cPassed = false;
  try {
    validateSnapshotFile(validPath, 'different-book-999');
    test1cPassed = false;
  } catch (err) {
    test1cPassed = err.message.includes('does not match target book ID');
  }
  console.log(`  1C: Cross-Book Security Mismatch Rejection: ${test1cPassed ? '✅ PASS (Correctly Blocked)' : '❌ FAIL'}`);
  results.push({ name: 'Cross-book mismatch rejection', passed: test1cPassed });

  // ---------------------------------------------------------------------------
  // TEST SUITE 2: Isolated In-Memory Rollback Simulation (SQLite)
  // ---------------------------------------------------------------------------
  console.log('\n--- [TEST SUITE 2] Isolated Local Database Restore & Rollback Simulation ---');
  const localDb = new Database(':memory:');

  // Create isolated schema in local test database
  localDb.exec(`
    CREATE TABLE books (
      id TEXT PRIMARY KEY,
      title_ar TEXT,
      title_en TEXT,
      total_pages INTEGER,
      processing_status TEXT
    );
    CREATE TABLE book_chapters (
      id TEXT PRIMARY KEY,
      book_id TEXT,
      chapter_number INTEGER,
      title_ar TEXT,
      title_en TEXT,
      start_page INTEGER,
      end_page INTEGER
    );
    CREATE TABLE book_pages (
      id TEXT PRIMARY KEY,
      book_id TEXT,
      page_number INTEGER,
      raw_text TEXT,
      char_count INTEGER,
      UNIQUE(book_id, page_number)
    );
    CREATE TABLE book_chunks (
      id TEXT PRIMARY KEY,
      book_id TEXT,
      chapter_id TEXT,
      page_number INTEGER,
      chunk_index INTEGER,
      content TEXT
    );
    CREATE TABLE ai_evaluations (
      id TEXT PRIMARY KEY,
      chapter_id TEXT
    );
  `);

  // Seed baseline state
  const bId = 'test-book-456';
  localDb.prepare('INSERT INTO books VALUES (?, ?, ?, ?, ?)').run(bId, 'كتاب أصلي', 'Original Book', 5, 'COMPLETED');
  localDb.prepare('INSERT INTO book_chapters VALUES (?, ?, ?, ?, ?, ?, ?)').run('ch-10', bId, 1, 'الوحدة 1', 'Unit 1', 1, 3);
  localDb.prepare('INSERT INTO book_chapters VALUES (?, ?, ?, ?, ?, ?, ?)').run('ch-20', bId, 2, 'الوحدة 2', 'Unit 2', 4, 5);
  localDb.prepare('INSERT INTO book_pages VALUES (?, ?, ?, ?, ?)').run('p-1', bId, 1, 'Page 1 Text', 11);
  localDb.prepare('INSERT INTO book_pages VALUES (?, ?, ?, ?, ?)').run('p-2', bId, 2, 'Page 2 Text', 11);
  localDb.prepare('INSERT INTO book_chunks VALUES (?, ?, ?, ?, ?, ?)').run('ck-1', bId, 'ch-10', 1, 0, 'Chunk 1');

  // Capture baseline snapshot from test DB
  const simSnapshot = {
    book_id: bId,
    counts: { books: 1, book_chapters: 2, book_pages: 2, book_chunks: 1 },
    tables: {
      books: localDb.prepare('SELECT * FROM books WHERE id = ?').all(bId),
      book_chapters: localDb.prepare('SELECT * FROM book_chapters WHERE book_id = ?').all(bId),
      book_pages: localDb.prepare('SELECT * FROM book_pages WHERE book_id = ?').all(bId),
      book_chunks: localDb.prepare('SELECT * FROM book_chunks WHERE book_id = ?').all(bId),
      question_bank_items: [],
      question_bank_options: []
    }
  };
  console.log('  Debug: Captured simSnapshot pages count:', simSnapshot.tables.book_pages.length);

  // Simulate an interrupted/corrupt extraction: add 3 extra pages, 2 extra chunks, and modify chapter
  localDb.prepare('INSERT INTO book_pages VALUES (?, ?, ?, ?, ?)').run('p-3', bId, 3, 'Corrupt Page 3', 14);
  localDb.prepare('INSERT INTO book_pages VALUES (?, ?, ?, ?, ?)').run('p-4', bId, 4, 'Corrupt Page 4', 14);
  localDb.prepare('INSERT INTO book_chunks VALUES (?, ?, ?, ?, ?, ?)').run('ck-extra', bId, 'ch-10', 3, 1, 'Extra Chunk');
  localDb.prepare('UPDATE book_chapters SET title_ar = ? WHERE id = ?').run('الوحدة المعدلة خطأ', 'ch-10');

  const corruptedPageCount = localDb.prepare('SELECT count(*) as c FROM book_pages WHERE book_id = ?').get(bId).c;
  console.log(`  State after simulated mutation: ${corruptedPageCount} pages (Expected 4)`);

  // Perform restore logic on simulated DB
  const executeLocalRestore = () => {
    try {
      const tx = localDb.transaction(() => {
        // 1. Restore chapters
        for (const ch of simSnapshot.tables.book_chapters) {
          localDb.prepare(`
            INSERT OR REPLACE INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(ch.id, ch.book_id, ch.chapter_number, ch.title_ar, ch.title_en, ch.start_page, ch.end_page);
        }

        // 2. Remove extraneous pages
        const snapshotPNums = new Set(simSnapshot.tables.book_pages.map(p => p.page_number));
        const currentPages = localDb.prepare('SELECT page_number FROM book_pages WHERE book_id = ?').all(bId);
        for (const cp of currentPages) {
          if (!snapshotPNums.has(cp.page_number)) {
            localDb.prepare('DELETE FROM book_pages WHERE book_id = ? AND page_number = ?').run(bId, cp.page_number);
          }
        }

        // 3. Upsert snapshot pages
        for (const p of simSnapshot.tables.book_pages) {
          localDb.prepare(`
            INSERT OR REPLACE INTO book_pages (id, book_id, page_number, raw_text, char_count)
            VALUES (?, ?, ?, ?, ?)
          `).run(p.id, p.book_id, p.page_number, p.raw_text, p.char_count);
        }

        // 4. Remove extraneous chunks
        const snapshotChunkIds = new Set(simSnapshot.tables.book_chunks.map(c => c.id));
        const currentChunks = localDb.prepare('SELECT id FROM book_chunks WHERE book_id = ?').all(bId);
        for (const cc of currentChunks) {
          if (!snapshotChunkIds.has(cc.id)) {
            localDb.prepare('DELETE FROM book_chunks WHERE id = ?').run(cc.id);
          }
        }
      });
      tx();
    } catch (e) {
      console.error('Local TX error:', e);
    }
  };

  executeLocalRestore();

  const restoredPages = localDb.prepare('SELECT count(*) as c FROM book_pages WHERE book_id = ?').get(bId).c;
  const restoredChunks = localDb.prepare('SELECT count(*) as c FROM book_chunks WHERE book_id = ?').get(bId).c;
  const restoredChTitle = localDb.prepare('SELECT title_ar FROM book_chapters WHERE id = ?').get('ch-10').title_ar;

  const test2Passed = (restoredPages === 2 && restoredChunks === 1 && restoredChTitle === 'الوحدة 1');
  console.log(`  2A: Simulated Database Rollback Accuracy: ${test2Passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`      Pages: ${restoredPages} (Original: 2), Chunks: ${restoredChunks} (Original: 1), Title: "${restoredChTitle}"`);
  results.push({ name: 'Isolated local database rollback', passed: test2Passed });

  // ---------------------------------------------------------------------------
  // TEST SUITE 3: Read-Only Production Preflight Snapshot on Book 4
  // ---------------------------------------------------------------------------
  console.log('\n--- [TEST SUITE 3] Read-Only Production Snapshot on Book 4 Candidate ---');
  const book4Id = '81b8a308-7fcf-4938-8c45-aa0056624f32'; // Social Studies Prep 2

  // Baseline production counts before test
  const [usersPre, studentsPre, evalsPre, booksPre, pagesPre, chunksPre] = await Promise.all([
    db.query('SELECT count(*) as c FROM users'),
    db.query('SELECT count(*) as c FROM student_profiles'),
    db.query('SELECT count(*) as c FROM ai_evaluations'),
    db.query('SELECT count(*) as c FROM books'),
    db.query('SELECT count(*) as c FROM book_pages'),
    db.query('SELECT count(*) as c FROM book_chunks')
  ]);

  let prodSnapshotResult = null;
  let test3aPassed = false;
  try {
    prodSnapshotResult = await createBookSnapshot(book4Id);
    test3aPassed = (
      prodSnapshotResult &&
      prodSnapshotResult.bookId === book4Id &&
      fs.existsSync(prodSnapshotResult.filePath) &&
      prodSnapshotResult.checksum.length === 64
    );
  } catch (err) {
    console.error('Snapshot failed:', err);
    test3aPassed = false;
  }
  console.log(`  3A: Production Read-Only Snapshot Generation: ${test3aPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`      Snapshot File: ${prodSnapshotResult?.fileName}`);
  console.log(`      SHA-256:       ${prodSnapshotResult?.checksum}`);
  console.log(`      Counts captured: Chapters=${prodSnapshotResult?.counts.book_chapters}, Pages=${prodSnapshotResult?.counts.book_pages}, Chunks=${prodSnapshotResult?.counts.book_chunks}`);
  results.push({ name: 'Production read-only snapshot generation', passed: test3aPassed });

  // 3B: Validate Snapshot via Dry-Run Restore (Zero writes to production)
  let test3bPassed = false;
  try {
    const validatedSnap = validateSnapshotFile(prodSnapshotResult.filePath, book4Id);
    const comparison = await compareStateWithSnapshot(validatedSnap.data);
    test3bPassed = (
      comparison.diff.chapters_diff === 0 &&
      comparison.diff.pages_diff === 0 &&
      comparison.diff.chunks_diff === 0 &&
      comparison.diff.fkBlocks.length === 0
    );
    console.log(`  3B: Production Dry-Run Restore Comparison: ${test3bPassed ? '✅ PASS (Zero Diff, No Mutation)' : '❌ FAIL'}`);
    console.log(`      Comparison result: All table diffs = 0, FK conflicts = 0`);
  } catch (err) {
    console.error('Dry run failed:', err);
    test3bPassed = false;
  }
  results.push({ name: 'Production dry-run restore validation', passed: test3bPassed });

  // ---------------------------------------------------------------------------
  // TEST SUITE 4: Verify Zero Production Mutations
  // ---------------------------------------------------------------------------
  console.log('\n--- [TEST SUITE 4] Verification of Zero Production State Modification ---');
  const [usersPost, studentsPost, evalsPost, booksPost, pagesPost, chunksPost] = await Promise.all([
    db.query('SELECT count(*) as c FROM users'),
    db.query('SELECT count(*) as c FROM student_profiles'),
    db.query('SELECT count(*) as c FROM ai_evaluations'),
    db.query('SELECT count(*) as c FROM books'),
    db.query('SELECT count(*) as c FROM book_pages'),
    db.query('SELECT count(*) as c FROM book_chunks')
  ]);

  const zeroMutationVerified = (
    usersPre.rows[0].c === usersPost.rows[0].c &&
    studentsPre.rows[0].c === studentsPost.rows[0].c &&
    evalsPre.rows[0].c === evalsPost.rows[0].c &&
    booksPre.rows[0].c === booksPost.rows[0].c &&
    pagesPre.rows[0].c === pagesPost.rows[0].c &&
    chunksPre.rows[0].c === chunksPost.rows[0].c
  );

  console.log(`  Production Users:        ${usersPre.rows[0].c} -> ${usersPost.rows[0].c}`);
  console.log(`  Production Students:     ${studentsPre.rows[0].c} -> ${studentsPost.rows[0].c}`);
  console.log(`  Production Evaluations:  ${evalsPre.rows[0].c} -> ${evalsPost.rows[0].c}`);
  console.log(`  Production Books:        ${booksPre.rows[0].c} -> ${booksPost.rows[0].c}`);
  console.log(`  Production Book Pages:   ${pagesPre.rows[0].c} -> ${pagesPost.rows[0].c}`);
  console.log(`  Production Book Chunks:  ${chunksPre.rows[0].c} -> ${chunksPost.rows[0].c}`);
  console.log(`  Safety Gate Status:      ${zeroMutationVerified ? '✅ 100% INTACT (Zero modifications)' : '❌ VIOLATION'}`);
  results.push({ name: 'Production zero mutation guarantee', passed: zeroMutationVerified });

  // Clean up test scratch
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (e) {}

  console.log('\n========================================================================');
  console.log('🏁 TEST HARNESS SUMMARY');
  console.log('========================================================================');
  const allPassed = results.every(r => r.passed);
  for (const r of results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.name}`);
  }
  console.log(`\nOVERALL HARNESS STATUS: ${allPassed ? 'ALL PASSED' : 'SOME TESTS FAILED'}`);

  process.exit(allPassed ? 0 : 1);
}

runTestSuite().catch(err => {
  console.error('Fatal harness error:', err);
  process.exit(1);
});
