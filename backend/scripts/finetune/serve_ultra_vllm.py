"""Production Ultra Human serving on Modal: vLLM OpenAI-compatible endpoint for the
2-epoch 3B LoRA (run_1789757317/merged), chosen over the local Ollama/llama.cpp path
specifically for concurrent-user throughput -- real, researched numbers (2026-09-19):
at 50 concurrent requests, vLLM sustains ~920 tok/s on a comparable setup vs Ollama's
~155 tok/s (GuideLLM benchmark data), because vLLM's PagedAttention batches many
requests' KV caches into the same GPU memory instead of processing mostly one at a
time. Ollama stays the right choice for a single local user (this dev Mac); vLLM is
the right choice for "multiple users at once," which is the actual production goal.

Serves the already-merged HF-format model directly from the training Volume --
config.json/safetensors/tokenizer files confirmed present at
humaniser-lora-checkpoints/run_1789757317/merged/ (verified via `modal volume ls`
before writing this, not assumed) -- so no re-export or HuggingFace download step is
needed. GGUF (q8_0/q4_0) is deliberately NOT used here: that's a llama.cpp-specific
format for the local/Ollama path; vLLM loads the plain HF format directly, and the
whole q4-vs-q8 quality question tested locally doesn't carry over to this path at all.

GPU: L4 (24GB). The merged model is ~6GB in bf16 (3B params x 2 bytes), comfortably
under L4's memory with real headroom left for multi-request KV cache -- no need for
anything bigger for a 3B model. Real Modal per-second pricing (fetched from
modal.com/pricing 2026-09-18): L4 $0.000222/sec (~$0.80/hr), only billed while a
container is actually active (scale-to-zero, min_containers=0).

Uses Modal's `@app.server` class (not a hand-rolled asgi_app proxy) specifically
because it forwards raw TCP/HTTP to the vLLM subprocess's port directly -- a manual
FastAPI proxy in front would buffer the whole response before returning it, which
silently breaks OpenAI-style streaming (SSE) chat completions. `@app.server` avoids
that whole class of bug by not proxying at the application layer at all.

Auth: vLLM's own --api-key flag (not custom code) requires a bearer token on every
inference request, sourced from a Modal Secret -- so this endpoint isn't a fully open
public URL anyone could hit and run up the bill on, per the real security concern
flagged before building this.

Usage:
    cd backend && modal deploy scripts/finetune/serve_ultra_vllm.py
    (one-time) modal secret create humanizer-ultra-api-key API_KEY=<random-token>
"""

import subprocess
import time

import modal

MINUTES = 60
RUN_ID = "run_1789757317"  # the validated 2-epoch retrain, same run already serving locally
MODEL_PATH = f"/checkpoints/{RUN_ID}/merged"
SERVED_MODEL_NAME = "humaniser-lora-3b"
VLLM_PORT = 8000
VOLUME_NAME = "humaniser-lora-checkpoints"
MAX_CONCURRENT_SEQS = 32

vllm_image = (
    modal.Image.from_registry("vllm/vllm-openai:v0.15.1")
    .entrypoint([])
    .run_commands("ln -s $(which python3) /usr/bin/python")
)

checkpoints_vol = modal.Volume.from_name(VOLUME_NAME, create_if_missing=False)
vllm_cache_vol = modal.Volume.from_name("vllm-cache", create_if_missing=True)
api_key_secret = modal.Secret.from_name("humanizer-ultra-api-key")

app = modal.App("humaniser-ultra-serve")

with vllm_image.imports():
    import os

    import requests


def _wait_ready(process, timeout_seconds: float = 10 * MINUTES) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if process.poll() is not None:
            raise subprocess.CalledProcessError(process.returncode, process.args)
        try:
            requests.get(f"http://127.0.0.1:{VLLM_PORT}/health").raise_for_status()
            return
        except requests.exceptions.RequestException:
            time.sleep(5)
    raise TimeoutError(f"vLLM not ready within {timeout_seconds} seconds")


@app.server(
    image=vllm_image,
    gpu="L4",
    scaledown_window=5 * MINUTES,
    startup_timeout=10 * MINUTES,
    volumes={
        "/checkpoints": checkpoints_vol,
        "/root/.cache/vllm": vllm_cache_vol,
    },
    secrets=[api_key_secret],
    min_containers=0,
    port=VLLM_PORT,
    target_concurrency=MAX_CONCURRENT_SEQS,
    # 2026-09-19: verified directly against Modal's own docs (webhook-proxy-auth)
    # before deciding this, not assumed -- with unauthenticated=False, Modal's own
    # proxy-auth layer (`Authorization: Bearer wk-<id>.ws-<secret>`) rejects a
    # request at the edge, BEFORE it can trigger a cold start or count toward
    # autoscaler/billing accounting. With unauthenticated=True, every request --
    # valid vLLM --api-key or not -- still reaches the container and is billed;
    # vLLM's key only rejects AFTER that cost is already incurred. Keeping this
    # False is the real cost-control boundary, not just defense-in-depth; vLLM's
    # --api-key stays on top of it as a second, cheap check.
    unauthenticated=False,
)
class UltraVllmInference:
    @modal.enter()
    def startup(self) -> None:
        api_key = os.environ["API_KEY"]
        cmd = [
            "vllm", "serve", MODEL_PATH,
            "--served-model-name", SERVED_MODEL_NAME,
            "--host", "0.0.0.0",
            "--port", str(VLLM_PORT),
            "--dtype", "bfloat16",
            "--gpu-memory-utilization", "0.85",
            "--max-model-len", "8192",
            "--max-num-seqs", str(MAX_CONCURRENT_SEQS),
            "--api-key", api_key,
        ]
        self.process = subprocess.Popen(cmd)
        _wait_ready(self.process)

    @modal.exit()
    def shutdown(self) -> None:
        self.process.terminate()
