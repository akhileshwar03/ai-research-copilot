from app.services.humanizer_ultra_service import _strip_html_artifacts


def test_strip_html_artifacts_removes_literal_italic_tags():
    # 2026-08-13: real bug, reproduced live against the actual Ollama endpoint -- the
    # fine-tuned LoRA occasionally emits literal HTML tags around quoted/emphasized
    # phrases instead of plain quotation marks. See humanizer_ultra_service.py's comment
    # above _strip_html_artifacts for the full incident writeup.
    raw = 'CLAUDE.md still said <i>not wired</i>.'
    assert _strip_html_artifacts(raw) == "CLAUDE.md still said not wired."


def test_strip_html_artifacts_removes_paragraph_and_bold_tags():
    raw = "<p><b>Verification done:</b></p> looks good"
    assert _strip_html_artifacts(raw) == "Verification done: looks good"


def test_strip_html_artifacts_unescapes_html_entities():
    # Same underlying corpus-contamination class of bug as the leftover HTML entities
    # documented in scripts/finetune/STATE.md's data-cleaning notes -- this endpoint is a
    # separate code path from tag.py's cleaning, so it needs its own guard.
    raw = "risk &amp; reward, always &lt;careful&gt;"
    assert _strip_html_artifacts(raw) == "risk & reward, always <careful>"


def test_strip_html_artifacts_leaves_clean_text_unchanged():
    raw = 'She said, "we need more time to finish this right."'
    assert _strip_html_artifacts(raw) == raw


def test_restores_space_dropped_after_a_sentence_period():
    # 2026-08-13: observed in a real 322-word run against the live endpoint — the LoRA
    # intermittently omits the space after a sentence-ending period.
    raw = "they eat up that savings in software licenses.Salesforce reported their savings."
    assert _strip_html_artifacts(raw) == (
        "they eat up that savings in software licenses. Salesforce reported their savings."
    )


def test_restores_space_dropped_after_a_period_following_a_closing_bracket():
    # Seen in a live 494-word browser run: the same dropped-space artifact, but with a
    # closing paren between the last word and the period, which the first version missed.
    raw = "how carefully they measure results (which is harder than it sounds).Lines of code are poor proxies."
    assert _strip_html_artifacts(raw) == (
        "how carefully they measure results (which is harder than it sounds). Lines of code are poor proxies."
    )


def test_missing_space_fix_leaves_abbreviations_domains_and_versions_alone():
    """The guard (two or more lowercase letters before the period) is what keeps this
    off initials, abbreviations, domains, markdown link targets, and version numbers."""
    for raw in (
        "He works at the U.S.A. office today",
        "See e.g.Foo for details",
        "Visit example.com/Bar today",
        "[link](https://foo.com/Baz) here",
        "version 1.2.Beta shipped",
        "Normal text. Next sentence is fine.",
    ):
        assert _strip_html_artifacts(raw) == raw


# ── Chunking / truncation / failure handling (2026-08-13 audit) ──────────────

import asyncio

import httpx
import pytest

from app.core.exceptions import AppError
from app.services.humanizer_ultra_service import (
    ULTRA_CHUNK_TARGET_WORDS,
    HumanizerUltraService,
    _MEASURED_GEN_TOKENS_PER_SECOND,
    _num_predict_for,
)


class _FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("boom", request=None, response=None)

    def json(self):
        return self._payload


class _FakeClient:
    """Records every /api/chat call so tests can assert on chunk count and the
    per-chunk num_predict actually sent."""

    def __init__(self, responder):
        self._responder = responder
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, json=None, headers=None):
        self.calls.append(json)
        self.urls = getattr(self, "urls", [])
        self.urls.append(url)
        self.headers = getattr(self, "headers", [])
        self.headers.append(headers)
        return self._responder(json)


def _patch_client(monkeypatch, responder):
    client = _FakeClient(responder)
    monkeypatch.setattr("app.services.humanizer_ultra_service.httpx.AsyncClient", lambda **kw: client)
    return client


def _ok(text):
    return lambda payload: _FakeResponse({"message": {"content": text}})


def _words(n):
    return " ".join(f"word{i}" for i in range(n))


