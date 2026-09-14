"""Per-tool kill switches, adjustable at runtime from the admin panel.

Each product surface (Research Copilot, Humanizer, AI Checker, ...) can be
switched off without a redeploy — e.g. while an upstream provider is down
or a feature is being reworked. A disabled tool answers every request with
a clear 503 so the frontend can show an honest "temporarily unavailable"
state instead of a generic failure.
"""

from fastapi import Depends

from app.core.exceptions import AppError
from app.services.runtime_settings import runtime_settings

# tool key -> runtime setting that governs it. Keys are the same strings the
# public /app/config endpoint reports, so the frontend can gate navigation.
TOOL_SETTING_KEYS: dict[str, str] = {
    "research_copilot": "tool_research_copilot_enabled",
    "humanizer": "tool_humanizer_enabled",
    "checker": "tool_checker_enabled",
    "realtime": "tool_realtime_enabled",
    "paper_analyzer": "tool_paper_analyzer_enabled",
    "extract": "tool_extract_enabled",
}


def is_tool_enabled(tool: str) -> bool:
    key = TOOL_SETTING_KEYS[tool]
    return bool(runtime_settings.get(key))


def require_tool(tool: str):
    """Dependency factory: ``Depends(require_tool("humanizer"))``."""
    if tool not in TOOL_SETTING_KEYS:
        raise KeyError(f"Unknown tool: {tool}")

    def _check() -> None:
        if not is_tool_enabled(tool):
            raise AppError(
                code="TOOL_DISABLED",
                message="This tool is temporarily unavailable. Please try again later.",
                status_code=503,
            )

    return Depends(_check)
