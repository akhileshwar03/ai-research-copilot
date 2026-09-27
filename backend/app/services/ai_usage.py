"""Records the token usage the model provider reports for every LLM / embedding call.

Attribution (which user, which tool) comes from a context variable that RequestContextMiddleware sets for
the duration of each request, so the AI service layer needs no knowledge of users or routes. A call made
outside a request (a script, a background job) is still recorded, just without a user.
"""

import logging
from contextvars import ContextVar
from typing import Any

from langchain_core.callbacks import BaseCallbackHandler

logger = logging.getLogger(__name__)

# (shared request state dict, tool name). The state dict is the one the auth dependency fills with `user_id`,
# so reading it at call time picks up the user even though authentication happens after the middleware.
_context: ContextVar[tuple[dict, str | None] | None] = ContextVar("ai_usage_context", default=None)


def set_usage_context(state: dict, tool: str | None):
    return _context.set((state, tool))


def reset_usage_context(token) -> None:
    _context.reset(token)


def record_ai_usage(
    *, model: str, kind: str, input_tokens: int, output_tokens: int = 0, cached_input_tokens: int = 0
) -> None:
    """Insert one row. Opens its own session and never raises -- accounting must not break a request."""
    if input_tokens <= 0 and output_tokens <= 0:
        return
    from app.db.models.ai_usage_event import AIUsageEvent
    from app.db.session import SessionLocal

    ctx = _context.get()
    state, tool = ctx if ctx else ({}, None)
    db = SessionLocal()
    try:
        db.add(
            AIUsageEvent(
                user_id=state.get("user_id"),
                tool=tool,
                request_id=state.get("request_id"),
                kind=kind,
                model=model or "unknown",
                input_tokens=int(input_tokens),
                output_tokens=int(output_tokens),
                cached_input_tokens=int(cached_input_tokens),
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.debug("ai_usage_write_failed model=%s", model, exc_info=True)
    finally:
        db.close()


def record_search_usage(model: str = "tavily-search-basic") -> None:
    """Record one billed web search (see ai_pricing.SEARCH_CREDITS_PER_CALL). Never raises."""
    from app.db.models.ai_usage_event import AIUsageEvent
    from app.db.session import SessionLocal

    ctx = _context.get()
    state, tool = ctx if ctx else ({}, None)
    db = SessionLocal()
    try:
        db.add(
            AIUsageEvent(
                user_id=state.get("user_id"),
                tool=tool,
                request_id=state.get("request_id"),
                kind="search",
                model=model,
                input_tokens=0,
                output_tokens=0,
                cached_input_tokens=0,
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.debug("search_usage_write_failed model=%s", model, exc_info=True)
    finally:
        db.close()


class TokenUsageCallback(BaseCallbackHandler):
    """LangChain callback: reads `usage_metadata` off each finished LLM call and records it."""

    def __init__(self, default_model: str) -> None:
        self.default_model = default_model

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:
        try:
            input_tokens = output_tokens = cached = 0
            model = self.default_model
            for generations in response.generations:
                for generation in generations:
                    message = getattr(generation, "message", None)
                    usage = getattr(message, "usage_metadata", None) or {}
                    input_tokens += int(usage.get("input_tokens", 0) or 0)
                    output_tokens += int(usage.get("output_tokens", 0) or 0)
                    cached += int((usage.get("input_token_details") or {}).get("cache_read", 0) or 0)
                    meta = getattr(message, "response_metadata", None) or {}
                    model = meta.get("model_name") or model
            if input_tokens == 0 and output_tokens == 0:
                token_usage = (response.llm_output or {}).get("token_usage") or {}
                input_tokens = int(token_usage.get("prompt_tokens", 0) or 0)
                output_tokens = int(token_usage.get("completion_tokens", 0) or 0)
                model = (response.llm_output or {}).get("model_name") or model
            record_ai_usage(
                model=model,
                kind="chat",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cached_input_tokens=cached,
            )
        except Exception:
            logger.debug("ai_usage_callback_failed", exc_info=True)


class _MeteredEmbeddingsClient:
    """Wraps the OpenAI embeddings client so the exact `usage.total_tokens` of every request is recorded."""

    def __init__(self, inner: Any, model: str) -> None:
        self._inner = inner
        self._model = model

    def create(self, *args: Any, **kwargs: Any):
        response = self._inner.create(*args, **kwargs)
        try:
            usage = response["usage"] if isinstance(response, dict) else getattr(response, "usage", None)
            total = usage["total_tokens"] if isinstance(usage, dict) else getattr(usage, "total_tokens", 0)
            record_ai_usage(model=kwargs.get("model") or self._model, kind="embedding", input_tokens=int(total or 0))
        except Exception:
            logger.debug("embedding_usage_failed", exc_info=True)
        return response

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)
