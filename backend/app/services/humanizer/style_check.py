"""Deterministic, non-LLM checks for the two specific signals that prompt-only instructions
proved unable to reliably fix (2026-09-13, STATE.md Round 34): sentence-length variance and,
in the casual register, contraction rate. Three worded prompt attempts at forcing genuine
short/long sentence variance moved the measured output only slightly each time (see
prompts.py RULE 3's evidence history); a fourth attempt at getting the model to override a
source's formal surface tone to match a casual content type also failed, measured directly
(zero contractions, zero "you" address, twice in a row). Both are checkable with plain code,
so this module checks them with plain code instead of asking the model to self-report.

Findings are returned in the SAME shape detector.py's LLM-based findings use
({"type", "paragraph", "detail"}) so they merge into pipeline.py's existing per-paragraph
Pass 3 retry mechanism unchanged -- no new retry path, just a second source of findings
feeding the one that already exists and is already tested.
"""

import re

_SENT_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_WORD_RE = re.compile(r"[A-Za-z']+")
_CONTRACTION_RE = re.compile(r"\w+['’]\w+")

# Matches prompts.py RULE 3's stated thresholds exactly -- keep these two in sync by hand
# if RULE 3's wording ever changes, the same way pipeline.py's AGGRESSIVE_BANNED_VOCABULARY
# scorer is kept in sync with prompts.py's RULE 1 by a comment, not by importing constants
# across an unrelated concern.
SHORT_WORD_THRESHOLD = 10
LONG_WORD_THRESHOLD = 25
MIN_SENTENCES_TO_CHECK = 3  # a 1-2 sentence paragraph has no meaningful "variance" to measure

# Measured casual-register contraction rate is ~16 per 1000 words (human_pattern_analysis.py,
# Round 33). This threshold is deliberately far below that, not a target to hit exactly --
# it only exists to catch the total-absence failure mode actually observed (0 contractions
# across an entire paragraph), not to micromanage every paragraph toward the exact corpus mean.
MIN_CONTRACTIONS_PER_1000_WORDS = 4.0
MIN_WORDS_FOR_CONTRACTION_CHECK = 25  # a short paragraph having 0 contractions isn't a signal


def _sentence_word_counts(paragraph: str) -> list[int]:
    sentences = _SENT_SPLIT_RE.split(paragraph.strip())
    return [len(_WORD_RE.findall(s)) for s in sentences if s.strip()]


def sentence_length_findings(paragraphs: list[str]) -> list[dict]:
    """Flags any paragraph (with enough sentences to judge) missing a genuinely short
    (<=10 word) or genuinely long (>=25 word) sentence -- the exact requirement
    AGGRESSIVE_REWRITE_PROMPT's RULE 3 states, checked directly instead of trusted."""
    findings = []
    for idx, paragraph in enumerate(paragraphs):
        lengths = _sentence_word_counts(paragraph)
        if len(lengths) < MIN_SENTENCES_TO_CHECK:
            continue
        has_short = any(length <= SHORT_WORD_THRESHOLD for length in lengths)
        has_long = any(length >= LONG_WORD_THRESHOLD for length in lengths)
        if has_short and has_long:
            continue
        missing = []
        if not has_short:
            missing.append(f"a genuinely short sentence ({SHORT_WORD_THRESHOLD} words or fewer)")
        if not has_long:
            missing.append(f"a genuinely long sentence ({LONG_WORD_THRESHOLD}+ words)")
        findings.append(
            {
                "type": "sentence_length_uniform",
                "paragraph": idx,
                "detail": (
                    f"Every sentence in this paragraph is missing {' and '.join(missing)}. "
                    "Rewrite it so it contains both, without changing any fact, number, or claim — "
                    "split one sentence into a short one plus the rest, or combine two sentences "
                    "into one longer one, whichever reads more naturally here."
                ),
            }
        )
    return findings


def contraction_findings(paragraphs: list[str], register: str) -> list[dict]:
    """Only meaningful in the casual register -- formal-register text genuinely uses
    contractions rarely (see prompts.py RULE 4's pre-2015 corpus evidence), so this check
    is skipped entirely for formal text rather than penalizing correct formal output."""
    if register != "casual":
        return []
    findings = []
    for idx, paragraph in enumerate(paragraphs):
        word_count = len(_WORD_RE.findall(paragraph))
        if word_count < MIN_WORDS_FOR_CONTRACTION_CHECK:
            continue
        contractions = len(_CONTRACTION_RE.findall(paragraph))
        rate = 1000 * contractions / word_count
        if rate >= MIN_CONTRACTIONS_PER_1000_WORDS:
            continue
        findings.append(
            {
                "type": "missing_contractions",
                "paragraph": idx,
                "detail": (
                    "This paragraph reads as casual/conversational content but uses almost no "
                    "contractions. Rewrite it using natural contractions (it's, doesn't, you'll, "
                    "that's, etc.) wherever a real person would use them, without changing any "
                    "fact, number, or claim."
                ),
            }
        )
    return findings


def deterministic_findings(paragraphs: list[str], register: str) -> list[dict]:
    """Combined entry point pipeline.py calls — everything this module checks, merged
    into one findings list in the same shape detector.py's LLM findings use."""
    return sentence_length_findings(paragraphs) + contraction_findings(paragraphs, register)
