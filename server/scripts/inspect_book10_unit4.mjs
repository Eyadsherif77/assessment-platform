import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  console.log('========================================================================');
  console.log('🔍 DEEP INSPECTION: BOOK 10 UNIT 4 TITLE & CONTENT CONSISTENCY');
  console.log('========================================================================\n');

  // Case A: Book 10 in Acceptance Baseline: fa2a1525-c46f-4b34-9f48-b762be88e5c5 (Prep 1 Social Studies)
  console.log('--- CASE A: Prep 1 Social Studies (ID: fa2a1525-c46f-4b34-9f48-b762be88e5c5) ---');
  const b10_A = await db.query(
    `SELECT * FROM book_chapters WHERE book_id = 'fa2a1525-c46f-4b34-9f48-b762be88e5c5' AND chapter_number = 4`
  );
  if (b10_A.rows.length > 0) {
    const ch = b10_A.rows[0];
    console.log(`Unit 4 Metadata:`);
    console.log(`  ID: ${ch.id}`);
    console.log(`  Title Ar: "${ch.title_ar}"`);
    console.log(`  Title En: "${ch.title_en}"`);
    console.log(`  Pages: ${ch.start_page} to ${ch.end_page}`);
    console.log(`  Description: ${ch.description}`);

    const chunks = (await db.query(
      `SELECT page_number, chunk_index, content FROM book_chunks WHERE chapter_id = $1 ORDER BY page_number ASC`,
      [ch.id]
    )).rows;
    console.log(`  Total chunks in Unit 4: ${chunks.length}`);
    for (const c of chunks) {
      console.log(`    [p.${c.page_number} chunk ${c.chunk_index}]: ${(c.content || '').slice(0, 120).replace(/\s+/g, ' ')}...`);
    }
  }

  // Case B: Book 10 in Sorting Order: 37bfa0c0-c4ce-419f-930a-000043d8d3f9 (Prep 2 English)
  console.log('\n--- CASE B: Prep 2 English (ID: 37bfa0c0-c4ce-419f-930a-000043d8d3f9) ---');
  const b10_B = await db.query(
    `SELECT * FROM book_chapters WHERE book_id = '37bfa0c0-c4ce-419f-930a-000043d8d3f9' AND chapter_number = 4`
  );
  if (b10_B.rows.length > 0) {
    const ch = b10_B.rows[0];
    console.log(`Unit 4 Metadata:`);
    console.log(`  ID: ${ch.id}`);
    console.log(`  Title Ar: "${ch.title_ar}"`);
    console.log(`  Title En: "${ch.title_en}"`);
    console.log(`  Pages: ${ch.start_page} to ${ch.end_page}`);
    console.log(`  Description: ${ch.description}`);

    const chunks = (await db.query(
      `SELECT page_number, chunk_index, content FROM book_chunks WHERE chapter_id = $1 ORDER BY page_number ASC`,
      [ch.id]
    )).rows;
    console.log(`  Total chunks in Unit 4: ${chunks.length}`);
    for (const c of chunks) {
      console.log(`    [p.${c.page_number} chunk ${c.chunk_index}]: ${(c.content || '').slice(0, 120).replace(/\s+/g, ' ')}...`);
    }
  }
}

main().catch(console.error);
