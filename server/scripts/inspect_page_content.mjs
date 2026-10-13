import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

async function main() {
  const diskPdfPath = path.resolve(process.cwd(), 'uploads/book_21e1d639-9f59-4a58-a8f8-8373b8e7fc90.pdf');
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);
  
  for (const pNum of [48, 64, 80, 98, 106]) {
    const subDoc = await PDFDocument.create();
    const [p] = await subDoc.copyPages(srcDoc, [pNum - 1]);
    subDoc.addPage(p);
    const bytes = await subDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const res = await GeminiClient.generateContent({
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: b64 } },
        { text: 'Describe what is on this page. If there is text, what is the text? If blank or image-only, describe it. Return plain text.' }
      ],
      temperature: 0.1,
      timeoutMs: 25000
    });
    console.log(`=== Page ${pNum} Description ===\n${res.slice(0, 200)}...\n`);
  }
}

main().catch(console.error);
