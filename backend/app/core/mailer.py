from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def _is_production() -> bool:
    return settings.ENVIRONMENT.strip().lower() in ("production", "prod")


def _build_message(to_email: str, reset_url: str, expire_minutes: int) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = "Đặt lại mật khẩu Smart LMS"
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email
    msg.set_content(
        "Xin chào,\n\n"
        "Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu cho tài khoản Smart LMS.\n"
        f"Mở liên kết sau để tạo mật khẩu mới (hết hạn sau {expire_minutes} phút):\n\n"
        f"{reset_url}\n\n"
        "Nếu bạn không yêu cầu, hãy bỏ qua email này. Mật khẩu hiện tại vẫn giữ nguyên.\n"
    )
    msg.add_alternative(
        f"""\
<html>
  <body style="margin:0;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
    <div style="max-width:520px;margin:32px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4f46e5">
        Smart LMS
      </p>
      <h1 style="margin:0 0 12px;font-size:20px">Đặt lại mật khẩu</h1>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569">
        Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu cho tài khoản <strong>{to_email}</strong>.
        Liên kết dưới đây hết hạn sau <strong>{expire_minutes} phút</strong> và chỉ dùng được một lần.
      </p>
      <a href="{reset_url}"
         style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:12px">
        Tạo mật khẩu mới
      </a>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#94a3b8">
        Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.
      </p>
    </div>
  </body>
</html>""",
        subtype="html",
    )
    return msg


def _send_sync(msg: EmailMessage) -> None:
    if settings.SMTP_SSL:
        server: smtplib.SMTP = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20)
    else:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20)
    try:
        if settings.SMTP_STARTTLS and not settings.SMTP_SSL:
            server.starttls()
        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)
    finally:
        try:
            server.quit()
        except Exception:  # pragma: no cover - dong ket noi loi khong quan trong
            pass


async def send_password_reset_email(to_email: str, reset_url: str) -> bool:
    """Gui email dat lai mat khau. Tra ve True neu da gui qua SMTP.

    Khi chua cau hinh SMTP:
    - moi truong dev/test: ghi link vao log de lap trinh vien thu nghiem;
    - production: chi ghi loi, KHONG ghi link (tranh lo token trong log).
    """
    expire_minutes = settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES

    if not settings.SMTP_HOST or not settings.SMTP_FROM:
        if _is_production():
            logger.error(
                "Chua cau hinh SMTP nen khong gui duoc email dat lai mat khau. "
                "Hay dat SMTP_HOST/SMTP_FROM de bat tinh nang nay."
            )
        else:
            logger.warning(
                "SMTP chua cau hinh - link dat lai mat khau (chi o dev): %s", reset_url
            )
        return False

    msg = _build_message(to_email, reset_url, expire_minutes)
    try:
        await asyncio.to_thread(_send_sync, msg)
        return True
    except Exception:
        logger.exception("Gui email dat lai mat khau that bai cho %s", to_email)
        return False
