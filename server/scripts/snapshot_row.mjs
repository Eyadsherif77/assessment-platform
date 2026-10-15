import dotenv from 'dotenv';
import path from 'path';
import { connect } from '@tidbcloud/serverless';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
if (!process.env.TIDB_HOST) {
  dotenv.config({ path: path.resolve(process.cwd(), 'server', '.env') });
}

async function main() {
  const tidb = connect({
    url: `mysql://${process.env.TIDB_USER}:${process.env.TIDB_PASSWORD}@${process.env.TIDB_HOST}/${process.env.TIDB_DATABASE}?ssl={"rejectUnauthorized":true}`
  });

  const res = await tidb.execute(`
    SELECT id, config_key, config_hash, content_hash, version_number, book_id,
           academic_stage_id, grade_id, subject_id, term, school_type, unit_ids,
           unit_set_key, parameters_json, param_hash, total_questions,
           provenance_verified, created_at, updated_at
    FROM shared_cached_exams
    WHERE id = 'ai_exam_1792056268228_n3c4zpy'
  `);

  console.log('SNAPSHOT_DATA_BEGIN');
  console.log(JSON.stringify(res[0], null, 2));
  console.log('SNAPSHOT_DATA_END');
}

main().catch(console.error);
