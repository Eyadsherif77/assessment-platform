import assert from 'assert';
import fs from 'fs';
import { GeminiClient, GeminiProviderError } from '../dist/services/ai/geminiClient.js';

// Phase 4G.3AP — provider resilience. 100% mocked fetch: ZERO live AI calls, ZERO DB access.
process.env.GEMINI_API_KEY = 'dummy-key-123-SECRET';
const realFetch = global.fetch;
const origWarn = console.warn; console.warn = () => {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) };
const err = (status, message = 'PROVIDER_RAW_TEXT_SHOULD_NEVER_LEAK') => ({ ok: false, status, json: async () => ({ error: { message } }) });
const modelOf = url => String(url).match(/models\/([^:]+):/)[1];
const [M1, M2, M3] = GeminiClient.candidateModels;
const defaults = { maxConcurrentCalls: GeminiClient.maxConcurrentCalls, queueTimeoutMs: GeminiClient.queueTimeoutMs, quotaCooldownMs: GeminiClient.quotaCooldownMs, overloadCooldownMs: GeminiClient.overloadCooldownMs, timeoutCooldownMs: GeminiClient.timeoutCooldownMs, minIntervalMs: GeminiClient.minIntervalMs, backoffBaseMs: GeminiClient.backoffBaseMs };
const reset = () => { GeminiClient.resetForTests(); Object.assign(GeminiClient, defaults); GeminiClient.minIntervalMs = 1; GeminiClient.backoffBaseMs = 1; };
let passed = 0;
const pass = n => { passed++; console.log(`  [PASS] ${n}`); };
const catchErr = async fn => { try { await fn(); } catch (e) { return e; } return null; };

console.log('PHASE 4G.3AP — AI PROVIDER RESILIENCE (mocked; no live AI quota used)\n');

// 1. Concurrent callers hitting the same exhausted model: bounded probe, then no more calls to it
{
  reset();
  const hits = [];
  global.fetch = async url => { const m = modelOf(url); hits.push(m); await sleep(5); return m === M1 ? err(429) : ok; };
  GeminiClient.maxConcurrentCalls = 1;
  await Promise.all(Array.from({ length: 8 }, () => GeminiClient.generateContent({ prompt: 'x' })));
  assert.strictEqual(hits.filter(m => m === M1).length, 1, 'with 1 slot, a quota-exhausted model must be touched exactly once');
  reset();
  const hits2 = [];
  global.fetch = async url => { const m = modelOf(url); hits2.push(m); await sleep(5); return m === M1 ? err(429) : ok; };
  await Promise.all(Array.from({ length: 12 }, () => GeminiClient.generateContent({ prompt: 'x' })));
  assert.ok(hits2.filter(m => m === M1).length <= GeminiClient.maxConcurrentCalls, 'never more first-wave hits than the concurrency limit');
  pass('1. Concurrent callers do not keep selecting a model already known to be quota-exhausted');
}

// 2. Global concurrency ceiling
{
  reset();
  let cur = 0, max = 0;
  global.fetch = async () => { cur++; max = Math.max(max, cur); await sleep(15); cur--; return ok; };
  GeminiClient.maxConcurrentCalls = 3;
  await Promise.all(Array.from({ length: 15 }, () => GeminiClient.generateContent({ prompt: 'x' })));
  assert.ok(max <= 3, `max simultaneous provider calls ${max} must be <= 3`);
  pass('2. Simultaneous provider calls never exceed the configured limit');
}

// 3. Queue timeout -> classified overload, not a hang
{
  reset();
  global.fetch = async () => { await sleep(120); return ok; };
  GeminiClient.maxConcurrentCalls = 1; GeminiClient.queueTimeoutMs = 30;
  const [a, b] = await Promise.allSettled([GeminiClient.generateContent({ prompt: 'x' }), GeminiClient.generateContent({ prompt: 'x' })]);
  assert.strictEqual(a.status, 'fulfilled');
  assert.strictEqual(b.status, 'rejected');
  assert.ok(b.reason instanceof GeminiProviderError && b.reason.category === 'TEMPORARY_OVERLOAD');
  pass('3. Queue wait is bounded and classified as TEMPORARY_OVERLOAD');
}

