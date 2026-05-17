from fastapi import APIRouter

from models.chat_models import ChatRequest
from services.openai_service import generate_chat_response

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

    ai_response = generate_chat_response(
        formatted_messages
    )

    return {
        "response": ai_response
    }