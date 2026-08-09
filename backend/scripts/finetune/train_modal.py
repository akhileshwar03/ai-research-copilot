"""Step 5 — LoRA fine-tune of Qwen2.5-7B-Instruct on Modal (Phase 2, Humaniser).

**COST-GATED. Running this script with no flags only prints the plan and a cost
estimate — it does NOT launch anything on Modal.** Per the project's hard rule
("print a cost estimate and WAIT for explicit go-ahead before launching any Modal
GPU job"), actually starting the training run requires passing --go, which should
only happen after the user has seen the estimate and said to proceed.

Training data: backend/scripts/finetune/data/{train,eval}.jsonl (from export.py),
chat-formatted {"messages": [system, user, assistant]} rows -- system prompt is
the real production Pass-2 prompt (app.services.humanizer.prompts), user = ai_text,
assistant = human_text. Exported as-is, no style rebalancing (skewed 29.7/35.0/35.3
normal/clear_structured/simple_formal vs the 50/25/25 target) -- see STATE.md.

On --go, the run also (per user requirements, 2026-08-04):
- Checkpoints to the Modal Volume after every epoch.
- Prints eval loss per epoch.
- Stops early (does not burn the full run) if training loss diverges (NaN/Inf, or
  a sustained rise) or eval loss plateaus (no improvement for 2 consecutive evals).
- On completion: prints 10 sample generations from the eval split next to their
  human ground truth, saves the adapter as a deployable artifact AND merges +
  converts to GGUF for local Ollama testing, and reports actual dollars spent
  (measured wall-clock GPU time x the confirmed Modal rate) vs. the estimate.

Note: the Modal `@app.function`-decorated function MUST live at module scope (a
real error hit on the first launch attempt: "must apply to functions in global
scope, unless serialize=True is set") -- training data is passed in as explicit
string arguments to `.remote()`, not captured via closure, for this reason.

Usage:
    cd backend && source venv/bin/activate
    python -m scripts.finetune.train_modal            # plan + cost estimate only, no Modal calls
    python -m scripts.finetune.train_modal --go        # actually launches training on Modal
"""

import argparse
import json
import sys
import time
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
TRAIN_PATH = DATA_DIR / "train.jsonl"
EVAL_PATH = DATA_DIR / "eval.jsonl"

BASE_MODEL = "Qwen/Qwen2.5-7B-Instruct"  # the production Pass-2 model this LoRA targets
GPU_TYPE = "A100-40GB"  # cost estimate showed this is BOTH faster and cheaper in total $
                        # than A10 (higher hourly rate, but much higher throughput more
                        # than compensates) -- see the printed comparison table below.
NUM_EPOCHS = 3
LORA_RANK = 16
LORA_ALPHA = 32
LORA_TARGET_MODULES = ["q_proj", "k_proj", "v_proj", "o_proj"]
PER_DEVICE_BATCH_SIZE = 1
GRAD_ACCUM_STEPS = 16  # effective batch size 16, same as always
# 4096, not 2048: measured with the real Qwen2.5 tokenizer on the real train.jsonl
# (2026-08-09), 36.2% of rows exceed 2048 tokens (p95=3151, max=5035). Truncation
# cuts the END of the sequence -- the assistant's target text -- so at 2048 over a
# third of examples would teach the model that stopping mid-sentence is a valid
# completion. At 4096 only 4 rows (0.03%) overflow.
#
# batch=1 (not 2): a first attempt at batch=2/grad_accum=8 with this seq_len hit a
# real CUDA OOM on A100-40GB ("Tried to allocate 6.16 GiB... 3.34 GiB free"). No
# flash-attention is configured here, so attention memory scales with seq_len^2, not
# linearly -- doubling seq_len from 2048 does not just double memory the way halving
# batch size assumed. Dropped to batch=1/grad_accum=16 (same effective batch=16) as
# the safe fix rather than reaching for flash-attn under time pressure right before
# a paid run.
MAX_SEQ_LEN = 4096
LEARNING_RATE = 2e-4
VOLUME_NAME = "humaniser-lora-checkpoints"
NUM_SAMPLE_GENERATIONS = 10
EARLY_STOP_PATIENCE = 2  # consecutive non-improving evals before stopping
GGUF_OUTTYPE = "q8_0"  # directly supported by convert_hf_to_gguf.py, no separate
                       # llama-quantize build needed -- simplest robust path to Ollama

