"""Safe handling of user-uploaded files (2026-10-14 security review).

Two gaps existed on every upload route: the whole body was read into memory BEFORE the size limit
was checked (so a signed-in user could send a huge file and strain the server before being
refused), and only the file *name* / declared content-type was trusted — never the bytes.
"""

from fastapi import UploadFile

from app.core.exceptions import AppError

_CHUNK_BYTES = 1024 * 1024


async def read_upload_limited(file: UploadFile, max_bytes: int, too_large_message: str) -> bytes:
    """Read an upload in 1 MB pieces and refuse (413) the moment it passes max_bytes, instead of
    buffering an arbitrarily large body first and measuring it afterwards."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(_CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise AppError(code="FILE_TOO_LARGE", message=too_large_message, status_code=413)
        chunks.append(chunk)
    return b"".join(chunks)


def is_pdf(content: bytes) -> bool:
    """True if the bytes actually start like a PDF. The spec lets the %PDF- header sit anywhere in
    the first 1024 bytes, so that's what is checked, not just offset 0."""
    return b"%PDF-" in content[:1024]


def require_pdf(content: bytes) -> None:
    if not is_pdf(content):
        raise AppError(code="INVALID_FILE_TYPE", message="That file isn't a valid PDF", status_code=400)


# Leading bytes of the image types the extract route accepts.
_IMAGE_SIGNATURES = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/webp": (b"RIFF",),  # plus "WEBP" at offset 8, checked below
}


def require_image_matching(content: bytes, content_type: str) -> None:
    """The declared content-type is just a client-supplied header; confirm the bytes agree."""
    ok = any(content.startswith(sig) for sig in _IMAGE_SIGNATURES.get(content_type, ()))
    if ok and content_type == "image/webp":
        ok = content[8:12] == b"WEBP"
    if not ok:
        raise AppError(code="INVALID_FILE_TYPE", message="That file isn't a valid image of that type", status_code=400)
