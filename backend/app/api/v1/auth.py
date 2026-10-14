from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_active_user,
)
from typing import Any
from pydantic import BaseModel
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserResponse, Token, LoginRequest
from app.core.security import decode_token

router = APIRouter(prefix="/auth")


class RefreshRequest(BaseModel):
    refreshToken: str | None = None
    refresh_token: str | None = None


class DemoLoginRequest(BaseModel):
    role: str


def _format_user_dict(user: User) -> dict[str, Any]:
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "fullName": user.name,
        "role": str(user.role.value if hasattr(user.role, "value") else user.role),
        "isActive": user.is_active,
        "avatar": user.avatar_url,
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    """Register a new user account."""
    result = await db.execute(select(User).where(User.email == payload.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email đã được đăng ký",
        )

    user_name = payload.fullName or payload.name or "Người dùng"
    user_role = UserRole.instructor if payload.role == "instructor" else UserRole.student

    user = User(
        email=payload.email,
        name=user_name,
        role=user_role,
        hashed_password=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    token_data = {"sub": str(user.id), "role": str(user.role.value if hasattr(user.role, "value") else user.role)}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    user_dict = _format_user_dict(user)

    return {
        "success": True,
        "message": "Đăng ký tài khoản thành công",
        "data": {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "user": user_dict,
        },
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": user_dict,
    }


@router.post("/login")
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return JWT tokens."""
    result = await db.execute(select(User).where(User.email == payload.email))
    user: User | None = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tài khoản đã bị vô hiệu hóa")

    role_str = str(user.role.value if hasattr(user.role, "value") else user.role)
    token_data = {"sub": str(user.id), "role": role_str}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    user_dict = _format_user_dict(user)

    return {
        "success": True,
        "message": "Đăng nhập thành công",
        "data": {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "user": user_dict,
        },
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": user_dict,
    }


@router.post("/demo-login")
async def demo_login(payload: DemoLoginRequest, db: AsyncSession = Depends(get_db)):
    """Đăng nhập nhanh cho các vai trò thuyết minh/demo.

    Không hardcode tài khoản: chọn tài khoản thật đầu tiên theo vai trò từ cơ sở dữ liệu.
    """
    role_map = {
        "admin": UserRole.admin,
        "instructor": UserRole.instructor,
        "student": UserRole.student,
    }
    target_role = role_map.get(payload.role)
    if not target_role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vai trò demo không hợp lệ")

    result = await db.execute(
        select(User)
        .where(User.role == target_role, User.is_active.is_(True))
        .order_by(User.id.asc())
        .limit(1)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chưa có tài khoản nào với vai trò '{payload.role}' trong cơ sở dữ liệu",
        )

    role_str = str(user.role.value if hasattr(user.role, "value") else user.role)
    token_data = {"sub": str(user.id), "role": role_str}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    user_dict = _format_user_dict(user)

    return {
        "success": True,
        "message": f"Đăng nhập demo vai trò {payload.role} thành công",
        "data": {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "user": user_dict,
        },
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_dict,
    }


@router.post("/refresh")
async def refresh_token_endpoint(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Refresh expired access token."""
    token = payload.refreshToken or payload.refresh_token
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Thiếu refresh token")

    token_payload = decode_token(token, expected_type="refresh")
    user_id = token_payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token không hợp lệ")

    try:
        parsed_user_id = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token không hợp lệ")

    result = await db.execute(select(User).where(User.id == parsed_user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tài khoản không còn hoạt động")

    role = user.role.value if hasattr(user.role, "value") else str(user.role)

    new_access_token = create_access_token({"sub": user_id, "role": role})
    new_refresh_token = create_refresh_token({"sub": user_id, "role": role})

    return {
        "success": True,
        "data": {
            "accessToken": new_access_token,
            "refreshToken": new_refresh_token,
        },
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
    }


@router.post("/logout")
async def logout():
    """Logout endpoint."""
    return {"success": True, "message": "Đăng xuất thành công"}


@router.get("/profile")
@router.get("/me")
async def get_profile(current_user: User = Depends(get_current_active_user)):
    """Return the currently authenticated user's profile."""
    user_dict = _format_user_dict(current_user)
    return {
        "success": True,
        "data": user_dict,
        **user_dict,
    }


@router.post("/login/form", response_model=Token, include_in_schema=False)
async def login_form(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """OAuth2 form-based login (used by Swagger UI)."""
    result = await db.execute(select(User).where(User.email == form.username))
    user: User | None = result.scalar_one_or_none()

    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tài khoản đã bị vô hiệu hóa")

    role_str = str(user.role.value if hasattr(user.role, "value") else user.role)
    token_data = {"sub": str(user.id), "role": role_str}
    return {
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token(token_data),
        "token_type": "bearer",
    }
