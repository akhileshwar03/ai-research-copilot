"""Pins rerank_llm's max_tokens headroom. A real production-shaped rerank call (pool of 20,
real passages) measured hitting openai.LengthFinishReasonError at the old max_tokens=200 -- cut
off mid-JSON before listing all 20 ranked indices -- in 1 of 525 real calls during a 2026-09-28
retrieval-accuracy eval. RetrievalService._rerank already falls back to plain distance order on
any failure, so this was silent, but it's still a real, avoidable quality loss worth guarding
against a future accidental regression back down."""

from app.services.ai_service import AIService


def test_rerank_llm_has_headroom_above_the_measured_failure_point():
    ai = AIService()
    assert ai.rerank_llm.max_tokens is not None and ai.rerank_llm.max_tokens >= 400
