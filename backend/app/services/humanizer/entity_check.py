"""Deterministic entity/citation invariant check: flags a humanized output as
a likely fabrication if it contains named entities, dates, or specific
numbers that don't appear anywhere in the source input.

Built after real, confirmed fabrication found while validating the
Phase-2-follow-up 3B LoRA (backend/scripts/finetune/) — a fake quote
attributed to a real person ("Marc Andreessen told Techcrunch..."), an
impossible anachronistic misquote ("John Stuart Mill... his famous 1945
speech On Liberty" -- Mill died in 1873), fabricated bylines ("By Jeff
Stier", "by Daphne Wray", "By Nick Bilton The New York Times") with invented
dates, and invented statistics ("3,400 EVs... could top 25,000"). This is
the same class of defect the 7B Ultra model has: humanizer_ultra_service.py's
own docstring records a fabricated "European Food Safety Agency (EFSA)"
citation and invented named viruses/parasites on real production input.
_MAX_EXPANSION_RATIO there catches runaway LENGTH; this catches fabricated
CONTENT that can fit inside a modest, otherwise-unremarkable expansion --
confirmed empirically: expansion ratio and entity fabrication are
correlated but not the same signal, so this is a second, independent check,
not a duplicate of the existing one.

Deliberately regex-based, not spaCy or any NLP dependency -- this project
has none, and the real failure patterns found (proper names, dates, counts,
bylines) don't need a full NLP pipeline to catch. Validated against 20 real
model outputs before being wired in: caught 5/5 confirmed real fabrications,
tightened from an initial 6/20 false-positive rate down to 4/20 (title-case
headings and bullet-style subheadings the model generates as a stylistic
habit, not factual claims) without losing any of the 5 real catches.
"""

import re

# Multi-word capitalized sequences (2-4 consecutive Capitalized words) --
# deliberately NOT single capitalized words, since sentence-initial
# capitalization makes every first word of every sentence a false positive.
# A run of 2+ consecutive capped words is a much stronger real-name signal.
# [ \t]+ (not \s+) between words: \s+ matches across newlines too, which let
# a Title-Case heading glue onto the next paragraph's first capitalized word
# into one nonsense "entity" spanning a paragraph break -- found by testing
# against real output, not assumed.
_PROPER_NOUN_RUN_RE = re.compile(r"\b[A-Z][a-zA-Z'\-]*(?:[ \t]+[A-Z][a-zA-Z'\-]*){1,3}\b")

_YEAR_RE = re.compile(r"\b(1[0-9]{3}|2[0-9]{3})\b")
_DATE_RE = re.compile(r"\b\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b")

# 2026-09-19: real miss -- "a certain volume level around 50 dBs" and "a 100
# decibel hum" (both fabricated technical specifics) were invisible because the
# unit word list here was a short, specific set (likes/shares/views/etc.) with
# no measurement units at all. Widened the list rather than trying to match
# "any number + any word" -- that would flag every rephrased quantity already
# genuinely in the source (e.g. source says "27 words", rewrite says "27-word
# chunk" or "twenty-seven words") as if it were new, which would tank
# precision far worse than the gap this fixes. Still a finite, specific list,
# same risk profile as the original -- accepting some real remaining
# incompleteness (an as-yet-unseen unit) in exchange for not exploding false
# positives, consistent with this file's existing regex-based design. No
# [A-Z] character class here, so re.IGNORECASE below carries none of the
# scoping risk documented above for _BYLINE_RE/_ATTRIBUTION_SOURCE_RE.
_NUMBER_CLAIM_RE = re.compile(
    r"\b\d{1,3}(?:,\d{3})+\b"  # comma-grouped numbers, e.g. 3,400
    r"|\b\d+%\b"  # percentages
    r"|\$\d+(?:\.\d+)?\b"  # dollar amounts, e.g. $50
    r"|\b\d+(?:\.\d+)?\s*(?:dBs?|kg|km|lbs?|mph|°[CF]?)\b"  # abbreviated units, space optional
    r"|\b\d+\s+(?:likes?|shares?|comments?|followers?|views?|people|years?|months?|weeks?|days?|hours?|"
    r"minutes?|seconds?|EVs?|dollars?|decibels?|degrees?|miles?|kilometers?|kilograms?|pounds?|users?|"
    r"subscribers?|downloads?|employees?|votes?|calories?)\b",
    re.IGNORECASE,
)

