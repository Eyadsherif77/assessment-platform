import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

async function checkTocAndPageOffsets() {
  const diskPdfPath = path.resolve(process.cwd(), 'uploads/book_d7bbfca2-6d8f-461b-8e39-2015981e86ec.pdf');
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);
  console.log('Total PDF pages in document:', srcDoc.getPageCount());

  // Extract first 8 pages and run Vision OCR on each individual page to find printed page numbers
  console.log('Inspecting first 8 pages for printed page numbers...');
  
  for (let p = 1; p <= 8; p++) {
    const singleDoc = await PDFDocument.create();
    const copied = await singleDoc.copyPages(srcDoc, [p - 1]);
    singleDoc.addPage(copied[0]);
    const bytes = await singleDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const prompt = `Inspect this single page image from an Egyptian Ministry of Education textbook.
What is the printed page number visible on the bottom or top of this page?
If there is no printed page number, say "NO_PRINTED_PAGE_NUMBER".
Also provide the first 2 lines of text on the page.
Format:
PRINTED_PAGE: <number or NONE>
HEADER/CONTENT: <first 2 lines>`;

    const reply = await GeminiClient.generateContent({
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: b64 } },
        { text: prompt }
      ],
      temperature: 0.1
    });

    console.log(`[PDF Index ${p}]: ${reply.trim().replace(/\n/g, ' | ')}`);
  }
}

checkTocAndPageOffsets().catch(console.error);
