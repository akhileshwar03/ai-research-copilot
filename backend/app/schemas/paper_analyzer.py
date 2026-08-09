from typing import Literal

from pydantic import BaseModel

CheckStatus = Literal["pass", "warning", "fail"]


class FormattingCheck(BaseModel):
    id: str
    label: str
    status: CheckStatus
    score: float
    measured: str
    expected: str
    explanation: str


class PaperAnalysisResult(BaseModel):
    style_guide: str
    overall_score: float
    page_count: int
    checks: list[FormattingCheck]
    disclaimer: str
