"""IngestionService.process_pdf:
1. Returns the PDF's real total page count (pypdf's len(reader.pages)), used
   to give the chat prompt a confirmed page count instead of a
   retrieval-derived lower bound (see chat_service.py and the
   Document.page_count migration).
2. Vision-captions pages that look like they contain a diagram/chart —
   an embedded image, or unusually little extractable text (vector-drawn
   charts have no embedded image object at all) — and stores each
   description as an extra searchable chunk. Deliberately NOT every page:
   only vision-candidate pages ever trigger a (costly) vision API call.
"""

import asyncio
import io

import pytest
from pypdf import PdfWriter

from app.modules.rag.ingestion_service import IngestionService


def _run(coro):
    return asyncio.run(coro)


class FakeEmbeddingService:
    def embed_documents(self, chunks):
        return [[0.0] for _ in chunks]


class FakeVectorStore:
    def __init__(self):
        self.added = None

    def add(self, ids, documents, embeddings, metadatas):
        self.added = {"ids": ids, "documents": documents, "metadatas": metadatas}


class FakeAIService:
    def __init__(self, response="A bar chart showing quarterly revenue growth."):
        self.calls: list[dict] = []
        self._response = response
        self._raise_on_call = None

    def raise_on_next_call(self, exc):
        self._raise_on_call = exc

    async def describe_image(self, prompt, data_url, detail="auto"):
        self.calls.append({"prompt": prompt, "detail": detail})
        if self._raise_on_call:
            exc, self._raise_on_call = self._raise_on_call, None
            raise exc
        return self._response


def _make_blank_pdf_bytes(num_pages: int) -> bytes:
    writer = PdfWriter()
    for _ in range(num_pages):
        writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _require_reportlab():
    try:
        from reportlab.pdfgen import canvas  # noqa: F401
    except ImportError:
        pytest.skip("reportlab not installed — this path is covered live instead")


def _text_heavy_pdf_bytes(num_pages: int = 1) -> bytes:
    _require_reportlab()
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(400, 400))
    # Well over the 40-word sparse-text threshold.
    sentence = "This paragraph contains many real words of genuine prose content for testing. "
    for _ in range(num_pages):
        y = 380
        for _ in range(6):
            c.drawString(20, y, sentence)
            y -= 20
        c.showPage()
    c.save()
    return buf.getvalue()


def _pdf_with_embedded_image_bytes() -> bytes:
    _require_reportlab()
    from PIL import Image
    from reportlab.pdfgen import canvas

    img_buf = io.BytesIO()
    Image.new("RGB", (50, 50), color="red").save(img_buf, format="PNG")
    img_buf.seek(0)

    from reportlab.lib.utils import ImageReader

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(200, 200))
    # A short caption plus the image — under the word threshold, but this
    # test specifically exercises the *embedded-image* detection path, not
    # the sparse-text fallback (both would trigger vision here; the point is
    # that image detection works at all).
    c.drawString(20, 180, "Fig 1")
    c.drawImage(ImageReader(img_buf), 20, 20, width=100, height=100)
    c.showPage()
    c.save()
    return buf.getvalue()


def _text_heavy_pdf_with_vector_chart_bytes() -> bytes:
    """The exact gap scenario: a page with plenty of real prose (so the
    sparse-text signal alone would miss it) that ALSO has a chart drawn with
    vector graphics primitives — axis lines, several bars, gridlines — not
    an embedded raster image, so pypdf's page.images detection would also
    miss it. Calibrated for real against pymupdf: this shape reliably scores
    16 drawing paths, well past _DRAWING_PATH_THRESHOLD (10)."""
    _require_reportlab()
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(400, 400))
    sentence = "This paragraph contains many real words of genuine prose content for testing. "
    y = 380
    for _ in range(6):
        c.drawString(20, y, sentence)
        y -= 20
    c.line(50, 50, 50, 200)
    c.line(50, 50, 350, 50)
    x = 70
    for h in (40, 80, 60, 120, 90, 70):
        c.rect(x, 50, 30, h, fill=1)
        x += 45
    for gy in range(50, 210, 20):
        c.line(50, gy, 350, gy)
    c.showPage()
    c.save()
    return buf.getvalue()


