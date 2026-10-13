import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

async function checkOffset(bookNum, bookId, label, testPages) {
  console.log(`\nChecking page offset for Book ${bookNum}: ${label}...`);
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
        { text: 'Look at this page image carefully. What is the printed page number in the header/footer? What is the main heading/unit/lesson on this page? Return JSON: {"pdf_page": ' + pNum + ', "printed_page": number_or_null, "heading": "..."}' }
      ],
      responseMimeType: 'application/json',
      temperature: 0.1
    });
    console.log(`  PDF Page ${pNum}:`, JSON.parse(res));
  }
}

async function main() {
  await checkOffset(6, '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', 'English Prep 1', [12, 13, 14, 27, 59]);
  await checkOffset(7, 'bc6bb834-7192-474c-8507-c53265028b4e', 'Arabic Prep 2', [10, 11, 12, 57, 106]);
  await checkOffset(8, '37bfa0c0-c4ce-419f-930a-000043d8d3f9', 'English Prep 2', [12, 13, 14, 27, 58]);
}

main().catch(console.error);
