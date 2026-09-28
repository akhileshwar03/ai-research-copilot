import asyncio
import json

import pytest

from app.core.exceptions import AppError
from app.services.checker_service import CheckerService, compute_heuristics


def _run(coro):
    return asyncio.run(coro)


class _FakeAIService:
    def __init__(self, response: str | Exception):
        self.response = response

    async def classify(self, messages):
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


class _FakeAIServiceSequence:
    """Returns queued responses in order — one per `classify()` call — for
    tests that exercise check_text(advanced=True), which issues two calls."""

    def __init__(self, responses: list[str]):
        self.responses = list(responses)
        self.calls: list[list] = []

    async def classify(self, messages):
        self.calls.append(messages)
        return self.responses.pop(0)


def test_check_text_combines_heuristic_and_llm_signal():
    llm_response = json.dumps({"ai_probability": 0.9, "reasoning": "very uniform phrasing"})
    service = CheckerService(ai_service=_FakeAIService(llm_response))

    result = _run(service.check_text("This is a reasonably long test sentence for analysis purposes today."))

    assert result["signals"]["llm_probability"] == 0.9
    assert 0.0 <= result["ai_probability"] <= 1.0
    assert result["verdict"] in ("likely_human", "uncertain", "likely_ai")
    assert result["disclaimer"]  # never empty — always shown


def test_check_text_falls_back_to_heuristic_only_when_llm_fails():
    service = CheckerService(ai_service=_FakeAIService(RuntimeError("API down")))

    result = _run(service.check_text("Some text that will only get the heuristic signal applied to it."))

    assert result["signals"]["llm_probability"] is None
    # Falls back to heuristic-only score, still bounded and present.
    assert 0.0 <= result["ai_probability"] <= 1.0


def test_check_text_falls_back_when_llm_returns_malformed_json():
    service = CheckerService(ai_service=_FakeAIService("not json at all"))

    result = _run(service.check_text("Text that triggers a malformed LLM response path here."))

    assert result["signals"]["llm_probability"] is None


def test_check_text_rejects_empty_text():
    service = CheckerService(ai_service=_FakeAIService("{}"))
    with pytest.raises(AppError) as exc_info:
        _run(service.check_text("   "))
    assert exc_info.value.code == "EMPTY_TEXT"
    assert exc_info.value.status_code == 400


def test_check_text_rejects_over_char_limit():
    service = CheckerService(ai_service=_FakeAIService("{}"))
    huge_text = "word " * 5000  # over the 20000-char default limit
    with pytest.raises(AppError) as exc_info:
        _run(service.check_text(huge_text))
    assert exc_info.value.code == "TEXT_TOO_LONG"
    assert exc_info.value.status_code == 413


def test_check_text_short_input_flagged_low_confidence():
    service = CheckerService(ai_service=_FakeAIService(json.dumps({"ai_probability": 0.5, "reasoning": "x"})))
    result = _run(service.check_text("Too short."))
    assert result["confidence"] == "low"


# Well-varied, clean prose (high burstiness, high lexical diversity -> low
# heuristic AI score) that the LLM is confident is AI. The old weighting let
# the "human-looking" heuristic drag the blend down to ~0.5 ("uncertain"); the
# reworked blend must keep a confident LLM AI-call decisive.
_CLEAN_BUT_AI_TEXT = (
    "The transition to renewable energy represents one of the defining challenges of "
    "our era. Solar and wind capacity have expanded dramatically over the past decade. "
    "Storage technology, though still maturing, promises to smooth the intermittency "
    "that once made these sources impractical. Policymakers now face difficult choices "
    "about how to accelerate deployment while protecting existing communities and jobs."
)


