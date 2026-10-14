"""Delivery outcomes of EmailService.send_otp_email via Resend.

2026-10-14: a curl probe to /auth/send-otp with an @example.com address made Resend answer 422
validation_error; the app reported it as a 503 "try again in a moment" and paged Sentry. A
rejected recipient is a client error (400), distinct from a real provider outage (503).
"""

import httpx
import pytest

from app.core.exceptions import AppError
from app.services.email_service import EmailService


def _service(monkeypatch, response: httpx.Response):
    svc = EmailService()
    svc.settings = type("S", (), {"resend_api_key": "k", "smtp_host": "", "email_from": "a@b.c"})()

    def fake_post(*args, **kwargs):
        response.request = httpx.Request("POST", "https://api.resend.com/emails")
        return response

    monkeypatch.setattr(httpx, "post", fake_post)
    return svc


def test_resend_422_validation_error_is_a_400_not_a_503(monkeypatch):
    body = {"message": "Invalid `to` field. Please use our testing email address instead of domains like `example.com`.",
            "name": "validation_error", "statusCode": 422}
    svc = _service(monkeypatch, httpx.Response(422, json=body))
    with pytest.raises(AppError) as exc:
        svc.send_otp_email("someone@example.com", "123456")
    assert exc.value.status_code == 400
    assert exc.value.code == "EMAIL_RECIPIENT_REJECTED"


def test_resend_server_error_is_still_a_503(monkeypatch):
    svc = _service(monkeypatch, httpx.Response(500, json={"message": "boom", "name": "application_error"}))
    with pytest.raises(AppError) as exc:
        svc.send_otp_email("real@gmail.com", "123456")
    assert exc.value.status_code == 503
    assert exc.value.code == "EMAIL_DELIVERY_FAILED"


def test_resend_other_422_is_not_mistaken_for_a_rejected_recipient(monkeypatch):
    svc = _service(monkeypatch, httpx.Response(422, text="not json"))
    with pytest.raises(AppError) as exc:
        svc.send_otp_email("real@gmail.com", "123456")
    assert exc.value.status_code == 503


def test_resend_success_returns_none(monkeypatch):
    svc = _service(monkeypatch, httpx.Response(200, json={"id": "abc"}))
    assert svc.send_otp_email("real@gmail.com", "123456") is None
