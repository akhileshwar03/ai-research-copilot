"""Step 6 — local Ollama QA of the fine-tuned Humaniser LoRA (Phase 2).

Runs 5 diverse, genuinely-AI-generated benchmark inputs (blog intro, business
email, product description, essay paragraph, report summary -- deliberately
NOT legislative summaries, which are the easiest case and over-represented in
training) through the local `humaniser-lora` Ollama model, and writes each
output to gptzero_check/ for manual pasting into GPTZero.

Prereqs:
    # NOTE (2026-08-09): train_modal.py's checkpoint path is now scoped per-run
    # (`/checkpoints/<run_id>/...`, run_id like "run_1754..."), not a fixed "/run/"
    # path -- that fixed path is exactly what caused an earlier launch to silently
    # resume from a stale, unrelated 2026-08-04 checkpoint. Get the real run_id for
    # the run you want from `.modal_run_id.json` (written at launch) or
    # `modal volume ls humaniser-lora-checkpoints` (list top-level dirs, pick the
    # one matching your run's timestamp), then:
    modal volume get humaniser-lora-checkpoints /<run_id>/humaniser-lora.q8_0.gguf \
        scripts/finetune/ollama_model/humaniser-lora.q8_0.gguf
    cd scripts/finetune/ollama_model && ollama create humaniser-lora -f Modelfile

Usage:
    cd backend && source venv/bin/activate
    python -m scripts.finetune.local_qa
"""

import json
import logging
from pathlib import Path

import httpx

from app.services.humanizer.prompts import BASE_PROMPT, STYLE_GUIDANCE

logger = logging.getLogger(__name__)

HERE = Path(__file__).parent
INPUTS_PATH = HERE / "gptzero_check" / "00_raw_ai_inputs.json"
OUT_DIR = HERE / "gptzero_check"
OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "humaniser-lora"

# Style assigned per input type -- matched to what each register is meant for
# (STYLE_GUIDANCE's own descriptions), not just defaulted to "normal" across
# the board, so this is a fair test of all 3 trained registers.
INPUT_STYLES = {
    "blog_intro": "normal",
    "business_email": "simple_formal",
    "product_description": "normal",
    "essay_paragraph": "clear_structured",
    "report_summary": "clear_structured",
}


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
            # Confirmed the hard way: without an explicit num_predict, several
            # outputs came back truncated mid-sentence/mid-word (Ollama's
            # implicit default cap, not a natural stop). 900 gives real headroom
            # for a ~150-word input's rewrite (which may run longer than source).
            "options": {"num_predict": 900},
        },
        timeout=300,
    )
    resp.raise_for_status()
    return resp.json()["message"]["content"].strip()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if not INPUTS_PATH.exists():
        logger.error("No benchmark inputs found at %s -- generate them first.", INPUTS_PATH)
        return

    inputs = json.loads(INPUTS_PATH.read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for name, raw_text in inputs.items():
        style = INPUT_STYLES.get(name, "normal")
        system = BASE_PROMPT + "\n\n" + STYLE_GUIDANCE[style]
        logger.info("Running %s (style=%s) through %s...", name, style, MODEL_NAME)
        output = call_ollama(system, raw_text)

        out_path = OUT_DIR / f"{name}__{style}.txt"
        out_path.write_text(
            f"=== INPUT (raw AI-generated, {name}) ===\n{raw_text}\n\n"
            f"=== OUTPUT (humaniser-lora, style={style}) ===\n{output}\n"
        )
        logger.info("Wrote %s", out_path)

    print(f"\nAll 5 outputs written to {OUT_DIR}/ -- paste the OUTPUT sections into GPTZero.")


if __name__ == "__main__":
    main()
