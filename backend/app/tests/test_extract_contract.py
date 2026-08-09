"""HTTP-level contract tests for /extract/* — auth gating, validation, and
response shape. URL-fetch logic is unit-tested in
test_content_extraction_service.py with a fake httpx client; here we only
need to prove the route wiring, so the success-path test patches httpx the
same way.
"""

import app.services.content_extraction_service as extraction_module


class _FakeResponse:
    def __init__(self, text="", headers=None, status_code=200):
        self.text = text
        self.headers = headers or {}
        self.status_code = status_code

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
        files={"file": ("test.png", b"fake-png-bytes", "image/png")},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["text"] == "extracted text from fake vision call"
