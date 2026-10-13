import { createBookSnapshot } from './backup_book_preflight.mjs';

const targetBookId = '543f2746-460c-41c1-ba38-0933f479272f';

createBookSnapshot(targetBookId)
  .then(result => {
    console.log('✅ Snapshot successfully created and verified for Book 5:');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Failed:', err);
    process.exit(1);
  });
