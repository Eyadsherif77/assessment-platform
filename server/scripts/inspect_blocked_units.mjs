import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connect } from '@tidbcloud/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server/.env
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

console.log('Connecting to TiDB Cloud Serverless at:', process.env.TIDB_HOST);

const conn = connect({
  host: process.env.TIDB_HOST || process.env.MYSQL_HOST,
  username: process.env.TIDB_USER || 'root',
  password: process.env.TIDB_PASSWORD || '',
  database: process.env.TIDB_DATABASE || 'assessment_platform'
});

async function main() {
  const targetBookIds = [
    '19886434-1839-427d-af31-4c64fcf79525',
    '808104ec-b861-434b-80c6-579f715d8bdf',
    '21e1d639-9f59-4a58-a8f8-8373b8e7fc90',
    '97950c44-59be-4ea3-a0e2-63b71946399b'
  ];

  console.log('\n===============================================================');
  console.log('1. INSPECTING 4 TARGET BOOKS & ALL THEIR CHAPTERS');
  console.log('===============================================================');
  for (const bId of targetBookIds) {
    const bookRows = await conn.execute(`SELECT id, title_ar, title_en, processing_status, total_pages FROM books WHERE id = ?`, [bId]);
    console.log(`\nBook ${bId}:`, bookRows[0]);
    
    const chapters = await conn.execute(`
      SELECT id, chapter_number, title_ar, title_en, start_page, end_page 
      FROM book_chapters 
      WHERE book_id = ? 
      ORDER BY chapter_number ASC
    `, [bId]);
    console.table(chapters);
  }

  console.log('\n===============================================================');
  console.log('2. ALL CHUNKS PER CHAPTER AND OOB AUDIT');
  console.log('===============================================================');
  for (const bId of targetBookIds) {
    const dist = await conn.execute(`
      SELECT 
        bc.chapter_id, 
        ch.chapter_number, 
        ch.title_ar as chapter_title, 
        ch.start_page, 
        ch.end_page,
        COUNT(bc.id) as total_chunks,
        MIN(bc.page_number) as min_page,
        MAX(bc.page_number) as max_page,
        SUM(CASE WHEN bc.page_number < ch.start_page OR bc.page_number > ch.end_page THEN 1 ELSE 0 END) as oob_count,
        SUM(CASE WHEN bc.embedding IS NOT NULL THEN 1 ELSE 0 END) as embedded_count
      FROM book_chunks bc
      LEFT JOIN book_chapters ch ON ch.id = bc.chapter_id
      WHERE bc.book_id = ?
      GROUP BY bc.chapter_id, ch.chapter_number, ch.title_ar, ch.start_page, ch.end_page
      ORDER BY ch.chapter_number ASC
    `, [bId]);
    console.log(`\nChunk Breakdown for Book ${bId}:`);
    console.table(dist);
  }

  console.log('\n===============================================================');
  console.log('3. DETAILED LIST OF ALL OUT-OF-BOUNDS CHUNKS ACROSS ALL 4 BOOKS');
  console.log('===============================================================');
  const allOob = await conn.execute(`
    SELECT bc.id as chunk_id, bc.book_id, b.title_ar as book_title, bc.chapter_id, bc.page_number, 
           ch.chapter_number, ch.title_ar as unit_title, ch.start_page, ch.end_page,
           LENGTH(bc.content) as content_len, SUBSTRING(bc.content, 1, 60) as content_preview,
           bc.created_at, (bc.embedding IS NOT NULL) as has_embedding
    FROM book_chunks bc
    JOIN books b ON b.id = bc.book_id
    LEFT JOIN book_chapters ch ON ch.id = bc.chapter_id
    WHERE bc.book_id IN (?, ?, ?, ?)
      AND (bc.page_number < ch.start_page OR bc.page_number > ch.end_page OR bc.chapter_id IS NULL)
    ORDER BY bc.book_id, bc.page_number ASC
  `, targetBookIds);
  console.log(`Total OOB chunks found: ${allOob.length}`);
  console.table(allOob);

  console.log('\n===============================================================');
  console.log('4. CHECKING QUESTIONS / QUESTION_BANK_ITEMS FOR OOB CHUNKS');
  console.log('===============================================================');
  const oobChunkIds = allOob.map(r => r.chunk_id);
  if (oobChunkIds.length > 0) {
    const placeholders = oobChunkIds.map(() => '?').join(',');
    const qMatches = await conn.execute(
      `SELECT id, bank_id, chapter_id, source_chunk_id, page_reference, question_text 
       FROM question_bank_items 
       WHERE source_chunk_id IN (${placeholders})`,
      oobChunkIds
    );
    console.log(`Question bank items referencing OOB chunks: ${qMatches.length}`);
    if (qMatches.length > 0) {
      console.table(qMatches);
    }
  }

  console.log('\n===============================================================');
  console.log('5. CHECKING BOOK_PAGES FOR PAGES 1, 2, 3 OF THE 4 BOOKS');
  console.log('===============================================================');
  for (const bId of targetBookIds) {
    const pages = await conn.execute(`
      SELECT book_id, page_number, char_count, SUBSTRING(raw_text, 1, 80) as raw_preview
      FROM book_pages
      WHERE book_id = ? AND page_number IN (1, 2, 3, 4, 11, 14)
      ORDER BY page_number ASC
    `, [bId]);
    console.log(`\nPages 1-3 etc. for Book ${bId}:`);
    console.table(pages);
  }

  console.log('\n===============================================================');
  console.log('6. CHECKING OTHER BOOKS WITH OUT-OF-BOUNDS CHUNKS');
  console.log('===============================================================');
  const otherOob = await conn.execute(`
    SELECT bc.book_id, b.title_ar as book_title, COUNT(*) as oob_chunk_count
    FROM book_chunks bc
    JOIN books b ON b.id = bc.book_id
    LEFT JOIN book_chapters ch ON ch.id = bc.chapter_id
    WHERE (bc.page_number < ch.start_page OR bc.page_number > ch.end_page OR bc.chapter_id IS NULL)
    GROUP BY bc.book_id, b.title_ar
  `);
  console.log('All books across database with OOB or orphan chunks:');
  console.table(otherOob);
}

main().catch(err => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
