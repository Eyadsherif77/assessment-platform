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

  // 4. Remove Western mojibake runs (like á«FGôKEG áeƒ∏©e)
  s = s.replace(/[a-zA-Z«»∏©ƒ•]{2,}(?:\s+[a-zA-Z«»∏©ƒ•]{2,})*/g, '');

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
