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
  public static readonly LOW_TEXT_THRESHOLD_CHARS = 100;
  public static readonly MIN_EDUCATIONAL_WORDS = 10;

  /**
   * Determine whether a page requires OCR fallback based on extracted character count
   */
  public static isLowTextPage(charCount: number): boolean {
    return charCount < this.LOW_TEXT_THRESHOLD_CHARS;
  }

  /**
   * Evaluates whether a multi-page document is primarily a digital text PDF
   * (containing extractable fonts and selectable text across majority of pages)
   * versus a scanned/image-only document.
   */
  public static isDocumentPrimarilyDigital(pages: { text: string; charCount?: number }[]): boolean {
    if (!pages || pages.length === 0) return false;
    let textPages = 0;
    let totalChars = 0;
    for (const p of pages) {
      const len = p.charCount !== undefined ? p.charCount : (p.text || '').trim().length;
      totalChars += len;
      if (len >= 40) {
        textPages++;
      }
    }
    const ratio = textPages / pages.length;
    return (ratio >= 0.55 && totalChars >= 1200) || totalChars >= 5000;
  }

  /**
   * Comprehensive policy: Determine whether page text is unusable, missing,
   * vector-outlined, or too sparse to represent meaningful curriculum content.
   * Preserves mathematical notation, numbers, variables, and Arabic curriculum terms.
   */
  public static isUnusableOrLowTextPage(
    page: { text: string; charCount?: number },
    isDigitalDocument = false
  ): boolean {
    const text = (page.text || '').trim();
    const threshold = isDigitalDocument ? 25 : this.LOW_TEXT_THRESHOLD_CHARS;

    if (text.length < threshold) {
      return true;
    }

    // In digital textbooks, if a page has at least 25 characters of readable content,
    // it contains genuine titles, formulas, or problem descriptions and does not require OCR.
    if (isDigitalDocument && text.length >= 25) {
      return false;
    }

    // Mathematical and scientific token regex (preserves numbers, operators, equations, variables, Greek/Arabic symbols)
    const mathTokens = text.match(/[\d\w\u0621-\u064A\+\-\*\/=><^√∑∫≤≥≠πθ%#@()\[\]{}]+|[a-zA-Z]+/g) || [];
    if (mathTokens.length >= this.MIN_EDUCATIONAL_WORDS) {
      return false;
    }

    // Check if the extracted text consists only of repetitive page headers, footers, numbers, or punctuation
    const words = text
      .split(/[\s\-–—_.,:;!?'"()\[\]{}«»/\\+=\*&%$#@~<>|]+/)
      .filter(w => w.length > 1);

    if (words.length < this.MIN_EDUCATIONAL_WORDS) {
      return true;
    }

    return false;
  }

  private static cachedDoc: { buffer: Buffer; doc: PDFDocument } | null = null;

  public static async getPdfDoc(fullPdfBuffer: Buffer): Promise<PDFDocument> {
    if (this.cachedDoc && this.cachedDoc.buffer === fullPdfBuffer) {
      return this.cachedDoc.doc;
    }
    const doc = await PDFDocument.load(fullPdfBuffer);
    this.cachedDoc = { buffer: fullPdfBuffer, doc };
    return doc;
  }

  /**
   * Slice a single page from a full PDF buffer into a standalone, isolated 1-page PDF document
   */
  public static async extractSinglePagePdf(
    fullPdfBuffer: Buffer,
    pageNumber: number
  ): Promise<Buffer> {
    const srcDoc = await this.getPdfDoc(fullPdfBuffer);
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
    const { bookId, pageNumber, fullPdfBuffer, timeoutMs = 60000 } = params;

    try {
      const singlePageBuffer = await this.extractSinglePagePdf(fullPdfBuffer, pageNumber);
      const base64Data = singlePageBuffer.toString('base64');

      const systemInstruction = `أنت محرك التعرف الضوئي على النصوص (OCR) الأكاديمي المتخصص في المناهج التعليمية والكتب المدرسية العربية واللغات.
مهمتك استخراج كامل المحتوى التعليمي المقروء في الصفحة بدقة متناهية:
1. استخرج جميع العناوين الرئيسية والفرعية، أسماء الوحدات، أرقام الصفحات الأصلية المطبوعة، وشرح الدروس.
2. استخرج جميع المفاهيم، التعريفات، القوانين، المسائل والتمارين، والمعادلات الرياضية والعلمية بدقة.
3. إذا كانت الصفحة تحتوي على نصوص مرسومة كمنحنيات موجهة (Vector Outlines) أو نصوص داخل جداول أو رسوم توضيحية، اقرأها واستخرجها كاملة.
4. حافظ على المصطلحات الإنجليزية والعربية كما هي تماماً في مدارس اللغات والحكومية (Bilingual / Language Schools).
5. إذا كانت الصفحة فارغة تماماً أو مجرد غلاف بدون نصوص تعليمية، اكتب نصاً موجزاً يوضح ذلك دون اختلاق محتوى.
6. لا تضف أي مقدمات أو هوامش مثل "إليك النص". أخرج المحتوى التعليمي المستخرج مباشرة.`;

      const prompt = `استخرج كامل النص والمحتوى التعليمي الموجود في الصفحة رقم ${pageNumber} من هذا الكتاب المدرسي بدقة تامة.`;

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
