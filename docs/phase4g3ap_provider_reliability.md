# Phase 4G.3AP — AI Provider Reliability & Release Readiness

## 1. What the resilience layer does now (code: `server/src/services/ai/geminiClient.ts`)

| Concern | Mechanism |
|---|---|
| Request storms | Global in-process concurrency limit (`GEMINI_MAX_CONCURRENCY`, default 3) with a bounded queue (15 s). A queued call chooses its model **after** it obtains a slot, so it sees breaker state written by the calls ahead of it. |
| Known-bad model reselection | Per-model circuit breaker: `CLOSED -> OPEN -> HALF_OPEN`. Exactly one probe request is allowed in `HALF_OPEN`; success closes, failure re-opens with doubled (capped) cooldown plus 0-20 % jitter. |
| Failure taxonomy | `QUOTA_EXHAUSTED` (429; honours "retry in Ns"; opens immediately, 60 s base), `TEMPORARY_OVERLOAD` (500/502/503/504; opens after 2 consecutive, 20 s base), `TIMEOUT` (opens after 2 consecutive, 45 s base), `INVALID_CONFIGURATION` (404 opens 10 min; 400 and missing key fail fast, no fan-out), `AUTHENTICATION` (401/403 fast-fail, never retried, breaker not poisoned). |
| Retry amplification | At most 2 *slow* attempts (503/timeout/unknown) per call, exponential backoff + jitter between them. Fast deterministic failures (429/404) open the breaker and are not retried. When every model is open the call fails **immediately with zero provider requests**. |
| Information hygiene | `GeminiProviderError.message` carries only a category. Raw provider text, URLs and keys are never put in errors, responses or logs (key travels in the `x-goog-api-key` header). |

HTTP layer (`server/src/routes/ai.ts`, `/api/ai/generate-quiz`):

| Condition | HTTP | `code` | `retryable` |
|---|---|---|---|
| Quota exhausted | 503 | `AI_QUOTA_EXHAUSTED` | false |
| Overload / timeout / queue timeout | 503 (+`Retry-After`) | `AI_PROVIDER_UNAVAILABLE` | true, `retry_after_seconds` 10-120 |
| Bad key / permission / config | 500 | `AI_AUTH_ERROR` / `AI_CONFIG_ERROR` | false |
| Provider fine, too few verified questions | 503 | `EXAM_GENERATION_FAILED` | true |
| Unit has no extracted content | 422 | `INSUFFICIENT_UNIT_CONTENT` | - |

`details: err.message` was removed from all of these. If fewer than 3 questions were verified *and* a provider failure or solver execution failure occurred, the engine now raises the provider error instead of reporting "insufficient content", so a provider outage is never presented as a content problem.

Student UI (`client/src/pages/StudentDashboard.tsx`): 150 s hard client deadline (AbortController) so the loader always stops; Arabic message states the unit is not necessarily missing content; the Start button is disabled with a countdown for retryable overloads and for 5 minutes after quota exhaustion.

## 2. Is the cooldown global? No.

State is **per serverless instance** (in memory). Vercel can run several instances and cold-start new ones, so two instances can each probe a dead model once per cooldown window. This is bounded (probes, not storms): at most `instances x 1` probe per model per window plus up to `GEMINI_MAX_CONCURRENCY` first-wave calls per instance. Fluid compute reuses an instance for concurrent requests, which is where the limiter helps most.

### Options for shared coordination (none implemented; none require action to deploy this release)

| Option | Cost | Failure modes / trade-offs |
|---|---|---|
| A. Status quo (in-memory) | none | Per-instance duplicate probing; cold starts forget breaker state. |
| B. TiDB table `ai_provider_health(model, state, open_until, trips, updated_at)` | One migration + 1 read per AI call, 1 write per state change; uses existing DB | **Needs migration and production writes -> requires your explicit approval.** Adds DB latency/availability dependency to the hot path (mitigate: cache reads 5-10 s, fail open to in-memory). Write contention is negligible (state changes only). |
| C. Upstash Redis / Vercel KV | New vendor/service; free tier likely sufficient; ~1-5 ms ops | New infrastructure + secret. Best fit for atomic probe leases and a global concurrency semaphore. Fail open to in-memory on outage. |
| D. Vercel Edge Config | Low | Read-optimised, slow writes through API; poor fit for per-failure updates. |

Recommendation: stay on A until capacity (section 3) is fixed; if instance-level duplicate probing still shows up in logs afterwards, choose C (or B with approval).

## 3. Provider capacity (decision required from you)

Verified today (read-only, mocked tests do not consume quota; the earlier probes did):
- `gemini-3.1-flash-lite` — reachable, intermittently HTTP 503 "high demand", ~3 s for a trivial prompt.
- `gemini-3.5-flash`, `gemini-3.6-flash`, `gemini-flash-latest`, `gemini-pro-latest` — HTTP 429 quota exhausted on the current key.
- `gemini-flash-lite-latest` — hangs until timeout.
- `gemini-2.5-flash`, `gemini-2.5-flash-lite` — HTTP 404 (not available to new users).
- So effectively **one** model is usable, and it is overloaded at times. This is a free-tier-class capacity symptom, but I cannot see the account's plan or exact limits from the API: **NOT VERIFIED** (check the AI Studio rate-limit page for the project).

Load per exam (from code, token counts are estimates, not measured): 1 generation call + up to ~8 blind-solver calls (+ 1 generation and a few solver calls when topping up) -> roughly 10-20 provider calls and ~15-25 K input / ~4 K output tokens per exam. The question bank reuses verified questions, which lowers steady-state cost.

Third-party-reported paid pricing (NOT VERIFIED against Google's page; confirm before deciding): Gemini 3.1 Flash-Lite preview about $0.25 / 1M input and $1.50 / 1M output tokens. At the estimate above that is on the order of **$0.01 per exam (~$10 per 1,000 exams)**, before bank reuse.

Options:
1. **Enable billing (paid tier) on the same Google AI Studio project** — recommended. Removes the free-tier daily/minute caps, unlocks 3.5/3.6 flash, no code change. Cost estimate above. Action for you: in Google AI Studio -> the project that owns `GEMINI_API_KEY` -> set up billing; optionally set a monthly budget alert. No new key is required (a new key would need `GEMINI_API_KEY` updated in Vercel project env).
2. Add a second provider (e.g. another LLM API) as fallback — more resilience, but needs a new adapter, prompt/JSON-contract re-validation of the blind solver against that model, new secrets, and a second cost line. Not recommended before option 1.
3. Stay free tier — expect routine 503/PARTIAL results at any real student load; not launch-grade.

## 4. Verification status

Passed without live AI (mocked `fetch`, no DB writes): see `server/tests/phase4g3ap_provider_resilience_test.mjs` (13 checks) plus earlier suites 4G.3AO/AN/AM/AB/W/C.
NOT VERIFIED (needs live AI capacity): production latency improvement from parallel verification; Arabic Unit 2 completeness after the prompt grounding rule; multi-subject complete-exam rate; end-to-end student flow while the provider is healthy; real `Retry-After` behaviour in the browser.

**Release status: NOT fully production-ready** while students can routinely receive HTTP 503 during generation. The code now fails safely and honestly; it cannot create provider capacity.
