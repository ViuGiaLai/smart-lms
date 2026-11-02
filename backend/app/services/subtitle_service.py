"""Tải phụ đề công khai bằng yt-dlp (công cụ hỗ trợ, không phải nguồn chính).

Nguyên tắc:
- Chỉ chạy khi được bật cấu hình và chỉ với video công khai.
- Không dùng cookies, không đăng nhập, không vượt CAPTCHA/PO Token.
- Có timeout, giới hạn dung lượng, chạy trong thư mục tạm và luôn dọn dẹp.
- Lỗi được ánh xạ thành mã để API trả thông báo rõ ràng; Lesson đã tạo vẫn giữ nguyên.
"""

from __future__ import annotations

import asyncio
import logging
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from app.core.config import settings
from app.services.srt_service import MAX_SRT_BYTES

logger = logging.getLogger(__name__)

_LANG_IN_FILENAME = re.compile(r"\.([a-z]{2,3}(?:-[A-Za-z0-9]+)?)\.srt$", re.IGNORECASE)


class SubtitleFetchError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def subtitle_enabled() -> bool:
    return bool(settings.YOUTUBE_SUBTITLE_ENABLED)


def _configured_languages() -> list[str]:
    raw = (settings.YOUTUBE_SUBTITLE_LANGUAGES or "vi,en").split(",")
    languages = [item.strip() for item in raw if item.strip()]
    return languages or ["vi", "en"]


def _map_error(stderr: str, returncode: int) -> SubtitleFetchError:
    text = (stderr or "").lower()
    if "no subtitles" in text or "there are no subtitles" in text:
        return SubtitleFetchError(
            "no_subtitles",
            "Video không có phụ đề ở các ngôn ngữ đã chọn. Hãy tải tệp SRT lên thủ công.",
            422,
        )
    if "429" in text or "too many requests" in text:
        return SubtitleFetchError(
            "rate_limited",
            "YouTube đang giới hạn tần suất tải phụ đề (429). Vui lòng thử lại sau hoặc tải SRT thủ công.",
            429,
        )
    if "po token" in text or "sign in to confirm" in text or "not a bot" in text:
        return SubtitleFetchError(
            "bot_check",
            "YouTube yêu cầu xác minh trình duyệt (PO Token) nên không tải được phụ đề. "
            "Hãy tải tệp SRT lên thủ công.",
            422,
        )
    if "javascript runtime" in text or "js runtime" in text or "deno" in text:
        return SubtitleFetchError(
            "js_runtime",
            "Máy chủ thiếu JavaScript runtime mà yt-dlp cần. Hãy tải SRT thủ công.",
            422,
        )
    if "unable to download" in text or "http error" in text:
        return SubtitleFetchError(
            "download_failed",
            "Không tải được phụ đề từ YouTube. Hãy thử lại hoặc tải tệp SRT thủ công.",
            502,
        )
    return SubtitleFetchError(
        "failed",
        f"yt-dlp không lấy được phụ đề (mã {returncode}). Hãy tải tệp SRT lên thủ công.",
        422,
    )


def _select_srt(files: list[Path], preferred: list[str]) -> tuple[Path, str]:
    candidates: list[tuple[int, Path, str]] = []
    for path in files:
        match = _LANG_IN_FILENAME.search(path.name)
        language = (match.group(1) if match else "und").lower()
        base_lang = language.split("-")[0]
        try:
            rank = next(
                i
                for i, lang in enumerate(preferred)
                if base_lang == lang.lower().split("-")[0]
            )
        except StopIteration:
            rank = len(preferred) + 1
        candidates.append((rank, path, language))
    candidates.sort(key=lambda item: item[0])
    _, path, language = candidates[0]
    return path, language


def _read_srt(path: Path) -> str:
    size = path.stat().st_size
    if size > MAX_SRT_BYTES:
        raise SubtitleFetchError(
            "too_large",
            "Tệp phụ đề vượt quá 2 MB. Hãy kiểm tra lại nguồn phụ đề.",
            413,
        )
    try:
        return path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError as exc:
        raise SubtitleFetchError(
            "encoding",
            "Phụ đề tải về không phải UTF-8. Hãy tải SRT thủ công.",
            422,
        ) from exc


def _download(video_id: str) -> dict:
    languages = ",".join(_configured_languages())
    timeout = max(10, min(int(settings.YOUTUBE_SUBTITLE_TIMEOUT or 60), 180))

    with tempfile.TemporaryDirectory(prefix="yt-subs-") as tmpdir:
        output_template = str(Path(tmpdir) / "subs.%(ext)s")
        command = [
            sys.executable,
            "-m",
            "yt_dlp",
            "--skip-download",
            "--no-playlist",
            "--no-warnings",
            "--no-progress",
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs",
            languages,
            "--sub-format",
            "srt/best",
            "--convert-subs",
            "srt",
            "--socket-timeout",
            "15",
            "--retries",
            "1",
            "--output",
            output_template,
            f"https://www.youtube.com/watch?v={video_id}",
        ]
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
                cwd=tmpdir,
            )
        except subprocess.TimeoutExpired as exc:
            raise SubtitleFetchError(
                "timeout",
                f"Tải phụ đề quá {timeout} giây nên đã dừng. Lesson vẫn được giữ; "
                "hãy tải SRT thủ công.",
                504,
            ) from exc
        except OSError as exc:
            logger.warning("Không chạy được yt-dlp: %s", exc)
            raise SubtitleFetchError(
                "missing_tool",
                "Máy chủ chưa cài yt-dlp. Hãy cài đặt hoặc tải SRT thủ công.",
                503,
            ) from exc

        files = sorted(Path(tmpdir).glob("*.srt"))
        if not files:
            raise _map_error(completed.stderr, completed.returncode)
        if completed.returncode != 0 and not files:
            raise _map_error(completed.stderr, completed.returncode)

        path, language = _select_srt(files, _configured_languages())
        content = _read_srt(path)
        return {
            "content": content,
            "language": language,
            "bytes": path.stat().st_size,
        }


async def download_public_subtitles(video_id: str) -> dict:
    """Tải phụ đề công khai cho một video, ưu tiên ngôn ngữ đã cấu hình."""
    if not subtitle_enabled():
        raise SubtitleFetchError(
            "disabled",
            "Chức năng tự tải phụ đề đang tắt. Hãy tải tệp SRT lên thủ công.",
            503,
        )
    if not re.match(r"^[A-Za-z0-9_-]{11}$", video_id or ""):
        raise SubtitleFetchError("invalid_id", "Video ID không hợp lệ.", 400)
    try:
        return await asyncio.to_thread(_download, video_id)
    except SubtitleFetchError:
        raise
    except Exception as exc:  # pragma: no cover - phòng vệ cuối
        logger.warning("Lỗi không mong đợi khi tải phụ đề: %s", exc)
        raise SubtitleFetchError(
            "failed",
            "Không lấy được phụ đề. Hãy tải tệp SRT lên thủ công.",
            422,
        ) from exc
