import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

function computeChecksum(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

export async function createBookSnapshot(bookId, options = {}) {
  if (!bookId || typeof bookId !== 'string') {
    throw new Error('Valid bookId string is required to create a snapshot.');
  }

  // 1. Verify book exists
  const bookRes = await db.query(
    `SELECT id, title_ar, title_en, academic_stage_id, grade_id, subject_id, 
            teacher_id, file_url, file_size, total_pages, processing_status, 
            processing_error, school_type, created_at, term
     FROM books WHERE id = $1`,
    [bookId]
  );

  if (bookRes.rows.length === 0) {
    throw new Error(`Book ID "${bookId}" was not found in the database.`);
  }
  const bookRecord = bookRes.rows[0];

  // 2. Fetch all dependent curriculum & bank tables
  // book_chapters
  const chaptersRes = await db.query(
    `SELECT id, book_id, chapter_number, title_ar, title_en, description, description_en, 
            start_page, end_page, created_at
     FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC`,
    [bookId]
  );
  const chapterIds = chaptersRes.rows.map(c => c.id);

  // book_pages
  const pagesRes = await db.query(
    `SELECT id, book_id, page_number, raw_text, char_count
     FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC`,
    [bookId]
  );

  // book_chunks
  const chunksRes = await db.query(
    `SELECT id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, 
            page_number, chunk_index, content, metadata, embedding, created_at
     FROM book_chunks WHERE book_id = $1 ORDER BY page_number ASC, chunk_index ASC`,
    [bookId]
  );

  // question_bank_items & options associated with this book's chapters
  let bankItems = [];
  let bankOptions = [];
  if (chapterIds.length > 0) {
    const itemsRes = await db.query(
      `SELECT id, bank_id, chapter_id, question_text, question_type, difficulty, 
              bloom_level, explanation, source_chunk_id, page_reference, created_at, 
              is_quarantined, quarantine_reason
       FROM question_bank_items 
       WHERE chapter_id IN (${chapterIds.map((_, i) => `$${i + 1}`).join(', ')})
       ORDER BY id ASC`,
      chapterIds
    );
    bankItems = itemsRes.rows;

    const itemIds = bankItems.map(item => item.id);
    if (itemIds.length > 0) {
      const optsRes = await db.query(
        `SELECT id, question_item_id, option_text, is_correct
         FROM question_bank_options 
         WHERE question_item_id IN (${itemIds.map((_, i) => `$${i + 1}`).join(', ')})
         ORDER BY id ASC`,
        itemIds
      );
      bankOptions = optsRes.rows;
    }
  }

  // Raw PDF chunk integrity summary (hashes & lengths only, without dumping raw binary blobs into JSON)
  const pdfChunksRes = await db.query(
    `SELECT chunk_index, length(chunk_data) as len, chunk_data 
     FROM book_pdf_chunks WHERE book_id = $1 ORDER BY chunk_index ASC`,
    [bookId]
  );
  const pdfChunksSummary = pdfChunksRes.rows.map(r => ({
    chunk_index: Number(r.chunk_index),
    byte_length: Number(r.len),
    sha256: crypto.createHash('sha256').update(Buffer.from(r.chunk_data)).digest('hex')
  }));

  // 3. Assemble snapshot data structure
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const payloadData = {
    schema_version: '1.0.0',
    snapshot_type: 'book_curriculum_preflight',
    created_at: new Date().toISOString(),
    book_id: bookId,
    book_title: bookRecord.title_ar || bookRecord.title_en || 'Unknown Title',
    counts: {
      books: 1,
      book_chapters: chaptersRes.rows.length,
      book_pages: pagesRes.rows.length,
      book_chunks: chunksRes.rows.length,
      question_bank_items: bankItems.length,
      question_bank_options: bankOptions.length,
      book_pdf_chunks: pdfChunksSummary.length
    },
    tables: {
      books: [bookRecord],
      book_chapters: chaptersRes.rows,
      book_pages: pagesRes.rows,
      book_chunks: chunksRes.rows,
      question_bank_items: bankItems,
      question_bank_options: bankOptions
    },
    pdf_chunks_manifest: pdfChunksSummary
  };

  // Compute checksum over canonical data
  const dataChecksum = computeChecksum(payloadData);

  const fullSnapshot = {
    meta: {
      checksum: dataChecksum,
      checksum_algorithm: 'sha256',
      generator: 'backup_book_preflight.mjs v1.0.0'
    },
    data: payloadData
  };

  // 4. Atomic Write
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  }

  const fileName = `snapshot_${bookId}_${timestamp}.json`;
  const finalPath = path.join(backupDir, fileName);
  const tmpPath = `${finalPath}.tmp_${Date.now()}`;

  const jsonContent = JSON.stringify(fullSnapshot, null, 2);
  fs.writeFileSync(tmpPath, jsonContent, { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmpPath, finalPath);

  // 5. Read back and verify snapshot integrity
  const readBackRaw = fs.readFileSync(finalPath, 'utf-8');
  const readBackJson = JSON.parse(readBackRaw);
  const recalculatedChecksum = computeChecksum(readBackJson.data);

  if (recalculatedChecksum !== readBackJson.meta.checksum) {
    throw new Error(`Snapshot verification failed! Checksum mismatch on read-back: expected ${readBackJson.meta.checksum}, got ${recalculatedChecksum}`);
  }

  return {
    filePath: finalPath,
    fileName,
    checksum: dataChecksum,
    counts: payloadData.counts,
    bookTitle: payloadData.book_title,
    bookId: bookId
  };
}

// CLI Execution
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const targetBookId = process.argv[2] || process.env.TARGET_BOOK_ID;
  if (!targetBookId) {
    console.error('Usage: node scripts/backup_book_preflight.mjs <bookId>');
    process.exit(1);
  }

  console.log(`========================================================================`);
  console.log(`📦 CREATING PREFLIGHT SNAPSHOT FOR BOOK: ${targetBookId}`);
  console.log(`========================================================================\n`);

  createBookSnapshot(targetBookId)
    .then(result => {
      console.log('✅ Snapshot successfully created and verified!');
      console.log(`  File:      ${result.filePath}`);
      console.log(`  Book:      ${result.bookTitle} (${result.bookId})`);
      console.log(`  Checksum:  ${result.checksum} (SHA-256)`);
      console.log(`  Counts:`);
      console.log(`    - book_chapters:          ${result.counts.book_chapters}`);
      console.log(`    - book_pages:             ${result.counts.book_pages}`);
      console.log(`    - book_chunks:            ${result.counts.book_chunks}`);
      console.log(`    - question_bank_items:    ${result.counts.question_bank_items}`);
      console.log(`    - question_bank_options:  ${result.counts.question_bank_options}`);
      console.log(`    - book_pdf_chunks (ref):  ${result.counts.book_pdf_chunks}`);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Failed to create snapshot:', err.message || err);
      process.exit(1);
    });
}
