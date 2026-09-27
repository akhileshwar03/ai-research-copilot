# CLAUDE.md

## Humanizer Phase 2 (LoRA fine-tune) — COMPLETE (2026-08-10)

Built and validated a fine-tuned LoRA (`Qwen/Qwen2.5-7B-Instruct` base) for the Humaniser
Pass 2 rewrite. Real GPTZero validation: 8/10 (80%) pass rate, above the 50% bar. Model exists
locally in Ollama as `humaniser-lora`.

**Wired into the live app as "Ultra Human"** — `POST /humanize/ultra`
(`backend/routes/humanize.py`) → `HumanizerUltraService`
(`backend/app/services/humanizer_ultra_service.py`) → local Ollama `/api/chat`, confirmed
working end-to-end 2026-08-13. `ai_service.py`/the main `/humanize` stream still uses GPT — that's
intentional, not a gap: Ultra Human is local-Ollama-only (no production hosting yet, that's the
still-unstarted Modal integration) and is meant to stay a distinct, separately-labeled mode, not
replace the GPT path. Frontend: `frontend/app/humanizer/page.tsx` — "Basic"/"Diff Highlight" tabs
are labeled "AI Paraphraser" (blue), "Ultra Human" is labeled "DL Trained Model" (purple), each
with its own badge/tab color so the distinction is visible, not just textual.

### Ultra Human throughput — measured, not estimated (2026-08-13 audit)

Ultra generates at **~4.3 tok/s** locally and produces **~2 output tokens per input word**,
i.e. **~0.5s of wall clock per input word**. Real trials: 83 words → 41s, 227 words → 110s,
322 words → 139s. Consequences, all now handled in code:

- Ultra chunks via `chunking.chunk_with_separators` (`ULTRA_CHUNK_TARGET_WORDS = 100`), which
  — unlike `chunk_text`, used by Basic — **will** split inside an over-long paragraph, on
  sentence boundaries, falling back to a hard word split for text with no sentence
  punctuation. Paragraph-only chunking was not enough and a browser test caught it: a
  494-word input with no blank lines (what pasting an essay produces) still went out as one
  request and still timed out. Each chunk records the separator to rejoin with, so a split
  paragraph comes back as one paragraph instead of several. Before any chunking, a 936-word
  input — legal under the shared 3,000-word `humanize_max_words` — hit the 180s timeout on
  **every** attempt, unrecoverably.
- `humanizer_ultra_max_words` (default **600**, ~5 min) is Ultra's own ceiling, separate from
  `humanize_max_words`. It's a latency budget, not a quality knob — only raise it alongside a
  fresh throughput measurement on the target hardware.
- `num_predict` is sized per chunk. The old flat `1200` was a silent mid-sentence truncation
  cliff past ~600 words.

**Ultra prompt ≠ Basic prompt, deliberately.** Basic's `style=normal`/`expand=off` route (the
only one the UI can produce) uses `AGGRESSIVE_REWRITE_PROMPT`. Ultra must keep using
export.py's training-time prompt (`BASE_PROMPT` + `STRICT_HARD_RULES` + `STYLE_GUIDANCE` +
examples) — the LoRA never saw the aggressive prompt. There's a test pinning this.

### Ultra's real constraint is the TIME BUDGET, and every knob must respect it

`num_predict` is derived from `humanizer_ultra_timeout_seconds`, not guessed from expected
output length. This is the bug behind a real user report (153-word input, timed out twice):
sizing purely by length gave a ~140-word chunk `num_predict=760`, and 760 tokens at 4.3 tok/s
is 177s against a 180s timeout. **Any new sizing knob has to be checked against
`timeout * rate`, or it reintroduces this.** Cold start costs ~35s on top (113.6s cold vs
78.2s warm, same input) — that's what `_TIMEOUT_UTILISATION = 0.6` reserves.

**Known model-level limits (retrain territory, not service-layer bugs).** All three below are
symptoms of a contaminated fine-tuning corpus; the real fix is re-auditing it before any
retrain, and the guards in `humanizer_ultra_service.py` are damage control, not solutions:

- **Fabrication is worse than STATE.md Round 22's "much improved, not perfect" implies.** On
  identical 140-word input, back-to-back runs gave a clean 159-word rewrite and then a
  507-word (3.6x) invented article — section headings, a fabricated "European Food Safety
  Agency (EFSA)" citation, named viruses absent from the source. It's bimodal, not a drift,
  so `_MAX_EXPANSION_RATIO` catches it and resamples. A 322-word run also turned
  "twice monthly" into "two weekly".
- **Scraped web furniture leaks into output**: `Bee | Credits: / CC-BY-2.0 image from
  freeimagearchive.com` (three times in one run), and inline `See Wikipedia: Bee`.
  `_strip_scraped_credit_lines` removes these only when the source has no such hint.
