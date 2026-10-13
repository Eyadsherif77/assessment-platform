import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

const targetBookId = '19886434-1839-427d-af31-4c64fcf79525';
const diskPath = path.resolve('uploads', `book_${targetBookId}.pdf`);

async function inspectMathTOC() {
  const fullBytes = fs.readFileSync(diskPath);
  const srcDoc = await PDFDocument.load(fullBytes);

  // Take pages 4, 5, 6 (0-indexed: 3, 4, 5)
  const tocDoc = await PDFDocument.create();
  const pagesToCopy = [3, 4, 5];
  const copied = await tocDoc.copyPages(srcDoc, pagesToCopy);
  copied.forEach(p => tocDoc.addPage(p));
  const tocBytes = await tocDoc.save();
  const b64 = Buffer.from(tocBytes).toString('base64');

  const prompt = `This PDF contains pages 4, 5, 6 of the Egyptian Ministry of Education Prep 2 Mathematics (English edition) textbook.
Please inspect these pages and transcribe the Table of Contents / Contents page.
List all Units, their titles, their lesson titles, and their page numbers.
Also state which printed page number corresponds to which PDF page.

Return JSON:
{
  "units": [
    {
      "unit_number": 1,
      "title": "...",
      "printed_pages": "...",
      "lessons": [
        { "title": "...", "page": "..." }
      ]
    }
  ],
  "page_offset_notes": "..."
}`;

  console.log('Calling Gemini with pages 4, 5, 6...');
  const res = await GeminiClient.generateContent({
    parts: [
      { inline_data: { mime_type: 'application/pdf', data: b64 } },
      { text: prompt }
    ],
    responseMimeType: 'application/json',
    temperature: 0.1,
    timeoutMs: 60000
  });

  console.log('Result:');
  console.log(res);
  fs.writeFileSync(path.resolve('scripts', 'math_prep2_toc.json'), res);
  process.exit(0);
}

inspectMathTOC().catch(err => {
  console.error(err);
  process.exit(1);
});
