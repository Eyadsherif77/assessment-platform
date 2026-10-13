import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

const bookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9';
const pdfPath = path.resolve('uploads', `book_${bookId}.pdf`);

async function inspectMissingPages() {
  const fullBytes = fs.readFileSync(pdfPath);
  const srcDoc = await PDFDocument.load(fullBytes);

  for (const pageNum of [42, 84]) {
    console.log(`\n======================================================`);
    console.log(`🔍 INSPECTING MISSING PDF PAGE ${pageNum} (0-indexed: ${pageNum - 1})`);
    console.log(`======================================================`);

    const subDoc = await PDFDocument.create();
    const [copied] = await subDoc.copyPages(srcDoc, [pageNum - 1]);
    subDoc.addPage(copied);
    const pageBytes = await subDoc.save();
    const b64 = Buffer.from(pageBytes).toString('base64');

    const prompt = `أنت خبير فحص كتب ومناهج وزارة التربية والتعليم المصرية.
أمامك الصفحة رقم ${pageNum} من ملف PDF لكتاب الدراسات الاجتماعية (الصف الثالث الإعدادي).
افحص الصفحة بدقة وأجب بالتفصيل:
1. ما هو نوع هذه الصفحة؟ (نص تعليمي، خريطة، لوحة فنية، تدريبات، صفحة بيضاء، أم غلاف؟)
2. ما هو رقم الصفحة المطبوع في أسفل/أعلى الصفحة إن وجد؟
3. ما هو عنوان الدرس أو الوحدة في رأس الصفحة؟
4. قم باستخراج وتفريغ النص العربي الكامل الموجود في هذه الصفحة كلمة بكلمة.

أجب بصيغة JSON:
{
  "page_type": "...",
  "printed_page_number": "...",
  "heading": "...",
  "full_text": "..."
}`;

    const res = await GeminiClient.generateContent({
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: b64 } },
        { text: prompt }
      ],
      responseMimeType: 'application/json',
      temperature: 0.1
    });

    console.log(`Analysis Result for Page ${pageNum}:`);
    const parsed = JSON.parse(res);
    console.log(JSON.stringify(parsed, null, 2));
  }

  process.exit(0);
}

inspectMissingPages().catch(err => {
  console.error(err);
  process.exit(1);
});
