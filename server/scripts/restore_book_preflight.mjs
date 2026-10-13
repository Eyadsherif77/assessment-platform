import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

function computeChecksum(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

export function validateSnapshotFile(snapshotPath, targetBookId) {
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Snapshot file not found at path: ${snapshotPath}`);
  }

  const raw = fs.readFileSync(snapshotPath, 'utf-8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Snapshot file is not valid JSON: ${e.message}`);
  }

  if (!parsed.meta || !parsed.meta.checksum || !parsed.data) {
    throw new Error('Snapshot missing required metadata or data envelope.');
  }

  const calculated = computeChecksum(parsed.data);
  if (calculated !== parsed.meta.checksum) {
    throw new Error(`Snapshot integrity failure: checksum mismatch! (Recorded: ${parsed.meta.checksum}, Calculated: ${calculated})`);
  }

  if (targetBookId && parsed.data.book_id !== targetBookId) {
    throw new Error(`Security check failed: Snapshot book ID (${parsed.data.book_id}) does not match target book ID (${targetBookId})!`);
  }

  return parsed;
}

export async function compareStateWithSnapshot(snapshotData) {
  const bookId = snapshotData.book_id;

  // 1. Current books row
  const currentBookRes = await db.query(
    'SELECT id, title_ar, title_en, total_pages, processing_status FROM books WHERE id = $1',
    [bookId]
  );
  const currentBook = currentBookRes.rows[0] || null;

  // 2. Current chapters
  const currentChaptersRes = await db.query(
    'SELECT id, chapter_number, title_ar, title_en, start_page, end_page FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC',
    [bookId]
  );
  const currentChapters = currentChaptersRes.rows;

  // 3. Current pages
  const currentPagesRes = await db.query(
    'SELECT id, page_number, char_count FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC',
    [bookId]
  );
  const currentPages = currentPagesRes.rows;

  // 4. Current chunks
  const currentChunksRes = await db.query(
    'SELECT id, page_number, chunk_index, chapter_id FROM book_chunks WHERE book_id = $1 ORDER BY page_number ASC',
    [bookId]
  );
  const currentChunks = currentChunksRes.rows;

  // 5. Current bank items for these chapters
  const currentChapterIds = currentChapters.map(c => c.id);
  let currentBankItems = [];
  let currentBankOptions = [];
  if (currentChapterIds.length > 0) {
    const itemsRes = await db.query(
      `SELECT id, chapter_id, question_text FROM question_bank_items WHERE chapter_id IN (${currentChapterIds.map((_, i) => `$${i + 1}`).join(', ')})`,
      currentChapterIds
    );
    currentBankItems = itemsRes.rows;

    const itemIds = currentBankItems.map(i => i.id);
    if (itemIds.length > 0) {
      const optsRes = await db.query(
        `SELECT id, question_item_id FROM question_bank_options WHERE question_item_id IN (${itemIds.map((_, i) => `$${i + 1}`).join(', ')})`,
        itemIds
      );
      currentBankOptions = optsRes.rows;
    }
  }

  // Check foreign key dependencies for any current chapters not in snapshot
  const snapshotChapterIds = new Set(snapshotData.tables.book_chapters.map(c => c.id));
  const extraneousChapters = currentChapters.filter(c => !snapshotChapterIds.has(c.id));
  const fkBlocks = [];

  for (const exCh of extraneousChapters) {
    const [exams, evals, mastery, history] = await Promise.all([
      db.query('SELECT count(*) as c FROM exams WHERE chapter_id = $1', [exCh.id]),
      db.query('SELECT count(*) as c FROM ai_evaluations WHERE chapter_id = $1', [exCh.id]),
      db.query('SELECT count(*) as c FROM student_topic_mastery WHERE chapter_id = $1', [exCh.id]),
      db.query('SELECT count(*) as c FROM student_learning_history WHERE chapter_id = $1', [exCh.id])
    ]);

    const totalRefs = Number(exams.rows[0].c) + Number(evals.rows[0].c) + Number(mastery.rows[0].c) + Number(history.rows[0].c);
    if (totalRefs > 0) {
      fkBlocks.push({
        chapterId: exCh.id,
        chapterTitle: exCh.title_ar || exCh.title_en,
        references: {
          exams: exams.rows[0].c,
          evaluations: evals.rows[0].c,
          mastery: mastery.rows[0].c,
          history: history.rows[0].c
        }
      });
    }
  }

  return {
    bookId,
    currentCounts: {
      book_exists: !!currentBook,
      book_chapters: currentChapters.length,
      book_pages: currentPages.length,
      book_chunks: currentChunks.length,
      question_bank_items: currentBankItems.length,
      question_bank_options: currentBankOptions.length
    },
    snapshotCounts: snapshotData.counts,
    diff: {
      chapters_diff: snapshotData.counts.book_chapters - currentChapters.length,
      pages_diff: snapshotData.counts.book_pages - currentPages.length,
      chunks_diff: snapshotData.counts.book_chunks - currentChunks.length,
      extraneous_chapters_count: extraneousChapters.length,
      extraneous_pages_count: currentPages.filter(p => !snapshotData.tables.book_pages.some(sp => sp.page_number === p.page_number)).length,
      extraneous_chunks_count: currentChunks.filter(c => !snapshotData.tables.book_chunks.some(sc => sc.id === c.id)).length,
      fkBlocks
    }
  };
}

