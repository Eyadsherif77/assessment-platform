import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

const targetBookId = '81b8a308-7fcf-4938-8c45-aa0056624f32';

async function checkEndPages() {
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${targetBookId}.pdf`);
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);

  const testPages = [25, 26, 55, 56, 79, 80, 96, 97, 100, 101, 102, 103, 104];
  
  for (const pNum of testPages) {
    const singleDoc = await PDFDocument.create();
    const copied = await singleDoc.copyPages(srcDoc, [pNum - 1]);
    singleDoc.addPage(copied[0]);
    const b64 = Buffer.from(await singleDoc.save()).toString('base64');
    
    const res = await GeminiClient.generateContent({
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: b64 } },
        { text: `حدد عنوان صفحة PDF رقم ${pNum} ورقم الصفحة المطبوع فيها إن وجد، وما إذا كانت تتبع وحدة دراسية أو تدريبات وحدة أو مراجعة عامة.` }
      ],
      temperature: 0.1
    });
    console.log(`=== PDF Page ${pNum} ===\n${res.trim()}\n`);
  }
}

checkEndPages().catch(console.error);
