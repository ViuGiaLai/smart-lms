from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.config import settings
from app.core.database import get_db
from app.core.mailer import send_password_reset_email
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_active_user,
    token_version_of,
)
from app.core.rate_limit import (
    login_rate_limiter,
    register_rate_limiter,
    refresh_rate_limiter,
    forgot_rate_limiter,
)
from typing import Any
from pydantic import BaseModel, EmailStr
from app.models.user import User, UserRole
from app.models.password_reset import PasswordResetToken
from app.models.learning_event import LearningEvent
from app.schemas.user import UserCreate, UserResponse, Token, LoginRequest
from app.core.security import decode_token

router = APIRouter(prefix="/auth")


async def _record_login_event(db: AsyncSession, user: User) -> None:
    """Ghi sự kiện đăng nhập để đo tỷ lệ kích hoạt của lớp pilot.

    Lỗi ghi nhận không được làm hỏng đăng nhập: đây là dữ liệu phân tích phụ.
    """
    try:
        db.add(
            LearningEvent(
                user_id=user.id,
                event_type="login",
                event_metadata={"role": str(user.role.value if hasattr(user.role, "value") else user.role)},
            )
        )
        await db.commit()
    except Exception:  # noqa: BLE001 - analytics không được chặn đăng nhập
        await db.rollback()


class RefreshRequest(BaseModel):
    refreshToken: str | None = None
    refresh_token: str | None = None


class DemoLoginRequest(BaseModel):
    role: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    newPassword: str | None = None
    new_password: str | None = None


