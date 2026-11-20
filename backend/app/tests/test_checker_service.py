"""CheckerService: the strict client for the trained checker model server.

The server is replaced by an httpx MockTransport, so these tests exercise real request building,
response mapping, every failure path, the circuit breaker, and the "no secrets or text in logs" promise.
"""

import asyncio
import json
import logging
from types import SimpleNamespace

import httpx
import pytest

from app.core.exceptions import AppError
from app.services import checker_service as cs
from app.services.checker_service import CheckerService, _CircuitBreaker, ping_checker

TOKEN = "t" * 40
CF_ID = "cf-client-id-value"
CF_SECRET = "cf-client-secret-value"
TEXT = " ".join(["The committee reviewed the proposal carefully before the vote."] * 8)  # ~72 words


def _settings(**over):
    base = dict(
        checker_url="https://checker.example.test", checker_token=TOKEN, cf_access_client_id=CF_ID,
        cf_access_client_secret=CF_SECRET, checker_connect_timeout_seconds=3.0,
        checker_read_timeout_seconds=12.0, checker_min_words=60,
    )
    base.update(over)
    return SimpleNamespace(**base)


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(cs, "get_settings", lambda: _settings())


def _payload(verdict="human", score=0.05, mixed=0.02, sentences=None, words=72):
    return {
        "verdict": verdict, "score": score, "p": {"human": 1 - score, "ai": score - mixed, "mixed": mixed},
        "words": words, "windows": 1, "model": "ck_test",
        "sentences": sentences if sentences is not None else [{"text": "One sentence.", "p_ai": 0.1}],
    }


def _service(handler, **kw):
    return CheckerService(client=httpx.AsyncClient(transport=httpx.MockTransport(handler)), **kw)


def _ok(payload):
    return lambda request: httpx.Response(200, json=payload)


def _run(coro):
    return asyncio.run(coro)


def _check(service, text=TEXT):
    async def go():
        try:
            return await service.check_text(text)
        finally:
            await service.aclose()
    return _run(go())


# ---- success and mapping

@pytest.mark.parametrize("server_verdict, app_verdict", [("human", "likely_human"), ("unsure", "uncertain"), ("ai", "likely_ai")])
def test_verdicts_are_mapped(server_verdict, app_verdict):
    # Sentences that agree with an "ai" verdict, so the sentence check below does not apply.
    agreeing = [{"text": f"Sentence {i}.", "p_ai": 0.9} for i in range(4)] if server_verdict == "ai" else None
    result = _check(_service(_ok(_payload(verdict=server_verdict, sentences=agreeing))))
    assert result["verdict"] == app_verdict
    assert result["disclaimer"]


def _sentences(*p_ai):
    return [{"text": f"Sentence {i}.", "p_ai": p} for i, p in enumerate(p_ai)]


def test_likely_ai_is_held_back_when_too_few_sentences_agree():
    # 1 of 4 sentences marked AI: the overall score alone is not enough to say "Likely AI".
    result = _check(_service(_ok(_payload(verdict="ai", sentences=_sentences(0.9, 0.1, 0.2, 0.4)))))
    assert result["verdict"] == "uncertain"


def test_likely_ai_stands_when_half_the_sentences_agree():
    result = _check(_service(_ok(_payload(verdict="ai", sentences=_sentences(0.9, 0.8, 0.1, 0.2)))))
    assert result["verdict"] == "likely_ai"


def test_unscored_sentences_do_not_count_against_likely_ai():
    result = _check(_service(_ok(_payload(verdict="ai", sentences=_sentences(0.9, None, None, 0.95)))))
    assert result["verdict"] == "likely_ai"
    # and when nothing is scored there is nothing to disagree with
    result = _check(_service(_ok(_payload(verdict="ai", sentences=_sentences(None, None, None)))))
    assert result["verdict"] == "likely_ai"


@pytest.mark.parametrize("server_verdict, app_verdict", [("human", "likely_human"), ("unsure", "uncertain")])
def test_the_sentence_check_only_touches_likely_ai(server_verdict, app_verdict):
    result = _check(_service(_ok(_payload(verdict=server_verdict, sentences=_sentences(0.9, 0.9, 0.9)))))
    assert result["verdict"] == app_verdict


