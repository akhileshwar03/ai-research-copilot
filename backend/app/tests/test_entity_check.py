from app.services.humanizer.entity_check import check_entity_invariant, strip_fabricated_lines, strip_junk_furniture


def test_strips_standalone_fabricated_photo_credit():
    """Real fabrication caught 2026-09-19: a rewrite of an Airbnb/short-term-rentals
    article ended with a fabricated photo credit on its own line. Deleting the whole
    line costs nothing since it's structurally separate from the real content above it."""
    source = "why some cities are banning short-term rentals"
    output = "Some real rewritten paragraph about Airbnb and cities.\n\nPhoto by KEN STEED / Flickr"

    result = strip_fabricated_lines(source, output)

    assert result["removed_lines"] == ["Photo by KEN STEED / Flickr"]
    assert result["still_violates"] is False
    assert result["output"] == "Some real rewritten paragraph about Airbnb and cities."


def test_strips_standalone_fabricated_byline_and_date():
    """Real fabrication: 'Posted by Matthew Stibbe | March 30th, 2017.' tacked onto
    the end of a public-libraries rewrite, on its own line."""
    source = "the history of public libraries"
    output = (
        "Public Libraries: A History\n\n"
        "Some real rewritten paragraph about libraries and Carnegie.\n\n"
        "Posted by Matthew Stibbe | March 30th, 2017."
    )

    result = strip_fabricated_lines(source, output)

    assert result["removed_lines"] == ["Posted by Matthew Stibbe | March 30th, 2017."]
    assert result["still_violates"] is False
    assert "Matthew Stibbe" not in result["output"]
    assert "Public Libraries: A History" in result["output"]
    assert "Some real rewritten paragraph about libraries and Carnegie." in result["output"]


def test_does_not_delete_a_fabrication_woven_into_an_ordinary_sentence():
    """Real, serious bug found while building this: _BYLINE_RE.search() matches "by
    Sarah Connor" ANYWHERE in a line, including deep inside an otherwise-ordinary long
    sentence -- the first version of this filter deleted the WHOLE 81-character
    legitimate sentence and left empty output. A fabrication embedded in real prose
    must be left for the resample loop, never deleted outright: removing just the
    flagged span (or the whole sentence) risks broken grammar or losing real content
    that has nothing to do with the fabrication."""
    source = "The team finished the project ahead of schedule."
    output = "The team, led by Sarah Connor and John Smith, finished the Boston project early."

    result = strip_fabricated_lines(source, output)

    assert result["removed_lines"] == []
    assert result["still_violates"] is True
    assert result["output"] == output  # untouched, not mangled


def test_does_not_delete_a_long_ordinary_sentence_even_if_fully_fabricated():
    """Known, honest limitation: a fabricated reporter bio that reads as a normal,
    long, terminally-punctuated sentence (not byline/date-shaped) is NOT deleted,
    even though the whole line happens to be fabricated -- the filter is deliberately
    conservative rather than risk deleting real content it can't distinguish. This
    case must still fall through to the resample loop in production."""
    source = "why cities are banning short term rentals"
    output = (
        "Some real rewritten paragraph about Airbnb rentals and housing.\n\n"
        "A former reporter for Time, Slate and the New York Daily News, Brian Mann "
        "hosts NEXUS 1300 weekdays from 6-9am. Follow him on Twitter @BrianWMann"
    )

    result = strip_fabricated_lines(source, output)

    assert result["removed_lines"] == []
    assert result["still_violates"] is True


def test_clean_output_is_returned_unchanged():
    source = "Vaccines train the immune system to fight infection."
    output = "Vaccines get your immune system ready to fight infection before it happens for real."

    result = strip_fabricated_lines(source, output)

    assert result == {"output": output, "removed_lines": [], "still_violates": False}


def test_removing_a_line_collapses_the_resulting_blank_gap():
    source = "A short faithful summary of the source."
    output = "A short faithful rewrite of the source.\n\nPhoto by KEN STEED / Flickr\n\nAnother real closing line."

    result = strip_fabricated_lines(source, output)

    assert result["removed_lines"] == ["Photo by KEN STEED / Flickr"]
    assert "\n\n\n" not in result["output"]
    assert result["output"] == "A short faithful rewrite of the source.\n\nAnother real closing line."


def test_check_entity_invariant_still_works_standalone():
    """strip_fabricated_lines wraps check_entity_invariant; make sure the underlying
    check itself is untouched by this addition."""
    result = check_entity_invariant("plain source text", "plain source text, rephrased a little")
    assert result == {"violation": False, "new_entities": []}


# ── strip_junk_furniture (2026-09-19) ────────────────────────────────────────


