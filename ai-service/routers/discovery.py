from typing import Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from pipelines.discovery_pipeline import DiscoveryPipeline

router = APIRouter(prefix="/discovery", tags=["AI Discovery"])
pipeline = DiscoveryPipeline()


class DiscoverySearchRequest(BaseModel):
    topic: str = Field(..., min_length=2, max_length=512)
    target_level: Optional[str] = None
    domain_category: Optional[str] = None
    target_audience: Optional[str] = None


@router.post("/search", summary="AI Discovery tìm kiếm và đề xuất học liệu & cấu trúc khóa học")
async def search_curriculum(req: DiscoverySearchRequest):
    try:
        return await pipeline.discover(
            topic=req.topic,
            target_level=req.target_level,
            domain_category=req.domain_category,
            target_audience=req.target_audience,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Discovery không thể xử lý yêu cầu: {str(e)}")
