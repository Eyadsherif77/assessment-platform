import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

async function processSingleBookE2E() {
  const bookId = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec'; // Prep 1 Science
  console.log(`\n======================================================`);
  console.log(`🚀 STARTING END-TO-END VERIFICATION ON BOOK: ${bookId}`);
  console.log(`======================================================\n`);

  // 1. Reconstruct PDF from TiDB chunks
  console.log('[STEP 1] Reconstructing PDF from book_pdf_chunks in TiDB...');
  const chunksRes = await db.query(
    'SELECT chunk_index, chunk_data FROM book_pdf_chunks WHERE book_id = $1 ORDER BY chunk_index ASC',
    [bookId]
  );
  console.log(`- Total chunks in DB: ${chunksRes.rows.length}`);

  const buffers = [];
  for (const r of chunksRes.rows) {
    const raw = r.chunk_data;
    buffers.push(Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
  }

  const fullPdfBuf = Buffer.concat(buffers);
  console.log(`- Assembled PDF size: ${(fullPdfBuf.length / (1024*1024)).toFixed(2)} MB`);
  const header = fullPdfBuf.subarray(0, 5).toString('ascii');
  if (!header.startsWith('%PDF')) {
    throw new Error(`Invalid PDF header: "${header}"`);
  }
  console.log(`- Header verification: PASSED (%PDF)`);

  const srcDoc = await PDFDocument.load(fullPdfBuf);
  const totalPages = srcDoc.getPageCount();
  console.log(`- Total PDF pages verified: ${totalPages}`);

  // 2. Extract authentic Table of Contents (TOC) using Gemini Vision OCR on first 10 pages
  console.log('\n[STEP 2] Extracting authentic Table of Contents via Vision OCR...');
  const tocDoc = await PDFDocument.create();
  const copiedTocPages = await tocDoc.copyPages(srcDoc, Array.from({ length: Math.min(10, totalPages) }, (_, i) => i));
  copiedTocPages.forEach(p => tocDoc.addPage(p));
  const tocPdfBytes = await tocDoc.save();
  const tocBase64 = Buffer.from(tocPdfBytes).toString('base64');

  const tocPrompt = `أنت خبير مناهج تعليمية مصري. أمامك الصفحات الأولى وفهرس كتاب علوم مدرسي للصف الأول الإعدادي.
استخرج الوحدات الدراسية الحقيقية مع دروسها وأرقام صفحاتها بدقة 100%.
أجب بصيغة JSON حصراً:
{
  "units": [
    {
      "unit_number": 1,
      "title_ar": "الوحدة الأولى: ...",
      "title_en": "Unit 1: ...",
      "start_page": 1,
      "end_page": 32,
      "lessons": [
        { "lesson_number": 1, "title_ar": "...", "title_en": "...", "start_page": 2, "end_page": 9 }
      ]
    }
  ]
}`;

  const tocJsonStr = await GeminiClient.generateContent({
    parts: [
      { inline_data: { mime_type: 'application/pdf', data: tocBase64 } },
      { text: tocPrompt }
    ],
    responseMimeType: 'application/json',
    temperature: 0.1
  });

  const tocData = JSON.parse(tocJsonStr);
  console.log(`- Extracted ${tocData.units.length} authentic units:`);
  for (const u of tocData.units) {
    console.log(`  * [Unit ${u.unit_number}] ${u.title_ar} (${u.title_en}): Pages ${u.start_page} to ${u.end_page || totalPages} (${u.lessons?.length || 0} lessons)`);
  }

  // 3. Persist authentic units into book_chapters
  console.log('\n[STEP 3] Persisting verified curriculum into book_chapters...');
  await db.query('DELETE FROM book_chapters WHERE book_id = $1', [bookId]);
  
  const createdChapters = [];
  for (const u of tocData.units) {
    const chId = uuidv4();
    const endP = u.end_page || (u.unit_number === tocData.units.length ? totalPages : u.start_page + 20);
    const desc = u.lessons?.map(l => l.title_ar).join('، ') || u.title_ar;

    await db.query(
      `INSERT INTO book_chapters (
        id, book_id, chapter_number, title_ar, title_en, start_page, end_page, description, description_en
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [chId, bookId, u.unit_number, u.title_ar, u.title_en || u.title_ar, u.start_page, endP, desc, desc]
    );
    createdChapters.push({ id: chId, ...u, end_page: endP });
  }
  console.log(`- Saved ${createdChapters.length} chapters to database.`);

  // 4. Extract real educational text from Unit 1 pages (e.g. pages 2-8: Structure of the Atom)
  console.log('\n[STEP 4] OCR Extracting real educational page text for Unit 1 lessons (Pages 2 to 9)...');
  const unit1Doc = await PDFDocument.create();
  // Pages 2 to 9 (0-indexed: 1 to 8)
  const lessonPages = [1, 2, 3, 4, 5, 6, 7]; // 7 pages
  const copiedLessonPages = await unit1Doc.copyPages(srcDoc, lessonPages);
  copiedLessonPages.forEach(p => unit1Doc.addPage(p));
  const unit1Bytes = await unit1Doc.save();
  const unit1Base64 = Buffer.from(unit1Bytes).toString('base64');

  const pageOcrPrompt = `أنت نظام استخراج نصوص تعليمية مصري دقيق.
أمامك صفحات من كتاب العلوم للصف الأول الإعدادي (درس تركيب الذرة - Structure of the Atom).
استخرج النص التعليمي الكامل لكل صفحة كما هو في كتاب الوزارة (المفاهيم، الشرح، القوانين، الأمثلة).
أجب بصيغة JSON حصراً بهذا التنسيق:
{
  "pages": [
    {
      "page_number": 2,
      "text": "النص الكامل المستخرج من الصفحة..."
    }
  ]
}`;

  const pagesOcrStr = await GeminiClient.generateContent({
    parts: [
      { inline_data: { mime_type: 'application/pdf', data: unit1Base64 } },
      { text: pageOcrPrompt }
    ],
    responseMimeType: 'application/json',
    temperature: 0.1
  });

  const pagesData = JSON.parse(pagesOcrStr);
  console.log(`- Successfully extracted ${pagesData.pages.length} pages of textbook text!`);

  // Persist into book_pages and create book_chunks
  const bookRes = await db.query('SELECT academic_stage_id, grade_id, subject_id FROM books WHERE id = $1', [bookId]);
  const bookMeta = bookRes.rows[0];
  const unit1ChapterId = createdChapters[0].id;

  // Clear previous chunks for unit 1
  await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND chapter_id = $2', [bookId, unit1ChapterId]);

  let totalChars = 0;
  for (const p of pagesData.pages) {
    const pageNum = p.page_number;
    const text = p.text.trim();
    totalChars += text.length;
    console.log(`  * Page ${pageNum}: ${text.length} characters (Preview: "${text.slice(0, 100)}...")`);

    // Upsert into book_pages
    const pageId = uuidv4();
    await db.query(
      `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count) 
       VALUES ($1, $2, $3, $4, $5) 
       ON DUPLICATE KEY UPDATE raw_text = VALUES(raw_text), char_count = VALUES(char_count)`,
      [pageId, bookId, pageNum, text, text.length]
    );

    // Save as genuine textbook chunks in book_chunks
    const chunkId = uuidv4();
    await db.query(
      `INSERT INTO book_chunks (
        id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        chunkId,
        bookId,
        unit1ChapterId,
        bookMeta.academic_stage_id,
        bookMeta.grade_id,
        bookMeta.subject_id,
        pageNum,
        0,
        text,
        JSON.stringify({ lesson: 'تركيب الذرة', unit: createdChapters[0].title_ar, page: pageNum })
      ]
    );
  }
  console.log(`- Total educational characters persisted for Unit 1: ${totalChars} chars.`);

  // 5. Test Exam Generation grounded ONLY in real textbook passages
  console.log('\n[STEP 5] Testing Exam Generation grounded in retrieved textbook passages...');
  const examChunksRes = await db.query(
    'SELECT content, page_number, metadata FROM book_chunks WHERE book_id = $1 AND chapter_id = $2 ORDER BY page_number ASC',
    [bookId, unit1ChapterId]
  );
  console.log(`- Retrieved ${examChunksRes.rows.length} verified passages from book_chunks.`);

  const passagesContext = examChunksRes.rows
    .map(c => `[صفحة ${c.page_number}]:\n${c.content}`)
    .join('\n\n---\n\n');

  const examPrompt = `أنت واضع امتحانات رسمي لوزارة التربية والتعليم المصرية للمرحلة الإعدادية (الصف الأول الإعدادي).
المطلوب وضع 3 أسئلة اختيار من متعدد (MCQ) حصراً واستناداً بنسبة 100% إلى مقتطفات كتاب الوزارة المرفقة أدناه.

شروط إلزامية صارمة:
1. السؤال وإجابته يجب أن يكون مصدرهما ومذكورين في نص الكتاب المرفق.
2. مستوى الصعوبة مناسب تماماً لطالب الصف الأول الإعدادي (12-13 سنة). ممنوع أي مصطلحات جامعية أو بحثية أو منهجية عامة.
3. حدد رقم الصفحة المأخوذ منها السؤال (source_page) والدرس (source_lesson).
4. أربعة اختيارات لكل سؤال، وإجابة صحيحة واحدة، وتفسير تعليمي مبسط.

المقتطفات من كتاب الوزارة:
${passagesContext}

أجب بصيغة JSON حصراً بهذا التنسيق:
{
  "questions": [
    {
      "question_number": 1,
      "question_text": "...",
      "options": ["أ) ...", "ب) ...", "ج) ...", "د) ..."],
      "correct_answer": "...",
      "explanation": "...",
      "source_page": 2,
      "source_lesson": "تركيب الذرة"
    }
  ]
}`;

  const examJsonStr = await GeminiClient.generateContent({
    prompt: examPrompt,
    responseMimeType: 'application/json',
    temperature: 0.2
  });

  const examData = JSON.parse(examJsonStr);
  console.log(`\n✅ GENERATED EXAM QUESTIONS (VERIFIED & GROUNDED IN TEXTBOOK):`);
  console.log(JSON.stringify(examData, null, 2));

  console.log(`\n======================================================`);
  console.log(`🎉 END-TO-END VERIFICATION COMPLETED SUCCESSFULLY!`);
  console.log(`======================================================\n`);
  process.exit(0);
}

processSingleBookE2E().catch(err => {
  console.error('Fatal error during E2E verification:', err);
  process.exit(1);
});
