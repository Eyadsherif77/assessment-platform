import { connect } from '@tidbcloud/serverless';
import dotenv from 'dotenv';
dotenv.config();

const conn = connect({
  host: process.env.TIDB_HOST,
  username: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE
});

const units = [
  { book_id: '19886434-1839-427d-af31-4c64fcf79525', name: 'Math Prep 2' },
  { book_id: 'bc6bb834-7192-474c-8507-c53265028b4e', name: 'Arabic Prep 1' },
  { book_id: '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', name: 'English Prep 1' },
  { book_id: '37bfa0c0-c4ce-419f-930a-000043d8d3f9', name: 'English Prep 2' }
];

async function inspectPages() {
  for (const u of units) {
    console.log(`\n========================================================`);
    console.log(`BOOK: ${u.name} (${u.book_id})`);
    const pages = await conn.execute(`
      SELECT page_number, char_count, raw_text
      FROM book_pages
      WHERE book_id = ? AND page_number IN (1, 2, 3, 4, 5, 11, 14)
      ORDER BY page_number ASC
    `, [u.book_id]);

    for (const p of pages) {
      console.log(`--- Page ${p.page_number} (chars: ${p.char_count}) ---`);
      console.log(p.raw_text.substring(0, 300) + (p.raw_text.length > 300 ? '...' : ''));
    }
  }
}

inspectPages().catch(console.error);
