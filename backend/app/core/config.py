from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Querex API"
    api_v1_prefix: str = "/api/v1"
    environment: str = "development"
    debug: bool = False

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
    # Rewrite deliberately uses a classic chat-completions model, not a
    # reasoning model (gpt-5-mini/nano reject temperature/top_p/frequency_penalty/
    # presence_penalty outright — confirmed via direct 400 errors). Perplexity and
    # burstiness, the two signals every major AI detector scores first, are exactly
    # what those sampling params let us push on. Losing them for a reasoning model
    # meant rewriting with the least controllable output for the one pass where
    # control over lexical unpredictability matters most.
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
    # deterministic — these don't apply there). Tuned toward the human range of
    # burstiness (sentence-to-sentence perplexity swings of 0.6-1.2) rather than
    # the tight, low-variance band typical of raw LLM output (~0.2-0.4).
    humanizer_rewrite_temperature: float = 1.05
    humanizer_rewrite_top_p: float = 0.97
    humanizer_rewrite_frequency_penalty: float = 0.55
    humanizer_rewrite_presence_penalty: float = 0.35

    # "Ultra Human" tab -- the real Phase 2 fine-tuned LoRA (Qwen2.5-7B + adapter,
    # 80% real GPTZero pass rate, see backend/scripts/finetune/STATE.md), served
    # locally via Ollama. NOT production-hosted yet (that's the still-unstarted
    # Modal integration) -- only reachable when running against a local Ollama
    # instance with `humaniser-lora` loaded. In any other environment this stays
    # unreachable and the endpoint returns a clear "unavailable" error rather than
    # hanging or crashing; the tab surfaces that gracefully rather than pretending
    # to work. Long timeout on purpose -- real measured cold starts ran up to ~120s.
    humanizer_ultra_ollama_url: str = "http://localhost:11434"
    humanizer_ultra_model: str = "humaniser-lora"
    humanizer_ultra_timeout_seconds: float = 180.0

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
    apple_client_id: str = ""
    apple_team_id: str = ""
    apple_key_id: str = ""
    apple_private_key: str = ""

    # Frontend URL for OAuth redirects
    frontend_url: str = "http://localhost:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]

    @property
    def admin_email_list(self) -> list[str]:
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]

    @property
    def is_development(self) -> bool:
        return self.environment.lower() == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
