import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import { PDFDocument } from 'pdf-lib';

async function testPdf(num, bookId, label) {
  const filePath = path.resolve(process.cwd(), 'uploads', `book_${bookId}.pdf`);
  console.log(`\n======================================================================`);
  console.log(`📖 BOOK ${num}: ${label} (${bookId})`);
  console.log(`File: ${filePath}`);
  console.log(`======================================================================`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ PDF file not found at: ${filePath}`);
    return;
  }

  const buf = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();
  console.log(`Total PDF Pages: ${totalPages}`);

  const parsed = await pdfParse(buf);
  console.log(`pdf-parse extracted total characters: ${parsed.text.length}`);
  console.log(`Sample first 500 characters:`);
  console.log(parsed.text.slice(0, 500).replace(/\n\s*\n/g, '\n').trim());

  // Check per-page digital text for first 10 pages
  let hasDigitalText = parsed.text.length > 5000;
  console.log(`Has extensive digital text: ${hasDigitalText}`);
}

async function main() {
  await testPdf(6, '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', 'English Prep 1');
  await testPdf(7, 'bc6bb834-7192-474c-8507-c53265028b4e', 'Arabic Prep 2');
  await testPdf(8, '37bfa0c0-c4ce-419f-930a-000043d8d3f9', 'English Prep 2');
}

main().catch(console.error);
