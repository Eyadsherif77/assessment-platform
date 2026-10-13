import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { GeminiClient } from '../dist/services/ai/geminiClient.js';

const targetBookId = '81b8a308-7fcf-4938-8c45-aa0056624f32';

async function checkKeyPages() {
  const diskPdfPath = path.resolve(process.cwd(), `uploads/book_${targetBookId}.pdf`);
  const pdfBuf = fs.readFileSync(diskPdfPath);
  const srcDoc = await PDFDocument.load(pdfBuf);
  const totalPages = srcDoc.getPageCount();
  console.log(`Total PDF Pages: ${totalPages}`);

  // Let's check pages: 6, 7, 27, 28, 57, 58, 81, 82, 98, 99, 100, 106 (1-based)
  const testPages = [6, 7, 27, 28, 57, 58, 81, 82, 98, 99, 105, 106];
  
  for (const pNum of testPages) {
    const singleDoc = await PDFDocument.create();
    const copied = await singleDoc.copyPages(srcDoc, [pNum - 1]);
    singleDoc.addPage(copied[0]);
    const b64 = Buffer.from(await singleDoc.save()).toString('base64');
    
    const res = await GeminiClient.generateContent({
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: b64 } },
        { text: `حدد عنوان هذه الصفحة (صفحة PDF رقم ${pNum}) ورقم الصفحة المطبوع في أسفلها، والوحدة أو الدرس أو المراجعة التابعة لها، ولخص محتواها في سطرين.` }
      ],
      temperature: 0.1
    });
    console.log(`=== PDF Page ${pNum} ===\n${res.trim()}\n`);
  }
}

checkKeyPages().catch(console.error);
