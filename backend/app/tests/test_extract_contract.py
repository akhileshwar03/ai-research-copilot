"""HTTP-level contract tests for /extract/* — auth gating, validation, and
response shape. URL-fetch logic is unit-tested in
test_content_extraction_service.py with a fake httpx client; here we only
need to prove the route wiring, so the success-path test patches httpx the
same way.
"""

import io

import pytest

import app.services.content_extraction_service as extraction_module
from app.services.content_extraction_service import _unwrap_pdf_lines


class _FakeResponse:
    def __init__(self, text="", headers=None, status_code=200):
        self.text = text
        self.headers = headers or {}
        self.status_code = status_code
        self.is_redirect = False

    def raise_for_status(self):
        pass


class _FakeAsyncClient:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, headers=None):
        return self._response


def test_extract_url_requires_auth(client):
    resp = client.post("/api/v1/extract/url", json={"url": "https://example.com"})
    assert resp.status_code == 401


def test_extract_url_rejects_empty_body(client, auth_headers):
    resp = client.post("/api/v1/extract/url", json={"url": ""}, headers=auth_headers)
    assert resp.status_code == 422


def test_extract_url_success(client, auth_headers, monkeypatch):
    html = "<html><body><p>Real page content here.</p></body></html>"
    monkeypatch.setattr(
        extraction_module.httpx,
        "AsyncClient",
        lambda **kwargs: _FakeAsyncClient(_FakeResponse(text=html, headers={"content-type": "text/html"})),
    )
    resp = client.post("/api/v1/extract/url", json={"url": "https://example.com"}, headers=auth_headers)
    assert resp.status_code == 200
    assert "Real page content here." in resp.json()["text"]


def test_extract_image_requires_auth(client):
    resp = client.post("/api/v1/extract/image", files={"file": ("test.png", b"fake", "image/png")})
    assert resp.status_code == 401


def test_extract_image_rejects_non_image_type(client, auth_headers):
    resp = client.post(
        "/api/v1/extract/image",
        files={"file": ("test.txt", b"hello", "text/plain")},
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_extract_image_success(client, auth_headers):
    resp = client.post(
        "/api/v1/extract/image",
        files={"file": ("test.png", b"\x89PNG\r\n\x1a\n" + b"fake-png-body", "image/png")},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["text"] == "extracted text from fake vision call"


def _build_minimal_pdf(text: str) -> bytes:
    """Hand-built, dependency-free PDF with real extractable text (no
    reportlab/fpdf in this venv)."""
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    stream = f"BT /F1 18 Tf 72 700 Td ({text}) Tj ET".encode("latin-1")
    objects.append(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{i} 0 obj\n".encode())
        out.write(obj)
        out.write(b"\nendobj\n")
    xref_offset = out.tell()
    n = len(objects) + 1
    out.write(f"xref\n0 {n}\n".encode())
    out.write(b"0000000000 65535 f \n")
    for off in offsets:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {n} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode())
    return out.getvalue()


# ── /extract/pdf ─────────────────────────────────────────────────────────────


def test_extract_pdf_requires_auth(client):
    resp = client.post("/api/v1/extract/pdf", files={"file": ("a.pdf", _build_minimal_pdf("hello"), "application/pdf")})
    assert resp.status_code == 401


def test_extract_pdf_rejects_a_non_pdf_name(client, auth_headers):
    resp = client.post("/api/v1/extract/pdf", files={"file": ("notes.txt", b"hello", "text/plain")}, headers=auth_headers)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_FILE_TYPE"


def test_extract_pdf_returns_the_text_in_the_file(client, auth_headers):
    pdf = _build_minimal_pdf("This document contains real extractable text.")
    resp = client.post("/api/v1/extract/pdf", files={"file": ("doc.pdf", pdf, "application/pdf")}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"text": "This document contains real extractable text."}


def test_extract_pdf_with_no_text_is_a_clean_422(client, auth_headers):
    # A PDF with an empty content stream has nothing for pypdf to extract.
    resp = client.post("/api/v1/extract/pdf", files={"file": ("blank.pdf", _build_minimal_pdf(""), "application/pdf")}, headers=auth_headers)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "NO_TEXT_EXTRACTED"


# ── PDF line unwrapping: hard-wrapped lines must read as prose, not as one sentence per line ──


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("The quick brown fox\njumps over the lazy dog.", "The quick brown fox jumps over the lazy dog."),
        ("An exam-\nple of a hyphenated word\nacross lines.", "An example of a hyphenated word across lines."),
        ("First sentence ends here.\nSecond one starts here.", "First sentence ends here.\nSecond one starts here."),
        ("Paragraph one line one\nparagraph one line two.\n\nParagraph two.", "Paragraph one line one paragraph one line two.\n\nParagraph two."),
        ("A well-known\nresult", "A well-known result"),
    ],
)
def test_unwrap_pdf_lines(raw, expected):
    assert _unwrap_pdf_lines(raw) == expected
