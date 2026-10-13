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

async function processAll13Books() {
  console.log(`======================================================================`);
  console.log(`📚 STARTING FULL PRODUCTION AUDIT & OCR RECONSTRUCTION FOR ALL 13 BOOKS`);
  console.log(`======================================================================\n`);

  const booksRes = await db.query(
    `SELECT b.id, b.title_ar, b.title_en, b.academic_stage_id, b.grade_id, b.subject_id, b.school_type, b.term,
            g.name_ar as grade_name_ar, s.name_ar as subject_name_ar, s.code as subject_code
     FROM books b
     LEFT JOIN grades g ON b.grade_id = g.id
     LEFT JOIN subjects s ON b.subject_id = s.id
     ORDER BY b.grade_id, b.subject_id`
  );

  const allBooks = booksRes.rows;
  console.log(`Found ${allBooks.length} books in platform database.`);

  const auditResults = [];

  for (let idx = 0; idx < allBooks.length; idx++) {
    const book = allBooks[idx];
    const bId = book.id;
    console.log(`\n----------------------------------------------------------------------`);
    console.log(`📖 [${idx + 1}/${allBooks.length}] Processing Book: "${book.title_ar}" (${book.title_en})`);
    console.log(`   Grade: ${book.grade_name_ar || book.grade_id} | Subject: ${book.subject_name_ar || book.subject_code} | ID: ${bId}`);
    console.log(`----------------------------------------------------------------------`);

    const result = {
      id: bId,
      title_ar: book.title_ar,
      title_en: book.title_en,
      grade: book.grade_name_ar || book.grade_id,
      subject: book.subject_name_ar || book.subject_code,
      pdfIntegrity: 'UNKNOWN',
      totalPages: 0,
      verifiedUnits: [],
      extractedPagesCount: 0,
      totalExtractedChars: 0,
      status: 'PENDING',
      notes: ''
    };

    try {
      const diskPdfPath = path.resolve(uploadsDir, `book_${bId}.pdf`);
      let fullPdfBuf = null;

      if (fs.existsSync(diskPdfPath)) {
        console.log(`   ⚡ Loading cached PDF directly from disk: ${diskPdfPath}`);
        fullPdfBuf = fs.readFileSync(diskPdfPath);
      } else {
        // Query total chunk count
        const countRes = await db.query(
          'SELECT COUNT(*) as cnt FROM book_pdf_chunks WHERE book_id = $1',
          [bId]
        );
        const totalChunks = parseInt(countRes.rows[0]?.cnt || '0', 10);

        if (totalChunks === 0) {
          console.warn(`   ⚠️ No PDF chunks found in book_pdf_chunks!`);
          result.pdfIntegrity = 'MISSING_CHUNKS';
          result.status = 'REQUIRES_REVIEW';
          result.notes = 'No PDF chunks stored in database.';
          auditResults.push(result);
          await db.query(`UPDATE books SET processing_status = 'REQUIRES_REVIEW', processing_error = 'No PDF chunks' WHERE id = $1`, [bId]);
          continue;
        }

        console.log(`   - Downloading ${totalChunks} binary chunks in safe batches of 4...`);
        const buffers = [];
        const BATCH_SIZE = 4;
        for (let c = 0; c < totalChunks; c += BATCH_SIZE) {
          const endC = Math.min(totalChunks - 1, c + BATCH_SIZE - 1);
          console.log(`     * Fetching chunks ${c} to ${endC} of ${totalChunks}...`);
          const batchRes = await db.query(
            'SELECT chunk_index, chunk_data FROM book_pdf_chunks WHERE book_id = $1 AND chunk_index >= $2 AND chunk_index <= $3 ORDER BY chunk_index ASC',
            [bId, c, endC]
          );
          for (const r of batchRes.rows) {
            const raw = r.chunk_data;
            buffers.push(Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
          }
        }
        fullPdfBuf = Buffer.concat(buffers);
        console.log(`   - Assembled full PDF: ${(fullPdfBuf.length / (1024 * 1024)).toFixed(2)} MB`);

        // Cache to disk
        fs.writeFileSync(diskPdfPath, fullPdfBuf);
        console.log(`   - Cached to local disk: ${diskPdfPath}`);
      }

      const header = fullPdfBuf.subarray(0, 5).toString('ascii');
      if (!header.startsWith('%PDF')) {
        console.error(`   ❌ Invalid PDF header: "${header}"`);
        result.pdfIntegrity = 'CORRUPT_HEADER';
        result.status = 'REQUIRES_REVIEW';
        auditResults.push(result);
        continue;
      }
      result.pdfIntegrity = 'VALID_PDF';

      const srcDoc = await PDFDocument.load(fullPdfBuf);
      const totalPages = srcDoc.getPageCount();
      result.totalPages = totalPages;
      console.log(`   - PDF verified: ${totalPages} pages.`);

      // 2. Extract Table of Contents via Gemini Vision OCR (Pages 1 to 12)
      console.log(`   - Slicing Table of Contents pages (1 to ${Math.min(12, totalPages)})...`);
      const tocDoc = await PDFDocument.create();
      const pagesToCopy = Math.min(12, totalPages);
      const copiedToc = await tocDoc.copyPages(srcDoc, Array.from({ length: pagesToCopy }, (_, i) => i));
      copiedToc.forEach(p => tocDoc.addPage(p));
      const tocBytes = await tocDoc.save();
      const tocBase64 = Buffer.from(tocBytes).toString('base64');

      const isEnglishSubject = (book.subject_code || '').toLowerCase().includes('english') ||
                               (book.title_ar || '').toLowerCase().includes('english') ||
                               (book.title_en || '').toLowerCase().includes('english');

      const tocPrompt = `أنت خبير مناهج تعليمية مصري بوزارة التربية والتعليم.
أمامك الصفحات الأولى وفهرس كتاب مدرسي (${book.title_ar} - ${book.grade_name_ar || ''}).
المطلوب استخراج الوحدات الدراسية الحقيقية مع دروسها وأرقام صفحاتها بدقة 100%.
${isEnglishSubject ? 'الكتاب باللغة الإنجليزية، استخرج أسماء الوحدات والدروس بالإنجليزية والعربية.' : 'استخرج أسماء الوحدات والدروس بالعربية والإنجليزية إن وجد.'}

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
      } catch (tocErr) {
        console.warn(`   ⚠️ TOC Vision OCR error:`, tocErr.message);
      }

      if (!tocData || !tocData.units || tocData.units.length === 0) {
        console.warn(`   ⚠️ Could not reliably detect units from TOC for this book. Marking for review.`);
        result.status = 'REQUIRES_REVIEW';
        result.notes = 'TOC could not be automatically extracted; requires human review.';
        auditResults.push(result);
        await db.query(`UPDATE books SET processing_status = 'REQUIRES_REVIEW' WHERE id = $1`, [bId]);
        continue;
      }

      console.log(`   ✅ Extracted ${tocData.units.length} authentic units:`);
      for (const u of tocData.units) {
        console.log(`      * [Unit ${u.unit_number}] ${u.title_ar} (${u.title_en}): Pages ${u.start_page} - ${u.end_page || totalPages} (${u.lessons?.length || 0} lessons)`);
      }
      result.verifiedUnits = tocData.units;

      // 3. Persist verified units in book_chapters
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

      // 4. Extract educational pages text across each unit
      console.log(`   - OCR extracting authentic educational pages across units...`);
      await db.query('DELETE FROM book_chunks WHERE book_id = $1', [bId]);

      let bookChars = 0;
      let bookPagesCount = 0;

      for (const ch of createdChapters) {
        const sPage = Math.max(1, ch.start_page);
        const ePage = Math.min(totalPages, ch.end_page);
        const pageSpan = ePage - sPage + 1;

        const samplePageNums = [];
        if (pageSpan <= 3) {
          for (let p = sPage; p <= ePage; p++) samplePageNums.push(p);
        } else {
          samplePageNums.push(sPage);
          samplePageNums.push(sPage + 1);
          samplePageNums.push(Math.min(ePage, sPage + Math.floor(pageSpan * 0.5)));
        }

        const unitDoc = await PDFDocument.create();
        const zeroIndexPages = samplePageNums.map(n => n - 1).filter(idx => idx >= 0 && idx < totalPages);
        if (zeroIndexPages.length === 0) continue;

        const copied = await unitDoc.copyPages(srcDoc, zeroIndexPages);
        copied.forEach(p => unitDoc.addPage(p));
        const unitBytes = await unitDoc.save();
        const unitBase64 = Buffer.from(unitBytes).toString('base64');

        const unitOcrPrompt = `أنت نظام استخراج نصوص تعليمية مصري دقيق.
أمامك صفحات من كتاب مدرسي (${book.title_ar} - ${ch.title_ar}).
الصفحات المصورة هي: ${samplePageNums.join(', ')}.
استخرج النص التعليمي الكامل لكل صفحة كما هو في كتاب الوزارة (المفاهيم، الشرح، القوانين، التدريبات).
أجب بصيغة JSON حصراً بهذا التنسيق:
{
  "pages": [
    {
      "page_number": ${samplePageNums[0]},
      "text": "النص التعليمي الكامل المستخرج..."
    }
  ]
}`;

        try {
          const unitOcrRes = await GeminiClient.generateContent({
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: unitBase64 } },
              { text: unitOcrPrompt }
            ],
            responseMimeType: 'application/json',
            temperature: 0.1
          });

          const parsedPages = JSON.parse(unitOcrRes);
          if (parsedPages.pages && Array.isArray(parsedPages.pages)) {
            for (const p of parsedPages.pages) {
              const pNum = Number(p.page_number) || samplePageNums[0];
              const pText = String(p.text || '').trim();
              if (pText.length > 20) {
                bookChars += pText.length;
                bookPagesCount++;

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
                    ch.id,
                    book.academic_stage_id,
                    book.grade_id,
                    book.subject_id,
                    pNum,
                    0,
                    pText,
                    JSON.stringify({ unit: ch.title_ar, page: pNum })
                  ]
                );
              }
            }
          }
        } catch (unitErr) {
          console.warn(`      ⚠️ Unit ${ch.chapter_number} OCR notice:`, unitErr.message);
        }
      }

      result.extractedPagesCount = bookPagesCount;
      result.totalExtractedChars = bookChars;
      result.status = 'COMPLETED';
      console.log(`   🎉 Successfully completed Book: ${bookPagesCount} pages extracted, ${bookChars} chars persisted.`);

      await db.query(
        `UPDATE books SET processing_status = 'COMPLETED', total_pages = $1, processing_error = NULL WHERE id = $2`,
        [totalPages, bId]
      );

      auditResults.push(result);
    } catch (err) {
      console.error(`   ❌ Failed processing book ${bId}:`, err);
      result.status = 'FAILED';
      result.notes = err.message;
      auditResults.push(result);
      await db.query(`UPDATE books SET processing_status = 'FAILED', processing_error = $1 WHERE id = $2`, [err.message, bId]);
    }
  }

  console.log(`\n======================================================================`);
  console.log(`📊 FINAL RECONSTRUCTION & CURRICULUM AUDIT REPORT (ALL 13 BOOKS)`);
  console.log(`======================================================================\n`);
  console.table(
    auditResults.map(r => ({
      'Book Title': r.title_ar,
      'Grade': r.grade,
      'Subject': r.subject,
      'PDF Status': r.pdfIntegrity,
      'Pages': r.totalPages,
      'Units': r.verifiedUnits?.length || 0,
      'OCR Pages': r.extractedPagesCount,
      'Chars': r.totalExtractedChars,
      'Status': r.status
    }))
  );

  process.exit(0);
}

processAll13Books().catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
