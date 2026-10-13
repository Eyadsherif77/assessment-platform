import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

const targetBookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9';

async function verifySocialPageOffsets() {
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${targetBookId}.pdf`);
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);

  // Test pages 1 to 12
  for (let p of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const singleDoc = await PDFDocument.create();
    const copied = await singleDoc.copyPages(srcDoc, [p - 1]);
    singleDoc.addPage(copied[0]);
    const bytes = await singleDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');

    const reply = await GeminiClient.generateContent({
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: b64 } },
        { text: 'ما هو رقم الصفحة المطبوع أسفل أو أعلى الصفحة؟ وما هو عنوان الدرس أو المحتوى؟ بصيغة: PRINTED_PAGE: <num> | TITLE: <title>' }
      ],
      temperature: 0.1
    });

    console.log(`[PDF Index ${p}]: ${reply.trim().replace(/\n/g, ' ')}`);
  }
}

verifySocialPageOffsets().catch(console.error);
