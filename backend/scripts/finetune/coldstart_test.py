"""One-off, 2026-08-10: real cold-start latency measurement for hosting the LoRA
checkpoint on Modal. Deploys a minimal L4 GPU function that loads the merged
`run_1786334362` model on container start and runs one short generation, then
measures real wall-clock time from an outside client call (cold, no warm
container) to first response -- this is what a real user would experience on
the first request after the container has scaled to zero.

Not a production serving setup (plain transformers .generate(), not vLLM) --
the goal here is only to measure the dominant cold-start cost (loading ~15GB
of bf16 weights onto a GPU), which is largely serving-framework-independent.
Real production serving would use vLLM for actual request handling, but the
weight-loading cost measured here is a fair proxy either way.

Usage:
    cd backend && source venv/bin/activate
    modal deploy scripts/finetune/coldstart_test.py
    python -m scripts.finetune.coldstart_test --measure
"""

import argparse
import time

import modal

app = modal.App("humaniser-coldstart-test")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch==2.4.0", "transformers==4.46.3", "accelerate==0.34.2")
)
volume = modal.Volume.from_name("humaniser-lora-checkpoints", create_if_missing=False)

MODEL_PATH = "/checkpoints/run_1786334362/merged"


@app.cls(
    image=image,
    gpu="L4",
    volumes={"/checkpoints": volume},
    scaledown_window=10,  # release the GPU fast after use so idle time isn't billed --
    # short on purpose, this is exactly the setting real production would use to avoid
    # the "pay for 24hrs on 1 request/hr" scenario.
    enable_memory_snapshot=True,
    experimental_options={"enable_gpu_snapshot": True},
)
class ColdStartModel:
    @modal.enter(snap=True)
    def load(self):
        # Everything in here runs once per container start -- this IS the cold start.
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        self.load_start = time.time()
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
        self.model = AutoModelForCausalLM.from_pretrained(
            MODEL_PATH, torch_dtype=torch.bfloat16, device_map={"": 0}
        )
        self.load_seconds = time.time() - self.load_start

    @modal.method()
    def generate(self, prompt: str) -> dict:
        import torch

        gen_start = time.time()
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)
        with torch.no_grad():
            out = self.model.generate(**inputs, max_new_tokens=30, do_sample=False)
        text = self.tokenizer.decode(out[0], skip_special_tokens=True)
        gen_seconds = time.time() - gen_start
        return {"text": text, "model_load_seconds": self.load_seconds, "generate_seconds": gen_seconds}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--measure", action="store_true")
    args = parser.parse_args()
    if not args.measure:
        print("Pass --measure to run the real cold-start test (after `modal deploy` has run).")
        return

    cls = modal.Cls.from_name("humaniser-coldstart-test", "ColdStartModel")
    instance = cls()

    print("Calling .generate() now -- this should be a cold start (fresh deploy, no warm container)...")
    client_start = time.time()
    result = instance.generate.remote("Rewrite this to sound more human: The weather today is nice.")
    client_seconds = time.time() - client_start

    print("\n" + "=" * 60)
    print("REAL COLD-START MEASUREMENT")
    print("=" * 60)
    print(f"Total client-observed latency (container spin-up + model load + generate): {client_seconds:.1f}s")
    print(f"  Of which, model load time (server-reported):  {result['model_load_seconds']:.1f}s")
    print(f"  Of which, generation time (server-reported):  {result['generate_seconds']:.1f}s")
    print(f"  Container spin-up overhead (client - server):  {client_seconds - result['model_load_seconds'] - result['generate_seconds']:.1f}s")
    print(f"\nSample output: {result['text'][:150]}")


if __name__ == "__main__":
    main()
