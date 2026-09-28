"""Runs every row in validation_set_v1.jsonl through the REAL production Checker API and
prints an honest results table — see README.md for the dataset's ground-truth design.

Standalone, no DB access. Needs PROD_BEARER_TOKEN (a fresh token from an authenticated
browser session — see README.md).
"""

import json
import os
import statistics
import sys
from pathlib import Path

import httpx

DATA_PATH = Path(__file__).resolve().parent / "validation_set_v1.jsonl"
RESULTS_PATH = Path(__file__).resolve().parent / "validation_results_v1.json"
PROD_API_BASE = "https://ai-research-copilot-xtmd.onrender.com/api/v1"

# Ground truth: what a "correct" call is for each label. ai_humanized_basic has no fixed
# correct verdict -- the whole point is measuring how far humanizing moves the needle, not
# grading it against a target, so it's reported but not scored right/wrong.
EXPECTED_VERDICT = {
    "human": "likely_human",
    "ai_original": "likely_ai",
}


def _check_text(token: str, text: str) -> dict:
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(
            f"{PROD_API_BASE}/checker/text",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"text": text, "advanced": False},
        )
        resp.raise_for_status()
        return resp.json()


def main():
    token = os.environ.get("PROD_BEARER_TOKEN")
    if not token:
        print("ERROR: set PROD_BEARER_TOKEN")
        sys.exit(1)

    if not DATA_PATH.exists():
        print(f"ERROR: {DATA_PATH} does not exist -- run build_validation_set.py first")
        sys.exit(1)

    rows = []
    with DATA_PATH.open(encoding="utf-8") as f:
        for line in f:
            rows.append(json.loads(line))

    results = []
    for row in rows:
        try:
            result = _check_text(token, row["text"])
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED: {row['topic']}/{row['label']}: {exc}")
            continue
        results.append(
            {
                "topic": row["topic"],
                "label": row["label"],
                "word_count": row["word_count"],
                "ai_probability": result["ai_probability"],
                "verdict": result["verdict"],
                "heuristic_score": result["signals"]["heuristic_score"],
                "llm_probability": result["signals"]["llm_probability"],
            }
        )
        print(
            f"[{row['label']:20s}] {row['topic']:28s} ai_probability={result['ai_probability']:.2f} "
            f"verdict={result['verdict']:14s} heuristic={result['signals']['heuristic_score']:.1f}"
        )

    with RESULTS_PATH.open("w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    # ── Summary ──────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("SUMMARY (real numbers, not estimated)")
    print("=" * 70)

    by_label: dict[str, list[dict]] = {}
    for r in results:
        by_label.setdefault(r["label"], []).append(r)

    for label, group in by_label.items():
        probs = [r["ai_probability"] for r in group]
        print(f"\n{label} (n={len(group)}):")
        print(f"  mean ai_probability   = {statistics.mean(probs):.3f}")
        print(f"  median ai_probability = {statistics.median(probs):.3f}")
        print(f"  min/max               = {min(probs):.3f} / {max(probs):.3f}")
        if label in EXPECTED_VERDICT:
            expected = EXPECTED_VERDICT[label]
            correct = sum(1 for r in group if r["verdict"] == expected)
            print(f"  correct verdict ({expected}): {correct}/{len(group)} = {correct / len(group):.0%}")
            wrong = [r["topic"] for r in group if r["verdict"] != expected]
            if wrong:
                print(f"  WRONG on: {wrong}")

    if "ai_original" in by_label and "ai_humanized_basic" in by_label:
        ai_by_topic = {r["topic"]: r["ai_probability"] for r in by_label["ai_original"]}
        hum_by_topic = {r["topic"]: r["ai_probability"] for r in by_label["ai_humanized_basic"]}
        print("\nHumanizer effect (ai_original -> ai_humanized_basic), per topic:")
        deltas = []
        for topic in ai_by_topic:
            if topic in hum_by_topic:
                delta = hum_by_topic[topic] - ai_by_topic[topic]
                deltas.append(delta)
                print(f"  {topic:28s} {ai_by_topic[topic]:.2f} -> {hum_by_topic[topic]:.2f}  (delta {delta:+.2f})")
        if deltas:
            print(f"  mean delta = {statistics.mean(deltas):+.3f} (negative = humanizer reduced AI score)")


if __name__ == "__main__":
    main()
