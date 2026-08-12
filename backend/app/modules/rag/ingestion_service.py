import base64
import dataclasses
import io
import logging
import uuid

import pymupdf  # PyMuPDF — pure-Python wheel, no system binary dependency. The
# older `import fitz` alias still works but is deprecated in favour of this.
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader

from app.core.config import get_settings
from app.modules.rag.embedding_service import EmbeddingService
from app.services.runtime_settings import runtime_settings

logger = logging.getLogger(__name__)

# A page with fewer extracted words than this is treated as a vision
# candidate even with no other signal — a last-resort catch-all for a page
# that's mostly blank/near-empty (e.g. a scanned image with no vector
# graphics pymupdf can detect either). Real charts are caught more directly
# by _DRAWING_PATH_THRESHOLD below; this exists for what that still misses.
_SPARSE_TEXT_WORD_THRESHOLD = 40

# A page with at least this many vector drawing paths (lines, curves, fills)
# almost certainly has a real chart/diagram on it — bars, gridlines, axis
# ticks, and plotted lines/points each contribute several paths. Calibrated
# against real matplotlib output: a plain text page scored 0-1 paths; a page
# with an embedded line or bar chart (regardless of how much surrounding
# body text was also on the page) scored 20+. This is what closes the gap
# the word-count check alone couldn't: a text-dense page that also has a
# vector-drawn chart (not an embedded raster image) — word count stays high
# on that page, so only a direct graphics-content signal like this catches it.
_DRAWING_PATH_THRESHOLD = 10

_NO_VISUAL_CONTENT_MARKER = "NO_VISUAL_CONTENT"

_VISION_PROMPT = (
    "You are analyzing one page of a document for a retrieval system. Describe ONLY genuinely "
    "visual content on this page — diagrams, charts, graphs, plots, tables rendered as an image, "
    "or figures. Ignore plain paragraph text; it has already been extracted separately by a text "
    "tool and you don't need to repeat it. For each chart or diagram, describe: what type it is, "
    "its axes/labels, the key trend or relationship it shows, and any notable data points or "
    "caption. Be factual and specific — never invent a value, label, or number you can't actually "
    f"read. If this page has no meaningful visual content (plain text only, or blank), respond "
    f"with exactly: {_NO_VISUAL_CONTENT_MARKER}"
)


@dataclasses.dataclass
class IngestionResult:
    # The PDF's real total page count (pypdf's len(reader.pages)) — a hard
    # fact from the file itself, known regardless of whether any page
    # produced extractable text.
    total_pages: int
    # How many chunks (text + vision-derived) actually got embedded and
    # stored. Zero means the document is "ready" in the sense that ingestion
    # ran to completion without erroring, but has no searchable content at
    # all — a scanned/blank PDF with no text layer and vision unavailable or
    # unable to find anything. The caller must not treat that the same as a
    # normal, usable document (see the "empty" upload_status).
    chunks_stored: int
    # How many pages actually got a vision description stored (excludes
    # pages the vision model itself said had no visual content).
    vision_pages_captioned: int
    # True when there were more vision-candidate pages than
    # vision_ingestion_max_pages allowed captioning — some diagrams/charts
    # in this document were never indexed, purely because of the cap, not
    # because they don't exist. The caller persists this so the chat prompt
    # can tell the model (and, transitively, the user) rather than a
    # skipped chart silently looking identical to "there's no chart there."
    vision_truncated: bool


