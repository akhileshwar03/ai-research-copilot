"""Step 1 — corpus collection (Phase 2, Humaniser LoRA fine-tune).

Pulls human-authored text from license-permissive Hugging Face datasets,
filters (English, 150-1200 words, prose), near-duplicate-removes (MinHash),
and loads into `finetune_samples`. Resumable: a local cursor file tracks how
many rows of each streamed source have already been scanned, and inserts are
idempotent (exact-text hash + MinHash near-dup checks run against the full
existing DB content, not just the current run).

Usage:
    cd backend && source venv/bin/activate
    python -m scripts.finetune.collect
"""

import hashlib
import html
import json
import logging
import re
from pathlib import Path

import ftfy
from datasets import load_dataset
from datasketch import MinHash, MinHashLSH
from langdetect import LangDetectException, detect

from app.db.models.finetune_sample import FinetuneSample
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

STATE_FILE = Path(__file__).parent / ".collect_cursor.json"
NUM_PERM = 64
LSH_THRESHOLD = 0.85

MIN_WORDS = 150  # raised back from a brief 100 (2026-08-06) -- user wants every chunk >= 150 words
MAX_WORDS = 1200
# Checkpoint corpus target (2026-08-06 reopen) -- originally 20,000, up from
# the original 4,231-example corpus. See STATE.md "PHASE 2 REOPENED" section
# for the full reasoning: the original attempt's low pass rate looks like a
# data-scale problem, not a wrong approach, and this checkpoint exists
# specifically to test that cheaply before committing to a much larger
# rebuild. Held at 24,000 in round 7 despite dropping billsum/wikipedia --
# openwebtext's target was raised to cover the gap (see SOURCES below).
TARGET_TOTAL = 24000

# PER-SOURCE HARD CAP, enforced downstream at export time (not here -- this
# script is additive/resumable). Originally existed to stop one source
# dominating the corpus with a narrow, formulaic register (the original
# attempt's contamination bug was ~30-37% of a style bucket from one internal
# HF sub-source). Round 7 deliberately breaks that symmetry: with billsum and
# wikipedia gone, only 2 sources remain by design (both `normal`-register per
# the user's explicit "pure neutral/normal text" instruction), and openwebtext
# is expected -- intentionally -- to carry the large majority of the corpus,
# since hackernews' pre-2018/150-word pool has a hard, already-measured
# ceiling (~4,831) openwebtext doesn't share. Raised to 20,000 so it isn't
# the thing capping openwebtext's growth; the real ceiling is `target_rows`
# per source now, not this.
SOURCE_CAP = 20000

# Each entry: HF dataset id, license, which fields carry the text/label, and
# how many qualifying rows to pull from it this run.
#
# NOTE on sourcing (2026-08-06 checkpoint): several originally-sketched
# sources were dropped after checking real license metadata via HfApi rather
# than assuming -- Blog Authorship Corpus (license "unknown"), Yelp reviews
# (license "other" -- Yelp's academic release has non-commercial terms),
# CC-News (license "unknown", murky publisher copyright on scraped news),
# and StackExchange (CC-BY-NC-SA -- explicitly non-commercial, disqualifying
# for a shipping product). CFPB/consumer-finance-complaints looked clean
# (CC0) but its HF loading script is broken (`ValueError: not enough values
# to unpack`, a stale script vs. current CSV schema) -- dropped, not worth
# patching a third-party loader for one source. Ended up with 5 verified
# MIT/CC0/Apache-2.0 sources instead of the originally-hoped-for 7.
#
# Earlier history: the user's original spec named `andythetechnerd03/AI-human-text`
# as the primary source. Investigated and swapped out — its text has stripped
# punctuation/spacing (e.g. "improves safetyvaubans streets" — words run
# together), unusable as clean generation ground truth, and it's a single
# fixed set of ~15 argumentative essay prompts (near-zero register diversity).
#
# 2026-08-07 "no risk at all" pass: artem9k/ai-text-detection-pile dropped
# entirely. It has no per-row date field, and a direct spot-check of its
# content confirmed rows referencing 2021/2022 events (e.g. an essay titled
# "2022 Russian Invasion of Ukraine in Global Media Coverage") -- meaning
# its "human" label cannot be trusted to predate ChatGPT (Nov 2022) the way
# billsum/hackernews/wikipedia now can be verified to. User asked to push
# the whole corpus toward 2016/2017-era text specifically to make AI
# contamination structurally impossible, not just unlikely -- an
# unverifiable-date source doesn't meet that bar, so it's out rather than
# patched. (This also fully retires the IvyPanda-essay contamination risk
# that source needed a dedicated filter for -- one less thing to trust.)
#
# Checked for a matching 2016/2017 Wikipedia replacement dump on HF before
# deciding to keep legacy-datasets/wikipedia's 20220301.en config: the only
# hit (Ti-Ma/wikipedia_2017) turned out to be a raw revision-history dump,
# not clean article text -- sample rows were bot warning messages on user
# Talk pages and user subpages (e.g. title "Newlyfan/Murray Norton"), not
# encyclopedia prose. Swapping to it would trade a real, demonstrated
# quality/contamination problem for a marginal date improvement that's
# already covered: 20220301.en predates ChatGPT's Nov 2022 launch by 9
# months, which is the actual causal risk boundary (see STATE.md), not
# "how many years back can we go." Kept as-is.