_MARKDOWN_HEADER_RE = re.compile(r"^\s*(#{1,6}\s|\*\*.*\*\*\s*$)")
_TERMINAL_PUNCT_RE = re.compile(r"[.!?]\s*$")

# Byline/date-stamp patterns get MAXIMUM PRIORITY -- checked independently of
# the header exemption below, deliberately, because every real fabrication
# found ("By Jeff Stier", "by Daphne Wray", "By Nick Bilton", "By Daniel
# Sylva") is itself a short line with no terminal punctuation and would
# otherwise be wrongly exempted by the very heuristic meant to reduce noise.
# NOTE: (?i:by) scopes case-insensitivity to just "by", not the whole
# pattern -- a bare `(?i)` flag makes Python's [A-Z] match lowercase too,
# which produced garbage matches like "by accelerated adoption" the first
# time this was written. [A-Z] must stay case-sensitive to mean anything.
#
# 2026-09-19: real miss found -- "Photo by KEN STEED / Flickr" (a fabricated
# photo credit) fell all the way through to the heading exemption below and
# was never checked at all, because the name-word pattern was [A-Z][a-z]+
# (Title Case only): "KEN" is K + all-uppercase "EN", which [a-z]+ rejects.
# Widened to [A-Za-z]+ (explicit both-case class, NOT a re.IGNORECASE flag --
# that would reintroduce the exact bug the note above already describes) so
# an all-caps name like "KEN STEED" matches the same way "Ken Steed" already
# did. Confirmed via extract_entities() that this doesn't loosen [A-Z] itself:
# the first letter of each word must still be capitalized either way.
_BYLINE_RE = re.compile(r"\b(?i:by)\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?")

# 2026-09-19: real, recurring miss -- THREE separate confirmed instances this
# session of a single-word fabricated entity slipping through completely
# undetected: "according to NPR" (a fabricated citation), "[Image Source:
# Google]" (a fabricated image credit), "In the news out of Denver" (a
# fabricated location attribution). _PROPER_NOUN_RUN_RE deliberately requires
# 2+ consecutive capitalized words specifically to avoid every sentence-
# initial capital letter being a false positive -- that's still the right
# default. But a single capitalized word immediately following a strong,
# specific attribution/citation trigger phrase is a different, much safer
# signal: normal prose essentially never says "according to Foo" or "image
# source: Foo" or "out of Foo" with Foo NOT being a specific named source, so
# the false-positive risk here is low even at single-word granularity.
# Deliberately narrower trigger list than a bare "from"/"in" would be (those
# are far too generic and would fire on ordinary sentences constantly);
# every phrase below is either a real trigger observed this session or the
# same shape as one. Case-insensitivity scoped to the trigger phrase only,
# same (?i:...) pattern as _BYLINE_RE, for the same already-documented reason
# -- a bare (?i) flag would make [A-Z] match lowercase too.
_ATTRIBUTION_SOURCE_RE = re.compile(
    r"\b(?i:according to|via|out of|image source|photo source|photo credit|credit)\s*:?\s+[A-Z][A-Za-z]+\b"
)

