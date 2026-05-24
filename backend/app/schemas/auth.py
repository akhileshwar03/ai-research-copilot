from pydantic import BaseModel, EmailStr


class AuthRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    token: str
    access_token: str
    token_type: str = "bearer"


class MessageResponse(BaseModel):
    message: str


class SendOtpRequest(BaseModel):
    email: EmailStr


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    code: str
    password: str | None = None


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
