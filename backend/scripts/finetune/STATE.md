# Phase 2 — Humanizer LoRA fine-tune — STATE

## ▶️ PHASE 2 REOPENED, 2026-08-06 — checkpoint attempt, gated by a hard exit criterion

**Trigger**: real-world testing of the live Phase 1 pipeline (not this fine-tune) failed 100% AI on
every variant tried that day (model swap, sampling penalties, generative-reframing prompt). In the
same session, found a real competing tool — CleverAI Humanizer (cleverhumanizer.ai, distinct from
several other same-named domains that turned out to be lead-gen funnels with no real free output)
— that scored **Human 100%** on GPTZero on the exact same test paragraph our pipeline and our own
parked adapter both failed on. Its output also showed the same spurious "Essay" title artifact
our adapter has, suggesting a similarly-sourced (essay-bank-heavy) but far larger training corpus
— it claims (unverified, but consistent with the result) "a model trained on 1M human texts."
That's ~236x our original 4,231-example corpus. Conclusion: the original attempt's failure looks
like scale, not a wrong approach — worth one more real, tightly-bounded attempt before permanently
parking the fine-tune path.

**Hard exit criterion, agreed with the user up front and explicitly confirmed to hold to it no
matter what the run looks like**: **50% GPTZero pass rate (5/10) on a checkpoint run**, tested the
same rigorous way as the original Step 6 validation (10 fresh genuinely-AI-generated inputs across
diverse content types, output-only files in `gptzero_check/`, all 10 results reported regardless
of outcome, no cherry-picking). **If the checkpoint run does not clear 50%, stop here — no "one
more push," no reframing a miss as a promising trend.** This is a checkpoint specifically so a
bad result costs one data point, not the full scale-up.

