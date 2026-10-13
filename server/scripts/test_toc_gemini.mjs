import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';

async function testTocExtraction() {
  const bookId = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec'; // Science Prep 1
  console.log(`[1] Fetching chunks for Science Prep 1 (${bookId})...`);

  const countRes = await db.query('SELECT COUNT(*) as cnt FROM book_pdf_chunks WHERE book_id = $1', [bookId]);
  const cnt = parseInt(countRes.rows[0].cnt, 10);
  console.log(`Found ${cnt} chunks.`);

  const buffers = [];
  const BATCH_SIZE = 4;
  for (let c = 0; c < cnt; c += BATCH_SIZE) {
    const endC = Math.min(cnt - 1, c + BATCH_SIZE - 1);
    const batchRes = await db.query(
      'SELECT chunk_index, chunk_data FROM book_pdf_chunks WHERE book_id = $1 AND chunk_index BETWEEN $2 AND $3 ORDER BY chunk_index ASC',
      [bookId, c, endC]
    );
    for (const r of batchRes.rows) {
      const raw = r.chunk_data;
      buffers.push(Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
    }
  }

  const fullPdfBuf = Buffer.concat(buffers);
  console.log(`[2] Assembled full PDF: ${(fullPdfBuf.length / (1024*1024)).toFixed(2)} MB`);

  // Load into pdf-lib and extract first 10 pages
  console.log('[3] Loading PDF into pdf-lib to extract TOC pages (1-10)...');
  const srcDoc = await PDFDocument.load(fullPdfBuf);
  const totalPages = srcDoc.getPageCount();
  console.log(`Total pages in document: ${totalPages}`);

  const tocDoc = await PDFDocument.create();
  const pagesToCopy = Math.min(10, totalPages);
  const copiedPages = await tocDoc.copyPages(srcDoc, Array.from({ length: pagesToCopy }, (_, i) => i));
  copiedPages.forEach(p => tocDoc.addPage(p));
  const tocPdfBytes = await tocDoc.save();
  const base64Pdf = Buffer.from(tocPdfBytes).toString('base64');
  console.log(`[4] Created TOC PDF slice: ${(tocPdfBytes.length / (1024*1024)).toFixed(2)} MB`);

  // Call Gemini 2.5 Flash with the PDF
  console.log('[5] Sending TOC PDF to Gemini 3.8 Flash for vision OCR and curriculum structure...');
  const apiKey = process.env.GEMINI_API_KEY;
  const prompt = `أنت خبير مناهج دراسية بوزارة التربية والتعليم المصرية.
أمامك الصفحات الأولى وفهرس محتويات (Table of Contents) لكتاب مدرسي للمرحلة الإعدادية.
المطلوب استخراج الهيكل الحقيقي والفعلي للمنهج والوحدات والدروس بدقة بالغة 100%:
1. اسم كل وحدة (بالعربية والإنجليزية إن وجد).
2. أسماء الدروس داخل كل وحدة.
3. أرقام الصفحات (من صفحة كذا إلى صفحة كذا) لكل وحدة ودرس.
4. إجمالي عدد الوحدات.

أجب بصيغة JSON حصراً بهذا الشكل:
{
  "book_title": "...",
  "grade": "...",
  "term": 1,
  "units": [
    {
      "unit_number": 1,
      "title_ar": "...",
      "title_en": "...",
      "start_page": 1,
      "end_page": 25,
      "lessons": [
        { "lesson_number": 1, "title_ar": "...", "start_page": 1, "end_page": 10 }
      ]
    }
  ]
}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: 'application/pdf',
              data: base64Pdf
            }
          },
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  const resJson = await geminiRes.json();
  if (!geminiRes.ok) {
    console.error('Gemini error:', JSON.stringify(resJson, null, 2));
    process.exit(1);
  }

  const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log('[6] Gemini extracted response:');
  console.log(rawText);

  process.exit(0);
}

testTocExtraction().catch(err => {
  console.error('Error in testTocExtraction:', err);
  process.exit(1);
});
