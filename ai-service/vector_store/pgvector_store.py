"""
Smart LMS - pgvector Store
Lưu trữ và tìm kiếm vector embeddings trong PostgreSQL sử dụng pgvector.
Dùng HNSW index để tìm kiếm approximate nearest neighbor nhanh hơn IVFFlat.
"""

from typing import List, Optional, Tuple
from uuid import uuid4
import structlog

from sqlalchemy import Column, String, Integer, Text, JSON, Index, select, delete
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from pgvector.sqlalchemy import Vector

from core.database import Base
from core.config import settings

logger = structlog.get_logger(__name__)

# Kích thước vector (phụ thuộc vào embedding model)
# Gemini text-embedding-004: 768 dims
# OpenAI text-embedding-3-small: 1536 dims
VECTOR_DIMENSION = 768


# ===== SQLAlchemy Model =====
class DocumentChunk(Base):
    """
    Bảng lưu trữ các chunks của tài liệu kèm vector embedding.
    Được tổ chức theo lesson_id để hỗ trợ lesson-bounded search trong RAG.
    """
    __tablename__ = "document_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    
    # Liên kết với bài học (lesson-bounded context)
    lesson_id = Column(Integer, nullable=False, index=True)
    
    # Liên kết với tài liệu gốc
    document_id = Column(String(255), nullable=True, index=True)
    
    # Nội dung chunk
    content = Column(Text, nullable=False)
    
    # Thứ tự chunk trong tài liệu
    chunk_index = Column(Integer, nullable=False, default=0)
    
    # Vector embedding (pgvector type)
    embedding = Column(Vector(VECTOR_DIMENSION), nullable=False)
    
    # Metadata linh hoạt (page number, source file, timestamps, ...)
    chunk_metadata = Column(JSON, nullable=True, default=dict)

    def __repr__(self):
        return f"<DocumentChunk id={self.id} lesson_id={self.lesson_id} chunk_index={self.chunk_index}>"


# ===== HNSW Index =====
# HNSW (Hierarchical Navigable Small World) nhanh hơn IVFFlat cho search
# Tạo index sau khi bảng có data (không tạo ngay lúc CREATE TABLE)
HNSW_INDEX = Index(
    "idx_document_chunks_embedding_hnsw",
    DocumentChunk.embedding,
    postgresql_using="hnsw",
    postgresql_with={"m": 16, "ef_construction": 64},  # HNSW parameters
    postgresql_ops={"embedding": "vector_cosine_ops"},   # Dùng cosine similarity
)


