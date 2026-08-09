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
