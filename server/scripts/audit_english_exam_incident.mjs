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

function getTiDB() {
  return connect({
    url: `mysql://${process.env.TIDB_USER}:${process.env.TIDB_PASSWORD}@${process.env.TIDB_HOST}/${process.env.TIDB_DATABASE}?ssl={"rejectUnauthorized":true}`
  });
}

async function main() {
  const tidb = getTiDB();

  console.log('================================================================');
  console.log('READ-ONLY AUDIT: RECENT EXAMS & METRICS');
  console.log('================================================================\n');

  // 0. Inspect exams columns
  const examCols = await tidb.execute(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams'
  `);
  console.log('exams columns:', examCols.map(c => c.COLUMN_NAME).join(', '));

  // 1. Look at recent exams
  const exams = await tidb.execute(`
    SELECT e.id, e.title_ar, e.title_en, e.subject_id, e.book_id, e.chapter_id, e.created_at,
           COUNT(eq.id) as question_count
    FROM exams e
    LEFT JOIN exam_questions eq ON e.id = eq.exam_id
    GROUP BY e.id, e.title_ar, e.title_en, e.subject_id, e.book_id, e.chapter_id, e.created_at
    ORDER BY e.created_at DESC
    LIMIT 20
  `);
  console.log('\n--- Recent Exams (Top 20) ---');
  for (const ex of exams) {
    console.log(`ID: ${ex.id} | Title: ${ex.title_en || ex.title_ar} | Subj: ${ex.subject_id} | Book: ${ex.book_id} | Questions: ${ex.question_count} | Created: ${ex.created_at}`);
  }

  // 2. Check shared_cached_exams columns and rows
  const cacheCols = await tidb.execute(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shared_cached_exams'
  `);
  console.log('\nshared_cached_exams columns:', cacheCols.map(c => c.COLUMN_NAME).join(', '));

  const cachedExams = await tidb.execute(`
    SELECT *
    FROM shared_cached_exams
    ORDER BY created_at DESC
    LIMIT 15
  `);
  console.log(`\n--- Recent Cached Exams [Found: ${cachedExams.length}] ---`);
  for (const ce of cachedExams) {
    console.log(`ID: ${ce.id} | Book: ${ce.book_id} | Chapter: ${ce.chapter_id} | Hits: ${ce.hit_count} | Created: ${ce.created_at}`);
  }

  // 4. Look at recent ai_usage_metrics
  const metrics = await tidb.execute(`
    SELECT id, event_type, student_id, book_id, chapter_id, model_name,
           prompt_tokens, candidates_tokens, total_tokens, estimated_cost_usd,
           duration_ms, error_code, is_estimated, call_purpose, correlation_id, attempt_number, created_at
    FROM ai_usage_metrics
    ORDER BY created_at DESC
    LIMIT 30
  `);
  console.log(`\n--- Recent ai_usage_metrics (Top 30) ---`);
  for (const m of metrics) {
    console.log(`[${m.created_at}] ${m.event_type} | ${m.call_purpose} | Model: ${m.model_name} | Att: ${m.attempt_number} | Dur: ${m.duration_ms}ms | Err: ${m.error_code} | Tokens: ${m.total_tokens} | Cost: $${m.estimated_cost_usd} | Student: ${m.student_id}`);
  }
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
