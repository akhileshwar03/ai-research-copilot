from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from models.chat_models import ChatRequest
from services.openai_service import generate_streaming_response
from services.rag_service import retrieve_context

router = APIRouter()


@router.post("/chat")
def chat(request: ChatRequest):

    latest_user_message = (
        request.messages[-1].content
    )

    retrieved_context = retrieve_context(
        latest_user_message
    )

    formatted_messages = [
        {
            "role": "system",
            "content": f"""
You are an advanced AI research assistant.

Use the following retrieved context
to answer the user's question.

Retrieved Context:
{retrieved_context}
"""
        }
    ]

    formatted_messages.extend([
        {
            "role": msg.role,
            "content": msg.content
        }
        for msg in request.messages
    ])

    return StreamingResponse(
        generate_streaming_response(
            formatted_messages
        ),
        media_type="text/plain"
    )