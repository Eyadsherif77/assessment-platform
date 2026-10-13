import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

async function checkOffset(bookNum, bookId, label, testPages) {
  console.log(`\n======================================================`);
  console.log(`Checking page offset for Book ${bookNum}: ${label}...`);
  console.log(`======================================================`);
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bookId}.pdf`);
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);

  for (const pNum of testPages) {
    const subDoc = await PDFDocument.create();
    const [p] = await subDoc.copyPages(srcDoc, [pNum - 1]);
    subDoc.addPage(p);
    const bytes = await subDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const res = await GeminiClient.generateContent({
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: b64 } },
        { text: 'Look at this page image carefully. What is the printed page number in the header or footer? What is the main heading, unit title, or lesson title on this page? Return JSON: {"pdf_page": ' + pNum + ', "printed_page": number_or_null, "heading": "..."}' }
      ],
      responseMimeType: 'application/json',
      temperature: 0.1
    });
    console.log(`  PDF Page ${pNum}:`, JSON.parse(res));
  }
}

async function main() {
  await checkOffset(9, '0758fc7a-c9b2-4e25-a32b-6cacb6bb418d', 'Arabic Prep 1', [5, 11, 15, 51, 93, 130]);
  await checkOffset(10, 'fa2a1525-c46f-4b34-9f48-b762be88e5c5', 'Social Studies Prep 1', [6, 7, 8, 30, 52, 80, 96]);
  await checkOffset(11, '808104ec-b861-434b-80c6-579f715d8bdf', 'Math Prep 1', [5, 6, 7, 32, 47, 69, 105]);
}

main().catch(console.error);
