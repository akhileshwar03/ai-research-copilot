import logging

from app.core.exceptions import AppError
from app.db.repositories.humanizer_run_repository import HumanizerRunRepository
from app.db.repositories.user_repository import UserRepository
from app.services.ai_service import AIService
from app.services.humanizer import chunking
from app.services.humanizer.pipeline import run as run_pipeline
from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)


class HumanizerService:
    def __init__(self, ai_service: AIService, run_repo: HumanizerRunRepository, user_repo: UserRepository):
        self.ai_service = ai_service
        self.run_repo = run_repo
        self.user_repo = user_repo

    def validate(self, text: str) -> str:
        """Validate input and return the trimmed text, or raise AppError.

        Split out from stream() so the route can call this synchronously,
        before any StreamingResponse is created — that way a validation
        failure returns a normal 400/413 JSON error, not an SSE frame after
        the response has already committed to 200.
        """
        stripped = text.strip()
        if not stripped:
            raise AppError(code="EMPTY_TEXT", message="Text must not be empty", status_code=400)

        word_count = chunking.word_count(stripped)

        min_words = int(runtime_settings.get("humanize_min_words"))
        if min_words > 0 and word_count < min_words:
            raise AppError(
                code="TEXT_TOO_SHORT",
                message=(
                    f"Text is too short to humanize reliably — at least {min_words} words are "
                    "needed. Short text reads as low-confidence to any AI checker almost "
                    "regardless of authorship, so rewriting a shorter passage can't meaningfully "
                    "change how it scores."
                ),
                status_code=400,
            )

        max_words = int(runtime_settings.get("humanize_max_words"))
        if max_words > 0 and word_count > max_words:
            raise AppError(
                code="TEXT_TOO_LONG",
                message=f"Text exceeds the {max_words}-word limit",
                status_code=413,
            )

        max_chars = int(runtime_settings.get("humanize_max_chars"))
        if len(stripped) > max_chars:
            raise AppError(
                code="TEXT_TOO_LONG",
                message=f"Text exceeds the {max_chars}-character limit",
                status_code=413,
            )
        return stripped

    async def stream(self, text: str, style: str = "normal", expand: bool = False):
        """Yield {"type": "token"|"revised", "text": str} events from the
        3-pass pipeline (analyze -> rewrite -> verify/retry). Caller must
        call validate() first.

        expand=True relaxes the strict meaning/length-preservation rule to allow genuine
        elaboration (framing, context) rather than pure rewording — an explicit, opt-in
        trade of fidelity for a freer rewrite. Default stays strict so the tool's standing
        "meaning and facts preserved" promise holds unless a caller asks otherwise.
        """
        async for event in run_pipeline(self.ai_service, text, style=style, expand=expand):
            yield event

    # ── History ──────────────────────────────────────────────────────────

    def _resolve_user_id(self, email: str) -> int:
        user = self.user_repo.get_by_email(email)
        if not user:
            raise AppError(code="USER_NOT_FOUND", message="User not found", status_code=404)
        return user.id

    def save_run(self, email: str, input_text: str, output_text: str, style: str) -> dict:
        user_id = self._resolve_user_id(email)
        db = self.run_repo.db
        run = self.run_repo.create(user_id=user_id, input_text=input_text, output_text=output_text, style=style)
        db.commit()
        db.refresh(run)
        return {"id": run.id}

    def list_runs(self, email: str, skip: int = 0, limit: int = 50) -> dict:
        user = self.user_repo.get_by_email(email)
        if not user:
            return {"runs": [], "total": 0, "skip": skip, "limit": limit}

        runs = self.run_repo.list_by_user_id(user.id, skip=skip, limit=limit)
        total = self.run_repo.count_by_user_id(user.id)
        return {
            "runs": [
                {
                    "id": run.id,
                    "input_text": run.input_text,
                    "output_text": run.output_text,
                    "style": run.style,
                    "created_at": run.created_at,
                }
                for run in runs
            ],
            "total": total,
            "skip": skip,
            "limit": limit,
        }

    def delete_run(self, email: str, run_id: int) -> dict:
        user_id = self._resolve_user_id(email)
        run = self.run_repo.get_by_id_and_user(run_id, user_id)
        if not run:
            raise AppError(code="RUN_NOT_FOUND", message="Humanizer run not found", status_code=404)
        db = self.run_repo.db
        self.run_repo.delete(run)
        db.commit()
        return {"id": run_id}

    def delete_all_runs(self, email: str) -> dict:
        user_id = self._resolve_user_id(email)
        db = self.run_repo.db
        deleted = self.run_repo.delete_all_by_user_id(user_id)
        db.commit()
        return {"deleted": deleted}
