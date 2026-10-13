import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

async function auditAllPdfs() {
  const booksRes = await db.query(
    'SELECT * FROM books'
  );
  if (booksRes.rows.length > 0) {
    console.log('Book columns:', Object.keys(booksRes.rows[0]));
  }

  console.log(`Auditing ${booksRes.rows.length} books in TiDB...`);
  for (const b of booksRes.rows) {
    const chunksRes = await db.query(
      'SELECT chunk_data FROM book_pdf_chunks WHERE book_id = $1 ORDER BY chunk_index ASC',
      [b.id]
    );
    if (chunksRes.rows.length === 0) {
      console.log(`[NO CHUNKS] ${b.title} (${b.id})`);
      continue;
    }
    const buf = Buffer.concat(chunksRes.rows.map(r => Buffer.isBuffer(r.chunk_data) ? r.chunk_data : Buffer.from(r.chunk_data)));
    try {
      const parsed = await pdfParse(buf);
      console.log(`[OK] ${b.title} | Pages: ${parsed.numpages} | TextLen: ${parsed.text.length} | Size: ${(buf.length / (1024*1024)).toFixed(2)} MB | Chunks: ${chunksRes.rows.length}`);
    } catch (e) {
      console.log(`[ERR] ${b.title} | Error parsing PDF: ${e.message}`);
    }
  }
  process.exit(0);
}

auditAllPdfs().catch(err => {
  console.error(err);
  process.exit(1);
});
