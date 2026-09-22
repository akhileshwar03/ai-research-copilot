from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Querex API"
    api_v1_prefix: str = "/api/v1"
    environment: str = "development"
    debug: bool = False

    # Empty = disabled. Sign up at sentry.io -> create a Python/FastAPI
    # project -> paste its DSN here. No-op without it (sentry_sdk.init is
    # simply never called), so this is safe to leave blank indefinitely.
    sentry_dsn: str = ""

    frontend_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"

    database_url: str = "sqlite:///./app.db"
    auto_create_tables: bool = False

    openai_api_key: str = ""
    openai_chat_model: str = "gpt-4.1-mini"
    openai_healthcheck_timeout_seconds: float = 2.0

    # Humaniser pipeline models — deliberately separate from openai_chat_model
    # (Checker/Chat/OCR) so the Humaniser's model choice never drifts with the
    # app-wide default. Rewrite is the creative pass; classify backs the cheap
    # analyze/verify passes.
    #
    # 2026-08-12: two real regressions chased down back to back on this line.
    #
    # First: found the rewrite model had silently drifted from its original
    # ship value ("gpt-5-mini") to "gpt-4.1-mini" to unlock the 4 sampling
    # knobs below (gpt-5-mini/nano reject them with a 400). Side-by-side test
    # against our own AI Checker: gpt-4.1-mini + those knobs, SINGLE candidate,
    # swung 69%-98% AI probability run to run on identical input -- an actual
    # regression, not just "no improvement". Briefly reverted to gpt-5-mini,
    # which held a steady 69% -- but at ~35-47s/call vs ~4-8s for gpt-4.1-mini.
    #
    # Second, better fix: paired with best-of-N candidate selection (see
    # humanizer_num_candidates below and pipeline.py), gpt-4.1-mini alone
    # stops spiking -- 5 real trials, same input, landed 69%/69%/69%/71%/69%,
    # all in 10-16s. Best-of-3 was already washing out the exact volatility
    # that made the single-candidate version look broken. Back to
    # "gpt-4.1-mini" as the default: same steady ~69% floor as gpt-5-mini,
    # at roughly gpt-4.1-mini's original speed instead of gpt-5-mini's.
    humanizer_rewrite_model: str = "gpt-4.1-mini"
    # Was "gpt-5-nano" (a reasoning model) until 2026-08-10 -- real measured latency
    # on the exact same classify prompt/input: gpt-5-nano 30.9s vs gpt-4.1-mini 3.9s,
    # ~8x. Classify runs twice per humanize request (Pass 1 analyze + Pass 3 verify),
    # so this alone cut real end-to-end pipeline latency roughly in half. Reasoning
    # models spend hidden "thinking" tokens before answering, which is wasted latency
    # for what's really pattern-matching (banned phrases, uniform sentence lengths),
    # not a task needing deep reasoning. Both models return valid, parseable JSON;
    # a full detection-accuracy comparison (false-positive/negative rate on flagged
    # AI-tells) hasn't been done, only real speed + basic output-validity, per user's
    # explicit go-ahead on the speed/quality trade-off.
    humanizer_classify_model: str = "gpt-4.1-mini"
    # Sampling params for the rewrite pass only (Pass 1/3 classify calls stay
    # deterministic — these don't apply there).
    #
    # 2026-08-12: reset to match the exact conditions the AGGRESSIVE_REWRITE_PROMPT
    # (prompts.py) was validated under -- temperature=0.85, everything else left at
    # OpenAI's defaults. That's not a guess: the 8-trial ZeroGPT test (avg ~15% AI,
    # several literal 0%s) was run with these exact values, no top_p/frequency/
    # presence tuning stacked on top. The old 1.05/0.97/0.55/0.35 combo was tuned for
    # the OLD prompt system and never re-validated against this one -- shipping the
    # new prompt with the old knobs would be a real, untested combination, not the
    # one with actual evidence behind it.
    humanizer_rewrite_temperature: float = 0.85
    humanizer_rewrite_top_p: float = 1.0
    humanizer_rewrite_frequency_penalty: float = 0.0
    humanizer_rewrite_presence_penalty: float = 0.0

    # 2026-08-12: real-world check (our own AI Checker, not a guess) showed a
    # single rewrite pass was inconsistent -- the exact same input scored
    # anywhere from 69% to 97% AI probability run to run, purely from sampling
    # randomness at temperature=1.05. Best-of-N fixes this at the source:
    # generate this many independent candidates per chunk from the ORIGINAL
    # text in parallel (never chained on each other, so no drift risk), score
    # each with a free local heuristic (banned AI vocabulary + sentence-length
    # burstiness), and keep the best. This replaced an earlier "humanize the
    # output 4-5 times sequentially" design that was explicitly rejected as
    # the wrong approach -- it multiplied latency without fixing the real
    # inconsistency, and risked drifting from the source with every extra hop.
    #
    # Briefly raised 3 -> 5, then reverted the same day: that change was based on a
    # ~50% per-candidate "0% on both detectors" hit rate that turned out to be overfit
    # to one heavily-clichéd test paragraph (see prompts.py's AGGRESSIVE_REWRITE_PROMPT
    # comment, and humanizer_prompt_log.md from that session for the full record) --
    # a head-to-head generalization check on different content showed the prompt that
    # produced that hit rate was actually worse than the one it replaced. Back to 3,
    # matching what the current (reverted) prompt was originally validated with.
    humanizer_num_candidates: int = 3

    # "Ultra Human" tab -- switched 2026-09-18 from the Phase-2 7B LoRA to the Phase-2
    # follow-up 3B LoRA (Qwen2.5-3B + adapter, humaniser-lora-3b-v2), after a real,
    # documented comparison (not a guess): ~2.3x faster (measured 9.9-10.3 tok/s vs the
    # 7B's 4.3-4.4 tok/s on this box), 41% the disk/RAM footprint (3.3GB vs 8.1GB q8_0
    # GGUF), and built on a materially more rigorous pipeline -- fresh 3,000-row corpus,
    # 4-round strict pre-clean, verified 50/50 OpenAI/Google AI-ify split, two full
    # training runs (the first caught real overfitting via trainer_state.json, the
    # second confirmed a clean monotonic eval-loss curve) -- versus the 7B, which never
    # got retrained on its own post-hoc-cleaned corpus. Detector results across 10 total
    # samples (6 tools: Quillbot, ZeroGPT, T-Checker/cross-check, humanizeai.pro,
    # CleverHumanizer, GPTZero) came back 8/10 clean, comparable to or better than the
    # 7B's original 80% GPTZero-only validation. Fabrication risk (fake bylines/quotes/
    # dates) is real and roughly equivalent between the two models -- it is NOT solved by
    # this switch, only mitigated by the model-agnostic entity_check.py guard already
    # wired into _generate_chunk_checked below, which both models share identically.
    # Rollback is a one-line revert to "humaniser-lora" if a real production issue shows up.
    #
    # NOT production-hosted yet (that's the still-unstarted Modal integration) -- only
    # reachable when running against a local Ollama instance with the model loaded. In
    # any other environment this stays unreachable and the endpoint returns a clear
    # "unavailable" error rather than hanging or crashing; the tab surfaces that
    # gracefully rather than pretending to work. Long timeout on purpose -- real
    # measured cold starts on the 7B ran up to ~120s; not yet re-measured on the 3B.
    humanizer_ultra_ollama_url: str = "http://localhost:11434"
    humanizer_ultra_model: str = "humaniser-lora-3b-v2"
    humanizer_ultra_timeout_seconds: float = 180.0
    # Ultra-only input ceiling, separate from the shared humanize_max_words (3,000).
    # 2026-08-13, measured on the live endpoint rather than estimated: the 7B ran ~4.3
    # tok/s and output averaged ~2 tokens per input word, i.e. roughly half a second of
    # wall clock per input word. 600 words is therefore about a 5-minute request --
    # already the outer edge of what an HTTP call should hold, and the honest limit to
    # advertise. The old code had no Ultra-specific limit at all, so a 936-word input
    # (perfectly legal under humanize_max_words) hit the 180s timeout on every attempt
    # with no way for the user to succeed. The 2026-09-18 switch to the 3B (measured
    # ~2.3x faster) was verified end-to-end at this same 600-word ceiling via the real
    # generate() code path -- 7 chunks, 2 resamples, 217.4s total, no timeouts, wide
    # margin -- so this ceiling still holds for the 3B. It has NOT yet been raised to
    # capture the 3B's speed headroom (see _MEASURED_GEN_TOKENS_PER_SECOND in
    # humanizer_ultra_service.py, also still on the 7B's conservative rate) -- raise
    # either only alongside a fresh, real re-measurement, not a guess.
    humanizer_ultra_max_words: int = 600

    # 2026-09-19: the "modal" backend (runtime_settings.humanizer_ultra_backend) --
    # scripts/finetune/serve_ultra_vllm.py, a Modal + vLLM deployment of the same
    # run_1789757317 merged model, built for concurrent multi-user traffic (see that
    # file's docstring for the real researched throughput numbers behind this choice).
    # Static/env config, not admin-editable, matching humanizer_ultra_ollama_url's
    # pattern -- these are endpoint/credential values, not tunable knobs. Two auth
    # layers stack here, both real and verified against Modal's own docs before
    # building this: Modal's own proxy auth (Modal-Key/Modal-Secret headers) rejects
    # unauthenticated requests at the edge BEFORE they can trigger a container cold
    # start or count toward billing; vLLM's own --api-key (Authorization: Bearer)
    # sits underneath it as a second, cheap check. Empty defaults so a deployment
    # that never sets these simply can't select "modal" successfully rather than
    # silently sending blank credentials.
    humanizer_ultra_modal_url: str = ""
    humanizer_ultra_modal_key: str = ""
    humanizer_ultra_modal_secret: str = ""
    humanizer_ultra_modal_api_key: str = ""
    # Separate from humanizer_ultra_timeout_seconds (180s, tuned for the local path's
    # different cold-start profile) -- real, measured 2026-09-19: a cold Modal
    # container took 92s just to become ready, before any generation starts. 180s
    # would leave only ~88s for actual output on a cold request, tight for anything
    # but a single short chunk. 240s leaves real room for cold start + a full chunk.
    humanizer_ultra_modal_timeout_seconds: float = 240.0

    jwt_secret_key: str = Field(default="change-me", min_length=8)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    uploads_dir: str = "uploads"
    max_upload_size_mb: int = 20

    # Cloudflare R2 (S3-compatible). Leave all blank to use local disk storage
    # instead (default for development). All four must be set to enable R2.
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = ""

    # Tavily web search — powers Real-time AI. Leave blank to disable (the
    # feature degrades to a plain assistant with no live search grounding).
    tavily_api_key: str = ""
    # Free-tier retention: documents and chats older than this are purged by
    # the daily cleanup. 0 disables retention entirely (keep forever).
    retention_days: int = 7

    rate_limit_enabled: bool = True

    # Comma-separated list of emails that are auto-promoted to admin on login.
    # Survives ephemeral-DB resets because promotion re-applies on every request.
    admin_emails: str = ""

    rag_chunk_size: int = 700
    rag_chunk_overlap: int = 120
    rag_top_k: int = 6
    # Cosine-distance threshold for retrieved chunks (0.0 = identical, 2.0 = opposite).
    # Chunks whose distance exceeds this value are discarded before being sent to the LLM,
    # preventing garbage context from causing confident-sounding hallucinations.
    # 0.8 keeps clearly related chunks (typically 0.3–0.6 with OpenAI embeddings)
    # while dropping unrelated ones (~0.9+). Adjustable at runtime from /admin.
    rag_similarity_threshold: float = 0.8

    # Email — Resend (primary, recommended) or SMTP (fallback)
    # Sign up at resend.com → get an API key → set RESEND_API_KEY
    resend_api_key: str = ""
    email_from: str = "Querex <noreply@resend.dev>"  # change to your domain after verifying on Resend

    # SMTP fallback (only used if RESEND_API_KEY is not set)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    # Backend public URL (used as OAuth redirect_uri base)
    # Set this to your Render URL, e.g. https://ai-research-copilot-xtmd.onrender.com
    app_base_url: str = "http://localhost:8000"

    # OAuth — configure these to enable social login
    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""

    # Frontend URL for OAuth redirects
    frontend_url: str = "http://localhost:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]

    @property
    def cors_origin_regex(self) -> str | None:
        """In development only, additionally allow any localhost/127.0.0.1 port.

        `frontend_origins` is a fixed allowlist (3000/3001 by default), but the
        dev frontend doesn't always land on one of those — e.g. it auto-picks
        a random free port when 3000 is already taken by another project, or a
        local preview/proxy tool forwards through its own port. Without this,
        every such setup fails CORS preflight with a 400 and the frontend sees
        a bare "Failed to fetch", which looks identical to the backend being
        down and is confusing to debug. Production is unaffected — this regex
        is None outside development, so `frontend_origins` alone still governs.
        """
        if not self.is_development:
            return None
        return r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

    @property
    def admin_email_list(self) -> list[str]:
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]

    @property
    def is_development(self) -> bool:
        return self.environment.lower() == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