def test_strips_a_full_real_scraped_blog_comment_footer():
    """Real fabrication caught this session: a noise-cancelling-headphones rewrite
    was otherwise faithful, but the model appended a full blog comment-form footer
    on the end -- none of it asserts a fact, so check_entity_invariant never sees
    anything to flag; this is a separate, unconditional check for exactly that gap."""
    output = (
        "Overall both these technologies lead to clearer sound and help focus on "
        "your music when in noisy surroundings.\n\n"
        "Read more articles like this\n\n"
        "Share To:\n\n"
        "Find Us Here ...\n\n"
        "Post A Comment\n\n"
        "Your email is never published nor shared. Required fields are marked *\n\n"
        "Subscribe here and get latest update straight into you inbox...\n"
        "Name ( required )\n\n"
        "Email Address :\n\n"
        "Comments:\n\n"
        "Related Posts ::"
    )

    result = strip_junk_furniture(output)

    assert len(result["removed_lines"]) == 10
    assert result["output"] == (
        "Overall both these technologies lead to clearer sound and help focus on "
        "your music when in noisy surroundings."
    )


def test_strips_real_library_tags_and_comment_furniture():
    output = (
        "Public libraries have a rich history dating back thousands of years.\n\n"
        "Tags: Library\n\n"
        "Comments ()\n\n"
        "Share your comment!\n\n"
        "More from the library"
    )

    result = strip_junk_furniture(output)

    assert result["removed_lines"] == ["Tags: Library", "Comments ()", "Share your comment!", "More from the library"]
    assert result["output"] == "Public libraries have a rich history dating back thousands of years."


def test_does_not_strip_legitimate_sentences_containing_risky_substrings():
    """Real risk: several trigger phrases ("more from the", "comments:", "video
    playlist", "click here to") could plausibly appear inside a genuinely
    legitimate sentence about a related topic, not just as a standalone junk tag.
    Every one of these must be left completely untouched."""
    legitimate_sentences = [
        "The video playlist algorithm on this platform recommends similar songs based on your listening history.",
        "Comments: The feedback from the survey was largely positive across all demographics.",
        "You can find more from the report in the appendix, which details the full methodology.",
        "Click here to open a new file is a common phrase in software tutorials, but users often skip it.",
        "Subscribers can get a subscription that includes more perks than before, according to the company.",
        "The email address associated with the account was verified before the update was sent.",
    ]
    for sentence in legitimate_sentences:
        result = strip_junk_furniture(sentence)
        assert result == {"output": sentence, "removed_lines": []}, sentence


def test_clean_output_with_no_furniture_is_unchanged():
    output = "A perfectly normal rewrite with nothing junky in it at all."
    assert strip_junk_furniture(output) == {"output": output, "removed_lines": []}


def test_strips_standalone_fake_comment_reply_reactions():
    """Real fabrication caught this session: a rewrite ended with '+1' and,
    separately in another run, 'Good article!' on their own lines -- fake
    third-party reactions to the piece, not the narrator's own voice."""
    output = (
        "I just have a lot on my plate, as evidenced by all those circles in my "
        "todo list ;-)\n\n+1\n\nGreat answer! There is a reason why we set deadlines..."
    )
    result = strip_junk_furniture(output)
    assert result["removed_lines"] == ["+1"]
    # Known, accepted limitation: "Great answer! ..." has real trailing content
    # on the same line, so the whole-line safety check correctly leaves it --
    # only the fully-isolated "+1" line is safe to delete outright here.
    assert "Great answer!" in result["output"]

    output2 = "Some real rewritten content about the topic at hand.\n\nGood article!"
    result2 = strip_junk_furniture(output2)
    assert result2["removed_lines"] == ["Good article!"]
    assert result2["output"] == "Some real rewritten content about the topic at hand."


def test_does_not_strip_a_legitimate_plus_one_embedded_in_prose():
    """'+1' is short enough that it could plausibly appear as a real code/step
    reference in legitimate content -- only a line that is ENTIRELY '+1' (the
    real observed shape) should ever be deleted."""
    text = "To increase the counter, run step +1 in the loop until the condition is met."
    assert strip_junk_furniture(text) == {"output": text, "removed_lines": []}


def test_strips_dangling_source_and_credit_line():
    """Real case from the first live Modal production request: a rewrite about
    noise-cancelling headphones ended with a dangling 'Source and Credit:' line
    with nothing after it -- same scraped-attribution-furniture family as the
    byline/photo-credit patterns, just with no name to anchor
    _ATTRIBUTION_SOURCE_RE."""
    output = (
        "The processor detects incoming ambient noise and creates a soundwave "
        "inversion via its internal electronics.\n\nSource and Credit:"
    )
    result = strip_junk_furniture(output)
    assert result["removed_lines"] == ["Source and Credit:"]
    assert result["output"] == (
        "The processor detects incoming ambient noise and creates a soundwave "
        "inversion via its internal electronics."
    )


# ── Sign-off fabrication, spanning multiple lines (2026-09-19) ───────────────


def test_catches_and_strips_a_fabricated_signoff_across_two_lines():
    """Real fabrication caught this session: a rewrite ended with a fully
    fabricated personal anecdote signed off "Thanks,\\n\\nKim" -- a fake
    single-word name in sign-off position, split across two lines with a
    blank line between them (the real observed shape). check_entity_invariant
    matches this fine (the regex spans the gap on purpose), but the original
    per-line deletion loop missed it entirely, since neither line alone
    contained the whole flagged string -- this exercises the fix for that."""
    source = "Public libraries have existed for a long time and continue to serve communities today."
    output = source + "\n\nThanks,\n\nKim"

    check = check_entity_invariant(source, output)
    assert check["violation"] is True
    assert "Thanks, Kim" in check["new_entities"]

    result = strip_fabricated_lines(source, output)
    assert result["removed_lines"] == ["Thanks,", "", "Kim"]
    assert result["still_violates"] is False
    assert result["output"] == source


