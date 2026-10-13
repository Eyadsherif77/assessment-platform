import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import fs from 'fs';

const bookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9';

async function runReadOnlyReconciliation() {
  console.log('======================================================================');
  console.log('🔎 STEP 1: CHARACTER COUNT RECONCILIATION AUDIT');
  console.log('======================================================================\n');

  // Query character metrics
  const charMetrics = await db.query(
    `SELECT 
       count(*) as total_records,
       sum(char_count) as sum_char_count,
       sum(char_length(raw_text)) as sum_char_length,
       sum(length(raw_text)) as sum_byte_length
     FROM book_pages 
     WHERE book_id = $1`,
    [bookId]
  );

  console.log('--- EXACT DATABASE METRICS ---');
  console.log(`Total Pages: ${charMetrics.rows[0].total_records}`);
  console.log(`SUM(char_count): ${charMetrics.rows[0].sum_char_count}`);
  console.log(`SUM(CHAR_LENGTH(raw_text)): ${charMetrics.rows[0].sum_char_length}`);
  console.log(`SUM(LENGTH(raw_text)): ${charMetrics.rows[0].sum_byte_length}`);

  const pages = await db.query(
    `SELECT page_number, char_count, char_length(raw_text) as unicode_chars, length(raw_text) as bytes_len
     FROM book_pages 
     WHERE book_id = $1 
     ORDER BY page_number ASC`,
    [bookId]
  );

  let mismatches = 0;
  for (const p of pages.rows) {
    if (Number(p.char_count) !== Number(p.unicode_chars)) {
      mismatches++;
      console.log(`⚠️ Mismatch on page ${p.page_number}: char_count=${p.char_count} vs unicode_chars=${p.unicode_chars}`);
    }
  }
  console.log(`Total char_count vs unicode_chars mismatches across all 113 pages: ${mismatches}`);

  // Check Pages 42 and 84 specifically
  const p42 = pages.rows.find(p => p.page_number === 42);
  const p84 = pages.rows.find(p => p.page_number === 84);
  console.log(`\nRecovered Page 42 Metrics: char_count=${p42?.char_count}, unicode_chars=${p42?.unicode_chars}, bytes=${p42?.bytes_len}`);
  console.log(`Recovered Page 84 Metrics: char_count=${p84?.char_count}, unicode_chars=${p84?.unicode_chars}, bytes=${p84?.bytes_len}`);

  console.log('\n======================================================================');
  console.log('🔎 STEP 2: CHUNK COUNT RECONCILIATION AUDIT');
  console.log('======================================================================\n');

  // Total chunks in book_chunks
  const totalChunksRes = await db.query(
    `SELECT count(*) as total_chunks FROM book_chunks WHERE book_id = $1`,
    [bookId]
  );
  console.log(`Total book_chunks in DB for book ${bookId}: ${totalChunksRes.rows[0].total_chunks}`);

  // Chunks grouped by chapter
  const chunksByChapter = await db.query(
    `SELECT 
       bc.id as chapter_id, 
       bc.chapter_number, 
       bc.title_ar, 
       bc.start_page, 
       bc.end_page, 
       count(c.id) as chunk_count,
       min(c.page_number) as min_page,
       max(c.page_number) as max_page
     FROM book_chapters bc
     LEFT JOIN book_chunks c ON bc.id = c.chapter_id
     WHERE bc.book_id = $1
     GROUP BY bc.id, bc.chapter_number, bc.title_ar, bc.start_page, bc.end_page
     ORDER BY bc.chapter_number ASC`,
    [bookId]
  );

  console.log('\nChunks by Approved Chapter:');
  let assignedChunksSum = 0;
  for (const ch of chunksByChapter.rows) {
    assignedChunksSum += Number(ch.chunk_count);
    console.log(`  Unit ${ch.chapter_number} [${ch.title_ar}]: ${ch.chunk_count} chunks (Pages: ${ch.min_page}..${ch.max_page})`);
  }
  console.log(`  Sum of chunks assigned to chapters 1-4: ${assignedChunksSum}`);

  // Check for orphan chunks (chunks with NULL or unmapped chapter_id)
  const orphanChunks = await db.query(
    `SELECT id, page_number, chunk_index, chapter_id 
     FROM book_chunks 
     WHERE book_id = $1 AND (chapter_id IS NULL OR chapter_id NOT IN (SELECT id FROM book_chapters WHERE book_id = $1))`,
    [bookId]
  );
  console.log(`\nOrphan Chunks (outside chapters 1-4): ${orphanChunks.rows.length}`);
  for (const oc of orphanChunks.rows) {
    console.log(`  Chunk ID: ${oc.id}, Page: ${oc.page_number}, Chapter ID: ${oc.chapter_id}`);
  }

  // Check for duplicate chunks per page
  const pageChunkCounts = await db.query(
    `SELECT page_number, count(*) as count 
     FROM book_chunks 
     WHERE book_id = $1 
     GROUP BY page_number 
     HAVING count(*) > 1`,
    [bookId]
  );
  console.log(`Pages with multiple chunks: ${pageChunkCounts.rows.length}`);
  for (const pc of pageChunkCounts.rows) {
    console.log(`  Page ${pc.page_number}: ${pc.count} chunks`);
  }

  // Verify page 42 and 84 chunk entries
  const p42Chunks = await db.query(
    `SELECT id, chapter_id, page_number, chunk_index FROM book_chunks WHERE book_id = $1 AND page_number = 42`,
    [bookId]
  );
  const p84Chunks = await db.query(
    `SELECT id, chapter_id, page_number, chunk_index FROM book_chunks WHERE book_id = $1 AND page_number = 84`,
    [bookId]
  );
  console.log(`\nPage 42 chunks: ${p42Chunks.rows.length} (ID: ${p42Chunks.rows[0]?.id}, Chapter: ${p42Chunks.rows[0]?.chapter_id})`);
  console.log(`Page 84 chunks: ${p84Chunks.rows.length} (ID: ${p84Chunks.rows[0]?.id}, Chapter: ${p84Chunks.rows[0]?.chapter_id})`);

  process.exit(0);
}

runReadOnlyReconciliation().catch(err => {
  console.error(err);
  process.exit(1);
});
