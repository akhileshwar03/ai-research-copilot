from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "AI Research Copilot API"
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
    chroma_path: str = "chroma_db"
    chroma_collection: str = "documents"

    rag_chunk_size: int = 700
    rag_chunk_overlap: int = 120
    rag_top_k: int = 6

    # Email / SMTP (optional — OTPs are logged to console when not set)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    # OAuth — configure these to enable social login
    google_client_id: str = ""
    google_client_secret: str = ""
    apple_client_id: str = ""
    apple_team_id: str = ""
    apple_key_id: str = ""
    apple_private_key: str = ""
    facebook_app_id: str = ""
    facebook_app_secret: str = ""

    # Frontend URL for OAuth redirects
    frontend_url: str = "http://localhost:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]

    @property
    def is_development(self) -> bool:
        return self.environment.lower() == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
