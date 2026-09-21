/**
 * Comprehensive Arabic Text Cleaner and Normalizer
 * Resolves PDF font encoding anomalies, font ligature artifacts (e.g. CJK Unicode points),
 * Presentation Forms A/B, replacement characters, and disconnected glyphs.
 */
export function cleanArabicText(text: string): string {
  if (!text) return '';

  let s = text.normalize('NFKC');

  // 1. Replace CJK and Private Use Area glyphs mapped from custom Egyptian textbook font ligatures (shaddah / harakat)
  // In fonts like Lotus/Amiri/Traditional Arabic, shaddah combinations map to \u4E00-\u9FFF or \u3400-\u4DBF
  s = s.replace(/[\u4E00-\u9FFF\u3400-\u4DBF]/g, 'ّ');

  // 2. Remove Unicode replacement character (diamond question mark \uFFFD)
  s = s.replace(/\uFFFD/g, '');

  // 3. Remove duplicate consecutive shaddahs or tashkeel
  s = s.replace(/ّ+/g, 'ّ');

  // 4. Remove Western mojibake artifacts (e.g. sequences containing «»∏©ƒ•) without stripping standard English textbook words
  s = s.replace(/[^\s]*[«»∏©ƒ•][^\s]*/g, '');

  // 5. Remove excessive tatweel (kashida ـ)
  s = s.replace(/ـ+/g, '');

  // 6. Fix common disconnected Arabic digraphs caused by PDF font decoders
  s = s.replace(/ل\s*َ?\s*ا/g, 'لا');
  s = s.replace(/ل\s*َ?\s*إ/g, 'لإ');
  s = s.replace(/ل\s*َ?\s*أ/g, 'لأ');
  s = s.replace(/ل\s*َ?\s*آ/g, 'لآ');
  s = s.replace(/ال\s+([أإآا-ي])/g, 'ال$1');
  s = s.replace(/([أإآا-ي])\s+([ًٌٍَُِّْ])/g, '$1$2');

  // 7. Filter out vertical decorative sidebar clutter (lines composed of isolated 1-2 letter fragments)
  const lines = s.split(/\r?\n/).map(l => l.trim()).filter(l => {
    if (!l || l.length < 2) return false;
    const words = l.split(/\s+/);
    // If a line is long but every word is 1 or 2 letters, it is decorative vertical sidebar noise
    if (words.length >= 4 && words.every(w => w.length <= 2)) return false;
    return true;
  });

  // 8. Clean up whitespace
  return lines
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

/**
 * Strips all document metadata, structure labels, and publishing noise:
 * - Page numbers (e.g. Page 11, صفحة 11, [صفحة 4], standalone digit lines)
 * - Headers / Footers
 * - Unit, Chapter, and Lesson numbers and labels
 * - Section labels
 * - Table of contents entries and dotted lines
 * - Repeated book titles / publisher text / ISBN / copyright
 * - File names (.pdf, .docx)
 */
export function stripDocumentMetadataAndStructure(
  text: string,
  options?: { bookTitle?: string; chapterTitle?: string }
): string {
  if (!text) return '';

  let cleaned = cleanArabicText(text);

  // 1. Remove file names (e.g. Science_G7.pdf, book.docx)
  cleaned = cleaned.replace(/[a-zA-Z0-9_\u0600-\u06FF\-\.]+\.(?:pdf|docx|doc|epub|pptx|xlsx)\b/gi, '');

  // 2. Remove standard publisher / legal / committee boilerplate lines
  const boilerplateRegexes: RegExp[] = [
    /وزارة\s+التربية\s+والتعليم(?:\s+والتعليم\s+الفني)?/gi,
    /قطاع\s+الكتب/gi,
    /الإدارة\s+المركزية\s+لتطوير\s+المناهج/gi,
    /مكتب\s+مستشار\s+مادة[^\n]+/gi,
    /لجنة\s+(?:الإعداد|التأليف|المراجعة|التطوير)[^\n]*/gi,
    /حقوق\s+(?:الطبع|النشر)\s+محفوظة[^\n]*/gi,
    /رقم\s+الإيداع[^\n]*/gi,
    /دار\s+الكتب\s+والوثائق[^\n]*/gi,
    /طبعة\s+عام\s+\d{4}(?:\/\d{4})?/gi,
    /طبعة\s+\d{4}(?:\/\d{4})?/gi,
    /ISBN\s*[:\-]?\s*[\d\-]+/gi,
    /مقدمة\s+(?:الناشر|الكتاب|المؤلفين)[^\n]*/gi,
    /دليل\s+(?:المعلم|ولي\s+الأمر)[^\n]*/gi,
    /جمهورية\s+مصر\s+العربية/gi,
    /كتاب\s+الطالب(?:\s+والأنشطة)?/gi,
    /الصف\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس)\s+الإعدادي/gi,
    /الفصل\s+الدراسي\s+(?:الأول|الثاني)/gi,
    /العام\s+الدراسي\s+[\d\/\-\s]+/gi,
    /مكتب\s+تنمية\s+مادة[^\n]*/gi,
    /مركز\s+تطوير\s+المناهج[^\n]*/gi
  ];

  for (const rx of boilerplateRegexes) {
    cleaned = cleaned.replace(rx, '');
  }

  // If specific book title or chapter title provided, remove exact occurrences from headers
  if (options?.bookTitle && options.bookTitle.length > 3) {
    const escapedBookTitle = options.bookTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(escapedBookTitle, 'gi'), '');
  }
  if (options?.chapterTitle && options.chapterTitle.length > 3) {
    const escapedChTitle = options.chapterTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(escapedChTitle, 'gi'), '');
  }

  // 3. Process line-by-line to remove structural headers, page numbers, and labels
  const rawLines = cleaned.split(/\r?\n/);
  const preservedLines: string[] = [];

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Filter out dotted lines or TOC entries (e.g. "...... 14" or "الدرس الأول ........... 25")
    if (/\.{3,}|\u2026{2,}/.test(line)) continue;

    // Filter out standalone page numbers or page number indicators:
    // "Page 11", "page 11", "صفحة 11", "ص 11", "[صفحة 4]", "--- Page 4 ---", "11", "- 11 -"
    if (/^(?:---|\[|\()?\s*(?:Page|page|صفحة|ص)\s*\d+\s*(?:---|\]|\))?$/i.test(line)) continue;
    if (/^[\-–—\(\[\{]?\s*\d{1,4}\s*[\-–—\)\]\}]?$/.test(line)) continue;

    // Filter out unit labels (e.g. "Unit 1", "الوحدة الأولى", "الوحدة 1")
    if (/^(?:Unit|unit)\s*\d+/i.test(line) || /^الوحدة\s+(?:الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة|\d+)/i.test(line)) continue;

    // Filter out chapter labels (e.g. "Chapter 1", "الفصل الأول", "الفصل 1", "الباب الأول")
    if (/^(?:Chapter|chapter)\s*\d+/i.test(line) || /^(?:الفصل|الباب)\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|\d+)/i.test(line)) continue;

    // Filter out lesson labels (e.g. "Lesson 2", "الدرس الثاني", "الدرس 1")
    if (/^(?:Lesson|lesson)\s*\d+/i.test(line) || /^الدرس\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|\d+)/i.test(line)) continue;

    // Filter out section / topic structural labels (e.g. "Section 1", "المبحث الأول", "الموضوع الأول")
    if (/^(?:Section|section)\s*\d+/i.test(line) || /^(?:المبحث|الموضوع|المحور)\s+(?:الأول|الثاني|الثالث|\d+)/i.test(line)) continue;

    // Filter out table of contents headers
    if (/^(?:الفهرس|المحتويات|قائمة\s+المحتويات|Table\s+of\s+Contents|Contents)$/i.test(line)) continue;

    // Inline cleanup of residual page prefixes inside sentences: e.g. "صفحة 14: " or "[Page 12]"
    const sanitizedLine = line
      .replace(/(?:---|\[|\()?\s*(?:Page|page|صفحة|ص)\s*\d+\s*(?:---|\]|\))?\s*[:\-–]?\s*/gi, '')
      .replace(/^(?:Unit|الوحدة|Chapter|الفصل|Lesson|الدرس|Section|المبحث)\s*[\d\u0600-\u06FF]+\s*[:\-–]?\s*/gi, '')
      .trim();

    if (sanitizedLine.length > 0) {
      preservedLines.push(sanitizedLine);
    }
  }

  return preservedLines.join('\n').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}

