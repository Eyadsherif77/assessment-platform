/**
 * ============================================================================
 * Hardened Embedding Population Migration Proposal (READ-ONLY / UNEXECUTED)
 * Target: Populate verified semantic embeddings while preserving original values
 * Engine: TiDB Cloud (Pessimistic Transaction Mode)
 * ============================================================================
 */
import mysql from 'mysql2/promise';

export async function runHardenedUnitEmbeddingPopulation(connection, targetChunkEmbeddings) {
  // targetChunkEmbeddings: Array<{ id: string, embedding: string }>

  // Step 1: Pre-flight backup table outside transaction
  await connection.query(`
    CREATE TABLE IF NOT EXISTS book_chunks_embedding_backup (
      chunk_id VARCHAR(64) PRIMARY KEY,
      original_embedding LONGTEXT,
      backed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const chunkIds = targetChunkEmbeddings.map(c => c.id);

  await connection.beginTransaction();
  try {
    // 2. Query current values and preserve in backup table
    const [currentRows] = await connection.query(
      `SELECT id, embedding FROM book_chunks WHERE id IN (?) FOR UPDATE`,
      [chunkIds]
    );

    // Save originals in backup table (REPLACE INTO ensures idempotency)
    for (const row of currentRows) {
      await connection.query(
        `REPLACE INTO book_chunks_embedding_backup (chunk_id, original_embedding, backed_up_at) VALUES (?, ?, NOW())`,
        [row.id, row.embedding]
      );
    }

    // 3. Update chunk embeddings
    for (const target of targetChunkEmbeddings) {
      await connection.query(
        `UPDATE book_chunks SET embedding = ? WHERE id = ?`,
        [target.embedding, target.id]
      );
    }

    await connection.commit();
    return { status: 'SUCCESS', updatedCount: targetChunkEmbeddings.length };
  } catch (err) {
    await connection.rollback();
    throw err;
  }
}

export async function rollbackHardenedUnitEmbeddingPopulation(connection, chunkIds) {
  await connection.beginTransaction();
  try {
    // Retrieve preserved original values from backup table
    const [backups] = await connection.query(
      `SELECT chunk_id, original_embedding FROM book_chunks_embedding_backup WHERE chunk_id IN (?) FOR UPDATE`,
      [chunkIds]
    );

    if (backups.length !== chunkIds.length) {
      throw new Error(`Rollback Abort: Expected ${chunkIds.length} backup records, found ${backups.length}. Cannot safely restore without full backup.`);
    }

    // Restore exact original values (preserves previous non-null values, does NOT blindly NULL)
    for (const b of backups) {
      await connection.query(
        `UPDATE book_chunks SET embedding = ? WHERE id = ?`,
        [b.original_embedding, b.chunk_id]
      );
    }

    // Cleanup backup records for these IDs
    await connection.query(
      `DELETE FROM book_chunks_embedding_backup WHERE chunk_id IN (?)`,
      [chunkIds]
    );

    await connection.commit();
    return { status: 'ROLLED_BACK', restoredCount: backups.length };
  } catch (err) {
    await connection.rollback();
    throw err;
  }
}
