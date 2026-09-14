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


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


def _sentence_groups(paragraph: str, target_words: int) -> list[str]:
    """Group a single paragraph's sentences into ~target_words pieces."""
    sentences = [s for s in (part.strip() for part in _SENTENCE_SPLIT.split(paragraph.strip())) if s]
    if not sentences:
        return []

    # Last resort for text with no sentence punctuation at all — a wall of words with
    # no periods is rare in prose but entirely possible in pasted input, and without
    # this it stays one oversized piece and times out exactly like before.
    pieces: list[str] = []
    for sentence in sentences:
        if word_count(sentence) > target_words:
            words = sentence.split()
            pieces.extend(
                " ".join(words[i : i + target_words]) for i in range(0, len(words), target_words)
            )
        else:
            pieces.append(sentence)

    groups: list[str] = []
    current: list[str] = []
    current_words = 0
    for piece in pieces:
        p_words = word_count(piece)
        if current and current_words + p_words > target_words:
            groups.append(" ".join(current))
            current = []
            current_words = 0
        current.append(piece)
        current_words += p_words
    if current:
        groups.append(" ".join(current))
    return groups


def chunk_with_separators(text: str, target_words: int) -> list[tuple[str, str]]:
    """Like chunk_text, but it WILL split an over-long paragraph on sentence
    boundaries, and it reports how each chunk should be rejoined.

    Returns [(chunk_text, separator_before_this_chunk)] — "" for the first
    chunk, "\\n\\n" where the split fell on a real blank-line paragraph break,
    and " " where a single long paragraph had to be broken mid-way.

    2026-08-13: added for Ultra after a browser test caught the gap. chunk_text
    never splits inside a paragraph, which is right for the Basic pipeline (its
    chunks are ~900 words and each call is fast). For Ultra it was fatal: a
    494-word single-paragraph input — no blank lines anywhere, which is exactly
    what someone pasting an essay produces — came back as ONE chunk, went out as
    one request, and hit the 180s timeout just like before the chunking work.
    Paragraph-only chunking silently did nothing for the most common input shape.

    Tracking the separator is what makes the mid-paragraph split safe. Rejoining
    every chunk with "\\n\\n" would hand the user back a single paragraph broken
    into several, quietly changing the structure the rewrite promises to keep."""
    paragraphs = split_into_paragraphs(text)
    if not paragraphs:
        return [(text, "")]

    # Finest-grained pieces first, each tagged with the separator that precedes it.
    units: list[tuple[str, str]] = []
    for i, paragraph in enumerate(paragraphs):
        para_sep = "" if i == 0 else "\n\n"
        if word_count(paragraph) > target_words:
            for j, group in enumerate(_sentence_groups(paragraph, target_words)):
                units.append((group, para_sep if j == 0 else " "))
        else:
            units.append((paragraph, para_sep))

    # Then merge adjacent pieces back up to target so short paragraphs don't each
    # cost their own round trip.
    chunks: list[tuple[str, str]] = []
    current_text: str | None = None
    current_sep = ""
    current_words = 0
    for unit_text, unit_sep in units:
        u_words = word_count(unit_text)
        if current_text is None:
            current_text, current_sep, current_words = unit_text, unit_sep, u_words
        elif current_words + u_words <= target_words:
            current_text = current_text + unit_sep + unit_text
            current_words += u_words
        else:
            chunks.append((current_text, current_sep))
            current_text, current_sep, current_words = unit_text, unit_sep, u_words
    if current_text is not None:
        chunks.append((current_text, current_sep))

    return chunks or [(text, "")]


def voice_sample(rewritten_first_chunk: str, max_sentences: int = 3) -> str:
    """Pull a short sample from the first chunk's rewritten output to carry
    tone/voice forward into later chunks, without an extra model call."""
    sentences = re.split(r"(?<=[.!?])\s+", rewritten_first_chunk.strip())
    return " ".join(sentences[:max_sentences]).strip()