def test_confident_llm_ai_call_not_dragged_down_by_clean_heuristics():
    llm_response = json.dumps(
        {
            "ai_probability": 0.88,
            "reasoning": "Generic, textbook phrasing with no personal voice.",
            "ai_sentences": ["The transition to renewable energy represents one of the defining challenges of our era."],
        }
    )
    service = CheckerService(ai_service=_FakeAIService(llm_response))

    result = _run(service.check_text(_CLEAN_BUT_AI_TEXT))

    # The heuristic alone would read this as human (varied, diverse, no tells)...
    assert result["signals"]["heuristic_score"] < 40
    # ...but the confident LLM call must carry it to a decisive AI verdict.
    assert result["verdict"] == "likely_ai"
    assert result["ai_probability"] > 0.6


def test_ai_sentences_are_verified_against_source():
    # One real sentence from the source, one hallucinated -> only the real one survives.
    llm_response = json.dumps(
        {
            "ai_probability": 0.8,
            "reasoning": "x",
            "ai_sentences": [
                "Solar and wind capacity have expanded dramatically over the past decade.",
                "This sentence never appears anywhere in the source text at all.",
            ],
        }
    )
    service = CheckerService(ai_service=_FakeAIService(llm_response))

    result = _run(service.check_text(_CLEAN_BUT_AI_TEXT))

    assert result["ai_sentences"] == [
        "Solar and wind capacity have expanded dramatically over the past decade."
    ]


# ── Advanced Scan (paragraph breakdown) ─────────────────────────────────────

_MULTI_PARAGRAPH_TEXT = (
    "Paragraph one talks about renewable energy trends and their broad economic impact today.\n\n"
    "Paragraph two is a short personal note about my own experience installing solar panels."
)


def test_advanced_scan_returns_paragraph_breakdown():
    llm_response = json.dumps({"ai_probability": 0.7, "reasoning": "x", "ai_sentences": []})
    paragraph_response = json.dumps(
        {
            "segments": [
                {"index": 1, "ai_probability": 0.85},
                {"index": 2, "ai_probability": 0.15},
            ]
        }
    )
    service = CheckerService(ai_service=_FakeAIServiceSequence([llm_response, paragraph_response]))

    result = _run(service.check_text(_MULTI_PARAGRAPH_TEXT, advanced=True))

    assert len(result["paragraphs"]) == 2
    assert result["paragraphs"][0]["verdict"] == "likely_ai"
    assert result["paragraphs"][1]["verdict"] == "likely_human"
    # Order preserved regardless of the order segments came back in.
    assert result["paragraphs"][0]["text"].startswith("Paragraph one")
    assert result["paragraphs"][1]["text"].startswith("Paragraph two")


def test_basic_scan_omits_paragraph_breakdown():
    llm_response = json.dumps({"ai_probability": 0.7, "reasoning": "x", "ai_sentences": []})
    service = CheckerService(ai_service=_FakeAIService(llm_response))

    result = _run(service.check_text(_MULTI_PARAGRAPH_TEXT, advanced=False))

    assert result["paragraphs"] == []


def test_advanced_scan_degrades_gracefully_when_breakdown_call_fails():
    llm_response = json.dumps({"ai_probability": 0.7, "reasoning": "x", "ai_sentences": []})
    service = CheckerService(ai_service=_FakeAIServiceSequence([llm_response, "not valid json"]))

    result = _run(service.check_text(_MULTI_PARAGRAPH_TEXT, advanced=True))

    # Overall result still comes through fine even though the breakdown failed.
    assert result["ai_probability"] > 0
    assert result["paragraphs"] == []


# ── New deterministic signals (2026-09-28 rebuild) ─────────────────────────
# Each test below isolates one new signal with text engineered to land on one
# side of its documented threshold, adapted from the competitive research
# gathered on real market AI detectors (see checker_service.py's module
# docstring) — never copying any source's example text verbatim, just the
# documented direction of each signal.

_STOCK_AI_PARAGRAPH = (
    "Moreover, the adoption of renewable energy represents a paradigm shift in the "
    "global economy. Furthermore, businesses must leverage cutting-edge technology to "
    "navigate this landscape. Additionally, stakeholders should harness the power of "
    "innovation to unlock the potential of sustainable growth. In conclusion, this is a "
    "testament to the ever-evolving nature of modern industry."
)