def test_scores_are_rounded_and_sentences_are_labelled_by_band():
    sentences = [
        {"text": "Human.", "p_ai": 0.05}, {"text": "Edge human.", "p_ai": 0.3}, {"text": "Between.", "p_ai": 0.5},
        {"text": "Edge AI.", "p_ai": 0.7}, {"text": "AI.", "p_ai": 0.91234}, {"text": "Unscored.", "p_ai": None},
    ]
    result = _check(_service(_ok(_payload(verdict="ai", score=0.987654, mixed=0.123456, sentences=sentences))))
    assert result["ai_score"] == 0.9877 and result["mixed_probability"] == 0.1235
    assert [s["label"] for s in result["sentences"]] == ["human", "human", "unsure", "ai", "ai", "unsure"]
    assert result["sentences"][5]["ai_score"] is None


def test_request_carries_text_and_every_credential_header():
    seen = {}

    def handler(request):
        seen["url"], seen["headers"], seen["body"] = str(request.url), request.headers, json.loads(request.content)
        return httpx.Response(200, json=_payload())

    _check(_service(handler))
    assert seen["url"] == "https://checker.example.test/score"
    assert seen["body"] == {"text": TEXT}
    assert seen["headers"]["x-checker-token"] == TOKEN
    assert seen["headers"]["cf-access-client-id"] == CF_ID
    assert seen["headers"]["cf-access-client-secret"] == CF_SECRET


# ---- input validation happens before any network call

def _fail_if_called(request):
    raise AssertionError("the checker server must not be called")


def test_empty_text_is_rejected_locally():
    with pytest.raises(AppError) as err:
        _check(_service(_fail_if_called), "   ")
    assert err.value.code == "EMPTY_TEXT"


def test_too_few_words_is_rejected_locally_with_a_clear_message():
    with pytest.raises(AppError) as err:
        _check(_service(_fail_if_called), "Only a handful of words in this one.")
    assert err.value.code == "TEXT_TOO_SHORT" and err.value.status_code == 422
    assert "60 words" in err.value.message


def test_too_many_characters_is_rejected_locally():
    with pytest.raises(AppError) as err:
        _check(_service(_fail_if_called), "word " * 20000)
    assert err.value.code == "TEXT_TOO_LONG" and err.value.status_code == 413


def test_enough_words_but_too_few_sentences_gets_its_own_message():
    # 70 words in two sentences: the server refuses it, and "enter at least 60 words" would be the wrong thing to say.
    with pytest.raises(AppError) as err:
        _check(_service(_ok({"verdict": "insufficient_text", "words": 70, "min_words": 60})))
    assert err.value.code == "TEXT_TOO_FEW_SENTENCES" and err.value.status_code == 422
    assert "70 words" in err.value.message and "3 sentences" in err.value.message


def test_server_saying_insufficient_text_becomes_too_short():
    with pytest.raises(AppError) as err:
        _check(_service(_ok({"verdict": "insufficient_text", "words": 40, "min_words": 60})))
    assert err.value.code == "TEXT_TOO_SHORT"


def test_server_413_becomes_too_long():
    with pytest.raises(AppError) as err:
        _check(_service(lambda r: httpx.Response(413, json={"detail": "text_too_long"})))
    assert err.value.code == "TEXT_TOO_LONG"


# ---- every way the model server can fail becomes the same calm 503

def _assert_unavailable(service):
    with pytest.raises(AppError) as err:
        _check(service)
    assert err.value.code == "CHECKER_UNAVAILABLE" and err.value.status_code == 503
    assert "temporarily unavailable" in err.value.message
    assert TOKEN not in err.value.message and CF_SECRET not in err.value.message


def test_connect_error_is_unavailable():
    def handler(request):
        raise httpx.ConnectError("refused", request=request)
    _assert_unavailable(_service(handler))


def test_timeout_is_unavailable():
    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)
    _assert_unavailable(_service(handler))


@pytest.mark.parametrize("status", [401, 403, 429, 500, 502, 503])
def test_bad_status_is_unavailable(status):
    _assert_unavailable(_service(lambda r: httpx.Response(status, json={"detail": "x"})))


def test_non_json_body_is_unavailable():
    _assert_unavailable(_service(lambda r: httpx.Response(200, text="<html>Forbidden</html>")))


@pytest.mark.parametrize("bad", [{}, {"verdict": "maybe", "score": 0.5}, {"verdict": "ai"}, {"verdict": "ai", "score": "x", "p": {}}])
def test_malformed_payload_is_unavailable(bad):
    _assert_unavailable(_service(_ok(bad)))


@pytest.mark.parametrize("missing", ["checker_url", "checker_token", "cf_access_client_id", "cf_access_client_secret"])
def test_missing_configuration_is_unavailable_without_any_request(monkeypatch, missing):
    monkeypatch.setattr(cs, "get_settings", lambda: _settings(**{missing: ""}))
    _assert_unavailable(_service(_fail_if_called))