# 2026-09-19: real miss -- a rewrite ended with a fully fabricated personal
# anecdote signed off "Thanks,\n\nKim", a fake single-word name in sign-off
# position that neither _PROPER_NOUN_RUN_RE (one word) nor any attribution
# trigger above (none of them are sign-off-shaped) could see. \s+ (not
# [ \t]+) is deliberate here, unlike _PROPER_NOUN_RUN_RE's own note about that
# -- the real observed case had "Thanks," and the name on separate lines with
# a blank line between them, and matching across that gap is exactly the
# intended signal for a sign-off block, not a bug to guard against the way it
# was for gluing an unrelated heading onto the next paragraph. "Cheers" is
# deliberately excluded: STYLE_GUIDANCE explicitly encourages a casual,
# personal voice, so a genuine informal interjection like that is ambiguous
# in a way "Thanks," followed by an isolated name is not.
_SIGNOFF_RE = re.compile(r"\b(?i:thanks|regards|sincerely|best regards|warm regards|yours truly)\s*,\s+[A-Z][A-Za-z]+\b")
_MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"
_DATE_STAMP_RE = re.compile(rf"\b(?:{_MONTHS})\s+\d{{1,2}}(?:th|st|nd|rd)?,?\s+\d{{4}}\b")

# Real headline lengths in actual model output ran 7-10 words ("Starting Your
# Day: A Game-Changing Way to Boost Productivity" = 10) -- checked against
# real output, not guessed.
_MAX_HEADING_WORDS = 10

# This model often glues a short Title-Case label directly onto a real
# descriptive sentence with no line break ("Quick Charge: Up to 8 hours
# play-time using only 15 minutes..."). Strips a leading <=5-word
# capitalized phrase before a colon/dash separator so only the real sentence
# after it gets entity-checked, not the label.
_HEADER_PREFIX_RE = re.compile(r"^((?:[A-Z][a-zA-Z'\-]*\s*){1,5})(?::|-|—)\s*")


def _strip_header_prefix(line: str) -> str:
    m = _HEADER_PREFIX_RE.match(line.strip())
    return line[m.end():] if m else line


def _is_structural_heading_line(line: str) -> bool:
    """A line is treated as a stylistic heading (not a factual claim worth
    checking) if it's markdown-style, or short with no terminal punctuation
    -- UNLESS it also matches the byline/date-stamp override, which always
    wins regardless of how header-like the line looks."""
    stripped = line.strip()
    if not stripped:
        return False
    if _BYLINE_RE.search(stripped) or _DATE_STAMP_RE.search(stripped):
        return False  # override: never exempt a byline/date-stamp line
    if _MARKDOWN_HEADER_RE.match(stripped):
        return True
    word_count = len(stripped.split())
    if word_count <= _MAX_HEADING_WORDS and not _TERMINAL_PUNCT_RE.search(stripped):
        return True
    return False


def extract_entities(text: str) -> set[str]:
    """Returns a set of normalized entity strings found in text: multi-word
    proper-noun runs, years, dates, and specific numeric claims. Processes
    line by line so heading detection and the "Header: real sentence" prefix
    strip both apply per line rather than matching the whole text at once.
    Years/dates/number-claims/bylines are NOT exempted by heading status --
    a fabricated date stamp is exactly the kind of thing that hides on a
    short unpunctuated line."""
    found: set[str] = set()
    for line in text.split("\n"):
        if not line.strip():
            continue
        if _is_structural_heading_line(line):
            continue
        checkable = _strip_header_prefix(line)
        for m in _PROPER_NOUN_RUN_RE.finditer(checkable):
            found.add(m.group().strip())

    for m in _YEAR_RE.finditer(text):
        found.add(m.group())
    for m in _DATE_RE.finditer(text):
        found.add(m.group())
    for m in _NUMBER_CLAIM_RE.finditer(text):
        found.add(m.group().strip())
    for m in _BYLINE_RE.finditer(text):
        found.add(m.group().strip())
    for m in _ATTRIBUTION_SOURCE_RE.finditer(text):
        found.add(m.group().strip())
    for m in _SIGNOFF_RE.finditer(text):
        found.add(re.sub(r"\s+", " ", m.group().strip()))
    for m in _DATE_STAMP_RE.finditer(text):
        found.add(m.group().strip())
    return found


