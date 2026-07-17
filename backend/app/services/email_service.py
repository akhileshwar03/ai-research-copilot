import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# ── HTML email templates ────────────────────────────────────────────────────────

def _otp_html(code: str, purpose: str = "verify") -> str:
    action = "sign in to" if purpose == "auth" else "verify your email for"
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:20px;font-weight:600;color:#fff;">Querex</p>
          <p style="margin:4px 0 0;font-size:13px;color:#71717a;">Your intelligent research workspace</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 8px;font-size:14px;color:#a1a1aa;">Use this code to {action} Querex.</p>
          <p style="margin:0 0 24px;font-size:14px;color:#71717a;">This code expires in <strong style="color:#a1a1aa;">10 minutes</strong>.</p>
          <!-- Code box -->
          <div style="background:#0d0d0d;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:#52525b;">Verification Code</p>
            <p style="margin:0;font-size:36px;font-weight:700;letter-spacing:0.15em;font-family:'Courier New',monospace;color:#fff;">{code}</p>
          </div>
          <p style="margin:0;font-size:13px;color:#52525b;">If you didn't request this, you can safely ignore this email. Someone may have typed your email by mistake.</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:12px;color:#3f3f46;">Querex · Sent because you attempted to sign in</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

def _otp_text(code: str) -> str:
    return f"Your Querex verification code is: {code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, ignore this email."


# ── Email service ───────────────────────────────────────────────────────────────

class EmailService:
    def __init__(self):
        self.settings = get_settings()

    def send_otp_email(self, email: str, code: str, purpose: str = "auth") -> str | None:
        """Send an OTP verification email.

        Delivery priority:
          1. Resend API (set RESEND_API_KEY) — recommended for production
          2. SMTP (set SMTP_HOST + SMTP_USER + SMTP_PASSWORD) — fallback
          3. Console log + return code — development mode (no delivery configured)

        Returns the code string only in development mode (no delivery configured).
        Raises AppError if delivery is configured but fails.
        """
        from app.core.exceptions import AppError

        subject = "Your verification code — Querex"
        html = _otp_html(code, purpose)
        text = _otp_text(code)

        delivery_configured = bool(self.settings.resend_api_key or self.settings.smtp_host)

        # ── 1. Resend API ──────────────────────────────────────────────────────
        if self.settings.resend_api_key:
            if self._send_via_resend(email, subject, html, text):
                return None
            logger.warning("resend_failed_falling_through to=%s", email)

        # ── 2. SMTP ────────────────────────────────────────────────────────────
        if self.settings.smtp_host:
            if self._send_via_smtp(email, subject, html, text):
                return None
            logger.warning("smtp_failed_falling_through to=%s", email)

        # ── 3. Delivery configured but all methods failed ──────────────────────
        if delivery_configured:
            raise AppError(
                code="EMAIL_DELIVERY_FAILED",
                message="We couldn't send the verification email. Please try again in a moment.",
                status_code=503,
            )

        # ── 4. Dev mode (no delivery configured) ──────────────────────────────
        logger.warning(
            "\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "  📨  OTP (dev mode — configure email to send)\n"
            "  To   : %s\n"
            "  Code : %s\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n",
            email, code,
        )
        return code  # surfaced as _dev_code in the API response

    # ── Resend ─────────────────────────────────────────────────────────────────

    def _send_via_resend(self, to: str, subject: str, html: str, text: str) -> bool:
        """Returns True on success, False on failure (never raises)."""
        try:
            resp = httpx.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {self.settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": self.settings.email_from,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                    "text": text,
                },
                timeout=10,
            )
            resp.raise_for_status()
            logger.info("otp_email_sent_resend to=%s id=%s", to, resp.json().get("id"))
            return True
        except httpx.HTTPStatusError as exc:
            logger.error(
                "resend_error to=%s status=%s body=%s",
                to, exc.response.status_code, exc.response.text,
            )
            return False
        except Exception:
            logger.exception("resend_unexpected_error to=%s", to)
            return False

    # ── SMTP ───────────────────────────────────────────────────────────────────

    def _send_via_smtp(self, to: str, subject: str, html: str, text: str) -> bool:
        """Returns True on success, False on failure (never raises)."""
        try:
            sender = self.settings.smtp_from or self.settings.smtp_user
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = sender
            msg["To"] = to
            msg.attach(MIMEText(text, "plain"))
            msg.attach(MIMEText(html, "html"))

            with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port) as server:
                server.starttls()
                server.login(self.settings.smtp_user, self.settings.smtp_password)
                server.send_message(msg)

            logger.info("otp_email_sent_smtp to=%s", to)
            return True
        except Exception:
            logger.exception("smtp_error to=%s", to)
            return False
