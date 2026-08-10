# CLAUDE.md

## Humanizer Phase 2 (LoRA fine-tune) — COMPLETE (2026-08-10)

Built and validated a fine-tuned LoRA (`Qwen/Qwen2.5-7B-Instruct` base) for the Humaniser
Pass 2 rewrite. Real GPTZero validation: 8/10 (80%) pass rate, above the 50% bar. Model exists
locally in Ollama as `humaniser-lora` — **not yet wired into production** (`ai_service.py`
still calls GPT for the live humanizer). That integration is a separate, not-yet-started task.

Before touching anything under `backend/scripts/finetune/`, read
`backend/scripts/finetune/STATE.md` first. It is the source of truth for this multi-session
build (current step, key decisions, account/credential status, dollars spent, exact resume
commands) — the conversation history is not reliable across compaction.
