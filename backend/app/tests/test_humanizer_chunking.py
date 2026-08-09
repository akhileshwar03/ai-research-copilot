from app.services.humanizer.chunking import (
    chunk_text,
    needs_chunking,
    split_into_paragraphs,
    voice_sample,
    word_count,
)


def test_word_count_handles_empty_and_whitespace():
    assert word_count("") == 0
    assert word_count("   ") == 0
    assert word_count("one two three") == 3


def test_needs_chunking_respects_threshold():
    short_text = "word " * 500
    long_text = "word " * 1200
    assert not needs_chunking(short_text)
    assert needs_chunking(long_text)
    assert not needs_chunking(long_text, threshold=2000)


def test_split_into_paragraphs_splits_on_blank_lines():
    text = "First paragraph.\n\nSecond paragraph.\n\n\nThird paragraph."
    paragraphs = split_into_paragraphs(text)
    assert paragraphs == ["First paragraph.", "Second paragraph.", "Third paragraph."]


def test_split_into_paragraphs_ignores_empty_segments():
    text = "\n\nOnly paragraph.\n\n"
    assert split_into_paragraphs(text) == ["Only paragraph."]


def test_chunk_text_returns_single_chunk_for_short_input():
    text = "First paragraph.\n\nSecond paragraph."
    assert chunk_text(text) == [text]


def test_chunk_text_groups_paragraphs_up_to_target_words():
    # Three ~40-word paragraphs; target_words=50 forces a new chunk once the
    # running total would exceed it, but never mid-paragraph.
    paragraph = "word " * 40
    text = "\n\n".join([paragraph.strip()] * 3)

    chunks = chunk_text(text, target_words=50)

    assert len(chunks) == 3  # each paragraph alone already exceeds 50 words, so none group together
    for chunk in chunks:
        assert chunk == paragraph.strip()


def test_chunk_text_groups_small_paragraphs_together():
    paragraphs = ["short one.", "short two.", "short three.", "short four."]
    text = "\n\n".join(paragraphs)

    chunks = chunk_text(text, target_words=10)

    # 2 words each, 4 paragraphs total (8 words) — never exceeds target_words
    # (10), so grouping keeps everything in a single chunk.
    assert len(chunks) == 1
    assert chunks[0] == text


def test_chunk_text_never_splits_a_single_paragraph():
    huge_paragraph = "word " * 200
    text = f"intro.\n\n{huge_paragraph.strip()}"

    chunks = chunk_text(text, target_words=50)

    assert "intro." in chunks[0]
    assert huge_paragraph.strip() in "\n\n".join(chunks)
    # The oversized paragraph is never cut mid-way — it appears whole in
    # exactly one chunk.
    assert sum(huge_paragraph.strip() in c for c in chunks) == 1


def test_voice_sample_takes_first_few_sentences():
    text = "First sentence. Second sentence. Third sentence. Fourth sentence should be dropped."
    sample = voice_sample(text, max_sentences=3)
    assert sample == "First sentence. Second sentence. Third sentence."


def test_voice_sample_handles_short_text():
    assert voice_sample("Only one sentence.") == "Only one sentence."
