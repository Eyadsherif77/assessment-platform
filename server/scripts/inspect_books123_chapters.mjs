import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  const books = [
    { id: 'd7bbfca2-6d8f-461b-8e39-2015981e86ec', name: 'Book 1: Science Prep 1' },
    { id: 'f19276d3-4adb-4297-bb77-5ed87ba638b9', name: 'Book 2: Social Studies Prep 3' },
    { id: '19886434-1839-427d-af31-4c64fcf79525', name: 'Book 3: Math Prep 2' }
  ];

  for (const b of books) {
    const chRes = await db.query(
      `SELECT id, chapter_number, title_ar, title_en, start_page, end_page, description, description_en 
       FROM book_chapters 
       WHERE book_id = $1 
       ORDER BY chapter_number ASC`,
      [b.id]
    );

    const chunkDistribution = await db.query(
      `SELECT chapter_id, count(*) as count, min(page_number) as min_p, max(page_number) as max_p
       FROM book_chunks
       WHERE book_id = $1
       GROUP BY chapter_id`,
      [b.id]
    );

    console.log('==================================================================');
    console.log(`${b.name} (${b.id}) - Chapters count: ${chRes.rows.length}`);
    console.log('==================================================================');
    for (const c of chRes.rows) {
      const chunkMatch = chunkDistribution.rows.find(k => k.chapter_id === c.id);
      console.log(`Unit ${c.chapter_number}: "${c.title_en || c.title_ar}" (Arabic: "${c.title_ar}")`);
      console.log(`  ID:         ${c.id}`);
      console.log(`  Pages:      PDF ${c.start_page} .. ${c.end_page}`);
      console.log(`  Chunks:     ${chunkMatch ? chunkMatch.count : 0} chunks (chunk pages: ${chunkMatch ? `${chunkMatch.min_p}..${chunkMatch.max_p}` : 'none'})`);
    }
    console.log('');
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
