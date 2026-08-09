"""Paragraph-boundary chunking for long Humaniser requests.

Inputs over ~1,000 words are split into ~800–1,000-word chunks so each Pass
2 rewrite call stays fast and the pipeline can process them independently.
A paragraph is never split across chunks — a chunk boundary always falls on
a blank line in the source.
"""

import re

CHUNK_THRESHOLD_WORDS = 1000
TARGET_CHUNK_WORDS = 900

_PARAGRAPH_SPLIT = re.compile(r"\n\s*\n")


def word_count(text: str) -> int:
    stripped = text.strip()
    return len(stripped.split()) if stripped else 0


def needs_chunking(text: str, threshold: int = CHUNK_THRESHOLD_WORDS) -> bool:
    return word_count(text) > threshold


def split_into_paragraphs(text: str) -> list[str]:
    """Split on blank-line boundaries, preserving each paragraph's own
    internal whitespace/formatting (markdown headings, bullets, etc.)."""
    parts = _PARAGRAPH_SPLIT.split(text.strip())
    return [p for p in (part.strip() for part in parts) if p]


def chunk_text(text: str, target_words: int = TARGET_CHUNK_WORDS) -> list[str]:
    """Group consecutive paragraphs into ~target_words-sized chunks. Never
    splits a single paragraph — a paragraph longer than target_words on its
    own still becomes (and stays) its own chunk rather than being cut mid-
    sentence. Returns [text] unchanged if there's nothing to group (e.g. one
    giant paragraph, or the text is already short)."""
    paragraphs = split_into_paragraphs(text)
    if not paragraphs:
        return [text]

    chunks: list[str] = []
    current: list[str] = []
    current_words = 0

    for paragraph in paragraphs:
        p_words = word_count(paragraph)
        if current and current_words + p_words > target_words:
            chunks.append("\n\n".join(current))
            current = []
            current_words = 0
        current.append(paragraph)
        current_words += p_words

    if current:
        chunks.append("\n\n".join(current))

    return chunks or [text]


def voice_sample(rewritten_first_chunk: str, max_sentences: int = 3) -> str:
    """Pull a short sample from the first chunk's rewritten output to carry
    tone/voice forward into later chunks, without an extra model call."""
    sentences = re.split(r"(?<=[.!?])\s+", rewritten_first_chunk.strip())
    return " ".join(sentences[:max_sentences]).strip()
