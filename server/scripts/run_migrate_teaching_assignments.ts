import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connect } from '@tidbcloud/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function runMigrateTeachingAssignments() {
  const host = process.env.TIDB_HOST;
  const username = process.env.TIDB_USER;
  const password = process.env.TIDB_PASSWORD;
  const database = process.env.TIDB_DATABASE || 'assessment_platform';

  console.log(`Connecting to TiDB Cloud: ${host}, database: ${database}...`);
  const conn = connect({ host, username, password, database });

  console.log('\n--- 1. Executing Safe Schema Migration for teaching_assignments ---');
  try {
    await conn.execute('ALTER TABLE teacher_profiles ADD COLUMN teaching_assignments TEXT NULL');
    console.log('✅ Column teaching_assignments added successfully.');
  } catch (err: any) {
    if (err.message?.includes('Duplicate column') || err.message?.includes('already exists')) {
      console.log('ℹ️ Column teaching_assignments already exists.');
    } else {
      console.error('Migration failed:', err);
      process.exit(1);
    }
  }

  console.log('\n--- 2. Verifying Column in INFORMATION_SCHEMA ---');
  const colQuery = `
    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'teacher_profiles' AND COLUMN_NAME = 'teaching_assignments'
  `;
  const res: any = await conn.execute(colQuery, [database]);
  const rows = res.rows || res;
  console.log('Column details in TiDB Cloud:', JSON.stringify(rows, null, 2));

  if (!rows || rows.length === 0) {
    console.error('FATAL: Column teaching_assignments not found in INFORMATION_SCHEMA!');
    process.exit(1);
  }

  console.log('\n--- 3. Verifying Query on teacher_profiles Table ---');
  const testSelect: any = await conn.execute('SELECT user_id, teaching_assignments FROM teacher_profiles LIMIT 3');
  console.log('Select test succeeded:', testSelect.rows || testSelect);
  console.log('\n🎉 Migration complete and verified.');
}

runMigrateTeachingAssignments().catch((err) => {
  console.error('Unhandled error during migration:', err);
  process.exit(1);
});
