import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

async function main() {
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_37bfa0c0-c4ce-419f-930a-000043d8d3f9.pdf`);
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);
  console.log(`Book 8 total pages: ${srcDoc.getPageCount()}`);

  // Let's check pages 10, 11, 12, 13, 14
  for (const pNum of [10, 11, 12, 13, 14]) {
    const subDoc = await PDFDocument.create();
    const [p] = await subDoc.copyPages(srcDoc, [pNum - 1]);
    subDoc.addPage(p);
    const bytes = await subDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const res = await GeminiClient.generateContent({
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: b64 } },
        { text: 'Analyze this page. What is the printed page number? What is the title/heading? What units/lessons or contents are listed? Return brief JSON: {"pdf_page": ' + pNum + ', "printed_page": "...", "content_summary": "..."}' }
      ],
      responseMimeType: 'application/json',
      temperature: 0.1
    });
    console.log(`PDF p.${pNum}:`, JSON.parse(res));
  }
}

main().catch(console.error);