def test_catches_and_strips_a_fabricated_signoff_on_one_line():
    source = "Public libraries have existed for a long time."
    output = source + "\n\nThanks, Kim"

    result = strip_fabricated_lines(source, output)
    assert result["removed_lines"] == ["Thanks, Kim"]
    assert result["output"] == source


def test_does_not_flag_legitimate_thanks_in_ordinary_prose():
    source = "The team thanked Maria for her contributions to the project."
    output = "Thanks to Maria, the project succeeded beyond expectations."
    assert check_entity_invariant(source, output) == {"violation": False, "new_entities": []}


def test_signoff_fix_does_not_regress_the_sarah_connor_inline_case():
    """The cross-line deletion logic added for sign-offs must not loosen the
    existing, already-fixed-once safety guarantee for a fabrication woven into
    an ordinary sentence."""
    source = "The team finished the project ahead of schedule."
    output = "The team, led by Sarah Connor and John Smith, finished the Boston project early."

    result = strip_fabricated_lines(source, output)
    assert result["removed_lines"] == []
    assert result["output"] == output


# ── Single-word attribution entities (2026-09-19) ────────────────────────────


def test_catches_fabricated_single_word_citation():
    """Real miss this session: 'according to NPR' -- a fabricated citation to a
    real organization -- was invisible to entity_check entirely, because
    _PROPER_NOUN_RUN_RE deliberately requires 2+ capitalized words and 'NPR'
    alone never matched it."""
    source = "Noise-cancelling headphones use active noise cancellation."
    output = "This works well, according to NPR."
    result = check_entity_invariant(source, output)
    assert result["violation"] is True
    assert "according to NPR" in result["new_entities"]


def test_catches_fabricated_single_word_image_credit():
    """Real miss: '[Image Source: Google]' -- a fabricated image attribution --
    was also invisible for the same reason ('Google' is one word)."""
    source = "Public libraries have a long history."
    output = "Libraries have a long history.\n\n[Image Source: Google]"
    result = check_entity_invariant(source, output)
    assert result["violation"] is True
    assert "Image Source: Google" in result["new_entities"]


def test_catches_fabricated_single_word_location_attribution():
    """Real miss: 'In the news out of Denver' -- a fabricated city attribution
    for a claim the source never tied to any specific place."""
    source = "City officials are concerned about hollowing out of neighborhoods."
    output = "In the news out of Denver are comments by city officials that they are concerned about hollowing out of neighborhoods."
    result = check_entity_invariant(source, output)
    assert result["violation"] is True
    assert "out of Denver" in result["new_entities"]


def test_does_not_flag_a_genuinely_unrelated_use_of_a_trigger_word():
    """The trigger words (via, according to, out of, credit, image/photo source)
    are deliberately narrow and specific -- confirm a plain, unrelated sentence
    using one of them with no attached capitalized name doesn't produce a
    spurious entity at all."""
    source = "Plants convert light into energy via a process called photosynthesis."
    output = "Plants turn light into energy via a process called photosynthesis."
    result = check_entity_invariant(source, output)
    assert result == {"violation": False, "new_entities": []}


# ── Widened number-claim units (2026-09-19) ──────────────────────────────────


def test_catches_fabricated_decibel_claim_with_abbreviated_unit():
    """Real miss this session: 'a certain volume level around 50 dBs' -- a
    fabricated technical specific -- was invisible because the number-claim
    regex's unit list (likes/shares/views/etc.) had no measurement units."""
    source = "Headphones reduce ambient noise using active noise cancellation."
    output = "It should be noted, they do need a certain volume level around 50 dBs upwards for best results."
    result = check_entity_invariant(source, output)
    assert result["violation"] is True
    assert "50 dBs" in result["new_entities"]


def test_catches_fabricated_decibel_claim_spelled_out():
    source = "Headphones reduce ambient noise using active noise cancellation."
    output = "Think about speech - how do you hear someone speaking if there is a 100 decibel hum?"
    result = check_entity_invariant(source, output)
    assert result["violation"] is True
    assert "100 decibel" in result["new_entities"]


def test_does_not_flag_a_number_already_in_the_source_just_reworded():
    """The real risk with widening the unit list: flagging a number that
    genuinely came from the source, just rephrased with a different word around
    it or spelled out differently, as if it were a new fabricated claim."""
    cases = [
        ("The article is 27 words long.", "This piece runs 27 words in total."),
        ("There were 3 people at the meeting.", "Three people attended the meeting."),
        ("The event happened over 5 years ago.", "It has been 5 years since the event took place."),
    ]
    for source, output in cases:
        result = check_entity_invariant(source, output)
        assert result == {"violation": False, "new_entities": []}, (source, output)
