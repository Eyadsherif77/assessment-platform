/**
 * ============================================================================
 * Hardened Seed Archive Migration Proposal (READ-ONLY / UNEXECUTED)
 * Target: Archive exactly 15 legacy seed records to book_chunks_seed_archive
 * Engine: TiDB Cloud (Pessimistic Transaction Mode)
 * ============================================================================
 */
import mysql from 'mysql2/promise';

export const TARGET_SEED_IDS = Object.freeze([
  '3424e307-7752-4181-b9a8-7e6c8476d824', '01d46f85-e7f2-4d9d-99bb-ec7f85a631b9', 'ea569bc9-ea0d-42aa-8b4b-b727b930804c',
  '0aec7ec0-6bdc-4709-80c4-bc5234f95b93', '5d882c5c-1b43-4f84-9a22-75d1e0ce1aef', '39eaab2d-f2aa-4765-88fd-1a5b602da4b2',
  'a0987196-f4a6-4cbd-a981-fa0a1cb71656', '6bdbcf8e-d771-471e-b879-558761777248', '74227d01-6d25-47da-9f6e-1641a910b850',
  '53a5ab62-4e00-4180-8ce2-d2ecb9cfd7e3', '4e215896-79b1-4474-95e7-1e499848e082', 'b433fbb8-4b77-4552-97de-2f7b0639910a',
  '12ba13cf-1ffc-48b6-9150-e8814476df82', '096ebc77-f109-4f42-86f6-8f22cc051f75', '7ced38a6-50dc-4f9f-b9f6-0e5618fafd94'
]);

export const CHUNK_COLUMNS = Object.freeze([
  'id', 'book_id', 'chapter_id', 'academic_stage_id', 'grade_id', 'subject_id',
  'page_number', 'chunk_index', 'content', 'metadata', 'embedding', 'created_at'
]);

const COLS_SQL = CHUNK_COLUMNS.join(', ');

export function areChunkValuesEqual(col, valA, valB) {
  if (valA === null && valB === null) return true;
  if (valA === null || valB === null) return false;

  if (col === 'created_at') {
    const tA = valA instanceof Date ? valA.getTime() : new Date(valA).getTime();
    const tB = valB instanceof Date ? valB.getTime() : new Date(valB).getTime();
    return Math.abs(tA - tB) < 1000;
  }

  if (col === 'embedding') {
    if (typeof valA === 'string' && typeof valB === 'string') {
      if (valA === valB) return true;
      try {
        const arrA = JSON.parse(valA);
        const arrB = JSON.parse(valB);
        if (arrA.length !== arrB.length) return false;
        return arrA.every((num, idx) => Math.abs(num - arrB[idx]) < 1e-6);
      } catch {
        return valA.trim() === valB.trim();
      }
    }
  }

  if (col === 'metadata') {
    if (typeof valA === 'string' && typeof valB === 'string') {
      try {
        return JSON.stringify(JSON.parse(valA)) === JSON.stringify(JSON.parse(valB));
      } catch {
        return valA.trim() === valB.trim();
      }
    }
  }

  return String(valA) === String(valB);
}

