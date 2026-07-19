import os
import logging
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.middleware.exception_handlers import register_exception_handlers
from app.api.middleware.request_context import request_context_middleware
from app.api.dependencies.services import get_health_service
from app.api.routes.oauth import router as oauth_router
from app.api.routes.v1 import api_v1_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.rate_limit import limiter
from app.db.models import app_setting, chat_models, document, one_time_code, user  # noqa: F401
from app.db.session import Base, engine
from app.services.health_service import HealthService
from app.services.retention_service import maybe_run_cleanup

settings = get_settings()

configure_logging()
logger = logging.getLogger(__name__)


def _run_startup_migrations() -> None:
    """Apply any pending schema changes that Alembic may have missed.

    SQLite only: this safety net exists for Render's ephemeral disk, where the
    database can be reset between the alembic step and process start. On
    PostgreSQL the database persists and `alembic upgrade head` in the start
    command is the single source of truth — running raw DDL here would just
    risk drift.
    """
    from sqlalchemy import inspect as sa_inspect, text

    if engine.dialect.name != "sqlite":
        logger.info("startup_migrations_skipped dialect=%s (alembic owns the schema)", engine.dialect.name)
        return

    try:
        with engine.connect() as conn:
            inspector = sa_inspect(conn)

            doc_cols = {c["name"] for c in inspector.get_columns("documents")}
            if "user_email" not in doc_cols:
                logger.info("startup_migration: adding documents.user_email")
                conn.execute(text("ALTER TABLE documents ADD COLUMN user_email VARCHAR"))
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_documents_user_email ON documents (user_email)"
                ))
                conn.commit()
                logger.info("startup_migration: documents.user_email added")

            try:
                result = conn.execute(
                    text("SELECT version_num FROM alembic_version")
                ).fetchone()
                if result and result[0] == "20260524_0003":
                    conn.execute(text("UPDATE alembic_version SET version_num = '0004'"))
                    conn.commit()
            except Exception:
                pass

            # ── chat_sessions.created_at (migration 0006) ──────────────────────
            session_cols = {c["name"] for c in inspector.get_columns("chat_sessions")}
            if "created_at" not in session_cols:
                logger.info("startup_migration: adding chat_sessions.created_at")
                conn.execute(text(
                    "ALTER TABLE chat_sessions ADD COLUMN created_at DATETIME"
                ))
                conn.execute(text(
                    "UPDATE chat_sessions SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"
                ))
                conn.commit()
                logger.info("startup_migration: chat_sessions.created_at added")

            # ── admin role + OTP attempts + app_settings (migration 0007) ──────
            user_cols = {c["name"] for c in inspector.get_columns("users")}
            if "is_admin" not in user_cols:
                logger.info("startup_migration: adding users.is_admin")
                conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0"))
                conn.commit()

            otp_cols = {c["name"] for c in inspector.get_columns("otp_tokens")}
            if "attempts" not in otp_cols:
                logger.info("startup_migration: adding otp_tokens.attempts")
                conn.execute(text("ALTER TABLE otp_tokens ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0"))
                conn.commit()

            conn.execute(text(
                """
                CREATE TABLE IF NOT EXISTS app_settings (
                    key VARCHAR NOT NULL PRIMARY KEY,
                    value VARCHAR NOT NULL,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            ))
            conn.commit()

            # ── one_time_codes (migration 0008) ────────────────────────────────
            conn.execute(text(
                """
                CREATE TABLE IF NOT EXISTS one_time_codes (
                    id INTEGER PRIMARY KEY,
                    code_hash VARCHAR NOT NULL,
                    purpose VARCHAR NOT NULL,
                    payload TEXT,
                    expires_at DATETIME NOT NULL
                )
                """
            ))
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_one_time_codes_code_hash ON one_time_codes (code_hash)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_one_time_codes_purpose ON one_time_codes (purpose)"
            ))
            conn.commit()

            # ── chat_sessions.document_ids (migration 0009) ────────────────────
            session_cols = {c["name"] for c in inspector.get_columns("chat_sessions")}
            if "document_ids" not in session_cols:
                logger.info("startup_migration: adding chat_sessions.document_ids")
                conn.execute(text("ALTER TABLE chat_sessions ADD COLUMN document_ids TEXT"))
                conn.commit()
                logger.info("startup_migration: chat_sessions.document_ids added")

            # ── chat_messages.sources (migration 0010) ─────────────────────────
            message_cols = {c["name"] for c in inspector.get_columns("chat_messages")}
            if "sources" not in message_cols:
                logger.info("startup_migration: adding chat_messages.sources")
                conn.execute(text("ALTER TABLE chat_messages ADD COLUMN sources TEXT"))
                conn.commit()
                logger.info("startup_migration: chat_messages.sources added")

            existing_index_names = {idx["name"] for idx in inspector.get_indexes("documents")}
            if "uq_documents_user_checksum" not in existing_index_names:
                logger.info("startup_migration: fixing documents.checksum_sha256 to per-user unique")
                conn.execute(text("DROP INDEX IF EXISTS ix_documents_checksum_sha256"))
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_documents_checksum_sha256 ON documents (checksum_sha256)"
                ))
                conn.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_user_checksum "
                    "ON documents (user_email, checksum_sha256)"
                ))
                conn.commit()
                logger.info("startup_migration: checksum_sha256 now per-user unique")

    except Exception:
        logger.exception(
            "startup_migration failed — server will continue but document endpoints may be broken"
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _run_startup_migrations()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

# ── Rate limiting ──────────────────────────────────────────────────────────────
app.state.limiter = limiter


async def _rate_limit_error_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    from app.api.middleware.request_context import request_context_middleware  # noqa: F401
    request_id = getattr(request.state, "request_id", "") or request.headers.get("x-request-id", "")
    return JSONResponse(
        status_code=429,
        content={
            "error": {
                "code": "RATE_LIMIT_EXCEEDED",
                "message": f"Too many requests. Limit: {exc.detail}",
                "request_id": request_id,
                "details": {},
            },
            "detail": f"Too many requests. Limit: {exc.detail}",
        },
        headers={"Retry-After": "60"},
    )


app.add_exception_handler(RateLimitExceeded, _rate_limit_error_handler)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(request_context_middleware)

os.makedirs(settings.uploads_dir, exist_ok=True)
os.makedirs(settings.chroma_path, exist_ok=True)

# NOTE: uploads are deliberately NOT mounted as public static files.
# PDFs are served through GET /documents/{id}/file with an ownership check.

# ── Versioned API (all frontend calls go here) ─────────────────────────────────
app.include_router(api_v1_router, prefix=settings.api_v1_prefix)

# ── OAuth callbacks at root level ──────────────────────────────────────────────
# OAuth providers redirect to hard-coded URIs registered at the domain root.
# Only the callback routes need root-level mounting; all other auth endpoints
# are exclusively under /api/v1.
app.include_router(oauth_router)

register_exception_handlers(app)


@app.get("/")
async def root(background_tasks: BackgroundTasks):
    # The uptime ping lands here; it doubles as the retention-cleanup trigger.
    background_tasks.add_task(maybe_run_cleanup)
    return {"message": settings.app_name, "version": "v1", "docs": "/docs"}


@app.get("/health")
def health(background_tasks: BackgroundTasks, service: HealthService = Depends(get_health_service)):
    background_tasks.add_task(maybe_run_cleanup)
    return service.health()


@app.get("/readiness")
def readiness(service: HealthService = Depends(get_health_service)):
    return service.readiness()


if settings.auto_create_tables and settings.is_development:
    Base.metadata.create_all(bind=engine)

if settings.jwt_secret_key == "change-me":
    logger.warning("JWT secret key uses default placeholder value; set JWT_SECRET_KEY in environment.")
