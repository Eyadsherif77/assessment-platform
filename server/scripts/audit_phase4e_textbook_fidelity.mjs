import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';

async function auditBooks() {
  console.log('========================================================================');
  console.log('📖 PHASE 4E: READ-ONLY AUDIT OF TEXTBOOK CONTENT FIDELITY & INGESTION');
  console.log('========================================================================\n');

  await db.init();

  const booksRes = await db.query(`
    SELECT 
      b.id, b.title_ar, b.title_en, b.file_url, b.total_pages, b.term, b.school_type, b.processing_status,
      g.name_ar as grade_ar, g.code as grade_code,
      s.name_ar as subject_ar, s.code as subject_code,
      st.name_ar as stage_ar, st.code as stage_code
    FROM books b
    JOIN grades g ON b.grade_id = g.id
    JOIN subjects s ON b.subject_id = s.id
    JOIN academic_stages st ON b.academic_stage_id = st.id
    ORDER BY g.sort_order, s.name_ar
  `);

  const books = booksRes.rows;
  console.log(`Found ${books.length} books in database.\n`);

  const auditReport = [];

  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    console.log(`[Book ${i + 1}/${books.length}] Auditing "${b.title_ar}" (${b.id})...`);

    // 1. Verify original PDF existence and readability
    let pdfFilename = `book_${b.id}.pdf`;
    let pdfPath = path.resolve(process.cwd(), 'uploads', pdfFilename);
    let pdfExists = fs.existsSync(pdfPath);
    let pdfSizeBytes = 0;
    let pdfReadable = false;

    if (pdfExists) {
      const stat = fs.statSync(pdfPath);
      pdfSizeBytes = stat.size;
      try {
        const fd = fs.openSync(pdfPath, 'r');
        const buf = Buffer.alloc(10);
        fs.readSync(fd, buf, 0, 10, 0);
        fs.closeSync(fd);
        pdfReadable = buf.toString('ascii').startsWith('%PDF-');
      } catch (e) {
        pdfReadable = false;
      }
    }

    // 2. Query book_pages
    const pagesRes = await db.query(
      `SELECT page_number, char_count, LENGTH(raw_text) as byte_len, raw_text
       FROM book_pages 
       WHERE book_id = $1 
       ORDER BY page_number ASC`,
      [b.id]
    );
    const pages = pagesRes.rows;
    const totalPagesDb = pages.length;

    let emptyPages = [];
    let shortPages = []; // < 100 characters (often covers, blank pages, or failed OCR)
    let totalChars = 0;

    pages.forEach(p => {
      const txt = (p.raw_text || '').trim();
      const cLen = txt.length;
      totalChars += cLen;
      if (cLen === 0) {
        emptyPages.push(p.page_number);
      } else if (cLen < 100) {
        shortPages.push({ page: p.page_number, len: cLen, snippet: txt.slice(0, 40) });
      }
    });

    const avgCharsPerPage = totalPagesDb > 0 ? Math.round(totalChars / totalPagesDb) : 0;

    // 3. Query book_chunks
    const chunksRes = await db.query(
      `SELECT id, chapter_id, page_number, chunk_index, LENGTH(content) as char_len, content
       FROM book_chunks 
       WHERE book_id = $1 
       ORDER BY page_number ASC, chunk_index ASC`,
      [b.id]
    );
    const chunks = chunksRes.rows;
    const totalChunks = chunks.length;

    let unassignedChunks = chunks.filter(c => !c.chapter_id);
    let shortChunks = chunks.filter(c => (c.content || '').trim().length < 80);
    let avgChunkLen = totalChunks > 0 ? Math.round(chunks.reduce((sum, c) => sum + (c.char_len || 0), 0) / totalChunks) : 0;

    // 4. Query book_chapters
    const chaptersRes = await db.query(
      `SELECT id, chapter_number, start_page, end_page, title_ar, title_en
       FROM book_chapters 
       WHERE book_id = $1 
       ORDER BY chapter_number ASC`,
      [b.id]
    );
    const chapters = chaptersRes.rows;

    // Determine unmapped page ranges
    let unmappedPages = [];
    pages.forEach(p => {
      const pNum = p.page_number;
      const inChapter = chapters.some(ch => pNum >= (ch.start_page || 1) && pNum <= (ch.end_page || 1));
      if (!inChapter) {
        unmappedPages.push(pNum);
      }
    });

    // 5. Inspect Content Quality / OCR Fidelity Samples
    // Sample 3 representative pages (beginning, middle, end)
    const sampleIndices = [
      Math.min(5, pages.length - 1),
      Math.floor(pages.length / 2),
      Math.max(0, pages.length - 5)
    ];
    const samples = [];
    sampleIndices.forEach(idx => {
      if (pages[idx]) {
        const p = pages[idx];
        const raw = p.raw_text || '';
        // Check for common OCR corruption issues
        const hasArabic = /[\u0600-\u06FF]/.test(raw);
        const hasLatin = /[a-zA-Z]/.test(raw);
        const hasNumbers = /[0-9\u0660-\u0669]/.test(raw);
        const hasQuestionMarks = raw.includes('?') || raw.includes('؟');
        const suspiciousReplacementChars = (raw.match(/\uFFFD|\?{3,}/g) || []).length;

        samples.push({
          pageNumber: p.page_number,
          charCount: raw.length,
          hasArabic,
          hasLatin,
          hasNumbers,
          hasQuestionMarks,
          suspiciousChars: suspiciousReplacementChars > 0,
          preview: raw.slice(0, 150).replace(/\s+/g, ' ')
        });
      }
    });

    // Determine Reliability Rating
    let reliability = 'RELIABLE';
    let issues = [];

    if (!pdfExists || !pdfReadable) {
      reliability = 'CRITICAL_MISSING_PDF';
      issues.push('Original PDF file is missing or unreadable');
    }
    if (emptyPages.length > 5) {
      issues.push(`${emptyPages.length} completely empty pages detected`);
      reliability = 'DEGRADED';
    }
    if (avgCharsPerPage < 150) {
      issues.push(`Suspiciously low average characters per page (${avgCharsPerPage})`);
      reliability = 'DEGRADED';
    }
    if (unassignedChunks.length > 0) {
      issues.push(`${unassignedChunks.length} chunks lack chapter assignment`);
    }
    if (chapters.length === 0) {
      issues.push('Zero educational chapters mapped in book_chapters');
      reliability = 'CRITICAL_NO_CHAPTERS';
    }

    const bookSummary = {
      bookId: b.id,
      titleAr: b.title_ar,
      titleEn: b.title_en,
      stage: b.stage_ar,
      grade: b.grade_ar,
      subject: b.subject_ar,
      term: b.term,
      schoolType: b.school_type,
      pdfStatus: {
        exists: pdfExists,
        readable: pdfReadable,
        path: pdfPath,
        sizeMB: (pdfSizeBytes / (1024 * 1024)).toFixed(2)
      },
      pageStats: {
        totalInDb: totalPagesDb,
        totalPagesMeta: b.total_pages,
        totalChars,
        avgCharsPerPage,
        emptyPagesCount: emptyPages.length,
        emptyPagesList: emptyPages,
        shortPagesCount: shortPages.length
      },
      chunkStats: {
        totalChunks,
        avgChunkLen,
        unassignedChunksCount: unassignedChunks.length,
        shortChunksCount: shortChunks.length
      },
      chapterStats: {
        totalChapters: chapters.length,
        chapters: chapters.map(c => ({
          num: c.chapter_number,
          titleAr: c.title_ar,
          start: c.start_page,
          end: c.end_page
        })),
        unmappedPagesCount: unmappedPages.length,
        unmappedPagesList: unmappedPages
      },
      samples,
      reliability,
      issues
    };

    auditReport.push(bookSummary);
  }

  // Save audit report to JSON
  fs.writeFileSync(
    path.resolve(process.cwd(), 'scripts', 'phase4e_audit_report.json'),
    JSON.stringify(auditReport, null, 2),
    'utf-8'
  );

  console.log('\n========================================================================');
  console.log('📊 AUDIT SUMMARY TABLE FOR ALL 13 TEXTBOOKS');
  console.log('========================================================================\n');

  console.table(auditReport.map(r => ({
    Book: r.titleAr.slice(0, 28),
    Grade: r.grade,
    Subject: r.subject,
    PDF_OK: r.pdfStatus.readable ? `YES (${r.pdfStatus.sizeMB}MB)` : 'NO',
    Pages: `${r.pageStats.totalInDb} (Empty:${r.pageStats.emptyPagesCount})`,
    AvgChars: r.pageStats.avgCharsPerPage,
    Chunks: `${r.chunkStats.totalChunks} (Unasg:${r.chunkStats.unassignedChunksCount})`,
    Chapters: `${r.chapterStats.totalChapters} (UnmapPgs:${r.chapterStats.unmappedPagesCount})`,
    Status: r.reliability
  })));

  console.log(`\nDetailed report written to server/scripts/phase4e_audit_report.json`);
  process.exit(0);
}

auditBooks().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
