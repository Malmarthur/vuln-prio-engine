import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.scoring import ScoreDistribution, ScoringProfile, ScoringRunResponse
from app.services.scoring_service import (
    ELIGIBLE_COLUMNS,
    compute_scores,
    get_column_distinct_values,
    get_score_distribution,
    get_scoring_profile,
    save_scoring_profile,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scoring", tags=["scoring"])


@router.get("/profile", response_model=ScoringProfile)
async def get_profile(db: AsyncSession = Depends(get_db)):
    try:
        return await get_scoring_profile(db)
    except Exception as exc:
        logger.exception("Failed to load scoring profile")
        raise HTTPException(status_code=500, detail="Failed to load scoring profile") from exc


@router.put("/profile", response_model=ScoringProfile)
async def update_profile(profile: ScoringProfile, db: AsyncSession = Depends(get_db)):
    try:
        await save_scoring_profile(db, profile)
        return profile
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to save scoring profile")
        raise HTTPException(status_code=500, detail="Failed to save scoring profile") from exc


@router.post("/run", response_model=ScoringRunResponse)
async def run_scoring(db: AsyncSession = Depends(get_db)):
    try:
        profile = await get_scoring_profile(db)
        rows, distribution = await compute_scores(db, profile)
        return ScoringRunResponse(rows_updated=rows, distribution=distribution)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to compute scores")
        raise HTTPException(status_code=500, detail="Failed to compute scores") from exc


@router.get("/column-values/{column}")
async def column_values(column: str, db: AsyncSession = Depends(get_db)):
    if column not in ELIGIBLE_COLUMNS:
        raise HTTPException(status_code=422, detail=f"Column '{column}' is not eligible for scoring")
    try:
        values = await get_column_distinct_values(db, column)
        return {"column": column, "values": values}
    except Exception as exc:
        logger.exception("Failed to fetch distinct values for column %s", column)
        raise HTTPException(status_code=500, detail="Failed to fetch column values") from exc


@router.get("/distribution", response_model=ScoreDistribution)
async def distribution(db: AsyncSession = Depends(get_db)):
    try:
        return await get_score_distribution(db)
    except Exception as exc:
        logger.exception("Failed to fetch score distribution")
        raise HTTPException(status_code=500, detail="Failed to fetch distribution") from exc
