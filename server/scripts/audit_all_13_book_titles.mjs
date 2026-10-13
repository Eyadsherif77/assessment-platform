import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { db } from '../dist/db/db.js';
import { PDFDocument } from 'pdf-lib';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

async function main() {
  console.log('========================================================================');
  console.log('🔍 AUDIT ALL 13 TEXTBOOK TITLES AGAINST LIVE SOURCE PDFS');
  console.log('========================================================================\n');

  const booksRes = await db.query(`
    SELECT 
      b.id,
      b.title_ar,
      b.title_en,
      b.term,
      b.school_type,
      b.total_pages,
      b.file_url,
      b.created_at,
      g.id as grade_id,
      g.name_ar as grade_ar,
      g.name_en as grade_en,
      s.id as subject_id,
      s.name_ar as subject_ar,
      s.name_en as subject_en,
      st.name_ar as stage_ar
    FROM books b
    LEFT JOIN grades g ON b.grade_id = g.id
    LEFT JOIN subjects s ON b.subject_id = s.id
    LEFT JOIN academic_stages st ON b.academic_stage_id = st.id
    ORDER BY g.sort_order ASC, s.sort_order ASC, b.created_at ASC
  `);

  const books = booksRes.rows;
  console.log(`Found ${books.length} books in platform.\n`);

  const comparison = [];

  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    console.log(`[Book ${i + 1}/13] Inspecting ID: ${b.id}`);
    console.log(`  Current DB: title_ar="${b.title_ar}", title_en="${b.title_en}"`);
    console.log(`  Grade: "${b.grade_ar}", Subject: "${b.subject_ar}", Term: ${b.term}`);

    const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${b.id}.pdf`);
    let pdfCoverDetails = { printed_title: 'N/A', full_cover_text: '' };

    if (fs.existsSync(diskPdfPath)) {
      const pdfBuf = fs.readFileSync(diskPdfPath);
      const srcDoc = await PDFDocument.load(pdfBuf);
      
      // Inspect page 1
      const pageDoc = await PDFDocument.create();
      const [copiedPage] = await pageDoc.copyPages(srcDoc, [0]);
      pageDoc.addPage(copiedPage);
      const pageBytes = await pageDoc.save();
      const b64 = Buffer.from(pageBytes).toString('base64');

      const prompt = `Inspect this textbook cover/title page.
Extract:
1. Exact textbook title printed on the cover (Arabic and/or English)
2. Grade/Year printed on the cover
3. Subject printed on the cover
4. Term printed on the cover (Term 1 / Term 2 / First Term)
5. Series name if present (e.g., New Hello!, Science, etc.)

Return JSON:
{
  "exact_title_ar": "...",
  "exact_title_en": "...",
  "printed_subject": "...",
  "printed_grade": "...",
  "printed_term": "..."
}`;

      try {
        const resStr = await GeminiClient.generateContent({
          parts: [
            { inline_data: { mime_type: 'application/pdf', data: b64 } },
            { text: prompt }
          ],
          responseMimeType: 'application/json',
          temperature: 0.1
        });
        pdfCoverDetails = JSON.parse(resStr);
      } catch (err) {
        console.warn(`  ⚠️ Cover inspection warning: ${err.message}`);
      }
    } else {
      console.warn(`  ❌ PDF not found on disk: ${diskPdfPath}`);
    }

    comparison.push({
      num: i + 1,
      id: b.id,
      current_title_ar: b.title_ar,
      current_title_en: b.title_en,
      grade_ar: b.grade_ar,
      subject_ar: b.subject_ar,
      term: b.term,
      pdfCoverDetails
    });

    console.log(`  Cover PDF OCR:`, pdfCoverDetails);
    console.log('------------------------------------------------------------------------');
  }

  fs.writeFileSync('scripts/all_13_books_title_audit.json', JSON.stringify(comparison, null, 2));
  console.log('\nAudit complete! Results written to scripts/all_13_books_title_audit.json');
}

main().catch(console.error);
