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

  for (const pNum of [6, 7]) {
    const pageDoc = await PDFDocument.create();
    const [p] = await pageDoc.copyPages(srcDoc, [pNum - 1]);
    pageDoc.addPage(p);
    const bytes = await pageDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const prompt = `Transcribe the ENTIRE Table of Contents page exactly as printed, with all Unit names, lesson titles, and page numbers verbatim.`;

    const resStr = await GeminiClient.generateContent({
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: b64 } },
        { text: prompt }
      ],
      temperature: 0.1
    });
    console.log(`\n================ PAGE ${pNum} FULL TOC ================`);
    console.log(resStr);
  }
}

main().catch(console.error);
