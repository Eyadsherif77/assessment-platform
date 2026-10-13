import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import fs from 'fs';

async function listRemainingBooksFast() {
  const booksRes = await db.query(`
    SELECT 
      b.id, b.title_ar, b.title_en, b.school_type, b.term, b.processing_status,
      b.file_size, b.total_pages, b.file_url,
      g.code as grade_code, g.name_ar as grade_name,
      s.code as subject_code, s.name_ar as subject_name
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
    ORDER BY g.sort_order, s.sort_order, b.title_ar
  `);

  const pagesRes = await db.query(`
    SELECT book_id, COUNT(*) as cnt, SUM(char_count) as total_chars
    FROM book_pages
    GROUP BY book_id
  `);
  const pagesMap = new Map();
  pagesRes.rows.forEach(r => pagesMap.set(r.book_id, r));

  const chaptersRes = await db.query(`
    SELECT book_id, COUNT(*) as cnt
    FROM book_chapters
    GROUP BY book_id
  `);
  const chaptersMap = new Map();
  chaptersRes.rows.forEach(r => chaptersMap.set(r.book_id, r.cnt));

  const chunksRes = await db.query(`
    SELECT book_id, COUNT(*) as cnt
    FROM book_pdf_chunks
    GROUP BY book_id
  `);
  const chunksMap = new Map();
  chunksRes.rows.forEach(r => chunksMap.set(r.book_id, r.cnt));

  const list = booksRes.rows.map(b => {
    const p = pagesMap.get(b.id) || { cnt: 0, total_chars: 0 };
    const chCnt = chaptersMap.get(b.id) || 0;
    const chunkCnt = chunksMap.get(b.id) || 0;

    return {
      id: b.id,
      title: b.title_ar,
      grade: b.grade_name,
      subject: b.subject_name,
      subject_code: b.subject_code,
      school_type: b.school_type,
      file_size_mb: (Number(b.file_size) / (1024 * 1024)).toFixed(1),
      total_pages: b.total_pages,
      pdf_chunks: chunkCnt,
      extracted_pages: Number(p.cnt),
      extracted_chars: Number(p.total_chars || 0),
      chapters_count: Number(chCnt),
      status: b.processing_status
    };
  });

  console.table(list);
  fs.writeFileSync('./scripts/remaining_books_audit.json', JSON.stringify(list, null, 2), 'utf-8');
}

listRemainingBooksFast().catch(console.error);
