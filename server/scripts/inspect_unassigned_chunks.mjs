import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  console.log('Inspecting chunks without chapter_id in Book 9 and Book 12:\n');

  const b9Chunks = await db.query(
    `SELECT page_number, chunk_index, content FROM book_chunks WHERE book_id = '81b8a308-7fcf-4938-8c45-aa0056624f32' AND chapter_id IS NULL ORDER BY page_number ASC`
  );
  console.log(`Book 9 (Social Studies Prep 2) - ${b9Chunks.rows.length} unassigned chunks:`);
  for (const c of b9Chunks.rows) {
    console.log(`  Page ${c.page_number} (chunk ${c.chunk_index}): ${(c.content || '').slice(0, 100).replace(/\s+/g, ' ')}...`);
  }

  const b12Chunks = await db.query(
    `SELECT page_number, chunk_index, content FROM book_chunks WHERE book_id = 'f19276d3-4adb-4297-bb77-5ed87ba638b9' AND chapter_id IS NULL ORDER BY page_number ASC`
  );
  console.log(`\nBook 12 (Social Studies Prep 3) - ${b12Chunks.rows.length} unassigned chunks:`);
  for (const c of b12Chunks.rows) {
    console.log(`  Page ${c.page_number} (chunk ${c.chunk_index}): ${(c.content || '').slice(0, 100).replace(/\s+/g, ' ')}...`);
  }
}

main().catch(console.error);
