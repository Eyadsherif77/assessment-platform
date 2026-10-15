import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });

async function inspectDeep() {
  const conn = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT) || 4000,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: { rejectUnauthorized: true }
  });

  try {
    console.log('=== 1. PREP 1 SCIENCE CHAPTERS ===');
    const [p1Sci] = await conn.query(`
      SELECT bc.id, bc.chapter_number, bc.title_ar, bc.title_en, bc.start_page, bc.end_page,
             (SELECT COUNT(*) FROM book_chunks bk WHERE bk.chapter_id = bc.id) as chunk_count
      FROM book_chapters bc
      WHERE bc.book_id = 'd7bbfca2-2f3b-4560-84f9-2c0b628771aa'
      ORDER BY bc.chapter_number ASC
    `);
    console.table(p1Sci);

    console.log('=== 2. PREP 2 SCIENCE CHAPTERS ===');
    const [p2Sci] = await conn.query(`
      SELECT bc.id, bc.chapter_number, bc.title_ar, bc.title_en, bc.start_page, bc.end_page,
             (SELECT COUNT(*) FROM book_chunks bk WHERE bk.chapter_id = bc.id) as chunk_count
      FROM book_chapters bc
      WHERE bc.book_id = '543f2746-5be9-4824-8149-a3ee8f6e80b8'
      ORDER BY bc.chapter_number ASC
    `);
    console.table(p2Sci);

    console.log('=== 3. SEARCH FOR MUHAMMAD ALI / SUDANESE SOLDIERS IN SOCIAL STUDIES ===');
    const [searchAli] = await conn.query(`
      SELECT bp.book_id, b.title_ar, bp.page_number, SUBSTRING(bp.raw_text, 1, 150) as snippet
      FROM book_pages bp
      JOIN books b ON bp.book_id = b.id
      WHERE bp.raw_text LIKE '%السودان%' OR bp.raw_text LIKE '%محمد علي%'
      ORDER BY b.title_ar, bp.page_number
      LIMIT 15
    `);
    console.log('Search matches for Muhammad Ali / Sudan in book_pages:', searchAli.length);
    console.table(searchAli);

    console.log('=== 4. PREP 3 SUBJECTS AND BOOKS ===');
    const [p3Sub] = await conn.query(`
      SELECT s.id as subject_id, s.code, s.name_ar, s.name_en,
             b.id as book_id, b.title_ar as book_title
      FROM subjects s
      JOIN grades g ON s.grade_id = g.id
      LEFT JOIN books b ON b.subject_id = s.id
      WHERE g.code = 'PREP_3' OR g.name_en LIKE '%3%'
      ORDER BY s.sort_order ASC
    `);
    console.table(p3Sub);

  } finally {
    await conn.end();
  }
}

inspectDeep().catch(console.error);
