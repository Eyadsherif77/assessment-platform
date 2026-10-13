import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

async function extractDetailedToc() {
  const diskPdfPath = path.resolve(process.cwd(), 'uploads/book_d7bbfca2-6d8f-461b-8e39-2015981e86ec.pdf');
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);

  // Pages 5 and 6 are the 2 TOC pages (0-index 4 and 5)
  const tocDoc = await PDFDocument.create();
  const copied = await tocDoc.copyPages(srcDoc, [4, 5]);
  copied.forEach(p => tocDoc.addPage(p));
  const tocBytes = await tocDoc.save();
  const tocB64 = Buffer.from(tocBytes).toString('base64');

  const prompt = `You are an expert curriculum analyst.
Extract the entire Table of Contents from these 2 pages of the Egyptian Ministry of Education Prep 1 Science textbook.
For EVERY Unit and EVERY Lesson, extract:
- Unit number and title (English and Arabic)
- Lesson number and title (English and Arabic)
- The PRINTED page number listed in the table of contents.

Output valid JSON strictly in this structure:
{
  "units": [
    {
      "unit_number": 1,
      "title_en": "...",
      "title_ar": "...",
      "printed_start_page": 2,
      "lessons": [
        {
          "lesson_number": 1,
          "title_en": "...",
          "title_ar": "...",
          "printed_page": 2
        }
      ]
    }
  ]
}`;

  const res = await GeminiClient.generateContent({
    parts: [
      { inline_data: { mime_type: 'application/pdf', data: tocB64 } },
      { text: prompt }
    ],
    responseMimeType: 'application/json',
    temperature: 0.1
  });

  console.log(res);
  fs.writeFileSync('./scripts/science_verified_toc.json', res, 'utf-8');
}

extractDetailedToc().catch(console.error);
