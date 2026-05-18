from fastapi import APIRouter, UploadFile, File
import shutil

from services.rag_service import ingest_pdf

router = APIRouter()

UPLOAD_DIR = "uploads"

@router.post("/upload")

async def upload_pdf(
    file: UploadFile = File(...)
):

    file_path = f"{UPLOAD_DIR}/{file.filename}"

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(
            file.file,
            buffer
        )

    ingest_pdf(file_path)

    return {
        "message": "PDF uploaded successfully"
    }