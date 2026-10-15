import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = fs.existsSync('.env') ? '.env' : path.resolve('server/.env');
dotenv.config({ path: envPath });

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT) || 4000,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: { rejectUnauthorized: true }
  });

  try {
    console.log('--- Step 1: Pre-flight check ---');
    const [pre] = await connection.query(`
      SELECT id, config_hash, content_hash, version_number, book_id,
             total_questions, provenance_verified, created_at, updated_at
      FROM shared_cached_exams
      WHERE id = 'ai_exam_1792056268228_n3c4zpy'
        AND config_hash = 'b2934963e37ce2edfab16c735e7b22712aa3b535c68fb159aa765befee377492'
        AND content_hash = '483c313040ecfc917281e0debcb5fcb9eb090e6ac56556964b468a2998c48a97'
        AND version_number = 1
        AND total_questions = 4
        AND provenance_verified = 1
    `);

    if (pre.length !== 1) {
      throw new Error(`Pre-flight assertion failed: expected exactly 1 row, found ${pre.length}`);
    }
    console.log('✅ Pre-flight verified. Incident row snapshot matched:');
    console.log(JSON.stringify(pre[0], null, 2));

    console.log('\n--- Step 2: Create audit backup table ---');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS backup_shared_cached_exams_incident_20261015 (
          backup_id VARCHAR(64) PRIMARY KEY,
          exam_id VARCHAR(64) NOT NULL,
          original_config_hash VARCHAR(64) NOT NULL,
          original_content_hash VARCHAR(64) NOT NULL,
          original_total_questions INT NOT NULL,
          original_provenance_verified INT NOT NULL,
          original_parameters_json TEXT NOT NULL,
          original_created_at DATETIME,
          original_updated_at DATETIME,
          backed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Audit table backup_shared_cached_exams_incident_20261015 verified/created');

    console.log('\n--- Step 3: Insert pre-remediation audit record ---');
    const [ins] = await connection.query(`
      INSERT INTO backup_shared_cached_exams_incident_20261015 (
          backup_id, exam_id, original_config_hash, original_content_hash,
          original_total_questions, original_provenance_verified,
          original_parameters_json, original_created_at, original_updated_at
      )
      SELECT 'pre_remediation_ai_exam_1792056268228_n3c4zpy',
             id, config_hash, content_hash, total_questions, provenance_verified,
             parameters_json, created_at, updated_at
      FROM shared_cached_exams
      WHERE id = 'ai_exam_1792056268228_n3c4zpy'
        AND total_questions = 4
        AND provenance_verified = 1
      ON DUPLICATE KEY UPDATE backed_up_at = CURRENT_TIMESTAMP
    `);
    console.log(`✅ Audit snapshot inserted. Affected rows: ${ins.affectedRows}`);

    console.log('\n--- Step 4: Deactivate incomplete exam via optimistic concurrency ---');
    const [upd] = await connection.query(`
      UPDATE shared_cached_exams
      SET provenance_verified = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 'ai_exam_1792056268228_n3c4zpy'
        AND config_hash = 'b2934963e37ce2edfab16c735e7b22712aa3b535c68fb159aa765befee377492'
        AND content_hash = '483c313040ecfc917281e0debcb5fcb9eb090e6ac56556964b468a2998c48a97'
        AND total_questions = 4
        AND provenance_verified = 1
    `);
    console.log(`✅ Update executed. Affected rows: ${upd.affectedRows}`);

    console.log('\n--- Step 5: Post-remediation verification ---');
    const [post] = await connection.query(
      'SELECT id, total_questions, provenance_verified, updated_at FROM shared_cached_exams WHERE id = ?',
      ['ai_exam_1792056268228_n3c4zpy']
    );
    console.log('Post-remediation row:');
    console.log(JSON.stringify(post[0], null, 2));

    if (post[0].provenance_verified !== 0) {
      throw new Error(`Post-remediation assertion failed: provenance_verified is ${post[0].provenance_verified}`);
    }
    console.log('\n🎉 SUCCESS: ai_exam_1792056268228_n3c4zpy provenance_verified is now 0 (deactivated)');
  } finally {
    await connection.end();
  }
}

run().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