def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def check_entity_invariant(input_text: str, output_text: str) -> dict:
    """Returns {'violation': bool, 'new_entities': [...]}. An entity counts
    as "new" only if it doesn't appear as a substring of the input at all
    (case-insensitive, whitespace-normalized) -- catches exact fabricated
    names/dates/numbers without flagging a reordered/rephrased mention of an
    entity that was genuinely in the input."""
    output_entities = extract_entities(output_text)
    input_norm = _normalize(input_text)

    new_entities = [ent for ent in output_entities if _normalize(ent) not in input_norm]

    return {"violation": len(new_entities) > 0, "new_entities": sorted(new_entities)}


# 2026-09-19: real, serious bug found while testing this the first time --
# "The team, led by Sarah Connor and John Smith, finished the Boston project
# early." got classified as removable and the WHOLE 81-character legitimate
# sentence was deleted, leaving empty output. Cause: _BYLINE_RE.search()
# matches "by Sarah Connor" anywhere in a line, including deep inside an
# otherwise-ordinary long sentence -- it was never meant to answer "is this
# line SHAPED like a byline", only "does a byline pattern appear somewhere in
# it", and those are very different questions for a deletion decision. Fixed
# by requiring the byline/date-stamp match to account for most of the line's
# content (a small leftover after removing it), not just be present somewhere
# in a possibly-much-longer sentence.
_MAX_BYLINE_LEFTOVER_WORDS = 4


def _is_removable_line_shape(line: str) -> bool:
    """True if *line* has the shape of a standalone attribution/byline/photo-
    credit/heading tag -- the kind of thing that shows up as its OWN line,
    structurally separate from the surrounding prose, rather than woven into
    a real sentence. This is the union of every category
    _is_structural_heading_line treats specially (markdown headers, bylines,
    date-stamps, short unpunctuated lines) -- deliberately the union, not
    _is_structural_heading_line itself, since that function's job is the
    opposite of this one: it decides what to SKIP when extracting entities,
    this one decides what's safe to DELETE outright once something in it has
    already been flagged as fabricated. A line matching neither pattern is
    ordinary prose -- if it contains a fabricated entity, that entity is
    woven into real content and deleting the line would either destroy real
    material or leave broken grammar, so it must go through resampling
    instead, never straight deletion."""
    stripped = line.strip()
    if not stripped:
        return False
    if _MARKDOWN_HEADER_RE.match(stripped):
        return True
    byline_date_stripped = stripped
    matched_byline_or_date = False
    for pattern in (_BYLINE_RE, _DATE_STAMP_RE):
        new_stripped, n = pattern.subn("", byline_date_stripped)
        if n:
            matched_byline_or_date = True
            byline_date_stripped = new_stripped
    if matched_byline_or_date and len(byline_date_stripped.split()) <= _MAX_BYLINE_LEFTOVER_WORDS:
        return True
    word_count = len(stripped.split())
    return word_count <= _MAX_HEADING_WORDS and not _TERMINAL_PUNCT_RE.search(stripped)