def test_long_input_is_chunked_instead_of_timing_out(monkeypatch):
    """The real bug this fixes, reproduced live on 2026-08-13: a 936-word input —
    perfectly legal under the shared 3,000-word limit the UI advertises — was sent
    as ONE Ollama request and hit the 180s timeout every single time. Retrying could
    never help, because at the measured ~4.3 tok/s the work genuinely exceeds the
    budget in one request. Now it's split the same way the Basic pipeline splits."""
    text = "\n\n".join(_words(120) for _ in range(4))  # 480 words — under the cap, over one chunk
    client = _patch_client(monkeypatch, _ok("rewritten chunk"))

    result = asyncio.run(HumanizerUltraService().generate(text))

    assert len(client.calls) > 1, "long input must be split across several requests"
    for call in client.calls:
        user_msg = next(m for m in call["messages"] if m["role"] == "user")
        assert len(user_msg["content"].split()) <= ULTRA_CHUNK_TARGET_WORDS
    # Every chunk's output is present, and the four source paragraphs are still four.
    assert result.count("rewritten chunk") == len(client.calls)
    assert result.count("\n\n") == 3


def test_short_input_still_makes_exactly_one_request(monkeypatch):
    client = _patch_client(monkeypatch, _ok("rewritten"))

    result = asyncio.run(HumanizerUltraService().generate(_words(40)))

    assert len(client.calls) == 1
    assert result == "rewritten"


def test_num_predict_never_exceeds_what_the_timeout_can_generate():
    """The bug behind a real user report on 2026-08-13: a 153-word input timed out
    twice. num_predict was sized from expected output length alone and never checked
    against the time budget, so the two contradicted each other — a ~140-word chunk was
    allotted 760 tokens, and 760 tokens at the measured 4.3 tok/s is 177 seconds of
    generation against a 180-second timeout. Any chunk the model didn't cut short on its
    own ran out the clock. The ceiling is now derived from the timeout."""
    for words in (10, 100, 150, 500, 5000):
        allowance = _num_predict_for(_words(words), 180.0)
        generation_seconds = allowance / _MEASURED_GEN_TOKENS_PER_SECOND
        assert generation_seconds < 180.0 * 0.7, (
            f"{words}w asks for {allowance} tokens = {generation_seconds:.0f}s, too close to the 180s timeout"
        )

    # The old (pre-fix) sizing ignored the time budget entirely and would have asked
    # for 760 tokens here regardless of generation rate. Assert against the current
    # rate-derived ceiling rather than a hardcoded historical number, so this doesn't
    # silently stop meaning anything the next time _MEASURED_GEN_TOKENS_PER_SECOND
    # changes (as it did 2026-09-18, 7B -> 3B, 4.3 -> 10.0 tok/s) — the real invariant
    # is that sizing tracks the timeout budget, not a specific token count.
    budget_ceiling_140w = int(180.0 * _MEASURED_GEN_TOKENS_PER_SECOND * 0.6)
    assert _num_predict_for(_words(140), 180.0) <= max(760, budget_ceiling_140w)


def test_num_predict_ceiling_tracks_a_changed_timeout():
    """The ceiling is derived, not hardcoded — a longer configured timeout earns a
    proportionally larger allowance, and a shorter one is respected too."""
    assert _num_predict_for(_words(500), 600.0) > _num_predict_for(_words(500), 180.0)
    assert _num_predict_for(_words(500), 60.0) < _num_predict_for(_words(500), 180.0)


def test_num_predict_still_covers_the_expected_rewrite_length():
    """Measured: output runs about 2x the input in words (~2.7 tokens per input word).
    A normal chunk must not be truncated by the time-budget ceiling."""
    expected_tokens = ULTRA_CHUNK_TARGET_WORDS * 2.7
    assert _num_predict_for(_words(ULTRA_CHUNK_TARGET_WORDS), 180.0) > expected_tokens


