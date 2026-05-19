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

@router.delete("/documents/{filename}")
def delete_document(
    filename: str
):

    file_path = os.path.join(
        UPLOAD_DIR,
        filename
    )

    if os.path.exists(file_path):

        os.remove(file_path)

        return {
            "message":
            "Document deleted"
        }

    return {
        "message":
        "Document not found"
    }