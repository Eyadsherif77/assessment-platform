import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function verifyMultimodalModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const diskPdfPath = path.resolve(process.cwd(), 'uploads/book_d7bbfca2-6d8f-461b-8e39-2015981e86ec.pdf');
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);

  // Slice exactly page 4 (the Contents page)
  const singleDoc = await PDFDocument.create();
  const copied = await singleDoc.copyPages(srcDoc, [3]); // PDF 0-index 3 = Page 4
  singleDoc.addPage(copied[0]);
  const pageBytes = await singleDoc.save();
  const pageB64 = Buffer.from(pageBytes).toString('base64');

  const modelsToTest = [
    'gemini-2.5-flash',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-flash-latest'
  ];

  console.log('======================================================================');
  console.log('🧪 MULTIMODAL OCR MODEL VERIFICATION (PAGE 4 / CONTENTS PAGE)');
  console.log('======================================================================\n');

  for (const model of modelsToTest) {
    const payload = {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: 'application/pdf', data: pageB64 } },
            { text: 'Extract the title or headline of this page and list 2 items on it.' }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 200
      }
    };

    const t0 = Date.now();
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const t1 = Date.now();
      const status = res.status;

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log(`✅ [${model}]: HTTP ${status} (${t1 - t0}ms)`);
        console.log(`   Sample OCR: "${text.trim().slice(0, 100).replace(/\n/g, ' ')}..."\n`);
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.log(`❌ [${model}]: HTTP ${status} (${t1 - t0}ms) - ${errJson.error?.message || 'Error'}\n`);
      }
    } catch (err) {
      console.log(`💥 [${model}]: Exception: ${err.message}\n`);
    }

    // Rate limiter delay
    await new Promise(r => setTimeout(r, 2000));
  }
}

verifyMultimodalModels().catch(console.error);
