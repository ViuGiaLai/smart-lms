"""
Smart LMS - Kiểm thử tính trung thực dữ liệu của AI Tutor (RAG Grounding Test)

Mục đích: bảo đảm pipeline RAG KHÔNG bao giờ bịa câu trả lời, không bịa trích dẫn
và không trả về độ tương đồng giả khi học liệu không có nội dung liên quan.

Gồm 2 phần:
  1. Offline (không cần mạng/quota Gemini): dùng LLM giả (stub) để kiểm tra luồng
     trả lời thật + nguồn trích dẫn thật, và luồng lỗi phải báo lỗi thay vì bịa.
  2. Online (gọi AI Service đang chạy): kiểm tra các bất biến trung thực, kể cả khi
     Gemini hết quota thì câu trả lời phải là lỗi rõ ràng, không phải nội dung giả.

Cách chạy (cần AI Service đang chạy ở http://localhost:8001 cho phần 2):
    cd ai-service
    ./venv/Scripts/python.exe test_rag_grounding.py
"""

import asyncio
import json
import os
import sys
from typing import List

import httpx

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8001")

# Dấu hiệu của nội dung bịa (từng tồn tại trong bản cũ): trích dẫn học liệu giả
FAKE_CITATION_MARKERS = [
    "Trích dẫn học liệu: [Slide",
    "Giáo trình và bài giảng tích hợp Bài học",
    "Học liệu chuẩn Bài giảng",
    "Smart LMS Knowledge Base",
]

RELEVANT_QUESTION = "PostgreSQL hỗ trợ tìm kiếm vector nhanh bằng loại chỉ mục nào?"
RELEVANT_LESSON = 4

# Bài học chưa được số hóa tài liệu → không có chunk nào trong pgvector
NO_KNOWLEDGE_QUESTION = "Nội dung bài học này nói về vấn đề gì?"
NO_KNOWLEDGE_LESSON = 999

# Câu hỏi ngoài phạm vi bài giảng (bài học vẫn có học liệu)
OFF_TOPIC_QUESTION = "Công thức nấu phở bò ngon nhất gồm những nguyên liệu gì?"
OFF_TOPIC_LESSON = 1

passed = 0
failed = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global passed, failed
    if condition:
        passed += 1
        print(f"[PASS] {name}" + (f" — {detail}" if detail else ""))
    else:
        failed += 1
        print(f"[FAIL] {name}" + (f" — {detail}" if detail else ""))


def has_fake_marker(text: str) -> bool:
    return any(marker in (text or "") for marker in FAKE_CITATION_MARKERS)


def real_similarities(sources: List[dict]) -> List[float]:
    return [round(float(s.get("similarity", 0)), 3) for s in (sources or [])]


def no_fake_similarity(sources: List[dict]) -> bool:
    # 0.94 / 0.95 chính là hai con số bịa cứng của bản cũ
    return all(s not in (0.94, 0.95) for s in real_similarities(sources))


# ===== Phần 1: Offline (LLM giả, không phụ thuộc quota Gemini) =====

class _StubResponse:
    def __init__(self, text: str):
        self.text = text


class _StubModel:
    """LLM giả: trả về text cố định, hoặc ném lỗi để kiểm tra nhánh xử lý lỗi."""

    def __init__(self, text: str | None = "Câu trả lời thử nghiệm từ LLM.", error: Exception | None = None):
        self.text = text
        self.error = error
        self.last_prompt = ""

    def generate_content(self, prompt: str, stream: bool = False):
        self.last_prompt = prompt
        if self.error:
            raise self.error
        if stream:
            return iter([_StubResponse(self.text or "")])
        return _StubResponse(self.text or "")