def _text_heavy_pdf_with_simple_table_border_bytes() -> bytes:
    """Same amount of body text as above, but only a plain table border and
    two divider lines — a handful of paths (calibrated at 3), well under
    _DRAWING_PATH_THRESHOLD. Must NOT be treated as a chart."""
    _require_reportlab()
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(400, 400))
    sentence = "This paragraph contains many real words of genuine prose content for testing. "
    y = 380
    for _ in range(6):
        c.drawString(20, y, sentence)
        y -= 20
    c.rect(50, 150, 200, 100)
    c.line(50, 200, 250, 200)
    c.line(150, 150, 150, 250)
    c.showPage()
    c.save()
    return buf.getvalue()


def test_process_pdf_returns_real_total_page_count_even_with_no_extractable_text():
    """A scanned/blank-page PDF (no extractable text at all) must still
    report its real page count — total_pages is a fact about the file
    itself, independent of whether ingestion could chunk anything."""
    content = _make_blank_pdf_bytes(num_pages=5)
    service = IngestionService(embedding_service=FakeEmbeddingService(), vector_store=FakeVectorStore())

    result = _run(service.process_pdf(content, source_id="blank.pdf", user_email="a@example.com"))

    assert result.total_pages == 5


def test_process_pdf_with_real_extractable_text_still_returns_correct_page_count():
    content = _text_heavy_pdf_bytes(num_pages=3)
    vector_store = FakeVectorStore()
    service = IngestionService(embedding_service=FakeEmbeddingService(), vector_store=vector_store)

    result = _run(service.process_pdf(content, source_id="text.pdf", user_email="a@example.com"))

    assert result.total_pages == 3
    assert vector_store.added is not None  # real text was chunked and stored


def test_no_ai_service_means_no_vision_calls_at_all():
    """Backward compatibility: omitting ai_service (the default) must ingest
    exactly as before — pure text, zero vision calls — not raise."""
    content = _make_blank_pdf_bytes(num_pages=2)  # every page is a vision candidate (sparse text)
    service = IngestionService(embedding_service=FakeEmbeddingService(), vector_store=FakeVectorStore())

    result = _run(service.process_pdf(content, source_id="blank.pdf", user_email="a@example.com"))
    assert result.total_pages == 2  # doesn't raise despite ai_service being None


def test_text_heavy_page_does_not_trigger_a_vision_call(monkeypatch):
    """Cost control: a normal, text-heavy page must never trigger a vision
    API call — most pages in most documents are exactly this, and vision
    calls cost real money and ingestion time."""
    from app.services import runtime_settings as rs_module

    monkeypatch.setattr(rs_module.runtime_settings, "get", lambda key: 15 if key == "vision_ingestion_max_pages" else rs_module.runtime_settings.all()[key])

    content = _text_heavy_pdf_bytes(num_pages=1)
    ai_service = FakeAIService()
    vector_store = FakeVectorStore()
    service = IngestionService(embedding_service=FakeEmbeddingService(), vector_store=vector_store, ai_service=ai_service)

    _run(service.process_pdf(content, source_id="text.pdf", user_email="a@example.com"))

    assert ai_service.calls == []


def test_sparse_text_page_triggers_vision_captioning_and_stores_a_chunk(monkeypatch):
    """A near-blank page (typical of a full-page chart with just a title) has
    no embedded raster image pypdf can detect, but is still a vision
    candidate purely from having very little extractable text — this is the
    case that catches vector-drawn graphs."""
    from app.services import runtime_settings as rs_module

    monkeypatch.setattr(rs_module.runtime_settings, "get", lambda key: 15 if key == "vision_ingestion_max_pages" else rs_module.runtime_settings.all()[key])

    content = _make_blank_pdf_bytes(num_pages=1)
    ai_service = FakeAIService(response="A line graph showing rising trend over time.")
    vector_store = FakeVectorStore()
    service = IngestionService(embedding_service=FakeEmbeddingService(), vector_store=vector_store, ai_service=ai_service)

    _run(service.process_pdf(content, source_id="chart.pdf", user_email="a@example.com"))

    assert len(ai_service.calls) == 1
    assert ai_service.calls[0]["detail"] == "low"  # cost-bounded, not "auto"/"high"
    assert vector_store.added is not None
    stored_doc = vector_store.added["documents"][0]
    assert "Figure/diagram on page 1" in stored_doc
    assert "AI-generated description" in stored_doc
    assert "line graph showing rising trend" in stored_doc


