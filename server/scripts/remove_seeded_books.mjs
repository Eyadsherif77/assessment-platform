import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';

async function main() {
  const seeded = await db.query('SELECT id, title_ar, title_en, school_type FROM books WHERE file_size = 2500000');
  console.log(`Found ${seeded.rows.length} seeded books to remove.`);
  
  for (const b of seeded.rows) {
    console.log(`Deleting book: ${b.title_ar} (${b.id})`);
    await db.query(`DELETE FROM book_chapters WHERE book_id = '${b.id}'`);
    await db.query(`DELETE FROM books WHERE id = '${b.id}'`);
  }

  const remaining = await db.query(`
    SELECT b.id, b.title_ar, b.title_en, b.school_type, g.code as grade_code, b.file_size
    FROM books b
    JOIN grades g ON b.grade_id = g.id
    ORDER BY g.sort_order, b.title_ar
  `);
  console.log(`Remaining books count: ${remaining.rows.length}`);
  console.table(remaining.rows);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
