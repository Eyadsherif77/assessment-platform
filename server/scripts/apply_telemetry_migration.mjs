import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connect } from '@tidbcloud/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
if (!process.env.TIDB_HOST) {
  dotenv.config({ path: path.resolve(process.cwd(), 'server', '.env') });
}

async function main() {
  console.log('================================================================');
  console.log('APPLY TELEMETRY SCHEMA MIGRATION: 20261015_add_telemetry_columns');
  console.log('================================================================\n');

  const conn = connect({
    url: `mysql://${process.env.TIDB_USER}:${process.env.TIDB_PASSWORD}@${process.env.TIDB_HOST}/${process.env.TIDB_DATABASE}?ssl={"rejectUnauthorized":true}`
  });

  // 1. Check existing columns
  const beforeCols = await conn.execute(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_usage_metrics'
  `);
  const existingNames = new Set(beforeCols.map(c => c.COLUMN_NAME));
  console.log(`Existing ai_usage_metrics columns: ${existingNames.size}`);

  const columnsToAdd = [
    { name: 'is_estimated', def: 'TINYINT NOT NULL DEFAULT 0' },
    { name: 'call_purpose', def: "VARCHAR(64) NOT NULL DEFAULT 'EXAM_GENERATION'" },
    { name: 'correlation_id', def: 'VARCHAR(64) NULL' },
    { name: 'attempt_number', def: 'INT NOT NULL DEFAULT 1' },
    { name: 'cached_tokens', def: 'INT NOT NULL DEFAULT 0' },
    { name: 'cost_status', def: "VARCHAR(32) NOT NULL DEFAULT 'ESTIMATED'" },
    { name: 'grade_id', def: 'VARCHAR(64) NULL' },
    { name: 'subject_id', def: 'VARCHAR(64) NULL' }
  ];

  for (const col of columnsToAdd) {
    if (existingNames.has(col.name)) {
      console.log(`  - Column '${col.name}' already exists (skipping)`);
    } else {
      console.log(`  + Adding column '${col.name}' (${col.def})...`);
      await conn.execute(`ALTER TABLE ai_usage_metrics ADD COLUMN IF NOT EXISTS ${col.name} ${col.def}`);
      console.log(`    Successfully added '${col.name}'`);
    }
  }

  // 2. Post-flight verification
  const afterCols = await conn.execute(`
    SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_usage_metrics'
    ORDER BY ORDINAL_POSITION ASC
  `);
  console.log(`\nVerified ai_usage_metrics total columns: ${afterCols.length}`);
  console.log(afterCols.map(c => `  - ${c.COLUMN_NAME} (${c.DATA_TYPE}, default: ${c.COLUMN_DEFAULT})`).join('\n'));

  console.log('\n✅ Telemetry columns migration applied and verified successfully!');
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
