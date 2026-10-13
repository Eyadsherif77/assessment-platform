import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

const bookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9';

const VERIFIED_BOUNDARIES = [
  { chapter_number: 1, start_page: 9, end_page: 36 },
  { chapter_number: 2, start_page: 37, end_page: 62 },
  { chapter_number: 3, start_page: 63, end_page: 90 },
  { chapter_number: 4, start_page: 91, end_page: 113 }
];

async function updateBoundariesAndChunks() {
  console.log('=== UPDATING UNIT BOUNDARIES TO EXACT PRINTED EVIDENCE ===\n');

  for (const b of VERIFIED_BOUNDARIES) {
    console.log(`Updating Unit ${b.chapter_number} to PDF range: ${b.start_page}..${b.end_page}`);
    await db.query(
      `UPDATE book_chapters 
       SET start_page = $1, end_page = $2 
       WHERE book_id = $3 AND chapter_number = $4`,
      [b.start_page, b.end_page, bookId, b.chapter_number]
    );
  }

  // Fetch chapter IDs
  const chRes = await db.query(
    'SELECT id, chapter_number, start_page, end_page FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC',
    [bookId]
  );

  console.log('\nRe-aligning book_chunks chapter_id associations:');
  for (const ch of chRes.rows) {
    const res = await db.query(
      `UPDATE book_chunks
       SET chapter_id = $1
       WHERE book_id = $2 AND page_number >= $3 AND page_number <= $4`,
      [ch.id, bookId, ch.start_page, ch.end_page]
    );
    console.log(`  Unit ${ch.chapter_number} (${ch.start_page}..${ch.end_page}) -> ${ch.id}`);
  }

  // Verify chunk counts per chapter
  const counts = await db.query(
    `SELECT bc.chapter_number, bc.title_ar, count(c.id) as chunk_count, min(c.page_number) as min_p, max(c.page_number) as max_p
     FROM book_chapters bc
     LEFT JOIN book_chunks c ON bc.id = c.chapter_id
     WHERE bc.book_id = $1
     GROUP BY bc.id, bc.chapter_number, bc.title_ar
     ORDER BY bc.chapter_number ASC`,
    [bookId]
  );

  console.log('\nVerified Chunks Distribution:');
  for (const row of counts.rows) {
    console.log(`  Unit ${row.chapter_number} [${row.title_ar}]: ${row.chunk_count} chunks (Pages: ${row.min_p}..${row.max_p})`);
  }

  process.exit(0);
}

updateBoundariesAndChunks().catch(err => {
  console.error(err);
  process.exit(1);
});
