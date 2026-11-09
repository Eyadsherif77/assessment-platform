import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { db } from './dist/db/db.js';
import { BookIngestionService } from './dist/services/bookIngestionService.js';
import { ReadinessValidator } from './dist/services/readinessValidator.js';

dotenv.config();

async function main() {
  console.log('================================================================');
  console.log('REPROCESSING BOOK #14 VIA CORRECTED PRODUCTION INGESTION PIPELINE');
  console.log('================================================================\n');

  // Initialize production DB connection
  await db.init();

  const bookId = 'ecf50c73-4329-436d-a0a6-520cfa8172f6';
  const pdfPath = path.resolve('uploads', `book_${bookId}.pdf`);

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Authoritative local PDF not found at ${pdfPath}`);
  }

  const pdfBuffer = fs.readFileSync(pdfPath);
  console.log(`Loaded authentic PDF: ${pdfBuffer.length} bytes (~${(pdfBuffer.length / 1024 / 1024).toFixed(1)} MB)`);

  // Query existing metadata from TiDB
  const bookRes = await db.query(
    `SELECT id, title_ar, title_en, academic_stage_id, grade_id, subject_id, school_type, term, processing_status
     FROM books WHERE id = $1`,
    [bookId]
  );

  if (bookRes.rows.length === 0) {
    throw new Error(`Book ${bookId} not found in database`);
  }

  const book = bookRes.rows[0];
  console.log('Current Book status in TiDB:', book.processing_status);
  console.log('Subject ID:', book.subject_id, '| Grade ID:', book.grade_id);

  // Execute the universal ingestion pipeline
  console.log('\n--- LAUNCHING INGESTION PIPELINE (Stages 1 to 10) ---');
  const startTime = Date.now();

  const report = await BookIngestionService.ingestTextbook({
    bookId,
    pdfBuffer,
    titleAr: book.title_ar,
    titleEn: 'Science (Prep 3) - First Term',
    academicStageId: book.academic_stage_id,
    gradeId: book.grade_id,
    subjectId: book.subject_id,
    schoolType: book.school_type || 'كلاهما',
    term: book.term || 1,
    options: {
      forceReingest: true
    }
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n================================================================`);
  console.log(`INGESTION PIPELINE COMPLETED IN ${durationSec}s`);
  console.log(`Final Status: ${report.status}`);
  console.log(`Total Pages: ${report.totalPages}`);
  console.log(`Published: ${report.isPublished}`);
  console.log(`Units Count: ${report.units.length}`);
  console.log(`Diagnostic Issues: ${report.issues.length}`);
  console.log(`================================================================\n`);

  // Detailed Verification from Live Production Database
  console.log('--- PRODUCTION DATABASE EVIDENCE ---');
  const bookCheck = await db.query(
    `SELECT id, processing_status, total_pages, processing_error FROM books WHERE id = $1`,
    [bookId]
  );
  console.log('Books table record:', bookCheck.rows[0]);

  const jobCheck = await db.query(
    `SELECT id, status, current_stage, attempt_count, last_error, updated_at FROM book_ingestion_jobs WHERE book_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [bookId]
  );
  console.log('Latest Ingestion Job:', jobCheck.rows[0]);

  const chapters = await db.query(
    `SELECT c.id, c.chapter_number, c.title_ar, c.title_en, c.start_page, c.end_page,
            (SELECT COUNT(*) FROM book_chunks chk WHERE chk.chapter_id = c.id) as chunk_count,
            (SELECT COALESCE(SUM(LENGTH(chk.content)), 0) FROM book_chunks chk WHERE chk.chapter_id = c.id) as char_count
     FROM book_chapters c
     WHERE c.book_id = $1
     ORDER BY c.chapter_number ASC`,
    [bookId]
  );
  console.log('\nChapters and Chunks Breakdown:');
  console.table(chapters.rows);

  const pagesCountRes = await db.query(
    `SELECT COUNT(*) as total_pages,
            SUM(CASE WHEN char_count >= 100 THEN 1 ELSE 0 END) as normal_pages,
            SUM(CASE WHEN char_count < 100 AND char_count > 0 THEN 1 ELSE 0 END) as low_text_pages,
            SUM(CASE WHEN char_count = 0 THEN 1 ELSE 0 END) as blank_pages
     FROM book_pages WHERE book_id = $1`,
    [bookId]
  );
  console.log('\nPage Processing Summary:');
  console.table(pagesCountRes.rows);

  // Check readiness for each unit
  console.log('\nUnit Readiness Verification:');
  for (const ch of chapters.rows) {
    const readiness = await ReadinessValidator.getUnitReadinessAsync(bookId, ch.id);
    const issuesCount = readiness.issues?.length || 0;
    console.log(`  Unit #${ch.chapter_number} [${ch.title_ar}]: Status = ${readiness.status}, AI Eligible = ${readiness.isEligibleForAI}, Chunks = ${readiness.totalChunks}, Issues = ${issuesCount}`);
  }
}

main().catch(err => {
  console.error('FATAL REPROCESSING ERROR:', err);
  process.exit(1);
});
