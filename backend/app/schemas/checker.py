from typing import Literal

from pydantic import BaseModel, Field


class CheckTextRequest(BaseModel):
    text: str = Field(min_length=1)


class SentenceScore(BaseModel):
    text: str
    ai_score: float | None
    label: Literal["human", "unsure", "ai"]


class CheckResult(BaseModel):
    # The three-way answer every client understands: kept so an app that has not learned `level` keeps working.
    verdict: Literal["likely_human", "uncertain", "likely_ai"]
    # The finer six-way answer, set when the server runs the pv10 model; null with the older model.
    level: Literal["human", "likely_human", "unsure", "mixed", "likely_ai", "ai"] | None = None
    # For "unsure" and "mixed": which way the model leans. Null otherwise.
    lean: Literal["human", "ai"] | None = None
    # Probability the model puts on "not purely human" (AI-written, AI-edited or mixed), 0-1.
    ai_score: float
    # Share of that probability the model assigns to mixed human + AI text.
    mixed_probability: float
    word_count: int
    sentences: list[SentenceScore]
    disclaimer: str
