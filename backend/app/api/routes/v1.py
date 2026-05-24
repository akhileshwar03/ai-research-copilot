from fastapi import APIRouter, Depends

from app.api.dependencies.services import get_health_service
from app.services.health_service import HealthService
from routes.auth import router as auth_router
from routes.chat import router as chat_router
from routes.documents import router as documents_router
from routes.sessions import router as sessions_router
from routes.upload import router as upload_router

api_v1_router = APIRouter()

# API versioning layer while preserving existing handler behavior.
api_v1_router.include_router(auth_router)
api_v1_router.include_router(chat_router)
api_v1_router.include_router(documents_router)
api_v1_router.include_router(sessions_router)
api_v1_router.include_router(upload_router)


@api_v1_router.get("/health")
def healthcheck(service: HealthService = Depends(get_health_service)):
    return service.health()


@api_v1_router.get("/readiness")
def readiness(service: HealthService = Depends(get_health_service)):
    return service.readiness()
