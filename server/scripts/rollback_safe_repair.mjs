/**
 * ============================================================================
 * Alfarabi AI — Safe Rollback for Four Units Repair
 * Target: Restore original chapter_id for the 12 legacy chunks
 * ============================================================================
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { connect } from '@tidbcloud/serverless';
import dotenv from 'dotenv';
import { TARGET_CHUNKS } from './execute_safe_repair.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const conn = connect({
  host: process.env.TIDB_HOST,
  username: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE
});

async function rollback() {
  console.log('Rolling back repair for 12 legacy chunks...');
  for (const chunk of TARGET_CHUNKS) {
    await conn.execute(
      `UPDATE book_chunks SET chapter_id = ? WHERE id = ?`,
      [chunk.chapterId, chunk.id]
    );
  }
  console.log('✅ Rollback completed: All 12 chunks re-associated with original chapter_ids.');
}

rollback().catch(console.error);
