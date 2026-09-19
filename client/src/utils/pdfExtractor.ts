import * as pdfjsLib from 'pdfjs-dist';

// Use standard CDN worker matching installed version to avoid complex bundler worker configs
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export async function extractTextFromPdf(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<ExtractedPage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
    cMapPacked: true
  });

  const doc = await loadingTask.promise;
  const totalPages = doc.numPages;
  const pages: ExtractedPage[] = [];

  for (let i = 1; i <= totalPages; i++) {
    try {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (pageText.length > 0) {
        pages.push({
          pageNumber: i,
          text: pageText
        });
      }
    } catch (pageErr) {
      console.warn(`Error extracting page ${i}:`, pageErr);
    }

    if (onProgress) {
      onProgress(i, totalPages);
    }
  }

  return pages;
}

export async function extractTextFromTxt(file: File): Promise<ExtractedPage[]> {
  const content = await file.text();
  const pageSize = 1500;
  const pages: ExtractedPage[] = [];
  let current = 0;
  let pNum = 1;

  while (current < content.length) {
    const chunk = content.slice(current, current + pageSize).trim();
    if (chunk.length > 0) {
      pages.push({ pageNumber: pNum++, text: chunk });
    }
    current += pageSize;
  }

  return pages.length > 0 ? pages : [{ pageNumber: 1, text: content.trim() }];
}
