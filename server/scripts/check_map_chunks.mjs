import dotenv from 'dotenv';
dotenv.config();
import { db } from '../dist/db/db.js';

async function main() {
  await db.init();
  const resU1 = await db.query(
    'SELECT count(*) as total_chunks, min(page_number) as min_p, max(page_number) as max_p FROM book_chunks WHERE chapter_id = $1',
    ['3fa3ec4a-2af8-43e2-980f-dbd70ac62640']
  );
  console.log('Prep 3 Social Unit 1 chunks:', resU1.rows[0]);

  const resU3 = await db.query(
    'SELECT count(*) as total_chunks, min(page_number) as min_p, max(page_number) as max_p FROM book_chunks WHERE chapter_id = $1',
    ['f1aef779-d047-4af8-be1e-b03938944c05']
  );
  console.log('Prep 3 Social Unit 3 chunks:', resU3.rows[0]);

  const p21 = await db.query(
    'SELECT id, page_number, chunk_index, length(content) as len FROM book_chunks WHERE book_id = $1 AND page_number IN (21, 27, 66, 75)',
    ['f19276d3-4adb-4297-bb77-5ed87ba638b9']
  );
  console.log('Chunks for map pages 21, 27, 66, 75:', p21.rows);
  process.exit(0);
}

main().catch(console.error);
