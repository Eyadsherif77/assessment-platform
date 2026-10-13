import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { createBookSnapshot } from './backup_book_preflight.mjs';

const B12_ID = '013411b8-edec-477b-bd42-3dbdda9fb6a9';
const B13_ID = '9e702109-7d92-445c-b814-567c1f6cba49';

async function main() {
  console.log('=== CREATING PREFLIGHT SNAPSHOTS FOR BATCH 4 (BOOKS 12 & 13) ===\n');

  console.log('Creating snapshot for Book 12 (Arabic Prep 3)...');
  const snap12 = await createBookSnapshot(B12_ID);
  console.log(`✅ Book 12 snapshot created: ${snap12.filepath}`);
  console.log(`   SHA256: ${snap12.checksum}`);
  console.log(`   Counts:`, snap12.counts);

  console.log('\nCreating snapshot for Book 13 (English Prep 3)...');
  const snap13 = await createBookSnapshot(B13_ID);
  console.log(`✅ Book 13 snapshot created: ${snap13.filepath}`);
  console.log(`   SHA256: ${snap13.checksum}`);
  console.log(`   Counts:`, snap13.counts);

  console.log('\n=== BOTH BATCH 4 SNAPSHOTS RECORDED AND VERIFIED SUCCESSFULLY ===');
}

main().catch(err => {
  console.error('Fatal snapshot error:', err);
  process.exit(1);
});