def test_over_limit_input_is_refused_up_front_with_an_honest_message(monkeypatch):
    """Better an immediate 413 naming the real limit than a five-minute wait ending
    in a timeout the user can't do anything about."""
    client = _patch_client(monkeypatch, _ok("never reached"))

    with pytest.raises(AppError) as exc:
        asyncio.run(HumanizerUltraService().generate(_words(5000)))

    assert exc.value.status_code == 413
    assert exc.value.code == "ULTRA_TEXT_TOO_LONG"
    assert not client.calls, "must refuse before spending any model time"


def test_empty_model_response_raises_instead_of_returning_a_blank_success(monkeypatch):
    """Previously returned "" with a 200, which the frontend rendered as a completed
    run showing an empty result panel — a silent failure that looked like success."""
    _patch_client(monkeypatch, _ok("   "))

    with pytest.raises(AppError) as exc:
        asyncio.run(HumanizerUltraService().generate(_words(40)))

    assert exc.value.code == "ULTRA_EMPTY"


def test_ollama_error_field_on_a_200_is_treated_as_a_failure(monkeypatch):
    _patch_client(monkeypatch, lambda payload: _FakeResponse({"error": "model not found"}))

    with pytest.raises(AppError) as exc:
        asyncio.run(HumanizerUltraService().generate(_words(40)))

    assert exc.value.status_code == 502


def test_transport_errors_become_a_clean_503_not_a_bare_500(monkeypatch):
    """Only ConnectError and TimeoutException were caught before; the rest of the
    httpx transport family (ReadError, RemoteProtocolError, ...) escaped as an
    unhandled 500 with no usable message for the frontend."""
    def boom(payload):
        raise httpx.RemoteProtocolError("server disconnected")

    _patch_client(monkeypatch, boom)

    with pytest.raises(AppError) as exc:
        asyncio.run(HumanizerUltraService().generate(_words(40)))

    assert exc.value.status_code == 503
    assert exc.value.code == "ULTRA_UNAVAILABLE"


def test_connect_error_still_reports_unavailable(monkeypatch):
    def boom(payload):
        raise httpx.ConnectError("connection refused")

    _patch_client(monkeypatch, boom)

    with pytest.raises(AppError) as exc:
        asyncio.run(HumanizerUltraService().generate(_words(40)))

    assert exc.value.status_code == 503


def test_timeout_still_reports_timeout(monkeypatch):
    def boom(payload):
        raise httpx.ReadTimeout("too slow")

    _patch_client(monkeypatch, boom)

    with pytest.raises(AppError) as exc:
        asyncio.run(HumanizerUltraService().generate(_words(40)))

    assert exc.value.status_code == 504
    assert exc.value.code == "ULTRA_TIMEOUT"


def test_ultra_uses_the_prompt_the_lora_was_trained_on_not_the_aggressive_one(monkeypatch):
    """pipeline.py routes style=normal/expand=off to AGGRESSIVE_REWRITE_PROMPT, which
    the LoRA never saw during fine-tuning. Ultra must stay on export.py's training-time
    prompt (BASE_PROMPT + STRICT_HARD_RULES + STYLE_GUIDANCE + examples) — anything else
    is running the model out of distribution."""
    from app.services.humanizer.prompts import AGGRESSIVE_REWRITE_PROMPT, BASE_PROMPT, STRICT_HARD_RULES

    client = _patch_client(monkeypatch, _ok("rewritten"))
    asyncio.run(HumanizerUltraService().generate(_words(40)))

    system = next(m for m in client.calls[0]["messages"] if m["role"] == "system")["content"]
    assert BASE_PROMPT in system
    assert STRICT_HARD_RULES in system
    assert AGGRESSIVE_REWRITE_PROMPT not in system


def test_single_long_paragraph_is_split_instead_of_sent_whole(monkeypatch):
    """The gap a browser test caught on 2026-08-13, after the first round of chunking
    work. chunk_text never splits inside a paragraph — correct for the Basic pipeline,
    fatal here. A 494-word input with no blank lines anywhere (exactly what pasting an
    essay produces) came back as ONE chunk, went out as one request, and hit the 180s
    timeout just as it had before chunking existed. Paragraph-only chunking silently
    did nothing for the single most common input shape."""
    text = _words(494)  # one paragraph, zero blank lines
    assert "\n" not in text
    client = _patch_client(monkeypatch, _ok("rewritten piece"))

    asyncio.run(HumanizerUltraService().generate(text))

    assert len(client.calls) > 1, "a long single paragraph must still be split"
    for call in client.calls:
        user_msg = next(m for m in call["messages"] if m["role"] == "user")
        assert len(user_msg["content"].split()) <= ULTRA_CHUNK_TARGET_WORDS