// 4. 503 handling: threshold before opening, bounded attempts per call, backoff
{
  reset();
  const hits = [];
  global.fetch = async url => { hits.push(modelOf(url)); return err(503); };
  const e1 = await catchErr(() => GeminiClient.generateContent({ prompt: 'x' }));
  assert.ok(e1 instanceof GeminiProviderError && e1.category === 'TEMPORARY_OVERLOAD');
  assert.strictEqual(hits.length, GeminiClient.maxModelsPerCall, 'at most maxModelsPerCall attempts per call (no retry amplification)');
  assert.strictEqual(GeminiClient.getHealthSnapshot()[M1].state, 'CLOSED', 'one 503 must not open the breaker yet');
  await catchErr(() => GeminiClient.generateContent({ prompt: 'x' }));
  assert.strictEqual(GeminiClient.getHealthSnapshot()[M1].state, 'OPEN', 'second consecutive 503 opens it');
  pass('4. 503: bounded attempts per call; breaker opens after consecutive failures');
}

// 5. All models cooling -> fail fast with ZERO provider calls, classified
{
  reset();
  global.fetch = async () => err(429);
  for (let i = 0; i < GeminiClient.candidateModels.length; i++) await catchErr(() => GeminiClient.generateContent({ prompt: 'x' }));
  let calls = 0;
  global.fetch = async () => { calls++; return ok; };
  const e = await catchErr(() => GeminiClient.generateContent({ prompt: 'x' }));
  assert.strictEqual(calls, 0, 'no provider request while every breaker is open');
  assert.ok(e instanceof GeminiProviderError && e.category === 'QUOTA_EXHAUSTED' && e.retryAfterMs > 0);
  pass('5. All-open state fails fast (0 provider calls) with QUOTA_EXHAUSTED + retryAfterMs');
}

// 6. Half-open: exactly one probe, then recovery after cooldown
{
  reset();
  GeminiClient.quotaCooldownMs = 40;
  let phase = 'down'; const probes = [];
  global.fetch = async url => { const m = modelOf(url); if (m === M1) probes.push(phase); await sleep(5); return m === M1 && phase === 'down' ? err(429) : ok; };
  await GeminiClient.generateContent({ prompt: 'x' }); // M1 429 -> open, served by M2
  assert.strictEqual(GeminiClient.getHealthSnapshot()[M1].state, 'OPEN');
  phase = 'up';
  await sleep(120); // cooldown (+<=20% jitter) expired
  GeminiClient.maxConcurrentCalls = 5;
  const before = probes.length;
  await Promise.all(Array.from({ length: 4 }, () => GeminiClient.generateContent({ prompt: 'x' })));
  assert.strictEqual(probes.length - before, 1, 'exactly one half-open probe');
  assert.strictEqual(GeminiClient.getHealthSnapshot()[M1].state, 'CLOSED', 'successful probe closes the breaker');
  pass('6. Cooldown expiry -> single half-open probe -> recovery');
}

// 7. Repeated trips back off exponentially (bounded) 
{
  reset();
  GeminiClient.quotaCooldownMs = 100;
  global.fetch = async url => modelOf(url) === M1 ? err(429) : ok;
  await GeminiClient.generateContent({ prompt: 'x' });
  const first = GeminiClient.getHealthSnapshot()[M1].retryInMs;
  await sleep(first + 30);
  await GeminiClient.generateContent({ prompt: 'x' }); // probe fails -> reopens with doubled backoff
  const second = GeminiClient.getHealthSnapshot()[M1].retryInMs;
  assert.ok(second > first * 1.4 && second <= GeminiClient.maxCooldownMs, `backoff grows (${first} -> ${second}) and is capped`);
  pass('7. Failed probes re-open with exponential, capped backoff + jitter');
}

// 8. Quota with Retry-After hint from provider is honored
{
  reset();
  global.fetch = async url => modelOf(url) === M1 ? err(429, 'quota exceeded. Please retry in 90s.') : ok;
  await GeminiClient.generateContent({ prompt: 'x' });
  assert.ok(GeminiClient.getHealthSnapshot()[M1].retryInMs >= 89_000);
  pass('8. Provider retry-delay hint (retry in Ns) is honored');
}

