from pydantic import BaseModel, ConfigDict, EmailStr, Field


class AuthRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    # Optional: cookie-based clients send no body; the httpOnly cookie carries
    # the token. Body form kept for clients where cross-site cookies are blocked.
    refresh_token: str | None = None


class RefreshResponse(BaseModel):
    token: str
    access_token: str
    token_type: str = "bearer"


class MessageResponse(BaseModel):
    message: str


class MeResponse(BaseModel):
    email: EmailStr
    is_admin: bool
    email_verified: bool
    created_at: str | None = None


class SignupResponse(BaseModel):
    email: EmailStr
    needs_otp: bool


class SendOtpResponse(BaseModel):
    message: str
    # Only present in dev mode (no email provider configured).
    dev_code: str | None = Field(default=None, alias="_dev_code")

    model_config = ConfigDict(populate_by_name=True)


class VerifyOtpResponse(AuthResponse):
    is_new_user: bool = False


class SendOtpRequest(BaseModel):
    email: EmailStr


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    code: str
    password: str | None = None


class SignupRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ResetPasswordRequest(BaseModel):
    """Forgot-password flow: OTP code + new password (no current password needed)."""
    email: EmailStr
    code: str
    new_password: str