CUTOFF_2018 = 1514764800  # 2018-01-01T00:00:00Z, unix seconds

# 2026-08-07: found by direct sample inspection of collected openwebtext
# rows -- raw scraped web pages carry a lot of surrounding page "chrome"
# (subscribe widgets, share buttons, cookie/privacy boilerplate, related-
# articles blocks) that HTML-to-text extraction sometimes leaves fused into
# the article body with no clean line boundary to surgically cut (e.g. "Get
# the biggest daily stories by email Subscribe Thank you for subscribing..."
# runs straight into real content, no punctuation gap). Quantified across
# all 5,169 collected rows: 8.8% (453) carried at least one of these
# signatures. Unlike the citation/photo-credit/disclaimer fixes above,
# these aren't safe to surgically strip mid-sentence -- the boundary between
# junk and real prose is often ambiguous. Follows the same precedent as
# is_ivypanda_pattern(): reject the whole row rather than risk a mangled
# partial edit.
_WEB_CHROME_PATTERN = re.compile(
    r"Subscribe|[Nn]ewsletter|Sign up for|Follow (us|him|her|them) on (Twitter|Facebook)|"
    r"Share this (article|story)|Share on (Facebook|Twitter)|"
    r"^(Advertisement|Related Articles?|Related Stories?|Continue [Rr]eading)\s*$|"
    r"[Cc]ookie [Pp]olicy|[Pp]rivacy [Nn]otice|[Pp]rivacy [Pp]olicy|[Tt]erms of [Ss]ervice|"
    r"[Aa]ll rights reserved|[Cc]lick here|"
    r"opinions expressed|views expressed",
    re.MULTILINE,
)


def is_web_chrome_pattern(text: str) -> bool:
    """Flags raw-scrape page chrome (subscribe/share/cookie/disclaimer
    boilerplate) that HTML-to-text extraction left fused into the article
    body -- see comment above for the 8.8%-of-5,169 measurement that found
    this."""
    return bool(_WEB_CHROME_PATTERN.search(text))


# 2026-08-07, round 7 -- billsum and wikipedia removed entirely. Production
# (frontend/app/humanizer/page.tsx) only ever ships `normal` style -- "blog
# posts, social copy, product writing, natural and direct" per the pipeline's
# own STYLE_GUIDANCE -- `clear_structured`/`simple_formal` are parked in the
# code but nothing calls them. billsum (legislative-formal) and wikipedia
# (encyclopedic-formal) are exactly the two registers production doesn't
# need; keeping them in the training corpus would spend the LoRA's limited
# capacity on styles nothing ships, diluting the one register the GPTZero
# checkpoint actually tests. User's explicit instruction: pure neutral/normal
# human text only. hackernews-comments and openwebtext both land in `normal`
# by heuristic register (casual/conversational and blog/news-article prose
# respectively) and are kept; openwebtext's target raised substantially to
# make up the volume billsum+wikipedia (14,000 rows) leave behind, since it's
# the more scalable of the two (hackernews' pre-2018/150-word-min pool is a
# hard, already-measured ceiling around ~4,831 rows; openwebtext's is not).

