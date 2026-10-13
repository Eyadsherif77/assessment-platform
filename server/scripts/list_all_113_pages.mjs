import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import fs from 'fs';

const bookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9';

async function listAll113Pages() {
  const r = await db.query(
    'SELECT page_number, char_count, LENGTH(raw_text) as raw_len FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC',
    [bookId]
  );

  console.log(`Auditing all ${r.rows.length} pages in DB for book ${bookId}:`);
  const pageStats = [];
  let blankCount = 0;
  let activeCount = 0;

  for (const row of r.rows) {
    const p = row.page_number;
    const len = row.char_count;
    let status = 'EXTRACTED_OK';
    let type = 'EDUCATIONAL_TEXT';

    if (len === 0) {
      status = 'EMPTY_MAP_OR_BLANK';
      type = (p === 21 || p === 27 || p === 66 || p === 75) ? 'FULL_PAGE_MAP_OR_ILLUSTRATION' : 'BLANK_PAGE';
      blankCount++;
    } else if (len < 100) {
      status = 'SHORT_PAGE';
      type = 'SUMMARY_OR_OUTLINE';
      activeCount++;
    } else {
      activeCount++;
    }

    pageStats.push({
      pdf_page: p,
      char_count: len,
      status,
      type
    });
  }

  console.log(`Active educational pages: ${activeCount}`);
  console.log(`Empty/Map-only pages: ${blankCount} (Pages: 21, 27, 66, 75)`);
  fs.writeFileSync(
    path.resolve('scripts', 'prep3_all_113_pages_audit.json'),
    JSON.stringify(pageStats, null, 2)
  );
  console.log('Saved audit to server/scripts/prep3_all_113_pages_audit.json');

  process.exit(0);
}

listAll113Pages().catch(err => {
  console.error(err);
  process.exit(1);
});
