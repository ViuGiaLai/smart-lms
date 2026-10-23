"""
Smart LMS - Document Processor: PDF & DOCX Parser
Parse các file PDF, Word và PowerPoint thành plain text để đưa vào pipeline RAG.
Hỗ trợ: PDF (PyPDF2 + pdfplumber), DOCX (python-docx), PPTX (python-pptx)
"""

import asyncio
import io
from pathlib import Path
from typing import Optional
import structlog

# PDF parsing
import PyPDF2
import pdfplumber

# Word document parsing
from docx import Document as DocxDocument
from pptx import Presentation

logger = structlog.get_logger(__name__)


class PDFParser:
    """
    Parse PDF files thành text.
    Dùng pdfplumber làm primary (xử lý bảng biểu tốt hơn),
    fallback sang PyPDF2 nếu pdfplumber thất bại.
    """

    async def parse_file(self, file_path: str) -> dict:
        """
        Parse PDF từ đường dẫn file.

        Returns:
            dict với keys: text, pages, metadata
        """
        return await asyncio.get_running_loop().run_in_executor(
            None, self._parse_file_sync, file_path
        )

    async def parse_bytes(self, content: bytes, filename: str = "document.pdf") -> dict:
        """
        Parse PDF từ bytes (nhận từ upload API).

        Args:
            content: Nội dung file dạng bytes
            filename: Tên file để log

        Returns:
            dict với keys: text, pages, metadata
        """
        return await asyncio.get_running_loop().run_in_executor(
            None, self._parse_bytes_sync, content, filename
        )

    def _parse_file_sync(self, file_path: str) -> dict:
        """Đồng bộ: parse PDF từ file path."""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File không tồn tại: {file_path}")

        with open(file_path, "rb") as f:
            content = f.read()

        return self._parse_bytes_sync(content, path.name)

    def _parse_bytes_sync(self, content: bytes, filename: str) -> dict:
        """Đồng bộ: parse PDF từ bytes dùng pdfplumber với fallback PyPDF2."""
        pages_text = []
        metadata = {}

        # --- Primary: pdfplumber (tốt hơn cho bảng, cột) ---
        try:
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                metadata = {
                    "total_pages": len(pdf.pages),
                    "filename": filename,
                    "parser": "pdfplumber",
                }

                for i, page in enumerate(pdf.pages):
                    # Trích xuất text từ page
                    text = page.extract_text() or ""

                    # Trích xuất bảng nếu có
                    tables = page.extract_tables()
                    if tables:
                        for table in tables:
                            for row in table:
                                # Lọc None và join cells
                                row_text = " | ".join(
                                    cell.strip() for cell in row if cell
                                )
                                if row_text:
                                    text += f"\n{row_text}"

                    pages_text.append({"page": i + 1, "text": text.strip()})

            logger.info(
                "PDF parsed with pdfplumber",
                filename=filename,
                pages=len(pages_text),
            )

        except Exception as e:
            # --- Fallback: PyPDF2 ---
            logger.warning(
                "pdfplumber failed, falling back to PyPDF2",
                filename=filename,
                error=str(e),
            )
            pages_text = self._fallback_pypdf2(content, filename)
            metadata = {
                "total_pages": len(pages_text),
                "filename": filename,
                "parser": "PyPDF2 (fallback)",
            }

        # Ghép tất cả pages thành một text
        full_text = "\n\n".join(
            f"[Trang {p['page']}]\n{p['text']}"
            for p in pages_text
            if p["text"]
        )

        return {
            "text": full_text,
            "pages": pages_text,
            "metadata": metadata,
        }

    def _fallback_pypdf2(self, content: bytes, filename: str) -> list:
        """Fallback parser dùng PyPDF2."""
        pages_text = []
        reader = PyPDF2.PdfReader(io.BytesIO(content))

        for i, page in enumerate(reader.pages):
            try:
                text = page.extract_text() or ""
                pages_text.append({"page": i + 1, "text": text.strip()})
            except Exception as page_err:
                logger.warning(
                    "Cannot parse page",
                    page=i + 1,
                    error=str(page_err),
                )
                pages_text.append({"page": i + 1, "text": ""})

        return pages_text


