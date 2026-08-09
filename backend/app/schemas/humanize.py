from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class HumanizeRequest(BaseModel):
    text: str = Field(min_length=1)
    style: Literal["normal", "clear_structured", "simple_formal"] = "normal"
    expand: bool = False


class HumanizeRunCreate(BaseModel):
    input_text: str = Field(min_length=1)
    output_text: str = Field(min_length=1)
    style: Literal["normal", "clear_structured", "simple_formal"] = "normal"


class HumanizeRunSummary(BaseModel):
    id: int
    input_text: str
    output_text: str
    style: str
    created_at: datetime


class HumanizeRunListResponse(BaseModel):
    runs: list[HumanizeRunSummary]
    total: int
    skip: int
    limit: int
