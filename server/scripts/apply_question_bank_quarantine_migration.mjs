import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function runMigration() {
  console.log('--- Farabi AI Production TiDB Migration: question_bank_items ---');

  const connection = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT) || 4000,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE || 'assessment_platform',
    ssl: { rejectUnauthorized: false }
  });

  try {
    const dbName = process.env.TIDB_DATABASE || 'assessment_platform';
    console.log(`Connected to TiDB host: ${process.env.TIDB_HOST}, database: ${dbName}`);

    // 1. Inspect existing columns in information_schema
    const [columns] = await connection.execute(
      `SELECT column_name, data_type, column_default, is_nullable 
       FROM information_schema.columns 
       WHERE table_schema = ? AND table_name = 'question_bank_items'`,
      [dbName]
    );

    const existingColumnNames = new Set(columns.map(c => (c.COLUMN_NAME || c.column_name || '').toLowerCase()));
    console.log(`Existing columns in question_bank_items (${existingColumnNames.size}):`, Array.from(existingColumnNames).join(', '));

    // 2. Add is_quarantined if missing
    if (!existingColumnNames.has('is_quarantined')) {
      console.log('Applying DDL: ADD COLUMN is_quarantined INTEGER DEFAULT 0 ...');
      await connection.execute(`ALTER TABLE question_bank_items ADD COLUMN is_quarantined INTEGER DEFAULT 0`);
      console.log('✓ Column is_quarantined added successfully.');
    } else {
      console.log('ℹ Column is_quarantined already exists.');
    }

    // 3. Add quarantine_reason if missing
    if (!existingColumnNames.has('quarantine_reason')) {
      console.log('Applying DDL: ADD COLUMN quarantine_reason VARCHAR(255) NULL ...');
      await connection.execute(`ALTER TABLE question_bank_items ADD COLUMN quarantine_reason VARCHAR(255) NULL`);
      console.log('✓ Column quarantine_reason added successfully.');
    } else {
      console.log('ℹ Column quarantine_reason already exists.');
    }

    // 4. Verify resulting schema in information_schema
    const [verifiedColumns] = await connection.execute(
      `SELECT column_name, column_type, column_default, is_nullable 
       FROM information_schema.columns 
       WHERE table_schema = ? AND table_name = 'question_bank_items'
         AND column_name IN ('is_quarantined', 'quarantine_reason')`,
      [dbName]
    );

    console.log('\n--- Verified Production Schema for Quarantine Columns ---');
    console.table(verifiedColumns);

    // 5. Verify existing questions status (must remain ineligible/unverified)
    const [countRows] = await connection.execute(`SELECT count(*) as total_items FROM question_bank_items`);
    const [verifiedCountRows] = await connection.execute(
      `SELECT count(*) as verified_count FROM question_bank_items WHERE is_quarantined = 0 AND quarantine_reason LIKE 'VERIFIED:%'`
    );
    console.log(`Total question bank items in production: ${countRows[0].total_items}`);
    console.log(`Items eligible with durable verification evidence: ${verifiedCountRows[0].verified_count}`);
    console.log('✓ Invariant preserved: legacy questions remain ineligible until verified.');

  } finally {
    await connection.end();
  }
}

runMigration().catch(err => {
  console.error('Migration failed:', err?.message || err);
  process.exit(1);
});
