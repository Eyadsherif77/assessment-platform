import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connect } from '@tidbcloud/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function runGate2() {
  const host = process.env.TIDB_HOST;
  const username = process.env.TIDB_USER;
  const password = process.env.TIDB_PASSWORD;
  const database = process.env.TIDB_DATABASE || 'assessment_platform';

  console.log(`Connecting to TiDB Cloud: ${host}, database: ${database}...`);
  const conn = connect({ host, username, password, database });

  console.log('\n--- 1. Executing Safe Schema Migration for is_style_reference ---');
  try {
    await conn.execute('ALTER TABLE exams ADD COLUMN is_style_reference TINYINT NOT NULL DEFAULT 0');
    console.log('✅ Column is_style_reference added successfully.');
  } catch (err: any) {
    if (err.message?.includes('Duplicate column') || err.message?.includes('already exists')) {
      console.log('ℹ️ Column is_style_reference already exists (repeatable migration).');
    } else {
      console.error('Migration failed:', err);
      process.exit(1);
    }
  }

  console.log('\n--- 2. Verifying Column in INFORMATION_SCHEMA ---');
  const colQuery = `
    SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'is_style_reference'
  `;
  const res: any = await conn.execute(colQuery, [database]);
  const rows = res.rows || res;
  console.log('Column details in TiDB Cloud:', JSON.stringify(rows, null, 2));

  if (!rows || rows.length === 0) {
    console.error('FATAL: Column is_style_reference not found in INFORMATION_SCHEMA!');
    process.exit(1);
  }

  const col = rows[0];
  if (col.DATA_TYPE.toLowerCase() !== 'tinyint') {
    console.error(`FATAL: Unexpected DATA_TYPE: ${col.DATA_TYPE}`);
    process.exit(1);
  }
  if (col.IS_NULLABLE !== 'NO') {
    console.error(`FATAL: Column is nullable: ${col.IS_NULLABLE}`);
    process.exit(1);
  }

  console.log('\n--- 3. Verifying Query on exams Table ---');
  const testSelect: any = await conn.execute('SELECT id, is_style_reference FROM exams LIMIT 5');
  console.log('Select test succeeded:', testSelect.rows || testSelect);

  console.log('\n🎉 GATE 2 COMPLETED SAFELY AND VERIFIED!');
}

runGate2().catch(err => {
  console.error('Gate 2 failed with error:', err);
  process.exit(1);
});
