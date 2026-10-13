import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';

async function main() {
  console.log('========================================================================');
  console.log('📸 SAVING SCOPED PRE-UPDATE SNAPSHOT OF BOOK METADATA');
  console.log('========================================================================\n');

  const targetIds = [
    'd7bbfca2-6d8f-461b-8e39-2015981e86ec', // Book 3: Science Prep 1
    '19886434-1839-427d-af31-4c64fcf79525', // Book 7: Math Prep 2
    '81b8a308-7fcf-4938-8c45-aa0056624f32', // Book 9: Social Studies Prep 2
    '013411b8-edec-477b-bd42-3dbdda9fb6a9', // Book 11: Arabic Prep 3
    'f19276d3-4adb-4297-bb77-5ed87ba638b9', // Book 12: Social Studies Prep 3
    '9e702109-7d92-445c-b814-567c1f6cba49'  // Book 13: English Prep 3
  ];

  // 1. Fetch exact records targeted for update
  const targetBooksRes = await db.query(
    `SELECT * FROM books WHERE id IN ($1, $2, $3, $4, $5, $6) ORDER BY created_at ASC`,
    targetIds
  );

  // 2. Also fetch all 13 books for total scope snapshot
  const allBooksRes = await db.query(`SELECT * FROM books ORDER BY created_at ASC`);

  const snapshotData = {
    timestamp: new Date().toISOString(),
    purpose: 'Pre-update snapshot for textbook title correction across 13 books',
    target_count: targetBooksRes.rows.length,
    total_books_count: allBooksRes.rows.length,
    target_books: targetBooksRes.rows,
    all_books: allBooksRes.rows
  };

  const isoTime = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `snapshot_textbook_titles_preupdate_${isoTime}.json`;
  const filepath = path.resolve(process.cwd(), 'backups', filename);

  fs.writeFileSync(filepath, JSON.stringify(snapshotData, null, 2), 'utf-8');
  console.log(`✅ Snapshot written to: ${filepath}`);
  console.log(`   File size: ${fs.statSync(filepath).size} bytes`);

  // Verify readability
  const content = fs.readFileSync(filepath, 'utf-8');
  const parsed = JSON.parse(content);
  if (parsed.target_books.length === 6 && parsed.all_books.length === 13) {
    console.log(`✅ Snapshot verification PASSED: 6 target records & 13 total book records verified intact and readable.\n`);
  } else {
    throw new Error('Snapshot verification failed!');
  }

  return filepath;
}

main().catch(err => {
  console.error('Fatal error during snapshot creation:', err);
  process.exit(1);
});