# ---- circuit breaker

def test_breaker_opens_after_three_failures_then_recovers(monkeypatch):
    calls = []
    clock = {"t": 1000.0}
    monkeypatch.setattr(cs.time, "monotonic", lambda: clock["t"])
    state = {"healthy": False}

    def handler(request):
        calls.append(1)
        return httpx.Response(200, json=_payload()) if state["healthy"] else httpx.Response(503)

    service = _service(handler, breaker=_CircuitBreaker(threshold=3, cooldown=30.0))

    async def go():
        async def attempt():
            try:
                return await service.check_text(TEXT)
            except AppError as exc:
                return exc.code
        out = [await attempt() for _ in range(3)]
        assert len(calls) == 3
        out.append(await attempt())                 # breaker open: no network call
        assert len(calls) == 3 and out[-1] == "CHECKER_UNAVAILABLE"
        clock["t"] += 31                            # cooldown over: one trial allowed
        state["healthy"] = True
        trial = await attempt()
        assert isinstance(trial, dict) and len(calls) == 4
        assert isinstance(await attempt(), dict)    # success closed the breaker
        await service.aclose()

    _run(go())


def test_validation_errors_do_not_trip_the_breaker():
    breaker = _CircuitBreaker(threshold=1, cooldown=30.0)
    service = _service(_fail_if_called, breaker=breaker)
    for _ in range(3):
        with pytest.raises(AppError):
            _check(service, "too short")
    assert breaker.failures == 0


# ---- privacy: no secret and no user text in logs

def test_failure_logs_contain_neither_secrets_nor_the_users_text(caplog):
    def handler(request):
        raise httpx.ConnectError("refused", request=request)

    with caplog.at_level(logging.DEBUG, logger="app.services.checker_service"):
        with pytest.raises(AppError):
            _check(_service(handler))
    logged = caplog.text
    assert logged  # something was logged
    for secret in (TOKEN, CF_ID, CF_SECRET, "committee reviewed"):
        assert secret not in logged


# ---- health probe used by the admin System page

def test_ping_reports_health(monkeypatch):
    monkeypatch.setattr(cs.httpx, "get", lambda url, headers, timeout: httpx.Response(200, json={"ok": True}, request=httpx.Request("GET", url)))
    assert ping_checker() is True


def test_ping_is_false_when_unreachable_unconfigured_or_unhealthy(monkeypatch):
    def boom(url, headers, timeout):
        raise httpx.ConnectError("refused")
    monkeypatch.setattr(cs.httpx, "get", boom)
    assert ping_checker() is False
    monkeypatch.setattr(cs.httpx, "get", lambda url, headers, timeout: httpx.Response(200, json={"ok": False}, request=httpx.Request("GET", url)))
    assert ping_checker() is False
    monkeypatch.setattr(cs, "get_settings", lambda: _settings(checker_token=""))
    assert ping_checker() is False


# ---- secrets must never travel in the error chain (error reports capture it)

def _chain(exc: BaseException) -> list[BaseException]:
    out, seen = [], set()
    while exc is not None and id(exc) not in seen:
        seen.add(id(exc)); out.append(exc)
        exc = exc.__cause__ or (None if exc.__suppress_context__ else exc.__context__)
    return out


def test_unavailable_error_does_not_carry_the_transport_error_or_its_secret():
    def handler(request):
        raise httpx.LocalProtocolError(f"Illegal header value {TOKEN!r}", request=request)

    with pytest.raises(AppError) as err:
        _check(_service(handler))
    chain = _chain(err.value)
    assert len(chain) == 1  # only the calm AppError, nothing behind it
    assert all(TOKEN not in str(e) for e in chain)


def test_pasted_secrets_are_trimmed_of_new_lines_and_spaces():
    from app.core.config import Settings

    s = Settings(checker_url=" https://checker.example.test\n", checker_token=TOKEN + "\n", cf_access_client_id="id \n", cf_access_client_secret="\tsecret ")
    assert (s.checker_url, s.checker_token, s.cf_access_client_id, s.cf_access_client_secret) == (
        "https://checker.example.test", TOKEN, "id", "secret",
    )


# ---- look-alike and invisible characters are cleaned before the text is scored

def test_lookalike_letters_are_folded_back_to_latin():
    assert cs._clean_text("This tеxt hаs Cyrillic lооk-аlikes") == "This text has Cyrillic look-alikes"


