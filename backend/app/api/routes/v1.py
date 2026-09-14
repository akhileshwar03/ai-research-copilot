from fastapi import APIRouter, Depends

from app.api.dependencies.services import get_health_service
from app.api.routes.admin import router as admin_router
from app.api.routes.app_config import router as app_config_router
from app.api.routes.oauth import router as oauth_router
from app.services.health_service import HealthService
from app.api.routes.auth import router as auth_router
from app.api.routes.chat import router as chat_router
from app.api.routes.checker import router as checker_router
from app.api.routes.documents import router as documents_router
from app.api.routes.extract import router as extract_router
from app.api.routes.humanize import router as humanize_router
from app.api.routes.humanizer_runs import router as humanizer_runs_router
from app.api.routes.paper_analyzer import router as paper_analyzer_router
from app.api.routes.realtime import router as realtime_router
from app.api.routes.sessions import router as sessions_router
from app.api.routes.upload import router as upload_router

api_v1_router = APIRouter()

api_v1_router.include_router(auth_router)
api_v1_router.include_router(oauth_router)
api_v1_router.include_router(admin_router)
api_v1_router.include_router(app_config_router)
api_v1_router.include_router(chat_router)
api_v1_router.include_router(documents_router)
api_v1_router.include_router(sessions_router)
api_v1_router.include_router(upload_router)
api_v1_router.include_router(humanize_router)
api_v1_router.include_router(humanizer_runs_router)
api_v1_router.include_router(checker_router)
api_v1_router.include_router(realtime_router)
api_v1_router.include_router(extract_router)
api_v1_router.include_router(paper_analyzer_router)


@api_v1_router.get("/health")
def healthcheck(service: HealthService = Depends(get_health_service)):
    return service.health()


@api_v1_router.get("/readiness")
def readiness(service: HealthService = Depends(get_health_service)):
    return service.readiness()
