import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { connect } from '@tidbcloud/serverless';

async function cleanup() {
  const conn = connect({
    host: process.env.TIDB_HOST,
    username: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE
  });

  const badItems = await conn.execute(`
    SELECT qi.id, qi.question_text, b.title_ar, s.name_ar as subject_name, s.code 
    FROM question_bank_items qi 
    JOIN book_chapters bc ON qi.chapter_id = bc.id 
    JOIN books b ON bc.book_id = b.id 
    JOIN subjects s ON b.subject_id = s.id 
    WHERE (s.code != 'ENGLISH' AND s.name_ar NOT LIKE '%إنجليز%' AND s.name_ar NOT LIKE '%انجليز%')
      AND (qi.question_text LIKE '%comparative form%' OR qi.question_text LIKE '%Decent Life%' OR qi.question_text LIKE '%kettle is cheaper%' OR qi.question_text LIKE '%If a car travels%')
  `);

  console.log('Bad items found in non-English subjects:', badItems.length);
  for (const item of badItems) {
    console.log(`Deleting [${item.subject_name}] ${item.question_text}`);
    await conn.execute('DELETE FROM question_bank_options WHERE question_item_id = ?', [item.id]);
    await conn.execute('DELETE FROM question_bank_items WHERE id = ?', [item.id]);
  }

  // Also check if any question_bank_items in Arabic have Math or Science questions
  const arabicBad = await conn.execute(`
    SELECT qi.id, qi.question_text, s.name_ar as subject_name
    FROM question_bank_items qi
    JOIN book_chapters bc ON qi.chapter_id = bc.id
    JOIN books b ON bc.book_id = b.id
    JOIN subjects s ON b.subject_id = s.id
    WHERE (s.code = 'ARABIC' OR s.name_ar LIKE '%عرب%')
      AND (qi.question_text LIKE '%المحايد الجمعي%' OR qi.question_text LIKE '%التنمية الاقتصادية%')
  `);
  console.log('Bad items found in Arabic subjects:', arabicBad.length);
  for (const item of arabicBad) {
    console.log(`Deleting [${item.subject_name}] ${item.question_text}`);
    await conn.execute('DELETE FROM question_bank_options WHERE question_item_id = ?', [item.id]);
    await conn.execute('DELETE FROM question_bank_items WHERE id = ?', [item.id]);
  }

  console.log('Done cleaning question bank items.');
}

cleanup().catch(console.error);