SOURCES = [
    {
        # Real Hacker News comments -- casual, tech-register `normal` text.
        # Raw item dump mixes stories (text=None, just a URL/title) and
        # comments; row_filter keeps only actual comment text AND requires
        # `time` (unix seconds) to be before 2018-01-01, so nothing in this
        # source can postdate ChatGPT even indirectly.
        #
        # `skip_shuffle` -- the underlying stream is in chronological item-id
        # order (confirmed empirically: item id 46 = Oct 2006). Discovered
        # the hard way that this source needs special handling: the default
        # shuffle(buffer_size=10000) only randomizes *within* a narrow local
        # time window at any given point in the stream, so early on it still
        # correctly samples pre-2018 rows, but as the buffer slides forward
        # into 2018+ territory (the vast majority of comment volume, since
        # HN usage grew over time) every row_filter check starts failing and
        # the scan would burn enormous bandwidth/time finding nothing. Since
        # we only want the pre-2018 rows anyway and the stream is already
        # chronological, skipping the shuffle and reading straight from the
        # start is strictly better here -- and `break_when` (below) lets the
        # main loop stop the instant the stream crosses the cutoff instead
        # of scanning for a target_rows count that will never be reached
        # once we're past it.
        "id": "nixiesearch/hackernews-comments",
        "license": "apache-2.0",
        "text_field": "text",
        "label_field": None,
        "human_value": None,
        "skip_shuffle": True,
        "row_filter": lambda row: (
            row.get("type") == "comment"
            and bool(row.get("text"))
            and row.get("time") is not None
            and row.get("time") < CUTOFF_2018
        ),
        "break_when": lambda row: row.get("time") is not None and row.get("time") >= CUTOFF_2018,
        "target_rows": 7000,
    },
    {
        # 2026-08-07, round 6 -- added to fill a real register gap: after
        # dropping artem9k and Enron, the corpus was left with only two
        # formal/institutional registers (billsum, wikipedia) plus one
        # narrow casual one (terse hackernews comments) -- nothing matching
        # ordinary neutral prose (blog/opinion/news-style writing), which is
        # the register most real "humanize this AI text" requests probably
        # land in.
        #
        # Skylion007/openwebtext is the open (CC0-1.0, verified via HfApi)
        # replication of WebText -- the corpus OpenAI built for GPT-2's own
        # pretraining: outbound URLs from Reddit submissions with karma>=3,
        # documented and widely cited as collected only through December
        # 2017. That makes it date-safe by construction, same as billsum,
        # with no per-row filter needed -- and ironically it's literally the
        # kind of "natural, neutral human writing" text an early GPT model
        # was itself trained on, which is about as strong a same-era human
        # writing signal as exists on HF.
        # Target raised 6,000 -> 19,000 in round 7 (see note above SOURCES) to
        # carry the corpus's volume alone now that billsum/wikipedia are
        # gone -- this dataset has ~8M documents, far more headroom than
        # hackernews' hard pre-2018/150-word ceiling.
        "id": "Skylion007/openwebtext",
        "license": "cc0-1.0",
        "text_field": "text",
        "label_field": None,
        "human_value": None,
        "row_filter": lambda row: not is_web_chrome_pattern(row.get("text", "") or ""),
        "target_rows": 19000,
        "load_kwargs": {"trust_remote_code": True},
    },
]


_WIKI_TAIL_SECTION = re.compile(
    r"^\s*(References|Further reading|External links|Bibliography|Citations|See also|Notes)\s*$",
    re.MULTILINE,
)


def strip_wikipedia_tail(text: str) -> str:
    """Truncate at the first References/Further reading/External links/etc.
    heading -- these are standard trailing sections on nearly every Wikipedia
    article (confirmed: 87.9% of 5,000 collected chunks contained one, worse
    than the 30.8% contamination just found and fixed in artem9k). Cutting
    the tail before chunking removes it surgically, keeping the clean body
    prose (the large majority of every article) instead of rejecting whole
    articles outright."""
    match = _WIKI_TAIL_SECTION.search(text)
    return text[: match.start()] if match else text


# 2026-08-07: broadened after the narrower version missed real leaks --
# 5/5000 rows still had markup like "Alternate: Joe Polo|}" (pipe mid-line,
# not line-start), "!rowspan=2|Competition" (no space after !), and
# "|- class=\"sortbottom\"" (trailing content after |-). Pipe characters
# essentially never appear in legitimate English prose, so "contains a pipe
# anywhere" or "starts with !" is a far more robust signal than trying to
# enumerate every wikitext markup variant.
def _is_wikitext_table_line(line: str) -> bool:
    return "|" in line or line.startswith("!")


