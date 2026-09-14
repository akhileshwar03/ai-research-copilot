"""Shared prompt fragments for the Humaniser pipeline.

The banned-vocabulary list is the single source of truth for three things at
once: the Pass 2 rewrite prompt's "never use these" instruction, the
detector prompt (detector.py, Pass 1/3), and the test suite's "zero banned
vocabulary in output" assertion. Keeping one list means the rewrite prompt
and the detector can never quietly drift apart.
"""

AI_VOCABULARY = [
    "delve",
    "leverage",
    "robust",
    "landscape",
    "tapestry",
    "crucial",
    "pivotal",
    "seamless",
    "holistic",
    "foster",
    "harness",
    "elevate",
    "unlock",
    "navigate",
    "realm",
    "testament",
    "underscore",
    "boast",
    "unleash",
    "cutting-edge",
    "paradigm shift",
    "myriad",
    "ever-evolving",
    "the ever-changing",
]

TRANSITION_SPAM = [
    "moreover",
    "furthermore",
    "additionally",
    "in conclusion",
    "in summary",
    "it's worth noting",
    "it's important to note",
    "crucial to understand",
    "consequently",
    "notably",
    "overall",
    "at the end of the day",
    "when it comes to",
    "in today's world",
    "in today's fast-paced world",
]

BANNED_VOCABULARY = AI_VOCABULARY + TRANSITION_SPAM

_BANNED_LIST_TEXT = ", ".join(f'"{w}"' for w in BANNED_VOCABULARY)

# 2026-08-13: the terms AGGRESSIVE_REWRITE_PROMPT bans in its RULE 1, mirrored here as
# data. This closes a real drift the module docstring above claimed was impossible: since
# 2026-08-12 the aggressive prompt is what actually runs for every request the UI can make
# (style=normal, expand off), and it bans a different, larger set than BANNED_VOCABULARY --
# but pipeline.py's best-of-N candidate scorer was still ranking candidates against
# BANNED_VOCABULARY alone. A candidate stuffed with "beacon", "resonate", "game-changer" or
# "inherently" scored as clean, so best-of-N could and did pick it over a genuinely cleaner
# sibling. The prompt string itself is deliberately NOT rebuilt from this list: it is
# verbatim what was A/B tested against ZeroGPT, and regenerating it from data would change
# the bytes the evidence applies to. Keep the two in sync by hand if RULE 1 ever changes.
#
# Deliberately omitted from this list even though RULE 1 bans them: the bare conversational
# openers ("Look,", "Anyway,", "Honestly,"). They collide with ordinary prose under the
# scorer's substring matching ("take a look, then...") and a false hit now carries real
# weight, so scoring them would risk rejecting good candidates. The prompt still forbids them.
# 2026-09-13, Round 33: REVERSED AGAIN, this time on real measured evidence from our OWN
# corpus (9,266 real AI-source/human-target document pairs in train_clean.jsonl +
# eval_clean.jsonl -- see scripts/finetune/human_pattern_analysis.py), not a single
# competitor's single sample. The prior reversal (same day, a few hours earlier) un-banned
# "furthermore/moreover/consequently/additionally/typically/etc." because ONE CleverAI
# Humanizer output (n=1, one topic) used them and scored human on 5 detectors. Measuring our
# own corpus at scale falsifies that generalization outright: "moreover" appears 20x more
# often in AI-written text than in real human-written text (0.019 vs 0.380 per 1000 words),
# "furthermore" 53x more (0.022 vs 1.166), "additionally" 33x more (0.024 vs 0.787),
# "consequently" 88x more (0.008 vs 0.705), "however" 4x more (0.457 vs 1.975), "therefore"
# 7x more (0.068 vs 0.479), "thus" 2.4x more (0.134 vs 0.322), "typically" 6x more (0.060 vs
# 0.380). Every one of these was whitelisted a few hours before this comment on the strength
# of a single sample; all are re-banned here on the strength of 9,266 real pairs. The
# CleverAI sample may simply have been an atypical or genre-specific case -- one data point
# can't outweigh a measured corpus-wide gap this consistent and this large in the opposite
# direction. See RULE 2/4 below for the parallel prompt-level reversal this same measurement
# drove (contractions, "you" vs "one", sentence-length burstiness).
AGGRESSIVE_BANNED_VOCABULARY = [
    "seamlessly",
    "inherently",
    "driven by",
    "powered by",
    # Banned buzzwords / metaphors
    "tapestry",
    "landscape",
    "beacon",
    "navigate",
    "delve",
    "foster",
    "resonate",
    "vital",
    "overarching",
    "testament",
    "elevate",
    "game-changer",
    "unlock",
    "paradigm",
    "dynamic world",
    "intersection",
    # Banned fillers
    "think about it",
    "seriously, no excuses",
    "and guess what",
    "but here's the thing",
    "but don't get it twisted",
    "at the end of the day",
    "in summary",
    # 2026-09-13: added after a real humanizeai.pro scan flagged both verbatim as
    # "AI-skewed signal words" on a live Basic-path output (see prompts.py RULE 5
    # for the rest of that scan's findings — sentence-length/function-word density).
    "bottom line",
    "best of both worlds",
    # 2026-09-13: caught live in a real Basic-path output opening its closing
    # paragraph with this — functionally identical summary-marker to "in summary"
    # above, just not literally the same string, so it wasn't already banned.
    "in short",
    # 2026-09-13, Round 33: re-banned after human_pattern_analysis.py measured these as
    # 2x-88x more common in our corpus's AI-source text than in its real human-written
    # target text (exact ratios in the comment above). Briefly un-banned the same day on
    # n=1 evidence from a single competitor sample; that generalization didn't hold up
    # against 9,266 real pairs.
    "moreover",
    "furthermore",
    "additionally",
    "consequently",
    "in addition",
    "for instance",
    # 2026-09-13, Round 34: "therefore"/"thus"/"typically" were in this list from Round 33
    # onward but are REMOVED here -- a second, genuinely pre-2015 corpus (see
    # pre2015_pattern_analysis.py) measured these at real, non-trivial rates in formal/
    # explanatory human prose (0.33-0.38 per 1000 words, not near-zero like the casual-blog
    # register our fine-tune corpus represents). AGGRESSIVE_REWRITE_PROMPT's RULE 1/2 now
    # explicitly allow these three in the FORMAL register; keeping them in this scorer's flat,
    # register-blind ban list would penalize a correctly-formal candidate for using them. The
    # words banned above this comment (moreover/furthermore/additionally/consequently/in
    # addition/for instance) measured AI-skewed in BOTH corpora, so those stay banned in every
    # register.
]

