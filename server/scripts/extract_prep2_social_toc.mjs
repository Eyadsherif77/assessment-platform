import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

const targetBookId = '81b8a308-7fcf-4938-8c45-aa0056624f32';

async function extractPrep2SocialToc() {
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

  const prompt = `أنت خبير مناهج دراسات اجتماعية بوزارة التربية والتعليم المصرية.
أمامك الصفحات التمهيدية وفهرس كتاب (الدراسات الاجتماعية - الصف الثاني الإعدادي - الفصل الدراسي الأول).
المطلوب استخراج الفهرس الرسمي الكامل لكافة الوحدات والدروس وأرقام الصفحات المطبوعة وصفحات الـ PDF المطابقة لها.
اقرأ الصفحات بدقة واذكر تفاصيل كل وحدة والدروس التي تحتها وأرقام الصفحات كما هي في الكتاب المدرسي.

استخرج جميع الوحدات والدروس بدقة متناهية بصيغة JSON حصراً بهذا التنسيق:
{
  "book_title": "...",
  "grade": "Second Preparatory",
  "term": "First Term",
  "units": [
    {
      "unit_number": 1,
      "title_ar": "اسم الوحدة بالعربية",
      "title_en": "Unit Name in English",
      "printed_start_page": 2,
      "printed_end_page": 30,
      "pdf_start_page": 6,
      "pdf_end_page": 34,
      "lessons": [
        {
          "lesson_number": 1,
          "title_ar": "اسم الدرس بالعربية",
          "title_en": "Lesson Name in English",
          "printed_page": 2,
          "pdf_page": 6
        }
      ]
    }
  ],
  "notes": "أي ملاحظات بخصوص ترقيم الصفحات، التقديم، أو المراجعات العامة في نهاية الكتاب"
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
  fs.writeFileSync('./scripts/prep2_social_toc.json', res, 'utf-8');
}

extractPrep2SocialToc().catch(console.error);
