import httpx
from langchain_core.messages import HumanMessage
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
        # Separate, near-deterministic client for classification/analysis tasks
        # (AI Checker, Writing Feedback, image OCR transcription) — these want a
        # stable, repeatable answer, not the creative variation that's correct
        # for the humanizer's rewriting. Sharing one temperature=0.3 client
        # across both caused the checker's displayed verdict to swing between
        # likely_human and likely_ai on identical input, run to run.
        self.classifier_llm = ChatOpenAI(
            api_key=settings.openai_api_key,
            model=settings.openai_chat_model,
            temperature=0,
        )
        self.client = OpenAI(
            api_key=settings.openai_api_key,
            http_client=httpx.Client(timeout=settings.openai_healthcheck_timeout_seconds),
        )

        # Humaniser pipeline — separate models from openai_chat_model so the
        # feature's model choice never drifts with the app-wide default used
        # by Checker/Chat/OCR. Rewrite (Pass 2) wants creative variation;
        # classify (Pass 1/3) wants a stable, repeatable read on the text.
        # Sampling params tuned for burstiness/perplexity, not just variety —
        # see the comment on humanizer_rewrite_model in config.py. Only viable
        # because this is now a classic chat-completions model; a reasoning
        # model (gpt-5-mini/nano) rejects all four of these with a 400.
        self.humanizer_rewrite_llm = ChatOpenAI(
            api_key=settings.openai_api_key,
            model=settings.humanizer_rewrite_model,
            temperature=settings.humanizer_rewrite_temperature,
            top_p=settings.humanizer_rewrite_top_p,
            frequency_penalty=settings.humanizer_rewrite_frequency_penalty,
            presence_penalty=settings.humanizer_rewrite_presence_penalty,
            streaming=True,
        )
        self.humanizer_classify_llm = ChatOpenAI(
            api_key=settings.openai_api_key,
            model=settings.humanizer_classify_model,
            temperature=0,
        )

    async def stream_chat(self, messages: list[tuple[str, str]]):
        response = self.llm.astream(messages)
        async for chunk in response:
            if chunk.content:
                yield chunk.content

    async def stream_humanize_rewrite(self, messages: list[tuple[str, str]]):
        """Streaming rewrite pass for the Humaniser pipeline, on
        humanizer_rewrite_model rather than the app-wide chat model."""
        response = self.humanizer_rewrite_llm.astream(messages)
        async for chunk in response:
            if chunk.content:
                yield chunk.content

    async def classify_humanize(self, messages: list[tuple[str, str]]) -> str:
        """Single non-streaming, near-deterministic completion for the
        Humaniser's analyze/verify passes, on humanizer_classify_model."""
        response = await self.humanizer_classify_llm.ainvoke(messages)
        return response.content

    async def rewrite_humanize_once(self, messages: list[tuple[str, str]]) -> str:
        """Single non-streaming rewrite call on humanizer_rewrite_model, used
        for the Pass 3 selective-paragraph retry — that one call needs to
        finish before the corrected paragraph can be spliced back in, so it
        can't stream token-by-token like the main Pass 2 rewrite."""
        response = await self.humanizer_rewrite_llm.ainvoke(messages)
        return response.content

    async def classify(self, messages: list[tuple[str, str]]) -> str:
        """Single non-streaming, near-deterministic completion for
        classification/analysis tasks (AI Checker, Writing Feedback) where a
        stable answer matters more than creative variation."""
        response = await self.classifier_llm.ainvoke(messages)
        return response.content

    async def describe_image(self, prompt: str, data_url: str, detail: str = "auto") -> str:
        """Single non-streaming vision completion — used for image text
        extraction (OCR via the model's own vision capability, no system
        binary or extra service dependency) and for describing diagrams/
        graphs found during PDF ingestion. Deterministic client: reading the
        same image should give the same answer every time.

        *detail* controls OpenAI's vision token budget: "low" is a small,
        fixed cost regardless of image size (good for a cost-bounded bulk
        operation like captioning every visual-candidate page in a PDF);
        "high"/"auto" cost more but preserve fine detail (kept as the OCR
        caller's default, since transcribing small print needs it).
        """
        message = HumanMessage(
            content=[
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_url, "detail": detail}},
            ]
        )
        response = await self.classifier_llm.ainvoke([message])
        return response.content

    def ping(self) -> bool:
        if not self.settings.openai_api_key:
            return False
        self.client.models.list()
        return True