def test_splitting_a_paragraph_does_not_invent_paragraph_breaks(monkeypatch):
    """Rejoining every chunk with a blank line would hand back a single paragraph
    broken into several — quietly changing the structure the rewrite promises to
    preserve. Mid-paragraph splits rejoin with a space."""
    sentences = " ".join(f"This is sentence number {i} and it runs on for a little while." for i in range(40))
    client = _patch_client(monkeypatch, _ok("Rewritten piece."))

    result = asyncio.run(HumanizerUltraService().generate(sentences))

    assert len(client.calls) > 1
    assert "\n\n" not in result, "a one-paragraph source must come back as one paragraph"


def test_real_paragraph_breaks_are_preserved_across_chunks(monkeypatch):
    """The inverse: genuine blank-line breaks in the source must survive."""
    text = "\n\n".join(_words(160) for _ in range(3))
    calls = {"n": 0}

    def responder(payload):
        calls["n"] += 1
        return _FakeResponse({"message": {"content": f"Rewritten {calls['n']}."}})

    _patch_client(monkeypatch, responder)
    result = asyncio.run(HumanizerUltraService().generate(text))

    assert result.count("\n\n") == 2, "three source paragraphs must stay three paragraphs"


# ── Scraped-corpus credit-line artifact (2026-08-13) ─────────────────────────

from app.services.humanizer_ultra_service import _strip_scraped_credit_lines


def test_strips_scraped_image_credit_furniture():
    """Reproduced live on a cold 140-word run about bees: the LoRA interleaved image
    caption and licence lines from its scraped training corpus through the output three
    times. None of it was in the input."""
    raw = (
        "Bee | Credits:\n\n"
        "CC-BY-2.0 image from freeimagearchive.com\n\n"
        "Bees are among the most important insects on Earth.\n\n"
        "Bee | Credits:\n\n"
        "CC-BY-2.0 image from freeimagearchive.com\n\n"
        "Inside a healthy hive, thousands of bees work together."
    )
    cleaned = _strip_scraped_credit_lines(raw, "Bees are important pollinators of crops.")

    assert "Credits" not in cleaned
    assert "freeimagearchive" not in cleaned
    assert "Bees are among the most important insects on Earth." in cleaned
    assert "Inside a healthy hive, thousands of bees work together." in cleaned
    assert "\n\n\n" not in cleaned


def test_credit_stripping_leaves_the_users_own_credit_lines_alone():
    """The guard must not eat real content. If the source itself is about image credits
    or licensing, the output is left completely untouched."""
    source = "Every photo needs an image credit line under a CC-BY licence."
    raw = "Photo credit: Jane Doe\n\nEvery image still needs its credit line under CC-BY."

    assert _strip_scraped_credit_lines(raw, source) == raw


def test_credit_stripping_is_a_no_op_on_ordinary_output():
    raw = "Bees pollinate crops.\n\nThey also make honey, which people have eaten for millennia."
    assert _strip_scraped_credit_lines(raw, "Bees pollinate crops and make honey.") == raw


def test_credit_stripping_handles_several_furniture_shapes():
    source = "The reef recovered faster than expected after the bleaching event."
    raw = (
        "Image courtesy of the marine institute\n"
        "The reef bounced back quicker than anyone predicted.\n"
        "Credits: Ocean Photo Archive"
    )
    cleaned = _strip_scraped_credit_lines(raw, source)

    assert cleaned == "The reef bounced back quicker than anyone predicted."


# ── Runaway-expansion guard (2026-08-13) ─────────────────────────────────────


