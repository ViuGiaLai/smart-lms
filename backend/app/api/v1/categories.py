from __future__ import annotations

import re
import unicodedata
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, delete
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_active_user, require_admin
from app.models.user import User
from app.models.category import LearningCategory
from app.models.education_level import EducationLevel
from app.schemas.category import (
    LearningCategoryCreate,
    LearningCategoryUpdate,
    LearningCategoryResponse,
    LearningCategoryTreeResponse,
    EducationLevelCreate,
    EducationLevelUpdate,
    EducationLevelResponse,
)

router = APIRouter(tags=["Categories & Levels"])


def _slugify(text: str) -> str:
    slug = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^\w\s-]", "", slug).strip().lower()
    return re.sub(r"[-\s]+", "-", slug)


# ══════════════════════════════════════════════════════════════════════════
# Learning Categories (Public Read, Admin Write)
# ══════════════════════════════════════════════════════════════════════════

@router.get("/categories", response_model=dict[str, Any])
async def list_categories(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Lấy danh sách cây danh mục lĩnh vực và môn học."""
    stmt = (
        select(LearningCategory)
        .options(selectinload(LearningCategory.children))
        .order_by(LearningCategory.order_index, LearningCategory.id)
    )
    if not include_inactive:
        stmt = stmt.where(LearningCategory.is_active == True)  # noqa: E712

    result = await db.execute(stmt)
    all_categories = result.scalars().all()

    # Nhóm thành cây: Lĩnh vực gốc (parent_id is None) chứa các môn học con
    root_categories = [cat for cat in all_categories if cat.parent_id is None]
    
    # Flatten list for simple select dropdowns
    flat_list = [
        {
            "id": cat.id,
            "name": cat.name,
            "slug": cat.slug,
            "description": cat.description,
            "icon": cat.icon,
            "parentId": cat.parent_id,
            "orderIndex": cat.order_index,
            "isActive": cat.is_active,
        }
        for cat in all_categories
    ]

    tree_list = []
    for cat in root_categories:
        children = [
            {
                "id": ch.id,
                "name": ch.name,
                "slug": ch.slug,
                "description": ch.description,
                "icon": ch.icon,
                "parentId": ch.parent_id,
                "orderIndex": ch.order_index,
                "isActive": ch.is_active,
            }
            for ch in cat.children
            if include_inactive or ch.is_active
        ]
        tree_list.append({
            "id": cat.id,
            "name": cat.name,
            "slug": cat.slug,
            "description": cat.description,
            "icon": cat.icon,
            "parentId": None,
            "orderIndex": cat.order_index,
            "isActive": cat.is_active,
            "children": children,
        })

    return {
        "success": True,
        "data": {
            "tree": tree_list,
            "flat": flat_list,
        },
    }


@router.post("/admin/categories", response_model=dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: LearningCategoryCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Admin tạo lĩnh vực hoặc môn học mới mà không cần sửa code."""
    # Slug phải duy nhất: tự thêm hậu tố -2, -3... thay vì để DB ném lỗi trùng khoá.
    base_slug = (payload.slug or _slugify(payload.name) or "danh-muc").strip()
    slug = base_slug
    suffix = 2
    while True:
        existing = await db.execute(select(LearningCategory.id).where(LearningCategory.slug == slug))
        if existing.scalar_one_or_none() is None:
            break
        slug = f"{base_slug}-{suffix}"
        suffix += 1

    if payload.parent_id is not None:
        parent = await db.execute(select(LearningCategory.id).where(LearningCategory.id == payload.parent_id))
        if parent.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail="Danh mục cha không tồn tại.")

    category = LearningCategory(
        name=payload.name,
        slug=slug,
        description=payload.description,
        icon=payload.icon or "Folder",
        parent_id=payload.parent_id,
        order_index=payload.order_index,
        is_active=payload.is_active,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return {
        "success": True,
        "message": f"Đã tạo danh mục '{category.name}' thành công.",
        "data": {
            "id": category.id,
            "name": category.name,
            "slug": category.slug,
            "parentId": category.parent_id,
        },
    }


@router.put("/admin/categories/{category_id}", response_model=dict[str, Any])
async def update_category(
    category_id: int,
    payload: LearningCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Admin cập nhật thông tin, icon, trạng thái ẩn/hiện hoặc thứ tự danh mục."""
    res = await db.execute(select(LearningCategory).where(LearningCategory.id == category_id))
    cat = res.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Danh mục không tồn tại")

    if payload.slug is not None and payload.slug != cat.slug:
        dup = await db.execute(select(LearningCategory.id).where(LearningCategory.slug == payload.slug))
        if dup.scalar_one_or_none() is not None:
            raise HTTPException(status_code=400, detail=f"Slug '{payload.slug}' đã được dùng bởi danh mục khác.")
    if payload.parent_id is not None:
        if payload.parent_id == category_id:
            raise HTTPException(status_code=400, detail="Danh mục không thể là cha của chính nó.")
        parent = await db.execute(select(LearningCategory.id).where(LearningCategory.id == payload.parent_id))
        if parent.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail="Danh mục cha không tồn tại.")

    if payload.name is not None:
        cat.name = payload.name
    if payload.slug is not None:
        cat.slug = payload.slug
    if payload.description is not None:
        cat.description = payload.description
    if payload.icon is not None:
        cat.icon = payload.icon
    if payload.parent_id is not None:
        cat.parent_id = payload.parent_id
    if payload.order_index is not None:
        cat.order_index = payload.order_index
    if payload.is_active is not None:
        cat.is_active = payload.is_active

    await db.commit()
    await db.refresh(cat)
    return {
        "success": True,
        "message": "Cập nhật danh mục thành công.",
        "data": {
            "id": cat.id,
            "name": cat.name,
            "slug": cat.slug,
            "isActive": cat.is_active,
        },
    }


@router.delete("/admin/categories/{category_id}", response_model=dict[str, Any])
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Admin xóa danh mục."""
    res = await db.execute(select(LearningCategory).where(LearningCategory.id == category_id))
    cat = res.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Danh mục không tồn tại")

    await db.delete(cat)
    await db.commit()
    return {"success": True, "message": f"Đã xóa danh mục '{cat.name}'."}


# ══════════════════════════════════════════════════════════════════════════
# Education Levels (Public Read, Admin Write)
# ══════════════════════════════════════════════════════════════════════════

@router.get("/education-levels", response_model=dict[str, Any])
async def list_education_levels(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Lấy danh sách các cấp học / trình độ đào tạo độc lập."""
    stmt = select(EducationLevel).order_by(EducationLevel.order_index, EducationLevel.id)
    if not include_inactive:
        stmt = stmt.where(EducationLevel.is_active == True)  # noqa: E712

    result = await db.execute(stmt)
    levels = result.scalars().all()

    return {
        "success": True,
        "data": [
            {
                "id": lvl.id,
                "name": lvl.name,
                "code": lvl.code,
                "description": lvl.description,
                "orderIndex": lvl.order_index,
                "isActive": lvl.is_active,
            }
            for lvl in levels
        ],
    }


@router.post("/admin/education-levels", response_model=dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_education_level(
    payload: EducationLevelCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Admin tạo cấp học / trình độ mới."""
    # Chuẩn hoá TRƯỚC khi kiểm tra trùng, nếu không "general" và "GENERAL"
    # sẽ lọt qua kiểm tra rồi vỡ ở ràng buộc UNIQUE của DB (HTTP 500).
    code = payload.code.upper().strip()
    existing = await db.execute(select(EducationLevel).where(EducationLevel.code == code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Mã cấp học '{code}' đã tồn tại.")

    level = EducationLevel(
        name=payload.name,
        code=code,
        description=payload.description,
        order_index=payload.order_index,
        is_active=payload.is_active,
    )
    db.add(level)
    await db.commit()
    await db.refresh(level)
    return {
        "success": True,
        "message": f"Đã tạo cấp học '{level.name}' thành công.",
        "data": {
            "id": level.id,
            "name": level.name,
            "code": level.code,
        },
    }


@router.put("/admin/education-levels/{level_id}", response_model=dict[str, Any])
async def update_education_level(
    level_id: int,
    payload: EducationLevelUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Admin cập nhật cấp học."""
    res = await db.execute(select(EducationLevel).where(EducationLevel.id == level_id))
    lvl = res.scalar_one_or_none()
    if not lvl:
        raise HTTPException(status_code=404, detail="Cấp học không tồn tại")

    if payload.name is not None:
        lvl.name = payload.name
    if payload.code is not None:
        new_code = payload.code.upper().strip()
        if new_code != lvl.code:
            dup = await db.execute(select(EducationLevel.id).where(EducationLevel.code == new_code))
            if dup.scalar_one_or_none() is not None:
                raise HTTPException(status_code=400, detail=f"Mã cấp học '{new_code}' đã tồn tại.")
        lvl.code = new_code
    if payload.description is not None:
        lvl.description = payload.description
    if payload.order_index is not None:
        lvl.order_index = payload.order_index
    if payload.is_active is not None:
        lvl.is_active = payload.is_active

    await db.commit()
    await db.refresh(lvl)
    return {
        "success": True,
        "message": "Cập nhật cấp học thành công.",
        "data": {"id": lvl.id, "name": lvl.name, "code": lvl.code},
    }
