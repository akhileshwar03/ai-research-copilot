"""Step "corpus clean" — Phase 2 Humaniser LoRA retrain prep.

Read-only against the DB: never mutates `finetune_samples`. Reads every row this
project's `export.py` would export (`status in (ai_ready, exported)`,
`ai_text is not null`), cleans scraped-web contamination out of `human_text`
(the text the model is trained to *produce*) and `ai_text`, applies a
length-ratio filter, and writes a parallel clean corpus
(`data/train_clean.jsonl` / `data/eval_clean.jsonl`) using the exact same
chat-example format and system prompt construction as `export.py` — so
`train_modal.py` can point at these files with zero changes.

Why this exists (see the "ultra humaniser" session, 2026-08-14, and
CLAUDE.md's Humanizer Phase 2 section): the shipped LoRA's known live defects
— literal HTML tags in output, "See Wikipedia: X" / scraped image-credit
lines, dropped spaces after periods — all trace to one root cause, confirmed
here by direct inspection of `human_text` (not guessed):

    4,508 / 12,785 rows (35%) contain an HTML tag in human_text
    1,158 / 12,785 rows (9%)  contain a bare URL in human_text
      280 / 12,785 rows (2%)  contain an HTML tag in ai_text
      759 / 12,785 rows (6%)  contain a bare URL in ai_text

Both source datasets are raw scraped web content (`nixiesearch/hackernews-
comments` uses inline HTML as its own comment markup; `Skylion007/openwebtext`
is raw scraped articles full of nav/ad/share-button furniture) — the model
isn't misbehaving, it was shown this literally as "how humans write."

Cleaning strategy, informed by direct inspection of real contaminated rows
(not assumed):
  - `<p>` -> paragraph break (it's used as an inline separator with no closing
    tag in HN comments, confirmed by inspection) — deleting it outright would
    silently merge separate paragraphs into one run-on.
  - `<a href="...">text</a>` -> keep the anchor's inner text only.
  - Every other HTML tag (`<i>`, `<b>`, `<em>`, `<div>`, `<span>`, ...) ->
    stripped, inner text kept.
  - Bare URLs -> removed (not meaningful prose content for a "write like a
    human" corpus).
  - HTML entities -> unescaped.
  - Boilerplate LINES (matched whole-line, case-insensitive, not as a
    substring) -> dropped entirely. Whole-line matching is deliberate: a
    phrase like "originally published" also occurs legitimately embedded
    inside real sentences (e.g. "It was originally published in hardcover
    fifteen years ago") — only stripping it when it stands alone as its own
    line/paragraph (which is how every real boilerplate instance found during
    inspection actually appears) avoids damaging genuine prose.

Length-ratio filter: after cleaning, rows whose human_text/ai_text word-count
ratio falls outside [0.80, 1.30] are dropped. This is *not* about contam-
ination — it directly targets the runaway-expansion/fabrication defect
(STATE.md Round 22, CLAUDE.md's "fabrication is worse than... implies")
by removing training examples that taught the model "elaborate 2-4x beyond
the source" as a normal rewrite.

Usage:
    cd backend && source venv/bin/activate
    python -m scripts.finetune.clean_corpus            # dry run: report only
    python -m scripts.finetune.clean_corpus --write     # also write the files
"""

import argparse
import html
import json
import logging
import random
import re
from collections import Counter
from pathlib import Path

from app.db.models.finetune_sample import FinetuneSample
from app.db.session import SessionLocal
from app.services.humanizer.examples import format_examples
from app.services.humanizer.prompts import BASE_PROMPT, STRICT_HARD_RULES, STYLE_GUIDANCE

logger = logging.getLogger(__name__)

OUT_DIR = Path(__file__).parent / "data"
TRAIN_PATH = OUT_DIR / "train_clean.jsonl"
EVAL_PATH = OUT_DIR / "eval_clean.jsonl"
MANIFEST_PATH = OUT_DIR / "clean_corpus_manifest.json"
SAMPLE_PATH = OUT_DIR / "clean_corpus_before_after_sample.json"

EVAL_FRACTION = 0.05
SEED = 42
MIN_RATIO = 0.80
MAX_RATIO = 1.30

# ── HTML handling ────────────────────────────────────────────────────────────

