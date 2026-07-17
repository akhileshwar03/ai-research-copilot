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

    jwt_secret_key: str = Field(default="change-me", min_length=8)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    uploads_dir: str = "uploads"
    max_upload_size_mb: int = 20
    # Free-tier retention: documents and chats older than this are purged by
    # the daily cleanup. 0 disables retention entirely (keep forever).
    retention_days: int = 7
    chroma_path: str = "chroma_db"
    chroma_collection: str = "documents"

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
