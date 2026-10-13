import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

const bookId = '19886434-1839-427d-af31-4c64fcf79525';
const samplePages = [6, 14, 38, 75, 115];

async function inspectSamplePages() {
  console.log('Fetching sample pages for visual comparison...');
  for (const p of samplePages) {
    const res = await db.query(
      'SELECT page_number, char_count, raw_text FROM book_pages WHERE book_id = $1 AND page_number = $2',
      [bookId, p]
    );
    if (res.rows.length > 0) {
      console.log(`\n======================================================`);
      console.log(`PAGE ${p} (Length: ${res.rows[0].char_count} chars):`);
      console.log(`======================================================`);
      console.log(res.rows[0].raw_text);
    } else {
      console.log(`Page ${p} not found!`);
    }
  }
  process.exit(0);
}

inspectSamplePages().catch(err => {
  console.error(err);
  process.exit(1);
});
