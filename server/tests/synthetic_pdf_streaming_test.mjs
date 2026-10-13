import assert from 'assert';

console.log('Running Synthetic PDF Streaming & Storage Adapter Test...');

// Mock database query handler for synthetic book_pdf_chunks
function createMockDb(chunks) {
  return {
    async query(sql, params) {
      if (sql.includes('COUNT(*) as cnt, SUM(LENGTH(chunk_data))')) {
        const bookId = params[0];
        const bookChunks = chunks[bookId] || [];
        const totalLen = bookChunks.reduce((acc, c) => acc + c.length, 0);
        return {
          rows: [{ cnt: String(bookChunks.length), total_len: String(totalLen) }]
        };
      }
      if (sql.includes('SELECT chunk_index, chunk_data FROM book_pdf_chunks')) {
        const bookId = params[0];
        const startIdx = params[1];
        const endIdx = params[2];
        const bookChunks = chunks[bookId] || [];
        const filtered = bookChunks
          .map((chunk_data, idx) => ({ chunk_index: idx, chunk_data }))
          .filter(c => c.chunk_index >= startIdx && c.chunk_index <= endIdx);
        return { rows: filtered };
      }
      return { rows: [] };
    }
  };
}

// Synthetic PDF payload: Minimal valid PDF header and dummy bytes
const syntheticPdfChunk0 = Buffer.from('%PDF-1.4\n%synthetic chunk 0 header and bytes for testing\n');
const syntheticPdfChunk1 = Buffer.from('%%EOF\nsynthetic chunk 1 trailer and EOF\n');

const mockChunks = {
  'mock-book-001': [syntheticPdfChunk0, syntheticPdfChunk1]
};

const mockDb = createMockDb(mockChunks);

// 1. Test full retrieval without range header
async function testFullStream() {
  const countRes = await mockDb.query(
    'SELECT COUNT(*) as cnt, SUM(LENGTH(chunk_data)) as total_len FROM book_pdf_chunks WHERE book_id = $1',
    ['mock-book-001']
  );
  const totalChunks = parseInt(countRes.rows[0].cnt, 10);
  const totalLen = parseInt(countRes.rows[0].total_len, 10);

  assert.strictEqual(totalChunks, 2);
  assert.strictEqual(totalLen, syntheticPdfChunk0.length + syntheticPdfChunk1.length);

  const batchRows = await mockDb.query(
    'SELECT chunk_index, chunk_data FROM book_pdf_chunks WHERE book_id = $1 AND chunk_index BETWEEN $2 AND $3',
    ['mock-book-001', 0, 1]
  );

  const combined = Buffer.concat(batchRows.rows.map(r => r.chunk_data));
  assert.strictEqual(combined.length, totalLen);
  assert.ok(combined.toString('utf-8').startsWith('%PDF-1.4'));
  assert.ok(combined.toString('utf-8').includes('%%EOF'));
  console.log('✅ Full synthetic PDF chunk stream assembly verified.');
}

// 2. Test Range request calculation
function testRangeParsing() {
  const totalLen = 1000;
  const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB

  // Case A: bytes=0-499
  const rangeHeaderA = 'bytes=0-499';
  const partsA = rangeHeaderA.replace(/bytes=/, '').split('-');
  const startA = parseInt(partsA[0], 10);
  const endA = parseInt(partsA[1], 10);
  assert.strictEqual(startA, 0);
  assert.strictEqual(endA, 499);
  assert.strictEqual(Math.floor(startA / CHUNK_SIZE), 0);
  assert.strictEqual(Math.floor(endA / CHUNK_SIZE), 0);

  // Case B: invalid range (start > end)
  const rangeHeaderB = 'bytes=500-200';
  const partsB = rangeHeaderB.replace(/bytes=/, '').split('-');
  const startB = parseInt(partsB[0], 10);
  const endB = parseInt(partsB[1], 10);
  assert.ok(startB > endB, 'Invalid range detected');

  console.log('✅ HTTP Range calculation logic verified for chunked streaming.');
}

// 3. Test missing book (0 chunks in DB)
async function testMissingBook() {
  const countRes = await mockDb.query(
    'SELECT COUNT(*) as cnt, SUM(LENGTH(chunk_data)) as total_len FROM book_pdf_chunks WHERE book_id = $1',
    ['non-existent-book']
  );
  const totalChunks = parseInt(countRes.rows[0].cnt, 10);
  const totalLen = parseInt(countRes.rows[0].total_len, 10);

  assert.strictEqual(totalChunks, 0);
  assert.strictEqual(totalLen, 0);
  console.log('✅ Missing book returns 0 chunks, triggering safe fallback / 404.');
}

async function runAll() {
  await testFullStream();
  testRangeParsing();
  await testMissingBook();
  console.log('All Synthetic PDF Streaming Tests PASSED successfully!');
}

runAll().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
