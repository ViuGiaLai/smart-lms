import asyncio
import json

import pytest

from pipelines.rag_pipeline import RAGPipeline


class StubResponse:
    def __init__(self, text: str):
        self.text = text


class StubModel:
    def __init__(self, text: str = "Câu trả lời từ học liệu.", error: Exception | None = None):
        self.text = text
        self.error = error

    def generate_content(self, prompt: str, stream: bool = False):
        if self.error:
            raise self.error
        if stream:
            return iter([StubResponse(self.text)])
        return StubResponse(self.text)


def run(coro):
    return asyncio.run(coro)


def test_no_retrieved_evidence_does_not_call_model(monkeypatch):
    pipeline = RAGPipeline()
    pipeline.model = StubModel()
    monkeypatch.setattr(
        pipeline,
        "_retrieve_chunks",
        lambda *args, **kwargs: asyncio.sleep(0, result=[]),
    )

    result = run(pipeline.ask("Câu hỏi?", lesson_id=123))

    assert result["chunks_used"] == 0
    assert result["sources"] == []
    assert "Không tìm thấy nội dung liên quan" in result["answer"]


def test_provider_failure_is_not_returned_as_success(monkeypatch):
    pipeline = RAGPipeline()
    pipeline.model = StubModel(error=RuntimeError("provider unavailable"))
    monkeypatch.setattr(
        pipeline,
        "_retrieve_chunks",
        lambda *args, **kwargs: asyncio.sleep(
            0,
            result=[
                {
                    "content": "Bằng chứng",
                    "similarity": 0.8,
                    "chunk_index": 0,
                    "document_id": "lecture.pdf",
                    "metadata": {"filename": "lecture.pdf", "page": 3},
                }
            ],
        ),
    )
    monkeypatch.setattr("pipelines.rag_pipeline.has_valid_groq_key", lambda: False)

    with pytest.raises(RuntimeError):
        run(pipeline.ask("Câu hỏi?", lesson_id=123))


def test_stream_contains_real_source_metadata(monkeypatch):
    pipeline = RAGPipeline()
    pipeline.model = StubModel()
    monkeypatch.setattr(
        pipeline,
        "_retrieve_chunks",
        lambda *args, **kwargs: asyncio.sleep(
            0,
            result=[
                {
                    "content": "Bằng chứng",
                    "similarity": 0.8,
                    "chunk_index": 0,
                    "document_id": "lecture.pdf",
                    "metadata": {"filename": "lecture.pdf", "page": 3},
                }
            ],
        ),
    )

    async def collect():
        return [event async for event in pipeline.ask_stream("Câu hỏi?", lesson_id=123)]

    events = run(collect())
    source_events = [
        json.loads(event[len("data: "):])
        for event in events
        if event.startswith("data: ") and json.loads(event[len("data: "):]).get("type") == "sources"
    ]
    assert source_events[0]["data"][0]["filename"] == "lecture.pdf"
    assert source_events[0]["data"][0]["page"] == 3
    assert any('"type": "done"' in event for event in events)
