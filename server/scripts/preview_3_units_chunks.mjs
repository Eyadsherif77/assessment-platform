import dotenv from 'dotenv';
dotenv.config();
import { connect } from '@tidbcloud/serverless';

const conn = connect({
  host: process.env.TIDB_HOST,
  username: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE
});

const units = [
  { name: 'English Unit 1', chId: '192c06db-b3e1-4717-b6e9-0b06a0364764' },
  { name: 'Science Unit 1', chId: '1d68b948-4326-41cc-b9f9-51169b931c1f' },
  { name: 'Math Unit 2', chId: 'dec90b76-3479-40a3-b720-4a06a61a4b3f' }
];

for (const u of units) {
  const rows = await conn.execute(
    'SELECT id, page_number, chunk_index, length(content) as len, substring(content, 1, 200) as preview FROM book_chunks WHERE chapter_id = ? ORDER BY page_number ASC LIMIT 2',
    [u.chId]
  );
  console.log(`\n=== ${u.name} Chunks ===`);
  rows.forEach(r => console.log(`[P.${r.page_number}] ID: ${r.id} | Len: ${r.len} | Preview: ${r.preview.replace(/\s+/g, ' ')}`));
}

process.exit(0);