**Checkpoint scope** (vs. original attempt):
- **Corpus**: ~20,000 examples (vs. 4,231), 3 styles same split logic (normal/clear_structured/
  simple_formal). Sources chosen after real HF Hub license verification (several originally-sketched
  sources — Blog Authorship Corpus, Yelp reviews, CC-News, StackExchange — turned out to be
  unknown/other/CC-BY-NC-SA licensed and were dropped): `artem9k/ai-text-detection-pile` (MIT,
  reused but hard-capped this time so it can't repeat the IvyPanda-dominance bug),
  `nixiesearch/hackernews-comments` (Apache-2.0), `billsum` (CC0, reused, capped),
  `CFPB/consumer-finance-complaints` (CC0), `LLM-PBE/enron-email` (Apache-2.0). Hard rule: no
  single source >15% (3,000 rows) of the final 20,000.
- **AI-ify diversity** (fixes root cause #2 below — this is the actual fix, not just more data of
  the same kind): multiple model families instead of one fixed Qwen2.5-3B call — Kaggle free-GPU
  self-hosted (Qwen2.5-7B-Instruct, Llama-3.1-8B-Instruct, Mistral-7B-Instruct, ~60%), Groq free
  tier (Llama-3.3-70B, GPT-OSS-120B, ~30%), Gemini free tier (Flash/Flash-Lite, ~15%), thin paid
  OpenAI slice (gpt-4o-mini/4.1-mini/4.1, ~5%) for one real production-model fingerprint.
- **Training**: Modal, **A10G** (not A100-40GB — ~half the hourly rate, still comfortably fits a
  7B QLoRA), drawing against the account's real, CLI-verified $22.28 remaining free-credit balance
  this billing cycle (confirmed via `modal billing summary`, not the general "$30/month" marketing
  claim). Estimated **$11-13** for one clean run.
- **Retry rule, explicit and non-default**: if the first training run fails (e.g. an OOM like last
  time) and needs a retry, **stop and ask the user before relaunching** — do not auto-resume.
  The user decides in the moment whether the extra spend is worth it based on what actually failed.
- Total non-training cost estimate (AI-ify generation, tagging, eval, mostly free-tier APIs):
  **~$5-10**.

**Checkpoint run log (2026-08-06):**
- Corpus collection (`collect.py`): done. **17,500 total rows** (mit: 4,443 artem9k, capped;
  cc0-1.0: 5,057 billsum; apache-2.0: 8,000 split between `nixiesearch/hackernews-comments` and
  `LLM-PBE/enron-email`, 4,000 each). Slightly under the 20,000 target but within the useful range
  -- CFPB/consumer-finance-complaints was dropped after its HF loader turned out broken
  (`ValueError: not enough values to unpack`, stale script vs. current CSV schema), and several
  other originally-sketched sources failed license checks (see collect.py's SOURCES comment).
- Gemini was dropped from the AI-ify model mix: the user's `GOOGLE_API_KEY` returned
  `429 RESOURCE_EXHAUSTED — prepayment credits depleted`, meaning that Google Cloud project is
  billing-linked, not the plain no-card free tier this plan assumed. Not worth chasing (user's
  call).
- **Kaggle quota reality check (user checked the dashboard directly, screenshot): only 2h8m of the
  30h weekly quota available, not a fresh pool.** At this GPU's measured real throughput
  (`chunk-08`/`chunk-09` from the original attempt: 750 rows in 5.11h/5.46h ≈ 140 rows/hour),
  2h8m ≈ ~300 rows — only ~3% of a 60%-share (10,500-row) target. Rebalanced same-day, twice:
  first pass 60/35/5 (Kaggle/Groq/OpenAI) had an arithmetic slip (summed to 110%); corrected and
  then re-rebalanced again given the quota reality to **35% Kaggle (opportunistic, doesn't block
  the others) / 55% Groq / 10% OpenAI**. `push_kaggle.py` and `aiify_api.py` partition rows
  deterministically by `id % 100` (Kaggle: 0-34, Groq: 35-89, OpenAI: 90-99).
- **Sequencing decision (user confirmed)**: export/training proceeds once Groq+OpenAI (65% of the
  corpus) finish — estimated 1-2 days — using whatever Kaggle rows have accumulated by then rather
  than waiting the ~1-2 more weekly quota cycles Kaggle's full 35% share would need. Kaggle keeps
  contributing opportunistically in the background; the final corpus's Kaggle-sourced share will
  likely be smaller than 35% in practice, which does dilute model-family diversity for that slice
  somewhat (Groq/OpenAI-heavy instead of an even three-way split) — noted honestly here in case
  the checkpoint's eval result needs revisiting this tradeoff.
- Style tagging (`tag.py`): swapped the nano-fallback classifier from paid `gpt-5-nano` to Groq's
  free `llama-3.1-8b-instant` (same ChatOpenAI interface via Groq's OpenAI-compatible endpoint) --
  $0 instead of the ~$3-6 the original attempt spent on this step. Also fixed a real bug found
  while running it: heuristic-tagging did one giant 11,500-row commit with no progress signal,
  which sat long enough that it was mistaken for a stale orphaned DB connection and killed
  mid-run (no data lost -- nothing had committed yet -- but wasted a run). Fixed to commit in
  batches of 200; re-ran successfully.
- `aiify_api.py` written and buckets rebalanced (35-89 Groq, 90-99 OpenAI) -- **NOT yet launched.**
  (Correction, 2026-08-06 cleanup pass: an earlier version of this note claimed a small Kaggle
  chunk had been pushed this session -- checked `.kaggle_manifest.json` directly and that never
  actually happened; the manifest still only has the original chunk-00..14 from the first attempt.
  Fixing the false claim rather than leaving it.) Pushing a small Kaggle chunk (~250-280 rows,
  sized to safely fit whatever quota remains) using the existing, already-proven single-model
  notebook (Qwen2.5-3B-Instruct -- not 7B; the original attempt found 7B left no OOM headroom on
  the P100's 16GB and downgraded to 3B, a detail the original checkpoint scoping message got wrong
  by assuming 7B) is still the plan, just not executed yet. Deliberately NOT attempting the
  three-model-rotation notebook rewrite on a small quota window -- that's real, higher-risk
  engineering work (the original attempt hit 11 separate bugs getting Kaggle inference stable at
  all) better done when there's enough quota to safely debug it.
- **2026-08-06 structural cleanup pass** (in response to "is it clean" / "remove what we don't
  need" from the user): found and fixed three real gaps, not just disk clutter --
  1. `SOURCE_CAP` was defined in `collect.py` and referenced only in comments claiming it was
     "enforced downstream at export time" -- grepped the whole codebase, it was enforced nowhere.
     Added `cap_by_source()` to `export.py`, actually called before the train/eval split now.
  2. The `id % 100` provider-bucket boundary was hardcoded independently in both `push_kaggle.py`
     and `aiify_api.py`, kept in sync only by a comment. Extracted to a new `aiify_split.py`
     (single source of truth), both scripts now import from it.
  3. The 4,231 old rows with single-model-contaminated `ai_text` (proposed resetting them
     earlier, never got confirmation, decision sat unresolved) -- **reset executed**: all 4,231
     now `status='tagged'`, `ai_text=NULL`. Full corpus is now uniformly 17,500 `tagged` rows,
     zero old contamination, ready for the diverse pipeline once tagging is redone correctly.

- **2026-08-07 data-cleanliness verification pass** (user pushed hard on "is it PERFECTLY human,
  if we're wrong here everything downstream is wasted" -- correctly). Pulled real samples from
  every source and read them directly rather than trusting license tags/labels alone. Found and
  fixed three real contamination issues, largest first:
  1. **Wikipedia References/citation tail**: 87.9% of the first 5,000 collected chunks (4,397/5,000)
     contained a References/Further reading/External links/etc. section -- worse than the artem9k
     issue below. Fixed by truncating each article at the first such heading *before* chunking
     (`strip_wikipedia_tail()`), not rejecting whole articles. Deleted and re-collected the 5,000.
  2. **artem9k IvyPanda essay-bank pattern**: 30.8% (1,370/4,443) carried the exact contamination
     pattern (formulaic "<Topic> Essay" title + Works Cited section) diagnosed as the original
     model's root cause -- confirmed via `is_ivypanda_pattern()`, matches the ~30-37% figure from
     the original diagnosis almost exactly. Deleted, added the pattern as a permanent `row_filter`,
     backfilled clean.
  3. **Wikipedia leftover wikitext table markup**: 2.6% (132/5,000) of chunks had raw MediaWiki
     table syntax (`{|`, `! style=`, `|-`) leak through from infoboxes -- caught while
     double-checking the References fix, not something originally being looked for. Fixed with a
     per-line filter (`_WIKITEXT_TABLE_LINE`) inside the chunker, dropping only the noisy lines,
     keeping the surrounding prose.
  - Also re-confirmed at this pass: Enron truly fully removed (0 rows), every row inside
    [150, 1200] words, zero exact-duplicate `human_text` across the whole 20,000-row corpus.
  - **Final verified state (this round)**: 20,000 rows, 5,000 per source exactly, 0.0% on every
    contamination check re-run after fixes (2 remaining "References" regex hits on Wikipedia are
    confirmed false positives -- a book title "Hot Spring Notes" and an album credit "Liner Notes,"
    not actual citation sections).

- **2026-08-07, round 2**: user pushed on the Wikipedia snapshot date specifically -- ChatGPT
  (2022-11-30) started a real, documented problem of AI-generated Wikipedia edits (WikiProject AI
  Cleanup founded 2023 in response). The `20231101.en` snapshot used above is a full year into that
  window, no way to rule out some of its "human" text actually being AI-written and never caught.
  **Swapped to `legacy-datasets/wikipedia`'s `20220301.en` config** -- same official Wikimedia
  provenance and CC-BY-SA-3.0+GFDL license, but March 2022, nine months before ChatGPT existed,
  making this contamination category structurally impossible rather than just unlikely. (User asked
  about going earlier still -- 2020, 2019, pre-2018; explained why that doesn't add real protection,
  since the actual risk threshold is ChatGPT's mass-adoption launch, not "any AI model having ever
  existed" -- March 2022 already fully clears it. Landed on March 2022 as the best balance of
  official-source authority and eliminated risk, not a further-back date for its own sake.)
  - Re-ran the References-tail and wikitext-markup checks against the new snapshot's freshly
    collected 5,000 rows -- **caught a real process bug of my own**: after broadening the wikitext
    markup filter (`_is_wikitext_table_line`, pipe-character-anywhere + line-starts-with-`!`) to
    catch leaks the first version missed, I only deleted the handful of rows I'd manually
    spot-checked and re-collected *those*, without re-scanning the other ~4,995 rows that were
    still sitting in the DB from *before* the filter was fixed. A follow-up full-corpus re-scan
    using the actual `_is_wikitext_table_line()` function (not an approximation) found 128/5,000
    rows still failing the broadened check. Deleted all 128, backfilled, re-verified with the exact
    production filter function against every row this time -- **0/5,000**.
  - **Final verified state**: 20,000 rows, 5,000 per source, checked with the real filter functions
    (not re-implemented approximations) against every single row: 0 IvyPanda-pattern rows, 0
    wikitext-markup rows, 0 rows outside [150,1200] words, 0 duplicate `human_text` groups, 0 Enron
    rows. This was the cleanest and most rigorously re-verified the corpus had been at any point in
    Phase 2, original attempt included -- but see below, this Wikipedia slice was fully removed
    the same day anyway.

- **2026-08-07, round 3 -- Wikipedia source removed entirely.** After all of the above, user asked
  to wipe all Wikipedia data from the project and restart that source's sourcing/cleaning decision
  from scratch rather than keep iterating on the current one. Deleted: all 5,000
  `legacy-datasets/wikipedia` rows from `finetune_samples` (DB now back to 15,000 -- artem9k 5,000,
  billsum 5,000, hackernews 5,000, verified 0 Wikipedia rows remaining); the small (96KB) HF loader
  script cache for `legacy-datasets/wikipedia` (`~/.cache/huggingface/modules/...`) -- no larger
  data cache existed since `collect.py` streams datasets rather than downloading them; and the local
  scratchpad copy of a full-corpus CSV export that had been generated and sent to the user (the
  copy already delivered to the user is theirs now, out of reach -- only the local scratchpad copy
  could actually be removed). **`collect.py`'s SOURCES list still has the Wikipedia entry in code**
  (not deleted) -- next Wikipedia sourcing attempt, if any, starts from a user decision, not from
  this file. Corpus is at 15,000 (3 sources) pending that decision.

- **2026-08-07, round 4 -- full corpus wipe, user-requested restart.** After round 3, user said
  "remove all the rows data we collected, i wanna restart collecting again." Executed: deleted all
  15,000 remaining rows (artem9k 5,000, billsum 5,000, hackernews 5,000) from `finetune_samples`,
  removed `.collect_cursor.json` and every other cursor/state file under `scripts/finetune/`.
  Verified empty three independent ways (`COUNT(*)`, `pg_stat_user_tables.n_live_tup`,
  `pg_class.reltuples`) after a separate user question about the numbers turned out to be about
  the Claude Code UI's git-diff line-count indicator, not the database — confirmed unrelated and
  resolved before proceeding. Corpus at 0 rows, awaiting fresh source decisions.

- **2026-08-07, round 5 -- "perfectly 100% human, no risk at all" rebuild, sources fixed, corpus
  recollected.** User's explicit instructions this round: prefer 2016/2017-era text over the prior
  March-2022 cutoff, strip citations and email artifacts strictly, "be strict," full continuous
  prose chunks only. Changes made to `collect.py`:
  1. **`artem9k/ai-text-detection-pile` dropped entirely**, not just re-filtered. It has no
     per-row date field, and a direct spot-check found rows referencing 2021/2022 events (e.g. an
     essay titled "2022 Russian Invasion of Ukraine in Global Media Coverage") -- its "human" label
     cannot be trusted to predate ChatGPT (Nov 2022) the way the other sources now can be verified
     to be. This also fully retires the IvyPanda-essay contamination risk that source needed a
     dedicated filter for.
  2. **Checked for a real 2016/2017 Wikipedia replacement** before deciding to keep
     `legacy-datasets/wikipedia`'s `20220301.en` config: `get_dataset_config_names` confirms that
     dataset now only ships one English config (`20220301.en` -- older dumps have been deprecated
     from the repo). Searched HF Hub for alternatives; the only real hit, `Ti-Ma/wikipedia_2017`,
     turned out on inspection to be a raw revision-history dump, not clean article text (sample
     rows were bot warning messages on user Talk pages and user subpages, e.g. title
     "Newlyfan/Murray Norton" -- not encyclopedia prose). Decided to keep `20220301.en`: it already
     predates ChatGPT's Nov 2022 mass-adoption launch (the real causal risk boundary, not "how many
     years back can we go") by 9 months, and swapping to the messier alternative would trade a
     real, demonstrated quality problem for no meaningful safety gain.
  3. **`nixiesearch/hackernews-comments` now hard-filters to `time < 2018-01-01` (unix cutoff
     1514764800)** via `row_filter`, so nothing in this source can postdate ChatGPT. Discovered the
     underlying stream is chronologically ordered (item ids increment with time) with one large
     out-of-order jump around row 100,000 (2020 dates jumping straight to 2024) -- added
     `skip_shuffle` (this source reads start-to-end instead of the usual local shuffle, since
     shuffling would otherwise scan deep into unusable post-2018 territory) and a new `break_when`
     hook that stops scanning the instant the stream crosses the cutoff, rather than continuing to
     search for a target count that can never be reached past that point. Confirmed working exactly
     as designed on the real run below (broke at row 100,000, right where testing predicted).
  4. **`billsum` needed no date filter** -- its fixed academic release only covers the
     103rd-115th Congress plus CA bills, i.e. it stops around 2018 by construction.
  5. **Global strict-cleaning pass added to `clean_text()`** (applies to every source, every
     candidate, not just Wikipedia-specific fixes from earlier rounds): a new `strip_citations()`
     removes inline bracket citations (`[12]`, `[citation needed]`, `[note 3]`), academic
     parenthetical author-year citations (`(Smith, 2016)`, `(Smith et al., 2016; Jones, 2017)`),
     email header lines (`From:`/`To:`/`Subject:`/`Sent:`/`Date:`/`Reply-To:`), email quoting
     boilerplate (`-----Original Message-----`, `On ... wrote:`, `> quoted text`), and bare
     bullet-list lines -- tested against a synthetic sample containing all of these plus normal
     prose with non-citation parentheticals (`(established in 1995)`) to confirm no false
     positives, then re-verified with regex checks across all 18,831 real collected rows: **0
     bracket citations, 0 author-year citations, 0 email headers, 0 real bullet-list lines** (one
     regex hit turned out to be billsum's own "Title I: ... -" section-divider formatting, not a
     list, and a looser artifact of the *audit* regex, not the production filter).
  6. `SOURCE_CAP` raised 5,000 → 7,000 (35% of 20,000) since collection is now 3 sources instead
     of 4; `target_rows` set to 7,000/7,000/7,000 for billsum/hackernews/wikipedia.
  - **Real collection run result**: 18,831 rows -- billsum 7,000 (full target), wikipedia 7,000
    (full target), hackernews 4,831 (short of the 7,000 target; `break_when` confirms this is the
    real ceiling of usable pre-2018 comments in the ≥150-word band, not a bug -- most HN comments
    are short, and pre-2018 volume is smaller than the dataset's post-2018 majority). Word count
    range [150, 1200], avg 345, matches config exactly. Licenses: cc0-1.0 (billsum) 7,000,
    apache-2.0 (hackernews) 4,831, cc-by-sa-3.0 (wikipedia) 7,000. All rows `status='collected'`,
    `ai_text=NULL` -- style tagging (`tag.py`) has not been re-run against this corpus yet.
  - 3-source, ~18,800-row corpus is now every row date-verifiably pre-ChatGPT and citation/email
    artifact-free by construction -- the strongest data-cleanliness state Phase 2 has been in.

- **2026-08-07, round 6 -- added a 4th source to fill a real register gap.** User asked directly
  whether the corpus was "good enough" -- honest answer given: the human-side date/contamination
  work was solid, but register had narrowed to 2 formal/institutional sources (billsum, wikipedia)
  + 1 narrow casual one (terse hackernews comments), missing the neutral/natural blog-and-article
  register most real "humanize my AI text" requests probably land in. User asked to add
  "completely neutral, natural human written text."
  - Added **`Skylion007/openwebtext`** (CC0-1.0, verified via HfApi) -- the open replication of
    WebText, the corpus OpenAI built for GPT-2's own pretraining: outbound URLs from Reddit
    submissions with karma>=3, documented and widely cited as collected only through December
    2017. Date-safe by construction, no per-row filter needed for that axis, and genuinely diverse
    neutral prose (news/blog/opinion writing) -- exactly the missing register.
  - Raised `TARGET_TOTAL` 20,000 → 24,000 to make room without shrinking the first 3 sources;
    `openwebtext` target_rows 6,000.
  - Added two more strict-cleaning fixes to `clean_text()` while reviewing real openwebtext
    samples: photo-credit parentheticals fused onto the end of a sentence (e.g. "...on Saturday.
    (Melina Mara/The Washington Post)") needed a substitution, not a full-line filter, same lesson
    as the earlier citation fix; and standalone legal-disclaimer lines ("The opinions expressed by
    columnists are their own...").
  - **First real collection run (5,169 rows) then measured, not assumed, clean**: direct regex
    audit found 0 citations/email-headers/photo-credits (existing filters working), but **8.8%
    (453/5,169) carried raw scraped-page "chrome"** -- subscribe widgets, share buttons, cookie/
    privacy boilerplate, related-articles blocks, and a few disclaimer sentences fused mid-
    paragraph with no clean line boundary to surgically cut (e.g. "Get the biggest daily stories
    by email Subscribe Thank you for subscribing..." running straight into real content). Added
    `is_web_chrome_pattern()` as a whole-row `row_filter` for openwebtext specifically (same
    precedent as `is_ivypanda_pattern` -- reject the row rather than risk a mangled partial edit,
    since the junk/prose boundary here is often ambiguous). **Checked one candidate fix before
    applying it and rejected it**: a WordPress-shortcode-bracket regex looked promising (4.0% hit
    rate) but direct sample inspection showed it was matching legitimate journalistic bracket
    insertions inside quotes (e.g. `[soldiers]`, `[it]`) -- a false-positive filter, correctly not
    added.
  - Deleted the 453 contaminated rows using the real production filter function (not a
    re-implemented approximation), re-ran `collect.py` to backfill -- **453 new clean rows
    collected, back to 24,000 total.** Full-corpus re-verification with the real filter function
    afterward: **0/5,169 openwebtext rows still failing**, 0 rows out of [150,1200] word bounds,
    0 exact-duplicate texts across all 24,000 rows.
  - **Final corpus composition (superseded same day by round 7 below)**: billsum 7,000 (cc0-1.0),
    wikipedia 7,000 (cc-by-sa-3.0), hackernews 4,831 (apache-2.0), openwebtext 5,169 (cc0-1.0) =
    24,000 total.

- **2026-08-07, round 7 -- pure `normal`-register corpus + 5-way AI-ify diversity plan.**
  User pointed out something real: production (`frontend/app/humanizer/page.tsx`) only ever ships
  `normal` style -- `clear_structured`/`simple_formal` are parked in the backend/prompts but no UI
  path calls them. Two decisions followed from this:
  1. **Human corpus narrowed to pure normal/neutral register.** Deleted billsum (7,000,
     legislative-formal) and wikipedia (7,000, encyclopedic-formal) entirely -- training on those
     targets right now spends the LoRA's limited capacity on registers nothing ships, diluting the
     one register the GPTZero checkpoint actually tests. Kept hackernews-comments (casual/
     conversational) and openwebtext (neutral blog/news prose) -- both land in `normal` by
     register. Raised openwebtext's `target_rows` 6,000 → 19,000 to carry the corpus's volume
     alone (hackernews' pre-2018/150-word pool has a hard, already-measured ceiling of ~4,831;
     openwebtext's ~8M-document pool doesn't share that constraint). `SOURCE_CAP` raised 7,000 →
     20,000 since the 2-source design now deliberately allows one source to dominate.
     Re-collected: **24,000 total (openwebtext 19,169 / hackernews 4,831)**, re-verified with the
     real `is_web_chrome_pattern()` filter function against every row: 0 failures, 0 word-count
     outliers, 0 duplicates.
  2. **`style == "normal"` filter added to both `aiify_api.py` and `push_kaggle.py`'s
     `select_rows()`** so Step 3 (AI-ify) and everything downstream only ever spends generation
     budget (paid or free) on rows that match what ships, regardless of what the heuristic tagger
     assigns to any stray formal-sounding row inside hackernews/openwebtext.
  - **AI-ify diversity expanded 3-way → 5-way**, per explicit user instruction to avoid the single-
    AI-fingerprint failure mode (root cause #2) and approval to spend up to $20 across paid APIs
    ($5 Google, $5 Anthropic named as examples). New split in `aiify_split.py`: Kaggle 15%
    (self-hosted Qwen/Llama/Mistral rotation, free, opportunistic), Groq 45% (llama-3.3-70b, free),
    OpenAI 15% (gpt-4.1-mini, paid, no hard cap), Google 13% eligibility window (Gemini, paid,
    **hard-capped at $5 real measured spend**), Anthropic 12% eligibility window (Claude, paid,
    **hard-capped at $5 real measured spend**).
  - **Cost gating design, deliberately not a memorized-price guess**: `aiify_api.py`'s new
    `run_provider_budgeted()` runs a 20-row pilot batch per paid provider first, reads the actual
    `usage_metadata` token counts the API itself returns, computes a real measured $/row rate from
    that, then calculates how many more rows the remaining budget affords and stops the instant
    cumulative spend would exceed it -- same cost-gate philosophy as `tag.py`'s existing $3 gate,
    just measured live instead of estimated up front. Any rows left unclaimed in a paid bucket once
    its budget is spent stay `ai_text IS NULL` for a later top-up decision, not silently reassigned.
    `PRICING` dict holds this project's own approximate per-1M-token figures (Gemini Flash-Lite,
    Claude Haiku -- cheapest tier of each, chosen to maximize rows/$ since model-family diversity
    is the goal here, not per-call quality) labeled clearly as decision inputs, not a bill guarantee.
  - Installed `langchain-anthropic` and `langchain-google-genai` in the venv (not yet added to
    `requirements.txt`, matching how `datasets`/`datasketch`/`kaggle`/`langdetect` are already
    installed ad hoc for this finetune-only script directory rather than tracked as app deps).
    Added `ANTHROPIC_API_KEY` to `.env.example` (commented, alongside `GROQ_API_KEY`/
    `GOOGLE_API_KEY` which were already used this way but undocumented there) -- **user still
    needs to add the real key to `backend/.env` themselves; not requested or handled in chat.**
    `GOOGLE_API_KEY` is already set but previously (2026-08-06) hit `429 RESOURCE_EXHAUSTED --
    prepayment credits depleted` on that Google Cloud project -- will need retesting when
    `aiify_api.py` actually runs; if still exhausted, needs billing added on Google's side, not a
    code fix.
  - **Not yet run**: `aiify_api.py` has not been launched with the new providers (no money spent
    yet) -- it depends on `tag.py` completing first (only `status == "tagged"` rows are eligible),
    and `tag.py` has not been (re-)run against this corpus. That's the next step.

- **2026-08-07, round 8 -- outlier sweep, prompted by user asking "what about the outliers."**
  Went beyond the standard checks (word bounds, dedup, citations/headers) into structural/encoding
  outliers not previously measured. Found and fixed four more real, distinct issues, all via direct
  measurement, none assumed:
  1. **Mojibake** (double-encoded UTF-8, e.g. `canÃ¢Â\x80Â\x99t` -> `can't`, `BeyoncÃ©` -> `Beyoncé`)
     -- added `fix_encoding()` using `ftfy` (installed), run first in `clean_text()`.
  2. **Leftover HTML entities** (`&amp;`, `&#42;`, chains like `&amp;amp;amp;lt;`) -- looped
     `html.unescape()` up to 5 passes in the same function to fully resolve multi-encoded chains.
  3. **ASCII-art divider lines** (`____________________`, `....................`) -- found while
     investigating self-repetition (below); added `_DIVIDER_LINE` to the line-level filter.
  4. **Within-row scrape duplication** -- a 60+ char block appearing twice verbatim in the same
     row (e.g. an intro/snippet and the full body both captured by extraction). Added
     `has_self_repeated_block()` as a row-rejection check (same precedent as `is_web_chrome_pattern`
     -- reject rather than risk a bad partial dedup).
  - First measurement pass (24,000 rows): 25 mojibake, 438 HTML-entity, 62 self-repeat rows. Fixed
    in place (encoding/entities) or rejected (self-repeat) via a full reprocessing pass, backfilled
    to 24,000.
  - **Second measurement pass caught 2 more real, narrower gaps the first fix missed**: a residual
    `Â ` artifact (stray U+00C2 before a space, left behind by a non-breaking-space corruption that
    by this point is syntactically valid Unicode -- `ftfy` can't detect it anymore, confirmed via
    `ftfy.explain_unicode()`; fixed with a direct, well-justified `text.replace("Â ", " ")`), and
    `Author:`/`By:`/`Written by:` byline lines whose first-cut regex only matched a bare "Label:
    Full Name" and missed real variety (`"Author: Dr. Tony Phillips | Production editor: ..."`,
    `"By: Amid Zayed. 20 March, 2015"`, `"Author: SMTV24x7"` -- not even a person's name). Broadened
    to match the whole line whenever it starts with one of these labels.
  - One row (108754) had genuinely irreparable Unicode corruption in body content discussing
    mathematical/logic symbols themselves -- not fixable by any general rule, deleted rather than
    left corrupted.
  - Re-verified with the real filter functions after each fix, not approximations, until every
    check came back to 0: **0 out-of-bounds word counts, 0 self-repeated blocks, 0 web-chrome
    rows, 0 mojibake/Â-space artifacts, 0 leftover HTML entities, 0 byline lines, 0 exact
    duplicates -- across all 24,000 rows.** Final composition unchanged: openwebtext 19,268,
    hackernews 4,732 (some churn from the two reprocessing/backfill cycles).
  - Also hit two transient infra errors during this round unrelated to the data itself -- a DNS
    resolution blip and a "No route to host" mid-commit -- both resolved on retry after confirming
    connectivity was back; no data was corrupted by either (nothing had committed when they hit).

- **2026-08-07, round 9 -- Step 2 (style tagging) run, several real bugs found and fixed live.**
  1. **`.env` not actually loaded into `os.environ`**: pydantic-settings reads `backend/.env` into
     its own `Settings` object but never exports it to the real process environment, so `tag.py`'s
     `os.environ.get("GROQ_API_KEY")` returned `None` despite the key being set in `.env` --
     silently fell through to paid `gpt-5-nano` for the 200-row spot check before this was caught
     (~280 calls made, negligible cost, killed once noticed). Fixed with an explicit `load_dotenv()`
     added to both `tag.py` and `aiify_api.py` (same latent bug existed there too, unhit so far).
  2. **Agreement-percentage bug**: `agreement = agree / len(spot_check_rows)` counted every failed/
     rate-limited spot-check call (which returns `None`) as a *disagreement*, not "no data" --
     under real Groq throttling (6,000 TPM limit on this account, confirmed via the user's own Groq
     dashboard) this produced a bogus 9.0% reading that would have triggered an unnecessary
     ~24,000-row fallback at an unsustainable rate (~30 hours projected at that throttled pace).
     Fixed to compute agreement only over rows that actually got classified, with the failure count
     logged separately. Re-measured honestly after the fix: **14.1% real agreement (26/184
     answered)** -- genuinely low, not a measurement artifact, confirmed by a second independent
     spot-check run.
  3. **Shared-client bug**: the spot-check and full-corpus-fallback passes used the same `nano`
     client object, so when Groq was picked for the (cheap, throttle-tolerant) spot check, the
     *full-corpus* fallback would have inherited it too -- at Groq's real throughput that's the
     same ~30-hour wall. Fixed by splitting into `spot_check_llm` (Groq if available) and
     `fallback_llm` (always paid `gpt-5-nano`), decided once and used consistently.
  4. **Resume-path concurrency bug**: found while preparing a "run faster" request -- on a resumed
     run (`.tag_nano_cursor.json` non-empty), `NANO_CONCURRENCY` would have silently stayed at
     Groq's spot-check value (3) instead of the paid-nano value, since that branch never explicitly
     reset it. Fixed by extracting a single `FALLBACK_CONCURRENCY` constant used consistently by
     both the fresh-fallback and resume paths.
  5. **User asked to speed up the paid-nano pass (concurrency 15 -> 30).** Investigated, found a
     documented incident already in this file (concurrency=20 in the *original* attempt caused
     56,430 HTTP 429s and silently mis-tagged 18,553/20,000 rows via the old fail-open behavior) --
     concluded 30 would very likely repeat or worsen that, reverted the plan, kept
     `FALLBACK_CONCURRENCY = 15` (proven safe this session, 0 failures). Explained the reasoning
     and declined the speed-up rather than re-risking a known failure mode on a latency guess.
  - **Real cost was ~4.75x the pre-run estimate**: script estimated ~$0.93 for 24,000 rows;
    **actual final cost confirmed by the user's own OpenAI usage dashboard: $4.42.** Confirms
    `EST_INPUT_COST_PER_1M`/`EST_OUTPUT_COST_PER_1M` in `tag.py` are stale/wrong and the $3 cost
    gate would have under-protected here had the user not manually cross-checked; not fixed in
    code yet (worth revisiting the constants before the
    next paid run of this script). User explicitly approved continuing once the real cost trend
    became clear mid-run (checked at $0.42 and $0.60 partway through); final actual: $4.42.
  - **Final result: 24,000/24,000 rows tagged via paid `gpt-5-nano`, 0 failed.** Real distribution
    (not the heuristic's): **normal 12,787 (53.3%), clear_structured 8,308 (34.6%), simple_formal
    2,905 (12.1%)** -- notably different from the free heuristic's earlier 94.9%-normal read,
    confirming the low agreement was real: nano is much stricter about what counts as `normal`
    than the heuristic's default-unless-formal-signals logic. By source: hackernews is
    overwhelmingly `normal` (4,560/4,732); openwebtext splits roughly evenly across all three
    (8,227/8,153/2,888). **Usable `normal`-only pool for Step 3 (per the earlier
    production-only-ships-normal decision): 12,787 rows**, not the ~22,778 the heuristic implied.

- **2026-08-08, round 10 -- Groq dropped from the Step 3 AI-ify mix.** After living through Step
  2's Groq rate-limit problems directly (6,000 TPM confirmed via the user's own Groq dashboard),
  user asked to remove Groq from the plan entirely -- not worth the unreliability for a step that
  needs to process many more rows than a 200-row spot check. Rebalanced `aiify_split.py` from 5
  providers to 4, redistributing Groq's old 45% share: **Kaggle 40%** (self-hosted Qwen/Llama/
  Mistral rotation, free -- raised significantly since the account's GPU quota is back to a full
  30h/week, confirmed via the user's Kaggle dashboard, vs. the ~2h8m that justified keeping it
  small originally), **OpenAI 25%** (paid, no hard cap, raised since it has no rate-limit history
  like Groq's), **Google 20%** and **Anthropic 15%** (both paid, unchanged, still hard-capped at
  $5 real measured spend each via the pilot-batch cost-gating in `aiify_api.py`). Removed all
  Groq code paths from `aiify_api.py` (client construction, concurrency constant, `run_provider`
  dispatch) -- confirmed via grep only historical/comment references to Groq remain, no live code.
  **Not yet run.** Still blocked on: `ANTHROPIC_API_KEY` needs to be added to `backend/.env` by the
  user (not handled in chat); `GOOGLE_API_KEY` is set but was credit-exhausted as of 2026-08-06,
  untested since -- first Google pilot batch will reveal if that's resolved.

- **2026-08-08, round 11 -- Google verified working, a real response-format bug fixed, Gemma
  ruled out, Anthropic parked (funds).**
  - **Google unblocked**: user added $5 credits to Google AI Studio, resolving the earlier
    `429 RESOURCE_EXHAUSTED` from 2026-08-06. Verified end-to-end with a real call.
  - **Found and fixed a real bug** in `aiify_one_langchain()`: `gemini-flash-lite-latest` returns
    `.content` as a list of content blocks (`[{'type': 'text', 'text': '...'}]`), not a plain
    string like other providers -- the old `.strip()` call would have crashed on every Google
    call. Added `_extract_text()` to normalize both shapes; verified with a real end-to-end
    AI-ify call afterward (real cost measured: **$0.0000287/row** -- the $5 budget covers far
    more than the ~2,500 rows Google's 20% share of the 12,787-row pool would ever need).
  - **Investigated Gemma 4 as a second, distinct Google-family model** (user asked whether Google
    offers anything besides Gemini). Ruled out after two real test failures: `gemma-4-26b-a4b-it`
    is a mandatory-reasoning model that cannot have "thinking" disabled (confirmed via a direct
    `thinking_budget=0` API call --> `400 INVALID_ARGUMENT: Thinking budget is not supported for
    this model`), and at both 1024 and 3000 max_output_tokens it burned the *entire* budget on
    internal reasoning for a realistic-length input, producing zero usable rewrite either time
    (paid, cost $0.0004 and $0.0012 respectively, for nothing). Also clarified for the user:
    Gemma isn't even architecturally distinct from Gemini -- same underlying research lineage,
    open-weight release rather than a separate model family -- so it wouldn't have added real
    fingerprint diversity even if it had worked. Not integrated.
  - **Anthropic parked, not removed** -- user is out of funds. Correctly declined a request to
    use the Claude Pro (claude.ai) subscription as a substitute for API access: Pro doesn't grant
    API credits, and automating the consumer chat UI to stand in for the API would violate
    Anthropic's consumer ToS (same category of thing as the CleverAI-scraping idea declined
    earlier in this project -- not attempted). Also checked OpenRouter/DeepSeek as a free
    alternative: confirmed via OpenRouter's real model listing that DeepSeek V4 Flash is not free
    either (~$0.00000009/$0.00000018 per token -- extremely cheap, but still requires billing set
    up), so not pursued while funds are the constraint.
  - **Rebalanced to 3 active providers**, all already funded, zero new spend required:
    **Kaggle 55%** (`id % 100 < 55`, raised further since it's free and has full 30h/week quota),
    **OpenAI 25%** (`55-80`, unchanged budget, already has balance from Step 2), **Google 20%**
    (`80-100`, capped at the user's existing $5 credit). `ANTHROPIC_BUCKET` kept as a commented-out
    constant in `aiify_split.py` (not deleted) plus a working-but-uncalled
    `make_langchain_client("anthropic")` branch in `aiify_api.py`, so re-adding Claude later (once
    `ANTHROPIC_API_KEY` exists and funds allow) is a small diff, not a redesign.
  - **Still not yet run.** Ready to launch Step 3 with the 3-provider split above whenever given
    the go-ahead.

- **2026-08-08, round 13 -- Anthropic restored, split rebalanced toward production models, Step 3
  launched, and a real Kaggle dataset-collision bug caught and fixed mid-run.**
  - **Anthropic unblocked**: user added funds + created `ANTHROPIC_API_KEY`, added to `backend/.env`
    themselves (not handled in chat). Verified end-to-end with a real call: `claude-haiku-4-5-20251001`
    returns plain-string `.content` (unlike Gemini's list-of-blocks format), no compatibility fix
    needed. Real measured cost: **$0.000434/row**.
  - **Split rebalanced on user's correct observation**: real users overwhelmingly paste ChatGPT/
    Gemini/Claude output when asking to humanize text, not raw open-weights model output, and
    GPTZero-style detectors are themselves calibrated against those same frontier models -- so the
    corpus should be weighted toward what's actually detected/pasted, not just "avoid one
    fingerprint" in the abstract. New split: **OpenAI 35%, Google 30%, Anthropic 25%, Kaggle 10%**
    (down from Kaggle's round-10 55%). Kept Kaggle single-model (Qwen2.5-3B) rather than building
    the 3-way rotation -- at 10% (~1,279 rows), splitting further across 3 models would leave too
    few rows per model to matter, and re-risks real fragility the original attempt hit hard (11
    separate bugs stabilizing just one Kaggle model).
  - **Real estimated cost for this split**: OpenAI ~$4.48, Google ~$0.11, Anthropic ~$1.39, Kaggle
    $0 -- ~$5.98 new spend, ~$10.40 cumulative for the whole checkpoint so far (still under the
    $20 envelope).
  - **Launched Step 3**: `aiify_api.py` (OpenAI -> Google -> Anthropic, sequential) started locally;
    `push_kaggle.py` pushed a parallel Kaggle chunk.
  - **Real bug found and fixed mid-run**: the first Kaggle push silently processed the WRONG data.
    User noticed via the Kaggle UI screenshot that the running kernel's own log said "Loaded 2500
    rows" when we'd pushed 1,262. Root-caused by downloading the "new" dataset directly and finding
    it still had the old attempt's 2,500-row content -- `dataset_create_new()` on an already-existing
    slug (`finetune-chunk-00-input`, left over from the *original* Phase 2 attempt weeks earlier)
    did not error and did not overwrite; the kernel silently read stale data. Root cause: chunk
    naming (`chunk-00`, `chunk-01`, ...) is derived from the *local* manifest's length, which has
    no way to know what already exists on Kaggle's remote servers -- and this session's local
    manifest had been reset earlier, restarting the counter at 0 and colliding with a live remote
    resource from weeks ago. **Kaggle's API has no way to stop a running kernel programmatically**
    (checked directly, no such method exists in the client or CLI) -- had the user manually stop it
    via the Kaggle website. Fixed `push_kaggle.py`: both the dataset slug and kernel slug now get a
    unique epoch-timestamp suffix, making collision with any past or future resource structurally
    impossible regardless of local/remote naming-counter drift. **Verified the fix for real**:
    downloaded the freshly-pushed dataset directly afterward and confirmed exactly 1,262 rows this
    time, not 2,500.
  - **Cleanup**: listed the account's actual Kaggle datasets/kernels via the API (not assumed) --
    found 15 leftover datasets and 15 leftover kernels from the original attempt (`chunk-00`
    through `chunk-14`), confirmed with the user these were the source of the collision and safe to
    remove. Kaggle's API has no delete method for datasets or kernels either (checked) -- user
    deleted all 30 manually via the Kaggle website. Re-verified via the API afterward: 0 datasets,
    0 kernels remaining (clean account).
  - **OpenAI leg completed fully**: all 4,461 rows AI-ified, 0 failed.
  - **Real bug #2, found live**: a transient `psycopg2.OperationalError: SSL connection has been
    closed unexpectedly` crashed the whole script during the Google leg (120/rows in) -- unlike
    `tag.py`, `run_provider()`/`run_provider_budgeted()` had no retry-with-rollback around
    `db.commit()`, so an unhandled exception killed the process outright instead of retrying.
    Fixed by adding a shared `commit_with_retry()` helper (3 attempts, rollback + backoff between
    each, same pattern already proven in `tag.py`) used by both functions. Verified no data lost
    (OpenAI's completed rows were all safely committed already) and restarted cleanly -- confirmed
    via a fresh DB query that OpenAI's bucket was recognized as 100% done (skipped) and Google
    resumed correctly.
  - **Current state**: OpenAI leg complete (4,461/4,461). Google leg restarted (re-running its
    pilot batch, since per-run budget tracking doesn't persist across restarts by design), Anthropic
    queued after. Kaggle chunk (1,262 rows, correctly verified) running on Kaggle's own GPU servers
    in the background, does not require the user's laptop to stay on.

- **2026-08-08, round 14 -- real Google pricing bug found and fixed live (mid-run), cheaper Google
  model swap, Anthropic ran out of real funds twice, overflow to Google, Step 3 API legs completed.**
  - **Real bug, not a guess**: user's real Google AI Studio dashboard showed $2.50 spent while the
    script's own live tracker believed only $0.373 -- a ~6.7x gap. Root-caused by fetching Google's
    actual pricing page directly (not memory): `PRICING["google"]` had $0.10/$0.40 per 1M
    input/output tokens; the real rate for `gemini-flash-lite-latest` is **$0.30/$2.50** -- output
    alone off by 6.25x, which dominates AI-ify's cost since it's a full-rewrite (output-heavy) task.
    Fixed the constants. Cross-checked OpenAI ($0.40/$1.60) and Anthropic ($1.00/$5.00) against their
    real pricing pages at the same time -- both already correct, only Google was wrong.
  - **Swapped to a cheaper still-supported Google model** at the user's request: `gemini-2.5-flash-lite`
    ($0.10/$0.40, would have been ideal) returned a real 404 -- "no longer available to new users."
    `gemini-3.5-flash-lite` turned out to be the same price as `-latest` (both $0.30/$2.50 -- `-latest`
    already resolves to the 3.5 generation). Landed on **`gemini-3.1-flash-lite`** ($0.25/$1.50),
    verified working with a real end-to-end call, ~3.2x cheaper than what had been running. Switching
    mid-corpus is safe -- rows already done with the old model keep that `ai_text` permanently, only
    unprocessed rows pick up the new one.
  - **Also fixed**: `run_provider()`/`run_provider_budgeted()` had no retry-with-rollback around
    `db.commit()` (unlike `tag.py`) -- a transient SSL drop crashed the whole process once during the
    Google leg. Added a shared `commit_with_retry()` helper (3 attempts, rollback + backoff) to both.
  - **Raised concurrency after confirming zero real rate-limit errors** at the conservative starting
    values (Google 5->15, Anthropic 5->10) -- verified via grep that all "429"-looking log matches
    were false positives (millisecond timestamp fragments), not real throttling.
  - **Anthropic ran out of real funds mid-run, twice.** First: the $5 approved budget was consumed
    (script's own tracker said $5.0049 spent, 1,720/3,624 rows done, 1,904 left unclaimed -- Google's
    own bucket finished cleanly in the same run at $1.5579 of its $5). User added a fresh $5; restarted
    -- this run also hit its cap (1,176 more rows, $4.8716 spent, 304 left). User checked their real
    Anthropic balance directly: **$0.13** remained, not the ~$0.13-ish the tracker's leftover $0.1284
    coincidentally matched (first time script-tracked and real dashboard agreed closely). Real
    remaining balance ($0.13) could only afford ~31 rows at the real measured $0.004143/row rate, not
    all 304 -- **user's call: spend exactly the real $0.13 on Anthropic, then send whatever's left in
    Anthropic's bucket to Google instead** (Google had finished its own bucket already, cheaply, with
    real headroom). Wrote a small one-off script (`aiify_anthropic_overflow.py`, temporarily overrides
    `BUDGET_USD` rather than changing the permanent split) -- Anthropic leg spent $0.1273 on 26 rows,
    then Google absorbed the remaining 278 rows for $0.2485. **Zero rows lost, 100% of both buckets'
    original row allocations covered**, just partly by a different model than originally planned for
    that specific slice.
  - **All three API legs (OpenAI, Google, Anthropic) now fully complete.** Real final costs, confirmed
    by the user's own dashboards (not script estimates) -- corrected once already: an initial "OpenAI
    ~$4.00" guess for just the AI-ify leg was superseded by a screenshot of the real OpenAI usage
    dashboard (platform.openai.com/settings/organization/usage, 07/25/26-08/09/26 range) showing
    **$18.26 total**, which covers Step 2 tagging AND Step 3 AI-ify combined, not AI-ify alone.
    **Real final total: OpenAI $18.26 (both steps), Google $5.73 (Step 3 only), Anthropic $10.01
    (Step 3 only) = $34.00 for the whole checkpoint so far** -- well over the originally-discussed $20
    envelope, driven mainly by the Google pricing bug (before the fix) and the two Anthropic budget
    overruns. Also visible on the OpenAI dashboard: the user is at $18.18/$20.00 of their August
    personal spending cap, a real constraint independent of this project. Flagged plainly to the user
    rather than glossed over, even though already spent.
  - **Saved a standing memory** (`cost_estimation_no_guessing.md`) after this: never estimate API
    pricing from memory again, always verify against the real pricing page before spending, and treat
    the user's own dashboard as the source of truth over any script-internal tracker, especially
    across restarts.
  - **Kaggle chunk completed and pulled** (2026-08-09): kernel finished on Kaggle's own GPU (Qwen2.5-3B),
    `pull_kaggle.py` downloaded and ingested all 1,262 rows successfully, $0 cost, no local machine
    time needed for the ~7-hour GPU run itself (only for the initial push and final pull).
  - **STEP 3 (AI-ify) COMPLETE.** Final corpus state: **12,785 / 12,787 `normal`-style rows now have
    `ai_text`** (2 rows failed after retries during an earlier Google batch and remain unprocessed --
    negligible, can be backfilled later if desired, not blocking). Real final model/provider mix:
    Kaggle (Qwen2.5-3B, ~1,262 rows), OpenAI (gpt-4.1-mini, 4,461 rows), Google (gemini-flash-lite-latest
    then gemini-3.1-flash-lite, ~4,142 rows including the Anthropic overflow), Anthropic (claude-haiku-4-5,
    1,746 rows). Real total cost for the whole checkpoint through Step 3: **$34.00** (see round 14 above
    for the full breakdown and the pricing-bug history behind it).
  - **Next**: Step 4, export train/eval split (`export.py`), not yet started.

Read the rest of this file below for the full original diagnosis (contamination, fingerprint
mismatch, cost history) — that reasoning is why the checkpoint is scoped the way it is above.
Update this section, not delete it, as the checkpoint progresses.

---

## ⏸️ PHASE 2 CLOSED OUT, 2026-08-05 — original attempt, superseded by the reopened checkpoint above

**Decision: ship what works (Phase 1's prompt-based pipeline, `normal` tone only) and park this
research. Read this section first if picking this up again — it tells you exactly where things
stand and what to do differently next time.**

**What was built**: a complete, working, rerunnable end-to-end pipeline —
`collect.py` (corpus) → `tag.py` (style labeling) → Kaggle `push_kaggle.py`/`aiify_notebook.ipynb`/
`pull_kaggle.py` (AI-ify generation) → `export.py` (train/eval split) → `train_modal.py` (LoRA
fine-tune on Modal, with guardrails, checkpointing, and GGUF export) → `local_qa.py` (Ollama
testing) → `eval_detector.py` (proxy eval). Every step works, is documented below with its exact
resume command, and can be rerun today with no code changes if the underlying data problem gets
fixed. **This is the main asset of Phase 2** — not the specific trained adapter, which didn't
clear the bar.

**Results**: real GPTZero checks across two validation rounds, 15 samples total, genuinely
AI-generated inputs (not hand-written), varied topics/lengths/registers — **3/15 passed (20%)**.
Not reliable enough to ship as a detector-beating claim. Of the 12 failures, most were flagged
"AI Paraphrased" (the model is doing *something* real, just not enough), not raw "AI Generated."

**Two root causes identified, in order of confidence** (full reasoning in the "Step 6 validation
batch" section below — not re-derived here):
1. **Training data volume is thin for the task.** ~1,258 real training examples for the one style
   (`normal`) that was largely uncontaminated is a small dataset for a 7B LoRA to learn a
   detector-robust distributional shift across arbitrary topics/registers.
2. **Train/test "AI fingerprint" mismatch.** Training `ai_text` was generated by one fixed model
   (Qwen2.5-3B, one fixed prompt) AI-ifying old Reddit/billsum/essay-bank source text. Real-world
   validation inputs came from a different, more capable production LLM on unrelated topics. The
   LoRA learned to reverse *one specific model's* AI-ification pattern, with no strong reason to
   expect that generalizes to a structurally different model's patterns. This would persist even
   with a perfectly clean corpus — it's not a data-quality bug, it's a design mismatch.
   (A separate, real but *secondary* data-quality issue was also found and partially addressed:
   ~30-37% IvyPanda essay-bank contamination in the `clear_structured`/`simple_formal` style
   buckets, causing a spurious "Essay" title reflex. Confirmed this did NOT independently explain
   the failure rate — `normal`, at only 3.1% contamination, still only passed 20%.)

**Concrete next steps if this is revisited**:
- Diversify the AI-ify generation step across multiple models/prompts (not one fixed Qwen2.5-3B
  call) — the goal is to teach the LoRA to reverse a broad "AI fingerprint," not one narrow one.
- Match the AI-ify source distribution to what production validation will actually look like —
  generate (or supplement) training `ai_text` using the same class of model (or a similar
  production LLM) that real users' pasted text will resemble, not an unrelated cheap model.
- Only then scale up data volume — more data behind the wrong distribution won't fix a fingerprint
  mismatch, but is likely still necessary once the distribution problem is addressed.
- Reconsider the training objective itself — supervised pairs (what was done here) may be
  fundamentally weaker than training directly against detector feedback (DPO/preference-style),
  given how much of the failure mode looks like "real but insufficient" rewriting.

**Cost**: ~$20 total across the whole phase (Step 2 tagging ~$1.38, Step 3 AI-ify on Kaggle's free
GPU tier ~$0, Step 5 Modal LoRA training ~$6.21 across all attempts including failed ones, plus
incidental OpenAI usage generating benchmark/validation inputs and running Phase-1-pipeline
comparisons in Step 7). Comfortably under the original $10-25 Modal-specific budget and the
project's overall risk tolerance for this experiment.

**Housekeeping at close-out (2026-08-05, verified)**: `modal container list` showed 0 active
containers (nothing billable running); the `humaniser-lora-training` app is just a dormant
deployment record with no cost. All Kaggle kernels checked (`chunk-01/02/05/06/08/09/10/11/12/13/14`)
are in terminal states (COMPLETE/CANCEL_ACKNOWLEDGED/ERROR) — none running. **Nothing was torn
down because nothing billable was left running.** The trained LoRA adapter and GGUF export remain
on the Modal Volume `humaniser-lora-checkpoints` (paths: `/run/adapter_final` and
`/run/humaniser-lora.q8_0.gguf`) for future use if this is revisited — kept deliberately, since
re-generating them would cost real money again. Modal Volume storage has a small ongoing cost;
acceptable given the alternative is re-paying the ~$6 training cost from scratch.

**2026-08-06 local disk cleanup**: removed the *local* copies only — the project-folder GGUF
(`ollama_model/humaniser-lora.q8_0.gguf`, 7.5GB) and the Ollama-installed model
(`ollama rm humaniser-lora`, 8.1GB) — since the model is disqualified from shipping (fake-citation
bug) regardless of detector performance, and isn't part of the current checkpoint's active work.
**The Modal Volume master copy above is untouched** — if this specific old adapter is ever needed
again (e.g. to re-verify the citation bug), pull it back with `modal volume get
humaniser-lora-checkpoints /run/humaniser-lora.q8_0.gguf <local path>` and `ollama create` it
again from the kept `ollama_model/Modelfile`. Also removed: superseded `kaggle/work/chunk-*`
directories (~41MB, results already in the DB), stale `.modal_run_id.json` (old completed run),
`eval_detector_results.json` (the GPT-2 perplexity/burstiness proxy metric, later found unreliable
against real GPTZero results), and app-code `__pycache__` dirs.

**If resuming**: the pipeline scripts, the corpus in `finetune_samples`, and the two root causes
above are the starting point. Don't re-run Step 3-5 with the same AI-ify design and expect a
different result — the fingerprint-mismatch fix has to happen first.

---

**Read this file before doing anything else in Phase 2.** This build spans many sessions;
context compaction loses chat history, so this file — not the conversation — is the source
of truth. Update it at every meaningful checkpoint, not just at session end.

If the user says "continue Phase 2", start by reading this file top to bottom, then resume
at the step marked `IN PROGRESS` / `NEXT` below. Do not re-derive decisions already recorded here.

---

## Goal

Replace the prompt-based Pass 2 rewrite (`backend/app/services/humanizer/pipeline.py`) with a
LoRA-fine-tuned open model (Qwen 2.5 7B Instruct) so Humanizer output is statistically
human-shaped, not just prompt-steered. Current prompt-based output scores 100% AI on GPTZero;
the goal is a fine-tuned model whose output reads meaningfully closer to human on the same
detector.

Division of labor (user's explicit budget design — do not change without asking):
- **This Mac (local)**: data prep, dataset building, orchestration, local QA. CPU-only.
- **Kaggle free GPU**: AI-ify generation step (Step 3). Free, interruptible, resumable.
- **Modal (paid, ~$10-25)**: LoRA training run only (Step 5). Must-finish-in-one-piece work.
- **Ollama (local)**: inference QA of the finished model (Step 6), before any deployment.
- **Fireworks or Modal serverless**: production inference (Step 8), pay-per-token.

## Hard rules (do not relax these without the user explicitly re-confirming)

- Print a cost estimate and **WAIT** for explicit go-ahead before:
  (a) any OpenAI API run projected over $3
  (b) launching any Modal GPU job
- Also always stop and wait at: the Step 3 10-pair AI-ify spot check, and the Step 6 GPTZero
  handoff (user pastes 5 outputs into GPTZero themselves and reports scores back — nothing in
  Step 8 starts until they do).
- **$7 soft ceiling on cumulative Step 2 (tagging) spend, set 2026-08-02.** Current estimate
  ~$0.93 (see "Dollars spent so far" below for the exact method). Before any future tagging
  fix/re-run that could plausibly push cumulative spend past $7, stop and print an estimate for
  the user first. This is in addition to, not instead of, the $3-per-action gate.
- Pre-approved by the user (2026-08 approval), no need to re-ask:
  - License-permissive HF dataset selection.
  - Style tagging via local heuristics/Ollama.
  - Any single OpenAI spend under $3.
- Kaggle/Modal/Fireworks accounts belong to the user — never attempt to create accounts or
  complete their OAuth/login flows. When a credential is needed, say exactly which env var or
  file path it goes in and wait.
- Resumable/idempotent at every stage — a killed process must lose no completed work.
- Tear down anything billable (Modal apps/volumes, Kaggle kernels left running) once its step
  is done.
- Nothing gets committed to git during this phase without the user reviewing first.
- Nothing in Step 8 (deploy) happens before the user has personally reported back GPTZero
  numbers from Step 6.

## Account / credential status

| Service | Status | Env var / file | Notes |
|---|---|---|---|
| Kaggle | **READY** (verified 2026-08-01 22:11) | `~/.kaggle/kaggle.json` present, chmod 600, `username`+`key` both set. Confirmed live: `kaggle datasets list` returned real results. | Ready for Step 3. |
| Modal | **READY** (verified 2026-08-01 22:11) | `~/.modal.toml` present with `token_id`+`token_secret` set. `modal` importable in `backend/venv` (0.77.0). Not yet smoke-tested with an actual `modal run`. | Ready for Step 5, still subject to the cost-gate/wait rule regardless of account readiness. |
| Ollama | **Binary installed** (verified 2026-08-01 22:11, `/usr/local/bin/ollama`) | binary on PATH; not yet confirmed `ollama serve` is running or any model pulled | Wasn't needed for Step 2 in the end (nano fallback path was used — see run log). Will confirm serve status + pull a model when Step 6 needs it. |
| Fireworks | Not yet needed | `FIREWORKS_API_KEY` (TBD — only if Fireworks chosen over Modal serverless in Step 8) | Decide at Step 8. |
| OpenAI | Already configured (`OPENAI_API_KEY` in backend/.env) | — | Used for gpt-5-nano fallback in Step 2/3 if needed, under $3 pre-approved. |

**Do not block on any of the above.** Continue local work; only stop when a specific step
genuinely cannot proceed without a credential, and say exactly what's needed.

## Dollars spent so far

**~$1.38 estimated final total for Step 2 (all gpt-5-nano; Step 1 collection is $0 — HF/Kaggle
downloads have no per-call cost)**, as of 2026-08-02 ~10:34, Step 2 now DONE.

Method: counted every HTTP `200 OK` from `api.openai.com` across all `tag_run*.log` files
(54,261 total across `tag_run.log` through `tag_run8.log`) — this is the actual number of
*billed* calls; `429` rate-limit responses (66,000ish, mostly from the two buggy early runs)
are rejected before any completion is generated and cost nothing. Estimated ~475 input
tokens/call (1500-char truncated text + prompt overhead) and ~4 output tokens/call (one-word
answer), at placeholder rates (`$0.05`/`$0.40` per 1M input/output tokens — approximate, not
verified real gpt-5-nano pricing) → **~$1.38**. Not exact, but very unlikely to be off by more
than 2-3x, which still lands comfortably under the $7 ceiling.

**User-set soft ceiling for this entire tagging step (Step 2), effective 2026-08-02: $7
total.** If a future fix to `tag.py`/`collect.py` would plausibly push cumulative spend past
$7, STOP and print an estimate for the user before running it — this is now a standing rule
for the rest of Step 2, on top of (not replacing) the existing per-action $3 gate. Recompute
cumulative spend the same way (count `200 OK` across all `tag_run*.log` files) before any
action that could push near the ceiling.

## Step status

| Step | Status | Notes |
|---|---|---|
| 1. Corpus collection | **DONE** | 20,000/20,000 samples in `finetune_samples`. All `license=mit`, `status=collected`, `style=NULL` (Step 2 fills this in). Word count: min=151 max=1200 avg=677. Source: `artem9k/ai-text-detection-pile` only (see decision below) — `human_ai_text=NULL` for all rows, needs Step 3 AI-ify. Resume cursor at `backend/scripts/finetune/.collect_cursor.json` (`{"artem9k/ai-text-detection-pile": 30794}` — re-running `collect.py` continues from row 30794 of the stream, or add a second source to `SOURCES` in `collect.py` and it'll pull from that too since the 20k target is already met, would need raising `TARGET_TOTAL` first). |
| 1b. Corpus repair (shuffle bug) | **DONE, feeding into Step 2** | The original 29,883-row corpus finished tagging at 03:16 (see run log), but the rebalance was newly broken in the *opposite* direction (75.5% clear_structured, 2.3% normal) -- root-caused to a **Step 1 bug**, not a tagging bug: `collect.py` streamed HF datasets without shuffling, so "first N qualifying rows" from `artem9k/ai-text-detection-pile` turned out to be ~99% one sub-source (ivypanda-essays) by accident of file/shard ordering, not the representative Reddit/WebText/essays mix the dataset card describes. Fixed `collect.py` to `.shuffle(seed=42, buffer_size=10000)` the stream. Pruned the mis-sampled excess (kept a random 6,000 of the essay-heavy `clear_structured` rows, deleted 10,366), re-ran `collect.py` with shuffling (target_rows bumped back to 20,000 for `artem9k`) -- **spot-checked the new pull and it's genuinely diverse this time** (Reddit-style first-person fiction/narrative, confirmed by direct sampling). Corpus now 39,517 rows total, 20,000 of them freshly collected and pending tagging. |
| 2. Style tagging | **DONE** (finished 2026-08-02 10:34) | Final tagging pass: 20,000 newly-shuffled rows, 54,261 total billed calls across the whole step, ~$1.38. Rebalance came back plausible (51.7% normal / 31.4% clear_structured / 16.9% simple_formal) -- **spot-checked 4 random rows per style directly against the DB** (not just the aggregate numbers) and confirmed genuinely correct: `normal` = casual first-person narrative, `clear_structured` = essay/report-titled + one legislative-summary example, `simple_formal` = all billsum legislative summaries. Pruned to the exact 50/25/25 target at the top of the 15k-25k band: **25,000 total (12,500 / 6,250 / 6,250)**. Deleted 14,517 excess rows via random subsampling per style (kept the ratio exact, not the raw content -- no further content decisions made here). Cleared both `.tag_nano_cursor.json` and `.collect_cursor.json` (stale after all this pruning; meaningless for a finalized corpus). All 25,000 rows: `status=tagged`, `ai_text=NULL` (none of the sources had paired AI text -- Step 3 needs to generate AI-ify text for all 25,000). |
| 3. AI-ify on Kaggle | **STOPPED by user decision, 4,231/6,000 exported to Step 4** | Confirmed config: `Qwen2.5-3B-Instruct`, plain fp16, `device_map={'': 0}`, `BATCH_SIZE=1`. See full stop rationale and skewed-style note further down this file. |
| 4. Dataset export | **DONE** (2026-08-04) | `export.py` written and run. 4,231 `ai_ready` rows exported as-is (no rebalancing). 95/5 stratified train/eval split (4,019 train / 212 eval), leakage-checked (no shared row ids, no shared exact-text duplicates between splits). Chat-format JSONL: `system` = real production Pass-2 prompt (`app.services.humanizer.prompts.BASE_PROMPT` + `STYLE_GUIDANCE[style]`, imported directly, not retyped), `user` = `ai_text`, `assistant` = `human_text`. Output: `backend/scripts/finetune/data/{train,eval}.jsonl` + `export_manifest.json`. All exported rows marked `status='exported'` in DB. |
| 5. LoRA training (Modal) | **RUNNING (detached), launched 2026-08-04 ~23:0x** | `train_modal.py` — cost-gated by design (plan-only unless `--go`). Config: `Qwen/Qwen2.5-7B-Instruct` base, LoRA rank=16/alpha=32 on q/k/v/o_proj, 3 epochs, effective batch 16, max_seq_len=2048, GPU=`A100-40GB`. Per user's requirements: checkpoints every epoch, eval loss printed per epoch, `GuardrailCallback` stops early on train-loss divergence or eval-loss plateau (patience=2), on completion prints 10 eval-split sample generations vs. human ground truth, saves adapter + merges/converts to GGUF (`q8_0`) for Ollama, reports actual $ spent vs. the ~$4.06 estimate.

**Real launch bugs hit and fixed (all before/without wasting meaningful training time)**:
- `@app.function` must be at module scope, not nested in `launch()` -- `modal.exception.InvalidError`. Fixed by moving `app`/`image`/`volume`/`train` to module level, passing data via explicit `.remote()`/`.spawn()` kwargs instead of closures.
- Local `modal` package was actually 0.77.0 (deprecated by Modal's server), despite an earlier session note claiming 1.5.3 -- upgraded via `pip install --upgrade modal` (now genuinely 1.5.3), smoke-tested with a trivial function before retrying the real job.
- Modal requires a payment method on file for A100-40GB -- account-level blocker, stopped and asked the user rather than guessing a workaround (per standing rule). User added one ($30 credits confirmed).
- `trl`'s `SFTTrainer` import needs `rich`, not declared as a hard dependency in trl 0.11.4 -- added to the image's `pip_install`.
- **Real architecture bug, not just a missing package**: first successful deployment used `with app.run(): train.remote(...)` -- an *ephemeral* app whose lifetime is tied to the local process's heartbeat connection to Modal. A transient local network blip (DNS resolution failure -- this machine has hit this exact class of issue before, during Kaggle monitoring earlier in this session) caused Modal to tear down the entire app (`APP_STATE_STOPPED`), killing the training run, not just local monitoring. **Real progress was NOT fully lost**: a full HF Trainer checkpoint (`checkpoint-251`, includes adapter weights + optimizer/scheduler/rng state) had already been committed to the volume before the app was stopped, confirmed via `modal volume ls`. Fixed properly: switched to `app.deploy()` + `train.spawn(...)` (detached execution -- the remote job runs independently of this terminal/process; a local network drop no longer affects it at all), with the call id saved to `.modal_run_id.json` for polling via `--check` from any future session. Also added resume-from-checkpoint logic to `train()` itself (checks for existing `checkpoint-*` dirs on the volume, resumes from the latest one) so this kind of interruption doesn't waste completed work going forward.

**Second failure and fix (2026-08-04, detached run this time -- confirmed the detach fix worked, since this failure showed up cleanly in the Modal dashboard/logs rather than silently killing local monitoring)**: the detached run itself failed after 40m56s with `torch.OutOfMemoryError: CUDA out of memory. Tried to allocate 9.28 GiB` -- NOT a training-step OOM, NOT a timeout, NOT a CUDA driver error. Root cause, confirmed from the full traceback: it died inside `trainer.evaluate()` at step 502 (exactly the epoch-2 boundary, ~251 steps/epoch) -- Qwen2.5-7B's ~152k vocab means the fp32-upcast loss computation needs a huge `[eval_batch, seq_len, vocab_size]` logits tensor, and `per_device_eval_batch_size` was silently defaulting to match the train batch size (4), which didn't fit alongside the ~30.87GB already pinned by model+optimizer+LoRA state at that point. Confirmed via `modal volume ls` that the run correctly **resumed from `checkpoint-251`** (log's step/epoch math lined up exactly) and completed all of epoch 2's training steps, but crashed during eval *before* the epoch-2 checkpoint could save -- so no new checkpoint was gained from that ~35 minutes of compute.

**Fixes applied**:
- `per_device_eval_batch_size=1` (was implicitly 4) -- directly shrinks the oversized logits allocation.
- `eval_accumulation_steps=1` -- moves eval logits off-GPU after every step instead of accumulating them all on-GPU across the eval loop (extra insurance).
- **On "can checkpoint-save be reordered before eval": checked, and it's not directly configurable** -- transformers' `Trainer._maybe_log_save_evaluate()` always runs eval before save when both trigger at the same step, with no exposed flag to swap that order. Real fix instead: **decoupled save from eval entirely** -- `save_strategy` switched from `"epoch"` to `"steps"` with `save_steps` set to ~1/5 of an epoch (~5 checkpoints/epoch), independent of `eval_strategy="epoch"`. This means a future eval crash costs at most a few minutes of retraining, not a whole epoch like this time. `save_total_limit=5` keeps the volume from accumulating unbounded checkpoint dirs. Note: this required dropping `load_best_model_at_end` (it requires `save_strategy`/`eval_strategy` to match, which now conflicts by design) -- no functional loss, since `GuardrailCallback` already tracks/prints the best eval loss itself independent of that Trainer feature.

**Relaunched (detached), call id `fc-01KZ809PPDVHAVVTMDJ15G6S1F`, resuming from `checkpoint-251` — this run SUCCEEDED.** No OOM this time (the per_device_eval_batch_size=1 + eval_accumulation_steps=1 fix held through the epoch-2 boundary where it crashed before), no divergence/plateau triggers, completed all 3 epochs.

## STEP 5 DONE (2026-08-05)

- **Eval loss**: only epoch 3.0 (`0.8773`) is recoverable -- Modal's CLI log retrieval only retains a limited tail per call, so epoch 1/2's eval_loss from earlier in this same resumed run were not recoverable after the fact. Real gap, not filled in with a guess.
- **10 sample generations vs. human ground truth**: all captured and reviewed -- quality reads as genuine close paraphrasing (facts/names/structure preserved) across all 3 styles, not verbatim copying, not topic drift. Full text reported to the user in-conversation.
- **Deployable artifacts, both confirmed saved to Modal Volume `humaniser-lora-checkpoints`**:
  - LoRA adapter: `/checkpoints/run/adapter_final`
  - Merged + GGUF (q8_0) for Ollama: `/checkpoints/run/humaniser-lora.q8_0.gguf`
- **Cost**: this run's own measured cost was **$3.13** (1.49h actual vs. the estimated 1.94h/$4.06 -- came in under). **Total across all attempts (including every failure): ~$6.21 best-effort reconstruction** -- exact for the OOM attempt (40m56s, confirmed via user's Modal dashboard) and this successful run (measured in-script); estimated for the rich-import failure (~1.5 min) and the network-blip-killed run (~45.7 min, estimated from step-timing math, since Modal's CLI doesn't expose historical per-call durations). Well within the $10-25 Step 5 budget either way. **User should check Modal's billing dashboard directly for the exact total if precision matters** -- same situation as the earlier Kaggle-quota reconciliation.

**Files still need pulling from the Modal Volume to local disk** before Step 6 (local Ollama QA) can use them -- not yet done. Use `modal volume get humaniser-lora-checkpoints /run/humaniser-lora.q8_0.gguf <local path>` (and similarly for `adapter_final` if the raw adapter is needed too, e.g. for a non-Ollama deployment path).

## Step 6 execution + GPTZero results (2026-08-05)

Pulled GGUF, built Ollama model. Two real bugs found and fixed getting clean output:
- Hand-written Modelfile `TEMPLATE` was a flawed simplification of Qwen2.5's real chat template -- caused inconsistent premature stopping. Fixed by copying the official template verbatim from the already-installed `qwen2.5:7b-instruct-q4_K_M` model (`ollama show ... --modelfile`).
- `ollama create` then failed with a cryptic GGUF-validation error -- actual cause was disk space (two duplicate 8.1GB GGUF blobs from failed attempts had filled the disk to 4.3GB free, both orphaned/unreferenced -- confirmed via manifest check before deleting). Freed 16GB.

Ran 5 genuinely-AI-generated (via production LLM, not hand-written) benchmark inputs -- blog intro, business email, product description, essay paragraph, report summary -- through the model, one per style. **Real GPTZero results (user-reported, 2026-08-05): 1/5 passed.**

| input | style | GPTZero verdict |
|---|---|---|
| blog_intro | normal | **Human 100%** (highly confident, clean pass) |
| business_email | simple_formal | AI 100% -- 99% "AI Paraphrased" |
| product_description | normal | AI 100% -- 100% "AI Paraphrased" |
| essay_paragraph | clear_structured | AI 100% -- 100% "AI Generated" |
| report_summary | clear_structured | AI 100% -- 100% "AI Generated" |

## Diagnosis (2026-08-05) -- root-caused before any retraining, per user's explicit instruction

1. **Structural comparison, blog_intro (pass) vs. the 4 failures**: the clearest signal is sentence-length **std dev** (burstiness) -- blog_intro=18.5 (one 75-word outlier sentence next to an 8-word one), vs. 4.7-13.6 for the failures. The two `clear_structured` failures have the *lowest* variance of all 5 (7.4, 4.7) and were also flagged the more severe "AI Generated" (vs. "AI Paraphrased" for the others) -- directly correlating uniform sentence length with the strongest detector verdict. Vocabulary diversity (TTR) does NOT explain the split -- product_description had the highest TTR of all 5 and still failed.

2. **Clear_structured/simple_formal training-data audit -- contamination confirmed and severe**: the same `ivypanda-essays` sub-source that caused the Step 1 shuffling bug never left the corpus, just got diluted. **36.6% of `clear_structured` and 28.7% of `simple_formal` human-text targets literally end in "Essay"** in the title/first line (vs. 3.1% of `normal`). Within just the artem9k share of `clear_structured`: 69%. The model saw this exact convention hundreds of times for these two styles and generalized it into a reflex.

3. **Overfitting check**: only epoch 3's eval_loss (0.8773) remains recoverable (Modal log retention limitation, unchanged from Step 5). Memorization check: the model's *content* correctly tracks the specific facts from the given input (not reproducing an unrelated memorized example) -- it's applying a memorized **structural/title template** to genuinely-processed new content, not hallucinating unrelated content. A more fixable failure mode than wholesale memorization.

4. **Human ground-truth quality for clear_structured**: sampled 4 "Essay"-titled human_text rows directly from the DB -- confirmed they're IvyPanda academic-essay-bank samples with a near-identical rigid template (`<Topic> Essay` + numbered `Table of Contents`: Introduction/Main Discussion/Conclusion/References). Even though labeled "human" by the source dataset, this is about as low-burstiness and formulaic as writing gets -- the model was never shown genuine human variety for this register, only one website's homework-help template.

**Conclusion at this checkpoint**: data-composition problem (fixable at the source), not a training-methodology failure. Stopped here per user's explicit instruction -- no retraining yet.

## Step 6 validation batch -- stress-testing `normal` specifically (2026-08-05)

User's framing: considering restructuring the product so Humanizer ships with only `normal` (the one that passed), moving tone variety to a separate Paraphraser tool with no detection claims. Needed to know if the one pass was real or noise before deciding.

Generated 10 new genuinely-AI-written inputs (production LLM) across varied `normal`-shaped content types (personal blog, how-to, opinion piece, travel writing, product review, listicle, newsletter, casual explainer, story intro, social long-form) -- deliberately avoiding essay/report shapes. Ran all 10 through `humaniser-lora` at `style=normal`.

**Two reproducible generation-reliability findings** (not one-off noise -- confirmed via 6 retries each at increasing temperature, one with a raised 1400-token budget):
- `03_opinion_piece` (argumentative content): title artifact (the same "Essay"/"Article" contamination) on **6/6 attempts, 100% reproducible**. Argumentative/opinion `normal` content is apparently close enough to the contaminated essay register to trigger the same reflex.
- `09_story_intro` (narrative content): truncated mid-sentence on **6/6 attempts even at 1400 tokens, 100% reproducible**. A real generation-reliability gap for this content type, not a token-budget issue.
- `10_social_longform` needed 4 attempts to come out clean; the other 7 were clean on the first try.

Did NOT keep resampling indefinitely past 6 attempts to force clean output -- that would bias the pass-rate measurement itself. Both defects reported to the user as-is.

**Burstiness (sentence-length std dev) across all 10**, vs. the 18.5 benchmark that correlated with blog_intro's pass:

| # | input | words | std dev |
|---|---|---|---|
| 01 | personal_blog | 282 | 10.2 |
| 02 | howto_guide | 307 | 16.7 (closest to benchmark) |
| 03 | opinion_piece (title artifact) | 615 | 9.8 |
| 04 | travel_writing | 395 | 11.7 |
| 05 | product_review | 287 | 7.5 |
| 06 | listicle | 375 | 12.3 |
| 07 | newsletter | 142 | 15.7 |
| 08 | casual_explainer | 372 | 9.9 |
| 09 | story_intro (truncated) | 266 | 7.9 |
| 10 | social_longform | 189 | 7.6 |

**Not one of the 10 matches or exceeds blog_intro's 18.5** -- closest is 16.7. If burstiness is really what drove the single pass, the proxy suggests that pass may have been closer to a favorable outlier (one long sentence) than a reliable property of `normal` style generally. Files at `scripts/finetune/gptzero_check/normal_batch/`, awaiting the user's manual GPTZero check on all 10 before any product-direction decision.

## Step 6 validation batch -- real GPTZero results (2026-08-05)

**2/10 passed (20%)**: `03_opinion_piece` (Human 95%) and `06_listicle` (Human 100%). The other 8 failed -- **7 of those 8 were "AI Paraphrased," not "AI Generated"** (only `08_casual_explainer` and `09_story_intro` hit the more severe "AI Generated" verdict).

**Important correction to the burstiness hypothesis**: `03_opinion_piece` -- the one with the 100%-reproducible spurious "Essay (Article)" title artifact -- still passed at Human 95%. The title-suffix defect does NOT appear to be a real AI-detection signal by itself (it's a product-quality problem, not a detection problem). Also, `03`'s own burstiness score (std dev 9.8) was *below* several failing samples (`02`=16.7, `04`=11.7, `07`=15.7) -- **the GPT-2 perplexity/burstiness proxy from Step 7 did not predict the real pass/fail split here.** Treat that proxy as unreliable for this purpose going forward; length/elaboration (the two passes were the longest at 615 and 375 words) looked like a weak trend but wasn't a clean predictor either (`04` at 395 words failed, `08` at 372 words failed while `06` at 375 passed).

**This 20% (2/10) closely matches Step 6's original 1/5 (20%) mixed-style result** -- `normal`-specific performance is NOT meaningfully better than the mixed-style average, despite `normal` having only 3.1% IvyPanda "Essay"-title contamination (vs. 36.6%/28.7% for clear_structured/simple_formal). **This is the key finding: if data contamination were the primary driver of failure, `normal` should pass at a much higher rate than the contaminated styles -- it doesn't.** This points to a more fundamental capacity/data-volume/domain-mismatch problem beyond corpus contamination alone. Full assessment given to the user in-conversation (see chat, not duplicated here) -- verdict: data cleanup alone is unlikely to move this to a commercially viable pass rate; the deeper issues are training-data volume (~1,258 real `normal` examples for a 7B LoRA) and a domain mismatch between the training corpus's AI-ify source (a single fixed Qwen2.5-3B prompt) and the diverse, more capable production-LLM-generated text used in real-world validation.

## What's next

Awaiting user's product-direction decision (ship `normal`-only Humanizer + separate no-detection-claims Paraphraser, vs. further investment in retraining) informed by the above. No retraining, no corpus changes started.

**Chunk results so far (all kernel-internal-log-timed, not wall-clock):**
| chunk | rows | result | s/row | kernel runtime | notes |
|---|---|---|---|---|---|
| chunk-08 | 750 | 750/750 (100%) | 24.22 | 5.11h | avg source 620.5 words (normal/clear_structured mix) |
| chunk-09 | 750 | 750/750 (100%) | 25.91 | 5.46h | avg source 673.3 words |
| chunk-10 | 750 | 750/750 (100%) | 11.79 | 2.53h | avg source only 252.8 words -- id range drew mostly simple_formal/clear_structured (billsum legislative, inherently short). Investigated before trusting the ~2x speedup: confirmed via DB word_count query it's genuine shorter source text, not a generation regression. |
| chunk-11 | 750 | 750/750 (100%) | 12.27 | 2.62h | avg source 255.1 words, 411 simple_formal / 333 clear_structured / 6 normal -- same billsum-heavy id range as chunk-10, consistent explanation. |

All 4 chunks spot-checked for quality (5-6 random rows each) — no truncation/garbling in any. **Corpus progress: 3,081/6,000 `ai_ready` (2331 prior + 750 from chunk-11), 2,919 remaining.**

**Quota tracking (from kernel-internal log runtimes, the accurate figure — wall-clock includes monitoring gaps)**: ~24h available as of 2026-08-03. Used so far: 5.11+5.46+2.53+2.62 = **15.72h. ~8.28h remaining this week.** No Kaggle API quota-check endpoint exists (checked full method list) — inferred from log timestamps, not directly queried. **Quota is getting genuinely tight** — 8.28h supports roughly 1 more "slow" chunk (normal/clear_structured-heavy, ~5.3h) or ~3 more "fast" ones (billsum-heavy, ~2.6h), but the corpus's remaining id range is unknown mix, so this is a real constraint now, not just a rough guideline. **Reported this to the user at the 3-chunk check-in (chunk-09/10/11) per their requested cadence.**

Full model/throughput progression that led to this config, and all bugs fixed getting here, are in the "Step 3 run log" section below (bugs #1-11). chunk-01/02/05/06 are abandoned test/dead-end kernels, cleared from the manifest.

**User checked the real Kaggle quota page directly (screenshot, 2026-08-04): 5h43m of 30h GPU quota remaining** — notably less than my log-based estimate of ~8.28h (the log-timed "generation window" undercounts real usage; likely misses setup/queue overhead). **The Kaggle UI quota page is the authoritative source going forward — check it directly before pushing further chunks, don't trust log-based estimates for quota decisions.**

`chunk-12` (300 rows, conservative size for safety margin) completed clean: 300/300 (100%), 10.49s/row, only ~0.94h GPU time used (well under the ~2.2h estimate — this id range drew short first-person narrative/fiction content, "normal" register). Quality spot-checked (5 rows) — all complete, coherent, no truncation.

**Corpus progress: 3,381/6,000 `ai_ready`, 2,619 remaining.**

**Change of plan (user, 2026-08-04): use remaining quota before reset rather than leaving it idle.** User checked UI directly: ~4h47m remaining at that point. Resumed pushing conservatively-sized chunks (750 where budget allows, smaller near the edge), checking quality gates every chunk, stopping with ~30min safety buffer estimated from actual kernel runtimes (not guessed).

| chunk | rows | result | s/row | kernel runtime | notes |
|---|---|---|---|---|---|
| chunk-13 | 500 | 500/500 (100%) | 10.57 | 1.54h | fast id-range again (narrative/fiction content), spot-checked 5 rows, all clean |
| chunk-14 | 350 | 350/350 (100%) | 10.63 | 1.10h | same fast/narrative id-range, spot-checked 4 rows, all clean |

*(A parallel, local-only side investigation of `NoaiGPT/ltgen-wiki-paraphrased-Humanized-19999` and similar HF humanizer-pairs datasets was done at the user's request during this stretch — verdict: **rejected**, same punctuation-stripping/synthetic-human-side defect class as the already-rejected `andythetechnerd03/AI-human-text` from Step 1, plus evidence of misaligned pairs and leaked LLM preamble text. Nothing ingested.)*

## STEP 3 STOPPED HERE (user decision, 2026-08-04) — final state

**4,231 / 6,000 rows `ai_ready`, 1,769 remaining NOT generated.** User explicitly stopped here regardless of leftover Kaggle quota — no chunk-15. Moving to Step 4 (export) with this partial corpus.

**`ai_ready` composition by style (skewed vs. the 50/25/25 target — see below):**
| style | ai_ready count | % of ai_ready | target % |
|---|---|---|---|
| normal | 1,258 | 29.7% | 50% |
| clear_structured | 1,480 | 35.0% | 25% |
| simple_formal | 1,493 | 35.3% | 25% |

**Why it's skewed**: chunks were pushed in ID order (`push_kaggle.py` selects lowest-id rows with `ai_text IS NULL` first), and several mid-range chunks (10, 11) happened to land on the `simple_formal`/`clear_structured` (billsum) region of the corpus, which is heavier there than `normal`. **Not yet decided**: whether Step 4 exports this skewed 4,231-row set as-is, or subsamples/rebalances back toward 50/25/25 (would mean discarding some clear_structured/simple_formal rows to match `normal`'s smaller count — 1,258 would become the cap per style at 3x1258=3774 total if forcing an exact 50/25/25 *ratio*, or export as-is and rely on training-time class weighting instead). **Flag this to the user explicitly when starting Step 4, don't decide silently.**

Full per-chunk bug history (padding, OOM, device_map, quantization, model-size experiments) is in the run log above (bugs #1-11) for anyone resuming this build.
| 4. Dataset export | Not started | |
| 5. LoRA training (Modal) | Not started | Modal account ready — still subject to the cost-gate (print estimate, wait for go). |
| 6. Local Ollama QA | Not started | Ollama binary installed — not yet confirmed serving. Needs Step 5 output too. |
| 7. Detector-proxy eval | Not started | |
| 8. Deploy + integrate | Not started | Blocked on user's GPTZero go-ahead from Step 6. |
| 9. Final report | Not started | |

## Key decisions made so far

- **Swapped the primary corpus source, without stopping to ask (license-permissive dataset
  selection was pre-approved by the user).** The user's spec named
  `andythetechnerd03/AI-human-text` as primary. Investigated it before writing any collection
  code and found two disqualifying problems: (1) its own README says the text is "processed"
  from the Kaggle `shanegerami/ai-vs-human-text` source — direct inspection confirmed
  punctuation and inter-word spacing have been stripped (e.g. `"improves safetyvaubans
  streets"` — words run together, no sentence breaks). Unusable as clean generation ground
  truth: training on it would teach the model to produce garbled text, defeating the entire
  point of Phase 2. (2) It's the PERSUADE/"LLM Detect AI Generated Text" Kaggle corpus — a
  fixed set of ~15 argumentative student-essay prompts, i.e. near-zero register diversity, no
  path to the 50/25/25 normal/clear_structured/simple_formal split.
  **Replaced with `artem9k/ai-text-detection-pile`** (MIT, verified via `HfApi.dataset_info`).
  Aggregates Reddit WritingPrompts (570k) + OpenAI WebText (260k) — casual/general, maps to
  `normal` — and ivypanda-essays — structured reports, maps to `clear_structured` — all with
  intact punctuation (verified by sampling rows directly). No sub-source column exists in this
  dataset (just `source: "human"|"ai"`), so per-row style attribution is genuinely Step 2's
  job, not inferable from metadata — this doesn't change the Step 2 plan, just confirms
  heuristic/local-model tagging is necessary rather than a shortcut.
  **Open item for Step 2's rebalance report**: this source's registers as described lean
  `normal`/`clear_structured` — if the tag.py rebalance report comes up short on
  `simple_formal` (professional/business register), add a second source then (e.g. an
  Enron-derived email corpus — not yet vetted for license/cleanliness, check before using).
- **Kaggle transport**: Kaggle notebooks never get our Neon DB credentials. Work-batches are
  exported as JSONL and pushed as a private Kaggle Dataset; the notebook reads that dataset,
  writes results as a Kaggle notebook output artifact; a local `pull_kaggle.py` downloads that
  artifact via the Kaggle API and ingests it into Postgres. Justification: don't expose
  production DB credentials to a third-party execution environment we don't fully control.
- **All Phase 2 tooling lives in `backend/scripts/finetune/`**, plain Python scripts (not
  Node), using the existing SQLAlchemy/Postgres setup — consistent with the rest of the
  backend. Dependencies for this phase go in `backend/requirements-finetune.txt`, kept
  separate from the production `requirements.txt` (no reason to ship `datasets`/`kaggle`/
  `modal`/ML libs in the deployed API).
- **`finetune_samples` table** (Alembic migration, idempotent `has_table` pattern like every
  other migration in this project): `id, human_text, ai_text (nullable), word_count, source,
  license, style (nullable until Step 2), status, created_at`.
  `status` values as the row moves through the pipeline: `collected` → `tagged` →
  `ai_ready` (has ai_text, whether from a source-provided pair or Step-3-generated) →
  `exported`.
- **Style target split**: 50% `normal`, 25% `clear_structured`, 25% `simple_formal`
  (matches the 3 styles shipped in Phase 1).
- **Target corpus size**: 15,000–25,000 human samples, 150–1,200 words each, English prose
  only, near-duplicate-removed (MinHash).

## Exact resume commands per stage (fill in as each script is written)

```bash
# Step 1 — corpus collection (idempotent: re-running skips already-collected sources/rows)
cd backend && source venv/bin/activate
python -m scripts.finetune.collect

# Step 2 — style tagging (TBD, not yet written)
# python -m scripts.finetune.tag

# Step 3 — AI-ify on Kaggle (written, chunk-00 in progress)
cd backend && source venv/bin/activate
python -m scripts.finetune.kaggle.push_kaggle --dataset-only --chunk-size 5  # verify dataset creation only, no GPU spend
python -m scripts.finetune.kaggle.push_kaggle                                # push next chunk (default 2500 rows), starts GPU kernel
python -m scripts.finetune.kaggle.pull_kaggle                                # non-blocking: check status, ingest results if complete

# Step 4 — export (TBD, not yet written)
# python -m scripts.finetune.export

# Step 5 — Modal training (TBD, not yet written)
# python -m scripts.finetune.train_modal

# Step 6 — local Ollama QA (TBD, not yet written)
# python -m scripts.finetune.local_qa

# Step 7 — detector-proxy eval (TBD, not yet written)
# python -m scripts.finetune.eval_detector
```

## Step 2 run log (important — read before touching tag.py)

- Local regex heuristics scored only **~48% agreement** against a gpt-5-nano spot check (both
  the first and second spot-check run landed at 47.5-48.5%, so this is a stable, real result,
  not noise) — well under the 65% trust threshold. **Heuristics are not good enough; the
  corpus is being tagged with gpt-5-nano for real.** Estimated cost for all 20,000 rows: **~$1.18**
  (well under the $3 gate, proceeded automatically per pre-approval).
- **Caught and fixed a real bug the first time this ran**: the original `tag.py` called
  gpt-5-nano *sequentially*, one row at a time (~3-4s/call observed) — at that rate, tagging
  all 20,000 rows would have taken **~20 hours**. Killed that run (it had made 0 committed
  progress on the full-corpus pass — only commits at the very end, so nothing was lost) and
  rewrote `tag.py` to use a bounded `ThreadPoolExecutor` (`NANO_CONCURRENCY = 20`), which cut
  the per-batch rate to ~4.4 rows/sec (~200 rows / 45s observed) — full corpus now finishes in
  roughly **1-1.5 hours** instead of ~20.
- **Resumability**: added `.tag_nano_cursor.json` (row IDs already nano-tagged this fallback
  pass) alongside a `db.commit()` every `COMMIT_EVERY = 200` rows — a kill now loses at most
  ~200 rows of work, not the whole run. Re-running `python -m scripts.finetune.tag` after a
  kill will see the existing cursor and resume the fallback directly (skips the spot check
  the second time, since the fallback decision is already recorded by the cursor file
  existing).
- **If you're resuming this step**: check `ps aux | grep finetune.tag` first — if a previous
  session's process is still alive and progressing, don't start a second one (they'd race on
  the same rows). If it's not running and `.tag_nano_cursor.json` exists with fewer than 20,000
  ids, just re-run `python -m scripts.finetune.tag` — it resumes automatically. Once it
  finishes, no cleanup needed: traced through the logic and a fully-completed run is
  idempotent on re-invocation (cursor already covers all row ids -> `pending` list is empty ->
  the executor does 0 work -> falls through to just re-printing the rebalance report). Leave
  `.tag_nano_cursor.json` in place; it's a completion marker as much as a resume cursor.

### ⚠️ Incident: the first "93% normal" rebalance report was mostly bogus (2026-08-01, same session)

The numbers reported right after the run above (`normal: 18606 (93.0%)`, `clear_structured:
1199 (6.0%)`, `simple_formal: 195 (1.0%)`) were **not a real content-distribution finding**.
Root cause, found while investigating why a *second* tagging run (after adding `billsum`,
see below) also looked wrong:

- `NANO_CONCURRENCY = 20` blew through the org's real **500 RPM cap** on `gpt-5-nano`. The
  first "successful" 20,000-row run logged **56,430 HTTP 429s** in `/tmp/tag_run2.log`.
  LangChain's client-level retry-on-429 made this worse, not better — each retry re-submits
  and competes with the next batch's requests, compounding the overload rather than backing
  off.
- The *old* `nano_style_safe()` caught any exception (including retries-exhausted) and
  **silently returned `"normal"` as a fallback**. Grepping that log: **18,553 of 20,000 rows
  logged `"nano_style call failed, defaulting to 'normal'"`** — i.e. over 92% of the "93%
  normal" result was never actually seen by the model at all. It was a silent-failure rate
  wearing a content-distribution costume.
- Caught this because the *second* run (tagging the new `billsum` rows, expected to skew
  heavily `simple_formal`/`clear_structured`) hit the same 429 storm and logged `2,640` failures
  before I stopped to check — a genuine content-driven result would never explain formal
  legislative summaries defaulting to `"normal"` at that rate.

**Fix applied to `tag.py`:**
1. `NANO_CONCURRENCY` 20 → **6** (500 RPM ÷ 60s ≈ 8.3 req/s ceiling; 6 concurrent workers at
   observed ~1-3s/call stays comfortably under it).
2. `ChatOpenAI(..., max_retries=8)` — explicit, generous backoff budget on the client itself.
3. **`nano_style_safe()` now returns `None` on failure instead of `"normal"`.**
   `tag_rows_concurrently()` skips `None` results entirely — doesn't write `row.style`, doesn't
   add the row to the cursor. A failed row is simply retried on the next invocation, never
   silently mislabeled. (The *other* `"normal"` default in `nano_style()` — reached when the
   model responds with text that doesn't contain any of the three style words — is a separate,
   legitimate fallback for genuinely ambiguous model output and was left as-is.)

**Corpus reset performed**: all 29,883 rows (`UPDATE finetune_samples SET style=NULL,
status='tagged'`) and `.tag_nano_cursor.json` deleted, so every row gets a real, verified nano
classification this time — no salvage attempt on the contaminated data, full clean re-tag.

**Added source (independent of the bug above, still a valid decision)**: the *shape* of the
skew (heavily `normal`) was directionally real even if the magnitude was bogus — the corpus
genuinely is Reddit/WebText-heavy with only a thin ivypanda-essays slice, and had zero
business/professional-register source at all. Added **`billsum`** (US Congressional +
California legislative bill summaries, `license: cc0-1.0` — public domain, verified via
`HfApi.dataset_info`) as a second Step-1 source: 9,883 new rows collected via the `summary`
field (formal, no-contraction, structured prose — sampled directly, confirmed clean, no
tokenization artifacts unlike the originally-named primary dataset). `collect.py`'s
`artem9k` entry has `target_rows: 0` now (already at its intended volume) so a re-run only
tops up from `billsum` or future sources. `TARGET_TOTAL` raised 20,000 → 32,000 temporarily to
give room for oversampling; a rebalance/pruning pass (not yet written) will bring the final
corpus back inside the user's 15k-25k target band once real tagging numbers are in.

### ⚠️ Second bug, same session: batch-submission stall (looked like a hang, wasn't)

After the reset above, the first re-run (`NANO_CONCURRENCY=6`) appeared to make zero progress
for 13+ minutes despite the log showing hundreds of real `200 OK` responses and zero 429s.
Root cause: `tag_rows_concurrently` submitted the **entire** `pending` list (29,883 futures) to
the executor in one dict comprehension before ever reading a result. Worker threads *did*
start executing tasks immediately (explaining the "200 OK" log lines), but the main thread
was stuck fighting those same live workers for the executor's internal queue lock just to
finish submitting the other ~29,000 futures — so it never reached `as_completed()` to consume
a single result, and nothing was ever written to `row.style` or committed. Confirmed with an
isolated 30-row test (worked fine, small scale) vs. the full run (stalled) — same code, only
the submission size differed.

**Fix**: `tag_rows_concurrently` now submits in fixed-size batches (`batch_size = COMMIT_EVERY
= 200`) — submit 200, drain via `as_completed`, commit, repeat. Verified working: checkpoint
logs now appear on schedule and DB row counts advance in lockstep with them.

**Also re-tuned concurrency upward once batching was confirmed safe**: `NANO_CONCURRENCY`
6 → **15**. The original 429-storm was caused by dumping ~20,000 requests at once with no
batching, not by concurrency=20 per se — with batches capped at 200 in flight, throughput is
nowhere near the real 500 RPM ceiling even at 15 concurrent (observed ~2.9 rows/sec, i.e.
~174 RPM, well under 500). Confirmed zero 429s at this setting for the first two checkpoints.
ETA for the remaining ~29,450 rows at this rate: **roughly 2.5-3 hours**. If you want it
faster and are comfortable spending more of the API-request headroom, `NANO_CONCURRENCY` could
likely go to 25-30 before approaching the 500 RPM ceiling — untested, raise cautiously and
watch for 429s in the log if you do.

### Transient failure #3 (unrelated to the two bugs above): a DB network drop killed the process

At 4,830/29,883 rows (2026-08-01 ~23:56), the run died with
`psycopg2.OperationalError: could not receive data from server: No route to host` — a
transient network blip to Neon, not a code bug (zero 429s, zero nano failures logged up to
that point). `db.commit()` calls aren't wrapped in a retry/reconnect, so the whole process
exited on this. **The batching design contained the damage as intended**: only the in-flight
batch (≤200 rows) was lost; everything from prior committed batches was intact, confirmed by
`.tag_nano_cursor.json` and the DB's `style IS NOT NULL` count matching exactly (4,830 = 4,830)
after the crash. Simply re-running `python -m scripts.finetune.tag` picked up from the cursor
with no further fix needed. **Caveat for future sessions**: this process is not self-healing —
if it dies (network blip, laptop sleep, etc.), nothing restarts it automatically. Check
`ps aux | grep finetune.tag`; if it's not running and the cursor size is below the corpus
total, just re-run the same command.

**If you're resuming this step and the corpus composition looks suspiciously skewed again**:
check for HTTP 429 volume and `"nano_style call failed"` / `"failed and left pending"` counts
in the run log before trusting any rebalance report. A clean run should have near-zero of
both.

## Cost reconciliation (2026-08-02, mid Step 3)

User's OpenAI dashboard showed $8.02 total vs. the ~$1.38 Step 2 log-based estimate. Investigated:
the project API key is `sk-proj-...` (project-scoped), and a direct call to
`/v1/organization/usage/completions` returned **403: missing scope `api.usage.read`** — this key
cannot query OpenAI's Usage API at all, so an exact dashboard-matching reconciliation isn't
possible from here. Best reconstruction: real billed nano-tagging calls across *all* attempts
(including the two contaminated/reset runs) total **54,261** (summed across `tag_run.log`
through `tag_run8.log`), not ~25k — recomputing input cost alone from that real count still
lands near $1.18-1.38. The likely explanation for the rest of the gap: `gpt-5-nano`/`gpt-5-mini`
are reasoning-tier models with hidden reasoning tokens billed as output even for trivial
prompts, which the original estimate's `~4 output tokens/call` assumption didn't account for —
plausible but **not verified**. Separately, `gpt-5-mini` (Humanizer Pass 2, pricier model) was
exercised during this session's Phase 1 QA and probably in prior sessions too, per project
memory. **User confirmed 2026-08-02: OpenAI balance is fine ($4 remaining), comfortable
headroom, proceeded with Step 3 (which is $0 OpenAI cost — runs on free Kaggle GPU).** Checked
for anything currently spending: no `tag.py`/`collect.py` process running, no backend request
traffic in over a day — nothing local was found actively driving the $8.02→$9.66 jump the user
separately reported; most likely dashboard billing lag on already-made calls, or usage on this
same key from somewhere this session can't see. Not fully resolved, but user chose to proceed.

## Standing rules added 2026-08-02 (on top of the original hard rules above)

- **$15 soft ceiling for cumulative spend across all of Phase 2** (not just Step 2's $7
  tagging-specific ceiling) — if any future action, even a nominally-$0 step, looks like it could
  push cumulative spend trending past $15 total, stop and tell the user first.
- **Keep spot-checking actual content/output against aggregate reports before trusting them** —
  this instinct caught 3 real bugs in Step 1/2 (silent-failure mislabeling, unshuffled-stream
  clustering, batch-submission stall) and should not be dropped for speed in Step 3 or later.
  Applies to the Step 3 10-pair check: actually read the pairs, don't just check the row count.
- If Kaggle GPU access, phone verification, or any account-level block comes up, stop and say
  exactly what's needed rather than guessing a workaround.

## Step 3 plan (AI-ify on Kaggle) — sketched 2026-08-02, NOT yet executed, zero GPU time spent

Corpus is ready: 25,000 rows, `status=tagged`, `ai_text=NULL` for all. Kaggle credentials
re-verified live (`kaggle datasets list` succeeded, account `rinkuakhil`) right before writing
this plan.

**Files to create** (none written yet): `backend/scripts/finetune/kaggle/aiify_notebook.ipynb`,
`backend/scripts/finetune/kaggle/push_kaggle.py`, `backend/scripts/finetune/kaggle/pull_kaggle.py`.

**Transport** (per the DB-security decision already recorded above): no direct Neon access
from Kaggle. `push_kaggle.py` exports a JSONL work-batch (`id`, `human_text`, `style`) from
`finetune_samples` and uploads it as a **private Kaggle Dataset**; `aiify_notebook.ipynb`
reads that dataset as its input and writes an output JSONL (`id`, `ai_text`); `pull_kaggle.py`
downloads the notebook's output artifact via the Kaggle API and does the `UPDATE
finetune_samples SET ai_text=..., status='ai_ready' WHERE id=...` locally.

**Chunking across sessions** (25,000 rows is very unlikely to fit one Kaggle session, and free
GPU quota is capped at 30 hrs/week): split the work-batch into ~10 chunks of ~2,500 rows each,
each chunk its own Kaggle Dataset version + kernel run. `push_kaggle.py` takes a
`--chunk-index` (or similar) and only exports rows still missing `ai_text` up to the chunk
size — so it's naturally resumable regardless of how many chunks have completed. Kill/resume
safety lives entirely on the local side (DB `status`/`ai_text` state); nothing Kaggle-side
needs its own resume logic beyond "finish this chunk's rows."

**Notebook design**: load Qwen 2.5 7B Instruct (via `transformers`, or `vllm` if available on
the Kaggle GPU image — need to check what's preinstalled, may need a `pip install` cell), read
the attached input dataset, prompt each row with: *"Rewrite this text in typical AI-assistant
style: uniform sentence lengths, transition words, generic vocabulary (delve, leverage, robust,
crucial, seamless), parallel triads, hedging, symmetric paragraphs. Preserve meaning, facts,
names, numbers exactly."* + the human text. Write results incrementally to the output JSONL
(flush after every N rows, not just at the end -- same lesson as `tag.py`'s batching fix:
never buffer all results until a single end-of-run write). Batch generation (not one-row-at-a-
time) will matter a lot for throughput on a single free GPU; exact batch size TBD once actually
running on Kaggle's hardware.

**10-pair spot check gate (per the user's original instruction — HARD STOP)**: after the
*first* chunk completes and is pulled back, print 10 random (human_text, ai_text) pairs and
**stop for the user's review** before pushing any further chunks. Do not proceed to bulk
AI-ify without this checkpoint, regardless of how good the first chunk looks.

**Not yet resolved, needs deciding when actually implementing**:
- Exact Kaggle GPU availability/quota mechanics for scheduled vs. interactive kernel runs
  (affects the chunking size/timing).
- Whether `vllm` is installed on Kaggle's default Python GPU image or needs installing in the
  notebook's setup cell (affects notebook boot time per session).
- Whether to fall back to a smaller/quantized Qwen variant if 7B is too slow on a free-tier GPU
  for the batch sizes needed to finish 25,000 rows in reasonable wall-clock time.

## Step 3 run log (important — read before touching the kaggle/ scripts or notebook)

Files written: `backend/scripts/finetune/kaggle/push_kaggle.py`, `pull_kaggle.py`,
`aiify_notebook.ipynb` (plus `.kaggle_manifest.json`, a runtime-generated resume/tracking file,
and a `work/` scratch dir with per-chunk push artifacts — both gitignored-equivalent, not meant
to be committed). `push_kaggle.py` supports `--dataset-only` (creates the Kaggle Dataset,
skips the kernel push, records no manifest entry — used to verify Kaggle Dataset creation
works before spending any GPU time, per the user's explicit request). Confirmed working via a
5-row `--dataset-only` test (dataset `rinkuakhil/finetune-dataset-only-test-input` created
successfully, no manifest entry, no GPU time). Then ran the real chunk-00 push: 2,500 rows
(ids 6-7819), dataset `rinkuakhil/finetune-chunk-00-input`, kernel
`rinkuakhil/finetune-aiify-chunk-00`.

**Five real bugs hit getting the kernel to actually run** (all in `aiify_notebook.ipynb`
except where noted; each confirmed via direct log inspection, not guessed):

1. **Missing `licenses` field in `dataset-metadata.json`** — `api.dataset_create_new` raised
   `ValueError: Key licenses not found in data` immediately, before any upload. Fixed by adding
   `"licenses": [{"name": "unknown"}]` to the metadata dict in `push_kaggle.py`.
2. **Dataset-readiness wait was insufficient** — the original 30s `dataset_status()`-poll loop
   in `push_kaggle.py` wasn't enough; the very first real kernel run started with the input
   dataset genuinely not attached (see bug #3), even though `dataset_status` reported OK.
   Replaced with a longer (~2 min budget) poll of `dataset_list_files()` instead, which only
   succeeds once the file is actually processed and attachable.
3. **Wrong `/kaggle/input/` path assumption** — `aiify_notebook.ipynb` globbed
   `/kaggle/input/*/input.jsonl` (one level deep), but Kaggle's current mount layout is
   `/kaggle/input/datasets/<owner>/<slug>/input.jsonl` (confirmed by pushing a throwaway
   diagnostic cell that ran `find /kaggle/input -maxdepth 4` — this is why bug #2's extra wait
   alone didn't fix the "no input.jsonl found" `AssertionError`; the file genuinely was there,
   just three levels deep, not one). Fixed the glob to `/kaggle/input/**/input.jsonl` with
   `recursive=True`.
4. **GPU/PyTorch arch mismatch** — Kaggle assigned a Tesla P100 (compute capability sm_60).
   The base image's preinstalled torch (2.10.0+cu128) has dropped Pascal support entirely
   (confirmed via `torch.cuda.get_arch_list()` not containing `sm_60`, and torch's own runtime
   warning saying so explicitly) — this is baked into Kaggle's current base image, not
   something our own pip install caused. Fixed by adding an `nvidia-smi`-based compute-capability
   check *before* importing torch at all, and pinning `torch==2.3.1+cu121` (a version confirmed
   to still list `sm_60` in its arch list) whenever an old-arch GPU (P100/older) is detected.
5. **torch/torchvision version mismatch after the pin** — downgrading torch alone left the
   base image's much-newer preinstalled `torchvision` in place, which calls
   `torch.library.register_fake` (added after torch 2.3.1) — raised `AttributeError` deep
   inside `transformers`' (vision-only, transitively-imported) loss-function module, which
   `transformers` then re-wrapped into a misleading generic `ModuleNotFoundError: Could not
   import module 'Qwen2ForCausalLM'`. Diagnosed by adding a direct
   `from transformers.models.qwen2 import modeling_qwen2` import in the notebook to surface the
   *real* underlying traceback instead of transformers' masked error. Since this notebook only
   does text generation (no vision), fixed by uninstalling `torchvision`/`torchaudio` entirely
   after the torch pin, rather than version-matching a third package. Also pinned
   `transformers==4.46.3` + `accelerate==0.34.2` explicitly (an unbounded `transformers>=4.46`
   had resolved to a version whose Qwen2 code assumed newer torch APIs than 2.3.1 provides).

After fix #5, the kernel ran past all setup cells for the first time (confirmed via repeated
`kernels_status` polling — no `ERROR` for 5+ minutes, past where every previous attempt had
failed) and is generating as of this checkpoint. As of 2026-08-02 ~17:04, chunk-00 has been
`RUNNING` for ~25+ minutes with zero errors — plausible given it's a 7B model on a free-tier
P100 generating up to 1024 tokens/row across 2,500 rows, batch size 8. Kaggle doesn't expose
live logs mid-run (`kernels_output` only works after the kernel finishes), so there's no
progress percentage available until it completes or errors.

**Note for future sessions**: the user said "pairs look good, proceed with the remaining
chunks" once already, before chunk-00 had actually finished — I checked (`pull_kaggle.py`,
DB `ai_ready` count) and confirmed nothing had actually completed/been shown yet, so I did NOT
proceed and told the user so instead of fabricating a pairs review. **If you're resuming and
the user says something implying chunk-00 already finished, verify against the DB
(`ai_ready` count, `.kaggle_manifest.json`'s `pulled` flag) before trusting it** — don't assume
a prior turn's claim was accurate without checking.

**If chunk-00 is still `RUNNING` when resuming this session**: just re-run
`python -m scripts.finetune.kaggle.pull_kaggle` periodically (it's non-blocking and safe to
call anytime — reports "still running" if not done). Do not re-push chunk-00 again while it's
running (would start a duplicate/conflicting kernel version).

**Iteration technique worth reusing for later chunks/debugging**: pushing a full retry with the
heavy `torch==2.3.1` reinstall (~1.5GB download) takes minutes per attempt. When only the
data-mount/environment logic needs debugging (not the actual generation code), temporarily
swap cell-1's content for a cheap diagnostic (e.g. `find /kaggle/input -maxdepth 4`) to isolate
the problem fast and cheap, then restore the real cell content once diagnosed — this is how
bug #3 (the path depth) got found quickly instead of guessing through several more full retries.

### Second round of bugs: chunk-00's first real run only produced 74/2500 usable rows

`pull_kaggle.py` reported chunk-00 `COMPLETE` with only 74/2500 rows updated. Root causes,
found by pulling the full kernel log (not just trusting the row count):

6. **CUDA OOM on nearly every batch after the first ~9** — `BATCH_SIZE=8` at
   `MAX_NEW_TOKENS=1024` is too much for a 7B model on a 16GB P100's actual free memory. Worse:
   the code never called `torch.cuda.empty_cache()` after a failed batch, so fragmentation
   compounded — once the first OOM hit, nearly every batch after it failed too, fast (each
   failing batch errors almost instantly rather than actually generating, which is why the
   whole 2500-row loop still finished in "COMPLETE" status despite producing almost nothing).
   Fixed: `BATCH_SIZE` 8 → 2, and `torch.cuda.empty_cache()` now runs in a `finally` block after
   every batch, success or failure.
7. **Right-padding correctness bug (not just OOM)** — inspected the 74 "successful" rows
   directly (not just their count) and found several started mid-phrase (e.g. `"the Discovery
   of Variables..."` missing its capitalized opening word). Root cause: the tokenizer defaulted
   to right-padding, but the code sliced `out[i][inputs['input_ids'].shape[1]:]` assuming a
   uniform input length across the batch — with right-padding, that slice offset is wrong for
   any row shorter than the batch's longest prompt, silently dropping leading generated tokens.
   Fixed: `tokenizer.padding_side = 'left'` (right-aligns real content so the uniform slice
   offset is actually correct for every row), plus `tokenizer.pad_token = tokenizer.eos_token`
   if unset. **All 74 rows this affected were reset in the DB** (`ai_text=NULL`,
   `status='tagged'`) rather than kept, since the corruption wasn't cosmetic — they're back in
   the pool to be regenerated correctly.
8. **`pull_kaggle.py` status-parsing bug** — `api.kernels_status()` returns an
   `ApiGetKernelSessionStatusResponse` whose `.status` is a `KernelWorkerStatus` enum;
   `str(status.status)` gives `"KernelWorkerStatus.COMPLETE"`, not `"complete"`. The original
   parsing line (`getattr(status, "status", None) or status.get("status") if isinstance(...)
   else status`) silently produced the wrong value, so `pull_kaggle.py` reported "still
   running" even when a kernel had already completed (caught because I ran it manually right
   after the user said "pairs look good, proceed" — checked the DB first since nothing had
   actually been shown, found `ai_ready` count was 0, and the manifest said `pulled: false` —
   so I did NOT proceed on the user's word alone, verified first). Fixed: use `.status.name`
   directly instead of the broken `str()`/`isinstance` branch.

**Re-pushed as `rinkuakhil/finetune-aiify-chunk-01`** (same 2,500 rows, ids 6-7819 — chunk-00's
Kaggle Dataset/kernel names are now a dead/abandoned first attempt, not reused) with all 4 of
the above fixes applied. Confirmed running past 3+ minutes with no errors as of this checkpoint.

### Bug #9: throughput collapse traced to CPU offload, not the batch-size-2 fix itself

After fixing bugs #6-8 (OOM, right-padding, status-parsing) and re-pushing as `chunk-01`
(2,500 rows), the user checked in at ~30 min elapsed with no completions visible and the
notebook's own printed ETA reading ~28.6 hours for just that one chunk — clearly wrong versus
this session's earlier (mistaken) ~40-100s/row estimate. That earlier estimate was itself
flawed: it was computed from *cumulative* averages off `chunk-00`'s log, which bakes in
one-time model-load warmup into the very first data point. Redone from marginal deltas between
consecutive checkpoints, chunk-00's real *healthy* stretches were more like 5-10s/row — but (see
below) this baseline itself turned out to be an artifact of a small, lucky sample, not
representative.

User had the current run (`chunk-01`) killed — discovered **the Kaggle API has no kernel
stop/cancel/delete method at all** (checked the full method list on `KaggleApi`), so the user
cancelled it manually via the Kaggle website instead. Per the user's request, pushed a genuine
size-validation test: `chunk-02` (350 rows). At ~862s elapsed it had only completed 2/350 rows
(notebook's own ETA: ~28.6 hours for 350 rows) — user had this cancelled via the website too,
then asked for a from-the-log diagnosis before any further guessing.

Pulled chunk-02's partial output (4 rows had completed) and checked two things directly, per
the user's explicit ask:
1. **Token/word count vs. the 1024 cap**: 3 of 4 rows ended naturally (complete sentences,
   280-546 words, well under the ~1024-token budget) — EOS stopping was working correctly.
   Only 1 of 4 looked possibly cut off mid-citation. This ruled out "always hits max_new_tokens"
   as the dominant cause.
2. **Log grep for offload/device_map warnings**: found
   `WARNING:accelerate.big_modeling:Some parameters are on the meta device because they were
   offloaded to the cpu.` — confirmed. `device_map='auto'` decided part of the 7B model (fp16
   weights ~14GB) doesn't fit in the P100's 16GB with any headroom, and silently pushed some
   layers to CPU. That forces part of every autoregressive decode step across the CPU/GPU
   boundary — a very plausible, and (per below) confirmed, explanation for the order-of-
   magnitude slowdown.

**Fix**: changed `device_map='auto'` to `device_map={'': 0}` in `aiify_notebook.ipynb` (pins
the whole model to GPU; would raise a clear OOM instead of silently degrading if it truly
doesn't fit — a real signal for "go straight to 8-bit quantization" rather than more
guess-and-check). Tested with a small `chunk-03` (40 rows) per the user's request to confirm
quickly before scaling back up.

**Result: no OOM, no offload warning, all 40 rows completed with good quality output** (spot-
checked directly — complete, coherent AI-ify rewrites, no truncation/garbling this time).
**But real throughput, computed from 19 timestamped checkpoints in the log (far more reliable
than the earlier 8-point sample): ~109s/row average (range 52-168s/row).** This is ~4x better
than the CPU-offloaded run (~430s/row), but still nowhere near the earlier "~5-10s/row healthy
baseline" — which, with this much better sample size, now looks like it was noise from a few
coincidentally-short generations in chunk-00's log, not a real achievable steady-state rate for
typical ~300-700 word completions on this hardware.

**At ~109s/row, all 25,000 rows would take ~27+ days of continuous generation on a single free
P100** — not feasible as currently configured. Per the user's explicit instruction ("check the
per-row rate... before scaling back up to 350+"), this does NOT clear the bar, so **nothing was
scaled up past the 40-row test**. This is now a real design decision, not a bug to fix — see
options below.

### Step 3 throughput problem — options (not yet decided, needs the user's input)

- **Bigger batch size now that offload is gone**: `chunk-03` used `BATCH_SIZE=2` (kept
  conservative from the OOM fix). With `device_map={'': 0}` confirmed not to OOM at batch 2,
  there may be real headroom to try 4-8 again and see how much batching actually helps
  throughput on this GPU (Pascal has no tensor cores, so gains may be modest, but untested).
- **Smaller/quantized model**: swap `Qwen/Qwen2.5-7B-Instruct` for a smaller variant (3B/1.5B)
  or an 8-bit/4-bit quantized load (`bitsandbytes`) of the same 7B — would cut both memory
  pressure and (for quantized int8/int4 matmul) potentially per-token latency, at some quality
  cost for the AI-ify rewrite task. Not yet tested whether `bitsandbytes` even works well on
  Pascal (P100) — some newer quantization kernels assume Turing+ (T4 or newer).
- **Try requesting a T4 GPU instead of P100**: T4 (Turing, has tensor cores) would likely be
  meaningfully faster for fp16 inference than a P100 (Pascal, no tensor cores) — but Kaggle's
  kernel-metadata.json only has a boolean `enable_gpu`, no confirmed way to request a specific
  accelerator type via the API. Unclear if this is controllable at all from a pushed kernel
  (may only be selectable via the Kaggle notebook UI, if at all).
- **vLLM or another optimized inference server**: much better batching/paged-attention
  throughput in general, but unclear if installable/functional on Kaggle's environment for a
  Pascal GPU (vLLM's newer optimized kernels may assume Turing+ compute capability, same
  concern as bitsandbytes above) — not yet investigated.
- **Just accept it and scale chunk size down further / run many more, smaller chunks over
  more sessions**: even at ~109s/row, running continuously (not 2,500-row chunks, but repeated
  smaller pushes across many days) is technically possible given Kaggle's 30hrs/week GPU quota
  — 30hrs/week at 109s/row ≈ ~990 rows/week, meaning the full 25,000-row corpus would take
  roughly **25+ weeks** at this rate even using the full free weekly quota. Almost certainly
  not what the user wants given the project's timeline, but stated here for completeness.

## What's next

1. **Immediate**: chunk-01 (2,500 rows, ids 6-7819) is generating on Kaggle right now with all
   fixes applied (padding, batch size, cache clearing, status-check). Poll with
   `python -m scripts.finetune.kaggle.pull_kaggle` until it reports complete, then it
   auto-ingests `ai_text`/`status='ai_ready'` into the DB for those rows. **Given the two new
   bugs found in chunk-00's first run, don't just trust the row count this time — actually open
   a few of the resulting `ai_text` values and check they read as complete, coherent sentences
   (not truncated mid-phrase) before showing the user the 10-pair spot check.**
2. **HARD STOP**: once chunk-01 is pulled and spot-checked, print 10 random (human_text,
   ai_text) pairs from those rows and show the user — do NOT push another chunk until the user
   explicitly says to proceed, and don't take a prior "looks good" at face value without
   verifying the DB state first (see bug #8's note above — this already happened once).
3. After the user's go-ahead: repeat `push_kaggle.py` (default `--chunk-size 2500`, no flags
   needed — it auto-selects the next batch of rows still missing `ai_text`) for the remaining
   ~9 chunks, checking in with `pull_kaggle.py` between chunks. Keep spot-checking actual
   content per chunk, not just row counts (per the user's standing rule above — this just
   caught 2 more real bugs, so it's earning its keep).
4. Once all 25,000 rows have `ai_text`/`status='ai_ready'`, move to Step 4 (dataset export).

## Round 15 (2026-08-09) — corpus signal check (new script, pre-training)

Everything above this section is historical (kept for the record) — by this point the corpus
is fully collected/tagged/AI-ified/exported: 24,000 rows collected, 24,000 tagged (0 failed),
12,785 rows made it through AI-ify + export (Train 12,146 / Eval 639), all rows now
`status='exported'`. Real total spend across Steps 1-4: **$34.00** (Google $5.73, Anthropic
$10.01, OpenAI $18.26 combined across tagging+AI-ify, Kaggle GPU free).

Training (Step 5, `train_modal.py --go`) has been proposed but **explicitly not launched yet**
— the user rejected one launch attempt and asked to pause. While paused, the user asked
whether anything could be added to better target what AI detectors actually measure
(perplexity, burstiness). Rather than change the training approach speculatively, ran a new
one-off local analysis first: `scripts/finetune/corpus_signal_check.py`.

**What it does**: samples real `(human_text, ai_text)` pairs straight from `finetune_samples`
(any row with `ai_text` set, so `ai_ready` or `exported`), scores both sides of each pair with
the same GPT-2-reference-LM perplexity/burstiness proxy `eval_detector.py` (Step 7) already
uses, and reports the aggregate gap. Distinct from `eval_detector.py`: that one needs a
trained LoRA and only checks 5 hand-picked benchmark inputs post-training; this one checks the
raw training data itself, pre-training, $0 cost, pure local CPU compute (~8 min for 200 rows).

**Real result (200-row sample, 2026-08-09)**:

| signal | human mean | ai mean | gap |
|---|---|---|---|
| perplexity | 139.91 | 102.50 | +37.41 (human higher) |
| burstiness | 282.47 | 105.52 | +176.95 (human higher) |

Both gaps point the correct direction (human text scores higher/more-variable on both, the
classic "AI is smoother/more uniform" detector signature) and are large in magnitude —
burstiness in particular is ~2.7x higher in human text. Read as real evidence the training
pairs carry a strong, measurable signal for the LoRA to learn from, not just a hope based on
the system prompt's qualitative wording. Full per-row output:
`scripts/finetune/corpus_signal_check_results.json` (not committed — regenerate via
`python -m scripts.finetune.corpus_signal_check --sample-size 200`).

**Bug fixed along the way**: script originally crashed on `db.close()` right after finishing
all 200 rows — Neon's idle-connection timeout dropped the session during the ~8-minute
CPU-bound scoring loop (same class of issue `aiify_api.py` hit earlier with
`commit_with_retry`). Fixed by wrapping the close in try/except — all row data is already in
Python memory by that point, so a close failure must not lose the results.

**Status**: analysis complete, result is positive. Step 5 (training launch) still requires a
fresh, explicit user go-ahead — do not relaunch `train_modal.py --go` without one.

## Round 16 (2026-08-09) — pre-training readiness audit + real MAX_SEQ_LEN bug found & fixed

(Context: earlier today the Neon free tier's 5GB/month transfer cap was hit, suspending the
production DB compute — user upgraded to Neon Launch (usage-based, 500GB transfer), verified
back up end-to-end: `/health` 200, `SELECT 1` OK, frontend + login page render clean.)

User asked for a full "are we 100% ready to train" audit before launching Step 5. Findings:

**Verified clean:**
- `data/train.jsonl` 12,146 rows / `eval.jsonl` 639 rows — every row parses, all have exact
  [system, user, assistant] structure, zero empty contents.
- Pair direction correct: user = stiff AI text, assistant = natural human original (spot-checked
  3 random samples by eye).
- Assistant lengths bounded 150–1200 words, no degenerate rows.
- All rows share ONE system prompt (BASE_PROMPT + STYLE_GUIDANCE["normal"]). Initially looked
  like a bug (we paid $4.42 to tag 3 styles) but confirmed **intentional and correct**: the
  2026-08-07 decision in aiify_api.py's docstring — production only ships `normal` (verified
  live: frontend/app/humanizer/page.tsx STYLES array contains only `normal`; the HumanizeStyle
  type allows 3 but the UI offers 1). AI-ify only processed normal-tagged rows; the 11,213
  clear_structured/simple_formal rows remain status='tagged' in the DB, unused, available later.
- Modal auth works (`modal volume list` succeeds), `humaniser-lora-checkpoints` volume exists.
- Dry run prints sane plan.

**REAL BUG FOUND AND FIXED — MAX_SEQ_LEN truncation:**
Measured every train.jsonl row with the actual Qwen2.5-7B-Instruct tokenizer
(`apply_chat_template`): min 1233, median 1800, p90 2919, p95 3151, p99 3471, max 5035 tokens.
**36.2% of rows (4,391) exceeded the configured MAX_SEQ_LEN=2048.** Truncation removes the END
of the sequence — the assistant's target — so training would have taught the model on 1/3 of
examples that stopping mid-sentence is a valid completion. Fix in train_modal.py:
MAX_SEQ_LEN 2048→4096 (only 4 rows / 0.03% overflow), PER_DEVICE_BATCH_SIZE 4→2,
GRAD_ACCUM_STEPS 4→8 (effective batch still 16, memory-safe at 4096 on A100-40GB with gradient
checkpointing). Dry run re-verified, cost estimate unchanged (~7.92h / ~$16.63 on A100-40GB —
token count was already based on full untruncated data).

(Measurement gotcha for future reference: transformers 5.x `apply_chat_template(tokenize=True)`
returns a BatchEncoding, not a list — `len()` of it is 2 (its dict keys). First measurement said
"every row is 2 tokens"; use `out["input_ids"]`.)

**Known money caveat, stated up front per the no-cost-guessing rule:** Modal balance was $22.28
(user's dashboard screenshot, 2026-08-09). Estimate is $16.63 but the script itself declares a
1.5–2x error band → worst case ~$25–33 exceeds the balance. If credits run out mid-run, the run
pauses (checkpoints every ~1/5 epoch + auto-resume protect progress; top up and resume). User's
stated priority is "everything in one go, no breakage" → recommended topping up ~$10–15 on Modal
BEFORE launching, or explicitly accepting the pause-and-resume risk.

**Status: READY.** All artifacts verified. Launch remains blocked on the user's fresh, explicit
go-ahead ("--go" was rejected once on 2026-08-08; do not launch without a new clear yes).

## Round 17 (2026-08-09) — Step 5 LAUNCHED

User gave fresh explicit go-ahead ("go ahead and start the training"). Ran
`python -m scripts.finetune.train_modal --go`.

- **Launched (detached)**, call id `fc-01KZKTZ44PW0HK6257HQ43RWH3`, saved to
  `scripts/finetune/.modal_run_id.json` — independent of local terminal/session, survives
  laptop sleep/disconnect (this was a hard requirement — user explicitly wanted zero risk of
  interruption).
- Config as fixed in Round 16: Qwen2.5-7B-Instruct, LoRA rank=16/alpha=32, targets
  q/k/v/o_proj, 3 epochs, batch=2 x grad_accum=8 (effective 16), **max_seq_len=4096**
  (post-fix), A100-40GB.
- Estimate: ~7.9h, ~$16.63 (1.5-2x error band stated up front; Modal balance was $22.28 at
  last check, not topped up before launch — user proceeded anyway after being told the risk).
  Checkpoints every ~1/5 epoch to `humaniser-lora-checkpoints` volume + auto-resume protect
  against a mid-run pause if credits run out.
- Check status any time: `python -m scripts.finetune.train_modal --check` (does not require
  keeping this session open).

**What's next**: monitor until complete, then Step 6 (local Ollama QA via `local_qa.py` — 5
benchmark inputs, 3 registers... actually only `normal` per Round 16 finding, adjust if
needed), then GPTZero validation (10 samples, 50% pass hard exit criterion), then Step 7
(`eval_detector.py` quantitative perplexity/burstiness comparison).

## Round 18 (2026-08-09) — first launch CRASHED, 3 real bugs found & fixed, relaunched

`--check` on the Round 17 launch (`fc-01KZKTZ44PW0HK6257HQ43RWH3`) returned a real CUDA OOM
crash, not a status update. Pulled the actual Modal app logs (`modal app logs <app-id>`), not
just the summary error, and found it was worse than a simple OOM:

**Bug 1 (critical, data-integrity) — silent resume from an unrelated stale checkpoint.**
`out_dir` was hardcoded to `/checkpoints/run` (no per-run scoping). `modal volume ls` showed
that path already held `checkpoint-251/500/753` + a completed `adapter_final`/`merged`/
`humaniser-lora.q8_0.gguf`/`sample_generations.json` from **2026-08-04/05** — a fully-completed
prior training run on the *original, superseded* corpus (from before the corpus-collection
redo in tasks #21-26). The crashed run's log literally read
`Resuming from existing checkpoint: /checkpoints/run/checkpoint-753`, plus a warning that the
checkpoint's `trainer_state.json` didn't match the new run's config. Had it not OOM'd, training
would have silently continued on top of an old, unrelated model instead of starting fresh, with
no visible error. Fix: `run_id = f"run_{int(time.time())}"` generated at launch, passed through
to the remote `train()` function, `out_dir = f"/checkpoints/{run_id}"` — every launch now gets
its own directory, can never again touch another run's checkpoints. Old 08-04/05 artifacts were
left untouched on the volume (not deleted) since they represent a real previously-completed
model on the old corpus, potentially still useful as a reference point later.

**Bug 2 — real CUDA OOM at MAX_SEQ_LEN=4096.** Round 16's fix (2048→4096, batch 4→2) assumed
memory scales ~linearly with sequence length; it doesn't for attention (quadratic), and no
`flash_attention_2` is configured in this script. batch=2 at 4096 tokens overflowed A100-40GB
("Tried to allocate 6.16 GiB... 3.34 GiB free"). Fix: batch=1/grad_accum=16 (same effective
batch=16), plus `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True` set before torch touches
CUDA (the error message's own suggestion, reduces fragmentation). Did not add flash-attn under
time pressure right before a paid relaunch — noted as a possible future speed/memory win, not
required for correctness.

**Bug 3 — Modal function's own hard timeout (6h) was LESS than the plan's cost estimate
(~7.9h).** Missed in the Round 16 audit entirely. Even without the OOM, Modal would have killed
the run by its own ceiling before 3 epochs finished. Fix: raised to 20h (Modal only bills actual
usage, so a generous ceiling costs nothing if the run finishes early; covers the script's own
stated 1.5-2x estimate error band with margin).

Also updated `local_qa.py`'s prereq docstring, which hardcoded the old fixed `/run/` volume
path -- now documents pulling the real `run_id` from `.modal_run_id.json` instead.

Dry run re-verified clean after all three fixes (batch=1x16, max_seq_len=4096, same
~7.92h/~$16.63 A100-40GB estimate -- token count unchanged, only the failure modes are fixed).

**Cost of the crashed run**: real Modal billing for the failed attempt was not yet checked
against the dashboard -- likely small (crashed during checkpoint-load/first-batch, not deep into
epoch 1), but per the no-cost-guessing rule, treat this as unverified until checked, not $0.

**Status**: fixes applied, not yet relaunched. Needs a fresh explicit user go-ahead (the first
launch technically got one, but it crashed -- re-confirming before spending again, not assuming
the earlier "go ahead" still applies to a materially different config).

## Round 19 (2026-08-09) — final pre-relaunch audit + stale-artifact purge

User asked for a 100%-no-guessing re-verification and removal of anything unwanted. Everything
below was verified by actually running checks, not assumed:

- `train.jsonl` 12,146 / `eval.jsonl` 639 — recounted, structure re-validated, unchanged. OK.
- `train_modal.py` parses clean; dry run passes with batch=1 x grad_accum=16, max_seq_len=4096.
- **Eval-OOM path checked specifically**: `per_device_eval_batch_size=1` +
  `eval_accumulation_steps=1` already set in SFTConfig (hardened after a previous eval OOM —
  the comment documents a 4x152k-vocab fp32 logits tensor as the original cause), and saves are
  on a steps schedule (~5/epoch) decoupled from eval. A future eval crash costs minutes, not an
  epoch.
- Only remaining `/checkpoints/run` reference in code is inside an explanatory comment. OK.
- No stale local GGUF (ollama_model/ holds only the Modelfile).
- **Purged stale old-model outputs** (all generated Aug 5 by the superseded-corpus model):
  5 `{name}__{style}.txt` files in `gptzero_check/` + 9 numbered outputs in
  `gptzero_check/normal_batch/`. Kept both `00_raw_ai_inputs.json` files — those are
  model-independent benchmark INPUTS still needed for Steps 6/7. Rationale: eval_detector.py
  reads `{name}__{style}.txt` as the "lora_model" variant; stale files = silently scoring the
  wrong model.
- **Deleted the old `run/` prefix from the Modal volume** (checkpoints 251/500/753,
  adapter_final, merged, 7.5GB GGUF, sample_generations.json — the whole superseded-corpus
  model). User explicitly confirmed deletion via a direct yes/no (it was the only remaining
  copy; the Round 18 "keep as reference" note is hereby superseded). Verified: volume now
  completely empty. Next run starts from a guaranteed-clean slate; the resume-from-stale-
  checkpoint failure mode is now impossible both by code (run_id scoping) and by state (nothing
  left to resume from).
- `.modal_run_id.json` still points at the crashed call id — intentionally left; it gets
  overwritten at next launch, and until then `--check` accurately reports the crash.

**Status: verified ready. Awaiting explicit relaunch go-ahead.**