def test_embedded_image_page_triggers_vision_captioning(monkeypatch):
    from app.services import runtime_settings as rs_module

    monkeypatch.setattr(rs_module.runtime_settings, "get", lambda key: 15 if key == "vision_ingestion_max_pages" else rs_module.runtime_settings.all()[key])

    content = _pdf_with_embedded_image_bytes()
    ai_service = FakeAIService()
    vector_store = FakeVectorStore()
    service = IngestionService(embedding_service=FakeEmbeddingService(), vector_store=vector_store, ai_service=ai_service)

    _run(service.process_pdf(content, source_id="withimg.pdf", user_email="a@example.com"))

    assert len(ai_service.calls) == 1


def test_no_visual_content_marker_produces_no_extra_chunk(monkeypatch):
    """The vision model explicitly saying there's nothing visual here must
    not pollute the vector store with an empty/meaningless chunk."""
    from app.services import runtime_settings as rs_module

    monkeypatch.setattr(rs_module.runtime_settings, "get", lambda key: 15 if key == "vision_ingestion_max_pages" else rs_module.runtime_settings.all()[key])

    content = _make_blank_pdf_bytes(num_pages=1)
    ai_service = FakeAIService(response="NO_VISUAL_CONTENT")
    vector_store = FakeVectorStore()
    service = IngestionService(embedding_service=FakeEmbeddingService(), vector_store=vector_store, ai_service=ai_service)

    _run(service.process_pdf(content, source_id="blank2.pdf", user_email="a@example.com"))

    assert len(ai_service.calls) == 1  # the call still happened
    assert vector_store.added is None  # but nothing was stored — no chunks at all


def test_vision_ingestion_max_pages_zero_disables_vision_entirely(monkeypatch):
    from app.services import runtime_settings as rs_module

    monkeypatch.setattr(rs_module.runtime_settings, "get", lambda key: 0 if key == "vision_ingestion_max_pages" else rs_module.runtime_settings.all()[key])

    content = _make_blank_pdf_bytes(num_pages=3)
    ai_service = FakeAIService()
    service = IngestionService(embedding_service=FakeEmbeddingService(), vector_store=FakeVectorStore(), ai_service=ai_service)

    _run(service.process_pdf(content, source_id="blank3.pdf", user_email="a@example.com"))

    assert ai_service.calls == []


def test_vision_ingestion_max_pages_caps_how_many_pages_get_captioned(monkeypatch):
    from app.services import runtime_settings as rs_module

    monkeypatch.setattr(rs_module.runtime_settings, "get", lambda key: 2 if key == "vision_ingestion_max_pages" else rs_module.runtime_settings.all()[key])

    content = _make_blank_pdf_bytes(num_pages=5)  # 5 vision candidates, cap is 2
    ai_service = FakeAIService()
    service = IngestionService(embedding_service=FakeEmbeddingService(), vector_store=FakeVectorStore(), ai_service=ai_service)

    result = _run(service.process_pdf(content, source_id="blank4.pdf", user_email="a@example.com"))

    assert len(ai_service.calls) == 2
    assert result.vision_pages_captioned == 2
    # Regression guard: 5 vision-candidate pages, cap of 2 — the 3 pages
    # beyond the cap were never captioned. Previously this had zero signal
    # anywhere; the second-audit fix surfaces it as vision_truncated=True
    # (propagated to Document.vision_truncated and the chat prompt).
    assert result.vision_truncated is True


