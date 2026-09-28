"""Best-effort AI-text detection.

There is no reliable, general-purpose way to prove a text was AI-generated —
every commercial "AI detector" has real false-positive rates, and they are
worst for short texts, non-native English writing, and formal/technical
prose. This service combines two weak, independent signals into a single
estimate and is explicit about that uncertainty in every response (see
``disclaimer`` below) rather than presenting a bare confident percentage.

Signal 1 (heuristic, deterministic, free): a set of measurable style
counts, no network call — easy to unit test and always available. This is a
SECONDARY channel: it raises suspicion when positive AI-tells are present,
but it is deliberately NOT allowed to vote "human" just because the prose is
clean and well varied — modern AI produces exactly that, and treating polish
as a human signal is what caused clean AI text to be mislabelled.

Signal 2 (LLM judgment, primary): asks the model for its own probability
estimate plus the sentences it finds most AI-like (used for highlighting).
More semantically aware than the heuristics but can fail (bad JSON, API
error); the result degrades gracefully to heuristic-only if so.

2026-09-28 rebuild. The previous heuristic set (burstiness + lexical
diversity + a fixed phrase list) was thin next to what the market actually
measures — real, on-the-record technical material was gathered from
GPTZero, ZeroGPT, QuillBot, Turnitin, Copyleaks, Pangram, HumanizeAI, and
(most usefully) a competitor's own published per-signal breakdown
(cleverhumanizer.ai/ai-detection-reasons, a 28-signal taxonomy across five
groups: vocabulary, sentence structure/rhythm, flow/transitions,
repetition/templates, tone/stance/evidence) and adapted into this file —
never copied verbatim; every threshold below is our own reading of the
publicly stated direction of each signal, re-expressed as our own
constants and re-derived from what we can actually measure. Five new,
zero-cost deterministic signals were added on top of the two that already
existed (burstiness, lexical diversity, phrase hits):

- ``function_word_ratio`` — share of words that are function words
  (pronouns, articles, prepositions, auxiliaries). AI prose leans more
  content-word-dense; human prose carries more connective tissue.
- ``mean_word_length`` — AI prose skews toward longer, more Latinate word
  choices on average; human prose skews shorter and plainer.
- ``trigram_repetition_rate`` — the share of 3-word sequences that repeat
  somewhere else in the text. Counter-intuitively, HUMAN writing repeats
  more of its own phrasing (people fall back on the same few ways of
  saying something); AI models are tuned to diversify wording sentence to
  sentence and so repeat less. Low repetition is the AI-leaning direction
  here, not high.
- ``transition_opener_rate`` — share of sentences that *open* with a stock
  transition word ("Moreover", "Additionally", "Furthermore", ...). This is
  a stricter, more specific version of the old flat phrase count: AI
  prose leans heavily on transition words specifically as sentence
  openers, far more than human prose does.
- ``personal_voice_score`` — density of first-person pronouns and
  opinion/stance verbs ("I think", "in my experience", ...). Deliberately
  asymmetric: presence is allowed to pull the score DOWN toward human,
  but absence never pulls it up — plenty of genuine human writing (formal,
  technical, third-person) has zero personal voice, and over-crediting its
  absence is exactly the kind of tone-based false positive already found
  for real on a non-native-English academic paper (see the blend guardrail
  further down). This mirrors the taxonomy's own explicit warning that its
  tone/stance group is the weakest, most false-positive-prone of the five.

Weighting favors the signals the gathered research consistently ranked as
most separating (predictability/rhythm, specific stock-phrase and
transition-opener usage) and keeps the noisiest, most register-dependent
signals (lexical diversity, word length, tone) as minor contributors —
see the comments in ``compute_heuristics`` for the exact weights.
"""

import json
import logging
import re
import statistics
import unicodedata

from app.core.exceptions import AppError
from app.services.ai_service import AIService
from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)

# 2026-09-29 (Tier 1): reworded per the independent RAID benchmark's own explicit
# recommendation (Dugan et al., ACL 2024, arXiv:2405.07940) — the authors of the largest
# published cross-detector evaluation state plainly that no current AI-text detector,
# including the strongest ones they tested, should be used "in any sort of disciplinary or
# punitive context." That is not our own caution dressed up — it is the field's own
# measured conclusion, and our wording should say so plainly rather than hedge around it.
DISCLAIMER = (
    "A strict estimate, not proof. Every public benchmark of AI-text detectors — including "
    "the strongest ones on the market — finds real false positives, worse on short, formal, "
    "or non-native-English writing. Do not use this result to accuse, discipline, or penalize "
    "anyone; that is exactly the use every independent study of these tools warns against."
)

