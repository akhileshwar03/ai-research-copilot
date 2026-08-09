"""Single source of truth for how AI-ify generation is partitioned across
providers by `id % 100`. push_kaggle.py and aiify_api.py both import from
here -- previously each hardcoded its own copy of the boundary, kept in sync
only by a comment telling a human to remember to update both. Found during a
2026-08-06 cleanup pass: real drift risk (edit one file, forget the other,
rows silently get skipped or double-processed with no error).

2026-08-07, round 7 -- user's explicit instruction: avoid a single AI
"fingerprint" (root cause #2 of the original attempt) by generating AI-ify
text across as many genuinely different model families as practical, and
approved spending up to $20 total across paid APIs to do it ($5 Google, $5
Anthropic, named as examples -- "etc" left the rest to this planning).

2026-08-08, round 10 -- Groq dropped entirely. Live experience in Step 2
(style tagging) made the problem concrete: Groq's free-tier limit on this
account is 6,000 tokens/minute, which throttled a 200-row spot check to
~15 minutes and would have made a full-corpus pass take ~30 hours. Not
worth the unreliability for AI-ify generation, which needs to process many
more rows than that spot check did. Its 45% share was redistributed to the
other three providers, weighted toward Kaggle since the account's GPU quota
is back to a full 30h/week (confirmed via the user's own Kaggle dashboard,
vs. the ~2h8m that justified keeping Kaggle small in the first version of
this split).

2026-08-08, round 11 -- Anthropic briefly parked while the user was out of
funds. Confirmed there's no free path to Claude: Claude Pro (the consumer
claude.ai subscription) is a separate product from the Anthropic API and
doesn't grant API credits -- automating the consumer chat UI to stand in
for API access would violate Anthropic's consumer ToS, so that was
correctly ruled out rather than attempted. Checked OpenRouter/DeepSeek as a
free substitute too -- also not actually free (confirmed via OpenRouter's
own model listing: DeepSeek V4 Flash is ~$0.00000009/$0.00000018 per token,
extremely cheap but still requires billing set up).

2026-08-08, round 12 -- Anthropic restored (user added funds + API key,
verified working with a real call), and the whole split rebalanced on a
different principle than rounds 7-11 used. User's own observation, correct:
real users overwhelmingly paste ChatGPT/Gemini/Claude output when asking to
"humanize" text, not raw Qwen/Llama/Mistral output -- and GPTZero-style
detectors are themselves built and calibrated against those same frontier
commercial models, not open-weights ones. So the corpus should be weighted
toward what's actually being detected and actually being pasted in, not
just toward "avoid one fingerprint" in the abstract. Kaggle's role is
narrowed to what it's actually good for -- a cheap insurance fingerprint
against overfitting to any one vendor's exact style -- not corpus volume.

Four providers active, each a genuinely different model family:
- OpenAI (gpt-4.1-mini, paid) -- 35%, the largest share: real user input at
  inference time comes from production-tier models like this most often.
- Google (Gemini Flash-Lite, paid, $5 budget) -- 30%. Verified working,
  real measured cost $0.0000287/row -- the $5 budget covers ~11x this
  share's row count, essentially a non-issue.
- Anthropic (Claude Haiku, paid, $5 budget) -- 25%. Verified working, real
  measured cost $0.000434/row -- $5 covers ~3.6x this share's row count.
- Kaggle (self-hosted Qwen2.5-3B, free) -- 10%, deliberately small. Was
  55% in round 10 on an "avoid one fingerprint, use the free option" theory;
  cut down once the user reframed the actual goal correctly (see above).
  Kept single-model rather than building the planned 3-way Qwen/Llama/
  Mistral rotation -- at 10% of 12,787 rows (~1,279), splitting further
  across 3 models would leave ~400 rows per model, too thin to matter, and
  not worth re-risking the real engineering fragility that rotation would
  add (the original attempt hit 11 separate bugs stabilizing just one
  Kaggle model).

Row-count sizing for the two paid-with-a-cap buckets (Google, Anthropic) is
deliberately NOT hardcoded here from a memorized price-per-token guess --
aiify_api.py cost-gates each with a small measured pilot batch first (same
pattern as tag.py's existing $3 gate, which itself turned out to
under-estimate real cost by ~4.75x in Step 2 -- a fresh reminder these
guesses need real measurement, not a repeat of that mistake) and stops
calling once real tracked spend hits BUDGET_USD. Both buckets below are
upper-bound *eligibility* windows (which rows a provider is allowed to
claim), not a promise every row in the window gets processed -- whatever's
left unclaimed once a budget is exhausted stays `ai_text IS NULL` for a
later top-up decision, not silently reassigned to another provider.
"""

KAGGLE_CUTOFF = 10  # id % 100 < 10 -> Kaggle (self-hosted, free, 10%)
OPENAI_BUCKET = (10, 45)  # 35% -- paid, no fixed $ cap, already-funded balance
GOOGLE_BUCKET = (45, 75)  # 30% eligibility window, hard-capped at $5 actual spend
ANTHROPIC_BUCKET = (75, 100)  # 25% eligibility window, hard-capped at $5 actual spend
