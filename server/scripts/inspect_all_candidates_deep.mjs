import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';

async function main() {
  console.log('=== DEEP INSPECTION OF ALL UNPROCESSED BOOKS ===\n');

  const approvedIds = [
    'd7bbfca2-6d8f-461b-8e39-2015981e86ec', // Book 1 (Science Prep 1)
    'f19276d3-4adb-4297-bb77-5ed87ba638b9', // Book 2 (Social Studies Prep 3)
    '19886434-1839-427d-af31-4c64fcf79525', // Book 3 (Math Prep 2)
    '81b8a308-7fcf-4938-8c45-aa0056624f32', // Book 4 (Social Studies Prep 2)
    '543f2746-460c-41c1-ba38-0933f479272f'  // Book 5 (Science Prep 2)
  ];

  const q = await db.query(`
    SELECT 
      b.id, b.title_ar, b.title_en, b.school_type, b.term, b.processing_status,
      b.file_size, b.total_pages, b.file_url, b.created_at,
      g.name_ar as grade_name, g.sort_order as grade_order,
      s.code as subject_code, s.name_ar as subject_name, s.sort_order as subj_order
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
    ORDER BY g.sort_order ASC, s.sort_order ASC, b.title_ar ASC
  `);

  const results = [];

  for (let i = 0; i < q.rows.length; i++) {
    const b = q.rows[i];
    const isApproved = approvedIds.includes(b.id);
    const isBook6 = (b.id === '21e1d639-9f59-4a58-a8f8-8373b8e7fc90');

    // Chunks in DB
    const chunksRes = await db.query(
      'SELECT chunk_index, length(chunk_data) as len FROM book_pdf_chunks WHERE book_id = $1 ORDER BY chunk_index ASC',
      [b.id]
    );
    const pdfChunksCount = chunksRes.rows.length;
    const indices = chunksRes.rows.map(x => x.chunk_index);
    const isContiguous = pdfChunksCount > 0 && indices.every((val, idx) => val === idx);

    // Reconstruct first chunk to check header
    let pdfHeader = 'N/A';
    let pdfPageCount = 'N/A';
    if (pdfChunksCount > 0) {
      const firstChunk = await db.query(
        'SELECT chunk_data FROM book_pdf_chunks WHERE book_id = $1 AND chunk_index = 0',
        [b.id]
      );
      const buf = Buffer.from(firstChunk.rows[0].chunk_data);
      pdfHeader = buf.slice(0, 8).toString('utf-8').trim();

      // Download all chunks in batches to get exact page count from PDFDocument
      const allBufs = [];
      const BATCH = 10;
      for (let c = 0; c < pdfChunksCount; c += BATCH) {
        const endC = Math.min(pdfChunksCount - 1, c + BATCH - 1);
        const bRes = await db.query(
          'SELECT chunk_data FROM book_pdf_chunks WHERE book_id = $1 AND chunk_index BETWEEN $2 AND $3 ORDER BY chunk_index ASC',
          [b.id, c, endC]
        );
        for (const r of bRes.rows) {
          const raw = r.chunk_data;
          allBufs.push(Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
        }
      }
      const fullPdf = Buffer.concat(allBufs);
      try {
        const doc = await PDFDocument.load(fullPdf, { ignoreEncryption: true });
        pdfPageCount = doc.getPageCount();
      } catch (err) {
        pdfPageCount = `Error: ${err.message}`;
      }
    }

    // Baseline counts
    const pagesRes = await db.query('SELECT count(*) as cnt FROM book_pages WHERE book_id = $1', [b.id]);
    const eduChunksRes = await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [b.id]);
    const chaptersRes = await db.query('SELECT count(*) as cnt FROM book_chapters WHERE book_id = $1', [b.id]);

    // Question bank items linked
    const bankRes = await db.query(
      'SELECT count(*) as cnt FROM question_bank_items WHERE chapter_id IN (SELECT id FROM book_chapters WHERE book_id = $1)',
      [b.id]
    );

    results.push({
      index: i + 1,
      id: b.id,
      title_ar: b.title_ar,
      title_en: b.title_en,
      grade: b.grade_name,
      subject: b.subject_name,
      subject_code: b.subject_code,
      term: b.term,
      school_type: b.school_type,
      created_at: b.created_at,
      isApproved,
      isBook6,
      pdfChunksCount,
      isContiguous,
      pdfHeader,
      pdfPageCount,
      declaredPages: b.total_pages,
      baselinePages: Number(pagesRes.rows[0].cnt),
      baselineChunks: Number(eduChunksRes.rows[0].cnt),
      baselineChapters: Number(chaptersRes.rows[0].cnt),
      bankItems: Number(bankRes.rows[0].cnt)
    });
  }

  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