export async function executeRestore(snapshotData) {
  const bookId = snapshotData.book_id;
  const startTime = Date.now();

  console.log(`[Restore] Starting guarded restoration for book ${bookId}...`);

  // Verify no FK blocks exist before making changes
  const comparison = await compareStateWithSnapshot(snapshotData);
  if (comparison.diff.fkBlocks.length > 0) {
    throw new Error(`ABORTED: Foreign key conflict! The following chapters are referenced by student records and cannot be safely pruned:\n` +
      JSON.stringify(comparison.diff.fkBlocks, null, 2));
  }

  // Step 1: Restore books table row
  if (snapshotData.tables.books.length > 0) {
    const b = snapshotData.tables.books[0];
    await db.query(
      `INSERT INTO books (
         id, title_ar, title_en, academic_stage_id, grade_id, subject_id,
         teacher_id, file_url, file_size, total_pages, processing_status,
         processing_error, school_type, term
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON DUPLICATE KEY UPDATE
         title_ar = VALUES(title_ar),
         title_en = VALUES(title_en),
         academic_stage_id = VALUES(academic_stage_id),
         grade_id = VALUES(grade_id),
         subject_id = VALUES(subject_id),
         teacher_id = VALUES(teacher_id),
         file_url = VALUES(file_url),
         file_size = VALUES(file_size),
         total_pages = VALUES(total_pages),
         processing_status = VALUES(processing_status),
         processing_error = VALUES(processing_error),
         school_type = VALUES(school_type),
         term = VALUES(term)`,
      [b.id, b.title_ar, b.title_en, b.academic_stage_id, b.grade_id, b.subject_id,
       b.teacher_id, b.file_url, b.file_size, b.total_pages, b.processing_status,
       b.processing_error, b.school_type, b.term]
    );
  }

  // Step 2: Restore book_chapters (upsert snapshot chapters preserving IDs)
  for (const ch of snapshotData.tables.book_chapters) {
    await db.query(
      `INSERT INTO book_chapters (
         id, book_id, chapter_number, title_ar, title_en, description, description_en, start_page, end_page
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON DUPLICATE KEY UPDATE
         chapter_number = VALUES(chapter_number),
         title_ar = VALUES(title_ar),
         title_en = VALUES(title_en),
         description = VALUES(description),
         description_en = VALUES(description_en),
         start_page = VALUES(start_page),
         end_page = VALUES(end_page)`,
      [ch.id, bookId, ch.chapter_number, ch.title_ar, ch.title_en, ch.description, ch.description_en, ch.start_page, ch.end_page]
    );
  }

  // Step 3: Remove extraneous book_chunks not in snapshot
  const snapshotChunkIds = new Set(snapshotData.tables.book_chunks.map(c => c.id));
  const currentChunks = await db.query('SELECT id FROM book_chunks WHERE book_id = $1', [bookId]);
  const chunksToDelete = currentChunks.rows.filter(r => !snapshotChunkIds.has(r.id)).map(r => r.id);
  if (chunksToDelete.length > 0) {
    for (const cid of chunksToDelete) {
      await db.query('DELETE FROM book_chunks WHERE id = $1', [cid]);
    }
  }

  // Step 4: Restore book_chunks from snapshot
  for (const chunk of snapshotData.tables.book_chunks) {
    await db.query(
      `INSERT INTO book_chunks (
         id, book_id, chapter_id, academic_stage_id, grade_id, subject_id,
         page_number, chunk_index, content, metadata, embedding
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON DUPLICATE KEY UPDATE
         chapter_id = VALUES(chapter_id),
         page_number = VALUES(page_number),
         chunk_index = VALUES(chunk_index),
         content = VALUES(content),
         metadata = VALUES(metadata),
         embedding = VALUES(embedding)`,
      [chunk.id, bookId, chunk.chapter_id, chunk.academic_stage_id, chunk.grade_id, chunk.subject_id,
       chunk.page_number, chunk.chunk_index, chunk.content, chunk.metadata, chunk.embedding]
    );
  }

  // Step 5: Remove extraneous book_pages not in snapshot
  const snapshotPageNumbers = new Set(snapshotData.tables.book_pages.map(p => p.page_number));
  const currentPages = await db.query('SELECT page_number FROM book_pages WHERE book_id = $1', [bookId]);
  const pagesToDelete = currentPages.rows.filter(r => !snapshotPageNumbers.has(r.page_number)).map(r => r.page_number);
  if (pagesToDelete.length > 0) {
    for (const pnum of pagesToDelete) {
      await db.query('DELETE FROM book_pages WHERE book_id = $1 AND page_number = $2', [bookId, pnum]);
    }
  }

  // Step 6: Restore book_pages from snapshot
  for (const page of snapshotData.tables.book_pages) {
    await db.query(
      `INSERT INTO book_pages (
         id, book_id, page_number, raw_text, char_count
       ) VALUES ($1, $2, $3, $4, $5)
       ON DUPLICATE KEY UPDATE
         raw_text = VALUES(raw_text),
         char_count = VALUES(char_count)`,
      [page.id, bookId, page.page_number, page.raw_text, page.char_count]
    );
  }

  // Step 7: Restore question_bank_items & options
  const snapshotItemIds = new Set(snapshotData.tables.question_bank_items.map(i => i.id));
  const chapterIds = snapshotData.tables.book_chapters.map(c => c.id);
  if (chapterIds.length > 0) {
    const currentItemsRes = await db.query(
      `SELECT id FROM question_bank_items WHERE chapter_id IN (${chapterIds.map((_, i) => `$${i + 1}`).join(', ')})`,
      chapterIds
    );
    const itemsToDelete = currentItemsRes.rows.filter(r => !snapshotItemIds.has(r.id)).map(r => r.id);
    for (const itemId of itemsToDelete) {
      await db.query('DELETE FROM question_bank_items WHERE id = $1', [itemId]);
    }
  }

  for (const item of snapshotData.tables.question_bank_items) {
    await db.query(
      `INSERT INTO question_bank_items (
         id, bank_id, chapter_id, question_text, question_type, difficulty, bloom_level,
         explanation, source_chunk_id, page_reference, is_quarantined, quarantine_reason
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON DUPLICATE KEY UPDATE
         question_text = VALUES(question_text),
         difficulty = VALUES(difficulty),
         bloom_level = VALUES(bloom_level),
         explanation = VALUES(explanation),
         source_chunk_id = VALUES(source_chunk_id),
         page_reference = VALUES(page_reference),
         is_quarantined = VALUES(is_quarantined)`,
      [item.id, item.bank_id, item.chapter_id, item.question_text, item.question_type, item.difficulty,
       item.bloom_level, item.explanation, item.source_chunk_id, item.page_reference, item.is_quarantined, item.quarantine_reason]
    );
  }

  for (const opt of snapshotData.tables.question_bank_options) {
    await db.query(
      `INSERT INTO question_bank_options (
         id, question_item_id, option_text, is_correct
       ) VALUES ($1, $2, $3, $4)
       ON DUPLICATE KEY UPDATE
         option_text = VALUES(option_text),
         is_correct = VALUES(is_correct)`,
      [opt.id, opt.question_item_id, opt.option_text, opt.is_correct]
    );
  }

  // Step 8: Verify restored state matches snapshot exactly
  const finalState = await compareStateWithSnapshot(snapshotData);
  const elapsedMs = Date.now() - startTime;

  return {
    bookId,
    elapsedMs,
    finalState
  };
}

