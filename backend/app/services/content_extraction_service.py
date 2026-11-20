"""Shared "rich input" text extraction — pulling text from a URL, an
image or a PDF — used by both the Humanizer and the AI Checker so neither has to
special-case where its input text came from.

Image extraction deliberately uses the chat model's own vision capability
rather than a local OCR binary (e.g. pytesseract/tesseract): this app
deploys to Render's plain Python runtime, which has no system-package
install step, so a binary dependency would work in local dev and silently
fail in production. A vision API call needs nothing beyond the OpenAI
credentials already configured everywhere else in this service.
"""

import base64
import io
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


def _resolve_validated_ip(host: str) -> str:
    """Block SSRF: resolve *host* and return a single IP literal that is public — never
    private, loopback, link-local (this covers the 169.254.169.254 cloud metadata
    endpoint), or otherwise non-global. Resolving once here and connecting to that exact
    IP literal (below), instead of letting httpx resolve *host* again when it opens the
    socket, is what the redirect-recheck alone can't close: a hostname can be made to
    resolve to a public IP for this lookup and a private one a moment later for the
    connect (DNS rebinding) — a second, independent lookup is exactly the gap that lets
    through. Returning one pinned IP and connecting to it directly removes that second
    lookup instead of merely re-running the same race."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise AppError(code="URL_FETCH_FAILED", message="Couldn't resolve that URL's host.", status_code=422)
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_global and not ip.is_multicast:
            return str(ip)
    logger.warning("url_import_blocked_private_ip host=%s", host)
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
                parsed = urlsplit(url)
                host = parsed.hostname
                if not host:
                    raise AppError(code="INVALID_URL", message="Enter a valid URL", status_code=400)
                ip = _resolve_validated_ip(host)
                ip_literal = f"[{ip}]" if ":" in ip else ip
                port_suffix = f":{parsed.port}" if parsed.port else ""
                # Connect to the validated IP literal directly — not *host* — so the TLS/TCP
                # layer never re-resolves the hostname. `sni_hostname` keeps the TLS SNI and
                # certificate-hostname check (and the Host header keeps virtual hosting) on the
                # real hostname, so this is transparent to the server on the other end.
                connect_url = parsed._replace(netloc=f"{ip_literal}{port_suffix}").geturl()
                response = await client.get(
                    connect_url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; QuerexBot/1.0)", "Host": host},
                    extensions={"sni_hostname": host},
                )
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


_PARAGRAPH_BREAK = re.compile(r"\n\s*\n+")
_HYPHENATED_LINE_END = re.compile(r"(?<=[A-Za-z])-\n(?=[a-z])")
_SENTENCE_END = re.compile(r"""[.!?]["')\]]*$""")


def _unwrap_pdf_lines(text: str) -> str:
    """PDF text comes out hard-wrapped, one line break per printed line. Rejoin the lines of a paragraph (and mend
    words hyphenated across lines) so the text reads as prose; a line that ends a sentence keeps its break."""
    text = _HYPHENATED_LINE_END.sub("", text)
    paragraphs = []
    for block in _PARAGRAPH_BREAK.split(text):
        out = ""
        for line in (ln.strip() for ln in block.split("\n")):
            if not line:
                continue
            if out:
                out += "\n" if _SENTENCE_END.search(out) else " "
            out += line
        if out:
            paragraphs.append(re.sub(r"[ \t]+", " ", out))
    return "\n\n".join(paragraphs)


def extract_text_from_pdf(content: bytes) -> str:
    """The selectable text of a PDF (no OCR), cleaned up to read as prose. Synchronous and CPU-bound: call it from a
    worker thread. A corrupt file or a scan with no text is a clean 422, never a 500."""
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(content))
        raw = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:  # pypdf raises a wide family (PdfStreamError, KeyError, RecursionError, ...)
        raise AppError(code="UNREADABLE_PDF", message="Could not read this PDF file", status_code=422) from exc

    text = _unwrap_pdf_lines(raw).strip()
    if not text:
        raise AppError(
            code="NO_TEXT_EXTRACTED",
            message="This document has no extractable text (it may be a scanned image). OCR isn't supported yet",
            status_code=422,
        )
    return text[:_MAX_EXTRACTED_CHARS]