export async function runHardenedSeedArchive(connection) {
  // Step 1: DDL Pre-flight outside transaction
  await connection.query(`CREATE TABLE IF NOT EXISTS book_chunks_seed_archive LIKE book_chunks;`);

  // Step 2: Begin explicit transaction
  await connection.beginTransaction();
  try {
    const [sourceRows] = await connection.query(
      `SELECT ${COLS_SQL} FROM book_chunks WHERE id IN (?) FOR UPDATE`,
      [TARGET_SEED_IDS]
    );

    const sourceIdSet = new Set(sourceRows.map(r => r.id));

    // Idempotency: verify all 15 already archived
    if (sourceRows.length === 0) {
      const [archivedRows] = await connection.query(
        `SELECT ${COLS_SQL} FROM book_chunks_seed_archive WHERE id IN (?) FOR UPDATE`,
        [TARGET_SEED_IDS]
      );
      const arcIdSet = new Set(archivedRows.map(r => r.id));
      if (archivedRows.length === 15 && TARGET_SEED_IDS.every(id => arcIdSet.has(id))) {
        await connection.commit();
        return { status: 'ALREADY_COMPLETED' };
      }
      throw new Error(`Incomplete State: 0 active records, but archive has ${archivedRows.length}/15 records.`);
    }

    if (sourceRows.length !== 15 || !TARGET_SEED_IDS.every(id => sourceIdSet.has(id))) {
      throw new Error(`ID-Set Mismatch: Expected exact 15 seed IDs in active table.`);
    }

    // Collision check
    const [existingArchive] = await connection.query(
      `SELECT id FROM book_chunks_seed_archive WHERE id IN (?) FOR UPDATE`,
      [TARGET_SEED_IDS]
    );
    if (existingArchive.length > 0) {
      throw new Error(`Archive Collision: ${existingArchive.length} records already present in archive table.`);
    }

    // Insert with explicit column projection
    const [insertResult] = await connection.query(`
      INSERT INTO book_chunks_seed_archive (${COLS_SQL})
      SELECT ${COLS_SQL} FROM book_chunks WHERE id IN (?)
    `, [TARGET_SEED_IDS]);

    if (insertResult.affectedRows !== 15) {
      throw new Error(`INSERT mismatch: affected ${insertResult.affectedRows} rows instead of 15.`);
    }

    // Deep column-by-column comparison
    const [copied] = await connection.query(
      `SELECT ${COLS_SQL} FROM book_chunks_seed_archive WHERE id IN (?)`,
      [TARGET_SEED_IDS]
    );
    const archiveMap = new Map(copied.map(r => [r.id, r]));
    for (const src of sourceRows) {
      const arc = archiveMap.get(src.id);
      if (!arc) throw new Error(`Missing record ${src.id} in archive.`);
      for (const col of CHUNK_COLUMNS) {
        if (!areChunkValuesEqual(col, src[col], arc[col])) {
          throw new Error(`Deep compare mismatch for ${src.id} on column ${col}.`);
        }
      }
    }

    // Delete from active table
    const [deleteResult] = await connection.query(
      `DELETE FROM book_chunks WHERE id IN (?)`,
      [TARGET_SEED_IDS]
    );
    if (deleteResult.affectedRows !== 15) {
      throw new Error(`DELETE mismatch: deleted ${deleteResult.affectedRows} rows instead of 15.`);
    }

    await connection.commit();
    return { status: 'SUCCESS', count: 15 };
  } catch (err) {
    await connection.rollback();
    throw err;
  }
}

export async function rollbackHardenedSeedArchive(connection) {
  await connection.beginTransaction();
  try {
    const [archivedRows] = await connection.query(
      `SELECT ${COLS_SQL} FROM book_chunks_seed_archive WHERE id IN (?) FOR UPDATE`,
      [TARGET_SEED_IDS]
    );
    const arcIdSet = new Set(archivedRows.map(r => r.id));
    if (archivedRows.length !== 15 || !TARGET_SEED_IDS.every(id => arcIdSet.has(id))) {
      throw new Error(`Rollback Abort: Archive has ${archivedRows.length}/15 records.`);
    }

    // Active table must have 0 of these IDs
    const [activeCol] = await connection.query(
      `SELECT id FROM book_chunks WHERE id IN (?) FOR UPDATE`,
      [TARGET_SEED_IDS]
    );
    if (activeCol.length > 0) {
      throw new Error(`Rollback Collision: ${activeCol.length} records already present in active table.`);
    }

    // Restore with explicit columns
    const [restoreResult] = await connection.query(`
      INSERT INTO book_chunks (${COLS_SQL})
      SELECT ${COLS_SQL} FROM book_chunks_seed_archive WHERE id IN (?)
    `, [TARGET_SEED_IDS]);

    if (restoreResult.affectedRows !== 15) {
      throw new Error(`Restore mismatch: restored ${restoreResult.affectedRows} rows instead of 15.`);
    }

    // Compare restored rows with archive before deleting
    const [restored] = await connection.query(
      `SELECT ${COLS_SQL} FROM book_chunks WHERE id IN (?)`,
      [TARGET_SEED_IDS]
    );
    const actMap = new Map(restored.map(r => [r.id, r]));
    for (const arc of archivedRows) {
      const act = actMap.get(arc.id);
      if (!act) throw new Error(`Missing restored record ${arc.id}.`);
      for (const col of CHUNK_COLUMNS) {
        if (!areChunkValuesEqual(col, arc[col], act[col])) {
          throw new Error(`Rollback compare mismatch for ${arc.id} on column ${col}.`);
        }
      }
    }

    // Cleanup archive
    await connection.query(
      `DELETE FROM book_chunks_seed_archive WHERE id IN (?)`,
      [TARGET_SEED_IDS]
    );

    await connection.commit();
    return { status: 'ROLLED_BACK', count: 15 };
  } catch (err) {
    await connection.rollback();
    throw err;
  }
}