class DocxParser:
    """Parse Microsoft Word (.docx) files thành text."""

    async def parse_file(self, file_path: str) -> dict:
        """Parse DOCX từ file path."""
        return await asyncio.get_running_loop().run_in_executor(
            None, self._parse_file_sync, file_path
        )

    async def parse_bytes(self, content: bytes, filename: str = "document.docx") -> dict:
        """Parse DOCX từ bytes."""
        return await asyncio.get_running_loop().run_in_executor(
            None, self._parse_bytes_sync, content, filename
        )

    def _parse_file_sync(self, file_path: str) -> dict:
        path = Path(file_path)
        with open(file_path, "rb") as f:
            content = f.read()
        return self._parse_bytes_sync(content, path.name)

    def _parse_bytes_sync(self, content: bytes, filename: str) -> dict:
        """Đồng bộ: parse DOCX, bao gồm paragraphs và tables."""
        doc = DocxDocument(io.BytesIO(content))
        sections = []

        # Trích xuất paragraphs (giữ heading structure)
        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue

            # Đánh dấu headings để preserv structure
            if para.style.name.startswith("Heading"):
                level = para.style.name.replace("Heading ", "")
                sections.append(f"\n{'#' * int(level) if level.isdigit() else '#'} {text}\n")
            else:
                sections.append(text)

        # Trích xuất bảng
        for table in doc.tables:
            table_rows = []
            for row in table.rows:
                row_cells = [cell.text.strip() for cell in row.cells]
                table_rows.append(" | ".join(row_cells))
            if table_rows:
                sections.append("\n" + "\n".join(table_rows) + "\n")

        full_text = "\n".join(sections)

        metadata = {
            "filename": filename,
            "paragraphs": len(doc.paragraphs),
            "tables": len(doc.tables),
            "parser": "python-docx",
        }

        logger.info("DOCX parsed", filename=filename, paragraphs=len(doc.paragraphs))

        return {
            "text": full_text,
            "metadata": metadata,
        }


class PptxParser:
    """Parse Microsoft PowerPoint (.pptx) thành text theo từng slide."""

    async def parse_bytes(self, content: bytes, filename: str = "presentation.pptx") -> dict:
        return await asyncio.get_running_loop().run_in_executor(
            None, self._parse_bytes_sync, content, filename
        )

    def _parse_bytes_sync(self, content: bytes, filename: str) -> dict:
        presentation = Presentation(io.BytesIO(content))
        pages = []
        for slide_number, slide in enumerate(presentation.slides, start=1):
            texts = []
            for shape in slide.shapes:
                if not hasattr(shape, "text"):
                    continue
                text = shape.text.strip()
                if text:
                    texts.append(text)
            pages.append({"page": slide_number, "text": "\n".join(texts)})

        return {
            "text": "\n\n".join(
                f"[Slide {page['page']}]\n{page['text']}"
                for page in pages
                if page["text"]
            ),
            "pages": pages,
            "metadata": {
                "filename": filename,
                "total_pages": len(pages),
                "parser": "python-pptx",
            },
        }


# ===== Factory Function =====
def get_parser(filename: str) -> Optional[object]:
    """
    Trả về parser phù hợp dựa trên extension của file.

    Args:
        filename: Tên file (ví dụ: "lecture.pdf")

    Returns:
        PDFParser hoặc DocxParser instance, None nếu không hỗ trợ
    """
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return PDFParser()
    elif ext == ".docx":
        # Không nhận ".doc": python-docx không đọc được định dạng nhị phân cũ,
        # nếu nhận sẽ lỗi 500 khó hiểu — trả về None để API báo 400 rõ ràng.
        return DocxParser()
    elif ext == ".pptx":
        return PptxParser()
    else:
        logger.warning("Unsupported file type", filename=filename, extension=ext)
        return None
