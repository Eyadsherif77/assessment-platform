/**
 * ============================================================================
 * Production-Safe Migration Script: Prep 2 Social Studies General Revision Chapter
 * ============================================================================
 * Book: الدراسات الاجتماعية - الصف الثاني الإعدادي (81b8a308-7fcf-4938-8c45-aa0056624f32)
 * Chapter ID: 7f2409f5-19e4-4d89-9a2c-f684c31be991
 * Chapter Number: 5
 * Target Chunks: 8 chunks (pages 97-104)
 * Idempotent, Non-destructive, Zero mutations outside target scope.
 * ============================================================================
 */
import { connect } from '@tidbcloud/serverless';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'server', '.env') });
if (!process.env.TIDB_HOST) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

export const TARGET_BOOK_ID = '81b8a308-7fcf-4938-8c45-aa0056624f32';
export const REVISION_CHAPTER_ID = '7f2409f5-19e4-4d89-9a2c-f684c31be991';
export const REVISION_CHUNK_IDS = [
  'bddd7ea7-4300-4255-98c5-d0ac4f0af45d', // Page 97
  '2b4402a5-7e0e-4f40-a40d-ba9e7f79f7b6', // Page 98
  'c05f49ac-8b0c-4774-9168-9fde699300de', // Page 99
  '970e5683-e52f-44d6-924c-ef0c8595d086', // Page 100
  'fc7a7c19-11e3-4691-902b-002cdd21d703', // Page 101
  'cd5de032-7026-4cf2-91a7-5a0a0e7965ba', // Page 102
  'bc822680-a0c1-4cac-8f73-2ac40ef46e63', // Page 103
  'b4cfd1d3-6df4-4f37-a2bf-f07f4f19b086'  // Page 104
];

export async function runMigration(conn, options = { dryRun: false }) {
  console.log(`[Migration] Starting Prep 2 Social Revision Migration (dryRun=${options.dryRun})`);

  // 1. Pre-flight verification
  const bookRes = await conn.execute(
    'SELECT id, title_ar, title_en, total_pages FROM books WHERE id = ?',
    [TARGET_BOOK_ID]
  );
  if (bookRes.length === 0) {
    throw new Error(`Target book ${TARGET_BOOK_ID} not found in database!`);
  }
  console.log(`[Migration] Target book verified: ${bookRes[0].title_ar} (${bookRes[0].title_en}), pages: ${bookRes[0].total_pages}`);

  // Check existing chapters
  const existingChapters = await conn.execute(
    'SELECT id, chapter_number, title_ar, start_page, end_page FROM book_chapters WHERE book_id = ? ORDER BY chapter_number',
    [TARGET_BOOK_ID]
  );
  console.log(`[Migration] Existing chapters count: ${existingChapters.length}`);

  const hasChapter5 = existingChapters.some(c => c.id === REVISION_CHAPTER_ID || c.chapter_number === 5);
  console.log(`[Migration] Chapter 5 already exists: ${hasChapter5}`);

  // Verify the 8 chunks
  const placeholders = REVISION_CHUNK_IDS.map(() => '?').join(',');
  const chunkRows = await conn.execute(
    `SELECT id, page_number, chapter_id FROM book_chunks WHERE book_id = ? AND id IN (${placeholders}) ORDER BY page_number`,
    [TARGET_BOOK_ID, ...REVISION_CHUNK_IDS]
  );
  console.log(`[Migration] Found ${chunkRows.length} of ${REVISION_CHUNK_IDS.length} target chunks in book.`);
  if (chunkRows.length !== REVISION_CHUNK_IDS.length) {
    throw new Error(`Expected exactly ${REVISION_CHUNK_IDS.length} chunks, found ${chunkRows.length}`);
  }

  const alreadyMapped = chunkRows.filter(c => c.chapter_id === REVISION_CHAPTER_ID);
  if (hasChapter5 && alreadyMapped.length === REVISION_CHUNK_IDS.length) {
    console.log('[Migration] All 8 chunks and Chapter 5 are already correctly mapped. Idempotent NO-OP.');
    return { status: 'ALREADY_APPLIED', chaptersCreated: 0, chunksUpdated: 0 };
  }

  if (options.dryRun) {
    console.log('[Migration] Dry run completed successfully without writing to database.');
    return { status: 'DRY_RUN_SUCCESS', wouldCreateChapter: !hasChapter5, wouldUpdateChunks: chunkRows.length - alreadyMapped.length };
  }

  // 2. Insert Chapter 5 if not exists
  let chaptersCreated = 0;
  if (!hasChapter5) {
    await conn.execute(`
      INSERT INTO book_chapters (
        id, book_id, chapter_number, title_ar, title_en, start_page, end_page, description, description_en, created_at
      ) VALUES (?, ?, 5, ?, ?, 97, 104, ?, ?, NOW())
    `, [
      REVISION_CHAPTER_ID,
      TARGET_BOOK_ID,
      'المراجعة العامة على الفصل الدراسي الأول',
      'General Semester Revision',
      'المراجعة العامة ونماذج امتحانات الفصل الدراسي الأول لمادة الدراسات الاجتماعية',
      'General semester revision and model exams for Social Studies'
    ]);
    chaptersCreated = 1;
    console.log('[Migration] Created Chapter 5: General Semester Revision (id: ' + REVISION_CHAPTER_ID + ')');
  }

  // 3. Update the 8 chunks to point to REVISION_CHAPTER_ID
  const updateRes = await conn.execute(`
    UPDATE book_chunks
    SET chapter_id = ?
    WHERE book_id = ?
      AND id IN (${placeholders})
  `, [REVISION_CHAPTER_ID, TARGET_BOOK_ID, ...REVISION_CHUNK_IDS]);

  console.log(`[Migration] Updated chunks with chapter_id: ${REVISION_CHAPTER_ID}`);

  // 4. Post-flight verification
  const verifyChunks = await conn.execute(`
    SELECT id, page_number, chapter_id FROM book_chunks WHERE book_id = ? AND id IN (${placeholders})
  `, [TARGET_BOOK_ID, ...REVISION_CHUNK_IDS]);

  const properlyMapped = verifyChunks.filter(c => c.chapter_id === REVISION_CHAPTER_ID);
  if (properlyMapped.length !== REVISION_CHUNK_IDS.length) {
    throw new Error(`Post-flight check failed: expected ${REVISION_CHUNK_IDS.length} mapped chunks, found ${properlyMapped.length}`);
  }

  // Verify Unit 4 has zero chunks with page > 96
  const unit4Chunks = await conn.execute(`
    SELECT COUNT(*) as count FROM book_chunks 
    WHERE book_id = ? AND chapter_id = 'c4000000-7fcf-4938-8c45-aa0056624f34' AND page_number > 96
  `, [TARGET_BOOK_ID]);
  if (Number(unit4Chunks[0]?.count || 0) > 0) {
    throw new Error('Post-flight contamination check failed: Unit 4 has chunks on pages > 96!');
  }

  console.log('[Migration] Migration applied and verified successfully!');
  return { status: 'APPLIED', chaptersCreated, chunksUpdated: verifyChunks.length };
}

