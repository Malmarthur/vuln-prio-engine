import logging
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.asset import Finding
from app.schemas.finding import (
    FindingResponse,
    FindingScoringProfile,
    FindingScoringRunResponse,
    FindingStats,
    MatchingRunResponse,
    PaginatedFindings,
)
from app.services.finding_service import (
    compute_finding_scores,
    get_finding_scoring_profile,
    get_finding_stats,
    list_findings,
    normalize_finding_priority_level,
    run_matching,
    save_finding_scoring_profile,
)
from app.services.profile_service import reset_active_stage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/findings", tags=["findings"])


@router.post("/match/run", response_model=MatchingRunResponse)
async def match_findings(db: AsyncSession = Depends(get_db)):
    try:
        return await run_matching(db)
    except Exception as exc:
        logger.exception("Failed to run finding matching")
        raise HTTPException(status_code=500, detail="Failed to run finding matching") from exc


@router.post("/scoring/run", response_model=FindingScoringRunResponse)
async def score_findings(db: AsyncSession = Depends(get_db)):
    try:
        rows, distribution = await compute_finding_scores(db)
        return FindingScoringRunResponse(rows_updated=rows, distribution=distribution)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to compute finding scores")
        raise HTTPException(status_code=500, detail="Failed to compute finding scores") from exc


@router.get("/scoring/profile", response_model=FindingScoringProfile)
async def get_scoring_profile(db: AsyncSession = Depends(get_db)):
    try:
        return await get_finding_scoring_profile(db)
    except Exception as exc:
        logger.exception("Failed to load finding scoring profile")
        raise HTTPException(status_code=500, detail="Failed to load finding scoring profile") from exc


@router.put("/scoring/profile", response_model=FindingScoringProfile)
async def update_scoring_profile(profile: FindingScoringProfile, db: AsyncSession = Depends(get_db)):
    try:
        await save_finding_scoring_profile(db, profile)
        return profile
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to save finding scoring profile")
        raise HTTPException(status_code=500, detail="Failed to save finding scoring profile") from exc


@router.delete("/scoring/profile", response_model=FindingScoringProfile)
async def reset_scoring_profile(db: AsyncSession = Depends(get_db)):
    try:
        profile = await reset_active_stage(db, "finding")
        return FindingScoringProfile.model_validate(profile.config)
    except Exception as exc:
        logger.exception("Failed to reset finding scoring profile")
        raise HTTPException(status_code=500, detail="Failed to reset finding scoring profile") from exc


@router.get("", response_model=PaginatedFindings)
async def findings(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None, max_length=200),
    asset_id: Optional[UUID] = None,
    priority_level: Optional[Literal["P0", "P1", "P2", "P3"]] = None,
    kev_only: bool = False,
    internet_exposure: Optional[Literal["internet", "internal", "isolated", "unknown"]] = None,
    business_criticality: Optional[Literal["critical", "high", "medium", "low", "unknown"]] = None,
    patch_complexity: Optional[Literal["high", "medium", "low", "unknown"]] = None,
    preset_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        items, total = await list_findings(
            db,
            page=page,
            per_page=per_page,
            search=search,
            asset_id=asset_id,
            priority_level=priority_level,
            kev_only=kev_only,
            internet_exposure=internet_exposure,
            business_criticality=business_criticality,
            patch_complexity=patch_complexity,
            preset_id=preset_id,
        )
        return PaginatedFindings(
            total=total,
            page=page,
            per_page=per_page,
            items=[_finding_response(item) for item in items],
        )
    except Exception as exc:
        logger.exception("Failed to query findings")
        raise HTTPException(status_code=500, detail="Failed to retrieve findings") from exc


@router.get("/stats", response_model=FindingStats)
async def finding_stats(preset_id: Optional[UUID] = None, db: AsyncSession = Depends(get_db)):
    try:
        return await get_finding_stats(db, preset_id)
    except Exception as exc:
        logger.exception("Failed to retrieve finding stats")
        raise HTTPException(status_code=500, detail="Failed to retrieve finding stats") from exc


def _finding_response(finding: Finding) -> FindingResponse:
    vuln = finding.vulnerability
    return FindingResponse(
        id=finding.id,
        match_type=finding.match_type,
        match_confidence=float(finding.match_confidence),
        status=finding.status,
        first_seen_at=finding.first_seen_at,
        last_seen_at=finding.last_seen_at,
        priority_level=normalize_finding_priority_level(finding.priority_level),
        priority_score=float(finding.priority_score) if finding.priority_score is not None else None,
        priority_confidence=float(finding.priority_confidence) if finding.priority_confidence is not None else None,
        asset={
            "id": finding.asset.id,
            "name": finding.asset.name,
            "internet_exposure": finding.asset.internet_exposure,
            "business_criticality": finding.asset.business_criticality,
            "patch_complexity": finding.asset.patch_complexity,
            "priority_level": finding.asset.priority_level,
            "priority_score": float(finding.asset.priority_score) if finding.asset.priority_score is not None else None,
            "priority_confidence": float(finding.asset.priority_confidence) if finding.asset.priority_confidence is not None else None,
        },
        component={
            "id": finding.component.id,
            "name": finding.component.name,
            "version": finding.component.version,
            "vendor": finding.component.vendor,
            "product": finding.component.product,
            "purl": finding.component.purl,
            "cpe": finding.component.cpe,
            "cpe_vendor": finding.component.cpe_vendor,
            "cpe_product": finding.component.cpe_product,
            "cpe_version": finding.component.cpe_version,
        },
        vulnerability={
            "id": vuln.id,
            "cve_id": vuln.cve_id,
            "summary": vuln.summary,
            "cvss_v31_score": float(vuln.cvss_v31_score) if vuln.cvss_v31_score is not None else None,
            "epss_score": float(vuln.epss_score) if vuln.epss_score is not None else None,
            "kev_known_exploited": vuln.kev_known_exploited,
            "vulnerability_priority_level": vuln.priority_level,
            "vulnerability_priority_score": float(vuln.priority_score) if vuln.priority_score is not None else None,
        },
    )
