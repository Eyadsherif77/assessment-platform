import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function main() {
  console.log('--- 1. ORDER BY CREATED_AT ASC ---');
  const r1 = await db.query(`
    SELECT 
      b.id, b.title_ar, b.title_en, b.term, b.school_type, b.total_pages, b.created_at,
      g.name_ar as grade, g.sort_order as grade_order,
      s.name_ar as subject, s.sort_order as subj_order
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
    ORDER BY b.created_at ASC, b.id ASC
  `);
  r1.rows.forEach((b, i) => {
    console.log(`${i+1}. [${b.id}] ${b.title_ar} (${b.grade} - ${b.subject}) created: ${b.created_at}`);
  });

  console.log('\n--- 2. ORDER BY GRADE, SUBJECT, TITLE ---');
  const r2 = await db.query(`
    SELECT 
      b.id, b.title_ar, b.title_en, b.term, b.school_type, b.total_pages, b.created_at,
      g.name_ar as grade, g.sort_order as grade_order,
      s.name_ar as subject, s.sort_order as subj_order
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
    ORDER BY g.sort_order ASC, s.sort_order ASC, b.title_ar ASC
  `);
  r2.rows.forEach((b, i) => {
    console.log(`${i+1}. [${b.id}] ${b.title_ar} (${b.grade} - ${b.subject})`);
  });

  console.log('\n--- 3. UNPROCESSED / CANDIDATE BOOKS ONLY ---');
  const approvedIds = [
    'd7bbfca2-6d8f-461b-8e39-2015981e86ec', // Book 1 (Science Prep 1)
    'f19276d3-4adb-4297-bb77-5ed87ba638b9', // Book 2 (Social Prep 3)
    '19886434-1839-427d-af31-4c64fcf79525', // Book 3 (Math Prep 2)
    '81b8a308-7fcf-4938-8c45-aa0056624f32', // Book 4 (Social Prep 2)
    '543f2746-460c-41c1-ba38-0933f479272f'  // Book 5 (Science Prep 2)
  ];

  const unproc1 = r1.rows.filter(b => !approvedIds.includes(b.id));
  console.log('By created_at remaining:');
  unproc1.forEach((b, i) => {
    console.log(`  ${i+1}. [${b.id}] ${b.title_ar} (${b.grade} - ${b.subject})`);
  });

  const unproc2 = r2.rows.filter(b => !approvedIds.includes(b.id));
  console.log('\nBy curriculum order (grade, subject) remaining:');
  unproc2.forEach((b, i) => {
    console.log(`  ${i+1}. [${b.id}] ${b.title_ar} (${b.grade} - ${b.subject})`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