async def test_offline_success_path() -> None:
    from pipelines.rag_pipeline import RAGPipeline

    pipeline = RAGPipeline()
    stub = _StubModel("Câu trả lời thử nghiệm từ LLM.")
    pipeline.model = stub

    result = await pipeline.ask(question=RELEVANT_QUESTION, lesson_id=RELEVANT_LESSON)

    check("ask() trả về đúng nội dung do LLM sinh", result["answer"] == "Câu trả lời thử nghiệm từ LLM.")
    check("ask() dùng tri thức thật từ pgvector", result["chunks_used"] > 0, f"chunks_used={result['chunks_used']}")
    check("ask() kèm nguồn trích dẫn thật", len(result["sources"]) > 0, f"{len(result['sources'])} nguồn")
    check("similarity nguồn là số thật, không phải 0.94/0.95", no_fake_similarity(result["sources"]))
    check(
        "prompt gửi LLM có ngữ cảnh trích từ học liệu (HNSW)",
        "hnsw" in stub.last_prompt.lower(),
        f"prompt dài {len(stub.last_prompt)} ký tự",
    )

    # Nhánh stream: nội dung stream phải ghép lại đúng bằng text của LLM
    events = [event async for event in pipeline.ask_stream(question=RELEVANT_QUESTION, lesson_id=RELEVANT_LESSON)]
    streamed = "".join(
        json.loads(e[len("data: "):]).get("content", "")
        for e in events
        if e.startswith("data: ") and '"type": "chunk"' in e
    ).strip()
    check("ask_stream() stream đúng nội dung LLM sinh", streamed == "Câu trả lời thử nghiệm từ LLM.", streamed[:80])
    check("ask_stream() kết thúc bằng event done", any('"type": "done"' in e for e in events))
    check("ask_stream() không chứa trích dẫn giả", not has_fake_marker(streamed))


async def test_offline_gemini_failure() -> None:
    """Gemini lỗi (ví dụ 429 hết quota): phải báo lỗi rõ ràng, tuyệt đối không bịa câu trả lời."""
    from pipelines.rag_pipeline import RAGPipeline

    pipeline = RAGPipeline()
    pipeline.model = _StubModel(error=RuntimeError("429 You exceeded your current quota"))

    try:
        await pipeline.ask(question=RELEVANT_QUESTION, lesson_id=RELEVANT_LESSON)
        check("ask() không bịa câu trả lời khi Gemini lỗi", False, "không ném lỗi")
    except RuntimeError as e:
        msg = str(e)
        check(
            "ask() báo lỗi rõ ràng khi Gemini lỗi",
            ("429" in msg or "quota" in msg.lower() or "Gemini" in msg) and len(msg) < 500,
            msg[:80],
        )

    events = [event async for event in pipeline.ask_stream(question=RELEVANT_QUESTION, lesson_id=RELEVANT_LESSON)]
    check("ask_stream() phát event error khi Gemini lỗi", any('"type": "error"' in e for e in events))
    check("ask_stream() không stream nội dung bịa khi Gemini lỗi", not any('"type": "chunk"' in e for e in events))

    # LLM trả nội dung rỗng cũng phải coi là lỗi, không được trả câu trả lời rỗng/bịa
    pipeline.model = _StubModel(text="")
    try:
        await pipeline.ask(question=RELEVANT_QUESTION, lesson_id=RELEVANT_LESSON)
        check("ask() báo lỗi khi LLM trả nội dung rỗng", False, "không ném lỗi")
    except RuntimeError as e:
        check("ask() báo lỗi khi LLM trả nội dung rỗng", "rỗng" in str(e), str(e)[:80])


async def test_offline_no_knowledge() -> None:
    """Bài học không có chunk nào: phải nói thật là không có tri thức, không gọi LLM."""
    from pipelines.rag_pipeline import RAGPipeline

    pipeline = RAGPipeline()
    stub = _StubModel()
    pipeline.model = stub

    result = await pipeline.ask(question=NO_KNOWLEDGE_QUESTION, lesson_id=NO_KNOWLEDGE_LESSON)
    check("không dùng tri thức nào khi học liệu rỗng", result["chunks_used"] == 0)
    check("không bịa nguồn trích dẫn khi học liệu rỗng", result["sources"] == [])
    check("thông báo minh bạch khi học liệu rỗng", "Không tìm thấy nội dung liên quan" in result["answer"])
    check("không gọi LLM khi không có tri thức", stub.last_prompt == "")

    events = [event async for event in pipeline.ask_stream(question=NO_KNOWLEDGE_QUESTION, lesson_id=NO_KNOWLEDGE_LESSON)]
    streamed = "".join(
        json.loads(e[len("data: "):]).get("content", "")
        for e in events
        if e.startswith("data: ") and '"type": "chunk"' in e
    )
    check("stream báo minh bạch khi học liệu rỗng", "Không tìm thấy nội dung liên quan" in streamed)
    check("stream không bịa nguồn khi học liệu rỗng", any('"type": "sources", "data": []' in e for e in events))


# ===== Phần 2: Online (gọi AI Service thật) =====