def strip_fabricated_lines(input_text: str, output_text: str) -> dict:
    """Real, live incident this exists for (2026-09-19): "Photo by KEN STEED /
    Flickr" and "Posted by Matthew Stibbe | March 30th, 2017" both showed up as
    their OWN line, tacked onto otherwise-faithful output -- deleting the whole
    line costs nothing (no real content lost) and is instant, unlike a
    resample, which costs a full extra generation round trip and (confirmed in
    real testing) can still exhaust its budget without finding a clean
    candidate. This is deliberately narrow: it only ever deletes a line that
    is BOTH (a) flagged by check_entity_invariant and (b) shaped like a
    removable tag per _is_removable_line_shape -- a fabricated number or name
    woven into an ordinary sentence (e.g. "two or three dozen cars" instead of
    "cars") is NOT eligible, since removing just that span, or the whole
    sentence, risks broken grammar or losing real content. That harder case
    still needs the resample loop; this function only ever makes a chunk
    cleaner or leaves it unchanged, never worse.

    Returns {'output': str, 'removed_lines': [...], 'still_violates': bool} --
    the caller decides what to do if still_violates is True (fall through to
    the existing resample path), and removed_lines is there purely for
    logging/audit, matching the recommendation to keep a record of anything
    silently dropped."""
    check = check_entity_invariant(input_text, output_text)
    if not check["violation"]:
        return {"output": output_text, "removed_lines": [], "still_violates": False}

    flagged_norm = [_normalize(e) for e in check["new_entities"]]
    lines = output_text.split("\n")

    # 2026-09-19: real miss found testing the sign-off pattern -- "Thanks,\n\nKim"
    # is a real observed shape where the fabricated entity spans TWO separate
    # lines (a blank line in between). check_entity_invariant correctly flags
    # "Thanks, Kim" as one entity (matched via \s+, which spans the gap on
    # purpose -- see _SIGNOFF_RE's own comment), but the per-line loop below
    # only ever checks whether a SINGLE line contains the whole flagged string,
    # so neither "Thanks," alone nor "Kim" alone matched and nothing was
    # removed. Locate _SIGNOFF_RE's actual matches by character span in the
    # real text and mark every line that span touches, rather than only ever
    # working line-by-line.
    cross_line_removable = set()
    for m in _SIGNOFF_RE.finditer(output_text):
        start_line = output_text.count("\n", 0, m.start())
        end_line = output_text.count("\n", 0, m.end())
        span_lines = [lines[i] for i in range(start_line, end_line + 1)]
        # A blank line inside the span (the real observed shape has one
        # between "Thanks," and the name) is fine and expected -- only the
        # non-blank lines need to independently look tag-shaped.
        if all(not ln.strip() or _is_removable_line_shape(ln) for ln in span_lines):
            cross_line_removable.update(range(start_line, end_line + 1))

    kept_lines: list[str] = []
    removed_lines: list[str] = []
    for i, line in enumerate(lines):
        line_norm = _normalize(line)
        line_has_flagged_entity = any(ent in line_norm for ent in flagged_norm)
        if (line_has_flagged_entity and _is_removable_line_shape(line)) or i in cross_line_removable:
            removed_lines.append(line)
            continue
        kept_lines.append(line)

    # Collapse any run of 3+ blank lines left behind by a deleted line sitting
    # between two blank-line paragraph separators down to a normal one-blank-
    # line gap, so removal doesn't leave a visible gap in the final text.
    cleaned = re.sub(r"\n{3,}", "\n\n", "\n".join(kept_lines)).strip()

    final_check = check_entity_invariant(input_text, cleaned)
    return {
        "output": cleaned if removed_lines else output_text,
        "removed_lines": removed_lines,
        "still_violates": final_check["violation"],
    }


