import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

const bookId = '81b8a308-7fcf-4938-8c45-aa0056624f32';

async function inspectQuestionBank() {
  console.log(`======================================================================`);
  console.log(`📋 INSPECTING QUESTION BANK ITEMS FOR BOOK 4 (${bookId})`);
  console.log(`======================================================================\n`);

  // 1. Find banks associated with grade and subject of Book 4
  const bRes = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
  const book = bRes.rows[0];
  console.log(`Book: "${book.title_ar}" (Grade: ${book.grade_id}, Subject: ${book.subject_id})\n`);

  // Check question banks
  const banksRes = await db.query(
    'SELECT * FROM question_banks WHERE grade_id = $1 AND subject_id = $2',
    [book.grade_id, book.subject_id]
  );
  console.log(`Found ${banksRes.rows.length} matching question_bank row(s):`);
  console.log(banksRes.rows);

  // Check question bank items by chapter_id in book_chapters
  const chaptersRes = await db.query(
    'SELECT id, chapter_number, title_ar FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC',
    [bookId]
  );
  const chapterIds = chaptersRes.rows.map(c => c.id);

  console.log(`\nChapters for Book 4:`);
  chaptersRes.rows.forEach(c => console.log(`  Unit ${c.chapter_number} (${c.id}): ${c.title_ar}`));

  const itemsRes = await db.query(
    `SELECT qbi.*, qb.title as bank_title
     FROM question_bank_items qbi
     LEFT JOIN question_banks qb ON qbi.bank_id = qb.id
     WHERE qbi.chapter_id IN (${chapterIds.map((_, i) => `$${i + 1}`).join(', ')})`,
    chapterIds
  );

  console.log(`\nTotal question_bank_items associated with Book 4 chapter IDs: ${itemsRes.rows.length}`);

  // Fetch all options
  if (itemsRes.rows.length > 0) {
    const itemIds = itemsRes.rows.map(r => r.id);
    const optsRes = await db.query(
      `SELECT * FROM question_bank_options WHERE question_item_id IN (${itemIds.map((_, i) => `$${i + 1}`).join(', ')})`,
      itemIds
    );
    console.log(`Total question_bank_options associated with these items: ${optsRes.rows.length}`);

    // Group options by item
    const optsByItem = {};
    optsRes.rows.forEach(o => {
      if (!optsByItem[o.question_item_id]) optsByItem[o.question_item_id] = [];
      optsByItem[o.question_item_id].push(o);
    });

    console.log(`\nDetailed Breakdown of Question Bank Items:`);
    itemsRes.rows.forEach((item, idx) => {
      const opts = optsByItem[item.id] || [];
      const correctOpt = opts.find(o => o.is_correct === 1 || o.is_correct === true);
      const ch = chaptersRes.rows.find(c => c.id === item.chapter_id);
      console.log(`\n[Item #${idx + 1}] ID: ${item.id}`);
      console.log(`  Unit: ${ch ? `Unit ${ch.chapter_number} (${ch.title_ar})` : 'Orphaned Chapter ID: ' + item.chapter_id}`);
      console.log(`  Question: "${item.question_text}"`);
      console.log(`  Page Reference: ${item.page_reference} | Bloom: ${item.bloom_level} | Difficulty: ${item.difficulty}`);
      console.log(`  Quarantined: ${item.is_quarantined} | Reason: ${item.quarantine_reason || 'None'}`);
      console.log(`  Options Count: ${opts.length} (Correct: "${correctOpt ? correctOpt.option_text : 'NONE'}")`);
      opts.forEach(o => {
        console.log(`    - [${o.is_correct ? 'CORRECT' : '       '}] ${o.option_text}`);
      });
    });
  }

  process.exit(0);
}

inspectQuestionBank().catch(err => {
  console.error(err);
  process.exit(1);
});