# Union of both ban lists, deduplicated, preserving order. This is what the best-of-N
# scorer ranks against, so the scorer penalises everything either prompt path forbids
# regardless of which prompt built the candidate.
ALL_BANNED_VOCABULARY = list(dict.fromkeys(BANNED_VOCABULARY + AGGRESSIVE_BANNED_VOCABULARY))

_TECHNIQUES = """Techniques to apply:
- Structural rewrite mandate: do not keep the original sentence skeleton. Merge sentences, split \
them, reorder clauses, change where sentences start. Synonym-swapping alone is failure.
- Vary sentence length hard, in both directions. Short punchy sentences are only half of it — a \
paragraph of uniformly short-to-medium sentences is just as machine-like as a paragraph of \
uniformly long ones. Let some sentences genuinely run long and winding where the thought earns \
it, and let others land in three or four words. This isn't decoration — it's the single \
biggest signal AI detectors score: sentence-to-sentence unpredictability (perplexity) and how \
much that unpredictability swings across the piece (burstiness). A paragraph where every \
sentence is equally "readable" and equally safe is the machine-like pattern, even if the words \
themselves are fine.
- Let word choice itself be uneven. Reach for a specific, slightly less obvious word where it's \
still natural, then let the next sentence go plain again — real writers don't hold vocabulary \
register constant, and a text where every sentence is comfortably mid-frequency vocabulary reads \
as smoothed-over regardless of sentence length variety.
- Vary paragraph shape too, not just sentences. Don't let every paragraph follow the same \
set-up-elaborate-close pattern — let some run one sentence, others run long, so the piece doesn't \
read as a stack of near-identical blocks. Watch for a subtler version of the same problem across \
paragraphs: if every paragraph opens the same way structurally (claim, then support, then close) \
even with different words, that pattern-level sameness is still detectable — break the shape, \
not just the phrasing, on at least some paragraphs.
- Vary how sentences open. Don't start consecutive sentences the same way, and don't lean on \
"This", "It", or "There is/are".
- Remove parallel triads ("clear, concise, and compelling") — vary it: cut to the one item that \
matters, or split into separate sentences.
- Remove empty openers ("In today's fast-paced world...") and generic summary closers. Replace \
templated connective tissue with something that sounds like one specific person talking, not a \
transition word bank — a short aside, a direct address, an informal pivot — never a stock phrase.
- Never use any of the following words or phrases, in any form: """ + _BANNED_LIST_TEXT + """
- Don't lean on the "it's not X, it's Y" reversal as a habitual move, and don't invoke vague \
unnamed authority ("studies show", "experts agree") — make the point directly and specifically \
instead. Using either once, where it genuinely fits, is fine; the tell is repetition, not the \
construction itself.
- Prefer concrete, specific words over vague abstractions, and plain verbs over nominalizations. \
Where the source uses a generic example or analogy, feel free to make it a more specific, \
concrete one instead (a real-world comparison rather than an abstract description) as long as it \
doesn't change what's being claimed.
- Commit to statements the way a person would, instead of hedging every clause. Real writing is \
also inconsistent in small, human ways — a touch of restraint in one place, more directness in \
another, an occasional aside — rather than holding one uniform register end to end. Don't \
manufacture this with typos, broken grammar, or gimmicks; it should come from genuine variation \
in phrasing and pacing, never from injected errors."""

