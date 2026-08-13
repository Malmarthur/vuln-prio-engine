import logging
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.asset import (
    AssetDetail,
    AssetScoringProfile,
    AssetScoringRunResponse,
    AssetStats,
    CycloneDXImportResponse,
    PaginatedAssets,
)
from app.services.asset_service import (
    compute_asset_scores,
    get_asset,
    get_asset_scoring_profile,
    get_asset_stats,
    import_cyclonedx_asset,
    list_assets,
    save_asset_scoring_profile,
)
from app.services.profile_service import reset_active_stage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assets", tags=["assets"])


@router.post("/import/cyclonedx", response_model=CycloneDXImportResponse)
async def import_cyclonedx(payload: dict, db: AsyncSession = Depends(get_db)):
    try:
        asset, component_count = await import_cyclonedx_asset(db, payload)
        asset = await get_asset(db, asset.id)
        return CycloneDXImportResponse(asset=asset, component_count=component_count)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to import CycloneDX asset")
        raise HTTPException(status_code=500, detail="Failed to import CycloneDX asset") from exc


@router.get("", response_model=PaginatedAssets)
async def assets(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None, max_length=200),
    internet_exposure: Optional[Literal["internet", "internal", "isolated", "unknown"]] = None,
    business_criticality: Optional[Literal["critical", "high", "medium", "low", "unknown"]] = None,
    patch_complexity: Optional[Literal["high", "medium", "low", "unknown"]] = None,
    priority_level: Optional[Literal["A0", "A1", "A2", "A3"]] = None,
    preset_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        items, total = await list_assets(
            db,
            page=page,
            per_page=per_page,
            search=search,
            internet_exposure=internet_exposure,
            business_criticality=business_criticality,
            patch_complexity=patch_complexity,
            priority_level=priority_level,
            preset_id=preset_id,
        )
        return PaginatedAssets(total=total, page=page, per_page=per_page, items=items)
    except Exception as exc:
        logger.exception("Failed to query assets")
        raise HTTPException(status_code=500, detail="Failed to retrieve assets") from exc


@router.get("/stats", response_model=AssetStats)
async def asset_stats(preset_id: Optional[UUID] = None, db: AsyncSession = Depends(get_db)):
    try:
        return await get_asset_stats(db, preset_id)
    except Exception as exc:
        logger.exception("Failed to retrieve asset stats")
        raise HTTPException(status_code=500, detail="Failed to retrieve asset stats") from exc


@router.post("/scoring/run", response_model=AssetScoringRunResponse)
async def score_assets(db: AsyncSession = Depends(get_db)):
    try:
        rows, distribution = await compute_asset_scores(db)
        return AssetScoringRunResponse(rows_updated=rows, distribution=distribution)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to compute asset scores")
        raise HTTPException(status_code=500, detail="Failed to compute asset scores") from exc


@router.get("/scoring/profile", response_model=AssetScoringProfile)
async def get_scoring_profile(db: AsyncSession = Depends(get_db)):
    try:
        return await get_asset_scoring_profile(db)
    except Exception as exc:
        logger.exception("Failed to load asset scoring profile")
        raise HTTPException(status_code=500, detail="Failed to load asset scoring profile") from exc


@router.put("/scoring/profile", response_model=AssetScoringProfile)
async def update_scoring_profile(profile: AssetScoringProfile, db: AsyncSession = Depends(get_db)):
    try:
        await save_asset_scoring_profile(db, profile)
        return profile
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to save asset scoring profile")
        raise HTTPException(status_code=500, detail="Failed to save asset scoring profile") from exc


@router.delete("/scoring/profile", response_model=AssetScoringProfile)
async def reset_scoring_profile(db: AsyncSession = Depends(get_db)):
    try:
        profile = await reset_active_stage(db, "asset")
        return AssetScoringProfile.model_validate(profile.config)
    except Exception as exc:
        logger.exception("Failed to reset asset scoring profile")
        raise HTTPException(status_code=500, detail="Failed to reset asset scoring profile") from exc


@router.get("/{asset_id}", response_model=AssetDetail)
async def asset_detail(asset_id: UUID, preset_id: Optional[UUID] = None, db: AsyncSession = Depends(get_db)):
    try:
        asset = await get_asset(db, asset_id, preset_id)
        if asset is None:
            raise HTTPException(status_code=404, detail="Asset not found")
        return asset
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to retrieve asset %s", asset_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve asset") from exc