def test_vision_truncated_is_false_when_candidates_stay_within_the_cap(monkeypatch):
    from app.services import runtime_settings as rs_module

    monkeypatch.setattr(rs_module.runtime_settings, "get", lambda key: 15 if key == "vision_ingestion_max_pages" else rs_module.runtime_settings.all()[key])

    content = _make_blank_pdf_bytes(num_pages=2)  # 2 candidates, cap is 15 — well within
    ai_service = FakeAIService()
    service = IngestionService(embedding_service=FakeEmbeddingService(), vector_store=FakeVectorStore(), ai_service=ai_service)

    result = _run(service.process_pdf(content, source_id="blank6.pdf", user_email="a@example.com"))

    assert result.vision_truncated is False


def test_one_failed_vision_call_does_not_fail_the_whole_ingestion(monkeypatch):
    """Text ingestion for the rest of the document already succeeded and is
    worth keeping even if one page's vision call errors."""
    from app.services import runtime_settings as rs_module

    monkeypatch.setattr(rs_module.runtime_settings, "get", lambda key: 15 if key == "vision_ingestion_max_pages" else rs_module.runtime_settings.all()[key])

    content = _make_blank_pdf_bytes(num_pages=1)
    ai_service = FakeAIService()
    ai_service.raise_on_next_call(RuntimeError("vision API down"))
    vector_store = FakeVectorStore()
    service = IngestionService(embedding_service=FakeEmbeddingService(), vector_store=vector_store, ai_service=ai_service)

    result = _run(service.process_pdf(content, source_id="blank5.pdf", user_email="a@example.com"))

    assert result.total_pages == 1  # did not raise


# ── The sparse-text gap: a text-dense page with a vector-drawn chart ─────────
# Previously invisible to vision captioning entirely — word count was too
# high to trip the sparse-text fallback, and pypdf's page.images finds
# nothing since a vector-drawn chart isn't an embedded image object. Closed
# by counting the page's vector drawing paths directly (real signal,
# independent of text density or embedded-image objects).

def test_text_heavy_page_with_vector_chart_triggers_vision(monkeypatch):
    from app.services import runtime_settings as rs_module

    monkeypatch.setattr(
        rs_module.runtime_settings,
        "get",
        lambda key: 15 if key == "vision_ingestion_max_pages" else rs_module.runtime_settings.all()[key],
    )

    content = _text_heavy_pdf_with_vector_chart_bytes()
    ai_service = FakeAIService(response="A bar chart with six bars and gridlines.")
    vector_store = FakeVectorStore()
    service = IngestionService(embedding_service=FakeEmbeddingService(), vector_store=vector_store, ai_service=ai_service)

    _run(service.process_pdf(content, source_id="dense_chart.pdf", user_email="a@example.com"))

    assert len(ai_service.calls) == 1
    assert vector_store.added is not None
    contents = vector_store.added["documents"]
    assert any("Figure/diagram on page 1" in c for c in contents)
    # The real body text must still have been extracted and stored too —
    # this fix must not turn a text-and-chart page into a chart-only page.
    assert any("genuine prose content" in c for c in contents)


def test_text_heavy_page_with_only_a_table_border_does_not_trigger_vision(monkeypatch):
    """A plain table border / a couple of divider lines is not a chart —
    must stay under the drawing-path threshold and cost nothing extra."""
    from app.services import runtime_settings as rs_module

    monkeypatch.setattr(
        rs_module.runtime_settings,
        "get",
        lambda key: 15 if key == "vision_ingestion_max_pages" else rs_module.runtime_settings.all()[key],
    )

    content = _text_heavy_pdf_with_simple_table_border_bytes()
    ai_service = FakeAIService()
    service = IngestionService(embedding_service=FakeEmbeddingService(), vector_store=FakeVectorStore(), ai_service=ai_service)

    _run(service.process_pdf(content, source_id="table_border.pdf", user_email="a@example.com"))

    assert ai_service.calls == []
