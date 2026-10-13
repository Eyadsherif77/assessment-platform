import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

async function testEnglishBook() {
  const englishBookId = '21e1d639-9f59-4a58-a8f8-8373b8e7fc90'; // Prep 1 English
  console.log('Fetching chunks for Prep 1 English book...');
  const countRes = await db.query('SELECT COUNT(*) as cnt FROM book_pdf_chunks WHERE book_id = $1', [englishBookId]);
  const cnt = parseInt(countRes.rows[0].cnt, 10);
  console.log(`Chunks count: ${cnt}`);
  
  const buffers = [];
  const BATCH_SIZE = 4;
  for (let c = 0; c < cnt; c += BATCH_SIZE) {
    const endC = Math.min(cnt - 1, c + BATCH_SIZE - 1);
    console.log(`Downloading chunks ${c} to ${endC} of ${cnt}...`);
    const batchRes = await db.query(
      'SELECT chunk_index, chunk_data FROM book_pdf_chunks WHERE book_id = $1 AND chunk_index BETWEEN $2 AND $3 ORDER BY chunk_index ASC',
      [englishBookId, c, endC]
    );
    for (const r of batchRes.rows) {
      const raw = r.chunk_data;
      buffers.push(Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
    }
  }
  const buf = Buffer.concat(buffers);
  console.log(`Assembled English book size: ${(buf.length / (1024*1024)).toFixed(2)} MB`);
  
  const parsed = await pdfParse(buf);
  console.log(`Total pages: ${parsed.numpages}`);
  console.log(`Total text length: ${parsed.text.length}`);
  console.log(`Sample text from English book:\n${parsed.text.slice(0, 1000)}`);
  
  process.exit(0);
}

testEnglishBook().catch(e => {
  console.error(e);
  process.exit(1);
});