_PERSONAL_HUMAN_PARAGRAPH = (
    "I still remember the smell of my grandmother's kitchen on Sunday mornings. She'd "
    "burn the first pancake every single time, toss it to the dog, and swear it was on "
    "purpose. My brother and I never bought it. That kitchen had this ugly yellow "
    "linoleum floor, curling up at the corners near the fridge, and somehow that detail "
    "sticks with me more than almost anything else from that whole house."
)


def test_stock_ai_paragraph_scores_much_higher_than_personal_human_paragraph():
    ai_heuristics = compute_heuristics(_STOCK_AI_PARAGRAPH)
    human_heuristics = compute_heuristics(_PERSONAL_HUMAN_PARAGRAPH)
    assert ai_heuristics["heuristic_score"] > human_heuristics["heuristic_score"] + 30
    assert human_heuristics["heuristic_score"] < 10


def test_function_word_ratio_lower_for_stock_ai_paragraph():
    # AI prose leans content-word-dense; human prose carries more connective
    # tissue (pronouns, articles, prepositions) — see module docstring.
    ai_heuristics = compute_heuristics(_STOCK_AI_PARAGRAPH)
    human_heuristics = compute_heuristics(_PERSONAL_HUMAN_PARAGRAPH)
    assert ai_heuristics["function_word_ratio"] < human_heuristics["function_word_ratio"]


def test_mean_word_length_higher_for_stock_ai_paragraph():
    ai_heuristics = compute_heuristics(_STOCK_AI_PARAGRAPH)
    human_heuristics = compute_heuristics(_PERSONAL_HUMAN_PARAGRAPH)
    assert ai_heuristics["mean_word_length"] > human_heuristics["mean_word_length"]


def test_transition_opener_rate_flags_paragraph_opening_every_sentence_with_a_transition():
    heuristics = compute_heuristics(_STOCK_AI_PARAGRAPH)
    assert heuristics["transition_opener_rate"] >= 0.5


def test_transition_opener_rate_zero_for_paragraph_with_no_stock_openers():
    heuristics = compute_heuristics(_PERSONAL_HUMAN_PARAGRAPH)
    assert heuristics["transition_opener_rate"] == 0.0


def test_personal_voice_score_positive_for_first_person_paragraph():
    heuristics = compute_heuristics(_PERSONAL_HUMAN_PARAGRAPH)
    assert heuristics["personal_voice_score"] > 0.0


def test_personal_voice_score_zero_for_third_person_paragraph():
    heuristics = compute_heuristics(_STOCK_AI_PARAGRAPH)
    assert heuristics["personal_voice_score"] == 0.0


def test_personal_voice_is_subtractive_only_absence_does_not_raise_score():
    # A clean, plain, third-person paragraph with none of the other AI-tells
    # either -- zero personal voice must not, by itself, push the score up.
    # This is the exact false-positive shape found for real on a genuine,
    # non-native-English academic paper (see checker_service.py comments).
    neutral_paragraph = (
        "The bridge was completed in 1932 after four years of construction. It spans "
        "just over two kilometers and carries both rail and road traffic. Maintenance "
        "crews inspect the main cables every five years. The last major repair project "
        "replaced most of the original rivets with welded joints."
    )
    heuristics = compute_heuristics(neutral_paragraph)
    assert heuristics["personal_voice_score"] == 0.0
    assert heuristics["heuristic_score"] < 20


def test_trigram_repetition_rate_zero_for_short_or_fully_unique_text():
    heuristics = compute_heuristics("Short text here.")
    assert heuristics["trigram_repetition_rate"] == 0.0


def test_trigram_repetition_rate_positive_when_a_phrase_repeats():
    text = "This is the same thing. Later, this is the same thing again, exactly the same thing."
    heuristics = compute_heuristics(text)
    assert heuristics["trigram_repetition_rate"] > 0.0


