"""Uploads are bounded while being read, and the BYTES must match the claimed type.

2026-10-14 security review. Before: every upload route did `await file.read()` (the whole body into
memory) and only THEN compared its size to the limit, and trusted the file name / declared
content-type without looking at the contents.
"""

import asyncio
import io

import pytest
from fastapi import UploadFile

from app.core.exceptions import AppError
from app.core.uploads import is_pdf, read_upload_limited, require_image_matching, require_pdf


def _upload(data: bytes) -> UploadFile:
    return UploadFile(file=io.BytesIO(data), filename="x.pdf")


class _CountingFile:
    """Records how many bytes were actually pulled out of it."""

    def __init__(self, total: int):
        self.remaining, self.pulled = total, 0

    async def read(self, size: int = -1) -> bytes:
        n = self.remaining if size < 0 else min(size, self.remaining)
        self.remaining -= n
        self.pulled += n
        return b"x" * n


def test_oversized_upload_is_refused_without_reading_the_whole_body():
    big = _CountingFile(500 * 1024 * 1024)  # a 500 MB body against a 2 MB limit
    with pytest.raises(AppError) as exc:
        asyncio.run(read_upload_limited(big, 2 * 1024 * 1024, "too big"))
    assert exc.value.status_code == 413
    assert big.pulled <= 3 * 1024 * 1024  # stopped right after the limit, did NOT buffer 500 MB


def test_upload_within_the_limit_is_returned_intact():
    data = b"%PDF-1.4 hello" * 1000
    assert asyncio.run(read_upload_limited(_upload(data), 10 * 1024 * 1024, "too big")) == data


def test_upload_exactly_at_the_limit_is_allowed():
    assert len(asyncio.run(read_upload_limited(_upload(b"a" * 1024), 1024, "too big"))) == 1024


def test_a_file_merely_named_pdf_is_rejected():
    with pytest.raises(AppError) as exc:
        require_pdf(b"<html><script>alert(1)</script></html>")
    assert exc.value.status_code == 400 and exc.value.code == "INVALID_FILE_TYPE"


def test_real_pdf_headers_are_accepted_including_after_leading_junk():
    assert is_pdf(b"%PDF-1.7\n...")
    assert is_pdf(b"\xef\xbb\xbf  junk before the header\n%PDF-1.4\n...")  # allowed by the PDF spec
    assert not is_pdf(b"x" * 2000 + b"%PDF-1.4")  # header beyond the first 1024 bytes


@pytest.mark.parametrize(
    "content,ctype",
    [
        (b"\x89PNG\r\n\x1a\nrest", "image/png"),
        (b"\xff\xd8\xff\xe0rest", "image/jpeg"),
        (b"RIFF\x00\x00\x00\x00WEBPrest", "image/webp"),
    ],
)
def test_images_whose_bytes_match_their_declared_type_pass(content, ctype):
    require_image_matching(content, ctype)


@pytest.mark.parametrize(
    "content,ctype",
    [
        (b"<?php system($_GET['c']); ?>", "image/png"),  # script labelled as an image
        (b"\x89PNG\r\n\x1a\nrest", "image/jpeg"),  # a real PNG claiming to be a JPEG
        (b"RIFF\x00\x00\x00\x00WAVErest", "image/webp"),  # RIFF but not WEBP
    ],
)
def test_images_whose_bytes_contradict_their_declared_type_are_rejected(content, ctype):
    with pytest.raises(AppError) as exc:
        require_image_matching(content, ctype)
    assert exc.value.status_code == 400


# ── through the real routes ────────────────────────────────────────────────────────────────────

_NOT_A_PDF = b"<html><body>definitely not a pdf</body></html>"


@pytest.mark.parametrize(
    "path,extra",
    [("/api/v1/checker/document", {}), ("/api/v1/paper-analyzer/analyze", {"style": "apa"})],
)
def test_routes_reject_a_non_pdf_named_dot_pdf(client, auth_headers, path, extra):
    resp = client.post(path, files={"file": ("evil.pdf", _NOT_A_PDF, "application/pdf")}, data=extra, headers=auth_headers)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_FILE_TYPE"


def test_extract_image_route_rejects_script_labelled_as_png(client, auth_headers):
    resp = client.post(
        "/api/v1/extract/image",
        files={"file": ("x.png", b"<?php echo 1; ?>", "image/png")},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_FILE_TYPE"
