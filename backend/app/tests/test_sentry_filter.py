import pytest

from app.core.exceptions import AppError
from app.core.sentry_filter import drop_deliberate_unavailability

EVENT = {"message": "x"}


def _hint(exc):
    return {"exc_info": (type(exc), exc, None)}


@pytest.mark.parametrize("code", ["ULTRA_DISABLED", "TOOL_DISABLED"])
def test_deliberately_switched_off_features_are_not_reported(code):
    assert drop_deliberate_unavailability(EVENT, _hint(AppError(code=code, message="off", status_code=503))) is None


@pytest.mark.parametrize(
    "exc",
    [
        AppError(code="RETRIEVAL_UNAVAILABLE", message="down", status_code=503),
        AppError(code="EMAIL_FAILED", message="boom", status_code=503),
        RuntimeError("real bug"),
    ],
)
def test_genuine_failures_still_report(exc):
    assert drop_deliberate_unavailability(EVENT, _hint(exc)) is EVENT


def test_events_without_exception_info_pass_through():
    assert drop_deliberate_unavailability(EVENT, {}) is EVENT
    assert drop_deliberate_unavailability(EVENT, None) is EVENT


def test_sentry_init_wires_the_filter():
    import inspect

    import app.main as main

    assert "before_send=drop_deliberate_unavailability" in inspect.getsource(main)
