/**
 * ============================================================================
 * Hardened Curriculum Mapping Migration Proposal (READ-ONLY / UNEXECUTED)
 * Target: Map 8 Social Studies review chunks to Chapter 5 (General Review)
 * Engine: TiDB Cloud (Pessimistic Transaction Mode)
 * ============================================================================
 */
import mysql from 'mysql2/promise';

export const REVIEW_CHUNK_IDS = Object.freeze([
  'bddd7ea7-4300-4255-98c5-d0ac4f0af45d', '2b4402a5-7e0e-4f40-a40d-ba9e7f79f7b6',
  'c05f49ac-8b0c-4774-9168-9fde699300de', '970e5683-e52f-44d6-924c-ef0c8595d086',
  'fc7a7c19-11e3-4691-902b-002cdd21d703', 'cd5de032-7026-4cf2-91a7-5a0a0e7965ba',
  'bc822680-a0c1-4cac-8f73-2ac40ef46e63', 'b4cfd1d3-6df4-4f37-a2bf-f07f4f19b086'
]);
export const SOCIAL_STUDIES_BOOK_ID = '81b8a308-7fcf-4938-8c45-aa0056624f32';
export const GENERAL_REVIEW_CHAPTER_ID = 'c5000000-7fcf-4938-8c45-aa0056624f35';
export const EXPECTED_TITLE_AR = 'المراجعة العامة على الفصل الدراسي الأول';
export const EXPECTED_TITLE_EN = 'Term 1 General Review and Practice Exams';

export async function runHardenedCurriculumMapping(connection) {
  await connection.beginTransaction();
  try {
    // 1. Conflict detection on chapter_number 5
    const [numConflict] = await connection.query(
      `SELECT id, title_ar FROM book_chapters WHERE book_id = ? AND chapter_number = 5 FOR UPDATE`,
      [SOCIAL_STUDIES_BOOK_ID]
    );

    let chapterCreatedByUs = false;

    if (numConflict.length > 0) {
      const existing = numConflict[0];
      if (existing.id !== GENERAL_REVIEW_CHAPTER_ID) {
        throw new Error(`Conflict: Chapter number 5 is already taken by unexpected ID ${existing.id}.`);
      }
      // Chapter exists with our expected ID; verify parameters
      const [chDetails] = await connection.query(
        `SELECT title_ar, title_en, start_page, end_page FROM book_chapters WHERE id = ? FOR UPDATE`,
        [GENERAL_REVIEW_CHAPTER_ID]
      );
      const ch = chDetails[0];
      if (ch.title_ar !== EXPECTED_TITLE_AR || ch.start_page !== 97 || ch.end_page !== 104) {
        throw new Error(`Metadata Conflict: Existing chapter parameters differ from expected.`);
      }
    } else {
      // Strict INSERT
      await connection.query(`
        INSERT INTO book_chapters (id, book_id, chapter_number, title_ar, title_en, start_page, end_page, created_at)
        VALUES (?, ?, 5, ?, ?, 97, 104, NOW())
      `, [GENERAL_REVIEW_CHAPTER_ID, SOCIAL_STUDIES_BOOK_ID, EXPECTED_TITLE_AR, EXPECTED_TITLE_EN]);
      chapterCreatedByUs = true;
    }

    // 2. Verify target 8 chunks
    const [chunks] = await connection.query(
      `SELECT id, chapter_id, page_number FROM book_chunks WHERE id IN (?) AND book_id = ? FOR UPDATE`,
      [REVIEW_CHUNK_IDS, SOCIAL_STUDIES_BOOK_ID]
    );
    if (chunks.length !== 8) {
      throw new Error(`Expected 8 chunks in target set, found ${chunks.length}.`);
    }

    // Idempotency check
    const alreadyMapped = chunks.filter(c => c.chapter_id === GENERAL_REVIEW_CHAPTER_ID);
    if (alreadyMapped.length === 8) {
      await connection.commit();
      return { status: 'ALREADY_MAPPED', chapterCreated: false };
    }

    // 3. Map chunks
    const [updateResult] = await connection.query(
      `UPDATE book_chunks SET chapter_id = ? WHERE id IN (?) AND book_id = ? AND chapter_id IS NULL`,
      [GENERAL_REVIEW_CHAPTER_ID, REVIEW_CHUNK_IDS, SOCIAL_STUDIES_BOOK_ID]
    );

    // 4. Scoped Postcondition: Verify all 8 chunks now map to GENERAL_REVIEW_CHAPTER_ID
    const [verifyResult] = await connection.query(
      `SELECT COUNT(*) as cnt FROM book_chunks WHERE id IN (?) AND chapter_id = ?`,
      [REVIEW_CHUNK_IDS, GENERAL_REVIEW_CHAPTER_ID]
    );
    if (verifyResult[0].cnt !== 8) {
      throw new Error(`Postcondition failed: expected 8 mapped chunks, found ${verifyResult[0].cnt}.`);
    }

    await connection.commit();
    return { status: 'SUCCESS', mappedCount: updateResult.affectedRows, chapterCreated: chapterCreatedByUs };
  } catch (err) {
    await connection.rollback();
    throw err;
  }
}

export async function rollbackHardenedCurriculumMapping(connection, options = { createdByMigration: false }) {
  await connection.beginTransaction();
  try {
    // 1. Verify target chunks point to GENERAL_REVIEW_CHAPTER_ID
    const [chunks] = await connection.query(
      `SELECT id, chapter_id FROM book_chunks WHERE id IN (?) FOR UPDATE`,
      [REVIEW_CHUNK_IDS]
    );
    const unexpected = chunks.filter(c => c.chapter_id !== GENERAL_REVIEW_CHAPTER_ID);
    if (unexpected.length > 0) {
      throw new Error(`Rollback Conflict: ${unexpected.length} target chunks do not point to chapter ${GENERAL_REVIEW_CHAPTER_ID}.`);
    }

    // 2. Scoped unmap: Re-null ONLY the 8 explicit chunks
    const [unmapResult] = await connection.query(
      `UPDATE book_chunks SET chapter_id = NULL WHERE id IN (?) AND chapter_id = ?`,
      [REVIEW_CHUNK_IDS, GENERAL_REVIEW_CHAPTER_ID]
    );

    // 3. Ownership-safe chapter cleanup:
    // NEVER delete pre-existing chapters! Delete chapter ONLY IF options.createdByMigration is explicitly true AND no other chunks reference it.
    let chapterDeleted = false;
    const [externalRefs] = await connection.query(
      `SELECT COUNT(*) as cnt FROM book_chunks WHERE chapter_id = ? AND id NOT IN (?)`,
      [GENERAL_REVIEW_CHAPTER_ID, REVIEW_CHUNK_IDS]
    );

    if (externalRefs[0].cnt > 0) {
      console.warn(`[Rollback] Chapter retained: ${externalRefs[0].cnt} other chunks reference it.`);
    } else if (options && options.createdByMigration === true) {
      await connection.query(
        `DELETE FROM book_chapters WHERE id = ? AND book_id = ?`,
        [GENERAL_REVIEW_CHAPTER_ID, SOCIAL_STUDIES_BOOK_ID]
      );
      chapterDeleted = true;
      console.log('[Rollback] Chapter deleted cleanly because it was created exclusively by this migration.');
    } else {
      console.log('[Rollback] Chapter retained: options.createdByMigration is false (pre-existing chapter preserved).');
    }

    await connection.commit();
    return { status: 'ROLLED_BACK', unmappedChunks: unmapResult.affectedRows, chapterDeleted };
  } catch (err) {
    await connection.rollback();
    throw err;
  }
}
