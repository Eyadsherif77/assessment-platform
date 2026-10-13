import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

const targetBookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9';

async function verifyBoundaries() {
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${targetBookId}.pdf`);
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);

  const testPages = [28, 29, 64, 65, 92, 93];

  for (let p of testPages) {
    const singleDoc = await PDFDocument.create();
    const copied = await singleDoc.copyPages(srcDoc, [p - 1]);
    singleDoc.addPage(copied[0]);
    const bytes = await singleDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const reply = await GeminiClient.generateContent({
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: b64 } },
        { text: 'حدد: رقم الصفحة المطبوع، وعنوان الوحدة أو الدرس.' }
      ],
      temperature: 0.1
    });

    console.log(`[PDF Index ${p}]: ${reply.trim().replace(/\n/g, ' ')}`);
  }
}

verifyBoundaries().catch(console.error);