# Phrases disproportionately common in unedited LLM output. Not proof on
# their own — just one weak signal among several.
_AI_TELL_PHRASES = [
    "delve into", "tapestry", "boundaries of", "landscape of", "moreover,",
    "furthermore,", "in conclusion,", "it's important to note", "it is important to note",
    "in today's world", "in the realm of", "navigate the complexities",
    "unlock the potential", "unleash the power", "harness the power",
    "cutting-edge", "seamless", "holistic approach", "paradigm shift",
    "testament to", "ever-evolving", "in summary,", "overall,", "additionally,",
    "consequently,", "notably,", "plays a crucial role", "plays a vital role",
    "as an ai language model", "i cannot browse the internet",
    "it's worth noting", "when it comes to", "a myriad of", "underscores the importance",
    "at the end of the day", "dive deeper", "the ever-changing", "crucial to understand",
]

# Structural constructions (not fixed phrases) disproportionately common in
# unedited LLM output — negative parallelism ("isn't X, it's Y") and vague
# appeals to unnamed authority. Same weak-signal caveat as the phrase list
# above: common enough in genuine human writing that a single hit proves
# nothing, but density across a whole document is corroborating evidence.
_AI_TELL_PATTERNS = [
    re.compile(r"\b(?:is|are|was|were)\s*n[o']t\b[^.?!,]{0,50},\s*it'?s\b", re.IGNORECASE),
    re.compile(r"\bit'?s\s+not\s+[^.?!,]{2,40},\s*it'?s\b", re.IGNORECASE),
    re.compile(r"\bnot\s+(?:just|only)\b[^.?!]{0,60}?\bbut\b", re.IGNORECASE),
    re.compile(r"\b(?:studies show|experts agree|research suggests|industry insiders|it is widely known|it's widely known)\b", re.IGNORECASE),
]

# Closed-class function words: pronouns, articles, prepositions, conjunctions,
# auxiliary/modal verbs. Deliberately a broad, standard closed-class list, not
# tuned to any one corpus.
_FUNCTION_WORDS = frozenset(
    """
    the a an and or but if then because as until while of at by for with about
    against between into through during before after above below to from up
    down in out on off over under again further once here there when where why
    how all any both each few more most other some such no nor not only own
    same so than too very s t can will just don should now is am are was were
    be been being have has had having do does did doing i me my myself we our
    ours ourselves you your yours yourself yourselves he him his himself she
    her hers herself it its itself they them their theirs themselves what
    which who whom this that these those
    """.split()
)

# Stock sentence-opening transition words/phrases. Checked ONLY at the start
# of a sentence (after stripping leading quotes/parens) — this is stricter
# and more specific than a flat phrase count anywhere in the text, matching
# how the gathered research frames this as a sentence-opener signal.
_TRANSITION_OPENERS = frozenset(
    """
    moreover furthermore additionally consequently therefore thus hence
    however nevertheless nonetheless meanwhile overall importantly notably
    ultimately significantly conversely accordingly indeed similarly likewise
    """.split()
)

# First-person pronouns + explicit opinion/stance verbs — presence-only
# signal, see the module docstring's ``personal_voice_score`` explanation
# for why absence is never allowed to count against the text.
_PERSONAL_VOICE_RE = re.compile(
    r"\b(i|i'?m|i'?ve|i'?d|i'?ll|me|my|mine|myself|we|we'?re|we'?ve|our|ours)\b"
    r"|\b(i think|i believe|i feel|i suspect|i doubt|in my experience|"
    r"in my opinion|personally|honestly|to me)\b",
    re.IGNORECASE,
)

# 2026-09-29 (Tier 1 of the ground-up rebuild plan): homoglyph substitution and invisible
# zero-width characters are the single most damaging real adversarial attack against every
# perplexity/burstiness-family detector, per the independent RAID benchmark (Dugan et al.,
# ACL 2024, arXiv:2405.07940) — a -36% to -41% accuracy hit against Binoculars and GLTR, far
# worse than misspelling or whitespace attacks. Both attacks work the same way: insert a
# character that is invisible or visually identical to the reader but breaks the literal
# string a naive detector scores (a genuine "bee | Credits:" scraped-web-page-style problem,
# but adversarial rather than incidental). Normalizing BOTH before scoring is a real,
# zero-cost, evidence-backed defense with no plausible downside for genuine text: it never
# changes what a human reader sees, so it can't introduce a new false positive/negative on
# clean input.
_HOMOGLYPH_MAP = str.maketrans(
    {
        # Cyrillic lookalikes -> Latin
        "а": "a", "е": "e", "о": "o", "р": "p", "с": "c",
        "х": "x", "у": "y", "і": "i", "ѕ": "s", "ј": "j",
        "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M",
        "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T",
        "Х": "X", "Ѕ": "S", "І": "I",
        # Greek lookalikes -> Latin
        "ο": "o", "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z",
        "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N",
        "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
    }
)


