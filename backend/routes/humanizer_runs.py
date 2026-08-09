from fastapi import APIRouter, Depends, Query

from app.api.dependencies.auth import get_current_user_email
from app.api.dependencies.services import get_humanizer_service
from app.schemas.humanize import HumanizeRunCreate, HumanizeRunListResponse
from app.services.humanizer_service import HumanizerService

router = APIRouter()


@router.get("/humanizer/runs", response_model=HumanizeRunListResponse)
def list_humanizer_runs(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    email: str = Depends(get_current_user_email),
    service: HumanizerService = Depends(get_humanizer_service),
):
    return service.list_runs(email, skip=skip, limit=limit)


@router.post("/humanizer/runs")
def create_humanizer_run(
    body: HumanizeRunCreate,
    email: str = Depends(get_current_user_email),
    service: HumanizerService = Depends(get_humanizer_service),
):
    return service.save_run(email, input_text=body.input_text, output_text=body.output_text, style=body.style)


@router.delete("/humanizer/runs/all")
def delete_all_humanizer_runs(
    email: str = Depends(get_current_user_email),
    service: HumanizerService = Depends(get_humanizer_service),
):
    return service.delete_all_runs(email)


@router.delete("/humanizer/runs/{run_id}")
def delete_humanizer_run(
    run_id: int,
    email: str = Depends(get_current_user_email),
    service: HumanizerService = Depends(get_humanizer_service),
):
    return service.delete_run(email, run_id=run_id)
