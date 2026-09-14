"""Same measurement as human_pattern_analysis.py, run against a genuinely pre-2015 corpus
instead of our own fine-tune corpus's `assistant` field (Round 33/34, STATE.md).

Why this exists: Round 33 measured "human writing" from our own train_clean.jsonl /
eval_clean.jsonl `assistant` field. That field is real human-written text, but it was
collected and cleaned by our own pipeline, and the user raised a fair question: what if it
isn't representative, or has some contamination we haven't caught? Pre-2015 text is an
independent, unimpeachable check -- 2015 is years before GPT-3 (2020) or ChatGPT (2022)
existed, so nothing dated before it can be LLM-written, full stop, no ambiguity.

Corpus: 24 English Wikipedia articles, each pinned to its exact revision as it existed in
May 2013 (via the MediaWiki API's rvstart parameter, timestamp confirmed per-article) --
encyclopedic/explainer register, matching our "google_explainer" test case. Plus 2 pre-1930
Gutenberg essay collections (Twain, Chesterton) for casual first-person/opinion register,
and one 1896 cookbook for procedural-instruction register matching our "openai_howto" test
case. Small (27 docs, ~15K words) compared to the 9,266-pair fine-tune corpus, but genuinely
unimpeachable rather than large.

Usage:
    cd backend && source venv/bin/activate
    python -m scripts.finetune.pre2015_pattern_analysis
"""

import json
from pathlib import Path

from scripts.finetune.human_pattern_analysis import analyze_side

HERE = Path(__file__).parent
CORPUS_DIR = HERE / "pre2015_corpus"
OUT_PATH = HERE / "pre2015_pattern_analysis_results.json"


def main():
    texts = []
    for path in sorted(CORPUS_DIR.glob("*.txt")):
        texts.append(path.read_text(encoding="utf-8"))
    print(f"Loaded {len(texts)} pre-2015 documents")

    stats = analyze_side(texts)
    OUT_PATH.write_text(json.dumps(stats, indent=2))

    sl = stats["sentence_length"]
    print("\n=== SENTENCE LENGTH (pre-2015 corpus) ===")
    for k in ["mean", "median", "stdev_corpus_wide", "mean_per_doc_stdev_burstiness",
              "pct_short_le10w", "pct_long_ge25w", "min", "max"]:
        print(f"  {k:32s} {sl[k]:.2f}")

    print("\n=== RATES (per 1000 words) ===")
    for k in ["contractions_per_1000_words", "passive_constructions_per_1000_words",
              "pronoun_you_per_1000_words", "pronoun_one_per_1000_words",
              "em_dash_per_1000_words"]:
        print(f"  {k:38s} {stats[k]:.3f}")

    print("\n=== TRANSITION WORDS (per 1000 words) ===")
    for phrase, rate in stats["transition_words_per_1000_words"].items():
        print(f"  {phrase:20s} {rate:.3f}")

    print("\n=== TOP SENTENCE STARTERS ===")
    for starter, count in stats["top_sentence_starters"][:10]:
        print(f"  {count:6d}  {starter}")

    print(f"\nFull results written to {OUT_PATH}")


if __name__ == "__main__":
    main()
