import httpx
from langchain_openai import ChatOpenAI
from openai import OpenAI

from app.core.config import get_settings


class AIService:
    def __init__(self):
        settings = get_settings()
        self.settings = settings
        self.llm = ChatOpenAI(
            api_key=settings.openai_api_key,
            model=settings.openai_chat_model,
            temperature=0.3,
            streaming=True,
        )
        self.client = OpenAI(
            api_key=settings.openai_api_key,
            http_client=httpx.Client(timeout=settings.openai_healthcheck_timeout_seconds),
        )

    async def stream_chat(self, messages: list[tuple[str, str]]):
        response = self.llm.astream(messages)
        async for chunk in response:
            if chunk.content:
                yield chunk.content

    def ping(self) -> bool:
        if not self.settings.openai_api_key:
            return False
        self.client.models.list()
        return True