def test_signals_dict_exposes_all_new_heuristics():
    service = CheckerService(ai_service=_FakeAIService('{"ai_probability": 0.5}'))
    result = _run(service.check_text(_STOCK_AI_PARAGRAPH))
    for key in (
        "function_word_ratio",
        "mean_word_length",
        "trigram_repetition_rate",
        "transition_opener_rate",
        "personal_voice_score",
    ):
        assert key in result["signals"]


# 2026-09-28: real false positive found live in production — a purely descriptive,
# mood-driven human paragraph (no first-person voice, but also genuinely clean of every
# deterministic AI-tell: no banned phrases, no stock transition openers, natural
# burstiness) scored heuristic_score ~10 (correctly clean) while the LLM was only
# MODERATELY confident it was AI (0.7, well under the existing 0.9 "genuine conviction"
# gate) — and the 70/30 blend still dragged the result into "uncertain"/borderline-AI
# territory. Two independent free market AI detectors called the real text 93%+ human.
_DESCRIPTIVE_HUMAN_PARAGRAPH = (
    "Late autumn mornings have a particular stillness to them. Outside, frost clings to "
    "the fence posts, and the garden looks almost silver in the early light. The kitchen "
    "smells of woodsmoke and toast, and the old radiator ticks as it warms up in the "
    "corner. Wrapped in a thick sweater, it is easy to sit by the window and watch steam "
    "rise off a mug of tea. The cat stretches out on the warm floorboards near the stove, "
    "in no hurry to go outside. Somewhere down the lane a dog barks twice and then falls "
    "quiet again. The whole street feels slower than usual, as though the cold has asked "
    "everyone to wait a little before starting the day."
)


def test_moderate_llm_ai_call_does_not_override_genuinely_clean_heuristics():
    llm_response = json.dumps(
        {
            "ai_probability": 0.7,
            "reasoning": "Smooth, predictable rhythm with generic cozy imagery typical of AI writing.",
            "ai_sentences": [],
        }
    )
    service = CheckerService(ai_service=_FakeAIService(llm_response))

    result = _run(service.check_text(_DESCRIPTIVE_HUMAN_PARAGRAPH))

    # Heuristics are genuinely clean here (no banned phrases, no stock openers, no
    # trigram thinness) — a moderate (not decisive) LLM call must not drag this into
    # "uncertain" or "likely_ai".
    assert result["signals"]["heuristic_score"] < 15
    assert result["verdict"] == "likely_human"
    assert result["ai_probability"] < 0.4


# 2026-09-29: real false positive found via a structured 24-sample validation run
# (scripts/checker_eval/, 8 topic-matched human/AI/humanized triples) — 5 of 8 genuine
# 2013-Wikipedia human paragraphs (formal/encyclopedic register, heuristic_score 0-8,
# genuinely clean) were misclassified likely_ai, and in every one of those 5 cases
# llm_probability landed at EXACTLY 0.85 -- an LLM self-report anchor value that fell
# precisely in the unprotected gap between the two guardrails (`< 0.85` and `>= 0.9`).
_FORMAL_ENCYCLOPEDIC_PARAGRAPH = (
    "A watermill uses a water wheel to drive machinery. The design dates to antiquity. "
    "Water is directed from a river or millpond along a channel to the wheel, where its "
    "force turns a shaft connected to internal gearing that converts rotation into the "
    "motion a mill's task requires. Overshot, undershot, and breastshot designs differ in "
    "where the water strikes the wheel. Efficiency depends on the available head and flow. "
    "Many surviving examples across Europe were adapted for grinding grain, and some were "
    "later converted to generate electricity in the early twentieth century before falling "
    "out of everyday use."
)