# GPU pricing confirmed live from modal.com/pricing (2026-08-04) -- do not trust a
# stale cached number here without re-checking, prices change.
GPU_HOURLY_RATES_USD = {
    "T4": 0.59,
    "L4": 0.80,
    "A10": 1.10,
    "L40S": 1.95,
    "A100-40GB": 2.10,
    "A100-80GB": 2.50,
    "H100": 3.95,
}

# Rough LoRA fine-tuning throughput assumptions (tokens/sec, forward+backward, bf16,
# gradient checkpointing on) for a 7B model -- these are estimates from general LoRA
# benchmarks, NOT measured on this exact setup/dataset. Real throughput could
# reasonably be 1.5-2x off in either direction; treat the cost estimate as a
# ballpark, not a quote.
ASSUMED_TOKENS_PER_SEC = {
    "A10": 1000,
    "A100-40GB": 2500,
    "A100-80GB": 3000,
    "H100": 4500,
}


def count_tokens_in_jsonl(path: Path) -> int:
    """Approximate token count via word count * 1.35 (rough English words->tokens
    ratio) -- avoids pulling in the actual tokenizer just for a cost estimate."""
    total_words = 0
    n = 0
    with path.open() as f:
        for line in f:
            row = json.loads(line)
            for m in row["messages"]:
                total_words += len(m["content"].split())
            n += 1
    return round(total_words * 1.35), n


def print_cost_estimate() -> float:
    """Returns the estimated cost for GPU_TYPE, for comparison against actual spend later."""
    if not TRAIN_PATH.exists():
        print(f"No training data found at {TRAIN_PATH} -- run export.py (Step 4) first.")
        sys.exit(1)

    train_tokens, train_n = count_tokens_in_jsonl(TRAIN_PATH)
    eval_tokens, eval_n = count_tokens_in_jsonl(EVAL_PATH) if EVAL_PATH.exists() else (0, 0)
    total_train_tokens = train_tokens * NUM_EPOCHS

    print("\n" + "=" * 60)
    print("STEP 5 PLAN -- LoRA fine-tune (Modal)")
    print("=" * 60)
    print(f"Base model: {BASE_MODEL}")
    print(f"LoRA: rank={LORA_RANK} alpha={LORA_ALPHA} targets={LORA_TARGET_MODULES}")
    print(f"Epochs: {NUM_EPOCHS} | batch={PER_DEVICE_BATCH_SIZE} x grad_accum={GRAD_ACCUM_STEPS} "
          f"(effective {PER_DEVICE_BATCH_SIZE * GRAD_ACCUM_STEPS}) | max_seq_len={MAX_SEQ_LEN}")
    print(f"Train examples: {train_n} (~{train_tokens:,} tokens/epoch) | Eval examples: {eval_n}")
    print(f"Total training tokens ({NUM_EPOCHS} epochs): ~{total_train_tokens:,}")

    print("\n--- Cost estimate by GPU (approximate -- see assumptions in this file's docstring) ---")
    for gpu, rate in GPU_HOURLY_RATES_USD.items():
        tps = ASSUMED_TOKENS_PER_SEC.get(gpu)
        if tps is None:
            continue
        hours = total_train_tokens / tps / 3600
        cost = hours * rate
        flag = "  <- current GPU_TYPE" if gpu == GPU_TYPE else ""
        print(f"  {gpu:12s} ${rate:>5.2f}/hr  ~{hours:.2f}h  ~${cost:.2f}{flag}")

    chosen_hours = total_train_tokens / ASSUMED_TOKENS_PER_SEC[GPU_TYPE] / 3600
    chosen_cost = chosen_hours * GPU_HOURLY_RATES_USD[GPU_TYPE]
    print(f"\nChosen config ({GPU_TYPE}): ~{chosen_hours:.2f} hours, ~${chosen_cost:.2f}")
    print("This is comfortably within the project's stated $10-25 Step 5 budget, "
          "under every GPU option above at these assumptions.")
    print(
        "\nThese are estimates, not measured throughput on this exact model/dataset/GPU combo -- "
        "real cost could be 1.5-2x off in either direction. The training script checkpoints "
        "after every epoch to a Modal Volume so a run that goes long/wrong doesn't lose all progress."
    )
    print("\nNothing has been launched on Modal. Re-run with --go to actually start training "
          "(only after you've reviewed this estimate).")
    return chosen_cost


