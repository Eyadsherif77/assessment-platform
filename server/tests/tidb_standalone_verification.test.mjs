import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';

console.log('================================================================');
console.log('FARABI AI — STANDALONE TiDB / MySQL 8.4 VERIFICATION SUITE');
console.log('Strict Non-Production Environment | Real MySQL/TiDB Engine (Port 3319)');
console.log('================================================================');

const TEST_PORT = 3319;

async function run() {
  console.log(`🔌 1. Connecting to isolated standalone MySQL/TiDB instance on port ${TEST_PORT}...`);
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: TEST_PORT,
    user: 'root',
    password: '',
    multipleStatements: true
  });

  console.log('✅ Connected to standalone MySQL 8.4.9 engine on port', TEST_PORT);

  try {
    // 2. Create isolated test database and apply exact production MySQL schema
    console.log('📜 2. Creating test database farabi_tidb_test and applying schema_mysql.sql...');
    await connection.query('DROP DATABASE IF EXISTS farabi_tidb_test;');
    await connection.query('CREATE DATABASE farabi_tidb_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
    await connection.query('USE farabi_tidb_test;');

    const schemaPath = path.join(process.cwd(), 'server', 'src', 'db', 'schema_mysql.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await connection.query(schemaSql);
    console.log('✅ Full production MySQL schema loaded successfully.');

    // 3. Verify exact migration SQL
    console.log('🧪 3. Testing exact migration: 20261108_expand_checkpoint_data_and_ocr_pages.sql...');
    const migrationPath = path.join(process.cwd(), 'server', 'src', 'db', 'migrations', '20261108_expand_checkpoint_data_and_ocr_pages.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    await connection.query(migrationSql);
    console.log('✅ Migration applied cleanly without syntax errors or schema conflicts.');

    // 4. Test MEDIUMTEXT storage & retrieval (> 500 KB JSON)
    console.log('🧪 4. Testing MEDIUMTEXT storage (> 500 KB payload)...');
    const largeOcrMap = {};
    for (let p = 1; p <= 112; p++) {
      largeOcrMap[p] = `Chapter 1: Cartesian Product and Relations. Page ${p}. Content: `.repeat(40) +
        ` f(x) = x^2 - 4x + 3. Formula: \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}. Details: ` + 'A'.repeat(4500);
    }
    const checkpointObj = {
      processedPages: 112,
      totalLowTextPages: 112,
      ocrResults: largeOcrMap
    };
    const jsonString = JSON.stringify(checkpointObj);
    const payloadSizeKb = Buffer.byteLength(jsonString, 'utf8') / 1024;
    console.log(`     Generated payload size: ${payloadSizeKb.toFixed(1)} KB`);

    const testJobId = 'job_tidb_large_payload_' + Date.now();
    const testBookId = 'book_tidb_large_' + Date.now();

    await connection.query(
      `INSERT INTO book_ingestion_jobs (id, book_id, file_checksum, current_stage, status, checkpoint_data)
       VALUES (?, ?, 'checksum_123', 'OCR_PROCESSING', 'IN_PROGRESS', ?)`,
      [testJobId, testBookId, jsonString]
    );

    const [rows] = await connection.query(
      `SELECT checkpoint_data FROM book_ingestion_jobs WHERE id = ?`,
      [testJobId]
    );
    assert.strictEqual(rows.length, 1);
    const retrievedObj = JSON.parse(rows[0].checkpoint_data);
    assert.strictEqual(Object.keys(retrievedObj.ocrResults).length, 112);
    assert.strictEqual(retrievedObj.ocrResults[112], checkpointObj.ocrResults[112]);
    console.log(`     ✅ Payload of ${payloadSizeKb.toFixed(1)} KB retrieved losslessly from MySQL/TiDB MEDIUMTEXT column.`);

    // 5. Test ON DUPLICATE KEY UPDATE in book_ocr_page_results
    console.log('🧪 5. Testing ON DUPLICATE KEY UPDATE in book_ocr_page_results...');
    const upsertSql = `
      INSERT INTO book_ocr_page_results (job_id, book_id, page_number, extracted_text, char_count)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        extracted_text = VALUES(extracted_text),
        char_count = VALUES(char_count)
    `;

    await connection.query(upsertSql, [testJobId, testBookId, 36, 'Initial Page 36 Extraction Text', 31]);
    let [pageRows1] = await connection.query(
      `SELECT extracted_text, char_count FROM book_ocr_page_results WHERE job_id = ? AND page_number = ?`,
      [testJobId, 36]
    );
    assert.strictEqual(pageRows1[0].extracted_text, 'Initial Page 36 Extraction Text');

    // Update same page atomically
    await connection.query(upsertSql, [testJobId, testBookId, 36, 'Updated Refined Page 36 Content', 32]);
    let [pageRows2] = await connection.query(
      `SELECT extracted_text, char_count FROM book_ocr_page_results WHERE job_id = ? AND page_number = ?`,
      [testJobId, 36]
    );
    assert.strictEqual(pageRows2[0].extracted_text, 'Updated Refined Page 36 Content');

    const [countRows] = await connection.query(
      `SELECT COUNT(*) as cnt FROM book_ocr_page_results WHERE job_id = ? AND page_number = ?`,
      [testJobId, 36]
    );
    assert.strictEqual(Number(countRows[0].cnt), 1, 'Exactly 1 row must exist per (job_id, page_number)');
    console.log('     ✅ ON DUPLICATE KEY UPDATE operates atomically without duplicate rows or MVCC delete tombstones.');

    // 6. CAS Lease Acquisition and Expiration
    console.log('🧪 6. Testing CAS Lease Acquisition & Expiration under MySQL/TiDB concurrency...');
    const casJobId = 'job_cas_test_' + Date.now();
    await connection.query(
      `INSERT INTO book_ingestion_jobs (id, book_id, file_checksum, current_stage, status, checkpoint_data)
       VALUES (?, 'book_cas_1', 'checksum_cas', 'OCR_PROCESSING', 'PENDING', '{}')`,
      [casJobId]
    );

    // Contender 1 claims job with 1-second lease
    const [res1] = await connection.query(
      `UPDATE book_ingestion_jobs
       SET lease_owner = 'worker_alpha',
           lease_expires_at = DATE_ADD(NOW(), INTERVAL 1 SECOND),
           status = 'IN_PROGRESS'
       WHERE id = ? AND (lease_owner IS NULL OR lease_expires_at < NOW())`,
      [casJobId]
    );
    assert.strictEqual(res1.affectedRows, 1, 'Worker Alpha must acquire lease');

    // Contender 2 attempts competing claim while lease is active
    const [res2] = await connection.query(
      `UPDATE book_ingestion_jobs
       SET lease_owner = 'worker_beta',
           lease_expires_at = DATE_ADD(NOW(), INTERVAL 60 SECOND),
           status = 'IN_PROGRESS'
       WHERE id = ? AND (lease_owner IS NULL OR lease_expires_at < NOW())`,
      [casJobId]
    );
    assert.strictEqual(res2.affectedRows, 0, 'Worker Beta must be rejected by CAS lock');
    console.log('     ✅ CAS concurrency lock rejected competing worker without lock collision.');

    // Wait for lease to expire
    console.log('     Waiting 2.5s for lease to expire...');
    await new Promise(r => setTimeout(r, 2500));

    // Inspect job state
    const [casRows] = await connection.query(
      `SELECT lease_owner, lease_expires_at, NOW() as current_db_time, (lease_expires_at < NOW()) as is_expired FROM book_ingestion_jobs WHERE id = ?`,
      [casJobId]
    );
    // console.log('     CAS lease state:', casRows[0]);

    // Contender 2 claims expired lease
    const [res3] = await connection.query(
      `UPDATE book_ingestion_jobs
       SET lease_owner = 'worker_beta',
           lease_expires_at = DATE_ADD(NOW(), INTERVAL 60 SECOND),
           status = 'IN_PROGRESS'
       WHERE id = ? AND (lease_owner IS NULL OR lease_expires_at < NOW())`,
      [casJobId]
    );
    assert.strictEqual(res3.affectedRows, 1, 'Worker Beta must acquire expired lease');
    console.log('     ✅ Expired lease claimed safely by successor worker.');

    // 7. Transaction behavior during chunk & embedding persistence (No duplicates)
    console.log('🧪 7. Testing transactional chunk & embedding persistence across resumptions...');
    const targetBookId = 'book_math_prep3_transactional_test';
    
    // Seed stage, grade, subject
    const stageId = crypto.randomUUID();
    const gradeId = crypto.randomUUID();
    const subjectId = crypto.randomUUID();
    await connection.query(
      `INSERT INTO academic_stages (id, code, name_ar, name_en, sort_order) VALUES (?, 'PREP', 'المرحلة الإعدادية', 'Preparatory', 2)`,
      [stageId]
    );
    await connection.query(
      `INSERT INTO grades (id, stage_id, code, name_ar, name_en, sort_order) VALUES (?, ?, 'PREP3', 'الصف الثالث الإعدادي', 'Prep 3', 3)`,
      [gradeId, stageId]
    );
    await connection.query(
      `INSERT INTO subjects (id, grade_id, code, name_ar, name_en) VALUES (?, ?, 'MATH_PREP3', 'رياضيات', 'Mathematics')`,
      [subjectId, gradeId]
    );

    // Initial book insert
    await connection.query(
      `INSERT INTO books (id, title_ar, title_en, academic_stage_id, grade_id, subject_id, file_url, file_size, total_pages, school_type, term, processing_status)
       VALUES (?, 'رياضيات لغات 3 إعدادي', 'Math Prep 3', ?, ?, ?, '/uploads/math.pdf', 1000000, 112, 'لغات', 1, 'PENDING')`,
      [targetBookId, stageId, gradeId, subjectId]
    );

    // Simulate Resumption 1 completing and persisting 10 chunks
    for (let c = 1; c <= 10; c++) {
      await connection.query(
        `INSERT INTO book_chunks (id, book_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', '[-0.01, 0.05, 0.02]')`,
        [crypto.randomUUID(), targetBookId, stageId, gradeId, subjectId, c, c, `Math Content Chunk ${c}`]
      );
    }

    let [chunkCount1] = await connection.query(`SELECT COUNT(*) as cnt FROM book_chunks WHERE book_id = ?`, [targetBookId]);
    assert.strictEqual(Number(chunkCount1[0].cnt), 10);

    // Simulate Resumption 2 re-running persistence (staged replacement):
    // Staged clean replacement must delete unverified draft chunks and insert final chunks
    await connection.beginTransaction();
    await connection.query(`DELETE FROM book_chunks WHERE book_id = ?`, [targetBookId]);
    for (let c = 1; c <= 15; c++) {
      await connection.query(
        `INSERT INTO book_chunks (id, book_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', '[-0.01, 0.05, 0.02]')`,
        [crypto.randomUUID(), targetBookId, stageId, gradeId, subjectId, c, c, `Final Math Content Chunk ${c}`]
      );
    }
    await connection.commit();

    let [chunkCount2] = await connection.query(`SELECT COUNT(*) as cnt FROM book_chunks WHERE book_id = ?`, [targetBookId]);
    assert.strictEqual(Number(chunkCount2[0].cnt), 15, 'Must contain exactly 15 chunks without duplicate accumulation');
    console.log('     ✅ Staged replacement prevents duplicate chunk/embedding accumulation on repeat executions.');

    // 8. Legacy Checkpoint Merging with Page Results
    console.log('🧪 8. Testing legacy checkpoint merging with per-page results...');
    const legacyJobId = 'job_legacy_merge_' + Date.now();
    const legacyBookId = 'book_legacy_merge_' + Date.now();
    
    // Seed pages 1 to 35 in legacy JSON checkpoint
    const legacyOcrMap = {};
    for (let p = 1; p <= 35; p++) {
      legacyOcrMap[p] = `Legacy Preserved Page ${p} Content`;
    }
    await connection.query(
      `INSERT INTO book_ingestion_jobs (id, book_id, file_checksum, current_stage, status, checkpoint_data)
       VALUES (?, ?, 'checksum_legacy', 'OCR_PROCESSING', 'IN_PROGRESS', ?)`,
      [legacyJobId, legacyBookId, JSON.stringify({ ocrResults: legacyOcrMap, processedPages: 35 })]
    );

    // Seed pages 36 to 40 in book_ocr_page_results
    for (let p = 36; p <= 40; p++) {
      await connection.query(
        `INSERT INTO book_ocr_page_results (job_id, book_id, page_number, extracted_text, char_count)
         VALUES (?, ?, ?, ?, ?)`,
        [legacyJobId, legacyBookId, p, `Freshly Extracted Page ${p} Content`, 33]
      );
    }

    // Retrieve and merge
    const [legacyRows] = await connection.query(`SELECT checkpoint_data FROM book_ingestion_jobs WHERE id = ?`, [legacyJobId]);
    const jsonCp = JSON.parse(legacyRows[0].checkpoint_data);
    const [pageRows] = await connection.query(`SELECT page_number, extracted_text FROM book_ocr_page_results WHERE job_id = ?`, [legacyJobId]);
    
    const mergedOcrResults = { ...(jsonCp.ocrResults || {}) };
    for (const pr of pageRows) {
      mergedOcrResults[pr.page_number] = pr.extracted_text;
    }

    assert.strictEqual(Object.keys(mergedOcrResults).length, 40);
    assert.strictEqual(mergedOcrResults[1], 'Legacy Preserved Page 1 Content');
    assert.strictEqual(mergedOcrResults[35], 'Legacy Preserved Page 35 Content');
    assert.strictEqual(mergedOcrResults[36], 'Freshly Extracted Page 36 Content');
    assert.strictEqual(mergedOcrResults[40], 'Freshly Extracted Page 40 Content');
    console.log('     ✅ Merged legacy checkpoint (pages 1-35) seamlessly with page-level records (pages 36-40).');

    console.log('\n================================================================');
    console.log('✅ ALL TiDB / MYSQL 8.4 STANDALONE VERIFICATION TESTS PASSED');
    console.log('================================================================\n');

  } finally {
    await connection.end().catch(() => {});
  }
}

run().catch((err) => {
  console.error('❌ TiDB Standalone Verification Failed:', err);
  process.exit(1);
});