def _normalize_evasion_chars(text: str) -> str:
    """Strip invisible Unicode "format" characters (zero-width space/joiner, word joiner,
    byte-order-mark, soft hyphen, etc. — Unicode general category "Cf", a generic rule
    rather than a hand-maintained list) and map common single-character Cyrillic/Greek
    homoglyphs back to their visually-identical Latin letter. Applied once, up front, so
    every downstream signal (heuristics AND the LLM call) sees the same normalized text —
    partial application would let a homoglyph survive into the LLM prompt or vice versa."""
    without_invisible = "".join(ch for ch in text if unicodedata.category(ch) != "Cf")
    return without_invisible.translate(_HOMOGLYPH_MAP)


MIN_WORDS_FOR_CONFIDENCE = 60

_LLM_SYSTEM_PROMPT = """You are a strict, decisive AI-text detector. Estimate the probability that \
the given text was generated by an AI language model.

Judge across five groups of signals, weighted in this order — earlier groups matter more and \
should dominate the call; later groups are corroborating at best and must never carry a verdict \
on their own:

1. RHYTHM & PREDICTABILITY (weigh most): sentence-length variation, paragraph-length variation, \
how predictable the next word/clause feels. AI prose tends toward a narrow, comfortable band of \
sentence lengths and a smooth, low-surprise flow; human prose lurches — a clipped sentence, then \
a long winding one, an aside, a fragment.
2. VOCABULARY & WORD CHOICE: stock AI vocabulary ("delve", "tapestry", "landscape", "underscores", \
"testament to", "seamless", "robust", "leverage" as a verb), a preference for the more formal/ \
Latinate synonym over the plain one, and a low rate of ordinary function words (a, the, of, and, \
but...) relative to content words.
3. FLOW & TRANSITIONS: heavy, mechanical use of transition words as sentence openers \
("Moreover,", "Furthermore,", "Additionally,", "In conclusion,") — genuinely useful in moderation \
but a strong tell when nearly every paragraph opens with one.
4. REPETITION & TEMPLATES: repeated sentence templates ("It's not just X, it's Y" over and over), \
formulaic list/parallel structures, near-identical openings across paragraphs. Note this is about \
STRUCTURAL templates repeating, not phrase repetition in general — genuine human writers often \
reuse the SAME exact short phrase across a piece more than AI does, so word-for-word phrase reuse \
alone is not itself a tell.
5. TONE, STANCE & EVIDENCE (weigh least, and treat with real caution): presence/absence of \
personal voice, opinion, or lived specificity. This is the WEAKEST and most false-positive-prone \
group — plenty of genuine human writing (formal, technical, third-person, non-native-English) has \
no personal voice at all, and that absence must never by itself push the score toward "AI". Use \
this group only to pull a genuinely close call slightly one way, never to decide it.

Be decisive. Do not default to a cautious middle-ground number just because you are not 100% \
certain — that is a cop-out, not caution. Commit to 0.8+ when groups 1-3 show real AI-typical \
patterns; commit to 0.2 or below when they show genuine human irregularity and specificity. \
Reserve 0.4-0.6 ONLY for text that is genuinely, evenly ambiguous on groups 1-3 — not as a \
default fallback, and never based on group 5 alone.

Critical: clean grammar, correct spelling, and varied sentence length are NOT evidence of a \
human author by themselves. Modern AI produces polished, well-varied prose. Judge the full \
pattern above — not surface polish, and not personal voice in isolation.

Also critical: weigh proportion. If only a short aside reads as personal while the surrounding \
majority of the text shows AI-typical patterns in groups 1-3, that majority should still decide \
the score — a brief human-sounding line does not override a longer AI-typical passage around it.

In fiction, poetry, marketing, reviews, or any first-person creative writing, personal voice \
alone is NOT proof of a human author — competent AI produces vivid, emotional, first-person prose \
fluently. The real test in these genres is specific vs. generic:
- Human-leaning: a narrator notices one small, slightly odd, unflattering, or physically specific \
detail that has no narrative purpose — the kind of thing only someone who was actually there would \
think to mention (an exact object, an exact minor embarrassment, a stray unrelated thought).
- AI-leaning: description built from generic, swappable "mood" imagery (rain as sadness, a \
sunset as hope, "memories flooding back") that could be dropped into any other piece on a similar \
theme without losing anything specific to this one.
Ask: does a detail feel like one person's odd, unrepeatable noticing, or could it be swapped into \
any other piece about a similar feeling without losing anything? The first is human evidence even \
in fiction or poetry; the second is not, regardless of genre — and this cuts both ways: genuinely \
specific, idiosyncratic personal-voice writing should still score low even when it's clearly \
fiction, poetry, or persuasive copy.

Also copy out, verbatim, the individual sentences from the text that most strongly read as \
AI-written (up to 6, exactly as they appear). If the whole text reads human, return an empty list.

Respond with ONLY a JSON object, no other text: \
{"ai_probability": <float 0.0-1.0>, "reasoning": "<one short, direct sentence>", \
"ai_sentences": ["<verbatim sentence>", ...]}"""


