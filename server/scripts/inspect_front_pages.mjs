import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  const booksRes = await db.query(`
    SELECT b.id, b.title_ar, b.title_en, g.name_ar as grade, s.name_ar as subject, b.total_pages, b.term, b.school_type
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
    ORDER BY g.sort_order ASC, s.sort_order ASC, b.created_at ASC
  `);

  for (let i = 0; i < booksRes.rows.length; i++) {
    const b = booksRes.rows[i];
    console.log(`\n========================================================================`);
    console.log(`Book ${i+1}/13 [ID: ${b.id}]`);
    console.log(`Grade: ${b.grade} | Subject: ${b.subject} | Term: ${b.term} | Type: ${b.school_type}`);
    console.log(`Current DB: ar="${b.title_ar}" | en="${b.title_en}"`);

    // Chapters
    const chRes = await db.query(
      `SELECT chapter_number, title_ar, title_en, start_page, end_page FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC`,
      [b.id]
    );
    console.log(`Units / Chapters (${chRes.rows.length}):`);
    for (const c of chRes.rows) {
      console.log(`   Unit ${c.chapter_number}: "${c.title_ar}" | "${c.title_en}" (p.${c.start_page}-${c.end_page})`);
    }

    // First 2 pages
    const pagesRes = await db.query(
      `SELECT page_number, raw_text FROM book_pages WHERE book_id = $1 AND page_number IN (1, 2) ORDER BY page_number ASC`,
      [b.id]
    );

    for (const p of pagesRes.rows) {
      const snippet = (p.raw_text || '').replace(/\s+/g, ' ').slice(0, 250);
      console.log(`   Page ${p.page_number} snippet: ${snippet}`);
    }
  }
}

main().catch(console.error);
