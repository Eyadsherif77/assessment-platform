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
  console.log('AUDIT: ENGLISH EXAM INCIDENT DEEP DIVE');
  console.log('================================================================\n');

  // 1. Inspect the English cached exam ai_exam_1792056268228_n3c4zpy
  const cached = await tidb.execute(`
    SELECT id, config_key, config_hash, content_hash, version_number, book_id,
           academic_stage_id, grade_id, subject_id, total_questions, questions_data,
           parameters_json, created_at
    FROM shared_cached_exams
    WHERE id = 'ai_exam_1792056268228_n3c4zpy'
  `);
  
  if (cached.length > 0) {
    const ce = cached[0];
    console.log('--- Cached Exam Metadata ---');
    console.log(`ID: ${ce.id}`);
    console.log(`Book ID: ${ce.book_id}`);
    console.log(`total_questions field in DB: ${ce.total_questions}`);
    console.log(`parameters_json: ${ce.parameters_json}`);
    console.log(`created_at: ${ce.created_at}`);

    let qData = [];
    try {
      qData = typeof ce.questions_data === 'string' ? JSON.parse(ce.questions_data) : ce.questions_data;
    } catch (e) {
      console.error('Error parsing questions_data:', e);
    }
    console.log(`Actual questions stored in questions_data: ${qData.length}`);
    for (let i = 0; i < qData.length; i++) {
      const q = qData[i];
      console.log(`  [Q${i+1}] ${q.question_text || q.text}`);
      console.log(`       Options: ${(q.options || []).length} | Difficulty: ${q.difficulty} | Bloom: ${q.bloom_level} | Page: ${q.page_reference}`);
    }
  } else {
    console.log('Exam ai_exam_1792056268228_n3c4zpy not found!');
  }

  // 2. Trace all metrics for Student 79f5dfd6-2893-4ba5-b6d6-7176f68d633f and baa09ff7-8d10-4583-a8f0-6d760f377d97
  console.log('\n--- Telemetry Trace for English Students ---');
  const studentMetrics = await tidb.execute(`
    SELECT id, event_type, student_id, book_id, chapter_id, model_name,
           prompt_tokens, candidates_tokens, total_tokens, estimated_cost_usd,
           duration_ms, error_code, is_estimated, call_purpose, correlation_id, attempt_number, created_at
    FROM ai_usage_metrics
    WHERE student_id IN ('79f5dfd6-2893-4ba5-b6d6-7176f68d633f', 'baa09ff7-8d10-4583-a8f0-6d760f377d97')
    ORDER BY created_at ASC
  `);

  for (const m of studentMetrics) {
    console.log(`[${m.created_at}] Student: ${m.student_id.slice(0, 8)} | ${m.event_type} | ${m.call_purpose} | Model: ${m.model_name} | Att: ${m.attempt_number} | Dur: ${m.duration_ms}ms | Err: ${m.error_code} | Tokens: ${m.total_tokens} | Cost: $${m.estimated_cost_usd}`);
  }

  // 3. Inspect blind solver metrics between 09:23:00 and 09:25:00
  console.log('\n--- Blind Solver Calls Between 09:23:00 and 09:25:00 ---');
  const solverMetrics = await tidb.execute(`
    SELECT id, event_type, student_id, book_id, chapter_id, model_name,
           prompt_tokens, candidates_tokens, total_tokens, estimated_cost_usd,
           duration_ms, error_code, is_estimated, call_purpose, correlation_id, attempt_number, created_at
    FROM ai_usage_metrics
    WHERE call_purpose = 'EXAM_BLIND_SOLVER'
      AND created_at BETWEEN '2026-10-15 09:23:00' AND '2026-10-15 09:25:00'
    ORDER BY created_at ASC
  `);
  for (const sm of solverMetrics) {
    console.log(`[${sm.created_at}] ${sm.event_type} | Model: ${sm.model_name} | Att: ${sm.attempt_number} | Dur: ${sm.duration_ms}ms | Err: ${sm.error_code} | Tokens: ${sm.total_tokens} | Cost: $${sm.estimated_cost_usd}`);
  }
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
