import { PDFDocument } from 'pdf-lib';
import { GeminiClient, GeminiProviderError } from './geminiClient.js';
import { cleanArabicText } from '../../utils/arabicTextNormalizer.js';

export interface PageOcrResult {
  pageNumber: number;
  text: string;
  charCount: number;
  modelUsed?: string;
  isScannedOrLowText: boolean;
  status: 'EXTRACTED' | 'FAILED_RETRYABLE' | 'FAILED_FATAL';
  error?: string;
}

export class GeminiOcrService {
  private static readonly LOW_TEXT_THRESHOLD_CHARS = 35;

  /**
   * Determine whether a page requires OCR fallback based on extracted character count
   */
  public static isLowTextPage(charCount: number): boolean {
    return charCount < this.LOW_TEXT_THRESHOLD_CHARS;
  }

  /**
   * Slice a single page from a full PDF buffer into a standalone, isolated 1-page PDF document
   */
  public static async extractSinglePagePdf(
    fullPdfBuffer: Buffer,
    pageNumber: number
  ): Promise<Buffer> {
    const srcDoc = await PDFDocument.load(fullPdfBuffer);
    const totalPages = srcDoc.getPageCount();

    if (pageNumber < 1 || pageNumber > totalPages) {
      throw new Error(`Page number ${pageNumber} is out of bounds (1 to ${totalPages})`);
    }

    const singleDoc = await PDFDocument.create();
    const [copiedPage] = await singleDoc.copyPages(srcDoc, [pageNumber - 1]);
    singleDoc.addPage(copiedPage);

    const savedBytes = await singleDoc.save();
    return Buffer.from(savedBytes);
  }

  /**
   * Execute authentic multimodal OCR extraction for a single scanned textbook page
   * using the platform's active Gemini client and verified candidate models.
   */
  public static async ocrPage(params: {
    bookId: string;
    pageNumber: number;
    fullPdfBuffer: Buffer;
    timeoutMs?: number;
  }): Promise<PageOcrResult> {
    const { bookId, pageNumber, fullPdfBuffer, timeoutMs = 25000 } = params;

    try {
      const singlePageBuffer = await this.extractSinglePagePdf(fullPdfBuffer, pageNumber);
      const base64Data = singlePageBuffer.toString('base64');

      const systemInstruction = `أنت محرك التعرف الضوئي على النصوص (OCR) الأكاديمي المتخصص في المناهج التعليمية والكتب المدرسية.
مهمتك استخراج كامل النص التعليمي المقروء، العناوين، المفاهيم، القوانين، المعادلات الرياضية والكيميائية، والأسئلة الموجودة في صفحة الكتاب بدقة متناهية.
- حافظ على النص العربي الأصلي والتنسيق وعلامات الترقيم والمصطلحات الإنجليزية بدقة.
- استخرج محتوى الجداول والمخططات التوضيحية بصيغة نصية واضحة.
- لا تضف أي مقدمات أو شروحات أو عبارات مثل "إليك النص المستخرج". أخرج المحتوى التعليمي المستخرج مباشرة.`;

      const prompt = `استخرج كامل النص التعليمي الموجود في الصفحة رقم ${pageNumber} من هذا الكتاب المدرسي بدقة تامة.`;

      const rawResponse = await GeminiClient.generateContent({
        systemInstruction,
        prompt,
        parts: [
          {
            inline_data: {
              mime_type: 'application/pdf',
              data: base64Data
            }
          }
        ],
        temperature: 0.1,
        timeoutMs,
        context: {
          bookId,
          callPurpose: 'OCR_PAGE_EXTRACTION',
          workflow: 'TEXTBOOK_INGESTION'
        }
      });

      const cleaned = cleanArabicText(rawResponse.trim());

      return {
        pageNumber,
        text: cleaned,
        charCount: cleaned.length,
        isScannedOrLowText: cleaned.length < this.LOW_TEXT_THRESHOLD_CHARS,
        status: 'EXTRACTED'
      };
    } catch (err: any) {
      const isRetryable =
        err instanceof GeminiProviderError
          ? err.category === 'TEMPORARY_OVERLOAD' ||
            err.category === 'TIMEOUT' ||
            err.category === 'QUOTA_EXHAUSTED'
          : err.name === 'AbortError' || err.code === 'ETIMEDOUT';

      console.warn(`⚠️ [GeminiOcrService] OCR failed for page ${pageNumber} (retryable: ${isRetryable}): ${err.message}`);

      return {
        pageNumber,
        text: '',
        charCount: 0,
        isScannedOrLowText: true,
        status: isRetryable ? 'FAILED_RETRYABLE' : 'FAILED_FATAL',
        error: err.message
      };
    }
  }
}
