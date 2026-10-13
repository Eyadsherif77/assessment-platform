import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  const tables = [
    'book_pages',
    'book_chapters',
    'book_chunks',
    'question_bank_items',
    'question_bank_options',
    'question_banks'
  ];

  console.log('=== TABLE DEFINITIONS ===');
  for (const t of tables) {
    const res = await db.query(`SHOW CREATE TABLE ${t}`);
    console.log(`\n--- ${t} ---`);
    console.log(res.rows[0]['Create Table']);
  }

  console.log('\n=== FOREIGN KEY / COLUMN REFERENCES TO BOOKS & CHAPTERS ===');
  const fkRes = await db.query(`
    SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = 'assessment_platform'
      AND (
        REFERENCED_TABLE_NAME IN ('books', 'book_chapters', 'book_chunks', 'book_pages', 'question_bank_items')
        OR COLUMN_NAME IN ('book_id', 'chapter_id', 'source_chunk_id', 'source_page_id')
      )
  `);
  console.log(JSON.stringify(fkRes.rows, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
