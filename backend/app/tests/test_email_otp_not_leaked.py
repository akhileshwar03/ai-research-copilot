import pytest

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.services.email_service import EmailService


def test_otp_is_never_returned_outside_development(monkeypatch):
    """With no email delivery configured, production must fail closed, never return the code."""
    settings = get_settings()
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "smtp_host", "", raising=False)
    monkeypatch.setattr(settings, "resend_api_key", "", raising=False)
    service = EmailService()
    with pytest.raises(AppError) as exc:
        service.send_otp_email(email="a@example.com", code="123456")
    assert exc.value.status_code == 503
