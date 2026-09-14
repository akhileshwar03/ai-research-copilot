"""Shared "rich input" text extraction — pulling text from a URL or an
image — used by both the Humanizer and the AI Checker so neither has to
special-case where its input text came from.

Image extraction deliberately uses the chat model's own vision capability
rather than a local OCR binary (e.g. pytesseract/tesseract): this app
deploys to Render's plain Python runtime, which has no system-package
install step, so a binary dependency would work in local dev and silently
fail in production. A vision API call needs nothing beyond the OpenAI
credentials already configured everywhere else in this service.
"""

import base64
import ipaddress
import logging
import re
import socket
from urllib.parse import urlsplit

import httpx
from bs4 import BeautifulSoup

from app.core.exceptions import AppError
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)

_MAX_URL_LENGTH = 2000
_MAX_EXTRACTED_CHARS = 50000
_FETCH_TIMEOUT_SECONDS = 10.0
_MAX_REDIRECTS = 5

_IMAGE_OCR_PROMPT = """Transcribe ALL readable text from this image, verbatim, exactly as it \
appears — preserve line breaks and reading order. Do not summarize, describe the image, or add \
any commentary of your own. If there is no readable text in the image, respond with exactly: \
NO_TEXT_FOUND"""


def _assert_public_host(url: str) -> None:
    """Block SSRF: refuse to fetch a URL whose host resolves to a private, loopback,
    link-local (this covers the 169.254.169.254 cloud metadata endpoint), or otherwise
    non-public address. Re-checked on every redirect hop, not just the initial URL, so a
    public host that 302s to an internal address (or DNS-rebinds between check and
    connect) can't slip through — this is why redirects are followed manually below
    instead of via httpx's follow_redirects, which would only ever see the first URL."""
    host = urlsplit(url).hostname
    if not host:
        raise AppError(code="INVALID_URL", message="Enter a valid URL", status_code=400)
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise AppError(code="URL_FETCH_FAILED", message="Couldn't resolve that URL's host.", status_code=422)
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            logger.warning("url_import_blocked_private_ip host=%s ip=%s", host, ip)
            raise AppError(
                code="URL_FETCH_FAILED",
                message="Couldn't fetch that URL. Check it's correct and publicly accessible.",
                status_code=422,
            )


async def extract_text_from_url(url: str) -> str:
    url = url.strip()
    if not url or len(url) > _MAX_URL_LENGTH:
        raise AppError(code="INVALID_URL", message="Enter a valid URL", status_code=400)
    if not re.match(r"^https?://", url, re.IGNORECASE):
        url = f"https://{url}"

    try:
        async with httpx.AsyncClient(timeout=_FETCH_TIMEOUT_SECONDS, follow_redirects=False) as client:
            for _ in range(_MAX_REDIRECTS + 1):
                _assert_public_host(url)
                response = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (compatible; QuerexBot/1.0)"})
                if response.is_redirect:
                    next_url = response.headers.get("location")
                    if not next_url:
                        break
                    url = str(httpx.URL(url).join(next_url))
                    continue
                response.raise_for_status()
                break
            else:
                raise AppError(code="URL_FETCH_FAILED", message="Too many redirects.", status_code=422)
    except AppError:
        raise
    except Exception:
        logger.warning("url_import_fetch_failed url_len=%d", len(url), exc_info=True)
        raise AppError(
            code="URL_FETCH_FAILED",
            message="Couldn't fetch that URL. Check it's correct and publicly accessible.",
            status_code=422,
        )

    content_type = response.headers.get("content-type", "")
    if "html" not in content_type:
        raise AppError(code="UNSUPPORTED_CONTENT", message="That URL isn't an HTML page", status_code=422)

    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript", "svg"]):
        tag.decompose()

    text = " ".join(soup.get_text(separator=" ").split())
    if not text:
        raise AppError(code="NO_TEXT_EXTRACTED", message="No readable text found on that page", status_code=422)
    return text[:_MAX_EXTRACTED_CHARS]


async def extract_text_from_image(image_bytes: bytes, mime_type: str, ai_service: AIService) -> str:
    b64 = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{mime_type};base64,{b64}"

    try:
        text = await ai_service.describe_image(_IMAGE_OCR_PROMPT, data_url)
    except Exception:
        logger.warning("image_ocr_failed", exc_info=True)
        raise AppError(
            code="IMAGE_OCR_FAILED",
            message="Couldn't read text from that image. Please try again.",
            status_code=503,
        )

    stripped = (text or "").strip()
    if not stripped or stripped == "NO_TEXT_FOUND":
        raise AppError(code="NO_TEXT_EXTRACTED", message="No readable text found in that image", status_code=422)
    return stripped[:_MAX_EXTRACTED_CHARS]
