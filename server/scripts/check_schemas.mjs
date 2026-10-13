import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';

async function checkSchemas() {
  const pagesCol = await db.query('DESCRIBE book_pages');
  console.log('--- book_pages schema ---');
  console.table(pagesCol.rows);

  const chaptersCol = await db.query('DESCRIBE book_chapters');
  console.log('--- book_chapters schema ---');
  console.table(chaptersCol.rows);

  const chunksCol = await db.query('DESCRIBE book_chunks');
  console.log('--- book_chunks schema ---');
  console.table(chunksCol.rows);

  process.exit(0);
}

checkSchemas().catch(err => {
  console.error(err);
  process.exit(1);
});
