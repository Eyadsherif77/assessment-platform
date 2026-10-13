import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

const targetBookId = '19886434-1839-427d-af31-4c64fcf79525'; // Math Prep 2

async function reconstructAndInspectMath() {
  console.log(`=== STEP 2: RECONSTRUCTING PDF FOR BOOK ${targetBookId} (Math Prep 2) ===\n`);

  const chunksRes = await db.query(
    'SELECT chunk_index, chunk_data FROM book_pdf_chunks WHERE book_id = $1 ORDER BY chunk_index ASC',
    [targetBookId]
  );

  console.log(`Retrieved ${chunksRes.rows.length} chunks from TiDB.`);
  const buffers = chunksRes.rows.map(row => Buffer.from(row.chunk_data));
  const fullPdfBuffer = Buffer.concat(buffers);

  console.log(`Concatenated PDF buffer size: ${(fullPdfBuffer.length / (1024 * 1024)).toFixed(2)} MB`);

  const outPath = path.resolve('uploads', `book_${targetBookId}.pdf`);
  fs.writeFileSync(outPath, fullPdfBuffer);
  console.log(`Saved reconstructed PDF to: ${outPath}`);

  // Load in pdf-lib to verify integrity and total page count
  const pdfDoc = await PDFDocument.load(fullPdfBuffer);
  const totalPages = pdfDoc.getPageCount();
  console.log(`Verified Reconstructed PDF Page Count: ${totalPages} pages.`);

  process.exit(0);
}

reconstructAndInspectMath().catch(err => {
  console.error(err);
  process.exit(1);
});
