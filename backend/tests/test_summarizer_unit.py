import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.security import create_access_token


@pytest.mark.anyio
async def test_summarize_quota_configured():
    from app.services.ai_quota import FEATURE_LIMITS, FEATURE_LABELS
    assert "summarizer" in FEATURE_LIMITS
    assert "summarizer" in FEATURE_LABELS
    assert FEATURE_LIMITS["summarizer"] > 0