# Leftover AI-assistant response scaffolding: the model announcing what it's
# about to write, rather than just writing it. Found live in production
# (2026-09-28): a paragraph opening "Here is a short, random essay about the
# quiet magic of ordinary mornings." scored heuristic_score=2 (clean of every
# OTHER signal — no banned phrases, no stock transition openers, decent
# burstiness) and the moderate-LLM guardrail above suppressed a correctly-
# leaning LLM call, giving a 2% "likely_human" verdict on text that reads,
# to any human, as an obvious AI response with the preamble left in — no
# genuine human essay opens by describing itself in the third person like
# this. Unlike every other signal in this file, this one is close to
# unambiguous when it fires, so it's weighted far more heavily than a single
# banned-vocabulary hit and is checked independent of the LLM's own read.
_AI_META_PREAMBLE_RE = re.compile(
    r"^(certainly[!,.]?\s*)?"
    r"(here(?:'s| is)|below is|the following is|i'?d be happy to (?:help|write|provide|draft))"
    r"\b[^.!?\n]{0,80}\b(essay|paragraph|article|passage|response|piece|write-?up|summary|poem|story|text)\b",
    re.IGNORECASE,
)

_MIN_PROBABILITY = 0.02
_MAX_PROBABILITY = 0.98

_PARAGRAPH_SYSTEM_PROMPT = """You will receive a text split into numbered segments, each on its \
own line prefixed "[N] ". For EACH segment, independently estimate the probability it was \
AI-generated, using the same strict standard: judge voice, specificity, and idiosyncrasy — not \
surface polish. Commit to decisive numbers; reserve 0.4-0.6 only for a segment that is genuinely, \
evenly ambiguous on its own.

Respond with ONLY a JSON object, no other text: \
{"segments": [{"index": <int>, "ai_probability": <float 0.0-1.0>}, ...]}"""

_MAX_PARAGRAPHS = 12


def _sharpen(probability: float, factor: float = 2.0) -> float:
    """Stretch a probability away from 0.5 so genuinely-close-to-even signals
    still land near 0.5, but anything with real signal in one direction
    commits to a decisive call instead of hedging into "uncertain".

    Clamped short of 0%/100%: this is a heuristic estimate, not proof, and a
    literal 0% or 100% overclaims certainty no detector actually has —
    that's as dishonest as hedging everything into "uncertain" was."""
    stretched = 0.5 + (probability - 0.5) * factor
    return max(_MIN_PROBABILITY, min(_MAX_PROBABILITY, stretched))


def _split_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s.strip()]


def _function_word_ratio(words: list[str]) -> float:
    if not words:
        return 0.0
    return sum(1 for w in words if w.lower() in _FUNCTION_WORDS) / len(words)


def _mean_word_length(words: list[str]) -> float:
    if not words:
        return 0.0
    return sum(len(w) for w in words) / len(words)


def _trigram_repetition_rate(words: list[str]) -> float:
    """Share of word-trigrams that occur more than once in the text.
    See the module docstring: HIGH repetition leans human here, LOW leans AI."""
    lowered = [w.lower() for w in words]
    if len(lowered) < 6:
        return 0.0
    trigrams = [tuple(lowered[i : i + 3]) for i in range(len(lowered) - 2)]
    counts: dict[tuple, int] = {}
    for tg in trigrams:
        counts[tg] = counts.get(tg, 0) + 1
    repeated = sum(count for count in counts.values() if count > 1)
    return repeated / len(trigrams)


