import assert from 'assert';
import { aiRagEngine } from '../dist/services/ai/aiRagEngine.js';

console.log('PHASE 4G.3AO â€” model cooldown & bounded candidate verification (isolated, no DB writes)\n');

const mkQ = (id, text, bookId = 'book-A') => ({
  id, book_id: bookId, chapter_id: 'ch-1', chunk_id: 'c1', question_text: text,
  options: [1, 2, 3, 4].map(i => ({ id: `${id}-${i}`, text: `Ø®ÙŠØ§Ø± ${i} ${id}`, is_correct: i === 1 })),
  difficulty: 'MEDIUM', bloom_level: 'KNOWLEDGE', page_reference: 1, source_excerpt: '', explanation: '', chunk_text: 'Ù†Øµ'
});

// ---- Test 1: batch verifier â€” dup / seen / cross-book / fail-closed, never exceeds `needed` ----
{
  const existing = [mkQ('e1', 'Ù…Ø§ Ø¹Ø§ØµÙ…Ø© Ù…ØµØ± Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø© ÙÙŠ Ø§Ù„Ø¹ØµØ± Ø§Ù„ÙØ±Ø¹ÙˆÙ†ÙŠØŸ')];
  const raw = [
    mkQ('d1', 'Ù…Ø§ Ø¹Ø§ØµÙ…Ø© Ù…ØµØ± Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø© ÙÙŠ Ø§Ù„Ø¹ØµØ± Ø§Ù„ÙØ±Ø¹ÙˆÙ†ÙŠØŸ'),        // duplicate of existing
    mkQ('s1', 'Ø³Ø¤Ø§Ù„ Ø´Ø§Ù‡Ø¯Ù‡ Ø§Ù„Ø·Ø§Ù„Ø¨ Ø³Ø§Ø¨Ù‚Ø§ Ø¹Ù† Ù…Ø­Ù…Ø¯ Ø¹Ù„ÙŠ'),            // seen by student
    mkQ('x1', 'Ø³Ø¤Ø§Ù„ Ù…Ù† ÙƒØªØ§Ø¨ Ø¢Ø®Ø± ØªÙ…Ø§Ù…Ø§ Ø¹Ù† Ø§Ù„Ø¬ØºØ±Ø§ÙÙŠØ§', 'book-OTHER') // cross-book -> provenance BOOK_MISMATCH
  ];
  const out = await aiRagEngine.verifyCandidateBatch({
    rawQuestions: raw, bookId: 'book-A', chapterId: 'ch-1', chunks: [], existing,
    contextWords: new Set(['Ø¹Ø§ØµÙ…Ø©', 'Ù…ØµØ±', 'Ù…Ø­Ù…Ø¯', 'Ø¹Ù„ÙŠ', 'Ø§Ù„Ø¬ØºØ±Ø§ÙÙŠØ§']), needed: 2,
    isSeenByStudent: q => q.id === 's1', label: 'TEST', concurrency: 4
  });
  assert.deepStrictEqual(out, [], 'duplicates, seen and cross-book candidates must never be accepted');
  console.log('  [PASS] 1. Duplicate / already-seen / cross-book candidates rejected (fail-closed, 0 accepted)');
}

console.log('\nALL PHASE 4G.3AO TESTS PASSED (1/1)');
process.exit(0);