async def test_online_ask_relevant(client: httpx.AsyncClient) -> None:
    """Câu hỏi có tri thức: hoặc trả lời thật + nguồn thật, hoặc báo lỗi rõ ràng — không bao giờ bịa."""
    res = await client.post("/api/v1/rag/ask", json={"question": RELEVANT_QUESTION, "lesson_id": RELEVANT_LESSON})
    check("/ask câu hỏi liên quan không lỗi 5xx ngoài dự kiến", res.status_code in (200, 500), f"status={res.status_code}")

    if res.status_code == 500:
        detail = res.json().get("detail", "")
        check(
            "khi LLM lỗi, /ask trả thông báo lỗi thật (không có câu trả lời ngụy tạo)",
            "Lỗi truy vấn AI Tutor" in detail and not has_fake_marker(detail),
            detail[:90],
        )
        return

    body = res.json()
    check("có sử dụng tri thức thật (chunks_used > 0)", body.get("chunks_used", 0) > 0, f"chunks_used={body.get('chunks_used')}")
    check("câu trả lời không rỗng", bool((body.get("answer") or "").strip()))
    check("câu trả lời không chứa trích dẫn giả", not has_fake_marker(body.get("answer", "")))
    check("có nguồn trích dẫn thật từ pgvector", len(body.get("sources") or []) > 0)
    check("độ tương đồng nguồn không phải số bịa (0.94/0.95)", no_fake_similarity(body.get("sources")), f"{real_similarities(body.get('sources'))}")


async def test_online_ask_no_knowledge(client: httpx.AsyncClient) -> None:
    res = await client.post("/api/v1/rag/ask", json={"question": NO_KNOWLEDGE_QUESTION, "lesson_id": NO_KNOWLEDGE_LESSON})
    check("/ask khi bài học chưa có học liệu trả về HTTP 200", res.status_code == 200, f"status={res.status_code}")
    body = res.json()
    check("không dùng tri thức nào khi học liệu rỗng", body.get("chunks_used") == 0, f"chunks_used={body.get('chunks_used')}")
    check("không bịa nguồn trích dẫn", body.get("sources") == [], f"sources={body.get('sources')}")
    check(
        "thông báo minh bạch là không tìm thấy nội dung liên quan",
        "Không tìm thấy nội dung liên quan trong học liệu" in (body.get("answer") or ""),
        (body.get("answer") or "")[:80],
    )
    check("không còn nội dung ngụy tạo", not has_fake_marker(body.get("answer", "")))


async def test_online_ask_off_topic(client: httpx.AsyncClient) -> None:
    res = await client.post("/api/v1/rag/ask", json={"question": OFF_TOPIC_QUESTION, "lesson_id": OFF_TOPIC_LESSON})
    check("/ask câu hỏi ngoài phạm vi không lỗi bất thường", res.status_code in (200, 500), f"status={res.status_code}")
    detail = res.json().get("detail", "") if res.status_code == 500 else res.json().get("answer", "")
    check("câu trả lời ngoài phạm vi không chứa trích dẫn giả", not has_fake_marker(detail or ""))


async def collect_sse(client: httpx.AsyncClient, question: str, lesson_id: int) -> List[dict]:
    events: List[dict] = []
    async with client.stream(
        "POST",
        "/api/v1/rag/ask/stream",
        json={"question": question, "lesson_id": lesson_id},
        timeout=180.0,
    ) as response:
        check(f"/ask/stream HTTP 200 ({question[:22]}...)", response.status_code == 200, f"status={response.status_code}")
        async for line in response.aiter_lines():
            if line.startswith("data: "):
                try:
                    events.append(json.loads(line[6:]))
                except json.JSONDecodeError:
                    pass
    return events


def sse_text(events: List[dict]) -> str:
    return "".join(e.get("content", "") for e in events if e.get("type") == "chunk")


async def test_online_stream_relevant(client: httpx.AsyncClient) -> None:
    events = await collect_sse(client, RELEVANT_QUESTION, RELEVANT_LESSON)
    text = sse_text(events)
    errors = [e for e in events if e.get("type") == "error"]

    check("stream kết thúc bằng event done", any(e.get("type") == "done" for e in events))
    check("stream không chứa trích dẫn giả", not has_fake_marker(text))
    check(
        "stream có nội dung trả lời hoặc báo lỗi rõ ràng (không im lặng, không bịa)",
        bool(text.strip()) or bool(errors),
        f"text={len(text)} ký tự, errors={len(errors)}",
    )
    sources_events = [e for e in events if e.get("type") == "sources" and e.get("data")]
    if sources_events:
        sims = real_similarities(sources_events[-1]["data"])
        check("stream similarity là số thật, không phải 0.94/0.95", all(s not in (0.94, 0.95) for s in sims), f"{sims}")


