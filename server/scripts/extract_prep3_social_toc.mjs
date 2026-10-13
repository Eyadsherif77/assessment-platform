import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

const targetBookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9';

async function extractPrep3SocialToc() {
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${targetBookId}.pdf`);
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);
  const totalPages = srcDoc.getPageCount();
  console.log(`Total PDF Pages: ${totalPages}`);

  // Slice first 10 pages for TOC and front matter
  const tocDoc = await PDFDocument.create();
  const copied = await tocDoc.copyPages(srcDoc, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  copied.forEach(p => tocDoc.addPage(p));
  const tocBytes = await tocDoc.save();
  const tocB64 = Buffer.from(tocBytes).toString('base64');

  const prompt = `أنت خبير مناهج دراسات اجتماعية بوزارة التربية والتعليم المصرية.
أمامك الصفحات التمهيدية وفهرس كتاب (الدراسات الاجتماعية - الصف الثالث الإعدادي - الفصل الدراسي الأول).
المطلوب استخراج الفهرس الرسمي الكامل لكافة الوحدات والدروس وأرقام الصفحات المطبوعة وصفحات الـ PDF.
المقرر ينقسم عادة إلى قسمين:
1. الجغرافيا (الجغرافيا الطبيعية للعالم وجغرافيا سكان العالم).
2. التاريخ (تاريخ مصر الحديث والمعاصر).

استخرج جميع الوحدات والدروس بدقة متناهية بصيغة JSON حصراً بهذا التنسيق:
{
  "units": [
    {
      "unit_number": 1,
      "title_ar": "اسم الوحدة بالعربية",
      "title_en": "Unit Name in English",
      "printed_start_page": 2,
      "printed_end_page": 30,
      "lessons": [
        {
          "lesson_number": 1,
          "title_ar": "اسم الدرس بالعربية",
          "title_en": "Lesson Name in English",
          "printed_page": 2
        }
      ]
    }
  ]
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
  fs.writeFileSync('./scripts/prep3_social_toc.json', res, 'utf-8');
}

extractPrep3SocialToc().catch(console.error);