def wikipedia_chunks(text: str, max_chunks: int = 3) -> list[str]:
    """Split one Wikipedia article into up to `max_chunks` paragraph-level
    pieces, each within [MIN_WORDS, MAX_WORDS] where possible. Capped per
    article (not just per-dataset via SOURCE_CAP) so a handful of very long
    articles can't dominate the Wikipedia slice's topic diversity."""
    text = strip_wikipedia_tail(text)
    # Drop individual lines that are leftover raw MediaWiki table markup
    # (infoboxes/tables that survived the dataset's own text extraction) --
    # confirmed 2.6% of collected chunks had this leak through, e.g. a
    # filmography table's "Notes" column header mistaken for a references
    # section on an earlier check. Surgical per-line removal, same
    # philosophy as strip_wikipedia_tail: drop the noise, keep the prose.
    paragraphs = [
        p.strip() for p in text.split("\n") if p.strip() and not _is_wikitext_table_line(p.strip())
    ]
    chunks: list[str] = []
    current: list[str] = []
    current_words = 0
    for p in paragraphs:
        pw = len(p.split())
        if current_words + pw > MAX_WORDS and current:
            chunks.append("\n\n".join(current))
            if len(chunks) >= max_chunks:
                return chunks
            current, current_words = [], 0
        current.append(p)
        current_words += pw
    if current and current_words >= MIN_WORDS and len(chunks) < max_chunks:
        chunks.append("\n\n".join(current))
    return chunks

_MULTI_BLANK_LINE = re.compile(r"\n{3,}")

# 2026-08-07 "be strict" pass -- user's explicit ask: strip anything that
# would teach the model citation/email artifacts instead of plain prose,
# applied globally to every source (not just Wikipedia/Enron-specific fixes
# from earlier passes). Two categories:
#
# 1. Inline citation markers -- Wikipedia-style bracket refs ([12], [citation
#    needed], [note 3]) and academic parenthetical author-year cites
#    (Smith, 2016), (Smith et al., 2016; Jones, 2017) -- these leak through
#    strip_wikipedia_tail (which only cuts the trailing References *section*,
#    not inline markers in the body) and would show up in any source that
#    quotes/cites something.
_INLINE_BRACKET_CITATION = re.compile(
    r"\[\s*(?:\d{1,3}(?:\s*[,–-]\s*\d{1,3})*|citation needed|clarification needed|note \d+)\s*\]",
    re.IGNORECASE,
)
_PAREN_AUTHOR_YEAR_CITATION = re.compile(
    r"\(\s*[A-Z][a-zA-Z'’-]+(?:\s+(?:et al\.?|and|&)\s+[A-Z][a-zA-Z'’-]+)?,?\s+(?:19|20)\d{2}[a-z]?"
    r"(?:\s*[;,]\s*[A-Z][a-zA-Z'’-]+(?:\s+(?:et al\.?|and|&)\s+[A-Z][a-zA-Z'’-]+)?,?\s+(?:19|20)\d{2}[a-z]?)*"
    r"\s*\)"
)

# 2. Email/forwarding artifacts -- header lines and quoting boilerplate.
#    Enron was already dropped wholesale for this (77% header noise, not
#    cheaply fixable at the time), but this is a cheap, general per-line
#    filter worth applying everywhere as a backstop, in case any other
#    source's prose ever quotes/pastes an email inline.
_EMAIL_HEADER_LINE = re.compile(r"^\s*(From|To|Cc|Bcc|Subject|Sent|Date|Reply-To)\s*:\s*\S", re.IGNORECASE)
_EMAIL_QUOTE_BOILERPLATE = re.compile(
    r"^\s*(-{2,}\s*Original Message\s*-{2,}|On .{0,80} wrote:|>{1,}\s?.*)\s*$", re.IGNORECASE
)
# Article byline lines -- found 2026-08-07 alongside the mojibake sweep (a
# row started "Author: Nathan Willis\n\n" before the real prose). Not an
# email header, but the same "metadata line, not prose" category. First cut
# only matched a bare "Label: Full Name" line and missed real variety in the
# wild ("Author: Dr. Tony Phillips | Production editor: ...", "By: Amid
# Zayed. 20 March, 2015", "Author: SMTV24x7" -- not even a person's name,
# a channel handle) -- broadened to match the whole line whenever it starts
# with one of these labels, since no genuine prose sentence starts with
# "Author:"/"By:"/"Written by:" as a literal label.
_BYLINE_LINE = re.compile(r"^\s*(Author|By|Written by)\s*:\s*\S.*$")
# Bare bullet-list lines -- not "full text", just list fragments; numbered
# prose sentences ("1. The" as a real sentence start) are left alone since
# this only matches a bullet glyph, not a digit.
_BULLET_LINE = re.compile(r"^\s*[•‣◦⁃∙*\-]\s+\S")

