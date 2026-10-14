import os
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

from core.database import AsyncSessionLocal
from document_processor.pdf_parser import get_parser
from document_processor.chunker import TextChunker
from document_processor.embedder import get_embedder
from vector_store.pgvector_store import PgVectorStore

router = APIRouter()

class IngestResponse(BaseModel):
    message: str
    lesson_id: int
    filename: str
    total_pages: int
    total_chunks: int

@router.post("/upload", response_model=IngestResponse, summary="Tải lên tài liệu bài giảng (PDF/DOCX) và nhúng vào pgvector")
async def upload_and_ingest_document(
    lesson_id: int = Form(..., description="ID bài học sở hữu tài liệu"),
    file: UploadFile = File(..., description="Tệp tài liệu PDF hoặc DOCX")
):
    # 1. Kiểm tra parser phù hợp
    parser = get_parser(file.filename)
    if not parser:
        raise HTTPException(
            status_code=400,
            detail=f"Định dạng tệp không được hỗ trợ: {file.filename}. Chỉ chấp nhận .pdf, .docx, .doc"
        )

    try:
        content_bytes = await file.read()

        # 2. Bóc tách tài liệu
        parsed_doc = await parser.parse_bytes(content_bytes, filename=file.filename)
        text = parsed_doc.get("text", "")
        if not text.strip():
            raise HTTPException(status_code=400, detail="Tài liệu không chứa nội dung văn bản hợp lệ.")

        total_pages = parsed_doc.get("metadata", {}).get("total_pages", 1)

        # 3. Phân đoạn ngữ nghĩa (Chunking) với overlap tối ưu
        chunker = TextChunker()
        chunks = chunker.split_text(text, metadata={"filename": file.filename, "lesson_id": lesson_id})
        if not chunks:
            raise HTTPException(status_code=400, detail="Không thể phân đoạn văn bản từ tài liệu.")

        chunk_texts = [c.content for c in chunks]

        # 4. Sinh vector embeddings
        embedder = get_embedder()
        embeddings = await embedder.embed_documents(chunk_texts)

        # 5. Lưu trữ vào pgvector theo lesson_id
        async with AsyncSessionLocal() as db:
            store = PgVectorStore(db)
            metadata_list = [c.metadata for c in chunks]
            await store.add_chunks(
                lesson_id=lesson_id,
                contents=chunk_texts,
                embeddings=embeddings,
                document_id=file.filename,
                metadata_list=metadata_list,
            )

        return IngestResponse(
            message="Số hóa và nhúng tài liệu thành công vào cơ sở tri thức bài học!",
            lesson_id=lesson_id,
            filename=file.filename,
            total_pages=total_pages,
            total_chunks=len(chunks),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xử lý tài liệu bài giảng: {str(e)}")

class IngestTextRequest(BaseModel):
    lesson_id: int
    chunks: List[str]
    document_id: Optional[str] = None
    replace_existing: bool = True
    metadata: Optional[List[dict]] = None


class IngestTextResponse(BaseModel):
    message: str
    lesson_id: int
    total_chunks: int
    deleted_chunks: int


@router.post(
    "/ingest-text",
    response_model=IngestTextResponse,
    summary="Nhúng tri thức dạng text (transcript) vào pgvector bằng embedding Gemini thật",
)
async def ingest_text_chunks(req: IngestTextRequest):
    """Nhúng các đoạn text có sẵn (ví dụ transcript bài giảng) vào pgvector.

    Dùng chung embedder của AI Service để bảo đảm mọi vector trong cơ sở tri thức
    đều là embedding thật từ Gemini. Nếu thiếu API key hoặc Gemini lỗi, endpoint
    trả lỗi 502 thay vì nạp vector giả.
    """
    chunks = [c.strip() for c in req.chunks]
    if not chunks or any(not c for c in chunks):
        raise HTTPException(
            status_code=400,
            detail="Danh sách chunks không hợp lệ: mỗi chunk phải có nội dung text.",
        )
    if req.metadata is not None and len(req.metadata) != len(chunks):
        raise HTTPException(
            status_code=400,
            detail=f"metadata có {len(req.metadata)} phần tử nhưng có {len(chunks)} chunks.",
        )

    try:
        embedder = get_embedder()
        embeddings = await embedder.embed_documents(chunks)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Không tạo được embedding thật cho học liệu: {str(e)}",
        )

    async with AsyncSessionLocal() as db:
        store = PgVectorStore(db)
        deleted = await store.delete_by_lesson(req.lesson_id) if req.replace_existing else 0
        await store.add_chunks(
            lesson_id=req.lesson_id,
            contents=chunks,
            embeddings=embeddings,
            document_id=req.document_id,
            metadata_list=req.metadata,
        )

    return IngestTextResponse(
        message="Nhúng tri thức bài học thành công bằng embedding Gemini thật.",
        lesson_id=req.lesson_id,
        total_chunks=len(chunks),
        deleted_chunks=deleted,
    )


@router.delete("/lesson/{lesson_id}", summary="Xóa toàn bộ tri thức vector của bài học")
async def delete_lesson_vectors(lesson_id: int):
    try:
        async with AsyncSessionLocal() as db:
            store = PgVectorStore(db)
            deleted_count = await store.delete_by_lesson(lesson_id)
        return {"message": f"Đã xóa {deleted_count} chunks của bài học {lesson_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xóa vector: {str(e)}")
