from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class EducationLevelBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=50)
    description: str | None = None
    order_index: int = Field(0, ge=0)
    is_active: bool = True


class EducationLevelCreate(EducationLevelBase):
    pass


class EducationLevelUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    order_index: int | None = None
    is_active: bool | None = None


class EducationLevelResponse(EducationLevelBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LearningCategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str | None = Field(None, max_length=255)
    description: str | None = None
    icon: str | None = Field(None, max_length=64)
    parent_id: int | None = None
    order_index: int = Field(0, ge=0)
    is_active: bool = True


class LearningCategoryCreate(LearningCategoryBase):
    name: str = Field(..., min_length=1, max_length=255)


class LearningCategoryUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    icon: str | None = None
    parent_id: int | None = None
    order_index: int | None = None
    is_active: bool | None = None


class LearningCategoryResponse(LearningCategoryBase):
    id: int
    slug: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LearningCategoryTreeResponse(LearningCategoryResponse):
    children: list["LearningCategoryTreeResponse"] = []

    model_config = {"from_attributes": True}