- **Dropped spaces after sentence periods** (`licenses.Salesforce`, `results).Lines`).

`expand=True` on Ultra is genuinely out of distribution (export.py only ever emitted
`STRICT_HARD_RULES`), and is exempt from the expansion guard by design.

**Corpus clean pass done (STATE.md Round 29, 2026-09-12) — step 1 of the retrain plan, not a
retrain.** `scripts/finetune/clean_corpus.py` (read-only against the DB) produced
`scripts/finetune/data/train_clean.jsonl` (8,803 rows) / `eval_clean.jsonl` (463 rows) — HTML
tags, URLs, and boilerplate stripped from the training targets, plus a length-ratio filter
removing the rows that taught the model to expand 1.4-2x+ beyond the source. 72.5% of the
original 12,785 rows kept, zero remaining contamination (verified by re-scanning the output),
same production system prompt byte-for-byte. **Nothing trained yet** — no model-size decision
made, no retrain run. Next step per that plan: verify whether burstiness or plain/redundant
phrasing is the real anti-detector signal before choosing what to train on this.

Before touching anything under `backend/scripts/finetune/`, read
`backend/scripts/finetune/STATE.md` first. It is the source of truth for this multi-session
build (current step, key decisions, account/credential status, dollars spent, exact resume
commands) — the conversation history is not reliable across compaction.

## Production admin + platform layer — DONE (2026-09-14)

**Backend.** Two new tables (`usage_events`, `admin_audit_log`; migration `20260914_0018` +
SQLite startup mirror in `app/main.py`). `app/services/usage_tracking.py` records one lean row per
tool request from the request middleware (attached as a response background task, so streamed
replies count their full duration). `app/services/runtime_settings.py` now supports `bool`/`str`
settings with categories: maintenance mode, sign-ups on/off, announcement banner, per-tool kill
switches (`app/api/dependencies/tools.py` → `require_tool(...)` on every tool route → 503
`TOOL_DISABLED`), follow-up suggestions toggle. Public `GET /app/config` exposes only those
flags. Admin API (`app/api/routes/admin/`): stats, `/analytics?days=`, users (filters, sort,
CSV export, revoke sessions, verify email, activity), documents (list/delete/reingest), settings,
audit log, usage events, `/system` (probe=true pings OpenAI/Ollama), `/retention/run`.
`delete_account` now also purges humanizer runs, realtime sessions and usage events (PostgreSQL
FKs would otherwise reject the user delete). Tests: `app/tests/test_admin_platform.py`.

**Research Copilot.** `ChatRequest.action` (summarize | key_findings | report | compare |
references | questions) forces whole-document context and swaps the real instruction in for the
label the client shows (`RESEARCH_ACTIONS` in `chat_service.py`); page-number extraction is
skipped for actions. After each grounded answer a `suggestions` SSE frame carries three
follow-ups (one `classify` call, admin-switchable). Frontend: `research-actions.tsx` bar,
follow-up chips + Regenerate on the last reply.

**Frontend.** `/admin` is now `features/admin/components/*` (Overview, Users, Documents,
Settings, Audit & activity, System). `useAppConfig()` + `PlatformNotices` (in `MainLayout`) show
the announcement, maintenance and tool-disabled states; nav marks disabled tools. All React
compiler lint rules pass (`npx eslint app features components services shared stores`).

**Admin hardening (2026-09-26).** Admin sign-ins are audited (`admin.login`). Opt-in TOTP two-factor
(`app/services/admin_2fa.py`, Settings tab): once enabled, every `require_admin` route also needs the
`X-Admin-2FA` step-up token from `POST /admin/2fa/verify`. Lost authenticator = an operator sets
`users.totp_enabled=false` in the database. `GET /admin/alerts` (last-hour error rate / failing tool)
drives the banner in the admin console; thresholds are runtime settings `alert_error_rate_pct` and
`alert_min_requests`. The admin API is a package, `app/api/routes/admin/`, one module per area.