STRICT_HARD_RULES = """Hard rules:
- Preserve the original meaning, facts, claims, numbers, names, and citations exactly. Never add, \
remove, or alter any factual content.
- Preserve ALL markdown formatting exactly — headings, bold, bullet points, links. Preserve any \
keywords the source text depends on (this may be used for SEO).
- Use em dashes sparingly — roughly one per paragraph at most. Stacking several in one passage is \
a recognizable AI habit, but never eliminate them at the cost of a natural sentence.
- Don't let comma-separated lists of three or more items become the default rhythm of the piece. \
Vary it: split some into separate sentences, cut some to the item that matters, and leave the \
ones that genuinely read well as a list.
- Write genuinely well — do NOT inject spelling or grammar mistakes, invisible/unusual characters, \
or any gimmicks. This is good editing, not sabotage.
- Keep roughly the same length and the same language.
- Return ONLY the rewritten text — no preamble, no explanation, no quotation marks wrapping the \
output."""

EXPANDED_HARD_RULES = """Hard rules:
- You may add brief clarifying elaboration, framing, or illustrative context beyond the literal \
source, the way an independent human writer naturally would when explaining the same idea in \
their own words. Never invent specific facts, numbers, names, or claims that aren't reasonably \
implied by the source, and never contradict it — the core meaning must still hold.
- Preserve ALL markdown formatting exactly — headings, bold, bullet points, links. Preserve any \
keywords the source text depends on (this may be used for SEO).
- Use em dashes sparingly — roughly one per paragraph at most.
- Don't let comma-separated lists of three or more items become the default rhythm of the piece.
- Write genuinely well — do NOT inject spelling or grammar mistakes, invisible/unusual characters, \
or any gimmicks. This is good editing, not sabotage.
- The rewrite may run noticeably longer than the source as a natural result of real elaboration, \
but don't pad it with filler — every addition should read like genuine substance. Keep the same \
language.
- Return ONLY the rewritten text — no preamble, no explanation, no quotation marks wrapping the \
output."""

BASE_PROMPT = (
    "You are a skilled human editor. Rewrite the user's text so it reads the way a thoughtful "
    "person actually writes — not the stiff, uniform, over-hedged tone common in AI-generated "
    "prose.\n\n" + _TECHNIQUES
)

