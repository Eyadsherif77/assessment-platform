import { connect } from '@tidbcloud/serverless';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const conn = connect({
  host: process.env.TIDB_HOST,
  username: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE
});

async function runReadOnlyAudit() {
  console.log('================================================================');
  console.log('STRICTLY READ-ONLY VERIFICATION AUDIT — TIDB CLOUD');
  console.log('================================================================\n');

  // 1. Query ALL books in the database to resolve any ID discrepancy authoritatively
  console.log('--- 1. Authoritative Books Table Audit (All Books) ---');
  const allBooks = await conn.execute(`
    SELECT 
      b.id,
      b.title_ar,
      b.title_en,
      b.total_pages,
      b.term,
      b.academic_stage_id,
      st.name_ar as stage_name,
      b.grade_id,
      g.name_ar as grade_name,
      b.subject_id,
      s.name_ar as subject_name
    FROM books b
    LEFT JOIN academic_stages st ON st.id = b.academic_stage_id
    LEFT JOIN grades g ON g.id = b.grade_id
    LEFT JOIN subjects s ON s.id = b.subject_id
    ORDER BY g.name_ar, s.name_ar, b.title_ar
  `);
  console.table(allBooks);

  // 2. Query specific candidate IDs mentioned in prompt
  const candidateIds = [
    '19886434-1839-427d-af31-4c64fcf79525',
    'bc6bb834-7192-474c-8507-c53265028b4e',
    '21e1d639-9f59-4a58-a8f8-8373b8e7fc90',
    '37bfa0c0-c4ce-419f-930a-000043d8d3f9',
    '808104ec-b861-434b-80c6-579f715d8bdf',
    '97950c44-59be-4ea3-a0e2-63b71946399b'
  ];

  console.log('\n--- 2. Candidate IDs Resolution & Chapters Audit ---');
  for (const bId of candidateIds) {
    const bookRow = await conn.execute(`
      SELECT b.id, b.title_ar, b.title_en, g.name_ar as grade_name, s.name_ar as subject_name, b.total_pages
      FROM books b
      LEFT JOIN grades g ON g.id = b.grade_id
      LEFT JOIN subjects s ON s.id = b.subject_id
      WHERE b.id = ?
    `, [bId]);

    if (bookRow.length === 0) {
      console.log(`⚠️ Candidate Book ID NOT FOUND in database: ${bId}`);
      continue;
    }

    console.log(`\nBook: ${bookRow[0].title_ar} (${bookRow[0].grade_name} - ${bookRow[0].subject_name}) [ID: ${bId}]`);
    
    const chapters = await conn.execute(`
      SELECT id as chapter_id, chapter_number, title_ar, start_page, end_page
      FROM book_chapters
      WHERE book_id = ?
      ORDER BY chapter_number ASC
    `, [bId]);
    console.table(chapters);

    // Chunks audit for this book
    const chunkAudit = await conn.execute(`
      SELECT 
        bc.id as chapter_id,
        bc.chapter_number,
        bc.title_ar as chapter_title,
        bc.start_page,
        bc.end_page,
        COUNT(chk.id) as assigned_chunks,
        MIN(chk.page_number) as min_chunk_page,
        MAX(chk.page_number) as max_chunk_page,
        SUM(CASE WHEN chk.page_number < bc.start_page OR chk.page_number > bc.end_page THEN 1 ELSE 0 END) as oob_chunks,
        COALESCE(SUM(LENGTH(chk.content)), 0) as total_chars
      FROM book_chapters bc
      LEFT JOIN book_chunks chk ON chk.chapter_id = bc.id AND chk.book_id = bc.book_id
      WHERE bc.book_id = ?
      GROUP BY bc.id, bc.chapter_number, bc.title_ar, bc.start_page, bc.end_page
      ORDER BY bc.chapter_number ASC
    `, [bId]);
    console.table(chunkAudit);
  }

  // 3. Audit the 12 reported legacy chunk IDs
  console.log('\n--- 3. Audit of the 12 Reported Legacy Chunk IDs ---');
  const legacyChunkIds = [
    '3424e307-7752-4181-b9a8-7e6c8476d824',
    '01d46f85-e7f2-4d9d-99bb-ec7f85a631b9',
    'ea569bc9-ea0d-42aa-8b4b-b727b930804c',
    '53a5ab62-4e00-4180-8ce2-d2ecb9cfd7e3',
    '4e215896-79b1-4474-95e7-1e499848e082',
    'b433fbb8-4b77-4552-97de-2f7b0639910a',
    '0aec7ec0-6bdc-4709-80c4-bc5234f95b93',
    '5d882c5c-1b43-4f84-9a22-75d1e0ce1aef',
    '39eaab2d-f2aa-4765-88fd-1a5b602da4b2',
    'a0987196-f4a6-4cbd-a981-fa0a1cb71656',
    '6bdbcf8e-d771-471e-b879-558761777248',
    '74227d01-6d25-47da-9f6e-1641a910b850'
  ];

  const chunksState = await conn.execute(`
    SELECT 
      chk.id as chunk_id,
      chk.book_id,
      b.title_ar as book_title,
      chk.chapter_id,
      chk.page_number,
      chk.chunk_index,
      LENGTH(chk.content) as content_length,
      SUBSTRING(chk.content, 1, 50) as content_preview,
      chk.created_at
    FROM book_chunks chk
    LEFT JOIN books b ON b.id = chk.book_id
    WHERE chk.id IN (${legacyChunkIds.map(() => '?').join(',')})
    ORDER BY chk.book_id, chk.page_number ASC
  `, legacyChunkIds);

  console.log(`Found ${chunksState.length} of 12 legacy chunks in book_chunks:`);
  console.table(chunksState);

  // 4. Also check if book 808104ec or 97950c44 have ANY chunks or OOB chunks
  console.log('\n--- 4. Direct Chunk Check on 808104ec and 97950c44 ---');
  for (const bId of ['808104ec-b861-434b-80c6-579f715d8bdf', '97950c44-59be-4ea3-a0e2-63b71946399b']) {
    const bookChunks = await conn.execute(`
      SELECT 
        COUNT(*) as total_chunks,
        SUM(CASE WHEN chapter_id IS NULL THEN 1 ELSE 0 END) as orphan_chunks,
        SUM(CASE WHEN chapter_id IS NOT NULL THEN 1 ELSE 0 END) as chapter_assigned_chunks
      FROM book_chunks
      WHERE book_id = ?
    `, [bId]);
    console.log(`Book ${bId} chunk stats:`, bookChunks[0]);
  }
}

runReadOnlyAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