# 3. News/web boilerplate -- added 2026-08-07 alongside openwebtext (real
#    scraped web articles carry this kind of wrapper noise that a genuine
#    human author didn't "write" as part of the prose): photo credit parens
#    like "(Melina Mara/The Washington Post)" or "(Photo: Reuters)" -- found
#    by direct sample inspection to often be *fused onto the end of the
#    preceding sentence* rather than on their own line (e.g. "...on
#    Saturday. (Melina Mara/The Washington Post)"), so this has to be a
#    substitution like the citation patterns above, not a full-line filter --
#    and fixed-template legal disclaimer lines like "The opinions expressed
#    by columnists are their own...", which genuinely are always their own
#    line, so that one stays a line-level filter.
_PHOTO_CREDIT_PAREN = re.compile(
    r"\(\s*(?:Photo|Image|AP|Reuters|Getty)?[:]?\s*[A-Z][\w .,'-]+/[A-Z][\w .,'&-]+\)"
)
_DISCLAIMER_LINE = re.compile(
    r"^\s*(The opinions expressed|The views (and opinions )?expressed|"
    r"This (article|post|content) (was )?(originally )?(published|appeared)|"
    r"All rights reserved\.?)\b.*$",
    re.IGNORECASE,
)


# 4. ASCII-art divider lines -- found 2026-08-07 while investigating a
#    within-row self-repetition scan (see has_self_repeated_block below):
#    rows with lines like "____________________" or "...................."
#    used as a visual section divider. Not prose, and not caught by any
#    filter above.
_DIVIDER_LINE = re.compile(r"^\s*[-_.=*~]{8,}\s*$")


def _strip_line_level_noise(text: str) -> str:
    kept_lines = [
        line
        for line in text.split("\n")
        if not _EMAIL_HEADER_LINE.match(line)
        and not _EMAIL_QUOTE_BOILERPLATE.match(line)
        and not _BULLET_LINE.match(line)
        and not _DISCLAIMER_LINE.match(line)
        and not _DIVIDER_LINE.match(line)
        and not _BYLINE_LINE.match(line)
    ]
    return "\n".join(kept_lines)


def strip_citations(text: str) -> str:
    """Remove inline citation markers (bracket refs, author-year parens) and
    email/list artifacts, line by line and pattern by pattern, so the model
    only ever sees plain continuous prose -- per explicit user instruction
    to be strict about this rather than accept 'mostly clean'."""
    text = _strip_line_level_noise(text)
    text = _INLINE_BRACKET_CITATION.sub("", text)
    text = _PAREN_AUTHOR_YEAR_CITATION.sub("", text)
    text = _PHOTO_CREDIT_PAREN.sub("", text)
    # Citation removal can leave doubled spaces / space-before-punctuation
    # ("the study  found" or "result ." after a stripped cite) -- tidy up.
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\s+([.,;:])", r"\1", text)
    return text


def fix_encoding(text: str) -> str:
    """Repairs mojibake (double-encoded UTF-8, e.g. "canÃ¢Â\x80Â\x99t" -> "can't")
    via ftfy, and decodes leftover HTML entities (&amp;, &#42;, &lt;) via
    html.unescape -- looped a few times since scraped pages sometimes carry
    multi-encoded chains like "&amp;amp;amp;lt;" that need repeated passes to
    fully resolve. Found 2026-08-07: 25/23,999 rows had mojibake, 438/23,999
    had leftover entities -- both real, both fixed here rather than dropped,
    since the underlying content is genuine and salvageable (unlike the
    web-chrome/self-repeat cases, which get rejected outright below)."""
    text = ftfy.fix_text(text)
    for _ in range(5):
        unescaped = html.unescape(text)
        if unescaped == text:
            break
        text = unescaped
    # Residual case ftfy can't catch: a stray U+00C2 ("Â") immediately before
    # a space, left behind when a non-breaking space (bytes C2 A0) gets
    # double-decoded into "Â" + a plain space rather than one clean
    # character. By this point it's syntactically valid standalone Unicode
    # (no encoding ambiguity left for ftfy to detect), so it survives
    # ftfy.fix_text() untouched -- confirmed 2026-08-07 via
    # ftfy.explain_unicode() on a real sample ("Rated 4.5 out of 5 Â by").
    # "Â" directly followed by a space is not a real English usage, so a
    # direct substitution here is safe.
    text = text.replace("Â ", " ")
    return text


