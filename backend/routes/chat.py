from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from langchain_openai import ChatOpenAI

from core.config import (
    OPENAI_API_KEY
)

from services.rag_service import (
    retrieve_context
)

router = APIRouter()

llm = ChatOpenAI(
    api_key=OPENAI_API_KEY,
    model="gpt-3.5-turbo",
    temperature=0.3,
    streaming=True,
)

SYSTEM_PROMPT = """
You are AI Research Copilot.

You are an intelligent AI assistant.

Use retrieved document context
when available.

If the answer exists in the
document context, prioritize it.

Do not hallucinate missing facts.

If information is unavailable,
say clearly that the document
does not contain the answer.

Answer clearly and accurately.
"""

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: list[Message]
    document_id: str | None = None

@router.post("/chat")
async def chat(
    request: ChatRequest
):

    async def stream():

        try:

            latest_user_message = ""

            for msg in reversed(
                request.messages
            ):

                if (
                    msg.role == "user"
                ):

                    latest_user_message = (
                        msg.content
                    )

                    break

            context = ""
            sources = []

            if request.document_id:

                retrieval = retrieve_context(
                    latest_user_message,
                    request.document_id
                )

                context = retrieval["context"]

                sources = retrieval["sources"]
            else:
                retrieval = retrieve_context(
                    latest_user_message
                )

                context = retrieval["context"]

                sources = retrieval["sources"]

            formatted_messages = [

                (
                    "system",

                    f"""
{SYSTEM_PROMPT}

DOCUMENT CONTEXT:
{context}
"""
                )

            ]

            formatted_messages.extend(

                [
                    (
                        msg.role,
                        msg.content
                    )
                    for msg in request.messages
                ]

            )

            response = llm.astream(
                formatted_messages
            )

            async for chunk in response:

                if (
                    chunk.content
                ):

                    yield chunk.content

        except Exception as e:

            yield (
                f"\n\nError: {str(e)}"
            )

    return StreamingResponse(
        stream(),
        media_type="text/plain",
        headers={
            "X-Sources": ""
        }
    )