class PgVectorStore:
    """
    Interface để lưu và tìm kiếm vector embeddings trong PostgreSQL+pgvector.

    Phương thức chính:
    - add_chunks(): Lưu chunks với embeddings
    - similarity_search(): Tìm chunks tương đồng nhất với query
    - similarity_search_by_lesson(): Tìm trong phạm vi một bài học (lesson-bounded)
    - delete_by_lesson(): Xóa tất cả chunks của một bài học
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def add_chunks(
        self,
        lesson_id: int,
        contents: List[str],
        embeddings: List[List[float]],
        document_id: Optional[str] = None,
        metadata_list: Optional[List[dict]] = None,
    ) -> List[str]:
        """
        Lưu nhiều chunks và embeddings vào database.

        Args:
            lesson_id: ID của bài học
            contents: List nội dung text của từng chunk
            embeddings: List vector embeddings tương ứng
            document_id: ID của tài liệu gốc (optional)
            metadata_list: List metadata cho từng chunk

        Returns:
            List các UUID đã được tạo
        """
        if len(contents) != len(embeddings):
            raise ValueError("Số chunks và embeddings phải bằng nhau")

        ids = []
        for i, (content, embedding) in enumerate(zip(contents, embeddings)):
            meta = metadata_list[i] if metadata_list else {}

            chunk = DocumentChunk(
                id=uuid4(),
                lesson_id=lesson_id,
                document_id=document_id,
                content=content,
                chunk_index=i,
                embedding=embedding,
                chunk_metadata=meta,
            )
            self.db.add(chunk)
            ids.append(str(chunk.id))

        await self.db.commit()

        logger.info(
            "Chunks saved to pgvector",
            lesson_id=lesson_id,
            num_chunks=len(ids),
            document_id=document_id,
        )

        return ids

    async def similarity_search(
        self,
        query_embedding: List[float],
        top_k: Optional[int] = None,
        threshold: Optional[float] = None,
    ) -> List[dict]:
        """
        Tìm kiếm global (toàn bộ database, không giới hạn lesson).

        Args:
            query_embedding: Vector embedding của câu hỏi
            top_k: Số kết quả trả về (default từ settings)
            threshold: Ngưỡng similarity tối thiểu (default từ settings)

        Returns:
            List dicts: {content, similarity, lesson_id, chunk_index, metadata}
        """
        k = top_k or settings.MAX_CHUNKS_PER_QUERY
        min_sim = threshold or settings.SIMILARITY_THRESHOLD

        # Dùng pgvector cosine distance operator (<=>)
        # cosine_distance = 1 - cosine_similarity
        # → similarity = 1 - distance
        stmt = (
            select(
                DocumentChunk,
                (1 - DocumentChunk.embedding.cosine_distance(query_embedding)).label("similarity"),
            )
            .where(
                (1 - DocumentChunk.embedding.cosine_distance(query_embedding)) >= min_sim
            )
            .order_by(DocumentChunk.embedding.cosine_distance(query_embedding))
            .limit(k)
        )

        result = await self.db.execute(stmt)
        rows = result.all()

        return [
            {
                "id": str(row.DocumentChunk.id),
                "content": row.DocumentChunk.content,
                "similarity": float(row.similarity),
                "lesson_id": row.DocumentChunk.lesson_id,
                "document_id": row.DocumentChunk.document_id,
                "chunk_index": row.DocumentChunk.chunk_index,
                "metadata": row.DocumentChunk.chunk_metadata,
            }
            for row in rows
        ]

    async def similarity_search_by_lesson(
        self,
        query_embedding: List[float],
        lesson_id: int,
        top_k: Optional[int] = None,
        threshold: Optional[float] = None,
    ) -> List[dict]:
        """
        Lesson-bounded search: chỉ tìm trong chunks của bài học cụ thể.
        Đây là mode chính trong RAG pipeline để chống hallucination.

        Args:
            query_embedding: Vector embedding của câu hỏi
            lesson_id: Chỉ tìm trong bài học này
            top_k: Số kết quả tối đa
            threshold: Ngưỡng similarity tối thiểu

        Returns:
            List dicts sorted by similarity (cao → thấp)
        """
        k = top_k or settings.MAX_CHUNKS_PER_QUERY
        min_sim = threshold or settings.SIMILARITY_THRESHOLD

        stmt = (
            select(
                DocumentChunk,
                (1 - DocumentChunk.embedding.cosine_distance(query_embedding)).label("similarity"),
            )
            .where(
                DocumentChunk.lesson_id == lesson_id,
                (1 - DocumentChunk.embedding.cosine_distance(query_embedding)) >= min_sim,
            )
            .order_by(DocumentChunk.embedding.cosine_distance(query_embedding))
            .limit(k)
        )

        result = await self.db.execute(stmt)
        rows = result.all()

        logger.info(
            "Lesson-bounded similarity search",
            lesson_id=lesson_id,
            results_found=len(rows),
            top_k=k,
            threshold=min_sim,
        )

        return [
            {
                "id": str(row.DocumentChunk.id),
                "content": row.DocumentChunk.content,
                "similarity": float(row.similarity),
                "lesson_id": row.DocumentChunk.lesson_id,
                "document_id": row.DocumentChunk.document_id,
                "chunk_index": row.DocumentChunk.chunk_index,
                "metadata": row.DocumentChunk.chunk_metadata,
            }
            for row in rows
        ]

    async def delete_by_lesson(self, lesson_id: int) -> int:
        """
        Xóa toàn bộ chunks của một bài học.
        Dùng khi cập nhật tài liệu của bài học.

        Returns:
            Số chunks đã xóa
        """
        stmt = delete(DocumentChunk).where(DocumentChunk.lesson_id == lesson_id)
        result = await self.db.execute(stmt)
        await self.db.commit()

        count = result.rowcount
        logger.info("Chunks deleted", lesson_id=lesson_id, count=count)
        return count

    async def delete_by_document(self, document_id: str) -> int:
        """Xóa toàn bộ chunks của một tài liệu cụ thể."""
        stmt = delete(DocumentChunk).where(DocumentChunk.document_id == document_id)
        result = await self.db.execute(stmt)
        await self.db.commit()

        count = result.rowcount
        logger.info("Document chunks deleted", document_id=document_id, count=count)
        return count

    async def count_chunks_by_lesson(self, lesson_id: int) -> int:
        """Đếm số chunks của một bài học."""
        from sqlalchemy import func
        stmt = select(func.count()).where(DocumentChunk.lesson_id == lesson_id)
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def create_hnsw_index(self) -> None:
        """
        Tạo HNSW index cho vector search.
        Gọi sau khi đã có đủ dữ liệu (pgvector recommend >= 1000 vectors).

        Dùng text() để SQLAlchemy biên dịch/ tham số hóa đúng cách; truyền chuỗi thô
        vào AsyncSession.execute() sẽ lỗi ở SQLAlchemy 2.0.
        """
        from sqlalchemy import text

        await self.db.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw
                ON document_chunks USING hnsw (embedding vector_cosine_ops)
                WITH (m = 16, ef_construction = 64)
                """
            )
        )
        await self.db.commit()
        logger.info("HNSW index created")
