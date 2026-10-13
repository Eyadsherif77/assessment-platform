import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

const bookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9';

async function auditQuestions() {
  console.log('=== AUDITING QUESTION PROVENANCE & DATABASE RECORDS ===\n');

  // 1. Fetch raw text of Page 51
  const p51 = await db.query(
    'SELECT page_number, raw_text FROM book_pages WHERE book_id = $1 AND page_number = 51',
    [bookId]
  );
  console.log('--- RAW TEXT OF PDF PAGE 51 (Printed Page 50) ---');
  console.log(p51.rows[0].raw_text);

  // 2. Fetch raw text of Page 58
  const p58 = await db.query(
    'SELECT page_number, raw_text FROM book_pages WHERE book_id = $1 AND page_number = 58',
    [bookId]
  );
  console.log('\n--- RAW TEXT OF PDF PAGE 58 (Printed Page 57) ---');
  console.log(p58.rows[0].raw_text);

  // 3. Inspect Question Bank Items for Unit 2
  const chRes = await db.query(
    'SELECT id, title_ar FROM book_chapters WHERE book_id = $1 AND chapter_number = 2',
    [bookId]
  );
  const unit2Id = chRes.rows[0].id;

  const qbRes = await db.query(
    `SELECT qbi.id, qbi.question_text, qbi.page_reference, qbi.difficulty, qbi.bloom_level, qbi.explanation, qbi.source_chunk_id, qbi.created_at
     FROM question_bank_items qbi
     WHERE qbi.chapter_id = $1
     ORDER BY qbi.created_at DESC`,
    [unit2Id]
  );

  console.log(`\nFound ${qbRes.rows.length} questions in question_bank_items for Unit 2:`);
  for (const q of qbRes.rows) {
    console.log(`\nQuestion ID: ${q.id}`);
    console.log(`Text: "${q.question_text}"`);
    console.log(`Page Reference: PDF Page ${q.page_reference}`);
    console.log(`Explanation: "${q.explanation}"`);
    console.log(`Source Chunk ID: ${q.source_chunk_id}`);
    console.log(`Created At: ${q.created_at}`);

    // Fetch options
    const optRes = await db.query(
      'SELECT id, option_text, is_correct FROM question_bank_options WHERE question_item_id = $1 ORDER BY id ASC',
      [q.id]
    );
    console.log('Options:');
    for (const opt of optRes.rows) {
      console.log(`  [${opt.is_correct ? 'CORRECT' : '       '}] (ID: ${opt.id}) ${opt.option_text}`);
    }
  }

  process.exit(0);
}

auditQuestions().catch(err => {
  console.error(err);
  process.exit(1);
});
