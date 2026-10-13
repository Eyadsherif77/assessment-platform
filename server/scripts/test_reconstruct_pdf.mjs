import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

async function testSingleBook() {
  // Let's test on Book #3: Science book Prep 1
  const bookId = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec';
  
  console.log(`Fetching chunks for book: ${bookId}...`);
  const chunksRes = await db.query(
    'SELECT chunk_index, chunk_data FROM book_pdf_chunks WHERE book_id = $1 ORDER BY chunk_index ASC',
    [bookId]
  );
  
  console.log(`Found ${chunksRes.rows.length} chunks.`);
  const buffers = [];
  let totalBytes = 0;
  for (const row of chunksRes.rows) {
    const raw = row.chunk_data;
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    buffers.push(buf);
    totalBytes += buf.length;
  }
  const fullPdfBuffer = Buffer.concat(buffers);
  console.log(`Assembled PDF buffer size: ${fullPdfBuffer.length} bytes (expected ~${totalBytes}).`);

  // Verify PDF header %PDF-
  const header = fullPdfBuffer.subarray(0, 5).toString('ascii');
  console.log(`PDF Header: "${header}" (Valid: ${header.startsWith('%PDF')})`);

  // Extract page by page using pdf-parse with custom pagerender
  const pageTexts = [];
  
  function pagerender(pageData) {
    return pageData.getTextContent().then(textContent => {
      let text = '';
      let lastY;
      for (const item of textContent.items) {
        if (lastY === undefined || Math.abs(lastY - item.transform[5]) > 5) {
          text += '\n';
        } else {
          text += ' ';
        }
        text += item.str;
        lastY = item.transform[5];
      }
      pageTexts.push({
        pageNumber: pageTexts.length + 1,
        text: text.trim()
      });
      return text;
    });
  }

  const result = await pdfParse(fullPdfBuffer, { pagerender });
  console.log(`Parsed PDF info: Total pages = ${result.numpages}`);
  console.log(`Total extracted text length: ${result.text ? result.text.length : 0}`);
  
  const pagesWithText = pageTexts.filter(p => p.text.length > 0);
  console.log(`Pages with text: ${pagesWithText.length} / ${pageTexts.length}`);

  if (pagesWithText.length > 0) {
    for (let i = 0; i < Math.min(5, pagesWithText.length); i++) {
      const p = pagesWithText[i];
      console.log(`\n--- Page ${p.pageNumber} (Chars: ${p.text.length}) ---`);
      console.log(p.text.slice(0, 300) + (p.text.length > 300 ? '...' : ''));
    }
  } else {
    console.log(`No text extracted via default pagerender. Let's inspect result.text:`);
    console.log(result.text.slice(0, 500));
  }

  process.exit(0);
}

testSingleBook().catch(err => {
  console.error('Error testing book:', err);
  process.exit(1);
});
