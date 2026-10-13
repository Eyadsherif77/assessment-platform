import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

const bookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9';
const pdfPath = path.resolve('uploads', `book_${bookId}.pdf`);

async function runAudit() {
  console.log('=== STEP 1: PAGE DISCREPANCY AUDIT ===');
  const pagesRes = await db.query(
    'SELECT page_number, char_count, LENGTH(raw_text) as actual_len FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC',
    [bookId]
  );
  
  console.log(`Total records in book_pages for book ${bookId}: ${pagesRes.rows.length}`);
  const existingPages = new Map();
  for (const r of pagesRes.rows) {
    existingPages.set(r.page_number, r);
  }

  const missingPages = [];
  for (let i = 1; i <= 113; i++) {
    if (!existingPages.has(i)) {
      missingPages.push(i);
    }
  }

  console.log(`Missing PDF page indices in 1..113:`, missingPages);

  // If missing pages exist, let's inspect them in the reconstructed PDF
  if (missingPages.length > 0) {
    console.log(`Inspecting missing pages from PDF file: ${pdfPath}`);
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    console.log(`Reconstructed PDF total pages: ${pdfDoc.getPageCount()}`);

    for (const pNum of missingPages) {
      console.log(`\n--- Inspecting Missing Page Index: ${pNum} ---`);
      // Export single page to a temporary PDF to analyze its text/streams
      const singleDoc = await PDFDocument.create();
      const [copiedPage] = await singleDoc.copyPages(pdfDoc, [pNum - 1]);
      singleDoc.addPage(copiedPage);
      const singleBytes = await singleDoc.save();
      const tmpPath = path.resolve('uploads', `tmp_missing_page_${pNum}.pdf`);
      fs.writeFileSync(tmpPath, singleBytes);

      // Check text using pdf-parse or pdfjs
      try {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const loadingTask = pdfjsLib.getDocument({ data: singleBytes });
        const doc = await loadingTask.promise;
        const page = await doc.getPage(1);
        const textContent = await page.getTextContent();
        const extractedText = textContent.items.map(item => item.str).join(' ').trim();
        console.log(`Page ${pNum} digital text length: ${extractedText.length}`);
        console.log(`Page ${pNum} preview: "${extractedText.substring(0, 200)}"`);
      } catch (err) {
        console.error(`Error reading text of page ${pNum}:`, err.message);
      }
    }
  }

  // Also check character counts distribution
  let emptyOrLowCount = 0;
  for (const [pNum, r] of existingPages.entries()) {
    if (r.char_count < 50) {
      emptyOrLowCount++;
      console.log(`Low char page ${pNum}: char_count = ${r.char_count}, actual_len = ${r.actual_len}`);
    }
  }
  console.log(`Total low-character (<50) pages in DB: ${emptyOrLowCount}`);

  process.exit(0);
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
