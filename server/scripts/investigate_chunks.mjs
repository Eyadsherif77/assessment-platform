import 'dotenv/config';
import { connect } from '@tidbcloud/serverless';

const conn = connect({
  host: process.env.TIDB_HOST,
  username: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE
});

async function main() {
  const scienceChunks = await conn.execute(
    "SELECT id, page_number, chunk_index, LENGTH(content) as len, SUBSTRING(content, 1, 100) as preview FROM book_chunks WHERE book_id = 'ecf50c73-4329-436d-a0a6-520cfa8172f6' ORDER BY chunk_index LIMIT 5"
  );
  console.log('Science chunks sample:');
  console.log(scienceChunks);

  const otherChunks = await conn.execute(
    "SELECT b.title_ar, c.id, c.page_number, c.chunk_index, LENGTH(c.content) as len, SUBSTRING(c.content, 1, 100) as preview FROM book_chunks c JOIN books b ON c.book_id = b.id WHERE c.book_id != 'ecf50c73-4329-436d-a0a6-520cfa8172f6' LIMIT 5"
  );
  console.log('Other chunks sample:');
  console.log(otherChunks);

  // Check Science Chapters
  const chs = await conn.execute(
    "SELECT id, chapter_number, title_ar, title_en, start_page, end_page FROM book_chapters WHERE book_id = 'ecf50c73-4329-436d-a0a6-520cfa8172f6' ORDER BY chapter_number"
  );
  console.log('Science Book Chapters:');
  console.table(chs);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
