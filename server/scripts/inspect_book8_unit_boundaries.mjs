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

  // Let's check pages where units likely start: 14 (Unit 1), ~28 (Unit 2), ~42 (Unit 3), ~56 (Unit 4), ~70 (Unit 5), ~84 (Unit 6)
  const candidatePages = [14, 27, 28, 29, 30, 41, 42, 43, 44, 55, 56, 57, 58, 69, 70, 71, 72, 85, 86, 87, 88, 100, 101, 102];
  
  for (const pNum of candidatePages) {
    const subDoc = await PDFDocument.create();
    const [p] = await subDoc.copyPages(srcDoc, [pNum - 1]);
    subDoc.addPage(p);
    const bytes = await subDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const res = await GeminiClient.generateContent({
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: b64 } },
        { text: 'Look at this page. Return JSON: {"pdf_page": ' + pNum + ', "printed_page": "...", "unit_header": "e.g. Unit 1 / Unit 2 or none", "lesson_title": "..."}' }
      ],
      responseMimeType: 'application/json',
      temperature: 0.1
    });
    console.log(`PDF p.${pNum}:`, JSON.parse(res));
    await new Promise(r => setTimeout(r, 1200));
  }
}

main().catch(console.error);
