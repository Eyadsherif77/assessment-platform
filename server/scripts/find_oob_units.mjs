import { connect } from '@tidbcloud/serverless';
import dotenv from 'dotenv';
dotenv.config();

const conn = connect({
  host: process.env.TIDB_HOST,
  username: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE
});

async function run() {
  const oobUnits = await conn.execute(`
    SELECT 
      b.id as book_id,
      b.title_ar as book_title,
      bc.id as chapter_id,
      bc.chapter_number,
      bc.title_ar as chapter_title,
      bc.start_page,
      bc.end_page,
      COUNT(chk.id) as oob_chunk_count,
      GROUP_CONCAT(chk.id) as oob_chunk_ids,
      GROUP_CONCAT(chk.page_number) as oob_page_numbers
    FROM book_chunks chk
    JOIN book_chapters bc ON bc.id = chk.chapter_id
    JOIN books b ON b.id = bc.book_id
    WHERE chk.page_number < bc.start_page OR chk.page_number > bc.end_page
    GROUP BY b.id, b.title_ar, bc.id, bc.chapter_number, bc.title_ar, bc.start_page, bc.end_page
  `);
  console.log('--- ALL OOB UNITS JSON ---');
  console.log(JSON.stringify(oobUnits, null, 2));
  console.log('--- END OOB UNITS JSON ---');

  // Now for each of these chapters, let's examine the oob chunks in detail
  for (const u of oobUnits) {
    console.log(`\n================================================================`);
    console.log(`Unit: ${u.book_title} -> ${u.chapter_title} (Book: ${u.book_id}, Chapter: ${u.chapter_id})`);
    console.log(`Unit boundary: pages ${u.start_page} to ${u.end_page}`);
    console.log(`OOB chunks count: ${u.oob_chunk_count}`);
    
    const chunks = await conn.execute(`
      SELECT id, page_number, chunk_index, LENGTH(content) as len, SUBSTRING(content, 1, 100) as preview, 
             created_at, (embedding IS NOT NULL) as has_embedding
      FROM book_chunks
      WHERE chapter_id = ? AND (page_number < ? OR page_number > ?)
      ORDER BY page_number ASC
    `, [u.chapter_id, u.start_page, u.end_page]);
    console.table(chunks);

    // Also check total valid chunks in this unit
    const validCount = await conn.execute(`
      SELECT COUNT(*) as valid_chunks, MIN(page_number) as min_p, MAX(page_number) as max_p
      FROM book_chunks
      WHERE chapter_id = ? AND page_number >= ? AND page_number <= ?
    `, [u.chapter_id, u.start_page, u.end_page]);
    console.log('Valid chunks in unit:', validCount[0]);

    // Check if any question_bank_items reference these chunks
    const chunkIds = chunks.map(c => c.id);
    if (chunkIds.length > 0) {
      const q = await conn.execute(`
        SELECT id, bank_id, source_chunk_id, question_text
        FROM question_bank_items
        WHERE source_chunk_id IN (${chunkIds.map(() => '?').join(',')})
      `, chunkIds);
      console.log(`Questions referencing these OOB chunks: ${q.length}`);
      if (q.length > 0) console.table(q);
    }
  }

  // Also check orphan chunks (chapter_id IS NULL)
  console.log('\n================================================================');
  console.log('ORPHAN CHUNKS (chapter_id IS NULL):');
  const orphans = await conn.execute(`
    SELECT bc.id, bc.book_id, b.title_ar as book_title, bc.page_number, LENGTH(bc.content) as len,
           SUBSTRING(bc.content, 1, 80) as preview, bc.created_at, (bc.embedding IS NOT NULL) as has_embedding
    FROM book_chunks bc
    JOIN books b ON b.id = bc.book_id
    WHERE bc.chapter_id IS NULL
    ORDER BY bc.book_id, bc.page_number ASC
  `);
  console.log(`Total orphan chunks: ${orphans.length}`);
  console.table(orphans);
}

run().catch(console.error);