// Rollback script
export async function runRollback(conn) {
  console.log('[Rollback] Reverting Prep 2 Social Revision changes...');
  const placeholders = REVISION_CHUNK_IDS.map(() => '?').join(',');
  await conn.execute(`
    UPDATE book_chunks SET chapter_id = NULL
    WHERE book_id = ? AND id IN (${placeholders}) AND chapter_id = ?
  `, [TARGET_BOOK_ID, ...REVISION_CHUNK_IDS, REVISION_CHAPTER_ID]);

  await conn.execute(`
    DELETE FROM book_chapters WHERE id = ? AND book_id = ?
  `, [REVISION_CHAPTER_ID, TARGET_BOOK_ID]);

  console.log('[Rollback] Reverted Chapter 5 and unassigned 8 chunks.');
  return { status: 'ROLLBACK_COMPLETE' };
}

// CLI runner
if (process.argv[1] && process.argv[1].endsWith('apply_prep2_social_revision.mjs')) {
  const isExecute = process.argv.includes('--execute');
  const isRollback = process.argv.includes('--rollback');
  const conn = connect({
    url: `mysql://${process.env.TIDB_USER}:${process.env.TIDB_PASSWORD}@${process.env.TIDB_HOST}/${process.env.TIDB_DATABASE}?ssl={"rejectUnauthorized":true}`
  });

  if (isRollback) {
    runRollback(conn)
      .then(r => { console.log('Rollback result:', r); process.exit(0); })
      .catch(e => { console.error('Rollback error:', e); process.exit(1); });
  } else {
    runMigration(conn, { dryRun: !isExecute })
      .then(r => { console.log('Migration result:', r); process.exit(0); })
      .catch(e => { console.error('Migration error:', e); process.exit(1); });
  }
}
