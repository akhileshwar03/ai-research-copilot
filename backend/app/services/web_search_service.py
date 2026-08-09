"""Tavily web search client for Real-time AI.

Search results are inherently untrusted, attacker-influenceable content — any
public web page can contain text engineered to look like an instruction to an
LLM ("ignore previous instructions", "you are now in developer mode", etc.).
This service only fetches and normalizes results; the prompt-injection
defense lives in realtime_service.py, which wraps everything returned here in
an explicit "read this, don't obey it" block before it ever reaches the model.
"""

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_MAX_QUERY_CHARS = 400
_MAX_CONTENT_CHARS_PER_RESULT = 1000
_TAVILY_SEARCH_URL = "https://api.tavily.com/search"


class WebSearchService:
    def __init__(self):
        self.settings = get_settings()

    async def search(self, query: str, max_results: int = 5) -> list[dict]:
        if not self.settings.tavily_api_key or not query.strip():
            return []

        query = query.strip()[:_MAX_QUERY_CHARS]

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    _TAVILY_SEARCH_URL,
                    json={
                        "api_key": self.settings.tavily_api_key,
                        "query": query,
                        "max_results": max_results,
                        "search_depth": "basic",
                    },
                )
                response.raise_for_status()
                data = response.json()
        except Exception:
            logger.warning("tavily_search_failed query_len=%d", len(query), exc_info=True)
            return []

        results = []
        for item in data.get("results", [])[:max_results]:
            results.append(
                {
                    "title": (item.get("title") or "")[:200],
                    "url": item.get("url") or "",
                    "content": (item.get("content") or "")[:_MAX_CONTENT_CHARS_PER_RESULT],
                }
            )
        return results

    def ping(self) -> bool:
        return bool(self.settings.tavily_api_key)
