import dotenv from 'dotenv';
import path from 'path';
import { connect } from '@tidbcloud/serverless';

dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

const conn = connect({
  host: process.env.TIDB_HOST,
  username: process.env.TIDB_USER || 'root',
  password: process.env.TIDB_PASSWORD || '',
  database: process.env.TIDB_DATABASE || 'assessment_platform'
});

async function run() {
  console.log('Querying per-book chunk counts:');
  const res = await conn.execute('SELECT book_id, COUNT(*) as chunks_count FROM book_pdf_chunks GROUP BY book_id');
  console.table(res);
}

run().catch(console.error);