// CLI Execution
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);
  let targetBookId = null;
  let snapshotPath = null;
  let isConfirm = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--book-id' && args[i + 1]) {
      targetBookId = args[i + 1];
      i++;
    } else if (args[i] === '--snapshot' && args[i + 1]) {
      snapshotPath = args[i + 1];
      i++;
    } else if (args[i] === '--confirm') {
      isConfirm = true;
    } else if (!targetBookId) {
      targetBookId = args[i];
    } else if (!snapshotPath) {
      snapshotPath = args[i];
    }
  }

  if (!targetBookId || !snapshotPath) {
    console.error('Usage: node scripts/restore_book_preflight.mjs --book-id <bookId> --snapshot <snapshotPath> [--confirm]');
    console.error('       By default, runs in safe DRY-RUN mode without modifying the database.');
    process.exit(1);
  }

  console.log(`========================================================================`);
  console.log(`🔄 BOOK PREFLIGHT RESTORE & ROLLBACK VALIDATOR`);
  console.log(`Book ID:  ${targetBookId}`);
  console.log(`Snapshot: ${snapshotPath}`);
  console.log(`Mode:     ${isConfirm ? '⚠️  MUTATION MODE (--confirm)' : '🛡️  SAFE DRY-RUN MODE (Read-Only)'}`);
  console.log(`========================================================================\n`);

  try {
    const snapshot = validateSnapshotFile(snapshotPath, targetBookId);
    console.log('✅ Snapshot integrity verified: Checksum & Book ID match.\n');

    compareStateWithSnapshot(snapshot.data).then(comparison => {
      console.log('--- CURRENT STATE VS SNAPSHOT STATE ---');
      console.log(`  Table: book_chapters`);
      console.log(`    Current:  ${comparison.currentCounts.book_chapters} rows`);
      console.log(`    Snapshot: ${comparison.snapshotCounts.book_chapters} rows`);
      console.log(`    Diff:     ${comparison.diff.chapters_diff}`);

      console.log(`  Table: book_pages`);
      console.log(`    Current:  ${comparison.currentCounts.book_pages} rows`);
      console.log(`    Snapshot: ${comparison.snapshotCounts.book_pages} rows`);
      console.log(`    Diff:     ${comparison.diff.pages_diff}`);

      console.log(`  Table: book_chunks`);
      console.log(`    Current:  ${comparison.currentCounts.book_chunks} rows`);
      console.log(`    Snapshot: ${comparison.snapshotCounts.book_chunks} rows`);
      console.log(`    Diff:     ${comparison.diff.chunks_diff}`);

      console.log(`  Table: question_bank_items`);
      console.log(`    Current:  ${comparison.currentCounts.question_bank_items} rows`);
      console.log(`    Snapshot: ${comparison.snapshotCounts.question_bank_items} rows`);

      console.log(`  Table: question_bank_options`);
      console.log(`    Current:  ${comparison.currentCounts.question_bank_options} rows`);
      console.log(`    Snapshot: ${comparison.snapshotCounts.question_bank_options} rows`);

      if (comparison.diff.fkBlocks.length > 0) {
        console.error('\n❌ SAFETY BLOCK: Foreign key conflicts detected!');
        console.error(JSON.stringify(comparison.diff.fkBlocks, null, 2));
        process.exit(1);
      }

      if (!isConfirm) {
        console.log('\n🛡️  DRY-RUN COMPLETE: No changes were made to the database.');
        console.log('   To execute this restoration, pass the --confirm flag.');
        process.exit(0);
      } else {
        executeRestore(snapshot.data).then(res => {
          console.log(`\n✅ RESTORATION COMPLETED SUCCESSFULLY in ${res.elapsedMs}ms!`);
          console.log(`All counts verified to match snapshot.`);
          process.exit(0);
        }).catch(err => {
          console.error(`\n❌ RESTORATION FAILED:`, err.message || err);
          process.exit(1);
        });
      }
    });
  } catch (err) {
    console.error('❌ Validation error:', err.message || err);
    process.exit(1);
  }
}
