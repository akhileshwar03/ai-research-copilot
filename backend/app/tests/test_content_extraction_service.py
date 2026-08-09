import asyncio

import httpx
import pytest

import app.services.content_extraction_service as extraction_module
from app.core.exceptions import AppError
from app.services.content_extraction_service import extract_text_from_image, extract_text_from_url


def _run(coro):
    return asyncio.run(coro)


class _FakeResponse:
    def __init__(self, text="", headers=None, status_code=200):
        self.text = text
        self.headers = headers or {}
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=self)


class _FakeAsyncClient:
    def __init__(self, response=None, exc=None):
        self._response = response
        self._exc = exc

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, headers=None):
        if self._exc:
            raise self._exc
        return self._response


def _patch_client(monkeypatch, response=None, exc=None):
    monkeypatch.setattr(
        extraction_module.httpx,
        "AsyncClient",
        lambda **kwargs: _FakeAsyncClient(response=response, exc=exc),
    )


HTML_PAGE = """
<html><head><style>.x{}</style><script>evil()</script></head>
<body><nav>Home</nav><header>Top</header>
<main><p>This is the real article content that matters.</p></main>
<footer>Copyright</footer></body></html>
"""


def test_extract_text_from_url_strips_boilerplate(monkeypatch):
    _patch_client(monkeypatch, response=_FakeResponse(text=HTML_PAGE, headers={"content-type": "text/html"}))

    text = _run(extract_text_from_url("https://example.com/article"))

    assert "This is the real article content that matters." in text
    assert "Home" not in text
    assert "Copyright" not in text
    assert "evil()" not in text


def test_extract_text_from_url_adds_scheme_if_missing(monkeypatch):
    captured = {}

    class _CapturingClient(_FakeAsyncClient):
        async def get(self, url, headers=None):
            captured["url"] = url
            return self._response

    monkeypatch.setattr(
        extraction_module.httpx,
        "AsyncClient",
        lambda **kwargs: _CapturingClient(response=_FakeResponse(text=HTML_PAGE, headers={"content-type": "text/html"})),
    )

    _run(extract_text_from_url("example.com/article"))
    assert captured["url"] == "https://example.com/article"


def test_extract_text_from_url_rejects_empty():
    with pytest.raises(AppError) as exc_info:
        _run(extract_text_from_url("   "))
    assert exc_info.value.code == "INVALID_URL"


def test_extract_text_from_url_rejects_non_html(monkeypatch):
    _patch_client(monkeypatch, response=_FakeResponse(text="{}", headers={"content-type": "application/json"}))
    with pytest.raises(AppError) as exc_info:
        _run(extract_text_from_url("https://example.com/api"))
    assert exc_info.value.code == "UNSUPPORTED_CONTENT"


def test_extract_text_from_url_rejects_page_with_no_text(monkeypatch):
    _patch_client(monkeypatch, response=_FakeResponse(text="<html><body></body></html>", headers={"content-type": "text/html"}))
    with pytest.raises(AppError) as exc_info:
        _run(extract_text_from_url("https://example.com/blank"))
    assert exc_info.value.code == "NO_TEXT_EXTRACTED"


def test_extract_text_from_url_raises_on_fetch_failure(monkeypatch):
    _patch_client(monkeypatch, exc=httpx.ConnectError("boom"))
    with pytest.raises(AppError) as exc_info:
        _run(extract_text_from_url("https://example.com/down"))
    assert exc_info.value.code == "URL_FETCH_FAILED"


class _FakeAIService:
    def __init__(self, response: str | Exception):
        self.response = response

    async def describe_image(self, prompt, data_url):
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def test_extract_text_from_image_returns_transcribed_text():
    service = _FakeAIService("Hello from the image")
    text = _run(extract_text_from_image(b"fake-bytes", "image/png", service))
    assert text == "Hello from the image"


def test_extract_text_from_image_raises_when_no_text_found():
    service = _FakeAIService("NO_TEXT_FOUND")
    with pytest.raises(AppError) as exc_info:
        _run(extract_text_from_image(b"fake-bytes", "image/png", service))
    assert exc_info.value.code == "NO_TEXT_EXTRACTED"


def test_extract_text_from_image_raises_when_model_call_fails():
    service = _FakeAIService(RuntimeError("vision call failed"))
    with pytest.raises(AppError) as exc_info:
        _run(extract_text_from_image(b"fake-bytes", "image/png", service))
    assert exc_info.value.code == "IMAGE_OCR_FAILED"
