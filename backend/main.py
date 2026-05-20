from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routes.chat import router as chat_router
from routes.upload import router as upload_router
from routes.documents import (
    router as documents_router
)

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static uploads
app.mount(
    "/uploads",
    StaticFiles(directory="uploads"),
    name="uploads",
)

# Routes
app.include_router(chat_router)
app.include_router(upload_router)
app.include_router(documents_router)
@app.get("/")
async def root():

    return {
        "message":
        "AI Research Copilot Backend Running"
    }