def _hash_reset_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


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


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(register_rate_limiter)],
)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    """Register a new user account."""
    result = await db.execute(select(User).where(User.email == payload.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email đã được đăng ký",
        )

    user_name = payload.fullName or payload.name or "Người dùng"
    # Đăng ký công khai luôn tạo tài khoản Học viên. Quyền Giảng viên/Quản trị chỉ
    # được cấp bởi admin (PATCH /admin/users/{id}/role) để tránh tự nâng quyền.
    user_role = UserRole.student
    requested_privileged_role = payload.role in ("instructor", "admin")

    user = User(
        email=payload.email,
        name=user_name,
        role=user_role,
        hashed_password=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.commit()
    await db.refresh(user)

    token_data = {"sub": str(user.id), "role": str(user.role.value if hasattr(user.role, "value") else user.role), "ver": user.token_version or 0}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    user_dict = _format_user_dict(user)

    return {
        "success": True,
        "message": "Đăng ký tài khoản thành công"
        if not requested_privileged_role
        else "Đăng ký thành công với quyền Học viên. Quyền Giảng viên cần quản trị viên phê duyệt.",
        "data": {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "user": user_dict,
            "privilegedRoleRequiresApproval": requested_privileged_role,
        },
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": user_dict,
    }


@router.post("/login", dependencies=[Depends(login_rate_limiter)])
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
    token_data = {"sub": str(user.id), "role": role_str, "ver": user.token_version or 0}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    user_dict = _format_user_dict(user)
    await _record_login_event(db, user)

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


@router.post("/demo-login", dependencies=[Depends(login_rate_limiter)])
async def demo_login(payload: DemoLoginRequest, db: AsyncSession = Depends(get_db)):
    """Đăng nhập nhanh cho các vai trò thuyết minh/demo.

    Không hardcode tài khoản: chọn tài khoản thật đầu tiên theo vai trò từ cơ sở dữ liệu.
    Endpoint này KHÔNG yêu cầu mật khẩu nên mặc định bị tắt; chỉ bật tạm thời ở
    môi trường demo nội bộ bằng ALLOW_DEMO_LOGIN=true (production luôn là false).
    """
    if not settings.ALLOW_DEMO_LOGIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Đăng nhập demo đã bị tắt trên môi trường này. Vui lòng đăng nhập bằng email và mật khẩu.",
        )

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
    token_data = {"sub": str(user.id), "role": role_str, "ver": user.token_version or 0}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    user_dict = _format_user_dict(user)
    await _record_login_event(db, user)

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


@router.post("/refresh", dependencies=[Depends(refresh_rate_limiter)])
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

    # Refresh token cua phien da dang xuat cung bi thu hoi.
    if token_version_of(token_payload) != (user.token_version or 0):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.",
        )

    role = user.role.value if hasattr(user.role, "value") else str(user.role)

    new_access_token = create_access_token({"sub": user_id, "role": role, "ver": user.token_version or 0})
    new_refresh_token = create_refresh_token({"sub": user_id, "role": role, "ver": user.token_version or 0})

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
async def logout(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Đăng xuất: thu hồi toàn bộ token đã phát hành cho tài khoản này.

    Tăng `users.token_version` khiến mọi access/refresh token cũ (claim `ver`
    thấp hơn) bị từ chối ngay, kể cả khi chưa hết hạn.
    """
    current_user.token_version = (current_user.token_version or 0) + 1
    await db.commit()
    return {"success": True, "message": "Đăng xuất thành công"}


@router.post("/forgot-password", dependencies=[Depends(forgot_rate_limiter)])
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Gửi link đặt lại mật khẩu (dùng một lần, có hạn).

    Luôn trả về cùng một thông báo để không tiết lộ email nào tồn tại trong hệ
    thống. Ở môi trường dev, nếu chưa cấu hình SMTP thì trả thêm `devResetUrl`
    để lập trình viên kiểm thử nhanh.
    """
    email = payload.email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    response: dict[str, Any] = {
        "success": True,
        "message": "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi liên kết đặt lại mật khẩu.",
        "data": {},
    }

    if user is not None and user.is_active:
        now = datetime.now(timezone.utc)
        # Vô hiệu hóa các token cũ chưa dùng của cùng tài khoản.
        await db.execute(
            update(PasswordResetToken)
            .where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.used_at.is_(None),
            )
            .values(used_at=now)
        )

        raw_token = secrets.token_urlsafe(32)
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=_hash_reset_token(raw_token),
                expires_at=now + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
            )
        )
        await db.commit()

        reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={raw_token}"
        sent = await send_password_reset_email(user.email, reset_url)

        is_dev = settings.ENVIRONMENT.strip().lower() not in ("production", "prod")
        if is_dev and not sent:
            response["data"] = {
                "devResetUrl": reset_url,
                "devNote": "SMTP chưa cấu hình: link chỉ hiển thị ở môi trường phát triển.",
            }

    return response


@router.post("/reset-password", dependencies=[Depends(forgot_rate_limiter)])
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Đặt lại mật khẩu bằng token dùng một lần."""
    raw_token = (payload.token or "").strip()
    new_password = payload.newPassword or payload.new_password or ""

    if not raw_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Thiếu mã đặt lại mật khẩu")
    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới phải có ít nhất 8 ký tự",
        )
    if len(new_password) > 128:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới không được vượt quá 128 ký tự",
        )

    token_hash = _hash_reset_token(raw_token)
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
        )
    )
    reset_row = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if reset_row is None or reset_row.expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
        )

    user = await db.get(User, reset_row.user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tài khoản không còn hoạt động",
        )

    # Đổi mật khẩu xong: thu hồi mọi token đăng nhập cũ và mọi mã đặt lại khác.
    user.hashed_password = hash_password(new_password)
    user.token_version = (user.token_version or 0) + 1
    await db.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    await db.commit()

    return {
        "success": True,
        "message": "Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.",
    }


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


@router.post("/login/form", response_model=Token, include_in_schema=False, dependencies=[Depends(login_rate_limiter)])
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
    token_data = {"sub": str(user.id), "role": role_str, "ver": user.token_version or 0}
    return {
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token(token_data),
        "token_type": "bearer",
    }
