import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';

async function quarantineSyntheticQuestions() {
  console.log('=== PHASE 4: AUDIT & QUARANTINE SYNTHETIC QUESTION BANK ITEMS ===\n');

  // 1. Ensure quarantine columns exist
  try {
    await db.query(`
      ALTER TABLE question_bank_items 
      ADD COLUMN is_quarantined INT DEFAULT 0,
      ADD COLUMN quarantine_reason VARCHAR(255) DEFAULT NULL
    `);
    console.log('✅ Added is_quarantined and quarantine_reason columns to question_bank_items.');
  } catch (colErr) {
    if (colErr.message && colErr.message.includes('Duplicate column')) {
      console.log('ℹ️ Quarantine columns already exist.');
    } else {
      console.log('Note on quarantine columns:', colErr.message);
    }
  }

  // 2. Identify and flag synthetic questions
  const syntheticRes = await db.query(`
    SELECT id, question_text, source_chunk_id, page_reference 
    FROM question_bank_items 
    WHERE source_chunk_id LIKE 'anchor-%' 
       OR page_reference IS NULL 
       OR page_reference = 0
  `);

  console.log(`Found ${syntheticRes.rows.length} synthetic / unverified questions to quarantine.`);

  if (syntheticRes.rows.length > 0) {
    await db.query(`
      UPDATE question_bank_items 
      SET is_quarantined = 1,
          quarantine_reason = 'Generated from synthetic anchor chunk without genuine textbook citation'
      WHERE source_chunk_id LIKE 'anchor-%' 
         OR page_reference IS NULL 
         OR page_reference = 0
    `);
    console.log(`✅ Successfully quarantined ${syntheticRes.rows.length} questions.`);
  }

  // 3. Verify remaining active questions
  const activeRes = await db.query(`
    SELECT COUNT(*) as active_count 
    FROM question_bank_items 
    WHERE is_quarantined = 0 OR is_quarantined IS NULL
  `);
  console.log(`Verified active grounded questions remaining: ${activeRes.rows[0]?.active_count || 0}`);

  process.exit(0);
}

quarantineSyntheticQuestions().catch(err => {
  console.error(err);
  process.exit(1);
});
