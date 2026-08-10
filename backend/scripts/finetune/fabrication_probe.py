"""One-off, 2026-08-09: probe for the fact-fabrication pattern found in local_qa.py's
essay_paragraph output (invented dates/statistics not present in the source, alongside
a large ~12x length expansion). Runs 3 short, fact-dense inputs (specific numbers, dates,
names) through humaniser-lora using the exact same prompt construction as local_qa.py
(BASE_PROMPT + STYLE_GUIDANCE["normal"]), so any invented facts are easy to spot by eye
and we can check whether fabrication correlates with output length / how much the model
elaborates beyond the source.

Not a permanent script -- one-time investigation, safe to delete after use.

Usage:
    cd backend && source venv/bin/activate
    python -m scripts.finetune.fabrication_probe
"""

import json
import logging
from pathlib import Path

import httpx

from app.services.humanizer.prompts import BASE_PROMPT, STYLE_GUIDANCE

logger = logging.getLogger(__name__)

HERE = Path(__file__).parent
INPUTS_PATH = HERE / "gptzero_check" / "fabrication_probe_inputs.json"
OUT_PATH = HERE / "fabrication_probe_results.txt"
OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "humaniser-lora"


def call_ollama(system: str, user: str) -> str:
    resp = httpx.post(
        OLLAMA_URL,
        json={
            "model": MODEL_NAME,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
            "options": {"num_predict": 900},
        },
        timeout=300,
    )
    resp.raise_for_status()
    return resp.json()["message"]["content"].strip()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    inputs = json.loads(INPUTS_PATH.read_text())
    system = BASE_PROMPT + "\n\n" + STYLE_GUIDANCE["normal"]

    lines = []
    for name, raw_text in inputs.items():
        logger.info("Running %s through %s...", name, MODEL_NAME)
        output = call_ollama(system, raw_text)
        in_words = len(raw_text.split())
        out_words = len(output.split())
        lines.append(
            f"=== {name} ===\n"
            f"INPUT ({in_words} words):\n{raw_text}\n\n"
            f"OUTPUT ({out_words} words, {out_words / in_words:.1f}x source length):\n{output}\n"
        )
        logger.info("  %s: %d -> %d words (%.1fx)", name, in_words, out_words, out_words / in_words)

    OUT_PATH.write_text("\n".join(lines))
    print(f"\nWritten to {OUT_PATH} -- check by eye for invented dates/numbers/names not in the source.")


if __name__ == "__main__":
    main()
