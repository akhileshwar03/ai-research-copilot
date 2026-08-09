from pydantic import BaseModel, Field


class UrlExtractRequest(BaseModel):
    url: str = Field(min_length=1)


class ExtractedText(BaseModel):
    text: str
