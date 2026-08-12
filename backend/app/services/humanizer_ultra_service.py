"""'Ultra Human' — real output from the Phase 2 fine-tuned LoRA (Qwen2.5-7B +
adapter, 80% real GPTZero pass rate, backend/scripts/finetune/STATE.md Round 23),
served locally via Ollama. Not production-hosted (the Modal integration hasn't
been built yet) -- reachable only when a local Ollama instance with
`humaniser-lora` loaded is running. Everywhere else this raises a clear
AppError the route/frontend can present as "unavailable" rather than a bare
500 or an indefinite hang.

System prompt construction mirrors export.py/pipeline.py exactly (BASE_PROMPT +
hard_rules + STYLE_GUIDANCE + few-shot examples) -- this is the same prompt the
model was actually trained on; using anything else here would be testing the
model out of distribution.
"""

import logging

import httpx

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.services.humanizer.examples import format_examples
from app.services.humanizer.prompts import (
    BASE_PROMPT,
    DEFAULT_STYLE,
    EXPANDED_HARD_RULES,
    STRICT_HARD_RULES,
    STYLE_GUIDANCE,
)

logger = logging.getLogger(__name__)


def _resolve_style(style: str) -> str:
    return style if style in STYLE_GUIDANCE else DEFAULT_STYLE


def _build_system_prompt(style: str, expand: bool) -> str:
    hard_rules = EXPANDED_HARD_RULES if expand else STRICT_HARD_RULES
    resolved = _resolve_style(style)
    parts = [BASE_PROMPT, hard_rules, STYLE_GUIDANCE[resolved], format_examples(resolved)]
    return "\n\n".join(p for p in parts if p)


class HumanizerUltraService:
    async def generate(self, text: str, style: str = "normal", expand: bool = False) -> str:
        settings = get_settings()
        system = _build_system_prompt(style, expand)

        try:
            async with httpx.AsyncClient(timeout=settings.humanizer_ultra_timeout_seconds) as client:
                resp = await client.post(
                    f"{settings.humanizer_ultra_ollama_url}/api/chat",
                    json={
                        "model": settings.humanizer_ultra_model,
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": text},
                        ],
                        "stream": False,
                        # Generous headroom -- the model can run well past source
                        # length (measured up to ~2.5x on some inputs); cutting it
                        # short mid-sentence would be worse than the wait.
                        "options": {"num_predict": 1200},
                    },
                )
                resp.raise_for_status()
        except httpx.ConnectError as exc:
            logger.warning("humanizer_ultra_unreachable: %s", exc)
            raise AppError(
                code="ULTRA_UNAVAILABLE",
                message=(
                    "Ultra Human mode isn't available right now — it runs on the locally-hosted "
                    "fine-tuned model, which isn't reachable in this environment."
                ),
                status_code=503,
            ) from exc
        except httpx.TimeoutException as exc:
            logger.warning("humanizer_ultra_timeout: %s", exc)
            raise AppError(
                code="ULTRA_TIMEOUT",
                message="Ultra Human mode timed out — the model may be waking up from idle. Try again shortly.",
                status_code=504,
            ) from exc
        except httpx.HTTPStatusError as exc:
            logger.exception("humanizer_ultra_http_error")
            raise AppError(
                code="ULTRA_ERROR",
                message="Ultra Human mode failed to generate a response.",
                status_code=502,
            ) from exc

        data = resp.json()
        content = data.get("message", {}).get("content", "")
        return content.strip()
