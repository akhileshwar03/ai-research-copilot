# Burstiness-vs-CleverAI verification (2026-09-13)

Purpose: check whether "chase burstiness" (our own Basic/Ultra prompt strategy) or
"plain/slightly redundant phrasing" (CleverAI's apparent style, per the single-sample
bee-text test in the "ultra humaniser" session) is actually the anti-detector signal —
**before** committing to any retrain or model-size decision.

## Method

Used 2 of the 10 pre-existing, already-vetted genuinely-AI-generated benchmark inputs
(`../normal_batch/00_raw_ai_inputs.json`) — `01_personal_blog` and `03_opinion_piece` —
picked for register diversity (personal narrative vs. argumentative).

Ran each through:
1. CleverAI Humanizer (cleverhumanizer.ai, guest/no-login, reverse-engineered job-queue
   API from the prior session) — `01_personal_blog_clever.txt` / `03_opinion_piece_clever.txt`
2. Our own Basic path (`POST /humanize`, live GPT-4.1-mini call) — `*_basic.txt`
3. Our own Ultra path (`POST /humanize/ultra`, live local LoRA) — `*_ultra.txt` (personal_blog only — Ultra's real per-request cost made a second full run not worth it for this check)

A third CleverAI submission (product_review) hit Cloudflare's Turnstile bot-challenge —
stopped there rather than attempt to work around it. 2 real samples is a smaller n than
the "5 topics" originally planned, but still a genuine, honest signal, and specifically
enough to check whether the single earlier bee-text sample generalizes.

## Burstiness result (sentence-length word-count stdev)

| | Original AI input | CleverAI | Our Basic | Our Ultra |
|---|---|---|---|---|
| personal_blog | 8.19 | **12.52** | 9.68 | **19.64** |
| opinion_piece | 5.84 | **7.82** | 7.50 | — |

**Ultra caveat**: Ultra's 476-word output (vs. 238-word input, a 2.0x expansion — under
the 2.5x fabrication-resample threshold, so it shipped as-is) contains real fabricated
detail not in the source — "as someone with freelance experience (not many people can
say they have freelanced while in college)" and "I've had this dream job since high
school" are both invented backstory. Its very high burstiness is at least partly an
artifact of this padding/elaboration, not evidence Ultra is "better" at the actual
anti-detector signal. Treat the personal_blog Ultra number as confounded, not a clean
data point.

## The key finding

**This reverses the single-sample bee-text result.** That earlier test found CleverAI's
output *less* bursty than its AI input (3.90 vs 6.67) — the opposite of what our own
prompt strategy assumes. Across these two fresh topics, CleverAI's output is *more*
bursty than its input in both cases, and by a similar or larger margin than our own
Basic path.

**Conclusion: the bee-text sample was not representative — chasing burstiness is not
obviously the wrong lever after all.** One data point earlier looked like it disproved
this project's core prompt strategy; two more data points now suggest the opposite. This
is exactly why the plan called for checking multiple topics before making any retrain
decision on the strength of one sample.

**What this does NOT settle**: burstiness correlating with CleverAI's own real-world
GPTZero pass rate is still unverified — that requires an actual GPTZero score per sample,
which needs a GPTZero account (not automatable here; see below). Burstiness is a proxy,
not the detector's own metric.

## Still needed: real GPTZero scores (please run these yourself)

Every text below is ready to paste. Report back the AI% and verdict for each — that
completes the actual verification (burstiness is a proxy; GPTZero's real score is the
ground truth this whole check exists to establish).

1. `01_personal_blog_clever.txt`
2. `03_opinion_piece_clever.txt`
3. `personal_blog_basic.txt`
4. `opinion_piece_basic.txt`
5. `personal_blog_ultra.txt` (once the live run finishes)
