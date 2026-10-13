import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import fs from 'fs';

const bookId = 'd7bbfca2-6d8f-461b-8e39-2015981e86ec';

async function auditOcrQuality() {
  console.log(`======================================================================`);
  console.log(`🔬 OCR QUALITY AUDIT ACROSS ALL 102 PAGES (SCIENCE PREP 1)`);
  console.log(`======================================================================\n`);

  const pagesRes = await db.query(
    'SELECT page_number, char_count, raw_text FROM book_pages WHERE book_id = $1 ORDER BY page_number ASC',
    [bookId]
  );
  const pages = pagesRes.rows;

  console.log(`Total Pages Retrieved from DB: ${pages.length}`);

  // 1. Length Distribution & Anomaly Detection
  const shortPages = [];
  const normalPages = [];
  const veryLongPages = [];
  const emptyPages = [];

  for (const p of pages) {
    if (p.char_count === 0) emptyPages.push(p.page_number);
    else if (p.char_count < 100) shortPages.push({ page: p.page_number, chars: p.char_count, text: p.raw_text.trim() });
    else if (p.char_count > 3000) veryLongPages.push({ page: p.page_number, chars: p.char_count });
    else normalPages.push(p.page_number);
  }

  console.log(`- Empty Pages: ${emptyPages.length}`);
  console.log(`- Short Pages (< 100 chars): ${shortPages.length}`);
  shortPages.forEach(s => console.log(`   * Page ${s.page}: ${s.chars} chars -> "${s.text}"`));
  console.log(`- High Density Pages (> 3000 chars): ${veryLongPages.length}`);
  console.log(`- Standard Content Pages (100 - 3000 chars): ${normalPages.length}`);

  // 2. Duplicate Page Content Check
  const textHashes = new Map();
  const duplicates = [];
  for (const p of pages) {
    const snippet = p.raw_text.slice(0, 100).trim();
    if (snippet.length > 30) {
      if (textHashes.has(snippet)) {
        duplicates.push({ page: p.page_number, duplicateOf: textHashes.get(snippet) });
      } else {
        textHashes.set(snippet, p.page_number);
      }
    }
  }
  console.log(`\n- Duplicated Page Content: ${duplicates.length === 0 ? 'ZERO (No duplicates)' : JSON.stringify(duplicates)}`);

  // 3. Concrete OCR Sample Analysis (Terminology, Formulas, Tables)
  console.log(`\n--- [Representative Page Samples Audit] ---`);
  const samplePages = [10, 20, 36, 64, 88];

  const qualitySamples = [];
  for (const pNum of samplePages) {
    const page = pages.find(p => p.page_number === pNum);
    if (!page) continue;

    console.log(`\n[PDF Page ${pNum}] (${page.char_count} chars):`);
    console.log(page.raw_text.slice(0, 400).replace(/\n/g, ' ') + '...');

    qualitySamples.push({
      pdf_page: pNum,
      chars: page.char_count,
      excerpt: page.raw_text.slice(0, 300)
    });
  }

  fs.writeFileSync(
    './scripts/ocr_quality_audit_results.json',
    JSON.stringify({
      total_pages: pages.length,
      empty_pages: emptyPages,
      short_pages: shortPages,
      duplicates: duplicates,
      samples: qualitySamples
    }, null, 2),
    'utf-8'
  );
  console.log(`\n✅ Audit results saved to ./scripts/ocr_quality_audit_results.json`);
}

auditOcrQuality().catch(console.error);
