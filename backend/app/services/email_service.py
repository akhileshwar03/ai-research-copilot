import logging

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        self.settings = get_settings()

    def send_otp_email(self, email: str, code: str) -> str | None:
        """Send OTP verification email.

        Returns the OTP code string in development mode (no SMTP configured)
        so the caller can surface it in the UI. Returns None in production.

        Configure SMTP_HOST, SMTP_USER, SMTP_PASSWORD in .env for production.
        """
        subject = "Your AI Research Copilot verification code"
        body = (
            f"Your verification code is: {code}\n\n"
            "This code expires in 10 minutes.\n\n"
            "If you didn't request this, you can safely ignore this email."
        )

        if not self.settings.smtp_host:
            # Development mode: log the OTP and return it so the frontend can display it
            logger.warning(
                "\n"
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                "  📨 OTP EMAIL (dev mode — configure SMTP to send)\n"
                "  To: %s\n"
                "  Code: %s\n"
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n",
                email,
                code,
            )
            return code  # surfaced as _dev_code in the API response

        try:
            import smtplib
            from email.mime.text import MIMEText

            msg = MIMEText(body)
            msg["Subject"] = subject
            msg["From"] = self.settings.smtp_from or self.settings.smtp_user
            msg["To"] = email

            with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port) as server:
                server.starttls()
                server.login(self.settings.smtp_user, self.settings.smtp_password)
                server.send_message(msg)

            logger.info("otp_email_sent email=%s", email)
        except Exception:
            logger.exception("otp_email_failed email=%s", email)
            raise
        return None