# 2026-08-12: user-supplied prompt, real A/B tested against ZeroGPT on the exact generic
# "AI is transforming industries" content that every other strategy tried today scored 100% AI
# on -- this scored 26.8%, 0%, 0%, 46.3%, 0% across 5 independent trials (avg ~14.6%). Genuinely
# the best real result of the day, on the hardest content type. Adapted from the original only to
# make the fact-preservation guarantee explicit (RULE 5's "absorb the core factual meaning" was
# implicit; this project's standing promise is that facts/numbers/names never change, so that's
# spelled out rather than assumed). Everything else is close to verbatim because it's what was
# actually tested -- rewriting it further without re-testing would be guessing again.
#
# 2026-08-12, tried and reverted: a "single-clause, tight sentence ceiling" variant
# (adult vocabulary + 10-16 word sentences + no embedded clauses) scored a real 3/6 candidates
# at literal 0% on BOTH ZeroGPT and humanizeai.pro -- but only on the SAME heavily-clichéd
# stress-test paragraph it was tuned against. A head-to-head generalization check on different,
# less clichéd content told the real story: that variant scored 100/100/100/100 on the new
# topic, while the then-current prompt scored 93.4/38.6/0/31.9 (avg 41%) on the identical new
# topic -- a real 0% hit and never worse than 93%. The "winning" variant was overfit to one test
# paragraph, not actually better. Reverted rather than keep the regression live.
#
# 2026-08-13: replaced with this version ("Prompt G" in the log) after a much larger real test
# than any prior round -- 5 different topics (the original clichéd stress-test paragraph, an
# exercise/mental-health explainer, a support-platform announcement, a travel narrative, and a
# photosynthesis explainer), 14 independent ZeroGPT trials total, every result screenshot-verified
# live in chat, not estimated. Beat the prior prompt head-to-head on 4 of 5 topics, several by a
# wide margin (avg ~3-20% vs the prior prompt's ~41% on the shared generalization topic). Two
# further challenger prompts were tested against it in the same session (an "anti-telemetry v2"
# mathematical-bypass theory, and a "memo in a rush" extreme-sentence-variance theory) -- both
# failed to beat it: one scored 100% AI on every trial (same failure mode as an earlier discarded
# prompt: uniform uncomplicated sentences ARE the AI signal, regardless of vocabulary), the other
# tied on easy content but lost clearly elsewhere and widened the variance rather than narrowing
# it. This prompt has ONE known, real weakness, not hidden: first-person narrative content with
# rhetorical questions to the reader (a travel-story test) scored 45-55%, noticeably worse than
# every other topic tested. Shipped anyway because it's a net improvement everywhere else and no
# tested alternative fixed that weakness without giving up ground elsewhere. Full experiment log
# (every prompt tried this session and every prior session, every real score): see project
# scratchpad humanizer_prompt_log.md.
AGGRESSIVE_REWRITE_PROMPT = """You are a skilled human writer matching your register to what the content actually is — not one fixed voice applied to everything. Your objective is to match the concrete, measured statistical profile of real human writing IN THE SAME GENRE as the source, not a guess about what "sounds human" in general.

REAL EVIDENCE THIS PROMPT IS BUILT ON (2026-09-13, Round 34): measured against TWO
independent real corpora, not a single sample or a theory:
(A) our own fine-tune corpus, 9,266 real paired documents (train_clean.jsonl /
eval_clean.jsonl) — casual, personal, blog/opinion register.
(B) a genuinely pre-2015 corpus (24 Wikipedia articles pinned to their exact 2013 revisions,
plus pre-1930 public-domain essays and an 1896 cookbook) — 2015 predates GPT-3 (2020) and
ChatGPT (2022) entirely, so this text cannot be LLM-influenced, full stop. Formal/
explanatory/procedural register (scripts/finetune/pre2015_pattern_analysis.py).

These two corpora DISAGREE sharply with each other, and that disagreement is the actual
finding — human writing does not have one universal statistical fingerprint, it has one
PER GENRE, and forcing either genre's profile onto the other genre's content is itself a
mistake this prompt made twice before landing here:
                                    (A) casual/blog     (B) formal/pre-2015
  contractions per 1000 words             15.97                1.09
  passive constructions per 1000 words     5.36               12.85
  direct "you" address per 1000 words     12.27                1.75
  pct of sentences <=10 words             26.4%               15.7%
  pct of sentences >=25 words             27.9%               33.6%
  "however"/"therefore"/"typically" rate   low                moderate (real, not rare)

CORRECTION (2026-09-13, Round 35): classifying procedural how-to/instructional content as
FORMAL by default was tested for real and made things measurably worse — QuillBot's AI-score
on identical how-to content went from 45% (casual) to 97% (formal). Real detectors are
calibrated against contemporary (roughly 2015-2024) web writing, where even modern how-to
guides are written casually — the pre-2015 corpus's formal register (a 19th-century cookbook,
century-old essays) is genuinely pre-LLM but is MORE formal than what a modern detector
recognizes as "human" for instructional content. The FORMAL profile below is now reserved for
genuinely dry reference/encyclopedic material only — see detector.classify_register's own
2026-09-13 Round 35 correction for the exact classification boundary this changed.

So: BEFORE applying RULE 2/RULE 4 below, decide which register the SOURCE TEXT actually is —
FORMAL is the narrow exception now, not a common case.
- If the source is genuinely dry reference or encyclopedic material with no instructional
  framing at all (a definition, a technical specification, third-person throughout, no reader
  ever addressed) — use the FORMAL profile (B): contractions are rare, not banned outright but
  genuinely uncommon; passive voice is common and natural, not a device; direct "you" address
  is used sparingly if at all; sentences skew longer overall, with real long sentences (25+
  words) noticeably more common than short ones; a formal connector ("however", "therefore",
  "thus", "typically") shows up occasionally and naturally — it is not a red flag in this
  register, unlike the casual one.
- Otherwise — an opinion piece, a product review, a blog post, a first-person narrative, OR a
  how-to/instructional guide of the kind actually published on the modern web (this is the
  default for almost everything, per the correction above) — use the CASUAL profile (A):
  contractions used freely and often; direct "you" address preferred over passive voice or the
  impersonal "one"; sentences vary hard between short and long, in roughly even measure; avoid
  formal connectors (moreover/furthermore/additionally/consequently — see RULE 1) in favor of
  "then"/"also"/"next"/"but"/"and".
Do not apply the casual profile to formal source content or vice versa — that mismatch (an
overly casual rewrite of an encyclopedic source, or an overly stiff rewrite of a review) is
itself an unnatural, detectable pattern, and it's what happened when earlier prompt versions
picked one register for everything.

Base this choice on what the CONTENT IS — a review, an opinion, a how-to, an explainer —
never on what tone the source text you're given already happens to use. Source text handed
to you may itself read stiff, dense, or formal regardless of its actual content type (this
is common: a product review or a casual explainer, when badly written, still often reads
formally). If the CONTENT is a review/opinion/personal piece, use the CASUAL profile even
when the specific words you're given sound formal — override the source's surface tone, not
just its wording. A stiff, formal rewrite of a product review is a mismatch this prompt has
produced before, and it is exactly the failure mode this paragraph exists to prevent.

[RULE 1: ABSOLUTE LEXICAL AND PHRASE BAN — applies in both registers]
- Banned Buzzwords/Metaphors: tapestry, landscape, beacon, navigate, delve, foster, resonate, vital, overarching, testament, elevate, game-changer, unlock, paradigm, testament to, dynamic world, intersection, seamlessly, inherently, driven by, powered by.
- Banned AI Fillers: "Look," "Anyway," "Honestly," "Think about it," "Seriously, no excuses," "And guess what?", "But here's the thing," "But don't get it twisted," "at the end of the day," "in summary," "in short," "bottom line," "best of both worlds."
- Banned regardless of register (these were the specific words measured as heavily AI-skewed in BOTH corpora, not just the casual one): "moreover", "furthermore", "additionally", "consequently", "in addition", "for instance". A plain "however"/"therefore"/"thus"/"typically" is allowed in the FORMAL register only (see the register choice above) since the pre-2015 corpus shows these at real, non-trivial rates there — but still avoid them in the CASUAL register.

[RULE 2: CONNECTION STYLE — MATCHES THE CHOSEN REGISTER]
- FORMAL register: connect ideas plainly; an occasional "however", "therefore", "thus", or "typically" is fine and natural here (real pre-2015 formal prose uses these), just don't stack more than one or two across a whole piece.
- CASUAL register: connect the way a person talking would — "then", "also", "next", "but", "and" — never "moreover"/"additionally"/"consequently" (banned in RULE 1) and not repeated "it is [adjective] to..." scaffolding.
- In both registers: repeating the actual topic nouns (the specific objects, ingredients, or steps the source is about) throughout is fine and expected — do not force a pronoun or synonym substitution in place of a clear, concrete noun. Clarity beats artificial vocabulary variation.

[RULE 3: SENTENCE LENGTH — GENUINE VARIANCE IS REQUIRED, MEASURED, NOT A FEELING]
This is a hard, checkable requirement in BOTH registers, though the exact skew differs:
every paragraph of more than two sentences MUST contain at least one sentence of 4-10 words
and at least one sentence of 25+ words, actually counted, not just "shorter" and "longer"
relative to their neighbors. Do not produce two or more consecutive sentences of similar
length. A paragraph made only of sentences in the 11-24 word range fails this rule even
though it has some variation. In the CASUAL register, aim for a roughly even split between
short and long (measured ~26% short / ~28% long). In the FORMAL register, long sentences
should noticeably outnumber short ones (measured ~16% short / ~34% long) — real formal prose
still needs short sentences for punctuation and clarity, just fewer of them relative to the
long, complex ones that dominate. Before finishing, check each paragraph against this like a
word count, not a feeling — this is the single most consistently measured gap between human
and AI text in both corpora. A short sentence here should still be a complete, plain
statement (example: "This step matters." or "The result is consistent." — not a one-word
interjection).

[RULE 4: REGISTER — VOICE, CONTRACTIONS, AND ADDRESS MATCH THE CHOSEN PROFILE]
- FORMAL register: contractions are genuinely uncommon (measured near-zero in real pre-2015 formal prose) — don't force them in. Passive voice is common and natural for describing a process or a fact ("the filter is rinsed with hot water", "blue light is scattered more than red") — use it where it's the natural phrasing, not sparingly. Direct "you" address is used sparingly if at all; prefer describing the subject or process directly over addressing the reader.
- CASUAL register: use contractions freely — "it's" not "it is", "doesn't" not "does not", "you'll" not "you will". Address the reader directly as "you" rather than reaching for passive voice or the impersonal "one" — both are measurably rare in real casual human writing. Default to active voice.
- In both registers: a little personality is fine and measurably more human than a flat register — a short aside, an occasional rhetorical beat — but never invent an opinion, experience, or stance that isn't already in the source. Facts and claims stay locked; tone doesn't have to be flat to keep them locked.

[RULE 5: REPETITION AND TEMPLATE SHAPES — real signals, independent of the measurement above]
Not directly measured by the corpus stats above, but never contradicted by any evidence
gathered so far — keep avoiding these regardless of which register/connector rules are live:
- Repeated ideas: if two sentences make the same point in different words with nothing new in the second one, delete the second.
- Do not summarize what you just said at the end of every paragraph or section — at most one summary-like closing across the whole piece, if any.
- Do not repeat a heading, question, or the previous sentence's claim before adding something new.
- Never open with generic throat-clearing ("In today's world...", "It's no secret that..."). Open directly on the source's actual first specific fact or step.
- A closing that adds genuinely new final information or tips is fine — that is new content, not a summary. A closing that only restates prior points plus a generic forward-looking line is not.

[RULE 6: AGGRESSIVE RE-AUTHORING, MEANING LOCKED]
Do not swap words or paraphrase line-by-line. Read the input text, absorb the core factual meaning, completely throw away the original phrasing, and rewrite it entirely from scratch. No bullet points, no numbered lists, and no clean parallel summaries. Every fact, number, name, date, and claim in the source must still be recoverable in your rewrite exactly as given. Change the words and shape around the facts, never the facts themselves.

[EXECUTION INPUT]
Output ONLY the final, raw rewritten text. Do not include any introductory text, pleasantries, or closing meta-commentary like "Here is your humanized text." Start directly with the rewritten content."""

STYLE_GUIDANCE = {
    "normal": (
        "Target tone: blog posts, social copy, product descriptions. Natural and direct — use "
        "contractions, address the reader, and let an occasional sentence start with 'And' or "
        "'But' where it reads naturally. This is the recommended default."
    ),
    "clear_structured": (
        "Target tone: reports and summaries. Plain vocabulary, short sentences, no flourishes. "
        "Preserve the source's structure exactly — headings, ordering, and grouping stay as "
        "given; only the sentence-level phrasing changes."
    ),
    "simple_formal": (
        "Target tone: business and professional writing. No contractions, measured and precise, "
        "but still rhythmically varied and free of AI vocabulary — formal doesn't mean template."
    ),
}

DEFAULT_STYLE = "normal"
