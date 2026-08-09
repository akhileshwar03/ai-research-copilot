"""Pure-function tests for the AI-checker heuristics — no network calls."""

from app.services.checker_service import compute_heuristics

AI_LIKE_TEXT = (
    "Moreover, it is important to note that artificial intelligence plays a crucial "
    "role in modern society. Furthermore, the technology continues to evolve rapidly. "
    "Additionally, businesses must navigate the complexities of this ever-evolving "
    "landscape. In conclusion, organizations should harness the power of these tools "
    "to unlock the potential of their operations."
)

HUMAN_LIKE_TEXT = (
    "Honestly? I wasn't sure this would work. Tried it anyway. Turns out the old "
    "laptop still boots, though the fan sounds like a jet engine now — and don't get "
    "me started on the battery, which lasts maybe twenty minutes if you're lucky."
)


def test_ai_phrase_heavy_text_scores_higher_than_casual_text():
    ai_result = compute_heuristics(AI_LIKE_TEXT)
    human_result = compute_heuristics(HUMAN_LIKE_TEXT)

    assert ai_result["heuristic_score"] > human_result["heuristic_score"]
    assert ai_result["ai_phrase_hits"] > human_result["ai_phrase_hits"]


def test_empty_text_does_not_crash():
    result = compute_heuristics("")
    assert result["word_count"] == 0
    assert 0.0 <= result["heuristic_score"] <= 100.0


def test_single_sentence_does_not_crash_burstiness_calc():
    result = compute_heuristics("Just one sentence here.")
    assert 0.0 <= result["burstiness"] <= 1.0


def test_heuristic_score_always_bounded():
    # Pathological input: every phrase repeated many times.
    spam = "Moreover, furthermore, in conclusion, delve into the tapestry. " * 20
    result = compute_heuristics(spam)
    assert 0.0 <= result["heuristic_score"] <= 100.0