**AI token logging (2026-09-27).** Every OpenAI call is recorded in `ai_usage_events` (raw provider-reported
input/output/cached tokens, model, user, tool, request id; no text, no prices). Chat models carry
`TokenUsageCallback` (needs `stream_usage=True`, which langchain-openai defaults to off), embeddings go
through `_MeteredEmbeddingsClient`, and `RequestContextMiddleware` sets the user/tool context
(`app/services/ai_usage.py`). `GET /admin/ai-usage` returns tokens and *estimated* cost (by model/tool/user/day) for a date range,
shown as the "AI spend" section on the Overview. Cost is deliberately not stored: it is computed at read
time from `app/services/ai_pricing.py` (OpenAI list prices, `PRICING_VERIFIED_ON`; re-verify before trusting;
unknown models show as "unpriced", never as $0). Ultra Human (local Ollama) is not metered. Tavily web searches are recorded
(`kind="search"`, 1 credit each for basic depth) and priced at the pay-as-you-go rate ($0.008/credit; the
free plan's 1,000 credits/month make real spend lower).

**Layout.** `backend/routes/` was merged into `backend/app/api/routes/`; Render starts
`uvicorn app.main:app`. Local verification: `.claude/launch.json` has `backend-local`
(SQLite in the scratchpad, port 8010) and `frontend-local` (port 3050) so nothing touches Neon.

## Research Copilot cost guards + correctness fixes (2026-09-27)

Three bugs fixed (tests: `backend/app/tests/test_research_copilot_correctness.py`): follow-up questions are rewritten
into a standalone search query by `gpt-4.1-nano` (`openai_condense_model`, `ChatService._standalone_query`); whole-document
mode splits its character budget fairly across documents and keeps each long document's beginning AND end
(`RetrievalService.get_full_document_context`); vector-store read failures raise `RETRIEVAL_UNAVAILABLE` (503) instead of
returning "no chunks", which the model then reported as "not in the document".

Cost guards (tests: `test_chat_cost_guards.py`): each user gets `chat_full_document_daily_limit` (default 10, 0 = unlimited)
whole-document requests per UTC day — research actions and "how many / list all" questions, ~15x a normal question. Atomic
upsert counter in `chat_quota_usage` (migration `20260927_0024`, `app/services/chat_quota.py`), checked in the chat route
BEFORE streaming (429 `FULL_DOCUMENT_LIMIT`), refunded if no answer was produced. `chat_history_max_chars` (default 12000)
trims old turns sent to the model. Both are admin runtime settings. `ChatService.uses_full_document` must stay in step with
the routing inside `stream_response` (a parametrised test pins the parity).

Retrieval eval harness: `backend/scripts/rag_eval/` — refuses to run except against the throwaway local Postgres on
127.0.0.1:54329/evaldb. See the memory note for measured results before changing retrieval.

**Whole-document routing (2026-09-27).** The old bare `how many` trigger sent ordinary fact lookups ("how many subjects are
in MUG?") down the whole-document path (24 of 29 labelled fact lookups misrouted). `ChatService.decide_full_document` now
decides once, in the route, before streaming: actions, explicit "in the entire document", and page questions are handled
directly; otherwise only a question containing a count/list cue word (`_ROUTER_CUE_RE`) is sent to a `gpt-4.1-mini`
classifier (`ROUTE_PROMPT`, ~$0.00006/call, ~0.45 s), with the tightened regex `_looks_like_aggregate_query` as fallback if it
fails. Measured on `backend/scripts/rag_eval/routing_cases.json`: classifier 74/81 overall and 24/28 on the held-out
adversarial set vs the regex's 9/28 (its 53/53 dev score is in-sample). Real 43-page test: 5 fact questions went from
20.3k to ~2.6k billed input tokens each with identical correct answers. A router miss on a structural question yields a
hedged "at least N" lower bound, not a fabricated count.

**NUL-character ingestion fix (2026-09-27).** `IngestionService` strips 0x00 from extracted text: PostgreSQL rejects it, so 2 of 7 real research PDFs failed to ingest in production (SQLite in tests/dev hides this). Large-document eval harness: `backend/scripts/rag_eval_big/`.

## Research Copilot retrieval upgrade (2026-09-27): stamping + reranker + embedding-model support

Ingestion now stamps every text chunk with its document title and nearest section heading before embedding
(`IngestionService._headings_in`, `process_pdf(..., title=...)`; vision chunks untouched). `RetrievalService.retrieve_context`
is now `async` and, when `rag_rerank_enabled` (default on), fetches a candidate pool (`rag_rerank_pool_size`, default 20)
and has `gpt-4.1-nano` (`AIService.rerank`) re-score it down to `rag_top_k`, falling back to plain distance order on any
failure. `EmbeddingService` reads the model from the new `rag_embedding_model` runtime setting on every call (default
stays `text-embedding-ada-002` — changing it requires re-embedding existing chunks first: `scripts/reembed_chunks.py`,
dry-run by default, must be pointed explicitly at a database via `--database-url`, never reads `.env`).
Verified end-to-end against a 152-question/7-document/5,966-chunk benchmark: answerable accuracy 79.1% → 93.7%
(sign-test p<0.001), cost (caching-adjusted) down 36-44% on plain fact questions. See the memory note for full numbers
and the one known regression (structural reference/table counts, n=6, unreliable sample).