_PARA_TAG = re.compile(r"</?p\s*/?>", re.IGNORECASE)
_BR_TAG = re.compile(r"<br\s*/?>", re.IGNORECASE)
_ANCHOR_TAG = re.compile(r'<a\b[^>]*>(.*?)</a>', re.IGNORECASE | re.DOTALL)
_ANY_TAG = re.compile(r"<[a-zA-Z/][^>]{0,300}>")
# No leading \b before "http": a URL glued directly onto the previous word with
# no space (confirmed real, e.g. embedded tweet text "indeedhttp://t.co/...")
# has no word boundary there since both sides are \w characters — \b would
# silently fail to match exactly the concatenated-URL case that most needs it.
_URL = re.compile(r"https?://\S+")
_WWW_URL = re.compile(r"\bwww\.\S+\.\S+")

# ── Boilerplate: matched as a WHOLE LINE (after strip()), case-insensitive.
# Deliberately whole-line, not substring — see module docstring for why.
_BOILERPLATE_LINE_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"read more (at|on|about)\b.*",
        r"originally published\b.*",
        r"click here\b.*",
        r"advertisements?\b.*",
        r"story continues below advertisement",
        r"continue reading( below)?\b.*",
        r"↓?\s*continue reading below\s*advertisement",
        r"\(visited \d+ times?,? \d+ visits? today\)",
        r"if you'?re new here.*subscribe.*",
        r"pin \d+.*shares?",
        r"\d+k?\+?\s*shares?",
        r"\[[a-z][a-z0-9\-]{2,30}\]",  # template slugs, e.g. [inject-module]
        r"subscribe to (my|our|the)\b.*",
    ]
]


def clean_text(text: str) -> str:
    """Strip scraped-web contamination from one field. See module docstring
    for the reasoning behind each step; order matters (paragraph breaks must
    be handled before the generic tag-strip erases the distinction)."""
    text = _PARA_TAG.sub("\n\n", text)
    text = _BR_TAG.sub("\n", text)
    text = _ANCHOR_TAG.sub(r"\1", text)  # keep the link's visible text only
    text = _ANY_TAG.sub("", text)
    text = html.unescape(text)
    text = _URL.sub("", text)
    text = _WWW_URL.sub("", text)

    lines = text.split("\n")
    kept = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            kept.append(line)
            continue
        if any(pat.fullmatch(stripped) for pat in _BOILERPLATE_LINE_PATTERNS):
            continue
        kept.append(line)
    text = "\n".join(kept)

    # Collapse whitespace left behind by removed URLs/tags (but preserve
    # intentional paragraph breaks, i.e. don't collapse \n\n to \n).
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def word_count(text: str) -> int:
    stripped = text.strip()
    return len(stripped.split()) if stripped else 0


def build_example(row: FinetuneSample, human_text: str, ai_text: str) -> dict:
    # Mirrors export.py's build_example() exactly — same system prompt
    # construction, so a run trained on this file sees the identical
    # instruction production sends at inference time.
    parts = [BASE_PROMPT, STRICT_HARD_RULES, STYLE_GUIDANCE[row.style], format_examples(row.style)]
    system = "\n\n".join(p for p in parts if p)
    return {
        "id": row.id,
        "style": row.style,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": ai_text},
            {"role": "assistant", "content": human_text},
        ],
    }


