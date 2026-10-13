import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

async function testUnitBoundaries() {
  const diskPdfPath = path.resolve(process.cwd(), 'uploads/book_d7bbfca2-6d8f-461b-8e39-2015981e86ec.pdf');
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);

  // Test candidate boundary pages: PDF 39, 40, 41 (Unit 2 start) and PDF 62, 63, 64 (Unit 3 start) and PDF 86, 87, 88 (Unit 4 start)
  const candidatePages = [39, 40, 41, 62, 63, 64, 86, 87, 88];

  for (const p of candidatePages) {
    const singleDoc = await PDFDocument.create();
    const copied = await singleDoc.copyPages(srcDoc, [p - 1]);
    singleDoc.addPage(copied[0]);
    const bytes = await singleDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const reply = await GeminiClient.generateContent({
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: b64 } },
        { text: 'Identify: Printed page number at bottom/top, and any Unit / Lesson header.' }
      ],
      temperature: 0.1
    });

    console.log(`[PDF Index ${p}]: ${reply.trim().replace(/\n/g, ' ')}`);
  }
}

testUnitBoundaries().catch(console.error);