async def test_online_stream_no_knowledge(client: httpx.AsyncClient) -> None:
    events = await collect_sse(client, NO_KNOWLEDGE_QUESTION, NO_KNOWLEDGE_LESSON)
    sources_events = [e for e in events if e.get("type") == "sources"]
    check("stream không bịa nguồn trích dẫn", bool(sources_events) and sources_events[-1].get("data") == [])
    text = sse_text(events)
    check(
        "stream trả thông báo minh bạch thay vì nội dung ngụy tạo",
        "Không tìm thấy nội dung liên quan trong học liệu" in text,
        text[:80],
    )
    check("stream không chứa trích dẫn giả", not has_fake_marker(text))


async def test_online_stream_off_topic(client: httpx.AsyncClient) -> None:
    events = await collect_sse(client, OFF_TOPIC_QUESTION, OFF_TOPIC_LESSON)
    text = sse_text(events)
    check("stream ngoài phạm vi không chứa trích dẫn giả", not has_fake_marker(text))


# ===== Phần 3: Thiếu API key =====

async def test_missing_api_key() -> None:
    """Thiếu GOOGLE_API_KEY: phải báo lỗi rõ ràng, không sinh câu trả lời/vector giả."""
    from core.config import settings
    from document_processor.embedder import GeminiEmbedder
    from pipelines.rag_pipeline import RAGPipeline, has_valid_google_key

    original_key = settings.GOOGLE_API_KEY
    try:
        settings.GOOGLE_API_KEY = "demo_google_api_key"
        check("has_valid_google_key() phát hiện key mẫu", has_valid_google_key() is False)

        embedder = GeminiEmbedder()
        try:
            await embedder.embed_text("kiểm thử embedding")
            check("embedder chặn key mẫu (không sinh vector băm giả)", False, "không ném lỗi")
        except RuntimeError as e:
            check("embedder báo lỗi rõ ràng khi thiếu key", "GOOGLE_API_KEY" in str(e), str(e)[:70])

        pipeline = RAGPipeline()
        try:
            await pipeline.ask(question=RELEVANT_QUESTION, lesson_id=RELEVANT_LESSON)
            check("ask() không trả lời giả khi thiếu key", False, "không ném lỗi")
        except RuntimeError as e:
            check("ask() báo lỗi rõ ràng khi thiếu key", "GOOGLE_API_KEY" in str(e), str(e)[:70])

        events = [event async for event in pipeline.ask_stream(question=RELEVANT_QUESTION, lesson_id=RELEVANT_LESSON)]
        check("stream phát event error khi thiếu key", any('"type": "error"' in e for e in events), f"{len(events)} event")
        check("stream không phát nội dung giả khi thiếu key", not any('"type": "chunk"' in e for e in events))
    finally:
        settings.GOOGLE_API_KEY = original_key


async def main() -> int:
    print("=" * 70)
    print("KIỂM THỬ TÍNH TRUNG THỰC DỮ LIỆU CỦA AI TUTOR (RAG GROUNDING)")
    print(f"AI Service: {AI_SERVICE_URL}")
    print("=" * 70)

    print("-- Phần 1: Offline (LLM giả, không phụ thuộc quota) --")
    await test_offline_success_path()
    await test_offline_gemini_failure()
    await test_offline_no_knowledge()

    print("-- Phần 2: Online (AI Service thật) --")
    async with httpx.AsyncClient(base_url=AI_SERVICE_URL, timeout=180.0) as client:
        await test_online_ask_relevant(client)
        await test_online_ask_no_knowledge(client)
        await test_online_ask_off_topic(client)
        await test_online_stream_relevant(client)
        await test_online_stream_no_knowledge(client)
        await test_online_stream_off_topic(client)

    print("-- Phần 3: Cấu hình thiếu API key --")
    await test_missing_api_key()

    print("-" * 70)
    print(f"KẾT QUẢ: {passed} PASS / {failed} FAIL")
    print("=" * 70)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
