"""
Smart LMS - Video/Audio Transcriber với OpenAI Whisper
Chuyển đổi video/audio thành text có timestamp.
Hỗ trợ: MP4, MP3, WAV, WEBM, OGG, M4A, AVI, MOV
"""

import asyncio
import os
import tempfile
from pathlib import Path
from typing import List, Optional
import structlog

import whisper
import numpy as np

from core.config import settings

logger = structlog.get_logger(__name__)

# ===== Data Models =====
from dataclasses import dataclass


@dataclass
class TranscriptSegment:
    """Một đoạn text với timestamp."""
    start: float      # Giây bắt đầu
    end: float        # Giây kết thúc
    text: str         # Nội dung text
    confidence: Optional[float] = None  # Độ tin cậy (0-1)


@dataclass
class TranscriptResult:
    """Kết quả transcription đầy đủ."""
    full_text: str                      # Toàn bộ text
    segments: List[TranscriptSegment]  # Từng đoạn với timestamp
    language: str                       # Ngôn ngữ được phát hiện
    duration: float                     # Tổng thời lượng (giây)
    model_used: str                     # Tên model Whisper


class VideoTranscriber:
    """
    Transcribe video/audio thành text có timestamp dùng OpenAI Whisper.
    
    Whisper model sizes và trade-offs:
    - tiny:   ~39M params, nhanh nhất, kém chính xác nhất
    - base:   ~74M params, cân bằng tốt cho tiếng Anh
    - small:  ~244M params, tốt cho đa ngôn ngữ
    - medium: ~769M params, tốt cho tiếng Việt
    - large:  ~1550M params, chính xác nhất, chậm nhất
    """

    _model_instance = None  # Cache model để không load lại nhiều lần

    def __init__(self, model_name: Optional[str] = None):
        self.model_name = model_name or settings.WHISPER_MODEL
        self._model = None

    def _load_model(self):
        """Load Whisper model (lazy loading + singleton cache)."""
        if VideoTranscriber._model_instance is None:
            logger.info(f"Loading Whisper model: {self.model_name}...")
            VideoTranscriber._model_instance = whisper.load_model(self.model_name)
            logger.info(f"Whisper model '{self.model_name}' loaded")
        return VideoTranscriber._model_instance

    async def transcribe_file(
        self,
        file_path: str,
        language: Optional[str] = None,
        task: str = "transcribe",  # "transcribe" | "translate" (dịch sang tiếng Anh)
    ) -> TranscriptResult:
        """
        Transcribe file video/audio.

        Args:
            file_path: Đường dẫn đến file
            language: Mã ngôn ngữ (vd: "vi", "en"). None = tự phát hiện
            task: "transcribe" (giữ nguyên ngôn ngữ) hoặc "translate" (dịch sang EN)

        Returns:
            TranscriptResult với full text và segments có timestamp
        """
        if not Path(file_path).exists():
            raise FileNotFoundError(f"File không tồn tại: {file_path}")

        logger.info(
            "Starting transcription",
            file=file_path,
            model=self.model_name,
            language=language or "auto-detect",
        )

        # Chạy Whisper trong thread pool (nặng về CPU)
        result = await asyncio.get_running_loop().run_in_executor(
            None,
            self._transcribe_sync,
            file_path,
            language,
            task,
        )

        return result

    async def transcribe_bytes(
        self,
        content: bytes,
        filename: str,
        language: Optional[str] = None,
    ) -> TranscriptResult:
        """
        Transcribe từ bytes (nhận từ API upload).
        Lưu vào temp file rồi transcribe.
        """
        suffix = Path(filename).suffix.lower()
        
        # Lưu vào temp file
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            result = await self.transcribe_file(tmp_path, language)
        finally:
            # Xóa temp file
            os.unlink(tmp_path)

        return result

    def _transcribe_sync(
        self,
        file_path: str,
        language: Optional[str],
        task: str,
    ) -> TranscriptResult:
        """Đồng bộ: chạy Whisper transcription."""
        model = self._load_model()

        # Tùy chọn transcription
        options = {
            "task": task,
            "verbose": False,
            "word_timestamps": False,  # True nếu cần timestamp cấp độ từ
            "fp16": False,             # Tắt FP16 để tương thích CPU
        }

        if language:
            options["language"] = language

        # Chạy transcription
        raw_result = model.transcribe(file_path, **options)

        # Parse segments
        segments = []
        for seg in raw_result.get("segments", []):
            segments.append(
                TranscriptSegment(
                    start=seg["start"],
                    end=seg["end"],
                    text=seg["text"].strip(),
                    confidence=seg.get("avg_logprob"),  # Log probability
                )
            )

        # Tính tổng duration từ segment cuối
        duration = segments[-1].end if segments else 0.0

        return TranscriptResult(
            full_text=raw_result["text"].strip(),
            segments=segments,
            language=raw_result.get("language", "unknown"),
            duration=duration,
            model_used=self.model_name,
        )

    def format_transcript_with_timestamps(
        self,
        result: TranscriptResult,
        format: str = "text",
    ) -> str:
        """
        Format transcript với timestamps.

        Args:
            result: TranscriptResult
            format: "text" (readable) hoặc "srt" (subtitle format)

        Returns:
            Formatted string
        """
        if format == "srt":
            return self._format_srt(result)
        else:
            return self._format_text(result)

    def _format_text(self, result: TranscriptResult) -> str:
        """Format dạng text dễ đọc: [00:01:23] text..."""
        lines = [
            f"Ngôn ngữ: {result.language}",
            f"Thời lượng: {self._seconds_to_time(result.duration)}",
            f"Model: {result.model_used}",
            "=" * 50,
            "",
        ]

        for seg in result.segments:
            timestamp = self._seconds_to_time(seg.start)
            lines.append(f"[{timestamp}] {seg.text}")

        return "\n".join(lines)

    def _format_srt(self, result: TranscriptResult) -> str:
        """Format chuẩn SRT subtitle."""
        srt_lines = []
        for i, seg in enumerate(result.segments, 1):
            start_time = self._seconds_to_srt_time(seg.start)
            end_time = self._seconds_to_srt_time(seg.end)
            srt_lines.append(f"{i}\n{start_time} --> {end_time}\n{seg.text}\n")

        return "\n".join(srt_lines)

    @staticmethod
    def _seconds_to_time(seconds: float) -> str:
        """Chuyển seconds thành HH:MM:SS."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"

    @staticmethod
    def _seconds_to_srt_time(seconds: float) -> str:
        """Chuyển seconds thành SRT format HH:MM:SS,mmm."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int((seconds % 1) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"