def test_runaway_expansion_is_resampled(monkeypatch):
    """Reproduced back to back on identical 140-word input: one run returned a clean
    159-word rewrite, the next returned 507 words of invented material — section headings
    the source never had, a fabricated EFSA citation, named viruses absent from the input.
    With expand=False the product promises facts preserved and phrasing only, so a 3.6x
    expansion must not ship when a resample can land back in the good mode."""
    source = " ".join(["word"] * 100)
    runaway = " ".join(["filler"] * 400)  # 4x
    clean = " ".join(["rewritten"] * 110)  # 1.1x
    replies = iter([runaway, clean])

    client = _patch_client(monkeypatch, lambda payload: _FakeResponse({"message": {"content": next(replies)}}))
    result = asyncio.run(HumanizerUltraService().generate(source))

    assert len(client.calls) == 2, "the runaway output must trigger exactly one resample"
    assert result.startswith("rewritten")


def test_runaway_guard_keeps_the_closest_attempt_when_every_sample_is_bad(monkeypatch):
    """If resampling never recovers, ship the least-bad attempt rather than failing the
    run outright — and stop after the bounded budget instead of looping."""
    source = " ".join(["word"] * 100)
    replies = iter(
        [
            " ".join(["a"] * 900),
            " ".join(["b"] * 400),
            " ".join(["c"] * 600),
            " ".join(["d"] * 800),
            " ".join(["e"] * 700),
        ]
    )

    client = _patch_client(monkeypatch, lambda payload: _FakeResponse({"message": {"content": next(replies)}}))
    result = asyncio.run(HumanizerUltraService().generate(source))

    assert len(client.calls) == 5  # initial + 4 resamples, the configured ceiling
    assert result.startswith("b"), "the attempt closest to source length wins"


def test_expand_mode_is_exempt_from_the_expansion_guard(monkeypatch):
    """expand=True asks for elaboration explicitly — a longer result is the point."""
    source = " ".join(["word"] * 100)
    client = _patch_client(monkeypatch, _ok(" ".join(["elaborated"] * 400)))

    asyncio.run(HumanizerUltraService().generate(source, expand=True))

    assert len(client.calls) == 1, "no resampling when the user asked for elaboration"


def test_normal_length_output_is_not_resampled(monkeypatch):
    source = " ".join(["word"] * 100)
    client = _patch_client(monkeypatch, _ok(" ".join(["rewritten"] * 150)))

    asyncio.run(HumanizerUltraService().generate(source))

    assert len(client.calls) == 1


# ── Entity/citation invariant guard (2026-09-18) ─────────────────────────────
# Real, confirmed defect found validating the 3B follow-up LoRA: a fabricated
# quote attributed to a real person, an impossible anachronistic misquote, and
# fabricated bylines with invented dates -- all fitting inside an otherwise
# unremarkable length, so _MAX_EXPANSION_RATIO alone would ship them. See
# app/services/humanizer/entity_check.py's docstring for the full incident.


def test_fabricated_named_entity_is_resampled(monkeypatch):
    """A real, confirmed failure shape: the model invents a named source not
    present anywhere in the input. Length stays completely normal (1.0x) so
    only the entity guard, not the expansion guard, should trigger this."""
    source = "The company announced a new product line this quarter."
    fabricated = "The company announced a new line, said Marc Andreessen in an interview."
    clean = "The company announced a new product line this quarter, per the release."
    replies = iter([fabricated, clean])

    client = _patch_client(monkeypatch, lambda payload: _FakeResponse({"message": {"content": next(replies)}}))
    result = asyncio.run(HumanizerUltraService().generate(source))

    assert len(client.calls) == 2, "a fabricated named entity must trigger exactly one resample"
    assert "Andreessen" not in result


def test_standalone_fabricated_byline_is_stripped_without_spending_a_resample(monkeypatch):
    """Real fix (2026-09-19): when a fabrication shows up as its own standalone line
    (a byline, a photo credit) rather than woven into a real sentence, it should be
    deleted outright for free -- zero resamples spent -- instead of costing a full
    extra generation round trip the way test_fabricated_named_entity_is_resampled's
    inline case correctly still does."""
    source = "Public libraries have existed for a very long time, evolving from ancient scrolls to modern community spaces."
    fabricated = (
        "Public libraries have a long, rich history going back thousands of years, from ancient scrolls to today's spaces.\n\n"
        "Posted by Matthew Stibbe | March 30th, 2017."
    )
    client = _patch_client(monkeypatch, _ok(fabricated))
    result = asyncio.run(HumanizerUltraService().generate(source))

    assert len(client.calls) == 1, "a standalone fabricated line must be stripped for free, not resampled"
    assert "Matthew Stibbe" not in result
    assert "Public libraries have a long, rich history" in result


