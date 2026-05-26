import os
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.middleware.exception_handlers import register_exception_handlers
from app.api.middleware.request_context import request_context_middleware
from app.api.dependencies.services import get_health_service
from app.api.routes.v1 import api_v1_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.models import chat_models, document, user  # noqa: F401
from app.db.session import Base, engine
from routes.auth import router as legacy_auth_router
from routes.chat import router as legacy_chat_router
from routes.documents import router as legacy_documents_router
from routes.sessions import router as legacy_sessions_router
from routes.upload import router as legacy_upload_router
from app.services.health_service import HealthService

settings = get_settings()

configure_logging()
logger = logging.getLogger(__name__)


def _run_startup_migrations() -> None:
    """Apply any pending schema changes at startup.

    This runs regardless of whether `alembic upgrade head` is in the start
    command, making the service resilient to dashboard/config drift.
    """
    from sqlalchemy import inspect as sa_inspect, text

    try:
        with engine.connect() as conn:
            inspector = sa_inspect(conn)

            # ── documents.user_email (migration 0004) ──────────────────────
            doc_cols = {c["name"] for c in inspector.get_columns("documents")}
            if "user_email" not in doc_cols:
                logger.info("startup_migration: adding documents.user_email")
                conn.execute(text(
                    "ALTER TABLE documents ADD COLUMN user_email VARCHAR"
                ))
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_documents_user_email "
                    "ON documents (user_email)"
                ))
                conn.commit()
                logger.info("startup_migration: documents.user_email added")

            # Also stamp alembic_version so alembic upgrade head agrees
            try:
                result = conn.execute(
                    text("SELECT version_num FROM alembic_version")
                ).fetchone()
                if result and result[0] == "20260524_0003":
                    conn.execute(
                        text("UPDATE alembic_version SET version_num = '0004'")
                    )
                    conn.commit()
                    logger.info("startup_migration: alembic_version stamped 0004")
            except Exception:
                pass  # alembic_version table might not exist yet

            # ── documents.checksum_sha256 — per-user unique (migration 0005) ──
            # Migration 0004's idempotency guard fires when user_email was added
            # by the ALTER TABLE path above, so it skips the index change.
            # We detect that here and fix it unconditionally at startup.
            existing_index_names = {idx["name"] for idx in inspector.get_indexes("documents")}
            if "uq_documents_user_checksum" not in existing_index_names:
                logger.info("startup_migration: fixing documents.checksum_sha256 to per-user unique")
                conn.execute(text("DROP INDEX IF EXISTS ix_documents_checksum_sha256"))
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_documents_checksum_sha256 "
                    "ON documents (checksum_sha256)"
                ))
                conn.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_user_checksum "
                    "ON documents (user_email, checksum_sha256)"
                ))
                conn.commit()
                logger.info("startup_migration: checksum_sha256 now per-user unique")

    except Exception:
        logger.exception("startup_migration failed — server will continue but "
                         "document endpoints may be broken")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _run_startup_migrations()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

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

app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")

# Versioned API routes use existing handlers to preserve behavior.
app.include_router(api_v1_router, prefix=settings.api_v1_prefix)

# Backward compatibility: existing frontend can continue to call legacy paths.
app.include_router(legacy_auth_router)
app.include_router(legacy_chat_router)
app.include_router(legacy_documents_router)
app.include_router(legacy_sessions_router)
app.include_router(legacy_upload_router)

register_exception_handlers(app)


@app.get("/")
async def root():
    return {"message": settings.app_name}


@app.get("/health")
def health(service: HealthService = Depends(get_health_service)):
    return service.health()


@app.get("/readiness")
def readiness(service: HealthService = Depends(get_health_service)):
    return service.readiness()


if settings.auto_create_tables and settings.is_development:
    Base.metadata.create_all(bind=engine)

if settings.jwt_secret_key == "change-me":
    logger.warning("JWT secret key uses default placeholder value; set JWT_SECRET_KEY in environment.")
