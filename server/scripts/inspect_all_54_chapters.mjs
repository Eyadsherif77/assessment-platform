import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  const booksRes = await db.query(`
    SELECT b.id, b.title_ar, b.title_en, g.name_ar as grade_ar, s.name_ar as subject_ar, b.total_pages
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
    ORDER BY g.sort_order ASC, s.sort_order ASC, b.created_at ASC
  `);

  for (let i = 0; i < booksRes.rows.length; i++) {
    const b = booksRes.rows[i];
    const chRes = await db.query(
      `SELECT c.id, c.chapter_number, c.title_ar, c.title_en, c.start_page, c.end_page, c.description,
              (SELECT count(*) FROM book_chunks WHERE chapter_id = c.id) as chunk_count
       FROM book_chapters c WHERE c.book_id = $1 ORDER BY c.chapter_number ASC`,
      [b.id]
    );

    console.log(`\n========================================================================`);
    console.log(`Book ${i+1}: [${b.id}] ${b.grade_ar} - ${b.subject_ar}`);
    console.log(`Title: ${b.title_ar} | ${b.title_en} (Pages: ${b.total_pages})`);
    console.log(`Chapters Count: ${chRes.rows.length}`);
    for (const c of chRes.rows) {
      console.log(`  Ch ${c.chapter_number}: "${c.title_ar}" | "${c.title_en}" (p.${c.start_page}-${c.end_page}, chunks: ${c.chunk_count})`);
      if (c.description) console.log(`     Desc: ${c.description.slice(0, 100)}...`);
    }
  }
}

main().catch(console.error);