def test_entity_guard_keeps_least_fabricated_attempt_when_every_sample_invents(monkeypatch):
    """If resampling never lands on a clean attempt, ship whichever fabricated
    the fewest new entities rather than failing the run outright -- same
    least-bad philosophy as the expansion guard, bounded by the same budget."""
    source = "The team finished the project ahead of schedule."
    worse = "The team, led by Sarah Connor and John Smith, finished the Boston project early."
    better = "The team finished the Boston project ahead of schedule."
    replies = iter([worse, worse, better])

    client = _patch_client(monkeypatch, lambda payload: _FakeResponse({"message": {"content": next(replies)}}))
    result = asyncio.run(HumanizerUltraService().generate(source))

    assert len(client.calls) == 3  # initial + 2 resamples, the shared budget ceiling
    assert "Connor" not in result and "Smith" not in result


def test_output_reusing_only_source_entities_is_not_resampled(monkeypatch):
    """An entity that genuinely comes from the source (just rephrased around)
    must not trigger a resample -- only NEW entities are a violation."""
    source = "Marc Andreessen spoke at the conference about new technology trends."
    client = _patch_client(
        monkeypatch, _ok("At the conference, Marc Andreessen discussed emerging technology trends.")
    )

    asyncio.run(HumanizerUltraService().generate(source))

    assert len(client.calls) == 1


def test_scraped_website_furniture_is_stripped_without_a_resample(monkeypatch):
    """Real fabrication caught this session: a faithful rewrite had a full blog
    comment-form footer appended ("Read more articles like this", "Post A
    Comment", "Subscribe here..."). None of it asserts a fact, so
    check_entity_invariant never flags it -- this must be caught by the separate,
    unconditional strip_junk_furniture step, and for free (no resample), same as
    the standalone-byline case."""
    source = "Noise-cancelling headphones use active noise cancellation to block ambient sound so you can focus on your music more clearly in noisy environments."
    fabricated = (
        "Noise-cancelling headphones use active noise cancellation to block out ambient "
        "sound, letting you focus on your music more clearly even in noisy places.\n\n"
        "Read more articles like this\n\nPost A Comment\n\nSubscribe here and get latest update straight into you inbox..."
    )
    client = _patch_client(monkeypatch, _ok(fabricated))
    result = asyncio.run(HumanizerUltraService().generate(source))

    assert len(client.calls) == 1, "junk furniture must be stripped for free, not resampled"
    assert "Post A Comment" not in result
    assert "Subscribe here" not in result
    assert "Noise-cancelling headphones use active noise cancellation" in result


def test_strips_inline_scraped_cross_reference_prefix():
    """Live browser run on the bee text: a chunk came back opening with
    "See Wikipedia: Bee Despite being individual insects..." — scraped cross-reference
    furniture welded onto the front of real content. Dropping the whole line would take
    the sentence with it, so only the reference prefix is removed."""
    raw = "See Wikipedia: Bee Despite being individually small, bees collectively matter enormously."
    cleaned = _strip_scraped_credit_lines(raw, "Bees are small but collectively important.")

    assert cleaned == "Despite being individually small, bees collectively matter enormously."


def test_inline_reference_stripping_respects_a_source_that_mentions_wikipedia():
    source = "The Wikipedia article on bees is a good starting point for further reading."
    raw = "See Wikipedia: Bee for more on this topic."
    assert _strip_scraped_credit_lines(raw, source) == raw


# ── Backend dispatch: off / local / modal (2026-09-19) ───────────────────────


