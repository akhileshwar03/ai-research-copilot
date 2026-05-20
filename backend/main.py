from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from fastapi.staticfiles import StaticFiles

from routes.chat import router as chat_router
from routes.upload import router as upload_router
from routes.documents import router as documents_router

import os

app = FastAPI()

# =========================
# Create Required Directories
# =========================

os.makedirs(
    "uploads",
    exist_ok=True
)

os.makedirs(
    "chroma_db",
    exist_ok=True
)

# =========================
# CORS
# =========================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# Static Files
# =========================

app.mount(
    "/uploads",
    StaticFiles(
        directory="uploads"
    ),
    name="uploads",
)

# =========================
# Routers
# =========================

app.include_router(chat_router)
app.include_router(upload_router)
app.include_router(documents_router)

# =========================
# Root
# =========================

@app.get("/")
async def root():

    return {
        "message":
        "AI Research Copilot API"
    }