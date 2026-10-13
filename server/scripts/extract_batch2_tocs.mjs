import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

async function extractTocForBook(num, bookId, label, promptSubject) {
  console.log(`\n======================================================================`);
  console.log(`📑 EXTRACTING AUTHENTIC TOC FOR BOOK ${num}: ${label} (${bookId})`);
  console.log(`======================================================================`);

  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bookId}.pdf`);
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);
  const totalPages = srcDoc.getPageCount();
  console.log(`  Source PDF Total Pages: ${totalPages}`);

  // Copy first 8 pages (or 10 if needed)
  const tocPagesCount = Math.min(10, totalPages);
  const tocDoc = await PDFDocument.create();
  const pageIndices = Array.from({ length: tocPagesCount }, (_, i) => i);
  const copied = await tocDoc.copyPages(srcDoc, pageIndices);
  copied.forEach(p => tocDoc.addPage(p));
  const tocBytes = await tocDoc.save();
  const tocB64 = Buffer.from(tocBytes).toString('base64');

  const prompt = `You are a curriculum expert for Egyptian Ministry of Education textbooks.
In front of you are the introductory pages and Table of Contents of the textbook (${label}).
Examine the pages thoroughly and extract the complete official Table of Contents:
- Official textbook title as printed on the cover and title page.
- Language of instruction.
- Grade level and academic term.
- All official Units/Themes with their numbers, Arabic and English titles, and detailed descriptions.
- All lessons/modules under each unit with titles and printed page numbers.
- The exact mapping between printed page numbers and PDF page numbers.
- Any notes about front matter, reviews, appendices, or back matter.

Format your output strictly as JSON:
{
  "book_id": "${bookId}",
  "book_number": ${num},
  "official_title": "...",
  "subject": "${promptSubject}",
  "grade": "...",
  "term": "Term 1",
  "total_pdf_pages": ${totalPages},
  "units": [
    {
      "unit_number": 1,
      "title_ar": "...",
      "title_en": "...",
      "printed_start_page": 1,
      "printed_end_page": 20,
      "pdf_start_page": 5,
      "pdf_end_page": 24,
      "description": "...",
      "lessons": [
        {
          "lesson_number": 1,
          "title": "...",
          "printed_page": 1,
          "pdf_page": 5
        }
      ]
    }
  ],
  "front_matter": {
    "pdf_pages": "1..X",
    "description": "..."
  },
  "back_matter": {
    "pdf_pages": "Y..${totalPages}",
    "description": "..."
  },
  "notes": "..."
}`;

  console.log(`  Invoking Gemini Multimodal OCR on first ${tocPagesCount} pages...`);
  const res = await GeminiClient.generateContent({
    parts: [
      { inline_data: { mime_type: 'application/pdf', data: tocB64 } },
      { text: prompt }
    ],
    responseMimeType: 'application/json',
    temperature: 0.1
  });

  const outPath = `./scripts/book${num}_toc.json`;
  fs.writeFileSync(outPath, res, 'utf-8');
  console.log(`  ✅ Authentic TOC saved to ${outPath}`);
  console.log(`  Preview:`);
  console.log(res.slice(0, 500) + '...');
  return JSON.parse(res);
}

async function main() {
  const b6 = await extractTocForBook(6, '21e1d639-9f59-4a58-a8f8-8373b8e7fc90', 'English Prep 1', 'ENGLISH');
  const b7 = await extractTocForBook(7, 'bc6bb834-7192-474c-8507-c53265028b4e', 'Arabic Prep 2', 'ARABIC');
  const b8 = await extractTocForBook(8, '37bfa0c0-c4ce-419f-930a-000043d8d3f9', 'English Prep 2', 'ENGLISH');
  console.log('\n======================================================================');
  console.log('🎉 ALL THREE TOCs EXTRACTED SUCCESSFULLY!');
  console.log('======================================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('TOC extraction error:', err);
  process.exit(1);
});
