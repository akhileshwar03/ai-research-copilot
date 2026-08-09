from pydantic import BaseModel, Field


class CheckTextRequest(BaseModel):
    text: str = Field(min_length=1)
    advanced: bool = False


class CheckSignals(BaseModel):
    burstiness: float
    lexical_diversity: float
    ai_phrase_hits: int
    heuristic_score: float
    llm_probability: float | None


class ParagraphScore(BaseModel):
    text: str
    ai_probability: float
    verdict: str


class CheckResult(BaseModel):
    ai_probability: float
    verdict: str
    confidence: str
    signals: CheckSignals
    ai_sentences: list[str] = []
    paragraphs: list[ParagraphScore] = []
    explanation: str
    disclaimer: str
