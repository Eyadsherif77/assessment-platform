import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  const booksRes = await db.query(`
    SELECT b.id, b.title_ar, b.title_en, g.name_ar as grade, s.name_ar as subject
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
    ORDER BY g.sort_order ASC, s.sort_order ASC, b.created_at ASC
  `);

  for (let i = 0; i < booksRes.rows.length; i++) {
    const b = booksRes.rows[i];
    const ch = (await db.query(
      `SELECT chapter_number, title_ar, title_en, start_page, end_page, description 
       FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC`,
      [b.id]
    )).rows;

    console.log(`\n========================================================================`);
    console.log(`Book ${i+1}/13 [${b.id}] ${b.grade} - ${b.subject} (${b.title_ar} / ${b.title_en})`);
    console.log(`Total chapter records: ${ch.length}`);
    for (const c of ch) {
      console.log(`  Unit #${c.chapter_number} [p.${c.start_page}-${c.end_page}]: "${c.title_ar}" | "${c.title_en}"`);
    }
  }
}

main().catch(console.error);