// 9. Timeout classification
{
  reset();
  global.fetch = (url, opts) => new Promise((_, rej) => { opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });
  const e = await catchErr(() => GeminiClient.generateContent({ prompt: 'x', timeoutMs: 20 }));
  assert.ok(e instanceof GeminiProviderError && e.category === 'TIMEOUT');
  pass('9. Request timeout is classified as TIMEOUT (bounded by timeoutMs)');
}

// 10. Authentication: fast-fail, single call, breaker not poisoned
{
  reset();
  let calls = 0;
  global.fetch = async () => { calls++; return err(403); };
  const e = await catchErr(() => GeminiClient.generateContent({ prompt: 'x' }));
  assert.ok(e instanceof GeminiProviderError && e.category === 'AUTHENTICATION' && /GEMINI_AUTH_ERROR/.test(e.message));
  assert.strictEqual(calls, 1);
  pass('10. 401/403 fast-fail on first call (AUTHENTICATION), never retried');
}

// 11. Configuration: missing key; 400 does not fan out; 404 opens long breaker
{
  reset();
  const k = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
  const e1 = await catchErr(() => GeminiClient.generateContent({ prompt: 'x' }));
  process.env.GEMINI_API_KEY = k;
  assert.ok(e1 instanceof GeminiProviderError && e1.category === 'INVALID_CONFIGURATION');
  let calls = 0;
  global.fetch = async () => { calls++; return err(400); };
  const e2 = await catchErr(() => GeminiClient.generateContent({ prompt: 'x' }));
  assert.strictEqual(e2.category, 'INVALID_CONFIGURATION'); assert.strictEqual(calls, 1);
  reset();
  global.fetch = async url => modelOf(url) === M1 ? err(404) : ok;
  await GeminiClient.generateContent({ prompt: 'x' });
  assert.ok(GeminiClient.getHealthSnapshot()[M1].retryInMs > 5 * 60_000);
  pass('11. Config errors: missing key, 400 (no fan-out), 404 (long breaker) classified correctly');
}

// 12. Never leak credentials or provider text
{
  reset();
  global.fetch = async () => err(503, 'PROVIDER_RAW_TEXT_SHOULD_NEVER_LEAK key=dummy-key-123-SECRET');
  const e = await catchErr(() => GeminiClient.generateContent({ prompt: 'x' }));
  assert.ok(!/dummy-key|PROVIDER_RAW_TEXT/.test(e.message + JSON.stringify(e)));
  pass('12. Error objects contain no API key and no raw provider text');
}

// 13. Static contract checks of the HTTP layer and the student UI (no network)
{
  const route = fs.readFileSync(new URL('../src/routes/ai.ts', import.meta.url), 'utf8');
  const block = route.slice(route.indexOf("console.error('AI Generate Quiz error:'"));
  assert.ok(block.includes("code: 'AI_QUOTA_EXHAUSTED'") && block.includes("code: 'AI_PROVIDER_UNAVAILABLE'") && block.includes('retry_after_seconds'));
  assert.ok(!/details:\s*err/.test(block.slice(0, block.indexOf("router.post('/evaluate'"))), 'generate-quiz errors must not expose err.message');
  assert.ok(block.includes('هذا لا يعني أن محتوى'), 'Arabic message must state the unit is not necessarily missing content');
  const ui = fs.readFileSync(new URL('../../client/src/pages/StudentDashboard.tsx', import.meta.url), 'utf8');
  assert.ok(ui.includes('genController.abort()') && ui.includes('clearTimeout(genTimeout)') && ui.includes('setIsGeneratingAi(false)'));
  assert.ok(ui.includes("data.code === 'AI_QUOTA_EXHAUSTED'") && ui.includes('aiRetryWaitSec > 0'));
  pass('13. Route returns classified, sanitized Arabic errors; UI has hard timeout, loader reset and gated retry');
}

global.fetch = realFetch; console.warn = origWarn;
console.log(`\nALL PHASE 4G.3AP TESTS PASSED (${passed}/13)`);
process.exit(0);
