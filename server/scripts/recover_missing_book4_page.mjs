import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = '81b8a308-7fcf-4938-8c45-aa0056624f32';

async function recoverPage36() {
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${bookId}.pdf`);
  const fullPdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(fullPdfBuf);

  console.log('Extracting missing PDF Page 36 specifically...');
  const singleDoc = await PDFDocument.create();
  const copied = await singleDoc.copyPages(srcDoc, [35]); // 0-based index 35 = page 36
  singleDoc.addPage(copied[0]);
  const b64 = Buffer.from(await singleDoc.save()).toString('base64');

  const prompt = `أنت نظام استخراج نصوص تعليمية فائق الدقة لمناهج الدراسات الاجتماعية بوزارة التربية والتعليم المصرية.
أمامك صفحة من كتاب الدراسات الاجتماعية (الصف الثاني الإعدادي - الفصل الدراسي الأول): "مصر وعلاقتها بآسيا وأوروبا".
رقم صفحة ملف الـ PDF هو: 36.

المطلوب استخراج النص التعليمي الكامل للصفحة باللغة العربية الفصحى بدقة متناهية:
1. استخرج نصوص الدرس، العناوين، الشروحات، المفاهيم، والتواريخ والأسماء.
2. استخرج نصوص الخرائط والأنشطة والأسئلة إن وُجدت.

أخرج النتيجة بصيغة JSON حصراً بهذا التنسيق:
{
  "page_number": 36,
  "text": "النص التعليمي المستخرج لصفحة 36..."
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
  const text = String(parsed.text || '').trim();
  console.log(`Extracted ${text.length} chars for Page 36:\n"${text.slice(0, 200)}..."`);

  // Persist to book_pages
  const pageId = uuidv4();
  await db.query(
    `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
     VALUES ($1, $2, $3, $4, $5)
     ON DUPLICATE KEY UPDATE raw_text = VALUES(raw_text), char_count = VALUES(char_count)`,
    [pageId, bookId, 36, text, text.length]
  );
  console.log('✅ Persisted Page 36 to book_pages.');

  // Page 36 is in Unit 2 (27..56)
  // Unit 2 ID: ae5ca8ad-b23f-4875-ba5d-8b3f0091ffa2
  const unit2Id = 'ae5ca8ad-b23f-4875-ba5d-8b3f0091ffa2';
  await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND page_number = $2', [bookId, 36]);
  const chunkId = uuidv4();
  await db.query(
    `INSERT INTO book_chunks (
      id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      chunkId,
      bookId,
      unit2Id,
      '61998777-4c5f-4e51-bc0a-38de938c842a',
      '44d13655-da95-4425-8566-fd8451af1965',
      'sub_prep_2_social_studies',
      36,
      0,
      text,
      JSON.stringify({ unit_number: 2, section_type: 'curriculum_unit', pdf_page: 36, subject: 'Social Studies', grade: 'Prep 2' })
    ]
  );
  console.log('✅ Indexed Page 36 into book_chunks (Unit 2).');

  // Verify total pages in DB
  const finalCheck = await db.query(
    'SELECT count(*) as total_pages, count(distinct page_number) as distinct_pages FROM book_pages WHERE book_id = $1',
    [bookId]
  );
  const chunkCheck = await db.query(
    'SELECT count(*) as total_chunks FROM book_chunks WHERE book_id = $1',
    [bookId]
  );
  console.log(`Final Pages in book_pages: ${finalCheck.rows[0].total_pages} (Distinct: ${finalCheck.rows[0].distinct_pages})`);
  console.log(`Final Chunks in book_chunks: ${chunkCheck.rows[0].total_chunks}`);

  process.exit(0);
}

recoverPage36().catch(err => {
  console.error(err);
  process.exit(1);
});
