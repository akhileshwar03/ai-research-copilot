"""Measure real, quantified stylistic patterns in our OWN clean human-text corpus
(Phase 2, Humaniser LoRA fine-tune -- see STATE.md Round 33).

Every prompt rewrite up to this point (Rounds 31-32) was built on one of two things: a
theoretical 28-signal taxonomy document, or a single competitor's single sample output
(CleverAI Humanizer, n=1, one topic). Both are guesses about what "human-sounding" text
looks like statistically. We don't need to guess -- `train_clean.jsonl` / `eval_clean.jsonl`
(Round 29's cleaned corpus) already pair AI-generated source text (`user` role) with real,
originally-human-written target text (`assistant` role) for 9,266 rows. The `assistant` side
IS our own ground truth for "what does real human writing actually measure like" -- not a
theory, not one example, our actual training label distribution across thousands of rows.

This script measures the `assistant` (human) side against the `user` (AI) side on every
signal this project has argued about by feel so far: sentence-length distribution (the
whole Round 31-32 fight was about this, with n=1 evidence each time), contraction rate,
"you" vs "one" pronoun choice, transition/connector word frequency, passive-voice rate,
em-dash frequency, and sentence-starter diversity. Read-only against local JSONL files --
no DB access, no API calls, $0, a few seconds.

Usage:
    cd backend && source venv/bin/activate
    python -m scripts.finetune.human_pattern_analysis
"""

import json
import re
import statistics
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
DATA_DIR = HERE / "data"
OUT_PATH = HERE / "human_pattern_analysis_results.json"

FILES = [DATA_DIR / "train_clean.jsonl", DATA_DIR / "eval_clean.jsonl"]

_SENT_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_WORD_RE = re.compile(r"[A-Za-z']+")

CONTRACTION_RE = re.compile(
    r"\b\w+n't\b|\b\w+'re\b|\b\w+'ve\b|\b\w+'ll\b|\bit's\b|\bthat's\b|\bwhat's\b|"
    r"\bhe's\b|\bshe's\b|\bthere's\b|\bhere's\b|\blet's\b|\bwho's\b|\bI'm\b|\bI'd\b",
    re.IGNORECASE,
)

# Rough passive-voice heuristic: a form of "be" immediately followed by a past
# participle (word ending -ed, or a common irregular). Not a real parser, but applied
# identically to both sides of the pair so the RELATIVE gap is what matters, same
# principle as pipeline.py's own local heuristic scorer.
PASSIVE_RE = re.compile(
    r"\b(is|are|was|were|be|been|being)\s+(\w+ed|made|done|known|given|taken|written|"
    r"seen|found|held|kept|shown|brought|built|sent|left|put|used|required|allowed)\b",
    re.IGNORECASE,
)

TRANSITION_WORDS = [
    "moreover", "furthermore", "additionally", "however", "therefore", "consequently",
    "then", "after that", "firstly", "secondly", "next", "finally", "also", "in addition",
    "meanwhile", "thus", "typically", "generally", "for example", "for instance",
]

PRONOUN_YOU_RE = re.compile(r"\byou\b|\byour\b", re.IGNORECASE)
PRONOUN_ONE_RE = re.compile(r"\bone\b|\bone's\b", re.IGNORECASE)
EM_DASH_RE = re.compile(r"[—–]|--")


def sentence_lengths(text: str) -> list[int]:
    sentences = _SENT_SPLIT_RE.split(text.strip())
    return [len(_WORD_RE.findall(s)) for s in sentences if s.strip()]


def word_count(text: str) -> int:
    return len(_WORD_RE.findall(text))


def sentence_starters(text: str, n: int = 2) -> list[str]:
    sentences = _SENT_SPLIT_RE.split(text.strip())
    starters = []
    for s in sentences:
        words = s.strip().split()
        if words:
            starters.append(" ".join(words[:n]).lower().strip(".,!?"))
    return starters


