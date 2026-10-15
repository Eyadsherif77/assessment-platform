import { connect } from '@tidbcloud/serverless';
import dotenv from 'dotenv';
dotenv.config();
const conn = connect({
  host: process.env.TIDB_HOST,
  username: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE
});
async function run() {
  const res = await conn.execute(`
    SELECT b.id, b.title_ar, COUNT(chk.id) as chunks_p1_to_3
    FROM books b
    LEFT JOIN book_chunks chk ON chk.book_id = b.id AND chk.page_number IN (1, 2, 3)
    GROUP BY b.id, b.title_ar
    ORDER BY chunks_p1_to_3 DESC
  `);
  console.table(res);
}
run().catch(console.error);
