from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field

DiscoveryStatusLiteral = Literal["pending", "approved", "rejected", "converted"]


class DiscoveryJobCreate(BaseModel):
    topic: str = Field(..., min_length=2, max_length=512, description="Chủ đề môn học đại học cần khám phá (VD: 'Toán cao cấp & Giải tích', 'Lập trình Fullstack Next.js/FastAPI', 'Tiếng Anh chuyên ngành CNTT')")
    target_level: str | None = Field(None, max_length=100, description="Bậc đào tạo mục tiêu (Đại cương, Cơ sở ngành, Chuyên ngành, Đồ án tốt nghiệp, Chuẩn đầu ra...)")
    domain_category: str | None = Field(None, max_length=100, description="Khoa / Ngành (Khoa CNTT, Khoa Ngoại ngữ, Khoa Kinh tế, Khoa Kỹ thuật...)")
    target_audience: str | None = Field(None, max_length=255, description="Đối tượng (Sinh viên năm 1-2, Sinh viên năm 3-4, Sinh viên làm đồ án...)")


class DiscoveryItemResponse(BaseModel):
    id: int
    job_id: int
    item_type: str
    title: str
    description: str | None = None
    source_url: str | None = None
    provider_name: str | None = None
    metadata_info: dict[str, Any] | None = None
    order_index: int
    status: DiscoveryStatusLiteral
    created_at: datetime

    model_config = {"from_attributes": True}


class DiscoveryJobResponse(BaseModel):
    id: int
    user_id: int
    topic: str
    target_level: str | None = None
    domain_category: str | None = None
    status: DiscoveryStatusLiteral
    summary: str | None = None
    proposed_blueprint: dict[str, Any] | None = None
    items: list[DiscoveryItemResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConvertDiscoveryToCourseRequest(BaseModel):
    title: str | None = None
    price: float | None = 0.0
    auto_publish: bool = False
