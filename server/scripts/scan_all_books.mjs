import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';

async function scanAllBooks() {
  const booksRes = await db.query('SELECT id, title_ar, title_en, grade_id, subject_id FROM books');
  
  for (const b of booksRes.rows) {
    // Just fetch the first 2 chunks of each book to inspect header & fonts
    const chunksRes = await db.query(
      'SELECT chunk_data FROM book_pdf_chunks WHERE book_id = $1 ORDER BY chunk_index ASC LIMIT 3',
      [b.id]
    );
    if (chunksRes.rows.length === 0) {
      console.log(`[NO CHUNKS] ${b.title_ar}`);
      continue;
    }
    const buf = Buffer.concat(chunksRes.rows.map(r => Buffer.isBuffer(r.chunk_data) ? r.chunk_data : Buffer.from(r.chunk_data)));
    const str = buf.toString('binary');
    const images = (str.match(/\/Subtype\s*\/Image/g) || []).length;
    const fonts = (str.match(/\/Type\s*\/Font/g) || []).length;
    console.log(`Book: ${b.title_ar} (${b.id.slice(0, 8)}) | First chunks: Fonts=${fonts}, Images=${images}, Size=${(buf.length/(1024*1024)).toFixed(1)}MB`);
  }
  process.exit(0);
}

scanAllBooks().catch(e => {
  console.error(e);
  process.exit(1);
});
