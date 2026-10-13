import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

const targetBookId = '543f2746-460c-41c1-ba38-0933f479272f';

async function checkKeyPages() {
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${targetBookId}.pdf`);
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);
  console.log(`Total PDF Pages: ${srcDoc.getPageCount()}`);

  const testPages = [6, 7, 8, 35, 36, 43, 44, 45, 68, 69, 70, 86, 87, 88, 102, 103, 104];
  
  for (const pNum of testPages) {
    const singleDoc = await PDFDocument.create();
    const copied = await singleDoc.copyPages(srcDoc, [pNum - 1]);
    singleDoc.addPage(copied[0]);
    const b64 = Buffer.from(await singleDoc.save()).toString('base64');
    
    const res = await GeminiClient.generateContent({
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: b64 } },
        { text: `Identify the page title, printed page number, unit name, lesson name, or section type (e.g. Unit assessment, revision) for this PDF Page ${pNum}. Keep response to 2-3 lines.` }
      ],
      temperature: 0.1
    });
    console.log(`=== PDF Page ${pNum} ===\n${res.trim()}\n`);
  }
}

checkKeyPages().catch(console.error);
