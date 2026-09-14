"""Public, unauthenticated runtime configuration for the frontend.

Exposes only what a signed-out visitor is allowed to know: which tools are
switched on, whether sign-ups are open, whether the platform is in
maintenance mode, and the current announcement banner. Numeric limits and
everything else stay admin-only.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.dependencies.tools import TOOL_SETTING_KEYS
from app.services.runtime_settings import runtime_settings

router = APIRouter(prefix="/app", tags=["app"])


class PublicAppConfig(BaseModel):
    tools: dict[str, bool]
    signups_enabled: bool
    maintenance_mode: bool
    announcement: str
    chat_max_chars: int
    humanize_max_words: int
    checker_max_chars: int


@router.get("/config", response_model=PublicAppConfig)
def public_app_config():
    return PublicAppConfig(
        tools={tool: bool(runtime_settings.get(key)) for tool, key in TOOL_SETTING_KEYS.items()},
        signups_enabled=bool(runtime_settings.get("signups_enabled")),
        maintenance_mode=bool(runtime_settings.get("maintenance_mode")),
        announcement=str(runtime_settings.get("announcement_text") or ""),
        chat_max_chars=int(runtime_settings.get("chat_max_chars")),
        humanize_max_words=int(runtime_settings.get("humanize_max_words")),
        checker_max_chars=int(runtime_settings.get("checker_max_chars")),
    )
