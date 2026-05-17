from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from models.chat_models import ChatRequest
from services.openai_service import generate_streaming_response

router = APIRouter()

@router.post("/chat")
def chat(request: ChatRequest):

    formatted_messages = [
        {
            "role": msg.role,
            "content": msg.content
        }
        for msg in request.messages
    ]

    return StreamingResponse(
        generate_streaming_response(formatted_messages),
        media_type="text/plain"
    )