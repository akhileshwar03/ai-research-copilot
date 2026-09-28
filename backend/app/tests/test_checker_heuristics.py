"""Pure-function tests for the AI-checker heuristics — no network calls."""

from app.services.checker_service import _normalize_evasion_chars, compute_heuristics

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


# 2026-09-29: real adversarial-evasion defense (Tier 1 of the ground-up rebuild plan) — the
# independent RAID benchmark (arXiv:2405.07940) found homoglyph substitution and invisible
# zero-width characters are the most damaging real attack against perplexity/burstiness
# detectors (-36% to -41% accuracy). Both are undetectable to a human reader but break naive
# string matching, so both must be normalized away before any signal is computed.


def test_normalize_strips_zero_width_and_invisible_characters():
    # Zero-width space (U+200B) and word joiner (U+2060) inserted mid-word, invisible on screen.
    attacked = "Mo​re⁠over"
    assert _normalize_evasion_chars(attacked) == "Moreover"


def test_normalize_maps_cyrillic_homoglyphs_back_to_latin():
    # Cyrillic е (U+0435) and о (U+043E) are visually identical to Latin e/o.
    attacked = "Mоrеover"
    assert _normalize_evasion_chars(attacked) == "Moreover"


def test_normalize_maps_greek_homoglyphs_back_to_latin():
    # Greek omicron (U+03BF) is visually identical to Latin o.
    attacked = "Mοreοver"
    assert _normalize_evasion_chars(attacked) == "Moreover"


def test_normalize_leaves_clean_text_completely_unchanged():
    clean = "This is a perfectly ordinary sentence with no tricks in it at all."
    assert _normalize_evasion_chars(clean) == clean


def test_evasion_attack_on_banned_phrase_is_defeated_by_normalization():
    # The real attack this defends against: hide a banned AI-tell phrase from detection by
    # inserting invisible characters and homoglyphs, without changing what a reader sees.
    attacked_phrase = "M​orеover,"  # zero-width space + Cyrillic е
    heuristics_raw = compute_heuristics(attacked_phrase)
    heuristics_normalized = compute_heuristics(_normalize_evasion_chars(attacked_phrase))
    assert heuristics_raw["ai_phrase_hits"] == 0  # the attack works against the raw text
    assert heuristics_normalized["ai_phrase_hits"] >= 1  # normalization recovers the tell