def test_llm_probability_of_exactly_0_85_does_not_escape_the_clean_heuristic_guardrail():
    llm_response = json.dumps(
        {
            "ai_probability": 0.85,
            "reasoning": "Smooth, factual, evenly-paced prose with no personal voice.",
            "ai_sentences": [],
        }
    )
    service = CheckerService(ai_service=_FakeAIService(llm_response))

    result = _run(service.check_text(_FORMAL_ENCYCLOPEDIC_PARAGRAPH))

    assert result["signals"]["heuristic_score"] < 15
    assert result["verdict"] == "likely_human"
    assert result["ai_probability"] < 0.4


# 2026-09-28: real false NEGATIVE found live in production, right after the guardrail
# above shipped — a paragraph with leftover AI-assistant preamble ("Here is a short,
# random essay about...") scored heuristic_score=2 (clean of every OTHER signal) and the
# new guardrail suppressed a correctly-leaning moderate LLM call (0.75), giving a 2%
# "likely_human" verdict on text that opens by describing itself instead of just being
# written — a tell no genuine human essay produces. Two independent free market
# detectors called this same text 86-93% AI.
_AI_PREAMBLE_PARAGRAPH = (
    "Here is a short, random essay about the quiet magic of ordinary mornings. Morning "
    "arrives not with a loud trumpet, but with a slow, pale blue light slipping through "
    "the curtains. The world is quiet before the rush of the day begins. In this brief "
    "window, time feels elastic and kind. A single cup of coffee sends up a thin column "
    "of steam, swirling into the cool air like an unspoken thought. Outside, a lone bird "
    "tests its voice on a high branch, measuring the silence. These quiet moments are "
    "easy to overlook, buried beneath the weight of our rushing schedules and endless "
    "digital noise. Yet, they hold a rare kind of medicine. They remind us that peace is "
    "not a distant place we travel to, but a space we can inhabit right where we are, if "
    "only for a few minutes before the noise of the world catches up."
)


def test_leftover_ai_preamble_is_not_suppressed_by_the_clean_heuristic_guardrail():
    llm_response = json.dumps(
        {
            "ai_probability": 0.75,
            "reasoning": "Smooth, predictable rhythm and polished vocabulary typical of AI-generated prose.",
            "ai_sentences": [],
        }
    )
    service = CheckerService(ai_service=_FakeAIService(llm_response))

    result = _run(service.check_text(_AI_PREAMBLE_PARAGRAPH))

    # The meta-preamble detector must push heuristic_score high enough that the
    # moderate-LLM guardrail (heuristic < 0.15) never engages here.
    assert result["signals"]["heuristic_score"] >= 80
    assert result["verdict"] == "likely_ai"
    assert result["ai_probability"] > 0.6
    assert "AI-assistant phrasing" in result["explanation"]


# 2026-09-28: found live minutes after the fix above shipped — the LLM's own
# self-reported probability is genuinely noisy across identical calls on identical
# text (0.3, 0.75, 0.85 observed in a row on the same paragraph). A low noisy sample
# (0.3) blended 70/30 still dragged a heuristic_score=90 case (the preamble detector
# firing — close to unambiguous ground truth) down to only 46% ("uncertain").
def test_leftover_ai_preamble_gets_a_floor_even_against_a_noisy_low_llm_sample():
    llm_response = json.dumps(
        {
            "ai_probability": 0.3,  # a noisy, unusually low sample from the LLM
            "reasoning": "Varied sentence length and some specific imagery.",
            "ai_sentences": [],
        }
    )
    service = CheckerService(ai_service=_FakeAIService(llm_response))

    result = _run(service.check_text(_AI_PREAMBLE_PARAGRAPH))

    assert result["signals"]["heuristic_score"] >= 80
    assert result["verdict"] == "likely_ai"
    assert result["ai_probability"] > 0.6


def test_advanced_scan_skipped_for_short_single_segment_text():
    llm_response = json.dumps({"ai_probability": 0.7, "reasoning": "x", "ai_sentences": []})
    service = CheckerService(ai_service=_FakeAIServiceSequence([llm_response]))

    result = _run(service.check_text("Too short to break down.", advanced=True))

    # Under 2 segments -> no second LLM call is made at all.
    assert result["paragraphs"] == []
