"""Unit tests for scripts/finetune/clean_corpus.py's clean_text() — the
scraped-web-contamination stripper behind the Phase 2 corpus-clean pass.

Every case here is drawn from a real row found in the actual finetune_samples
DB during the 2026-09-12 corpus-clean session (ids referenced in comments),
not synthetic guesses, except where noted as a regression case."""

from scripts.finetune.clean_corpus import clean_text, word_count


def test_inline_p_tag_becomes_paragraph_break():
    # id 95914 — nixiesearch/hackernews-comments uses <p> as its own inline
    # separator, no closing tag. Deleting it outright would run two
    # paragraphs together instead of preserving the break.
    text = "First point.<p>Second point entirely."
    result = clean_text(text)
    assert "<p>" not in result
    assert "\n\n" in result
    assert "First point." in result and "Second point entirely." in result


def test_anchor_tag_keeps_visible_text_drops_markup():
    # id 98139 — <a href="...">url</a> where the visible text duplicates the href.
    text = 'See <a href="http://en.wikipedia.org/wiki/Kevin_McCloud" rel="nofollow">this page</a> for more.'
    result = clean_text(text)
    assert "<a" not in result and "</a>" not in result
    assert "this page" in result
    assert "wikipedia.org" not in result  # only the visible text is kept, not the href


def test_inline_emphasis_tags_stripped_text_kept():
    # id 98139
    text = 'Are you asking how to start a <i>tech startup</i>, specifically web?'
    result = clean_text(text)
    assert "<i>" not in result and "</i>" not in result
    assert "tech startup" in result


def test_bare_url_removed():
    text = "Check the docs at https://example.com/path?query=1 for details."
    result = clean_text(text)
    assert "https://" not in result
    assert "Check the docs at" in result and "for details." in result


def test_url_glued_directly_onto_preceding_word_is_still_removed():
    # id 109637/114743/109741 — real regression: a \b-anchored URL regex
    # silently failed here because "indeed" and "http" are both \w characters,
    # so there's no word boundary between them at all.
    text = "that's hilarious\n\nindeedhttp://t.co/dGu5NjGMWI — Vinay Dokania"
    result = clean_text(text)
    assert "http://" not in result
    assert "t.co" not in result


def test_html_entities_unescaped():
    text = "Rock &amp; roll &mdash; a classic &#39;combo&#39;."
    result = clean_text(text)
    assert "&amp;" not in result
    assert "&" in result  # the entity decodes to a literal ampersand, which stays


def test_standalone_boilerplate_line_removed():
    # id 108562 — "Read more at bloomberg.com" as its own line/paragraph.
    text = "Real article content here.\n\nRead more at bloomberg.com\n\nMore real content."
    result = clean_text(text)
    assert "read more at" not in result.lower()
    assert "Real article content here." in result
    assert "More real content." in result


def test_originally_published_as_standalone_line_removed():
    # id 112216 — a genuine standalone boilerplate byline/dateline.
    text = "Originally published January 14, 2014 at 6:56 PM | Page modified January 15, 2014\n\nThe real story starts here."
    result = clean_text(text)
    assert "originally published" not in result.lower()
    assert "The real story starts here." in result


def test_originally_published_embedded_in_a_real_sentence_is_preserved():
    # id 123788 — the exact false-positive risk this module's docstring warns
    # about: "originally published" also occurs as ordinary prose mid-sentence,
    # not just as boilerplate. Whole-line matching must not touch this.
    text = "It was originally published in hardcover fifteen years ago, which is a long time in publishing."
    result = clean_text(text)
    assert "originally published" in result.lower()
    assert result.strip() == text.strip()


def test_advertisement_boilerplate_lines_removed():
    # id 111385 — repeated "ADVERTISEMENT Thanks for watching! Visit Website" lines.
    text = (
        "This anchor could be bomber, but it has issues.\n\n"
        "ADVERTISEMENT Thanks for watching! Visit Website\n\n"
        "Metal on metal connections — look closely."
    )
    result = clean_text(text)
    assert "advertisement" not in result.lower()
    assert "This anchor could be bomber, but it has issues." in result
    assert "Metal on metal connections" in result


def test_story_continues_below_advertisement_removed():
    # id 112264
    text = "Real sentence one.\n\nStory continues below advertisement\n\nReal sentence two."
    result = clean_text(text)
    assert "advertisement" not in result.lower()
    assert "Real sentence one." in result and "Real sentence two." in result


def test_visited_times_today_widget_removed():
    text = "The real article body.\n\n(Visited 29 times, 1 visits today)"
    result = clean_text(text)
    assert "visited" not in result.lower()
    assert "The real article body." in result


def test_template_slug_bracket_removed():
    text = "The school decided to remove the option.\n\n[inject-module]\n\nMore content follows."
    result = clean_text(text)
    assert "[inject-module]" not in result
    assert "The school decided to remove the option." in result


def test_clean_text_never_produces_leading_or_trailing_whitespace_garbage():
    text = "<p>Some text.<p>"
    result = clean_text(text)
    assert result == result.strip()


def test_empty_or_all_boilerplate_input_can_reduce_to_empty_string():
    # A row that's entirely boilerplate should clean down to nothing —
    # clean_corpus.py's main() treats an empty result as "unsalvageable" and
    # drops the row, rather than teaching the model to write nothing.
    text = "Read more at bloomberg.com"
    result = clean_text(text)
    assert result.strip() == ""


def test_word_count_matches_whitespace_split():
    assert word_count("one two three") == 3
    assert word_count("   ") == 0
    assert word_count("") == 0
