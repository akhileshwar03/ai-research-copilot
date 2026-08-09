"""Step 7 — detector-proxy eval (Phase 2, Humaniser LoRA fine-tune).

Quantitative signal alongside the manual GPTZero check from Step 6. Computes
perplexity and burstiness (both standard AI-detection-literature proxies --
NOT GPTZero itself, which is a black box) for the same 5 benchmark inputs
across three variants:

  1. raw_ai          -- the untouched AI-generated source text
  2. phase1_pipeline  -- today's production prompt-based Pass-2 rewrite
                         (app.services.humanizer.pipeline.run, the same code
                         path /api/v1/humanize actually calls)
  3. lora_model       -- this phase's fine-tuned model's output (reads the
                         files Step 6's local_qa.py already wrote to
                         gptzero_check/, so this is exactly what's going to
                         GPTZero, not a fresh re-generation with different
                         sampling)

Reference LM for the perplexity/burstiness proxy is GPT-2 (small, CPU-only,
standard choice in AI-detection literature -- NOT the model being evaluated,
so this isn't circular). Lower perplexity + lower burstiness (more uniform
per-sentence surprisal) is the classic "reads more AI-like" signature;
higher/more variable is more human-like.

Usage:
    cd backend && source venv/bin/activate
    python -m scripts.finetune.eval_detector
"""

import asyncio
import json
import logging
import re
from pathlib import Path

import torch
from transformers import GPT2LMHeadModel, GPT2TokenizerFast

from app.services.ai_service import AIService
from app.services.humanizer import pipeline

logger = logging.getLogger(__name__)

HERE = Path(__file__).parent
INPUTS_PATH = HERE / "gptzero_check" / "00_raw_ai_inputs.json"
GPTZERO_DIR = HERE / "gptzero_check"
OUT_PATH = HERE / "eval_detector_results.json"

# Same style assignment as local_qa.py, kept in sync deliberately -- this is a
# fair 3-way comparison only if all variants get the same style treatment.
INPUT_STYLES = {
    "blog_intro": "normal",
    "business_email": "simple_formal",
    "product_description": "normal",
    "essay_paragraph": "clear_structured",
    "report_summary": "clear_structured",
}

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


def load_lora_output(name: str, style: str) -> str:
    path = GPTZERO_DIR / f"{name}__{style}.txt"
    text = path.read_text()
    marker = "=== OUTPUT"
    idx = text.index(marker)
    idx = text.index("===\n", idx) + len("===\n")
    return text[idx:].strip()


async def run_phase1_pipeline(ai_service: AIService, text: str, style: str) -> str:
    output = ""
    async for event in pipeline.run(ai_service, text, style=style):
        if event["type"] == "token":
            output += event["text"]
        elif event["type"] == "revised":
            output = event["text"]  # Pass 3 patch replaces the full text
    return output.strip()


class PerplexityScorer:
    def __init__(self):
        logger.info("Loading GPT-2 (reference LM for perplexity/burstiness)...")
        self.tokenizer = GPT2TokenizerFast.from_pretrained("gpt2")
        self.model = GPT2LMHeadModel.from_pretrained("gpt2")
        self.model.eval()

    def sentence_perplexities(self, text: str) -> list[float]:
        sentences = [s.strip() for s in _SENTENCE_SPLIT.split(text) if s.strip()]
        perplexities = []
        for sent in sentences:
            ids = self.tokenizer(sent, return_tensors="pt")["input_ids"]
            if ids.shape[1] < 2:
                continue
            with torch.no_grad():
                out = self.model(ids, labels=ids)
            perplexities.append(torch.exp(out.loss).item())
        return perplexities

    def score(self, text: str) -> dict:
        ppls = self.sentence_perplexities(text)
        if not ppls:
            return {"perplexity": None, "burstiness": None, "num_sentences": 0}
        mean_ppl = sum(ppls) / len(ppls)
        variance = sum((p - mean_ppl) ** 2 for p in ppls) / len(ppls)
        burstiness = variance**0.5  # std dev of per-sentence perplexity
        return {"perplexity": round(mean_ppl, 2), "burstiness": round(burstiness, 2), "num_sentences": len(ppls)}


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if not INPUTS_PATH.exists():
        logger.error("No benchmark inputs found at %s -- run local_qa.py's input generation first.", INPUTS_PATH)
        return

    inputs = json.loads(INPUTS_PATH.read_text())
    ai_service = AIService()
    scorer = PerplexityScorer()

    results = {}
    for name, raw_text in inputs.items():
        style = INPUT_STYLES.get(name, "normal")
        logger.info("Evaluating %s (style=%s)...", name, style)

        logger.info("  running Phase-1 pipeline...")
        phase1_output = await run_phase1_pipeline(ai_service, raw_text, style)

        lora_output = load_lora_output(name, style)

        variants = {"raw_ai": raw_text, "phase1_pipeline": phase1_output, "lora_model": lora_output}
        scores = {variant: scorer.score(text) for variant, text in variants.items()}
        results[name] = {"style": style, "texts": variants, "scores": scores}

    OUT_PATH.write_text(json.dumps(results, indent=2))

    print("\n" + "=" * 78)
    print("STEP 7 -- DETECTOR-PROXY EVAL (perplexity / burstiness, GPT-2 reference)")
    print("=" * 78)
    print(f"{'input':<20} {'variant':<16} {'perplexity':>10} {'burstiness':>10} {'#sent':>6}")
    for name, data in results.items():
        for variant in ("raw_ai", "phase1_pipeline", "lora_model"):
            s = data["scores"][variant]
            ppl = f"{s['perplexity']:.1f}" if s["perplexity"] is not None else "n/a"
            burst = f"{s['burstiness']:.1f}" if s["burstiness"] is not None else "n/a"
            print(f"{name:<20} {variant:<16} {ppl:>10} {burst:>10} {s['num_sentences']:>6}")
        print()

    print(f"Full results (including all text) written to {OUT_PATH}")
    print(
        "\nInterpretation note: lower perplexity + lower burstiness is the classic "
        "'reads more AI-like' signature in detector literature; higher/more variable "
        "is more human-like. This is a proxy, not GPTZero itself -- read alongside "
        "the manual GPTZero results from Step 6, not as a replacement for them."
    )


if __name__ == "__main__":
    asyncio.run(main())
