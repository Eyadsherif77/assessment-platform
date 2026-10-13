import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  console.log('=== FAST METADATA & PDF CHUNKS AUDIT FOR ALL UNPROCESSED BOOKS ===\n');

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

    // Chunks count & min/max
    const chunksRes = await db.query(
      'SELECT count(*) as cnt, min(chunk_index) as min_idx, max(chunk_index) as max_idx, sum(length(chunk_data)) as total_bytes FROM book_pdf_chunks WHERE book_id = $1',
      [b.id]
    );
    const cnt = Number(chunksRes.rows[0].cnt || 0);
    const minIdx = chunksRes.rows[0].min_idx !== null ? Number(chunksRes.rows[0].min_idx) : null;
    const maxIdx = chunksRes.rows[0].max_idx !== null ? Number(chunksRes.rows[0].max_idx) : null;
    const totalBytes = Number(chunksRes.rows[0].total_bytes || 0);

    // Reconstruct first chunk to check header
    let pdfHeader = 'N/A';
    if (cnt > 0) {
      const firstChunk = await db.query(
        'SELECT chunk_data FROM book_pdf_chunks WHERE book_id = $1 AND chunk_index = 0',
        [b.id]
      );
      if (firstChunk.rows.length > 0) {
        const buf = Buffer.from(firstChunk.rows[0].chunk_data);
        pdfHeader = buf.slice(0, 10).toString('utf-8').replace(/[\r\n]/g, '').trim();
      }
    }

    // Baseline counts
    const pagesRes = await db.query('SELECT count(*) as cnt FROM book_pages WHERE book_id = $1', [b.id]);
    const eduChunksRes = await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [b.id]);
    const chaptersRes = await db.query('SELECT count(*) as cnt FROM book_chapters WHERE book_id = $1', [b.id]);

    results.push({
      auditIndex: i + 1,
      id: b.id,
      title: b.title_ar,
      title_en: b.title_en,
      grade: b.grade_name,
      subject: b.subject_name,
      subject_code: b.subject_code,
      term: b.term,
      school_type: b.school_type,
      isApproved,
      isBook6,
      pdfChunksCount: cnt,
      indices: `${minIdx}..${maxIdx}`,
      pdfHeader,
      pdfSizeMB: (totalBytes / (1024 * 1024)).toFixed(2),
      declaredPages: b.total_pages,
      pagesCount: Number(pagesRes.rows[0].cnt),
      eduChunksCount: Number(eduChunksRes.rows[0].cnt),
      chaptersCount: Number(chaptersRes.rows[0].cnt)
    });
  }

  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