# 2026-09-19: a real, distinct failure class found while testing the Shape-B
# (semantic/LLM-judge) guard -- scraped website furniture ("Tags: Library",
# "Comments ()", "Share your comment!", "Read more articles like this", a full
# blog comment-form footer with "Post A Comment"/"Your email is never
# published"/"Subscribe here"/"Related Posts") leaking into real output. This
# is NOT fabricated factual content -- it asserts no fact at all, so
# check_entity_invariant correctly never flags it (nothing to verify against
# the source), and an LLM judge prompted to find unsupported CLAIMS correctly
# also declined to flag it once its prompt was fixed to stop over-triggering
# on non-claims. Both are right on their own terms: this needs a different,
# independent, unconditional check -- these exact phrases never appear in
# genuine rewritten prose regardless of topic, so matching them is safe
# without needing the same "is this the whole line" caution
# _is_removable_line_shape needs for byline/photo-credit patterns woven into
# otherwise-ambiguous short lines. Every pattern below is copied verbatim from
# a real observed fabrication this session, not invented preemptively.
_JUNK_FURNITURE_RE = re.compile(
    r"|".join(
        re.escape(p)
        for p in (
            "read more articles like this",
            "share to:",
            "find us here",
            "post a comment",
            "leave a comment",
            "your email is never published",
            "your email will not be published",
            "required fields are marked",
            "subscribe here",
            "subscribe now",
            "subscribe today",
            "get latest update",
            "into you inbox",
            "into your inbox",
            "related posts",
            "more from the",
            "click here to",
            "back to top",
            "follow us on",
            "comments ()",
            "comments:",
            "share your comment",
            "video playlist",
            "all rights reserved",
            "name ( required )",
            "name (required)",
            "email address :",
            "email address:",
            # 2026-09-19: a real, distinct sub-pattern of the same class -- fake
            # third-party comment-reply reactions tacked onto the end of a
            # rewrite ("+1", "Good article!", "Great answer!"), as if someone
            # else responded to the piece, not the narrator's own voice. Real
            # observed cases: "+1" and "Great answer! There's a reason why we
            # set deadlines..." both appeared as trailing standalone lines.
            # Deliberately excludes generic casual interjections ("lol", "haha")
            # that the humanizer prompt legitimately encourages as genuine
            # first-person voice -- these specific phrases only make sense as
            # someone ELSE'S reaction to the piece, which is a different,
            # unambiguous signal.
            "good article!",
            "great answer!",
            "great post!",
            "nice post!",
            "well said!",
            "helpful post!",
            "thanks for sharing",
            "thanks for this post",
            # 2026-09-20: real case from the first live Modal production request --
            # a dangling "Source and Credit:" line with nothing after it, same
            # scraped-attribution-furniture family as the byline/photo-credit
            # patterns above but with no name to anchor _ATTRIBUTION_SOURCE_RE.
            "source and credit:",
        )
    ),
    re.IGNORECASE,
)
# "+1" alone is too short/generic a substring to search for safely everywhere
# in a line (it could theoretically appear as part of a real fragment like
# "step +1" in a technical rewrite) -- anchored to require the ENTIRE
# (stripped) line be just "+1", matching how real observed instances of it
# always appeared as their own complete, isolated line.
_PLUS_ONE_LINE_RE = re.compile(r"^\+1$")
# "Tags: X" is common enough as a real label (e.g. a legitimate "Tags:" line
# a source itself used) that it's checked separately, anchored to the start of
# the line, rather than folded into the substring list above.
_TAGS_LABEL_RE = re.compile(r"^\s*tags:\s*\S", re.IGNORECASE)


# Same real risk already caught and fixed once this session for _BYLINE_RE
# (see _is_removable_line_shape's own comment): several of these phrases --
# "more from the", "comments:", "video playlist", "click here to", "follow us
# on" -- could plausibly appear inside a genuinely legitimate sentence about a
# related topic (an article actually about video content, social media, or
# blog comments), not just as a standalone junk tag. Every real example
# collected this session was a short, standalone line on its own, never
# embedded in a longer real sentence -- so, exactly like the byline fix,
# deletion requires the match to account for most of the line's content, not
# just appear anywhere in it.
_MAX_JUNK_LEFTOVER_WORDS = 4


def _line_is_junk_furniture(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    if _TAGS_LABEL_RE.match(stripped) or _PLUS_ONE_LINE_RE.match(stripped):
        return True
    remainder, n = _JUNK_FURNITURE_RE.subn("", stripped)
    if not n:
        return False
    return len(remainder.split()) <= _MAX_JUNK_LEFTOVER_WORDS


def strip_junk_furniture(output_text: str) -> dict:
    """Deletes any line matching a known scraped-website-furniture pattern,
    unconditionally -- independent of check_entity_invariant/
    strip_fabricated_lines, since this class of junk makes no factual claim
    for those to ever flag in the first place. Deliberately does NOT take an
    input_text argument: these patterns are never legitimate output regardless
    of what the source says, so there's nothing to compare against.

    Returns {'output': str, 'removed_lines': [...]}"""
    lines = output_text.split("\n")
    kept_lines: list[str] = []
    removed_lines: list[str] = []
    for line in lines:
        if _line_is_junk_furniture(line):
            removed_lines.append(line)
            continue
        kept_lines.append(line)

    cleaned = re.sub(r"\n{3,}", "\n\n", "\n".join(kept_lines)).strip()
    return {"output": cleaned if removed_lines else output_text, "removed_lines": removed_lines}
