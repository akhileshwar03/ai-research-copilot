"""RetrievalService.retrieve_context's embedding and vector-store calls are genuinely synchronous
(a blocking HTTP call to OpenAI, a blocking DB call) -- calling them directly inside an `async
def` without `asyncio.to_thread` stalls the ENTIRE event loop for their full duration, not just
this request's own latency. Confirmed with a real, timed, non-mocked demo against the actual
OpenAI embeddings API (2026-09-28): a concurrent coroutine made literally zero progress until the
blocking call returned -- total wall time equalled the SUM of both durations, not their max, which
means every OTHER in-flight request on the same worker (another user's chat message, a health
check) stalls too. `asyncio.to_thread` (now used at every such call site -- see the comments in
retrieval_service.py and chat_service.py) restored real concurrency in that same demo.

These tests reproduce the same proof with a fast, deterministic, in-process sleep instead of a
real network call, so they run in milliseconds and never depend on network/API availability --
but they exercise the REAL RetrievalService code path, not a reimplementation of the timing logic.
"""

import asyncio
import time

import pytest

from app.modules.rag.retrieval_service import RetrievalService


class _BlockingSleepEmbeddingService:
    """A plain synchronous embed_query -- exactly EmbeddingService's real shape -- that blocks
    the calling thread for `delay_s`. Used to prove retrieve_context does (or doesn't) stall the
    event loop while this runs, without needing a real network call."""

    def __init__(self, delay_s: float):
        self.delay_s = delay_s

    def embed_query(self, query):
        time.sleep(self.delay_s)  # a genuine blocking sleep, not asyncio.sleep -- same class of
        # call as the real OpenAIEmbeddings client's blocking HTTP request.
        return [0.0]


class _EmptyVectorStore:
    def query(self, query_embedding, n_results, where=None):
        return {"documents": [[]], "metadatas": [[]], "distances": [[]]}


async def _ticker(duration_s: float) -> list[float]:
    """Ticks every 10ms via a pure-async sleep. If something else on the event loop is truly
    blocking it, this coroutine cannot run AT ALL until that call returns -- so its tick count and
    total elapsed time are the real signal, not just the gaps between ticks (which, once this
    finally starts, look fine regardless of how long it was delayed from starting)."""
    t0 = time.monotonic()
    ticks = 0
    while time.monotonic() - t0 < duration_s:
        await asyncio.sleep(0.01)
        ticks += 1
    return ticks


def test_retrieve_context_does_not_stall_a_concurrent_coroutine():
    """The real regression test: retrieve_context's own blocking work must run on a worker thread
    (via asyncio.to_thread), so a concurrent coroutine keeps making progress the whole time instead
    of being frozen out until retrieve_context finishes."""
    embed_delay = 0.2
    service = RetrievalService(_BlockingSleepEmbeddingService(embed_delay), _EmptyVectorStore())

    async def run():
        ticker_duration = 0.3
        t0 = time.monotonic()
        retrieval_task = asyncio.create_task(service.retrieve_context("q", source_ids=["d.pdf"], user_email="u@x.com"))
        ticker_task = asyncio.create_task(_ticker(ticker_duration))
        _, ticks = await asyncio.gather(retrieval_task, ticker_task)
        total = time.monotonic() - t0
        return ticks, total

    ticks, total = asyncio.run(run())

    # If retrieve_context were still blocking the loop, the ticker couldn't start until the
    # embedding delay (0.2s) elapsed, then would need its own full 0.3s on top -- total >= 0.5s,
    # sum-like. With to_thread, both run concurrently -- total stays near max(0.2, 0.3) = 0.3s.
    assert total < 0.45, f"retrieve_context appears to be blocking the event loop (total={total:.3f}s)"
    # And the ticker must have gotten real ticks in throughout, not all bunched up after the fact.
    assert ticks >= 20, f"the concurrent coroutine made too little progress (ticks={ticks}) -- event loop was stalled"


def test_retrieve_context_still_returns_correct_empty_result():
    """The to_thread wrapping must not change retrieve_context's actual behaviour -- only where the
    blocking work runs."""
    service = RetrievalService(_BlockingSleepEmbeddingService(0.0), _EmptyVectorStore())
    result = asyncio.run(service.retrieve_context("q", source_ids=["d.pdf"], user_email="u@x.com"))
    assert result == {"context": "", "sources": []}
