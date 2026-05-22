from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from fastapi.staticfiles import StaticFiles

from routes.chat import router as chat_router
from routes.upload import router as upload_router
from routes.documents import router as documents_router
from routes.auth import (
    router as auth_router
)
from db.database import (
    Base,
    engine,
)
from routes.sessions import (
    router as sessions_router
)
import os

app = FastAPI()
app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
)
app.include_router(
    sessions_router
)
# Create Required Directories

os.makedirs(
    "uploads",
    exist_ok=True
)

os.makedirs(
    "chroma_db",
    exist_ok=True
)

# CORS

app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://ai-research-copilot-kappa.vercel.app",

        "https://ai-research-copilot-cakmrykjx-akhileshwar03s-projects.vercel.app",
    ],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
)

# Static Files

app.mount(
    "/uploads",
    StaticFiles(
        directory="uploads"
    ),
    name="uploads",
)

# Routers

app.include_router(chat_router)
app.include_router(upload_router)
app.include_router(documents_router)
app.include_router(
    auth_router
)

# Root

@app.get("/")
async def root():

    return {
        "message":
        "AI Research Copilot API"
    }

from db.database import (
    Base,
    engine,
)

from models.user import User

from models.chat_models import (
    ChatSession,
    ChatMessage,
)

Base.metadata.create_all(
    bind=engine
)