def word_count(text: str) -> int:
    return len(text.split())


def clean_text(text: str) -> str:
    text = text.strip()
    text = fix_encoding(text)
    text = strip_citations(text)
    text = _MULTI_BLANK_LINE.sub("\n\n", text)
    return text.strip()


def has_self_repeated_block(text: str, chunk: int = 60) -> bool:
    """Flags a verbatim `chunk`-char block repeated later in the same text --
    a signal of scrape-extraction duplication (e.g. an intro/snippet and the
    full body both captured), not normal human writing (real rhetorical
    repetition is short phrases with variation, not 60+ identical chars).
    Found 2026-08-07: 62/23,999 rows had this. Same precedent as
    is_web_chrome_pattern -- reject the row rather than try to surgically
    dedupe within it."""
    seen: set[str] = set()
    for i in range(0, len(text) - chunk, chunk):
        block = text[i : i + chunk]
        if block in seen:
            return True
        seen.add(block)
    return False


def is_english(text: str) -> bool:
    try:
        return detect(text[:1000]) == "en"
    except LangDetectException:
        return False


def load_cursor() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


def save_cursor(cursor: dict) -> None:
    STATE_FILE.write_text(json.dumps(cursor, indent=2))


def make_minhash(text: str) -> MinHash:
    mh = MinHash(num_perm=NUM_PERM)
    for token in set(text.lower().split()):
        mh.update(token.encode("utf-8"))
    return mh


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    db = SessionLocal()
    cursor = load_cursor()

    # Seed exact-hash + near-dup (MinHash LSH) state from what's already in
    # the DB, so re-running this script (or adding a new source later) never
    # inserts a true duplicate of something collected in an earlier run.
    lsh = MinHashLSH(threshold=LSH_THRESHOLD, num_perm=NUM_PERM)
    seen_hashes: set[str] = set()
    existing_rows = db.query(FinetuneSample.id, FinetuneSample.human_text, FinetuneSample.source).all()
    for row_id, text, _src in existing_rows:
        seen_hashes.add(hashlib.sha256(text.encode("utf-8")).hexdigest())
        lsh.insert(f"existing:{row_id}", make_minhash(text))
    existing_count = len(existing_rows)
    logger.info("Starting collection. %d samples already in DB.", existing_count)

    # Per-source counts, live-updated as rows are inserted below -- enforces
    # SOURCE_CAP *during* collection, not just at export time. Found the hard
    # way (2026-08-06): raising SOURCE_CAP without this let billsum and
    # hackernews overshoot to 8,557/7,000 rows on stale target_rows numbers,
    # consuming the entire TARGET_TOTAL budget before wikipedia (last in
    # SOURCES) got anything at all. export.py's cap_by_source() is still the
    # final word on what actually reaches training, but wasting collection
    # time/HF-API-quota on rows that'll just get discarded is its own bug.
    existing_per_source: dict[str, int] = {}
    for _id, _text, src in existing_rows:
        existing_per_source[src] = existing_per_source.get(src, 0) + 1

    total_inserted = 0
    composition: dict[str, int] = {}

    for source in SOURCES:
        if existing_count + total_inserted >= TARGET_TOTAL:
            logger.info("Target total already reached, skipping remaining sources.")
            break

        src_id = source["id"]
        if source["target_rows"] <= 0:
            logger.info("Skipping %s -- target_rows=0 (already at/near cap from a prior run)", src_id)
            continue
        if existing_per_source.get(src_id, 0) >= SOURCE_CAP:
            logger.info(
                "Skipping %s -- already at/over SOURCE_CAP (%d >= %d)",
                src_id, existing_per_source.get(src_id, 0), SOURCE_CAP,
            )
            continue

        skip_rows = cursor.get(src_id, 0)
        logger.info("Streaming %s (resuming after row %d)", src_id, skip_rows)

        ds = load_dataset(
            src_id, source.get("config"), split="train", streaming=True, **source.get("load_kwargs", {})
        )
        # Shuffle the stream -- without this, "first N qualifying rows" samples
        # whatever sub-source happens to be first in file/shard order, not a
        # representative cross-section. buffer_size=10000 trades memory for
        # shuffle quality; a HF streaming shuffle only randomizes within a
        # sliding buffer, not the whole dataset, so it's not perfect, but it
        # breaks up long same-source runs.
        #
        # `skip_shuffle` opts a source out of this (currently just
        # hackernews-comments, which is chronologically ordered and needs to
        # be read start-to-end, not locally shuffled, to stay inside its
        # pre-2018 date cutoff -- see that source's comment for why).
        if not source.get("skip_shuffle"):
            ds = ds.shuffle(seed=42, buffer_size=10000)
        collected_this_source = 0
        scanned = 0

        for i, row in enumerate(ds):
            if i < skip_rows:
                continue
            scanned = i - skip_rows + 1

            if collected_this_source >= source["target_rows"]:
                break
            if existing_count + total_inserted >= TARGET_TOTAL:
                break
            if existing_per_source.get(src_id, 0) + collected_this_source >= SOURCE_CAP:
                break
            break_when = source.get("break_when")
            if break_when is not None and break_when(row):
                logger.info(
                    "%s: break_when triggered at row %d -- stream has crossed the cutoff, stopping scan.",
                    src_id, i,
                )
                break

            if source["label_field"] is not None and row.get(source["label_field"]) != source["human_value"]:
                continue
            row_filter = source.get("row_filter")
            if row_filter is not None and not row_filter(row):
                continue

            raw_text = row.get(source["text_field"], "") or ""
            # `chunker` sources (currently just Wikipedia) yield multiple
            # candidate texts per streamed row -- full articles are far too
            # long to be one row, so split into paragraph-level pieces first.
            # Everything else keeps the original one-row-one-candidate path.
            candidates = wikipedia_chunks(raw_text) if source.get("chunker") else [clean_text(raw_text)]

            for text in candidates:
                if collected_this_source >= source["target_rows"]:
                    break
                if existing_count + total_inserted >= TARGET_TOTAL:
                    break
                if existing_per_source.get(src_id, 0) + collected_this_source >= SOURCE_CAP:
                    break

                text = clean_text(text)
                wc = word_count(text)
                if wc < MIN_WORDS or wc > MAX_WORDS:
                    continue
                if not is_english(text):
                    continue
                if has_self_repeated_block(text):
                    continue

                text_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
                if text_hash in seen_hashes:
                    continue

                mh = make_minhash(text)
                if lsh.query(mh):
                    continue
                lsh.insert(f"{src_id}:{i}:{len(seen_hashes)}", mh)
                seen_hashes.add(text_hash)

                db.add(
                    FinetuneSample(
                        human_text=text,
                        ai_text=None,
                        word_count=wc,
                        source=src_id,
                        license=source["license"],
                        style=None,
                        status="collected",
                    )
                )
                collected_this_source += 1
                total_inserted += 1

                if total_inserted % 500 == 0:
                    db.commit()
                    cursor[src_id] = skip_rows + scanned
                    save_cursor(cursor)
                    logger.info("Committed %d new samples so far (source=%s)", total_inserted, src_id)

        db.commit()
        cursor[src_id] = skip_rows + scanned
        save_cursor(cursor)
        composition[src_id] = collected_this_source
        logger.info(
            "Source %s done: %d new samples collected (scanned %d rows)", src_id, collected_this_source, scanned
        )

    print("\n" + "=" * 60)
    print("CORPUS COLLECTION SUMMARY")
    print("=" * 60)
    total_now = db.query(FinetuneSample).count()
    print(f"Total samples in finetune_samples: {total_now}")
    for src, n in composition.items():
        print(f"  {src}: +{n} new this run")

    word_counts = [r[0] for r in db.query(FinetuneSample.word_count).all()]
    if word_counts:
        print(
            f"Word count: min={min(word_counts)} max={max(word_counts)} "
            f"avg={sum(word_counts) / len(word_counts):.0f}"
        )

    licenses: dict[str, int] = {}
    for (lic,) in db.query(FinetuneSample.license).all():
        licenses[lic] = licenses.get(lic, 0) + 1
    print("By license:", licenses)

    db.close()


if __name__ == "__main__":
    main()
