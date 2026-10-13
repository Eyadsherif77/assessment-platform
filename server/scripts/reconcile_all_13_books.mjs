import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  console.log('=== RECONCILING BOOK_PAGES AND BOOK_CHUNKS ACROSS ALL 13 BOOKS ===\n');

  // 1. Grouped counts by book_id in books, book_pages, book_chunks
  const res = await db.query(`
    SELECT 
      b.id,
      b.title_ar,
      b.title_en,
      g.name_ar as grade_ar,
      s.name_ar as subject_ar,
      s.code as subject_code,
      COALESCE(p.page_count, 0) as page_count,
      COALESCE(c.chunk_count, 0) as chunk_count,
      COALESCE(ch.chapter_count, 0) as chapter_count
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
    LEFT JOIN (
      SELECT book_id, COUNT(*) as page_count 
      FROM book_pages 
      GROUP BY book_id
    ) p ON b.id = p.book_id
    LEFT JOIN (
      SELECT book_id, COUNT(*) as chunk_count 
      FROM book_chunks 
      GROUP BY book_id
    ) c ON b.id = c.book_id
    LEFT JOIN (
      SELECT book_id, COUNT(*) as chapter_count 
      FROM book_chapters 
      GROUP BY book_id
    ) ch ON b.id = ch.book_id
    ORDER BY p.page_count DESC, b.id ASC
  `);

  console.log(JSON.stringify(res.rows, null, 2));

  // 2. Check for orphaned records in book_pages (records whose book_id does not exist in books)
  const orphanPages = await db.query(`
    SELECT count(*) as orphan_count, book_id 
    FROM book_pages 
    WHERE book_id NOT IN (SELECT id FROM books) 
    GROUP BY book_id
  `);
  console.log('\nOrphaned book_pages:', orphanPages.rows);

  // 3. Check for orphaned records in book_chunks
  const orphanChunks = await db.query(`
    SELECT count(*) as orphan_count, book_id 
    FROM book_chunks 
    WHERE book_id NOT IN (SELECT id FROM books) 
    GROUP BY book_id
  `);
  console.log('Orphaned book_chunks:', orphanChunks.rows);

  // 4. Overall table totals
  const totalPages = await db.query('SELECT count(*) as total FROM book_pages');
  const totalChunks = await db.query('SELECT count(*) as total FROM book_chunks');
  console.log(`\nGrand Totals:`);
  console.log(`  book_pages:  ${totalPages.rows[0].total}`);
  console.log(`  book_chunks: ${totalChunks.rows[0].total}`);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
