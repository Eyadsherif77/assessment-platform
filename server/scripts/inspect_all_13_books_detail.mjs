import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function inspectRemainingBooks() {
  console.log('=== STEP 1: INSPECTION OF ALL 13 BOOKS IN PRODUCTION DATABASE ===\n');

  const booksRes = await db.query(
    `SELECT 
       b.id, 
       b.title_ar, 
       b.title_en,
       b.school_type,
       b.term,
       g.name_ar as grade_name_ar,
       g.name_en as grade_name_en,
       st.name_ar as stage_name_ar,
       s.name_ar as subject_name_ar,
       s.name_en as subject_name_en,
       b.processing_status,
       b.total_pages as declared_pages
     FROM books b
     LEFT JOIN grades g ON b.grade_id = g.id
     LEFT JOIN academic_stages st ON b.academic_stage_id = st.id
     LEFT JOIN subjects s ON b.subject_id = s.id
     ORDER BY st.name_ar, g.name_ar, s.name_ar`
  );

  const books = booksRes.rows;
  console.log(`Found ${books.length} total books in platform.\n`);

  const report = [];

  for (const b of books) {
    // 1. PDF chunks count
    const chunksRes = await db.query(
      'SELECT count(*) as count, sum(length(chunk_data)) as total_size FROM book_pdf_chunks WHERE book_id = $1',
      [b.id]
    );
    const pdfChunksCount = Number(chunksRes.rows[0].count);
    const pdfTotalSize = Number(chunksRes.rows[0].total_size || 0);

    // 2. Extracted pages count
    const pagesRes = await db.query(
      'SELECT count(*) as count, sum(char_count) as total_chars FROM book_pages WHERE book_id = $1',
      [b.id]
    );
    const pagesCount = Number(pagesRes.rows[0].count);
    const totalChars = Number(pagesRes.rows[0].total_chars || 0);

    // 3. Chapters count
    const chapRes = await db.query(
      'SELECT count(*) as count FROM book_chapters WHERE book_id = $1',
      [b.id]
    );
    const chapCount = Number(chapRes.rows[0].count);

    // 4. Educational chunks count
    const eduChunksRes = await db.query(
      'SELECT count(*) as count FROM book_chunks WHERE book_id = $1',
      [b.id]
    );
    const eduChunksCount = Number(eduChunksRes.rows[0].count);

    const isVerified = (b.id === 'd7bbfca2-6d8f-461b-8e39-2015981e86ec' || b.id === 'f19276d3-4adb-4297-bb77-5ed87ba638b9');

    report.push({
      id: b.id,
      title: b.title_ar,
      title_en: b.title_en,
      subject: b.subject_name_ar,
      grade: b.grade_name_ar,
      stage: b.stage_name_ar,
      term: b.term,
      school_type: b.school_type,
      status: isVerified ? 'VERIFIED_PILOT' : (pagesCount > 0 ? 'PARTIAL_EXTRACTION' : 'UNPROCESSED'),
      pdf_chunks: pdfChunksCount,
      pdf_size_mb: (pdfTotalSize / (1024 * 1024)).toFixed(2),
      book_pages: pagesCount,
      total_unicode_chars: totalChars,
      book_chapters: chapCount,
      book_chunks: eduChunksCount
    });
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

inspectRemainingBooks().catch(err => {
  console.error(err);
  process.exit(1);
});
