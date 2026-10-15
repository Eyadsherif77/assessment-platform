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
    const cols = [
      'is_estimated TINYINT NOT NULL DEFAULT 0',
      'call_purpose VARCHAR(64) NOT NULL DEFAULT "EXAM_GENERATION"',
      'correlation_id VARCHAR(64) NULL',
      'attempt_number INT NOT NULL DEFAULT 1',
      'cached_tokens INT NOT NULL DEFAULT 0',
      'cost_status VARCHAR(32) NOT NULL DEFAULT "ESTIMATED"',
      'grade_id VARCHAR(64) NULL',
      'subject_id VARCHAR(64) NULL'
    ];

    for (const c of cols) {
      const colName = c.split(' ')[0];
      const sql = `ALTER TABLE ai_usage_metrics ADD COLUMN IF NOT EXISTS ${c}`;
      await connection.query(sql);
      console.log(`✅ Idempotent DDL verified: ${colName}`);
    }

    const [verifyCols] = await connection.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'ai_usage_metrics' 
        AND COLUMN_NAME IN ('is_estimated', 'call_purpose', 'correlation_id', 'attempt_number', 'cached_tokens', 'cost_status', 'grade_id', 'subject_id')
    `);
    console.log(`\n✅ Verified all ${verifyCols.length}/8 telemetry columns exist in live TiDB:`);
    console.table(verifyCols);
  } finally {
    await connection.end();
  }
}

run().catch(err => {
  console.error('❌ Telemetry migration check failed:', err);
  process.exit(1);
});