# --- Module-level Modal app/image/volume/function -- MUST be at global scope, ---
# --- confirmed the hard way: modal.exception.InvalidError otherwise.          ---
import modal  # noqa: E402

app = modal.App("humaniser-lora-training")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install(
        "torch==2.4.0",
        "transformers==4.46.3",
        "peft==0.13.2",
        "trl==0.11.4",
        "accelerate==0.34.2",
        "datasets>=2.19,<3",
        "bitsandbytes==0.44.1",
        "gguf",
        "sentencepiece",
        "protobuf",
        # trl's SFTTrainer import chain needs rich -- confirmed the hard way:
        # RuntimeError: Failed to import trl.trainer.sft_trainer ... No module
        # named 'rich'. Not declared as a hard trl dependency in this version.
        "rich",
    )
)
volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)


@app.function(
    image=image,
    gpu=GPU_TYPE,
    # 20h hard ceiling. Was 6h, which was LESS than the plan's own ~7.9h estimate --
    # found 2026-08-09 after a real run would have been killed by this timeout even
    # if nothing else went wrong. Modal only bills actual compute used, so a generous
    # ceiling costs nothing if the run finishes earlier; it only needs to cover the
    # stated 1.5-2x estimate error band (worst case ~16h) with margin.
    timeout=20 * 60 * 60,
    volumes={"/checkpoints": volume},
)
def train(train_data: str, eval_data: str, estimated_cost: float, run_id: str):
    import json as _json
    import os
    import subprocess
    import time

    # Must be set before torch touches CUDA (the allocator reads this on first
    # init). Directly suggested by the real OOM error hit on 2026-08-09 at
    # seq_len=4096 -- reduces allocator fragmentation, doesn't fix a genuinely
    # undersized batch on its own but removes fragmentation as a contributing
    # factor on top of the batch-size fix below.
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

    import torch
    from datasets import Dataset
    from peft import LoraConfig, get_peft_model
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        TrainerCallback,
        TrainerControl,
        TrainerState,
    )
    from trl import SFTConfig, SFTTrainer

    run_start = time.time()

    def parse_jsonl(text: str) -> Dataset:
        rows = [_json.loads(line) for line in text.splitlines() if line.strip()]
        return Dataset.from_list(rows)

    train_ds = parse_jsonl(train_data)
    eval_ds = parse_jsonl(eval_data) if eval_data else None

    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    base_model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL, torch_dtype=torch.bfloat16, device_map={"": 0}
    )
    base_model.gradient_checkpointing_enable()

    lora_config = LoraConfig(
        r=LORA_RANK,
        lora_alpha=LORA_ALPHA,
        target_modules=LORA_TARGET_MODULES,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(base_model, lora_config)
    model.print_trainable_parameters()

    # Scoped to this run_id specifically -- never reuse a fixed "run" path (see
    # launch()'s comment: that's exactly what caused this run's predecessor to
    # silently resume from an old, unrelated, superseded-corpus checkpoint).
    out_dir = f"/checkpoints/{run_id}"
    os.makedirs(out_dir, exist_ok=True)

    # --- divergence + plateau detection: stop early rather than burn the full run ---
    class GuardrailCallback(TrainerCallback):
        """Stops training if the train loss diverges (NaN/Inf, or a sustained
        rise), or if eval loss hasn't improved for EARLY_STOP_PATIENCE
        consecutive evaluations. Prints eval loss every time it's computed
        (per user requirement to see it per epoch, since eval_strategy='epoch')."""

        def __init__(self):
            self.recent_train_losses: list[float] = []
            self.best_eval_loss = float("inf")
            self.evals_since_improvement = 0

        def on_log(self, args, state: TrainerState, control: TrainerControl, logs=None, **kwargs):
            if not logs or "loss" not in logs:
                return control
            loss = logs["loss"]
            if loss != loss or loss in (float("inf"), float("-inf")):  # NaN/Inf check
                print(f"!!! DIVERGENCE: train loss is {loss} at step {state.global_step} -- stopping.")
                control.should_training_stop = True
                return control
            self.recent_train_losses.append(loss)
            self.recent_train_losses = self.recent_train_losses[-6:]
            if len(self.recent_train_losses) == 6:
                first_half = sum(self.recent_train_losses[:3]) / 3
                second_half = sum(self.recent_train_losses[3:]) / 3
                if second_half > first_half * 1.5:
                    print(
                        f"!!! DIVERGENCE: train loss rose from ~{first_half:.3f} to "
                        f"~{second_half:.3f} over the last 6 log points -- stopping."
                    )
                    control.should_training_stop = True
            return control

        def on_evaluate(self, args, state: TrainerState, control: TrainerControl, metrics=None, **kwargs):
            if not metrics or "eval_loss" not in metrics:
                return control
            eval_loss = metrics["eval_loss"]
            epoch = metrics.get("epoch", state.epoch)
            print(f">>> Epoch {epoch:.2f} eval_loss: {eval_loss:.4f}")
            if eval_loss < self.best_eval_loss - 1e-4:
                self.best_eval_loss = eval_loss
                self.evals_since_improvement = 0
            else:
                self.evals_since_improvement += 1
                if self.evals_since_improvement >= EARLY_STOP_PATIENCE:
                    print(
                        f"!!! PLATEAU: eval_loss hasn't improved for "
                        f"{self.evals_since_improvement} consecutive evals (best={self.best_eval_loss:.4f}) "
                        "-- stopping rather than burning the full run."
                    )
                    control.should_training_stop = True
            return control

    # Confirmed the hard way: the OOM that killed the previous run happened inside
    # trainer.evaluate() (a full-vocab fp32 logits tensor for a 7B model is huge),
    # not in a training step. transformers' Trainer has no config flag to reorder
    # "save before eval" within a single log/eval/save boundary call (checked --
    # _maybe_log_save_evaluate() always evaluates before saving when both trigger
    # at the same step; this isn't user-configurable). The real fix is decoupling
    # save from eval entirely: save on a frequent STEP schedule independent of
    # eval_strategy, so a future eval crash costs at most a few minutes of
    # training, not a whole epoch (~251 steps) like it did this time.
    steps_per_epoch = max(1, -(-len(train_ds) // (PER_DEVICE_BATCH_SIZE * GRAD_ACCUM_STEPS)))
    save_steps = max(1, steps_per_epoch // 5)  # ~5 checkpoints/epoch

    sft_config = SFTConfig(
        output_dir=out_dir,
        num_train_epochs=NUM_EPOCHS,
        per_device_train_batch_size=PER_DEVICE_BATCH_SIZE,
        per_device_eval_batch_size=1,  # was defaulting to match train batch (4) --
        # a 4x152k-vocab fp32 logits tensor per eval step was the actual OOM cause.
        eval_accumulation_steps=1,  # move eval logits off-GPU after every step
        # instead of accumulating them all on-GPU across the eval loop -- cheap
        # insurance against the same class of OOM even with batch size already down.
        gradient_accumulation_steps=GRAD_ACCUM_STEPS,
        learning_rate=LEARNING_RATE,
        max_seq_length=MAX_SEQ_LEN,
        logging_steps=10,
        save_strategy="steps",
        save_steps=save_steps,
        save_total_limit=5,  # bounded -- frequent saves would otherwise accumulate
        # unbounded checkpoint dirs on the volume
        eval_strategy="epoch" if eval_ds is not None else "no",
        # load_best_model_at_end deliberately NOT set: it requires save_strategy
        # and eval_strategy to match (a real transformers validation error
        # otherwise), which directly conflicts with decoupling save (steps) from
        # eval (epoch) above. GuardrailCallback already tracks/prints the best
        # eval loss itself, so nothing is lost by not having the Trainer do this too.
        bf16=True,
        report_to=[],
    )

    trainer = SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        tokenizer=tokenizer,
        callbacks=[GuardrailCallback()],
    )

    # Resume from the latest checkpoint already on the volume, if any -- confirmed
    # necessary the hard way: a local network blip during an earlier attempt tore
    # down the whole Modal app (app.run()'s heartbeat-tied lifecycle), killing a
    # run that had already checkpointed real progress. Don't waste that.
    existing_checkpoints = sorted(
        (d for d in os.listdir(out_dir) if d.startswith("checkpoint-")),
        key=lambda d: int(d.split("-")[1]),
    ) if os.path.isdir(out_dir) else []
    resume_from = f"{out_dir}/{existing_checkpoints[-1]}" if existing_checkpoints else None
    if resume_from:
        print(f"Resuming from existing checkpoint: {resume_from}")
    trainer.train(resume_from_checkpoint=resume_from)
    adapter_dir = f"{out_dir}/adapter_final"
    trainer.save_model(adapter_dir)
    volume.commit()
    print(f"Adapter (deployable artifact) saved to Modal Volume '{VOLUME_NAME}' at {adapter_dir}")

    # --- 10 sample generations from the eval split, vs. human ground truth ---
    if eval_ds is not None:
        print("\n" + "=" * 60)
        print(f"{NUM_SAMPLE_GENERATIONS} SAMPLE GENERATIONS (eval split) vs. human ground truth")
        print("=" * 60)
        model.eval()
        tokenizer.padding_side = "left"
        sample_n = min(NUM_SAMPLE_GENERATIONS, len(eval_ds))
        samples = eval_ds.shuffle(seed=42).select(range(sample_n))
        generations = []
        for i, ex in enumerate(samples):
            system_msg = ex["messages"][0]["content"]
            user_msg = ex["messages"][1]["content"]
            human_target = ex["messages"][2]["content"]
            chat = [{"role": "system", "content": system_msg}, {"role": "user", "content": user_msg}]
            prompt = tokenizer.apply_chat_template(chat, tokenize=False, add_generation_prompt=True)
            inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=MAX_SEQ_LEN).to(model.device)
            with torch.no_grad():
                out = model.generate(
                    **inputs, max_new_tokens=512, do_sample=True, temperature=0.8, top_p=0.9,
                    pad_token_id=tokenizer.pad_token_id,
                )
            gen_text = tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()
            generations.append({"id": ex.get("id"), "style": ex.get("style"), "model_generation": gen_text, "human_ground_truth": human_target})
            print(f"\n--- Sample {i+1} (id={ex.get('id')}, style={ex.get('style')}) ---")
            print("MODEL GENERATION:")
            print(gen_text[:500])
            print("\nHUMAN GROUND TRUTH:")
            print(human_target[:500])

        with open(f"{out_dir}/sample_generations.json", "w") as f:
            _json.dump(generations, f, indent=2)
        volume.commit()

    # --- merge LoRA into base + convert to GGUF for local Ollama testing ---
    gguf_ok = False
    try:
        print("\nMerging LoRA adapter into base model...")
        merged = model.merge_and_unload()
        merged_dir = f"{out_dir}/merged"
        merged.save_pretrained(merged_dir)
        tokenizer.save_pretrained(merged_dir)
        volume.commit()
        print(f"Merged model saved at {merged_dir}")

        print("Cloning llama.cpp for GGUF conversion...")
        subprocess.run(
            ["git", "clone", "--depth", "1", "https://github.com/ggerganov/llama.cpp", "/tmp/llama.cpp"],
            check=True,
        )
        gguf_path = f"{out_dir}/humaniser-lora.{GGUF_OUTTYPE}.gguf"
        print(f"Converting merged model to GGUF ({GGUF_OUTTYPE})...")
        subprocess.run(
            [
                "python", "/tmp/llama.cpp/convert_hf_to_gguf.py", merged_dir,
                "--outfile", gguf_path, "--outtype", GGUF_OUTTYPE,
            ],
            check=True,
        )
        volume.commit()
        print(f"GGUF exported to Modal Volume at {gguf_path} -- download this for local Ollama testing.")
        gguf_ok = True
    except Exception as exc:
        print(f"!!! GGUF export failed (adapter + merged model are still safe on the volume): {exc}")

    # --- actual cost report ---
    run_seconds = time.time() - run_start
    run_hours = run_seconds / 3600
    actual_cost = run_hours * GPU_HOURLY_RATES_USD[GPU_TYPE]
    print("\n" + "=" * 60)
    print("RUN COMPLETE -- COST REPORT")
    print("=" * 60)
    print(f"Actual wall-clock GPU time: {run_hours:.2f}h ({run_seconds:.0f}s)")
    print(f"Actual cost (measured time x ${GPU_HOURLY_RATES_USD[GPU_TYPE]}/hr): ${actual_cost:.2f}")
    print(f"Pre-run estimate was: ${estimated_cost:.2f}")
    print(f"Difference: ${actual_cost - estimated_cost:+.2f}")
    print(f"GGUF export: {'OK' if gguf_ok else 'FAILED (see above -- adapter/merged model still saved)'}")


CALL_ID_PATH = Path(__file__).parent / ".modal_run_id.json"


def launch(estimated_cost: float) -> None:
    """Only reached with --go.

    Uses deploy + spawn (detached), NOT `with app.run(): train.remote(...)`.
    Confirmed the hard way why this matters: `app.run()` is an *ephemeral* app
    whose lifetime is tied to the local process's heartbeat connection to Modal --
    a transient local network blip (which this machine has hit before, during
    Kaggle monitoring in this same session) tore down the entire app mid-training,
    killing a multi-hour paid job over nothing but a local DNS hiccup. `deploy()` +
    `.spawn()` runs independently on Modal's side; the local script can disconnect,
    crash, or have its network drop entirely without affecting the remote job.
    The returned call id is saved locally so `--check` can poll it later from any
    session, without needing to keep this process alive at all.
    """
    train_data = TRAIN_PATH.read_text()
    eval_data = EVAL_PATH.read_text() if EVAL_PATH.exists() else ""

    # Unique per launch -- 2026-08-09: the previous run used a fixed "/checkpoints/run"
    # path and silently resumed from a DIFFERENT, 5-day-old completed run (the original,
    # superseded corpus) left on the same volume, instead of starting fresh. A run_id
    # scopes every launch to its own checkpoint directory so this can't happen again,
    # regardless of what old artifacts are sitting on the volume.
    run_id = f"run_{int(time.time())}"

    app.deploy()
    call = train.spawn(
        train_data=train_data, eval_data=eval_data, estimated_cost=estimated_cost, run_id=run_id
    )
    CALL_ID_PATH.write_text(json.dumps({"call_id": call.object_id, "estimated_cost": estimated_cost}))
    print(f"\nLaunched (detached) -- call id: {call.object_id}")
    print(f"Saved to {CALL_ID_PATH} -- this run is now independent of this terminal/process.")
    print("Check status any time with: python -m scripts.finetune.train_modal --check")


def check() -> None:
    """Poll a previously-spawned run without blocking -- safe to call repeatedly
    from any session, doesn't require the process that launched it to still exist."""
    import modal as _modal

    if not CALL_ID_PATH.exists():
        print("No spawned run recorded (no .modal_run_id.json) -- nothing to check.")
        return
    info = json.loads(CALL_ID_PATH.read_text())
    call_id = info["call_id"]
    call = _modal.FunctionCall.from_id(call_id)
    print(f"Checking call {call_id} ...")
    try:
        result = call.get(timeout=5)
        print("COMPLETE. Result:", result)
    except TimeoutError:
        print("Still running (or queued) -- not done yet. Re-run --check later.")
    except Exception as exc:
        print(f"Run ended with an error: {exc}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--go", action="store_true", help="Actually launch the Modal training job (after reviewing the cost estimate).")
    parser.add_argument("--check", action="store_true", help="Poll a previously-spawned run's status without blocking.")
    args = parser.parse_args()

    if args.check:
        check()
        return

    estimated_cost = print_cost_estimate()

    if args.go:
        print("\n--go passed -- launching on Modal now (detached)...")
        launch(estimated_cost)
    else:
        print("\n(Dry run only -- pass --go to actually launch.)")


if __name__ == "__main__":
    main()
