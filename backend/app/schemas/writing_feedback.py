from typing import Literal

from pydantic import BaseModel, Field


class WritingFeedbackRequest(BaseModel):
    text: str = Field(min_length=1)


class FeedbackIssue(BaseModel):
    original: str
    suggestion: str
    type: Literal["grammar", "spelling", "style", "clarity", "word-choice"]
    explanation: str


class WritingFeedbackResult(BaseModel):
    issues: list[FeedbackIssue]
    overall_score: int
    summary: str
    word_count: int
