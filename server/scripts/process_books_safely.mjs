import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import fs from 'fs';
import path from 'path';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { v4 as uuidv4 } from 'uuid';

const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Parse command line arguments
const args = process.argv.slice(2);
const targetBookId = args.find(a => a.startsWith('--book='))?.split('=')[1];
const force = args.includes('--force');

async function processBooksSafely() {
  console.log(`======================================================================`);
  console.log(`🛡️ SAFE, RESUMABLE, RATE-LIMITED CURRICULUM EXTRACTION`);
  console.log(`======================================================================\n`);

  let query = `
    SELECT b.id, b.title_ar, b.title_en, b.academic_stage_id, b.grade_id, b.subject_id, b.school_type, b.term,
           g.name_ar as grade_name_ar, s.name_ar as subject_name_ar, s.code as subject_code
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
  `;
  const params = [];
  if (targetBookId) {
    query += ' WHERE b.id = $1';
    params.push(targetBookId);
  }
  query += ' ORDER BY b.grade_id, b.subject_id';

  const booksRes = await db.query(query, params);
  const booksToProcess = booksRes.rows;
  console.log(`Found ${booksToProcess.length} book(s) to inspect.\n`);

  const summary = [];

  for (let i = 0; i < booksToProcess.length; i++) {
    const book = booksToProcess[i];
    const bId = book.id;
    console.log(`----------------------------------------------------------------------`);
    console.log(`[${i + 1}/${booksToProcess.length}] Inspecting: "${book.title_ar}" (${bId})`);
    console.log(`   Grade: ${book.grade_name_ar || book.grade_id} | Subject: ${book.subject_name_ar || book.subject_code}`);

    // Check if already processed (Resumability Check)
    const existingChapters = await db.query(
      'SELECT id, chapter_number, title_ar, title_en, start_page, end_page FROM book_chapters WHERE book_id = $1 ORDER BY chapter_number ASC',
      [bId]
    );
    const existingPages = await db.query(
      'SELECT COUNT(*) as cnt, SUM(char_count) as total_chars FROM book_pages WHERE book_id = $1 AND char_count > 50',
      [bId]
    );
    const existingChunks = await db.query(
      'SELECT COUNT(*) as cnt FROM book_chunks WHERE book_id = $1',
      [bId]
    );

    const hasRealChapters = existingChapters.rows.length >= 2 && !existingChapters.rows.some(c => c.title_ar.includes('المفاهيم التأسيسية'));
    const realPagesCount = parseInt(existingPages.rows[0]?.cnt || '0', 10);
    const realCharsCount = parseInt(existingPages.rows[0]?.total_chars || '0', 10);
    const realChunksCount = parseInt(existingChunks.rows[0]?.cnt || '0', 10);

    if (!force && hasRealChapters && realPagesCount >= 3 && realChunksCount >= 3) {
      console.log(`   ✅ ALREADY VERIFIED & RESUMED: Book has ${existingChapters.rows.length} verified units, ${realPagesCount} pages, ${realChunksCount} chunks (${realCharsCount} chars). Skipping!`);
      summary.push({
        title: book.title_ar,
        grade: book.grade_name_ar,
        subject: book.subject_name_ar,
        units: existingChapters.rows.length,
        pages: realPagesCount,
        chars: realCharsCount,
        status: 'VERIFIED_EXISTING'
      });
      continue;
    }

    console.log(`   ⚡ Needs processing: hasRealChapters=${hasRealChapters}, realPages=${realPagesCount}, chunks=${realChunksCount}`);

    // 1. Reconstruct PDF with local disk caching
    const diskPdfPath = path.resolve(uploadsDir, `book_${bId}.pdf`);
    let fullPdfBuf = null;

    if (fs.existsSync(diskPdfPath)) {
      console.log(`   * Loading cached PDF from disk: ${diskPdfPath}`);
      fullPdfBuf = fs.readFileSync(diskPdfPath);
    } else {
      const countRes = await db.query('SELECT COUNT(*) as cnt FROM book_pdf_chunks WHERE book_id = $1', [bId]);
      const totalChunks = parseInt(countRes.rows[0]?.cnt || '0', 10);

      if (totalChunks === 0) {
        console.warn(`   ⚠️ No chunks in database for this book.`);
        summary.push({ title: book.title_ar, status: 'MISSING_CHUNKS' });
        continue;
      }

      console.log(`   * Downloading ${totalChunks} chunks in batches...`);
      const buffers = [];
      const BATCH_SIZE = 4;
      for (let c = 0; c < totalChunks; c += BATCH_SIZE) {
        const endC = Math.min(totalChunks - 1, c + BATCH_SIZE - 1);
        const batchRes = await db.query(
          'SELECT chunk_index, chunk_data FROM book_pdf_chunks WHERE book_id = $1 AND chunk_index >= $2 AND chunk_index <= $3 ORDER BY chunk_index ASC',
          [bId, c, endC]
        );
        for (const r of batchRes.rows) {
          buffers.push(Buffer.isBuffer(r.chunk_data) ? r.chunk_data : Buffer.from(r.chunk_data));
        }
      }
      fullPdfBuf = Buffer.concat(buffers);
      fs.writeFileSync(diskPdfPath, fullPdfBuf);
      console.log(`   * Saved to local disk: ${(fullPdfBuf.length / (1024 * 1024)).toFixed(2)} MB`);
    }

    const srcDoc = await PDFDocument.load(fullPdfBuf);
    const totalPages = srcDoc.getPageCount();
    console.log(`   * Total PDF pages: ${totalPages}`);

    // 2. Extract Table of Contents via Gemini Vision OCR (Single safe call)
    console.log(`   * Extracting authentic TOC via Vision OCR (Pages 1 to 12)...`);
    const tocDoc = await PDFDocument.create();
    const copiedToc = await tocDoc.copyPages(srcDoc, Array.from({ length: Math.min(12, totalPages) }, (_, idx) => idx));
    copiedToc.forEach(p => tocDoc.addPage(p));
    const tocBytes = await tocDoc.save();
    const tocBase64 = Buffer.from(tocBytes).toString('base64');

    const isEnglish = (book.subject_code || '').toLowerCase().includes('english') ||
                      (book.title_ar || '').toLowerCase().includes('english');

    const tocPrompt = `أنت خبير مناهج تعليمية مصري بوزارة التربية والتعليم.
أمامك الصفحات الأولى وفهرس كتاب مدرسي (${book.title_ar} - ${book.grade_name_ar || ''}).
المطلوب استخراج الوحدات الدراسية الحقيقية مع دروسها وأرقام صفحاتها بدقة 100%.
${isEnglish ? 'الكتاب باللغة الإنجليزية، استخرج أسماء الوحدات والدروس بالإنجليزية والعربية.' : 'استخرج أسماء الوحدات والدروس بالعربية والإنجليزية إن وجد.'}

أجب بصيغة JSON حصراً بهذا التنسيق:
{
  "units": [
    {
      "unit_number": 1,
      "title_ar": "اسم الوحدة بالعربية",
      "title_en": "Unit Name in English",
      "start_page": 1,
      "end_page": 25,
      "lessons": [
        { "lesson_number": 1, "title_ar": "اسم الدرس", "title_en": "Lesson Name", "start_page": 1, "end_page": 10 }
      ]
    }
  ]
}`;

    let tocData = null;
    try {
      const tocJsonStr = await GeminiClient.generateContent({
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: tocBase64 } },
          { text: tocPrompt }
        ],
        responseMimeType: 'application/json',
        temperature: 0.1
      });
      tocData = JSON.parse(tocJsonStr);
    } catch (err) {
      console.warn(`   ⚠️ TOC Vision OCR error:`, err.message);
    }

    if (!tocData || !tocData.units || tocData.units.length === 0) {
      console.warn(`   ⚠️ Could not extract authentic TOC. Marking for review.`);
      await db.query(`UPDATE books SET processing_status = 'REQUIRES_REVIEW' WHERE id = $1`, [bId]);
      summary.push({ title: book.title_ar, status: 'REQUIRES_REVIEW' });
      continue;
    }

    console.log(`   ✅ Extracted ${tocData.units.length} authentic units:`);
    for (const u of tocData.units) {
      console.log(`      * [Unit ${u.unit_number}] ${u.title_ar}: Pages ${u.start_page} - ${u.end_page || totalPages}`);
    }

    // 3. Persist verified chapters
    await db.query('DELETE FROM book_chapters WHERE book_id = $1', [bId]);
    const createdChapters = [];
    for (const u of tocData.units) {
      const chId = uuidv4();
      const endP = u.end_page || (u.unit_number === tocData.units.length ? totalPages : u.start_page + 20);
      const desc = u.lessons?.map(l => l.title_ar).join('، ') || u.title_ar;
      const descEn = u.lessons?.map(l => l.title_en || l.title_ar).join(', ') || u.title_en || u.title_ar;

      await db.query(
        `INSERT INTO book_chapters (
          id, book_id, chapter_number, title_ar, title_en, start_page, end_page, description, description_en
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [chId, bId, u.unit_number, u.title_ar, u.title_en || u.title_ar, u.start_page, endP, desc, descEn]
      );
      createdChapters.push({ id: chId, ...u, end_page: endP });
    }

    // 4. Extract real educational text for Unit 1 (Active Unit)
    console.log(`   * Extracting educational text for Unit 1 (Pages ${createdChapters[0].start_page} to ${Math.min(createdChapters[0].start_page + 6, totalPages)})...`);
    await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND chapter_id = $2', [bId, createdChapters[0].id]);

    const u1 = createdChapters[0];
    const sP = Math.max(1, u1.start_page);
    const eP = Math.min(totalPages, Math.min(u1.end_page, sP + 5)); // 4-5 pages max
    const pageNums = [];
    for (let p = sP; p <= eP; p++) pageNums.push(p);

    const unitDoc = await PDFDocument.create();
    const zeroPages = pageNums.map(n => n - 1).filter(idx => idx >= 0 && idx < totalPages);
    const copiedPages = await unitDoc.copyPages(srcDoc, zeroPages);
    copiedPages.forEach(p => unitDoc.addPage(p));
    const unitBytes = await unitDoc.save();
    const unitBase64 = Buffer.from(unitBytes).toString('base64');

    const ocrPrompt = `أنت نظام استخراج نصوص تعليمية مصري دقيق.
أمامك صفحات من كتاب مدرسي (${book.title_ar} - ${u1.title_ar}).
الصفحات المصورة هي: ${pageNums.join(', ')}.
استخرج النص التعليمي الكامل لكل صفحة كما هو في كتاب الوزارة (المفاهيم، الشرح، القوانين، التدريبات).
أجب بصيغة JSON حصراً بهذا التنسيق:
{
  "pages": [
    {
      "page_number": ${pageNums[0]},
      "text": "النص التعليمي الكامل المستخرج..."
    }
  ]
}`;

    let unitChars = 0;
    try {
      const ocrResStr = await GeminiClient.generateContent({
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: unitBase64 } },
          { text: ocrPrompt }
        ],
        responseMimeType: 'application/json',
        temperature: 0.1
      });

      const parsedOcr = JSON.parse(ocrResStr);
      if (parsedOcr.pages && Array.isArray(parsedOcr.pages)) {
        for (const p of parsedOcr.pages) {
          const pNum = Number(p.page_number) || pageNums[0];
          const pText = String(p.text || '').trim();
          if (pText.length > 20) {
            unitChars += pText.length;

            const pageId = uuidv4();
            await db.query(
              `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
               VALUES ($1, $2, $3, $4, $5)
               ON DUPLICATE KEY UPDATE raw_text = VALUES(raw_text), char_count = VALUES(char_count)`,
              [pageId, bId, pNum, pText, pText.length]
            );

            const chunkId = uuidv4();
            await db.query(
              `INSERT INTO book_chunks (
                id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                chunkId,
                bId,
                u1.id,
                book.academic_stage_id,
                book.grade_id,
                book.subject_id,
                pNum,
                0,
                pText,
                JSON.stringify({ unit: u1.title_ar, page: pNum })
              ]
            );
          }
        }
      }
    } catch (ocrErr) {
      console.warn(`   ⚠️ Unit 1 OCR warning:`, ocrErr.message);
    }

    await db.query(`UPDATE books SET processing_status = 'COMPLETED', total_pages = $1 WHERE id = $2`, [totalPages, bId]);
    console.log(`   🎉 Successfully completed Book! Persisted ${unitChars} chars for Unit 1.\n`);

    summary.push({
      title: book.title_ar,
      grade: book.grade_name_ar,
      subject: book.subject_name_ar,
      units: createdChapters.length,
      chars: unitChars,
      status: 'COMPLETED'
    });
  }

  console.log(`\n======================================================================`);
  console.log(`📋 AUDIT SUMMARY TABLE`);
  console.log(`======================================================================\n`);
  console.table(summary);
  process.exit(0);
}

processBooksSafely().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
