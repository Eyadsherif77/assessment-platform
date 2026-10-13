import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '81b8a308-7fcf-4938-8c45-aa0056624f32';

async function extractPages1and2() {
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bookId}.pdf`);
  const fullPdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(fullPdfBuf);

  console.log('Extracting authentic PDF Pages 1 and 2...');
  const batchDoc = await PDFDocument.create();
  const copied = await batchDoc.copyPages(srcDoc, [0, 1]); // Pages 1 and 2
  copied.forEach(p => batchDoc.addPage(p));
  const b64 = Buffer.from(await batchDoc.save()).toString('base64');

  const prompt = `أنت نظام استخراج نصوص تعليمية فائق الدقة لمناهج وزارة التربية والتعليم المصرية.
أمامك صفحتا الغلاف والبيانات التمهيدية (صفحتا PDF رقم 1 و 2) من كتاب الدراسات الاجتماعية (الصف الثاني الإعدادي - الفصل الدراسي الأول).
المطلوب استخراج النص المكتوب بدقة:
الصفحة 1: عنوان الكتاب، الوزارة، الصف، الفصل الدراسي، أسماء المؤلفين والمراجعين إن وُجدت.
الصفحة 2: بيانات النشر والتوزيع وحقوق الطبع والمراجعة.

أخرج النتيجة بصيغة JSON حصراً بهذا التنسيق:
{
  "pages": [
    {"page_number": 1, "text": "..."},
    {"page_number": 2, "text": "..."}
  ]
}`;

  const resStr = await GeminiClient.generateContent({
    parts: [
      { inline_data: { mime_type: 'application/pdf', data: b64 } },
      { text: prompt }
    ],
    responseMimeType: 'application/json',
    temperature: 0.1
  });

  const parsed = JSON.parse(resStr);
  console.log('Extracted Pages 1 and 2:', parsed);

  for (const item of parsed.pages) {
    const pNum = Number(item.page_number);
    const text = String(item.text || '').trim();
    const pageId = uuidv4();
    await db.query(
      `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
       VALUES ($1, $2, $3, $4, $5)
       ON DUPLICATE KEY UPDATE raw_text = VALUES(raw_text), char_count = VALUES(char_count)`,
      [pageId, bookId, pNum, text, text.length]
    );
    console.log(`✅ Updated Page ${pNum} in book_pages (${text.length} chars).`);
  }

  // Remove legacy chunks for pages 1, 2, 3 (which are front-matter pages before Unit 1)
  console.log('Cleaning up legacy seed chunks on front matter pages 1, 2, 3...');
  const delRes = await db.query(
    'DELETE FROM book_chunks WHERE book_id = $1 AND page_number IN (1, 2, 3)',
    [bookId]
  );
  console.log(`✅ Removed legacy chunks for pages 1, 2, 3.`);

  process.exit(0);
}

extractPages1and2().catch(err => {
  console.error(err);
  process.exit(1);
});
