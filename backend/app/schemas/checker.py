from typing import Literal

from pydantic import BaseModel, Field


class CheckTextRequest(BaseModel):
    text: str = Field(min_length=1)


class SentenceScore(BaseModel):
    text: str
    ai_score: float | None
    flagged: bool


class CheckResult(BaseModel):
    verdict: Literal["likely_human", "uncertain", "likely_ai"]
    # Probability the model puts on "not purely human" (AI-written, AI-edited or mixed), 0-1.
    ai_score: float
    # Share of that probability the model assigns to mixed human + AI text.
    mixed_probability: float
    word_count: int
    sentences: list[SentenceScore]
    disclaimer: str
