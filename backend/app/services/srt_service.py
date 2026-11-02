"""Parse phụ đề SRT/VTT và gom thành chunk có mốc thời gian.

Module thuần Python (không phụ thuộc DB/HTTP) để dễ kiểm thử. Mỗi chunk giữ
`start_seconds`/`end_seconds` để RAG có thể trích dẫn và player tua đúng đoạn.
"""

from __future__ import annotations

import hashlib
import html
import re
from dataclasses import dataclass
from typing import Iterable

MAX_SRT_BYTES = 2 * 1024 * 1024  # 2 MB
MIN_CHUNK_SECONDS = 30
MAX_CHUNK_SECONDS = 60
MAX_CHUNK_CHARS = 1200

_TIMESTAMP_RE = re.compile(
    r"(?P<start>\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}|\d{1,2}:\d{2}[,.]\d{1,3})"
    r"\s*-->\s*"
    r"(?P<end>\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}|\d{1,2}:\d{2}[,.]\d{1,3})"
)
_TAG_RE = re.compile(r"<[^>]+>")
_ASS_RE = re.compile(r"\{\\[^}]*\}")
_MULTISPACE_RE = re.compile(r"[ \t]+")


@dataclass(frozen=True)
class Cue:
    start_ms: int
    end_ms: int
    text: str


@dataclass(frozen=True)
class SubtitleChunk:
    start_ms: int
    end_ms: int
    text: str
    metadata: dict


class SubtitleParseError(ValueError):
    """SRT không hợp lệ hoặc không có cue nào dùng được."""


