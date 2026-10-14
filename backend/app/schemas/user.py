from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ── Shared ───────
class UserBase(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=255)


# ── Create ───────
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    name: str | None = None
    fullName: str | None = None
    role: str = "student"


# ── Update ───────
class UserUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    avatar_url: str | None = None
    password: str | None = Field(None, min_length=8, max_length=128)


# ── Response ─────
class UserResponse(UserBase):
    id: int
    role: str
    is_active: bool
    avatar_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Auth 
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str
    type: str
    exp: int


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