def stratified_split(rows: list, eval_fraction: float, seed: int) -> tuple[list, list]:
    # Same logic as export.py's stratified_split, operating on (row, human, ai) tuples.
    rng = random.Random(seed)
    train, evalset = [], []
    by_style: dict[str, list] = {}
    for item in rows:
        by_style.setdefault(item[0].style, []).append(item)

    for style, style_rows in by_style.items():
        style_rows = style_rows[:]
        rng.shuffle(style_rows)
        n_eval = max(1, round(len(style_rows) * eval_fraction))
        evalset.extend(style_rows[:n_eval])
        train.extend(style_rows[n_eval:])
    return train, evalset


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="Write train_clean.jsonl/eval_clean.jsonl. Default is a dry-run report only.")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    db = SessionLocal()

    rows = (
        db.query(FinetuneSample)
        .filter(FinetuneSample.status.in_(["ai_ready", "exported"]), FinetuneSample.ai_text.isnot(None))
        .all()
    )
    logger.info("%d rows read (read-only — no DB writes).", len(rows))

    reasons = Counter()
    kept: list[tuple[FinetuneSample, str, str]] = []
    before_after_samples = []
    ratio_before, ratio_after = [], []

    for row in rows:
        raw_human, raw_ai = row.human_text, row.ai_text or ""
        had_html = bool(_ANY_TAG.search(raw_human))
        had_url = bool(_URL.search(raw_human) or _WWW_URL.search(raw_human))

        clean_human = clean_text(raw_human)
        clean_ai = clean_text(raw_ai)

        if not clean_human.strip() or not clean_ai.strip():
            reasons["unsalvageable_empty"] += 1
            continue

        wc_human_before, wc_ai_before = word_count(raw_human), word_count(raw_ai)
        wc_human_after, wc_ai_after = word_count(clean_human), word_count(clean_ai)
        if wc_ai_before:
            ratio_before.append(wc_human_before / wc_ai_before)
        if wc_ai_after == 0:
            reasons["unsalvageable_empty"] += 1
            continue
        ratio = wc_human_after / wc_ai_after
        ratio_after.append(ratio)

        if ratio < MIN_RATIO or ratio > MAX_RATIO:
            reasons["length_ratio_out_of_range"] += 1
            continue

        if had_html:
            reasons["kept_had_html"] += 1
        if had_url:
            reasons["kept_had_url"] += 1
        reasons["kept"] += 1
        kept.append((row, clean_human, clean_ai))

        if (had_html or had_url) and len(before_after_samples) < 12:
            before_after_samples.append({
                "id": row.id,
                "source": row.source,
                "before": raw_human[:500],
                "after": clean_human[:500],
            })

    train, evalset = stratified_split(kept, EVAL_FRACTION, SEED)

    def style_counts(items):
        c: Counter = Counter()
        for row, _, _ in items:
            c[row.style] += 1
        return dict(c)

    def source_counts(items):
        c: Counter = Counter()
        for row, _, _ in items:
            c[row.source] += 1
        return dict(c)

    manifest = {
        "total_rows_read": len(rows),
        "kept": len(kept),
        "kept_pct": round(100 * len(kept) / len(rows), 1) if rows else 0,
        "reasons_dropped": {k: v for k, v in reasons.items() if k not in ("kept", "kept_had_html", "kept_had_url")},
        "kept_rows_that_had_html_before_cleaning": reasons["kept_had_html"],
        "kept_rows_that_had_url_before_cleaning": reasons["kept_had_url"],
        "train_count": len(train),
        "eval_count": len(evalset),
        "train_style_counts": style_counts(train),
        "eval_style_counts": style_counts(evalset),
        "train_source_counts": source_counts(train),
        "eval_source_counts": source_counts(evalset),
        "length_ratio_min": MIN_RATIO,
        "length_ratio_max": MAX_RATIO,
        "median_ratio_before_cleaning": sorted(ratio_before)[len(ratio_before) // 2] if ratio_before else None,
        "median_ratio_after_cleaning_and_filter": sorted([r for r in ratio_after if MIN_RATIO <= r <= MAX_RATIO])[
            len([r for r in ratio_after if MIN_RATIO <= r <= MAX_RATIO]) // 2
        ] if any(MIN_RATIO <= r <= MAX_RATIO for r in ratio_after) else None,
    }

    print("\n" + "=" * 60)
    print("CORPUS CLEAN SUMMARY" + ("" if args.write else " (DRY RUN — pass --write to save files)"))
    print("=" * 60)
    print(json.dumps(manifest, indent=2))

    if args.write:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        with TRAIN_PATH.open("w") as f:
            for row, human, ai in train:
                f.write(json.dumps(build_example(row, human, ai)) + "\n")
        with EVAL_PATH.open("w") as f:
            for row, human, ai in evalset:
                f.write(json.dumps(build_example(row, human, ai)) + "\n")
        MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))
        SAMPLE_PATH.write_text(json.dumps(before_after_samples, indent=2))
        print(f"\nWrote {TRAIN_PATH}, {EVAL_PATH}, {MANIFEST_PATH}, {SAMPLE_PATH}")
    else:
        print(f"\n{len(before_after_samples)} before/after samples available — pass --write to save all outputs.")

    db.close()


if __name__ == "__main__":
    main()
