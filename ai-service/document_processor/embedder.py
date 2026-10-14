"""
Smart LMS - Embedder
Tạo vector embeddings cho text chunks.
Primary: Google text-embedding-004 (1536 dims)
Fallback: OpenAI text-embedding-3-small (1536 dims) hoặc SentenceTransformers
"""

import asyncio
from typing import List, Optional, Union
import structlog

import numpy as np
import google.generativeai as genai

from core.config import settings

logger = structlog.get_logger(__name__)

# Kích thước vector output của từng model
EMBEDDING_DIMENSIONS = {
    "models/gemini-embedding-001": 768,        # Google Gemini
    "models/gemini-embedding-2": 768,          # Google Gemini 2
    "models/text-embedding-004": 768,          # Google
    "text-embedding-3-small": 1536,            # OpenAI
    "text-embedding-3-large": 3072,            # OpenAI
    "all-MiniLM-L6-v2": 384,                   # SentenceTransformers (local)
    "paraphrase-multilingual-mpnet-base-v2": 768,  # SentenceTransformers đa ngôn ngữ
}


class GeminiEmbedder:
    """
    Tạo embeddings dùng Google text-embedding-004.
    Hỗ trợ task types để tối ưu chất lượng embedding:
    - RETRIEVAL_DOCUMENT: cho documents cần index
    - RETRIEVAL_QUERY: cho câu hỏi tìm kiếm
    - SEMANTIC_SIMILARITY: so sánh độ tương đồng
    - CLASSIFICATION: phân loại
    """

    def __init__(self):
        # Cấu hình Gemini API
        genai.configure(api_key=settings.GOOGLE_API_KEY)
        self.model_name = settings.GEMINI_EMBEDDING_MODEL
        self.dimension = EMBEDDING_DIMENSIONS.get(self.model_name, 768)
        logger.info("GeminiEmbedder initialized", model=self.model_name)

    async def embed_text(
        self,
        text: str,
        task_type: str = "RETRIEVAL_DOCUMENT",
    ) -> List[float]:
        """
        Tạo embedding cho một text.

        Args:
            text: Text cần embed
            task_type: Loại task (ảnh hưởng đến chất lượng embedding)

        Returns:
            List[float] vector embedding
        """
        if not text or not text.strip():
            raise ValueError("Không thể tạo embedding cho văn bản rỗng")

        return await asyncio.get_running_loop().run_in_executor(
            None, self._embed_sync, text, task_type
        )

    async def embed_texts(
        self,
        texts: List[str],
        task_type: str = "RETRIEVAL_DOCUMENT",
        batch_size: int = 100,
    ) -> List[List[float]]:
        """
        Tạo embeddings cho nhiều texts theo batch.
        Gemini API hỗ trợ batch embedding hiệu quả.

        Args:
            texts: List texts cần embed
            task_type: Loại task
            batch_size: Số texts trong mỗi batch (Gemini giới hạn 100)

        Returns:
            List of embedding vectors
        """
        all_embeddings = []

        # Chia thành batches
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            logger.info(
                "Embedding batch",
                batch_num=i // batch_size + 1,
                batch_size=len(batch),
                total=len(texts),
            )

            batch_embeddings = await asyncio.get_running_loop().run_in_executor(
                None, self._embed_batch_sync, batch, task_type
            )
            all_embeddings.extend(batch_embeddings)

        return all_embeddings

    async def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Tạo embeddings cho danh sách documents/chunks."""
        return await self.embed_texts(texts, task_type="RETRIEVAL_DOCUMENT")

    async def embed_query(self, query: str) -> List[float]:
        """
        Tạo embedding cho câu hỏi tìm kiếm.
        Dùng RETRIEVAL_QUERY task type để tối ưu cho search.
        """
        return await self.embed_text(query, task_type="RETRIEVAL_QUERY")

    def _ensure_api_key(self) -> None:
        """Chặn sớm khi GOOGLE_API_KEY chưa được cấu hình thật."""
        key = (settings.GOOGLE_API_KEY or "").strip()
        if not key or "your_google_api_key" in key.lower() or key == "demo_google_api_key":
            raise RuntimeError(
                "GOOGLE_API_KEY chưa được cấu hình hợp lệ cho AI Service nên không thể tạo embedding thật từ Gemini. "
                "Smart LMS không sinh embedding giả (vector băm) vì sẽ làm sai lệch kết quả tìm kiếm ngữ nghĩa."
            )

    def _embed_sync(self, text: str, task_type: str) -> List[float]:
        """Đồng bộ: gọi Gemini Embedding API. Lỗi thì báo lỗi rõ ràng (không sinh vector giả)."""
        self._ensure_api_key()
        try:
            kwargs = {
                "model": self.model_name,
                "content": text,
                "task_type": task_type,
            }
            if "gemini-embedding" in self.model_name:
                kwargs["output_dimensionality"] = self.dimension
            result = genai.embed_content(**kwargs)
            return result["embedding"]
        except Exception as e:
            logger.error("Gemini embedding API failed", error=str(e))
            raise RuntimeError(f"Gemini embedding API lỗi: {e}") from e

    def _embed_batch_sync(self, texts: List[str], task_type: str) -> List[List[float]]:
        """Đồng bộ: batch embedding qua Gemini API. Lỗi thì báo lỗi rõ ràng."""
        self._ensure_api_key()
        try:
            kwargs = {
                "model": self.model_name,
                "content": texts,
                "task_type": task_type,
            }
            if "gemini-embedding" in self.model_name:
                kwargs["output_dimensionality"] = self.dimension
            result = genai.embed_content(**kwargs)
            embeddings = result["embedding"]
            if isinstance(embeddings[0], float):
                return [embeddings]
            return embeddings
        except Exception as e:
            logger.error("Gemini batch embedding API failed", error=str(e), num_texts=len(texts))
            raise RuntimeError(f"Gemini batch embedding API lỗi: {e}") from e


class OpenAIEmbedder:
    """
    Fallback embedder dùng OpenAI text-embedding-3-small.
    """

    def __init__(self):
        from openai import AsyncOpenAI
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.model_name = settings.OPENAI_EMBEDDING_MODEL
        self.dimension = EMBEDDING_DIMENSIONS.get(self.model_name, 1536)
        logger.info("OpenAIEmbedder initialized", model=self.model_name)

    async def embed_text(self, text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> List[float]:
        if not text or not text.strip():
            return [0.0] * self.dimension

        response = await self.client.embeddings.create(
            model=self.model_name,
            input=text,
        )
        return response.data[0].embedding

    async def embed_texts(
        self, texts: List[str], task_type: str = "RETRIEVAL_DOCUMENT", batch_size: int = 100
    ) -> List[List[float]]:
        all_embeddings = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            response = await self.client.embeddings.create(
                model=self.model_name,
                input=batch,
            )
            batch_embeddings = [item.embedding for item in sorted(response.data, key=lambda x: x.index)]
            all_embeddings.extend(batch_embeddings)
        return all_embeddings

    async def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return await self.embed_texts(texts)

    async def embed_query(self, query: str) -> List[float]:
        return await self.embed_text(query)


class SentenceTransformerEmbedder:
    """
    Local embedder dùng SentenceTransformers (không cần API key).
    Tốt cho: đa ngôn ngữ, không có internet, chi phí thấp.
    """

    def __init__(self, model_name: str = "paraphrase-multilingual-mpnet-base-v2"):
        from sentence_transformers import SentenceTransformer
        self.model_name = model_name
        self._model = SentenceTransformer(model_name)
        self.dimension = self._model.get_sentence_embedding_dimension()
        logger.info("SentenceTransformerEmbedder initialized", model=model_name)

    async def embed_text(self, text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> List[float]:
        if not text or not text.strip():
            return [0.0] * self.dimension

        embedding = await asyncio.get_running_loop().run_in_executor(
            None, lambda: self._model.encode(text).tolist()
        )
        return embedding

    async def embed_texts(
        self, texts: List[str], task_type: str = "RETRIEVAL_DOCUMENT", batch_size: int = 32
    ) -> List[List[float]]:
        embeddings = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: self._model.encode(texts, batch_size=batch_size, show_progress_bar=True).tolist(),
        )
        return embeddings

    async def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return await self.embed_texts(texts)

    async def embed_query(self, query: str) -> List[float]:
        return await self.embed_text(query)


# ===== Factory =====
def get_embedder(provider: Optional[str] = None):
    """
    Factory: trả về embedder phù hợp dựa trên cấu hình.

    Args:
        provider: Override provider ("gemini" | "openai" | "local")
                  None = dùng EMBEDDING_PROVIDER từ settings

    Returns:
        Embedder instance (GeminiEmbedder, OpenAIEmbedder, hoặc SentenceTransformerEmbedder)
    """
    p = provider or settings.EMBEDDING_PROVIDER

    if p == "gemini":
        return GeminiEmbedder()
    elif p == "openai":
        return OpenAIEmbedder()
    elif p in ("local", "sentence-transformers"):
        return SentenceTransformerEmbedder()
    else:
        logger.warning(f"Unknown embedding provider '{p}', falling back to Gemini")
        return GeminiEmbedder()


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Tính cosine similarity giữa 2 vectors."""
    a = np.array(vec1)
    b = np.array(vec2)
    dot = np.dot(a, b)
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    if norm == 0:
        return 0.0
    return float(dot / norm)