/**
 * Validates that archive table schema matches source table required columns
 */
export async function validateArchiveSchema(connection) {
  const [cols] = await connection.query(`
    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'book_chunks_seed_archive' AND TABLE_SCHEMA = DATABASE()
  `);
  const colMap = new Map(cols.map(c => [c.COLUMN_NAME.toLowerCase(), c]));
  const missing = CHUNK_COLUMNS.filter(c => !colMap.has(c.toLowerCase()));
  if (missing.length > 0) {
    throw new Error(`Archive Schema Incomplete: Missing columns [${missing.join(', ')}] in book_chunks_seed_archive.`);
  }

  // Type-aware validation against source table book_chunks
  const [srcCols] = await connection.query(`
    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'book_chunks' AND TABLE_SCHEMA = DATABASE()
  `);
  const srcColMap = new Map(srcCols.map(c => [c.COLUMN_NAME.toLowerCase(), c]));
  for (const reqCol of CHUNK_COLUMNS) {
    const arcCol = colMap.get(reqCol.toLowerCase());
    const srcCol = srcColMap.get(reqCol.toLowerCase());
    if (arcCol && srcCol && arcCol.DATA_TYPE.toLowerCase() !== srcCol.DATA_TYPE.toLowerCase()) {
      throw new Error(`Archive Schema Type Mismatch: Column '${reqCol}' has type '${arcCol.DATA_TYPE}' in archive but '${srcCol.DATA_TYPE}' in source.`);
    }
  }

  return { valid: true, columnCount: cols.length };
}

/**
 * Recovers and diagnoses state when transaction commit fails or connection drops
 */
export async function recoverAmbiguousSeedArchiveCommit(connection) {
  const [active] = await connection.query(`SELECT id FROM book_chunks WHERE id IN (?)`, [TARGET_SEED_IDS]);
  const [archive] = await connection.query(`SELECT id FROM book_chunks_seed_archive WHERE id IN (?)`, [TARGET_SEED_IDS]);

  if (active.length === 0 && archive.length === 15) {
    return {
      status: 'RECONCILED_SUCCESS',
      action: 'NONE_NEEDED',
      detail: 'Ambiguous commit succeeded: all 15 records reside safely in archive, 0 in active table.',
      recoveryProcedure: ['No recovery needed. The transaction committed successfully on the server before client disconnect.']
    };
  }

  if (active.length === 15 && archive.length === 0) {
    return {
      status: 'RECONCILED_ROLLED_BACK',
      action: 'SAFE_TO_RERUN',
      detail: 'Ambiguous commit rolled back cleanly: all 15 records remain in active table, 0 in archive.',
      recoveryProcedure: ['Transaction was rolled back cleanly by the database engine. Safe to re-run runHardenedSeedArchive().']
    };
  }

  if (active.length === 15 && archive.length === 15) {
    return {
      status: 'PARTIAL_INSERT_NO_DELETE',
      action: 'VERIFY_AND_DELETE_ACTIVE',
      detail: 'Records exist in both active and archive. Deep comparison required before deleting active rows.',
      recoveryProcedure: [
        '1. Run deep column-by-column comparison using areChunkValuesEqual() on all 15 records in active vs archive.',
        '2. If all columns match identically, execute atomic DELETE FROM book_chunks WHERE id IN (TARGET_SEED_IDS).',
        '3. If any column fails match, DO NOT DELETE from active table; clear corrupt rows from archive and re-run migration.'
      ]
    };
  }

  return {
    status: 'INCONSISTENT_SPLIT',
    action: 'MANUAL_INTERVENTION_REQUIRED',
    detail: `Found ${active.length} active and ${archive.length} archived records out of 15 expected.`,
    recoveryProcedure: [
      '1. Identify missing IDs from both active and archive sets.',
      '2. Query TiDB transaction logs / binlog to verify if partial commit occurred.',
      '3. Reconstitute missing records from authoritative backup snapshot before any destructive action.'
    ]
  };
}

