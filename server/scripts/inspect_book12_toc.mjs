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
  console.log(`Loaded Book 12 PDF: ${srcDoc.getPageCount()} pages`);

  // Inspect pages 1 to 10 to find Table of Contents and front matter
  for (let pNum = 1; pNum <= 10; pNum++) {
    const pageDoc = await PDFDocument.create();
    const [p] = await pageDoc.copyPages(srcDoc, [pNum - 1]);
    pageDoc.addPage(p);
    const bytes = await pageDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const prompt = `You are inspecting a page from a Grade 9 (Prep 3) Arabic textbook (اللغة العربية للصف الثالث الإعدادي).
Transcribe all text on this page, especially Table of Contents (فهرس / محتويات), Unit titles, Lesson titles, and printed page numbers.
Return JSON: {"page_number": ${pNum}, "text": "..."}`;

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
      console.log(`\n=== PAGE ${pNum} ===`);
      console.log(parsed.text.substring(0, 400));
    } catch (err) {
      console.error(`Page ${pNum} error:`, err.message);
    }
  }
}

main().catch(console.error);
