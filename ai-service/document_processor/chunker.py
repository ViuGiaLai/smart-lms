"""
Smart LMS - Text Chunker
Chia text thành các chunks tối ưu cho RAG pipeline.
Chiến lược: Recursive Character Splitting với semantic boundary detection.
"""

import re
from typing import List, Optional
from dataclasses import dataclass, field
import structlog

from core.config import settings

logger = structlog.get_logger(__name__)


@dataclass
class TextChunk:
    """Một chunk text với metadata."""
    content: str            # Nội dung chunk
    chunk_index: int        # Số thứ tự chunk
    start_char: int         # Vị trí ký tự bắt đầu trong text gốc
    end_char: int           # Vị trí ký tự kết thúc trong text gốc
    metadata: dict = field(default_factory=dict)  # Metadata tùy chỉnh (page, lesson_id, ...)


class TextChunker:
    """
    Chia text thành chunks với overlap tối ưu cho RAG.
    
    Chiến lược phân chia (theo thứ tự ưu tiên):
    1. Theo đoạn văn (2 newlines)
    2. Theo câu (dấu chấm, chấm hỏi, chấm than)
    3. Theo dấu phẩy / dấu chấm phẩy
    4. Theo khoảng trắng (words)
    5. Theo ký tự (fallback cuối cùng)
    """

    # Các ký tự phân tách theo thứ tự ưu tiên
    SEPARATORS = [
        "\n\n",    # Paragraph break (ưu tiên cao nhất)
        "\n",      # Line break
        "。",      # Chinese/Japanese period
        ".",       # English period (kèm space)
        "!",       # Exclamation
        "?",       # Question mark
        "；",      # Fullwidth semicolon
        ";",       # Semicolon
        "，",      # Fullwidth comma
        ",",       # Comma
        " ",       # Space
        "",        # Ký tự (fallback)
    ]

    def __init__(
        self,
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
    ):
        """
        Args:
            chunk_size: Số ký tự tối đa mỗi chunk (default từ settings)
            chunk_overlap: Số ký tự overlap giữa 2 chunk liên tiếp (default từ settings)
        """
        self.chunk_size = chunk_size or settings.CHUNK_SIZE
        self.chunk_overlap = chunk_overlap or settings.CHUNK_OVERLAP

        # Đảm bảo overlap < chunk_size
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError(
                f"chunk_overlap ({self.chunk_overlap}) phải nhỏ hơn chunk_size ({self.chunk_size})"
            )

    def split_text(
        self,
        text: str,
        metadata: Optional[dict] = None,
    ) -> List[TextChunk]:
        """
        Chia text thành list các TextChunk.

        Args:
            text: Text đầu vào cần chia
            metadata: Metadata chung cho tất cả chunks (vd: lesson_id, page_number)

        Returns:
            List[TextChunk] đã được indexed
        """
        if not text or not text.strip():
            logger.warning("Empty text provided to chunker")
            return []

        # Tiền xử lý: chuẩn hóa whitespace
        text = self._preprocess_text(text)

        # Tạo chunks dùng recursive splitting
        raw_chunks = self._recursive_split(text, self.SEPARATORS)

        # Thêm overlap và tạo TextChunk objects
        chunks = self._create_chunks_with_overlap(text, raw_chunks, metadata or {})

        logger.info(
            "Text chunked",
            total_chars=len(text),
            num_chunks=len(chunks),
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
        )

        return chunks

    def split_documents(self, documents: List[dict]) -> List[TextChunk]:
        """
        Chia nhiều documents thành chunks.

        Args:
            documents: List of dicts với keys: 'text', 'metadata'

        Returns:
            Tất cả chunks từ mọi document, đã merged
        """
        all_chunks = []
        for doc in documents:
            text = doc.get("text", "")
            metadata = doc.get("metadata", {})
            chunks = self.split_text(text, metadata)
            all_chunks.extend(chunks)

        return all_chunks

    def _preprocess_text(self, text: str) -> str:
        """Chuẩn hóa text trước khi chunking."""
        # Xóa whitespace thừa ở đầu/cuối dòng
        lines = [line.rstrip() for line in text.split("\n")]
        text = "\n".join(lines)

        # Rút gọn nhiều dòng trống liên tiếp thành tối đa 2
        text = re.sub(r"\n{3,}", "\n\n", text)

        # Xóa khoảng trắng thừa (nhưng giữ newlines)
        text = re.sub(r"[ \t]+", " ", text)

        return text.strip()

    def _recursive_split(self, text: str, separators: List[str]) -> List[str]:
        """
        Đệ quy chia text theo separators theo thứ tự ưu tiên.
        Dừng khi chunk đủ nhỏ hoặc hết separators.
        """
        if len(text) <= self.chunk_size:
            return [text]

        # Lấy separator hiện tại
        separator = separators[0]
        next_separators = separators[1:] if len(separators) > 1 else [""]

        # Chia text theo separator này
        splits = text.split(separator) if separator else list(text)

        # Gom các splits lại thành chunks đủ lớn
        good_splits = []
        current_splits = []
        current_len = 0

        for split in splits:
            split_len = len(split)

            if current_len + split_len + len(separator) > self.chunk_size:
                # Chunk hiện tại đầy → lưu lại và bắt đầu mới
                if current_splits:
                    merged = separator.join(current_splits)
                    # Nếu merged vẫn còn quá lớn → đệ quy với separator tiếp theo
                    if len(merged) > self.chunk_size and next_separators:
                        good_splits.extend(
                            self._recursive_split(merged, next_separators)
                        )
                    else:
                        good_splits.append(merged)
                current_splits = [split]
                current_len = split_len
            else:
                current_splits.append(split)
                current_len += split_len + len(separator)

        # Xử lý phần còn lại
        if current_splits:
            merged = separator.join(current_splits)
            if len(merged) > self.chunk_size and next_separators:
                good_splits.extend(self._recursive_split(merged, next_separators))
            else:
                good_splits.append(merged)

        return good_splits

    def _create_chunks_with_overlap(
        self,
        original_text: str,
        raw_chunks: List[str],
        metadata: dict,
    ) -> List[TextChunk]:
        """
        Tạo TextChunk objects với overlap.
        Overlap giúp RAG không bỏ sót thông tin ở ranh giới giữa các chunks.
        """
        chunks = []
        current_pos = 0

        for i, chunk_text in enumerate(raw_chunks):
            if not chunk_text.strip():
                continue

            # Tìm vị trí thực của chunk trong text gốc
            start_char = original_text.find(chunk_text, current_pos)
            if start_char == -1:
                start_char = current_pos
            end_char = start_char + len(chunk_text)

            # Thêm overlap từ chunk trước (prefix overlap)
            if i > 0 and chunks:
                prev_content = chunks[-1].content
                overlap_text = prev_content[-self.chunk_overlap:]
                # Tìm boundary sạch để bắt đầu overlap (không cắt giữa từ)
                space_pos = overlap_text.find(" ")
                if space_pos > 0:
                    overlap_text = overlap_text[space_pos + 1:]
                chunk_text = overlap_text + " " + chunk_text

            chunk = TextChunk(
                content=chunk_text.strip(),
                chunk_index=i,
                start_char=start_char,
                end_char=end_char,
                metadata={**metadata, "chunk_index": i},
            )
            chunks.append(chunk)
            current_pos = end_char

        return chunks


# ===== Convenience Function =====
def chunk_text(
    text: str,
    chunk_size: Optional[int] = None,
    chunk_overlap: Optional[int] = None,
    metadata: Optional[dict] = None,
) -> List[TextChunk]:
    """
    Hàm tiện ích: chia text thành chunks với một lệnh gọi.

    Args:
        text: Text cần chia
        chunk_size: Kích thước chunk (default từ settings)
        chunk_overlap: Overlap giữa chunks (default từ settings)
        metadata: Metadata đính kèm (vd: {'lesson_id': 123})

    Returns:
        List[TextChunk]
    """
    chunker = TextChunker(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    return chunker.split_text(text, metadata)
