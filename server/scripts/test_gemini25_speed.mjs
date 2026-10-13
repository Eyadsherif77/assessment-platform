import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  const diskPdfPath = path.resolve(process.cwd(), 'uploads/book_21e1d639-9f59-4a58-a8f8-8373b8e7fc90.pdf');
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);
  
  // Extract page 105
  const subDoc = await PDFDocument.create();
  const [p] = await subDoc.copyPages(srcDoc, [104]); // index 104 is page 105
  subDoc.addPage(p);
  const bytes = await subDoc.save();
  const b64 = Buffer.from(bytes).toString('base64');

  const t0 = Date.now();
  console.log('Testing gemini-2.5-flash on PDF Page 105...');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: b64 } },
          { text: 'Extract all educational text verbatim from this page as JSON: {"page_number": 105, "text": "..."}' }
        ]
      }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  const data = await res.json();
  const dur = Date.now() - t0;
  console.log(`gemini-2.5-flash finished in ${dur}ms!`);
  console.log('Result preview:', data.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 300));
}

main().catch(console.error);
