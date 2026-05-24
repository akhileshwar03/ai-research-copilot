import os
import logging

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

app = FastAPI(title=settings.app_name)

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
