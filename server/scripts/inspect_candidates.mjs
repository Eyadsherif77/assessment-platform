import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';

async function inspectCandidatePdfs() {
  const candidates = [
    { id: '19886434-1839-427d-af31-4c64fcf79525', name: 'Math - Prep 2' },
    { id: '543f2746-460c-41c1-ba38-0933f479272f', name: 'Science - Prep 2' },
    { id: '81b8a308-7fcf-4938-8c45-aa0056624f32', name: 'Social Studies - Prep 2' },
    { id: '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', name: 'English - Prep 1' }
  ];

  for (const c of candidates) {
    const r = await db.query(
      'SELECT chunk_index, length(chunk_data) as len FROM book_pdf_chunks WHERE book_id = $1 ORDER BY chunk_index ASC',
      [c.id]
    );
    console.log(`Candidate [${c.name}] (${c.id}): ${r.rows.length} chunks`);
    const indices = r.rows.map(x => x.chunk_index);
    const minIdx = Math.min(...indices);
    const maxIdx = Math.max(...indices);
    const isContiguous = indices.every((val, i) => val === i);
    console.log(`  Indices: ${minIdx}..${maxIdx}, contiguous: ${isContiguous}`);

    // Reconstruct first chunk to check PDF header
    const firstChunk = await db.query(
      'SELECT chunk_data FROM book_pdf_chunks WHERE book_id = $1 AND chunk_index = 0',
      [c.id]
    );
    const buf = Buffer.from(firstChunk.rows[0].chunk_data);
    const header = buf.slice(0, 10).toString('utf-8');
    console.log(`  PDF Header: "${header.replace(/\n|\r/g, '')}"`);
  }
  process.exit(0);
}

inspectCandidatePdfs().catch(err => {
  console.error(err);
  process.exit(1);
});
