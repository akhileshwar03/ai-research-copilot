from fastapi import APIRouter, Depends, Request

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.tools import require_tool
from app.api.dependencies.services import get_checker_service
from app.core.rate_limit import limiter
from app.schemas.checker import CheckResult, CheckTextRequest
from app.services.checker_service import CheckerService
from app.services.runtime_settings import checker_rate_limit

router = APIRouter(prefix="/checker")


@router.post("/text", response_model=CheckResult, dependencies=[require_tool("checker")])
@limiter.limit(checker_rate_limit)
async def check_text(
    request: Request,
    body: CheckTextRequest,
    email: str = Depends(get_current_user_email),
    service: CheckerService = Depends(get_checker_service),
):
    return await service.check_text(body.text)