def test_backend_off_refuses_before_any_network_call(monkeypatch):
    """The 'off' backend must fail fast, before touching the network at all --
    otherwise a misconfigured 'off' state would still cold-start a Modal
    container or hit local Ollama needlessly."""
    monkeypatch.setattr("app.services.humanizer_ultra_service.runtime_settings.get", lambda key: "off")
    called = {"n": 0}

    def _boom(**kw):
        called["n"] += 1
        raise AssertionError("should never construct an httpx client when backend is off")

    monkeypatch.setattr("app.services.humanizer_ultra_service.httpx.AsyncClient", _boom)

    with pytest.raises(AppError) as exc:
        asyncio.run(HumanizerUltraService().generate("some text"))

    assert exc.value.code == "ULTRA_DISABLED"
    assert exc.value.status_code == 503
    assert called["n"] == 0


def test_backend_modal_hits_the_openai_compatible_endpoint_with_both_auth_layers(monkeypatch):
    """Real behavior verified live against the deployed Modal endpoint before writing
    this test (2026-09-19): both Modal's own proxy-auth headers (Modal-Key/Modal-Secret)
    and vLLM's --api-key (Authorization: Bearer) are required, and the request must be
    OpenAI-chat-completions shaped, not Ollama's /api/chat shape."""
    monkeypatch.setattr("app.services.humanizer_ultra_service.runtime_settings.get", lambda key: "modal")
    from app.core.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("HUMANIZER_ULTRA_MODAL_URL", "https://example.modal.direct")
    monkeypatch.setenv("HUMANIZER_ULTRA_MODAL_KEY", "wk-test")
    monkeypatch.setenv("HUMANIZER_ULTRA_MODAL_SECRET", "ws-test")
    monkeypatch.setenv("HUMANIZER_ULTRA_MODAL_API_KEY", "vllm-test-key")
    get_settings.cache_clear()

    def _responder(payload):
        return _FakeResponse({"choices": [{"message": {"content": "rewritten via modal"}}]})

    client = _patch_client(monkeypatch, _responder)
    result = asyncio.run(HumanizerUltraService().generate("some source text to rewrite"))

    assert result == "rewritten via modal"
    assert client.urls[0] == "https://example.modal.direct/v1/chat/completions"
    assert client.headers[0]["Modal-Key"] == "wk-test"
    assert client.headers[0]["Modal-Secret"] == "ws-test"
    assert client.headers[0]["Authorization"] == "Bearer vllm-test-key"
    # OpenAI chat-completions shape, not Ollama's {"messages": ..., "stream": ..., "options": ...}
    assert "messages" in client.calls[0]
    assert client.calls[0]["temperature"] == 1.0
    assert client.calls[0]["top_p"] == 0.95
    assert client.calls[0]["repetition_penalty"] == 1.15

    get_settings.cache_clear()


def test_backend_modal_retries_through_a_cold_start_503(monkeypatch):
    """Per Modal's own docs (verified 2026-09-19, not assumed): a 503 on a cold
    container is the documented "cold start just triggered, retry" signal, not a
    real failure. This must be retried, not surfaced as ULTRA_ERROR on the first 503."""
    monkeypatch.setattr("app.services.humanizer_ultra_service.runtime_settings.get", lambda key: "modal")
    monkeypatch.setattr("app.services.humanizer_ultra_service.asyncio.sleep", lambda *_: _instant_sleep())
    from app.core.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("HUMANIZER_ULTRA_MODAL_URL", "https://example.modal.direct")
    monkeypatch.setenv("HUMANIZER_ULTRA_MODAL_KEY", "wk-test")
    monkeypatch.setenv("HUMANIZER_ULTRA_MODAL_SECRET", "ws-test")
    monkeypatch.setenv("HUMANIZER_ULTRA_MODAL_API_KEY", "vllm-test-key")
    get_settings.cache_clear()

    attempts = {"n": 0}

    def _responder(payload):
        attempts["n"] += 1
        if attempts["n"] < 3:
            return _FakeResponse({"error": "no upstreams available"}, status_code=503)
        return _FakeResponse({"choices": [{"message": {"content": "rewritten after cold start"}}]})

    _patch_client(monkeypatch, _responder)
    result = asyncio.run(HumanizerUltraService().generate("some source text"))

    assert result == "rewritten after cold start"
    assert attempts["n"] == 3

    get_settings.cache_clear()


async def _instant_sleep(*_a, **_kw):
    return None
