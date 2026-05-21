from fastapi import (
    APIRouter,
    UploadFile,
    File,
)

import os

from services.rag_service import (
    process_pdf
)

router = APIRouter()

UPLOADS_DIR = "uploads"

os.makedirs(
    UPLOADS_DIR,
    exist_ok=True
)

@router.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...)
):

    filepath = os.path.join(
        UPLOADS_DIR,
        file.filename
    )

    with open(
        filepath,
        "wb"
    ) as f:

        f.write(
            await file.read()
        )

    process_pdf(
        file.filename
    )

    return {
        "message":
        "PDF uploaded successfully"
    }