import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { createBookSnapshot } from './backup_book_preflight.mjs';

async function main() {
  console.log('======================================================================');
  console.log('📸 CREATING AUTHORITATIVE PREFLIGHT SNAPSHOTS FOR BOOKS 6, 7, AND 8');
  console.log('======================================================================\n');

  const targets = [
    { num: 6, id: '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', title: 'English Prep 1' },
    { num: 7, id: 'bc6bb834-7192-474c-8507-c53265028b4e', title: 'Arabic Prep 2' },
    { num: 8, id: '37bfa0c0-c4ce-419f-930a-000043d8d3f9', title: 'English Prep 2' }
  ];

  const results = [];
  for (const t of targets) {
    console.log(`Creating snapshot for Book ${t.num}: ${t.title} (${t.id})...`);
    const snap = await createBookSnapshot(t.id);
    console.log(`  ✅ Snapshot file: ${snap.filePath}`);
    console.log(`  SHA-256 Checksum: ${snap.checksum}`);
    console.log(`  Row counts:`, snap.counts);
    console.log('----------------------------------------------------------------------\n');
    results.push({
      num: t.num,
      id: t.id,
      title: t.title,
      filePath: snap.filePath,
      checksum: snap.checksum,
      counts: snap.counts
    });
  }

  console.log('ALL BATCH 2 SNAPSHOTS CREATED SUCCESSFULLY.');
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error('Snapshot creation failed:', err);
  process.exit(1);
});