def _transition_opener_rate(sentences: list[str]) -> float:
    if not sentences:
        return 0.0
    opens = 0
    for s in sentences:
        cleaned = s.strip().strip("\"'“‘(")
        first_word = re.match(r"[A-Za-z]+", cleaned)
        if first_word and first_word.group(0).lower() in _TRANSITION_OPENERS:
            opens += 1
    return opens / len(sentences)


def _personal_voice_score(text: str, word_count: int) -> float:
    """Density of first-person/opinion markers per 100 words. Presence-only
    signal by construction — see module docstring."""
    if word_count == 0:
        return 0.0
    hits = len(_PERSONAL_VOICE_RE.findall(text))
    return (hits / word_count) * 100


def compute_heuristics(text: str) -> dict:
    """Pure, deterministic writing-style heuristics. No network calls.

    Seven signals combined into one 0-100 "suspicion" score. This channel is
    one-sided by design: positive AI-tells push the score up, but ordinary
    clean/varied prose scores near zero rather than being read as strong
    human evidence — modern AI produces clean, varied prose too, and voting
    "human" on polish alone is the exact false-negative this file previously
    had. See the module docstring for what each new signal measures and why.

    Weights favor what the gathered competitive research consistently
    describes as the most separating signal families — sentence-rhythm
    predictability and specific stock-phrase/transition-opener usage — over
    noisier, more register-dependent ones (raw lexical diversity, word
    length). Personal-voice is handled separately, as a capped SUBTRACTION
    at the end, never a positive contributor — see its docstring.
    """
    words = re.findall(r"[A-Za-z']+", text)
    sentences = _split_sentences(text)
    sentence_lengths = [len(re.findall(r"[A-Za-z']+", s)) for s in sentences if s]
    word_count = len(words)

    # Burstiness: coefficient of variation of sentence length. Human writing
    # tends to vary sentence length more; uniform sentence lengths lean AI-ish.
    # Normalized to 0 (very uniform, AI-leaning) - 1 (very bursty, human-leaning).
    if len(sentence_lengths) >= 2 and statistics.mean(sentence_lengths) > 0:
        cv = statistics.pstdev(sentence_lengths) / statistics.mean(sentence_lengths)
        burstiness = min(cv / 0.6, 1.0)  # 0.6 CV ~ typical bursty human writing
    else:
        burstiness = 0.5  # not enough sentences to judge — neutral

    # Lexical diversity: unique words / total words.
    lexical_diversity = len(set(w.lower() for w in words)) / word_count if words else 0.0

    # AI-tell phrase density, per 100 words (anywhere in the text).
    lowered = text.lower()
    hits = sum(lowered.count(phrase) for phrase in _AI_TELL_PHRASES)
    hits += sum(len(pattern.findall(text)) for pattern in _AI_TELL_PATTERNS)
    hits_per_100 = (hits / word_count) * 100 if words else 0.0

    function_word_ratio = _function_word_ratio(words)
    mean_word_length = _mean_word_length(words)
    trigram_repetition_rate = _trigram_repetition_rate(words)
    transition_opener_rate = _transition_opener_rate(sentences)
    personal_voice_score = _personal_voice_score(text, word_count)

    # Each sub-score is 0-100, "how AI-like is this specific signal".
    uniformity_score = max(0.0, (0.45 - burstiness) / 0.45) * 100
    diversity_score = max(0.0, (0.50 - lexical_diversity)) * 200
    phrase_score = min(hits_per_100 * 30, 100)
    # function-word ratio: human ~40%, AI ~33% is the observed direction —
    # score rises as the ratio drops below a human-typical ~38%.
    function_word_score = max(0.0, (0.38 - function_word_ratio)) * 400
    # mean word length: AI skews longer/more Latinate; score rises above a
    # plain-English baseline of ~5.3 chars, saturating by ~6.2.
    word_length_score = max(0.0, min((mean_word_length - 5.3) / 0.9, 1.0)) * 100
    # trigram repetition: LOW repetition leans AI here (see docstring) —
    # score rises as repetition falls below a human-typical ~3%.
    trigram_score = max(0.0, (0.03 - trigram_repetition_rate) / 0.03) * 100
    # transition-opener rate: human writing opens with a stock transition on
    # roughly 1 sentence in 10 or fewer; AI prose leans much higher.
    transition_score = max(0.0, min((transition_opener_rate - 0.10) / 0.25, 1.0)) * 100

    heuristic_score = (
        phrase_score * 0.28
        + uniformity_score * 0.18
        + function_word_score * 0.15
        + transition_score * 0.15
        + trigram_score * 0.10
        + word_length_score * 0.07
        + diversity_score * 0.07
    )

    # Personal voice is subtractive-only: real presence of first-person/
    # opinion markers pulls the score down (capped at -15), but its absence
    # never adds anything — see module docstring on false-positive risk.
    personal_voice_relief = min(personal_voice_score * 3, 15.0)
    heuristic_score = max(0.0, min(heuristic_score - personal_voice_relief, 100.0))

    # Leftover AI-assistant preamble ("Here is a short essay about...") is
    # close to unambiguous when present — see its regex's docstring for the
    # real false-negative this fixed. Applied AFTER personal-voice relief and
    # as a floor, not an addend: no amount of clean burstiness or personal
    # voice elsewhere in the text should be able to explain away the model
    # literally describing its own output instead of just writing it.
    meta_preamble_hit = bool(_AI_META_PREAMBLE_RE.match(text.strip()))
    if meta_preamble_hit:
        heuristic_score = max(heuristic_score, 90.0)

    return {
        "burstiness": round(burstiness, 4),
        "lexical_diversity": round(lexical_diversity, 4),
        "ai_phrase_hits": hits,
        "function_word_ratio": round(function_word_ratio, 4),
        "mean_word_length": round(mean_word_length, 3),
        "trigram_repetition_rate": round(trigram_repetition_rate, 4),
        "transition_opener_rate": round(transition_opener_rate, 4),
        "personal_voice_score": round(personal_voice_score, 3),
        "heuristic_score": round(heuristic_score, 2),
        "word_count": word_count,
        # Internal only — not part of the public CheckSignals schema (kept
        # out deliberately: it's a same-session helper flag for check_text's
        # explanation text, not a graduated 0-1 "signal" like the others).
        "meta_preamble_hit": meta_preamble_hit,
    }


