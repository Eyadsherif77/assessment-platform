import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function inspectBooks() {
  const conn = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT) || 4000,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: { rejectUnauthorized: true }
  });

  try {
    const [books] = await conn.query(`
      SELECT b.id, b.title_ar, b.grade_id, g.code as grade_code, b.total_pages, b.processing_status,
             (SELECT COUNT(*) FROM book_chapters WHERE book_id = b.id) as chapters,
             (SELECT COUNT(*) FROM book_pages WHERE book_id = b.id) as pages,
             (SELECT COUNT(*) FROM book_chunks WHERE book_id = b.id) as chunks,
             (SELECT COUNT(*) FROM book_pdf_chunks WHERE book_id = b.id) as pdf_chunks
      FROM books b
      LEFT JOIN grades g ON b.grade_id = g.id
      ORDER BY b.created_at ASC
    `);

    console.log('Total books in DB:', books.length);
    console.table(books);
  } finally {
    await conn.end();
  }
}

inspectBooks().catch(err => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