def analyze_side(texts: list[str]) -> dict:
    all_lengths: list[int] = []
    total_words = 0
    contraction_hits = 0
    passive_hits = 0
    total_sentences = 0
    transition_hits = Counter()
    you_hits = 0
    one_hits = 0
    em_dash_hits = 0
    starter_counter = Counter()
    short_sentence_count = 0  # <= 10 words
    long_sentence_count = 0  # >= 25 words

    for text in texts:
        lengths = sentence_lengths(text)
        all_lengths.extend(lengths)
        total_sentences += len(lengths)
        short_sentence_count += sum(1 for l in lengths if l <= 10)
        long_sentence_count += sum(1 for l in lengths if l >= 25)

        total_words += word_count(text)
        contraction_hits += len(CONTRACTION_RE.findall(text))
        passive_hits += len(PASSIVE_RE.findall(text))
        you_hits += len(PRONOUN_YOU_RE.findall(text))
        one_hits += len(PRONOUN_ONE_RE.findall(text))
        em_dash_hits += len(EM_DASH_RE.findall(text))

        lower = text.lower()
        for phrase in TRANSITION_WORDS:
            transition_hits[phrase] += lower.count(phrase)

        for starter in sentence_starters(text):
            starter_counter[starter] += 1

    # Per-document burstiness: stdev of sentence lengths WITHIN each document, then
    # averaged -- this is what actually matters (a corpus average across documents
    # would blur every document's internal rhythm into one flat number).
    per_doc_stdevs = []
    for text in texts:
        lengths = sentence_lengths(text)
        if len(lengths) >= 2:
            per_doc_stdevs.append(statistics.pstdev(lengths))

    n_docs = len(texts)
    top_starters = starter_counter.most_common(15)
    starter_concentration = (
        sum(c for _, c in top_starters[:5]) / total_sentences if total_sentences else 0
    )

    return {
        "n_documents": n_docs,
        "total_sentences": total_sentences,
        "total_words": total_words,
        "sentence_length": {
            "mean": statistics.mean(all_lengths) if all_lengths else 0,
            "median": statistics.median(all_lengths) if all_lengths else 0,
            "stdev_corpus_wide": statistics.pstdev(all_lengths) if len(all_lengths) >= 2 else 0,
            "mean_per_doc_stdev_burstiness": (
                statistics.mean(per_doc_stdevs) if per_doc_stdevs else 0
            ),
            "pct_short_le10w": 100 * short_sentence_count / total_sentences if total_sentences else 0,
            "pct_long_ge25w": 100 * long_sentence_count / total_sentences if total_sentences else 0,
            "min": min(all_lengths) if all_lengths else 0,
            "max": max(all_lengths) if all_lengths else 0,
        },
        "contractions_per_1000_words": 1000 * contraction_hits / total_words if total_words else 0,
        "passive_constructions_per_1000_words": (
            1000 * passive_hits / total_words if total_words else 0
        ),
        "pronoun_you_per_1000_words": 1000 * you_hits / total_words if total_words else 0,
        "pronoun_one_per_1000_words": 1000 * one_hits / total_words if total_words else 0,
        "em_dash_per_1000_words": 1000 * em_dash_hits / total_words if total_words else 0,
        "transition_words_per_1000_words": {
            phrase: round(1000 * count / total_words, 3) if total_words else 0
            for phrase, count in transition_hits.most_common()
            if count > 0
        },
        "top_sentence_starters": top_starters,
        "starter_concentration_top5_pct": 100 * starter_concentration,
    }


def load_pairs() -> tuple[list[str], list[str]]:
    human_texts: list[str] = []
    ai_texts: list[str] = []
    for path in FILES:
        if not path.exists():
            continue
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                messages = row.get("messages", [])
                user_msg = next((m["content"] for m in messages if m["role"] == "user"), None)
                assistant_msg = next(
                    (m["content"] for m in messages if m["role"] == "assistant"), None
                )
                if user_msg:
                    ai_texts.append(user_msg)
                if assistant_msg:
                    human_texts.append(assistant_msg)
    return human_texts, ai_texts


def main():
    human_texts, ai_texts = load_pairs()
    print(f"Loaded {len(human_texts)} human (assistant) docs, {len(ai_texts)} AI (user) docs")

    human_stats = analyze_side(human_texts)
    ai_stats = analyze_side(ai_texts)

    result = {"human_target": human_stats, "ai_source": ai_stats}
    OUT_PATH.write_text(json.dumps(result, indent=2))

    def fmt(d, path):
        v = d
        for p in path:
            v = v[p]
        return v

    print("\n=== SENTENCE LENGTH ===")
    for key in ["mean", "median", "stdev_corpus_wide", "mean_per_doc_stdev_burstiness",
                "pct_short_le10w", "pct_long_ge25w", "min", "max"]:
        print(f"  {key:32s} human={fmt(human_stats,['sentence_length',key]):.2f}   "
              f"ai={fmt(ai_stats,['sentence_length',key]):.2f}")

    print("\n=== RATES (per 1000 words) ===")
    for key in ["contractions_per_1000_words", "passive_constructions_per_1000_words",
                "pronoun_you_per_1000_words", "pronoun_one_per_1000_words",
                "em_dash_per_1000_words"]:
        print(f"  {key:38s} human={human_stats[key]:.3f}   ai={ai_stats[key]:.3f}")

    print("\n=== TOP TRANSITION WORDS (human, per 1000 words) ===")
    for phrase, rate in list(human_stats["transition_words_per_1000_words"].items())[:10]:
        ai_rate = ai_stats["transition_words_per_1000_words"].get(phrase, 0)
        print(f"  {phrase:20s} human={rate:.3f}   ai={ai_rate:.3f}")

    print("\n=== TOP SENTENCE STARTERS (human) ===")
    for starter, count in human_stats["top_sentence_starters"][:10]:
        print(f"  {count:6d}  {starter}")
    print(f"\n  starter concentration (top-5 starters / all sentences): "
          f"human={human_stats['starter_concentration_top5_pct']:.2f}%   "
          f"ai={ai_stats['starter_concentration_top5_pct']:.2f}%")

    print(f"\nFull results written to {OUT_PATH}")


if __name__ == "__main__":
    main()