def checksum(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _parse_timestamp(value: str) -> int:
    value = value.replace(",", ".")
    parts = value.split(":")
    if len(parts) == 3:
        hours, minutes, seconds = parts
    elif len(parts) == 2:
        hours, minutes, seconds = "0", parts[0], parts[1]
    else:  # pragma: no cover - regex đã giới hạn
        raise ValueError(f"Mốc thời gian không hợp lệ: {value}")
    sec_float = float(seconds)
    return int(
        (int(hours) * 3600 + int(minutes) * 60) * 1000 + round(sec_float * 1000)
    )


def _clean_text(lines: Iterable[str]) -> str:
    text = " ".join(lines)
    text = _ASS_RE.sub(" ", text)
    text = _TAG_RE.sub(" ", text)
    text = html.unescape(text)
    text = text.replace("\u200b", "").replace("\ufeff", "")
    text = _MULTISPACE_RE.sub(" ", text)
    return text.strip()


def parse_srt(content: str) -> list[Cue]:
    """Parse nội dung SRT (hoặc VTT đơn giản) thành danh sách cue.

    Chấp nhận BOM, CRLF, thiếu số thứ tự, dấu phẩy hoặc dấu chấm cho mili-giây.
    Cue hỏng bị bỏ qua; nếu không còn cue hợp lệ thì báo lỗi rõ ràng.
    """
    if not isinstance(content, str) or not content.strip():
        raise SubtitleParseError("Tệp phụ đề rỗng.")

    normalized = content.replace("\ufeff", "").replace("\r\n", "\n").replace("\r", "\n")
    blocks = re.split(r"\n\s*\n", normalized)
    cues: list[Cue] = []

    for block in blocks:
        lines = [line.rstrip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue
        # Bỏ số thứ tự và header WEBVTT / NOTE / STYLE.
        while lines and (
            lines[0].isdigit()
            or lines[0].upper().startswith(("WEBVTT", "NOTE", "STYLE", "REGION"))
        ):
            lines.pop(0)
        if not lines:
            continue

        time_index = next((i for i, line in enumerate(lines) if "-->" in line), None)
        if time_index is None:
            continue
        match = _TIMESTAMP_RE.search(lines[time_index])
        if not match:
            continue
        try:
            start_ms = _parse_timestamp(match.group("start"))
            end_ms = _parse_timestamp(match.group("end"))
        except (TypeError, ValueError):
            continue
        if start_ms < 0 or end_ms <= start_ms:
            continue

        text_lines = [
            line for line in lines[time_index + 1 :] if not line.strip().isdigit()
        ]
        text = _clean_text(text_lines)
        if not text:
            continue
        cues.append(Cue(start_ms=start_ms, end_ms=end_ms, text=text))

    if not cues:
        raise SubtitleParseError(
            "Không đọc được mốc thời gian nào trong tệp. Hãy kiểm tra định dạng SRT "
            "(ví dụ: 00:00:01,000 --> 00:00:05,000)."
        )

    cues.sort(key=lambda c: c.start_ms)
    return cues


def transcript_text(cues: list[Cue]) -> str:
    """Văn bản transcript kèm mốc thật để UI hiển thị đúng thời gian.

    Định dạng mỗi dòng: ``[mm:ss–mm:ss] nội dung``. UI dùng chính mốc này,
    không tự sinh timestamp theo thứ tự dòng.
    """
    seen: set[str] = set()
    lines: list[str] = []
    for cue in cues:
        if cue.text in seen:
            continue
        seen.add(cue.text)
        start = format_timestamp(cue.start_ms // 1000)
        end = format_timestamp(cue.end_ms // 1000)
        lines.append(f"[{start}–{end}] {cue.text}")
    return "\n".join(lines)


def format_timestamp(seconds: int) -> str:
    seconds = max(0, int(seconds))
    hours, remainder = divmod(seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def build_chunks(
    cues: list[Cue],
    *,
    extra_metadata: dict | None = None,
    target_seconds: int = MIN_CHUNK_SECONDS,
    max_seconds: int = MAX_CHUNK_SECONDS,
) -> list[SubtitleChunk]:
    """Gom cue thành chunk 30–60 giây, không cắt giữa cue.

    Một chunk đóng khi đạt `target_seconds` (và đủ chữ) hoặc khi vượt
    `max_seconds`/`MAX_CHUNK_CHARS`. Cue đơn lẻ dài hơn giới hạn vẫn được giữ
    nguyên vẹn để không mất nội dung.
    """
    if not cues:
        raise SubtitleParseError("Không có nội dung phụ đề để tạo chunk.")

    base_meta = dict(extra_metadata or {})
    chunks: list[SubtitleChunk] = []
    buffer: list[Cue] = []

    def flush() -> None:
        if not buffer:
            return
        start_s = buffer[0].start_ms // 1000
        end_s = max(buffer[-1].end_ms // 1000, start_s + 1)
        text_parts: list[str] = []
        last_text = ""
        for cue in buffer:
            if cue.text == last_text:
                continue
            text_parts.append(cue.text)
            last_text = cue.text
        text = _MULTISPACE_RE.sub(" ", " ".join(text_parts)).strip()
        metadata = {
            **base_meta,
            "start_seconds": start_s,
            "end_seconds": end_s,
            "start_timestamp": format_timestamp(start_s),
            "end_timestamp": format_timestamp(end_s),
            "source_type": base_meta.get("source_type", "youtube_subtitle"),
        }
        chunks.append(SubtitleChunk(start_ms=buffer[0].start_ms, end_ms=buffer[-1].end_ms, text=text, metadata=metadata))
        buffer.clear()

    for cue in cues:
        buffer.append(cue)
        duration = (buffer[-1].end_ms - buffer[0].start_ms) / 1000
        chars = sum(len(c.text) for c in buffer)
        if duration >= max_seconds or chars >= MAX_CHUNK_CHARS:
            flush()
        elif duration >= target_seconds and chars >= 180:
            flush()

    flush()
    return [chunk for chunk in chunks if chunk.text.strip()]


def parse_and_chunk(
    content: str,
    *,
    extra_metadata: dict | None = None,
) -> tuple[list[Cue], list[SubtitleChunk]]:
    cues = parse_srt(content)
    return cues, build_chunks(cues, extra_metadata=extra_metadata)
