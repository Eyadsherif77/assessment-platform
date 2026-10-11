import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';

async function run() {
  console.log('--- Step 1: Deleting Physics/Math questions from English subject ---');
  const badEnglish = await db.query(
    "SELECT id, question_text FROM question_bank_items WHERE question_text LIKE '%car travels%' OR question_text LIKE '%average speed%'"
  );
  console.log('Found bad English items:', badEnglish.rows.length);
  for (const item of badEnglish.rows) {
    await db.query('DELETE FROM question_bank_options WHERE question_item_id = $1', [item.id]);
    await db.query('DELETE FROM question_bank_items WHERE id = $1', [item.id]);
    console.log('Deleted bad English item:', item.question_text);
  }

  console.log('--- Step 2: Deleting Math questions from Arabic subject ---');
  const badArabic = await db.query(
    "SELECT id, question_text FROM question_bank_items WHERE question_text LIKE '%نظيره الجمعي%' OR question_text LIKE '%المحايد الجمعي%'"
  );
  console.log('Found bad Arabic items:', badArabic.rows.length);
  for (const item of badArabic.rows) {
    await db.query('DELETE FROM question_bank_options WHERE question_item_id = $1', [item.id]);
    await db.query('DELETE FROM question_bank_items WHERE id = $1', [item.id]);
    console.log('Deleted bad Arabic item:', item.question_text);
  }

  console.log('--- Step 3: Randomizing page references across chapters ---');
  const chaptersRes = await db.query('SELECT id, start_page, end_page, title_ar FROM book_chapters');
  const chMap = new Map();
  for (const c of chaptersRes.rows) {
    chMap.set(c.id, c);
  }

  const itemsRes = await db.query('SELECT id, chapter_id, question_text, page_reference FROM question_bank_items');
  let updated = 0;
  for (const item of itemsRes.rows) {
    const ch = chMap.get(item.chapter_id);
    if (ch && ch.start_page && ch.end_page) {
      const s = Number(ch.start_page);
      const e = Number(ch.end_page);
      if (e > s) {
        // Random page within [s, e]
        const randPage = Math.floor(s + Math.random() * (e - s + 1));
        await db.query('UPDATE question_bank_items SET page_reference = $1 WHERE id = $2', [randPage, item.id]);
        console.log(`Updated item [${item.id}] -> page ${randPage} (Unit: ${s}-${e})`);
        updated++;
      }
    }
  }

  console.log(`Successfully updated ${updated} questions with randomized page numbers inside their respective units.`);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
