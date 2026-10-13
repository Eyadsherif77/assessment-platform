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
  console.log(`Loaded Book 13 PDF: ${srcDoc.getPageCount()} pages`);

  // Inspect pages 1 to 10
  for (let pNum = 1; pNum <= 10; pNum++) {
    const pageDoc = await PDFDocument.create();
    const [p] = await pageDoc.copyPages(srcDoc, [pNum - 1]);
    pageDoc.addPage(p);
    const bytes = await pageDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const prompt = `You are inspecting a page from a Grade 9 (Prep 3) English textbook (New Hello! Prep 3 - Student's Book - Term 1).
Transcribe all text on this page verbatim, especially Table of Contents (Contents), Unit numbers, Unit titles, review sections, and printed page numbers.
Return JSON: {"pdf_page": ${pNum}, "text": "..."}`;

    try {
      const resStr = await GeminiClient.generateContent({
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: b64 } },
          { text: prompt }
        ],
        responseMimeType: 'application/json',
        temperature: 0.1
      });
      const parsed = JSON.parse(resStr);
      console.log(`\n=== PDF PAGE ${pNum} ===`);
      console.log(parsed.text.substring(0, 400));
    } catch (err) {
      console.error(`Page ${pNum} error:`, err.message);
    }
  }
}

main().catch(console.error);
