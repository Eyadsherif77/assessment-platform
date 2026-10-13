import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

const targetBookId = '543f2746-460c-41c1-ba38-0933f479272f';

async function extractPrep2ScienceToc() {
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${targetBookId}.pdf`);
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);
  const totalPages = srcDoc.getPageCount();
  console.log(`Total PDF Pages: ${totalPages}`);

  // Slice first 8 pages for TOC and front matter
  const tocDoc = await PDFDocument.create();
  const copied = await tocDoc.copyPages(srcDoc, [0, 1, 2, 3, 4, 5, 6, 7]);
  copied.forEach(p => tocDoc.addPage(p));
  const tocBytes = await tocDoc.save();
  const tocB64 = Buffer.from(tocBytes).toString('base64');

  const prompt = `You are a curriculum expert for the Egyptian Ministry of Education Science textbooks.
In front of you are the introductory pages and Table of Contents of the textbook (Science - Second Preparatory Grade - Term 1).
Examine the pages thoroughly and extract the complete official Table of Contents:
- What is the language of this textbook? (English / Arabic / Bilingual)?
- All official Units with their numbers, Arabic and English titles, descriptions.
- All lessons under each unit with their numbers and titles.
- Printed page numbers vs PDF page numbers.
- Any notes about front matter, unit assessments, general revision, or practical exams at the end.

Format your output strictly as JSON:
{
  "book_title": "...",
  "language": "en",
  "grade": "Second Preparatory",
  "term": "First Term",
  "units": [
    {
      "unit_number": 1,
      "title_en": "Unit Name in English",
      "title_ar": "اسم الوحدة بالعربية",
      "printed_start_page": 2,
      "printed_end_page": 30,
      "pdf_start_page": 6,
      "pdf_end_page": 34,
      "lessons": [
        {
          "lesson_number": 1,
          "title_en": "Lesson Name in English",
          "title_ar": "اسم الدرس بالعربية",
          "printed_page": 2,
          "pdf_page": 6
        }
      ]
    }
  ],
  "notes": "..."
}`;

  console.log('Extracting authentic TOC via Gemini Multimodal OCR...');
  const res = await GeminiClient.generateContent({
    parts: [
      { inline_data: { mime_type: 'application/pdf', data: tocB64 } },
      { text: prompt }
    ],
    responseMimeType: 'application/json',
    temperature: 0.1
  });

  console.log(res);
  fs.writeFileSync('./scripts/prep2_science_toc.json', res, 'utf-8');
}

extractPrep2ScienceToc().catch(console.error);
