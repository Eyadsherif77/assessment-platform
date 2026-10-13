import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';

async function audit() {
  const booksQuery = await db.query(`
    SELECT 
      b.id, b.title_ar, b.title_en, b.school_type, b.term, b.processing_status, 
      b.file_size, b.total_pages, b.file_url,
      g.code as grade_code, g.name_ar as grade_name,
      s.id as subject_id, s.code as subject_code, s.name_ar as subject_name
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
    ORDER BY g.sort_order, s.sort_order, b.title_ar
  `);

  console.log(`=== AUDIT REPORT: TOTAL BOOKS FOUND: ${booksQuery.rows.length} ===\n`);

  for (let i = 0; i < booksQuery.rows.length; i++) {
    const b = booksQuery.rows[i];
    const chs = await db.query(
      'SELECT id, chapter_number, title_ar, title_en, start_page, end_page FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number',
      [b.id]
    );
    const pagesCount = await db.query('SELECT count(*) as cnt FROM book_pages WHERE book_id = $1', [b.id]);
    const chunksCount = await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [b.id]);
    
    // Check sample page text
    const samplePage = await db.query(
      'SELECT page_number, char_count, SUBSTRING(raw_text, 1, 150) as snippet FROM book_pages WHERE book_id = $1 ORDER BY page_number LIMIT 2',
      [b.id]
    );

    console.log(`[Book #${i + 1}] ID: ${b.id}`);
    console.log(`  Title (Ar): "${b.title_ar}" | Title (En): "${b.title_en}"`);
    console.log(`  Grade: ${b.grade_name} (${b.grade_code}) | Subject: ${b.subject_name} (${b.subject_code})`);
    console.log(`  School Type: "${b.school_type}" | Term: ${b.term} | Status: ${b.processing_status}`);
    console.log(`  File Size: ${b.file_size} bytes | Total Pages recorded: ${b.total_pages}`);
    console.log(`  File URL: ${b.file_url ? b.file_url.substring(0, 80) + '...' : 'NULL'}`);
    console.log(`  DB Counts -> Chapters: ${chs.rows.length} | Extracted Pages: ${pagesCount.rows[0].cnt} | Chunks: ${chunksCount.rows[0].cnt}`);
    console.log(`  Chapters List:`);
    chs.rows.forEach(c => {
      console.log(`    - Unit ${c.chapter_number}: "${c.title_ar}" (Pages: ${c.start_page} -> ${c.end_page}) [ID: ${c.id}]`);
    });
    if (samplePage.rows.length > 0) {
      console.log(`  Sample Page Extracted: Page ${samplePage.rows[0].page_number} (Chars: ${samplePage.rows[0].char_count})`);
    } else {
      console.log(`  WARNING: NO EXTRACTED PAGES IN book_pages TABLE!`);
    }
    console.log('--------------------------------------------------------------------------------\n');
  }

  process.exit(0);
}

audit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
