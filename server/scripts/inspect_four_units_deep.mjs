import { connect } from '@tidbcloud/serverless';
import dotenv from 'dotenv';
dotenv.config();

const conn = connect({
  host: process.env.TIDB_HOST,
  username: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE
});

const units = [
  {
    book_id: '19886434-1839-427d-af31-4c64fcf79525',
    chapter_id: '8ccdd54b-87ed-419f-a737-a35f11620f15',
    name: 'Unit 1: Math Prep 2 (Languages)'
  },
  {
    book_id: 'bc6bb834-7192-474c-8507-c53265028b4e',
    chapter_id: '902f6adf-8043-4247-b80c-42bb48d200b8',
    name: 'Unit 1: Arabic Prep 1'
  },
  {
    book_id: '21e1d639-9f59-4a58-a8f8-8373b8e7fc90',
    chapter_id: '192c06db-b3e1-4717-b6e9-0b06a0364764',
    name: 'Unit 1: English Prep 1'
  },
  {
    book_id: '37bfa0c0-c4ce-419f-930a-000043d8d3f9',
    chapter_id: 'af732e7e-1a38-4b17-b23e-d09ac0ac92f1',
    name: 'Unit 1: English Prep 2'
  }
];

async function inspect() {
  for (const u of units) {
    console.log(`\n================================================================`);
    console.log(`INSPECTING: ${u.name}`);
    console.log(`Book ID: ${u.book_id} | Chapter ID: ${u.chapter_id}`);

    // Book details
    const b = await conn.execute(`
      SELECT b.id, b.title_ar, b.title_en, b.processing_status, b.total_pages, b.term,
             s.name_ar as subject_name, g.name_ar as grade_name, st.name_ar as stage_name
      FROM books b
      LEFT JOIN subjects s ON s.id = b.subject_id
      LEFT JOIN grades g ON g.id = b.grade_id
      LEFT JOIN academic_stages st ON st.id = b.academic_stage_id
      WHERE b.id = ?
    `, [u.book_id]);
    console.log('Book Info:', b[0]);

    // Chapter details
    const ch = await conn.execute(`
      SELECT id, chapter_number, title_ar, title_en, start_page, end_page, description
      FROM book_chapters
      WHERE id = ?
    `, [u.chapter_id]);
    console.log('Chapter Info:', ch[0]);

    // All chunks in this chapter
    const allChunks = await conn.execute(`
      SELECT id, page_number, chunk_index, LENGTH(content) as content_length, 
             SUBSTRING(content, 1, 80) as content_preview, created_at, (embedding IS NOT NULL) as has_embedding
      FROM book_chunks
      WHERE chapter_id = ?
      ORDER BY page_number ASC, chunk_index ASC
    `, [u.chapter_id]);
    console.log(`Total chunks assigned to chapter: ${allChunks.length}`);

    const oob = allChunks.filter(c => c.page_number < ch[0].start_page || c.page_number > ch[0].end_page);
    const inBounds = allChunks.filter(c => c.page_number >= ch[0].start_page && c.page_number <= ch[0].end_page);
    console.log(`- Out of bounds chunks: ${oob.length}`);
    console.table(oob);
    console.log(`- In bounds chunks: ${inBounds.length} (Pages ${inBounds[0]?.page_number} to ${inBounds[inBounds.length - 1]?.page_number})`);

    // Check references to OOB chunks across all tables
    const oobIds = oob.map(c => c.id);
    if (oobIds.length > 0) {
      const qRefs = await conn.execute(`
        SELECT id, bank_id, question_text, source_chunk_id, page_reference 
        FROM question_bank_items 
        WHERE source_chunk_id IN (${oobIds.map(() => '?').join(',')})
      `, oobIds);
      console.log(`References in question_bank_items: ${qRefs.length}`);
      if (qRefs.length > 0) console.table(qRefs);

      // Check exam_questions
      const examRefs = await conn.execute(`
        SELECT eq.id, eq.exam_id, eq.question_text, eq.page_reference
        FROM exam_questions eq
        JOIN question_bank_items qbi ON qbi.id = eq.question_item_id
        WHERE qbi.source_chunk_id IN (${oobIds.map(() => '?').join(',')})
      `, oobIds);
      console.log(`References in exam_questions (via question_item_id): ${examRefs.length}`);
      if (examRefs.length > 0) console.table(examRefs);

      // Check exams directly
      const exams = await conn.execute(`
        SELECT id, title_ar, is_published, created_at
        FROM exams
        WHERE chapter_id = ?
      `, [u.chapter_id]);
      console.log(`Total exams for this chapter: ${exams.length}`);
    }

    // Check book_pages for the start_page to end_page
    const pageStats = await conn.execute(`
      SELECT COUNT(*) as total_pages_extracted, 
             MIN(page_number) as min_p, 
             MAX(page_number) as max_p,
             SUM(char_count) as total_chars
      FROM book_pages
      WHERE book_id = ? AND page_number >= ? AND page_number <= ?
    `, [u.book_id, ch[0].start_page, ch[0].end_page]);
    console.log('Book pages extracted for this unit range:', pageStats[0]);

    // Check book_pages for pages 1, 2, 3
    const p123 = await conn.execute(`
      SELECT page_number, char_count, SUBSTRING(raw_text, 1, 80) as raw_preview
      FROM book_pages
      WHERE book_id = ? AND page_number IN (1, 2, 3)
      ORDER BY page_number ASC
    `, [u.book_id]);
    console.log('Book pages 1, 2, 3 in book_pages:');
    console.table(p123);
  }
}

inspect().catch(console.error);
