import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  const bookId = '21e1d639-9f59-4a58-a8f8-8373b8e7fc90';
  const bRes = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
  const book = bRes.rows[0];

  // Page 80 (Unit 5)
  const p80 = await db.query('SELECT raw_text FROM book_pages WHERE book_id = $1 AND page_number = 80', [bookId]);
  if (p80.rows.length > 0 && p80.rows[0].raw_text.length >= 50) {
    await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND page_number = 80', [bookId]);
    await db.query(
      `INSERT INTO book_chunks (
        id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        uuidv4(), bookId, 'e6000000-9f59-4a58-a8f8-8373b8e7fc95',
        book.academic_stage_id, book.grade_id, book.subject_id, 80, 0,
        p80.rows[0].raw_text, JSON.stringify({ unit_number: 5, section_type: 'curriculum_unit', pdf_page: 80, subject: 'English', grade: 'Prep 1', language: 'en' })
      ]
    );
    console.log('Inserted chunk for page 80 (Unit 5)');
  }

  // Page 98 (Unit 6)
  const p98 = await db.query('SELECT raw_text FROM book_pages WHERE book_id = $1 AND page_number = 98', [bookId]);
  if (p98.rows.length > 0 && p98.rows[0].raw_text.length >= 50) {
    await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND page_number = 98', [bookId]);
    await db.query(
      `INSERT INTO book_chunks (
        id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        uuidv4(), bookId, 'e6000000-9f59-4a58-a8f8-8373b8e7fc96',
        book.academic_stage_id, book.grade_id, book.subject_id, 98, 0,
        p98.rows[0].raw_text, JSON.stringify({ unit_number: 6, section_type: 'curriculum_unit', pdf_page: 98, subject: 'English', grade: 'Prep 1', language: 'en' })
      ]
    );
    console.log('Inserted chunk for page 98 (Unit 6)');
  }

  const countRes = await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [bookId]);
  console.log(`Total Book 6 Chunks now: ${countRes.rows[0].cnt}`);
}

main().catch(console.error);
