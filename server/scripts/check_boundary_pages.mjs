import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

const bookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9';

async function checkBoundaryPages() {
  const targetPages = [8, 9, 10, 28, 29, 30, 31, 62, 63, 64, 65, 90, 91, 92, 93];
  const r = await db.query(
    'SELECT page_number, raw_text FROM book_pages WHERE book_id = $1 AND page_number IN (' + targetPages.join(',') + ') ORDER BY page_number ASC',
    [bookId]
  );

  console.log('=== BOUNDARY PAGES INSPECTION ===\n');
  for (const row of r.rows) {
    const lines = row.raw_text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const topLines = lines.slice(0, 4).join(' | ');
    const bottomLines = lines.slice(-2).join(' | ');
    console.log(`PDF Page ${row.page_number}:`);
    console.log(`  Top: ${topLines}`);
    console.log(`  Bottom: ${bottomLines}`);
    console.log('----------------------------------------------------');
  }

  // Also query chapter records
  const chRes = await db.query(
    'SELECT id, chapter_number, title_ar, title_en, start_page, end_page, description FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC',
    [bookId]
  );
  console.log('\nCurrent book_chapters in DB:');
  console.log(JSON.stringify(chRes.rows, null, 2));

  process.exit(0);
}

checkBoundaryPages().catch(err => {
  console.error(err);
  process.exit(1);
});
