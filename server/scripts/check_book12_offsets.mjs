import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

const book12Id = '013411b8-edec-477b-bd42-3dbdda9fb6a9';

async function main() {
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${book12Id}.pdf`);
  const fullPdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(fullPdfBuf);

  const testPages = [14, 15, 16, 59, 60, 61, 105, 106, 107, 147, 148, 149];
  for (const pNum of testPages) {
    const pageDoc = await PDFDocument.create();
    const [p] = await pageDoc.copyPages(srcDoc, [pNum - 1]);
    pageDoc.addPage(p);
    const bytes = await pageDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const prompt = `Transcribe the main heading/title on this page and the printed page number if visible. Return JSON: {"pdf_page": ${pNum}, "heading": "..."}`;

    const resStr = await GeminiClient.generateContent({
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: b64 } },
        { text: prompt }
      ],
      responseMimeType: 'application/json',
      temperature: 0.1
    });
    console.log(`PDF Page ${pNum}:`, JSON.parse(resStr));
  }
}

main().catch(console.error);
