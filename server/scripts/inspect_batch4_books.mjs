import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';

const B12_ID = '013411b8-edec-477b-bd42-3dbdda9fb6a9';
const B13_ID = '9e702109-7d92-445c-b814-567c1f6cba49';

async function main() {
  console.log('=== INSPECTION OF BATCH 4 CANDIDATE BOOKS (BOOKS 12 & 13) ===\n');

  for (const [idx, bId] of [[12, B12_ID], [13, B13_ID]]) {
    console.log(`--- BOOK ${idx} [${bId}] ---`);
    const bRes = await db.query(
      `SELECT b.*, g.name_ar as grade_ar, s.name_ar as subj_ar, st.name_ar as stage_ar
       FROM books b
       LEFT JOIN grades g ON b.grade_id = g.id
       LEFT JOIN subjects s ON b.subject_id = s.id
       LEFT JOIN academic_stages st ON b.academic_stage_id = st.id
       WHERE b.id = $1`,
      [bId]
    );
    const book = bRes.rows[0];
    console.log(`  Title (AR): ${book.title_ar}`);
    console.log(`  Title (EN): ${book.title_en}`);
    console.log(`  Stage: ${book.stage_ar}`);
    console.log(`  Grade: ${book.grade_ar}`);
    console.log(`  Subject: ${book.subj_ar}`);
    console.log(`  Term: ${book.term}`);
    console.log(`  School Type: ${book.school_type}`);
    console.log(`  Declared Pages: ${book.total_pages}`);
    console.log(`  Processing Status: ${book.processing_status}`);

    const pRes = await db.query('SELECT count(*) as cnt FROM book_pages WHERE book_id = $1', [bId]);
    const cRes = await db.query('SELECT count(*) as cnt FROM book_chunks WHERE book_id = $1', [bId]);
    const chapRes = await db.query('SELECT * FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC', [bId]);
    const pdfChunksRes = await db.query('SELECT count(*) as cnt, sum(length(chunk_data)) as total_bytes FROM book_pdf_chunks WHERE book_id = $1', [bId]);

    console.log(`  Existing book_pages count: ${pRes.rows[0].cnt}`);
    console.log(`  Existing book_chunks count: ${cRes.rows[0].cnt}`);
    console.log(`  Existing book_chapters count: ${chapRes.rows.length}`);
    chapRes.rows.forEach(ch => {
      console.log(`    Unit ${ch.chapter_number}: "${ch.title_ar}" / "${ch.title_en}" (ID: ${ch.id})`);
    });
    console.log(`  book_pdf_chunks: ${pdfChunksRes.rows[0].cnt} chunks (Total bytes: ${pdfChunksRes.rows[0].total_bytes})`);

    const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bId}.pdf`);
    const exists = fs.existsSync(diskPdfPath);
    console.log(`  Disk PDF path: ${diskPdfPath} -> ${exists ? 'EXISTS (' + (fs.statSync(diskPdfPath).size / 1024 / 1024).toFixed(2) + ' MB)' : 'NOT ON DISK'}`);
    console.log('');
  }
}

main().catch(console.error);
