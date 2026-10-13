import assert from 'assert';
import { GeminiClient } from '../dist/services/ai/geminiClient.js';
import { aiRagEngine } from '../dist/services/ai/aiRagEngine.js';

console.log('PHASE 4G.3AO — model cooldown & bounded candidate verification (isolated, no DB writes)\n');

const mkQ = (id, text, bookId = 'book-A') => ({
  id, book_id: bookId, chapter_id: 'ch-1', chunk_id: 'c1', question_text: text,
  options: [1, 2, 3, 4].map(i => ({ id: `${id}-${i}`, text: `خيار ${i} ${id}`, is_correct: i === 1 })),
  difficulty: 'MEDIUM', bloom_level: 'KNOWLEDGE', page_reference: 1, source_excerpt: '', explanation: '', chunk_text: 'نص'
});

// ---- Test 1: quota-exhausted model is skipped on later calls (no wasted round-trips) ----
{
  process.env.GEMINI_API_KEY = 'dummy_key_for_test';
  const origFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    const model = String(url).match(/models\/([^:]+):/)[1];
    calls.push(model);
    if (model === 'gemini-3.5-flash' || model === 'gemini-3.6-flash') {
      return { ok: false, status: 429, json: async () => ({ error: { message: 'quota' } }) };
    }
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) };
  };
  GeminiClient.modelCooldownUntil.clear();
  const r1 = await GeminiClient.generateContent({ prompt: 'x' });
  const first = [...calls]; calls.length = 0;
  const r2 = await GeminiClient.generateContent({ prompt: 'x' });
  assert.strictEqual(r1, 'ok'); assert.strictEqual(r2, 'ok');
  assert.deepStrictEqual(first.slice(0, 3), ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite']);
  assert.deepStrictEqual(calls, ['gemini-3.1-flash-lite'], 'second call must skip cooling models');
  console.log('  [PASS] 1. 429 models enter cooldown and are skipped on the next call');

  // ---- Test 2: when every model is cooling, bounded failover still tries them (no deadlock) ----
  for (const m of GeminiClient.candidateModels) GeminiClient.modelCooldownUntil.set(m, Date.now() + 60000);
  calls.length = 0;
  const r3 = await GeminiClient.generateContent({ prompt: 'x' });
  assert.strictEqual(r3, 'ok');
  assert.ok(calls.length >= 1 && calls.length <= GeminiClient.candidateModels.length);
  console.log('  [PASS] 2. All-cooling state falls back to bounded full failover');

  // ---- Test 3: 401/403 still fast-fails after cooldown change ----
  GeminiClient.modelCooldownUntil.clear();
  calls.length = 0;
  global.fetch = async (url) => { calls.push(1); return { ok: false, status: 403, json: async () => ({ error: { message: 'denied' } }) }; };
  await assert.rejects(() => GeminiClient.generateContent({ prompt: 'x' }), /GEMINI_AUTH_ERROR/);
  assert.strictEqual(calls.length, 1);
  console.log('  [PASS] 3. Auth errors still fast-fail on first call');

  // ---- Test 4: parallel callers are staggered, not bursted ----
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) });
  const t0 = Date.now();
  await Promise.all([1, 2, 3, 4].map(() => GeminiClient.generateContent({ prompt: 'x' })));
  assert.ok(Date.now() - t0 >= 500, 'pacing slots must be reserved for parallel callers');
  console.log('  [PASS] 4. Parallel calls reserve distinct pacing slots');
  global.fetch = origFetch;
}

// ---- Test 5: batch verifier — dup / seen / cross-book / fail-closed, never exceeds `needed` ----
{
  const existing = [mkQ('e1', 'ما عاصمة مصر القديمة في العصر الفرعوني؟')];
  const raw = [
    mkQ('d1', 'ما عاصمة مصر القديمة في العصر الفرعوني؟'),        // duplicate of existing
    mkQ('s1', 'سؤال شاهده الطالب سابقا عن محمد علي'),            // seen by student
    mkQ('x1', 'سؤال من كتاب آخر تماما عن الجغرافيا', 'book-OTHER') // cross-book -> provenance BOOK_MISMATCH
  ];
  const out = await aiRagEngine.verifyCandidateBatch({
    rawQuestions: raw, bookId: 'book-A', chapterId: 'ch-1', chunks: [], existing,
    contextWords: new Set(['عاصمة', 'مصر', 'محمد', 'علي', 'الجغرافيا']), needed: 2,
    isSeenByStudent: q => q.id === 's1', label: 'TEST', concurrency: 4
  });
  assert.deepStrictEqual(out, [], 'duplicates, seen and cross-book candidates must never be accepted');
  console.log('  [PASS] 5. Duplicate / already-seen / cross-book candidates rejected (fail-closed, 0 accepted)');
}

console.log('\nALL PHASE 4G.3AO TESTS PASSED (5/5)');
process.exit(0);