def _verdict(probability: float) -> str:
    if probability < 0.4:
        return "likely_human"
    if probability > 0.6:
        return "likely_ai"
    return "uncertain"


def _verified_sentences(candidates: list[str], source: str) -> list[str]:
    """Keep only LLM-returned sentences that actually appear in the source text.

    The model is asked for verbatim sentences, but it can paraphrase or
    hallucinate; the frontend highlights by substring match, so anything that
    isn't genuinely present would either fail to highlight or (worse) mislead.
    """
    source_low = source.lower()
    seen: set[str] = set()
    out: list[str] = []
    for candidate in candidates:
        cleaned = candidate.strip()
        key = cleaned.lower()
        if len(cleaned) >= 12 and key in source_low and key not in seen:
            seen.add(key)
            out.append(cleaned)
    return out[:6]


def _split_segments(text: str) -> list[str]:
    """Split into blank-line paragraphs; if the text has none (a single dense
    block), fall back to grouping sentences into ~2-3-sentence chunks so
    Advanced Scan still has multiple segments to break down."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if len(paragraphs) >= 2:
        return paragraphs[:_MAX_PARAGRAPHS]

    sentences = _split_sentences(text)
    if len(sentences) < 4:
        return []  # too short to meaningfully break down

    chunk_size = 2 if len(sentences) <= 10 else 3
    chunks = [
        " ".join(sentences[i : i + chunk_size]).strip()
        for i in range(0, len(sentences), chunk_size)
    ]
    return [c for c in chunks if c][:_MAX_PARAGRAPHS]


class CheckerService:
    def __init__(self, ai_service: AIService):
        self.ai_service = ai_service

    async def _llm_analysis(self, text: str) -> tuple[float | None, str | None, list[str]]:
        """Primary signal: probability + the sentences the model finds most AI-like."""
        try:
            raw = await self.ai_service.classify(
                [("system", _LLM_SYSTEM_PROMPT), ("human", text[:8000])]
            )
            parsed = json.loads(raw.strip().strip("`").removeprefix("json").strip())
            probability = float(parsed["ai_probability"])
            probability = max(0.0, min(1.0, probability))
            reasoning = str(parsed.get("reasoning", ""))[:300]
            raw_sentences = parsed.get("ai_sentences") or []
            candidates = [str(s) for s in raw_sentences if isinstance(s, str)]
            return probability, reasoning, candidates
        except Exception:
            logger.warning("checker_llm_estimate_failed", exc_info=True)
            return None, None, []

    async def _paragraph_breakdown(self, text: str) -> list[dict]:
        """Advanced Scan: score each paragraph/segment independently, rather
        than only the whole text plus a handful of flagged sentences. One
        extra LLM call, only made when the caller asks for it.

        Tried folding a word-count-weighted average of these segment scores
        into the primary probability (so a short human-sounding aside inside
        an AI-majority document couldn't anchor the whole-text read). Reverted:
        live testing showed the per-segment scores themselves are unreliable —
        on one real case the personal, human-sounding sentences scored HIGHER
        AI-probability (0.9, 0.98) than the surrounding generic corporate
        prose (0.1, 0.7), backwards from the intended signal — and repeat
        runs on identical input drifted (0.5-0.98 range across two calls)
        despite the temperature=0 classifier client. Blending an unreliable,
        non-reproducible secondary signal into the primary score risked
        reintroducing the exact repeatability bug fixed earlier in this
        project. Left as a display-only feature for Advanced Scan.
        """
        segments = _split_segments(text)
        if len(segments) < 2:
            return []

        numbered = "\n\n".join(f"[{i + 1}] {seg}" for i, seg in enumerate(segments))
        try:
            raw = await self.ai_service.classify(
                [("system", _PARAGRAPH_SYSTEM_PROMPT), ("human", numbered[:10000])]
            )
            parsed = json.loads(raw.strip().strip("`").removeprefix("json").strip())
            raw_segments = parsed.get("segments") or []
        except Exception:
            logger.warning("checker_paragraph_breakdown_failed", exc_info=True)
            return []

        indexed_out: list[tuple[int, dict]] = []
        for item in raw_segments:
            if not isinstance(item, dict):
                continue
            try:
                idx = int(item.get("index")) - 1
                probability = max(0.0, min(1.0, float(item.get("ai_probability"))))
            except (TypeError, ValueError):
                continue
            if 0 <= idx < len(segments):
                sharpened = _sharpen(probability)
                indexed_out.append(
                    (
                        idx,
                        {
                            "text": segments[idx],
                            "ai_probability": round(sharpened, 4),
                            "verdict": _verdict(sharpened),
                        },
                    )
                )
        indexed_out.sort(key=lambda pair: pair[0])
        return [item for _, item in indexed_out]

    async def check_text(self, text: str, advanced: bool = False) -> dict:
        stripped = _normalize_evasion_chars(text.strip())
        if not stripped:
            raise AppError(code="EMPTY_TEXT", message="Text must not be empty", status_code=400)

        max_chars = int(runtime_settings.get("checker_max_chars"))
        if len(stripped) > max_chars:
            raise AppError(
                code="TEXT_TOO_LONG",
                message=f"Text exceeds the {max_chars}-character limit",
                status_code=413,
            )

        heuristics = compute_heuristics(stripped)
        llm_probability, llm_reasoning, llm_sentences = await self._llm_analysis(stripped)

        heuristic_probability = heuristics["heuristic_score"] / 100.0
        if llm_probability is not None:
            # The LLM is the primary, semantically-aware signal; heuristics
            # corroborate. Weighted 70/30 toward the LLM.
            blended_probability = 0.7 * llm_probability + 0.3 * heuristic_probability
            # Guardrail against the false-negative this rework fixes: when the
            # heuristic looks "human" (clean, varied prose) but the LLM is
            # GENUINELY confident it's AI (>=0.9), do not let the heuristic
            # drag that call back down toward "uncertain". Gated at 0.9 rather
            # than any heuristic<llm gap: an unconditional floor also
            # amplified moderately-confident LLM calls (~0.85, right at the
            # prompt's own "high" threshold, not deep into it) into an
            # overclaimed near-100% number on text the heuristic correctly
            # read as human — found via a real false positive on a genuine,
            # non-native-English academic paper excerpt. Positive AI-tells can
            # still pull the blend up via the weighted average above.
            if heuristic_probability < llm_probability and llm_probability >= 0.9:
                blended_probability = max(blended_probability, llm_probability * 0.9)

            # Mirror-image guardrail, found for real (2026-09-28): a purely
            # descriptive, mood-driven human paragraph (a "cozy rainy
            # afternoon" essay — no first-person voice, but also zero
            # deterministic AI-tells: no banned phrases, no stock transition
            # openers, no repeated-trigram thinness, natural burstiness)
            # scored heuristic_score=10 (genuinely clean) while the LLM was
            # only MODERATELY confident it was AI (0.7, well under the 0.9
            # "genuine conviction" gate above) — and the 70/30 blend still
            # dragged the result into "uncertain"/borderline-AI territory.
            # Two independent free market AI detectors called that same text
            # 93%+ human; our own deterministic checks agreed; only the LLM's
            # moderate, non-decisive number disagreed. A moderate-confidence
            # LLM call should not be able to override heuristics that are THIS
            # clean (< 0.15) — that combination is exactly the "genuinely
            # ambiguous" case the LLM prompt itself says to use sparingly, not
            # a case for the LLM to carry alone.
            #
            # 2026-09-29: the threshold here was originally `< 0.85`, deliberately
            # left just short of the guardrail above's `>= 0.9` "genuine conviction"
            # gate. A structured 24-sample validation run (scripts/checker_eval/,
            # 8 topic-matched human/AI/humanized triples) found this gap was a real,
            # not theoretical, bug: 5 of 8 genuine 2013-Wikipedia human paragraphs
            # (heuristic_score 0-8, genuinely clean) were misclassified likely_ai —
            # and in EVERY one of those 5 cases llm_probability landed at EXACTLY
            # 0.85, an LLM self-report anchor value that fell precisely in the
            # unprotected gap between the two guardrails. Widened to `< 0.9` so the
            # two guardrails share one continuous boundary with no gap between them —
            # confirmed against the same validation set to fix all 5 real failures.
            if heuristic_probability < 0.15 and llm_probability < 0.9:
                blended_probability = min(blended_probability, 0.3 * llm_probability + 0.7 * heuristic_probability)

            # Floor for the leftover-AI-preamble signal specifically, found for real
            # right after it shipped: the LLM's own self-reported probability is
            # genuinely noisy across identical calls on identical text (observed 0.3,
            # 0.75, 0.85 on the same paragraph in a row) - a low noisy sample (e.g.
            # 0.3) blended 70/30 still pulled a heuristic_score=90 case (the preamble
            # detector firing, close to unambiguous ground truth) down to only 46%
            # ("uncertain") instead of a decisive AI call. Unlike the other heuristic
            # sub-scores, which are graduated and genuinely benefit from LLM
            # corroboration, the preamble detector is closer to a fact than a
            # suspicion - so it gets its own floor instead of relying on the blend.
            if heuristics["meta_preamble_hit"]:
                blended_probability = max(blended_probability, 0.85)
        else:
            blended_probability = heuristic_probability
        final_probability = _sharpen(blended_probability)

        confidence = "low" if heuristics["word_count"] < MIN_WORDS_FOR_CONFIDENCE else "moderate"
        ai_sentences = _verified_sentences(llm_sentences, stripped)
        paragraphs = await self._paragraph_breakdown(stripped) if advanced else []

        explanation_parts = []
        if heuristics["meta_preamble_hit"]:
            explanation_parts.append(
                "This text opens with leftover AI-assistant phrasing (e.g. \"Here is a...\") "
                "describing the writing instead of just writing it — a near-certain AI tell."
            )
        if llm_reasoning:
            explanation_parts.append(llm_reasoning)
        if heuristics["ai_phrase_hits"] > 0:
            explanation_parts.append(
                f"Flagged {heuristics['ai_phrase_hits']} phrase(s) overused in AI writing."
            )
        if confidence == "low":
            explanation_parts.append(
                f"Text is short ({heuristics['word_count']} words) — treat this call with extra caution."
            )
        if not explanation_parts:
            explanation_parts.append("Based on sentence-rhythm uniformity and word-choice patterns.")

        return {
            "ai_probability": round(final_probability, 4),
            "verdict": _verdict(final_probability),
            "confidence": confidence,
            "signals": {
                "burstiness": heuristics["burstiness"],
                "lexical_diversity": heuristics["lexical_diversity"],
                "ai_phrase_hits": heuristics["ai_phrase_hits"],
                "function_word_ratio": heuristics["function_word_ratio"],
                "mean_word_length": heuristics["mean_word_length"],
                "trigram_repetition_rate": heuristics["trigram_repetition_rate"],
                "transition_opener_rate": heuristics["transition_opener_rate"],
                "personal_voice_score": heuristics["personal_voice_score"],
                "heuristic_score": heuristics["heuristic_score"],
                "llm_probability": round(llm_probability, 4) if llm_probability is not None else None,
            },
            "ai_sentences": ai_sentences,
            "paragraphs": paragraphs,
            "explanation": " ".join(explanation_parts),
            "disclaimer": DISCLAIMER,
        }
