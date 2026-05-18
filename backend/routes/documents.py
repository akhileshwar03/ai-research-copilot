from fastapi import APIRouter
import os

router = APIRouter()

UPLOAD_DIR = "uploads"

@router.get("/documents")
def list_documents():

    documents = os.listdir(
        UPLOAD_DIR
    )

    return {
        "documents": documents
    }