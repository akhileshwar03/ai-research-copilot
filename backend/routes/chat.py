from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from langchain_openai import ChatOpenAI

from dotenv import load_dotenv

from pypdf import PdfReader

import os

load_dotenv()

router = APIRouter()

UPLOADS_DIR = "uploads"

llm = ChatOpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    model="gpt-3.5-turbo",
    temperature=0.3,
    streaming=True,
)

SYSTEM_PROMPT = """
You are AI Research Copilot.

You are an intelligent AI assistant.

You must:
- answer every user question
- never ignore questions
- never return empty responses
- help with coding, AI, research, engineering, debugging, learning, and explanations
- use provided document context when available
- respond conversationally
- use markdown formatting when useful

If a question is unclear:
ask for clarification.
"""

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: list[Message]
    document_id: str | None = None

def extract_pdf_text(
    filename: str
):

    try:

        filepath = os.path.join(
            UPLOADS_DIR,
            filename
        )

        reader = PdfReader(
            filepath
        )

        text = ""

        for page in reader.pages:

            extracted = (
                page.extract_text()
            )

            if extracted:

                text += extracted

        return text[:12000]

    except Exception as e:

        return (
            f"Failed to read PDF: {str(e)}"
        )

@router.post("/chat")
async def chat(
    request: ChatRequest
):

    async def stream():

        try:

            formatted_messages = [

                (
                    "system",
                    SYSTEM_PROMPT
                )

            ]

            if request.document_id:

                document_text = (
                    extract_pdf_text(
                        request.document_id
                    )
                )

                formatted_messages.append(

                    (
                        "system",

                        f"""
DOCUMENT CONTEXT:

Filename:
{request.document_id}

Document Content:
{document_text}
"""
                    )

                )

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

            streamed_anything = False

            async for chunk in response:

                if (
                    chunk.content
                    and
                    chunk.content.strip()
                ):

                    streamed_anything = True

                    yield chunk.content

            if not streamed_anything:

                yield (
                    "I apologize. "
                    "Please ask again."
                )

        except Exception as e:

            yield (
                f"\n\nError: {str(e)}"
            )

    return StreamingResponse(
        stream(),
        media_type="text/plain",
    )