class IngestionService:
    def __init__(self, embedding_service: EmbeddingService, vector_store, ai_service=None):
        self.embedding_service = embedding_service
        self.vector_store = vector_store
        # Optional on purpose: vision captioning is an enhancement, not a
        # hard requirement — callers that don't need it (or in tests) can
        # omit it and ingestion still works exactly as before, text-only.
        self.ai_service = ai_service
        self.settings = get_settings()

    async def process_pdf(self, content: bytes, source_id: str, user_email: str = "") -> IngestionResult:
        """Ingest a PDF and store chunks in the vector store.

        Text is split per page so every chunk carries its page number — the
        LLM can then cite "page N" instead of an opaque chunk index. Every
        chunk also carries ``user_email`` so retrieval stays scoped to one
        user without leaking other users' data.

        Also vision-captions pages likely to contain a diagram/chart/graph
        (see _is_vision_candidate) and stores each description as an
        additional searchable chunk on that page — otherwise a graph or
        chart is completely invisible to the whole RAG pipeline, since
        pypdf's extract_text() only ever returns literal text. Deliberately
        NOT every page: a full-document vision pass would multiply ingestion
        cost and latency by roughly the page count for documents that are
        almost entirely plain text, which is most of them. Only pages that
        actually look visual pay that cost — see _is_vision_candidate for
        the three signals used (embedded image, significant vector
        graphics, or a near-empty page). When vision captioning is disabled
        entirely (no ai_service, or vision_ingestion_max_pages == 0),
        candidate detection itself is skipped too — there's no point paying
        for drawing-path analysis on every page of every upload when the
        result can never be used.
        """
        reader = PdfReader(io.BytesIO(content))
        total_pages = len(reader.pages)
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.settings.rag_chunk_size,
            chunk_overlap=self.settings.rag_chunk_overlap,
        )

        vision_enabled = self.ai_service is not None and int(runtime_settings.get("vision_ingestion_max_pages")) > 0

        # Opened once, up front, and reused for both candidate detection
        # (drawing-path counts) and — later, for whichever pages qualify —
        # rendering to an image for the vision call. Avoids parsing the PDF
        # a second time just to render pages that were already identified.
        # Not opened at all when vision is disabled — nothing would ever use it.
        mupdf_doc = None
        if vision_enabled:
            try:
                mupdf_doc = pymupdf.open(stream=content, filetype="pdf")
            except Exception:
                logger.exception("ingestion_vector_graphics_open_failed source=%s", source_id)
                vision_enabled = False

        chunks: list[str] = []
        metadatas: list[dict] = []
        chunk_index = 0
        vision_candidates: list[int] = []

        try:
            for page_number, page in enumerate(reader.pages, start=1):
                extracted = page.extract_text() or ""

                if vision_enabled:
                    mupdf_page = mupdf_doc[page_number - 1]
                    if self._is_vision_candidate(page, extracted, mupdf_page):
                        vision_candidates.append(page_number)

                if not extracted.strip():
                    continue
                for piece in splitter.split_text(extracted):
                    chunks.append(piece)
                    metadatas.append(
                        {
                            "source": source_id,
                            "chunk": chunk_index,
                            "page": page_number,
                            "user_email": user_email,
                        }
                    )
                    chunk_index += 1

            vision_pages_captioned = 0
            vision_truncated = False
            if vision_enabled and vision_candidates:
                vision_chunks, vision_metadatas, vision_truncated = await self._describe_visual_pages(
                    mupdf_doc, source_id, user_email, vision_candidates, start_chunk_index=chunk_index
                )
                vision_pages_captioned = len(vision_chunks)
                chunks.extend(vision_chunks)
                metadatas.extend(vision_metadatas)
        finally:
            if mupdf_doc is not None:
                mupdf_doc.close()

        chunks_stored = len(chunks)
        if chunks:
            vectors = self.embedding_service.embed_documents(chunks)
            ids = [str(uuid.uuid4()) for _ in chunks]
            self.vector_store.add(ids=ids, documents=chunks, embeddings=vectors, metadatas=metadatas)

        return IngestionResult(
            total_pages=total_pages,
            chunks_stored=chunks_stored,
            vision_pages_captioned=vision_pages_captioned,
            vision_truncated=vision_truncated,
        )

    @staticmethod
    def _is_vision_candidate(page, extracted_text: str, mupdf_page) -> bool:
        try:
            if len(page.images) > 0:
                return True
        except Exception:
            # A malformed embedded-image stream shouldn't block ingestion —
            # fall through to the other checks instead.
            logger.debug("ingestion_image_detect_failed", exc_info=True)

        if mupdf_page is not None:
            try:
                if len(mupdf_page.get_drawings()) >= _DRAWING_PATH_THRESHOLD:
                    return True
            except Exception:
                logger.debug("ingestion_drawing_count_failed", exc_info=True)

        return len(extracted_text.split()) < _SPARSE_TEXT_WORD_THRESHOLD

    async def _describe_visual_pages(
        self,
        mupdf_doc,
        source_id: str,
        user_email: str,
        page_numbers: list[int],
        start_chunk_index: int,
    ) -> tuple[list[str], list[dict], bool]:
        """Render each candidate page (from the already-open pymupdf
        document) and vision-caption it.

        Capped at vision_ingestion_max_pages (admin-tunable) so one
        unusually diagram-heavy document can't balloon ingestion cost/
        latency without bound. "low" detail mode on the vision call keeps
        per-page cost small and fixed, regardless of page resolution.

        Returns (chunks, metadatas, truncated) — truncated is True when
        there were more candidate pages than the cap allowed captioning, so
        the caller can persist and surface that fact rather than letting a
        skipped-for-cost-reasons page look identical to "no chart here."
        """
        max_pages = int(runtime_settings.get("vision_ingestion_max_pages"))
        if max_pages <= 0:
            return [], [], False
        truncated = len(page_numbers) > max_pages
        page_numbers = page_numbers[:max_pages]

        chunks: list[str] = []
        metadatas: list[dict] = []
        chunk_index = start_chunk_index

        for page_number in page_numbers:
            try:
                page = mupdf_doc[page_number - 1]
                pixmap = page.get_pixmap(dpi=110)
                data_url = "data:image/png;base64," + base64.b64encode(pixmap.tobytes("png")).decode("ascii")
                description = await self.ai_service.describe_image(_VISION_PROMPT, data_url, detail="low")
            except Exception:
                # One page's vision call failing must not fail the whole
                # upload — text ingestion for the rest of the document
                # already succeeded and is worth keeping.
                logger.exception("ingestion_vision_describe_failed source=%s page=%s", source_id, page_number)
                continue

            description = (description or "").strip()
            if not description or _NO_VISUAL_CONTENT_MARKER in description:
                continue

            chunks.append(
                f"[Figure/diagram on page {page_number} — AI-generated description, not verbatim "
                f"document text]\n{description}"
            )
            metadatas.append(
                {
                    "source": source_id,
                    "chunk": chunk_index,
                    "page": page_number,
                    "user_email": user_email,
                }
            )
            chunk_index += 1

        return chunks, metadatas, truncated
