import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

const book13Id = '9e702109-7d92-445c-b814-567c1f6cba49';

async function main() {
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${book13Id}.pdf`);
  const fullPdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(fullPdfBuf);

  // Check TOC stated pages: 13, 27, 41, 55, 59, 72, 85, 100
  const testPages = [11, 12, 13, 14, 26, 27, 28, 40, 41, 42, 54, 55, 58, 59, 71, 72, 84, 85, 99, 100, 113, 114];
  for (const pNum of testPages) {
    const pageDoc = await PDFDocument.create();
    const [p] = await pageDoc.copyPages(srcDoc, [pNum - 1]);
    pageDoc.addPage(p);
    const bytes = await pageDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const prompt = `Transcribe the main heading/title on this page and the printed page number if visible. Return JSON: {"pdf_page": ${pNum}, "heading": "...", "printed_page": "..."}`;

    try {
      const resStr = await GeminiClient.generateContent({
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: b64 } },
          { text: prompt }
        ],
        responseMimeType: 'application/json',
        temperature: 0.1
      });
      console.log(`PDF Page ${pNum}:`, JSON.parse(resStr));
    } catch (err) {
      console.error(`Page ${pNum} error:`, err.message);
    }
  }
}

main().catch(console.error);
