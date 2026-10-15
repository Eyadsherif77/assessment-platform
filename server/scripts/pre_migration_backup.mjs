import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { connect } from '@tidbcloud/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
if (!process.env.TIDB_HOST) {
  dotenv.config({ path: path.resolve(process.cwd(), 'server', '.env') });
}

function getTiDB() {
  return connect({
    url: `mysql://${process.env.TIDB_USER}:${process.env.TIDB_PASSWORD}@${process.env.TIDB_HOST}/${process.env.TIDB_DATABASE}?ssl={"rejectUnauthorized":true}`
  });
}

async function main() {
  console.log('================================================================');
  console.log('ALFARABI AI — PRE-MIGRATION BACKUP & VERIFICATION');
  console.log('================================================================\n');

  const tidb = getTiDB();
  const bookId = '81b8a308-7fcf-4938-8c45-aa0056624f32';

  // 1. Get chapters
  const chapters = await tidb.execute(
    'SELECT * FROM book_chapters WHERE book_id = ? ORDER BY chapter_number ASC',
    [bookId]
  );
  console.log(`Current Chapters for Book ${bookId}: ${chapters.length}`);
  for (const c of chapters) {
    console.log(`  Chapter ${c.chapter_number}: ${c.id} (${c.title_en || c.title_ar}) pp.${c.start_page}-${c.end_page}`);
  }

  // 2. Get the 8 chunks
  const chunks = await tidb.execute(
    'SELECT id, book_id, chapter_id, page_number, chunk_index FROM book_chunks WHERE book_id = ? AND chapter_id IS NULL ORDER BY page_number ASC',
    [bookId]
  );
  console.log(`\nCurrent NULL chapter chunks for Book ${bookId}: ${chunks.length}`);
  for (const ch of chunks) {
    console.log(`  Chunk: ${ch.id} | Page: ${ch.page_number} | Index: ${ch.chunk_index}`);
  }

  // 3. Inspect ai_usage_metrics columns
  const cols = await tidb.execute(`
    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_usage_metrics'
    ORDER BY ORDINAL_POSITION ASC
  `);
  console.log(`\nCurrent ai_usage_metrics columns (${cols.length}):`);
  console.log(cols.map(c => `  - ${c.COLUMN_NAME} (${c.DATA_TYPE})`).join('\n'));

  // 4. Save recoverable backup
  const backup = {
    timestamp: new Date().toISOString(),
    bookId,
    chapters,
    unassignedChunks: chunks,
    aiUsageMetricsColumns: cols
  };
  const backupFile = path.join(__dirname, 'pre_migration_backup_20261015.json');
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`\n✅ Recoverable backup successfully written to: ${backupFile}`);
}

main().catch(err => {
  console.error('❌ Error during pre-migration backup:', err);
  process.exit(1);
});