def test_invisible_characters_are_removed():
    assert cs._clean_text("zero\u200bwidth and soft\u00adhyphen\ufeff") == "zerowidth and softhyphen"


def test_plain_english_is_left_alone():
    plain = "Plain English, with punctuation: it's fine (really)."
    assert cs._clean_text(plain) == plain


def test_a_mostly_non_latin_text_is_not_turned_into_lookalike_gibberish():
    russian = "Это обычный русский текст без латинских букв."
    assert cs._clean_text(russian) == russian


def test_the_cleaned_text_is_what_the_server_receives_and_what_is_counted():
    seen = {}

    def handler(request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=_payload())

    dirty = ("Th\u200bis tеxt " + "word " * 80).strip()
    _check(_service(handler), dirty)
    assert "\u200b" not in seen["body"]["text"] and "е" not in seen["body"]["text"]


# ---- pv10 six-level rules (selected by the model id the server reports)

def _pv10(score, mixed=0.02, sent=None, human=None, ai=None):
    p_human = 1 - score if human is None else human
    p_ai = max(0.0, score - mixed) if ai is None else ai
    payload = _payload(verdict="unsure", score=score, mixed=mixed, sentences=sent)
    payload["p"] = {"human": p_human, "ai": p_ai, "mixed": mixed}
    payload["model"] = "ck_pv10_s2"
    return payload


def _level(payload):
    r = _check(_service(_ok(payload)))
    return r["level"], r["lean"], r["verdict"]


@pytest.mark.parametrize(
    "score,level,legacy",
    [
        (0.05, "human", "likely_human"),
        (0.10, "human", "likely_human"),
        (0.30, "likely_human", "likely_human"),
        (0.50, "likely_human", "likely_human"),
        (0.60, "unsure", "uncertain"),
        (0.95, "unsure", "uncertain"),
        (0.99, "unsure", "uncertain"),
        (0.9970, "likely_ai", "likely_ai"),
        (0.9985, "ai", "likely_ai"),
    ],
)
def test_pv10_levels_follow_the_score_bands(score, level, legacy):
    got_level, _, got_legacy = _level(_pv10(score))
    assert (got_level, got_legacy) == (level, legacy)


def test_pv10_unsure_says_which_way_it_leans():
    assert _level(_pv10(0.7))[:2] == ("unsure", "human")
    assert _level(_pv10(0.97))[:2] == ("unsure", "ai")


def test_pv10_mixed_when_the_model_says_mixed():
    level, lean, legacy = _level(_pv10(0.99, mixed=0.6, ai=0.3, human=0.01))
    assert (level, legacy) == ("mixed", "uncertain")
    assert lean == "ai"
    assert _level(_pv10(0.6, mixed=0.55, ai=0.04, human=0.4))[:2] == ("mixed", "human")


def test_pv10_mixed_when_long_text_windows_split_between_human_and_ai():
    sent = [{"text": f"S{i}.", "p_ai": 0.97 if i < 15 else 0.03} for i in range(30)]
    level, lean, _ = _level(_pv10(0.99, sent=sent))
    assert level == "mixed" and lean in ("ai", "human")


def test_pv10_short_text_never_uses_the_window_rule():
    sent = [{"text": f"S{i}.", "p_ai": 0.97 if i < 4 else 0.03} for i in range(10)]
    assert _level(_pv10(0.9990, sent=sent))[0] == "ai"


def test_pv10_sentences_use_the_pv10_colour_bands_and_the_pv10_disclaimer():
    sent = [{"text": "a.", "p_ai": 0.05}, {"text": "b.", "p_ai": 0.5}, {"text": "c.", "p_ai": 0.99}, {"text": "d.", "p_ai": 0.2}]
    r = _check(_service(_ok(_pv10(0.5, sent=sent))))
    assert [s["label"] for s in r["sentences"]] == ["human", "unsure", "ai", "unsure"]
    assert "1 human text in 160" in r["disclaimer"]


def test_older_model_keeps_the_old_rules_and_has_no_level():
    r = _check(_service(_ok(_payload(verdict="ai", score=0.99, sentences=_sentences(0.9, 0.9, 0.9)))))
    assert r["level"] is None and r["lean"] is None and r["verdict"] == "likely_ai"


def test_the_sentence_agreement_hold_back_is_not_applied_to_pv10():
    # Under the older model, a likely-AI verdict with too few AI sentences is held back; for pv10 it measurably did nothing.
    r = _check(_service(_ok(_pv10(0.9990, sent=_sentences(0.1, 0.1, 0.1, 0.1)))))
    assert r["level"] == "ai"
