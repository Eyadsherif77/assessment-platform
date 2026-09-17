import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function resetAndMigrate() {
  const pool = mysql.createPool({
    host: process.env.TIDB_HOST || 'gateway01.ap-northeast-1.prod.aws.tidbcloud.com',
    port: parseInt(process.env.TIDB_PORT || '4000', 10),
    user: process.env.TIDB_USER || '2kR2JL3LpY5osZZ.root',
    password: process.env.TIDB_PASSWORD || 'ixY87b7ytYiR4Shu',
    database: process.env.TIDB_DATABASE || 'assessment_platform',
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
  });

  console.log('🔄 Dropping old tables...');
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  const [tables]: any = await pool.query('SHOW TABLES');
  for (const row of tables) {
    const tableName = Object.values(row)[0];
    await pool.query(`DROP TABLE IF EXISTS \`${tableName}\``);
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('🧹 All old tables dropped cleanly.');

  const schemaPath = path.resolve(__dirname, 'schema_mysql.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
  console.log(`✅ Applied all ${statements.length} table definitions on TiDB Cloud!`);

  await pool.end();
}

resetAndMigrate().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
