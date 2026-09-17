import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runTiDBMigration(): Promise<void> {
  console.log('🚀 Connecting to TiDB Cloud MySQL...');
  const pool = mysql.createPool({
    host: process.env.TIDB_HOST || 'gateway01.ap-northeast-1.prod.aws.tidbcloud.com',
    port: parseInt(process.env.TIDB_PORT || '4000', 10),
    user: process.env.TIDB_USER || '2kR2JL3LpY5osZZ.root',
    password: process.env.TIDB_PASSWORD || 'ixY87b7ytYiR4Shu',
    database: process.env.TIDB_DATABASE || 'assessment_platform',
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    multipleStatements: true,
    waitForConnections: true,
    connectionLimit: 10
  });

  try {
    const schemaPath = path.resolve(__dirname, 'schema_mysql.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('📜 Applying TiDB Cloud MySQL Schema...');
    // Split statements by semicolon
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      await pool.query(stmt);
    }

    console.log(`✅ Successfully applied ${statements.length} table definitions on TiDB Cloud!`);

    const [tables] = await pool.query('SHOW TABLES');
    console.log('📊 Existing tables in assessment_platform:', tables);

    await pool.end();
  } catch (err) {
    console.error('❌ Migration error:', err);
    await pool.end();
    throw err;
  }
}

// Allow direct execution
if (process.argv[1] && process.argv[1].endsWith('migrate_tidb.ts')) {
  runTiDBMigration().then(() => process.exit(0)).catch(() => process.exit(1));
}
