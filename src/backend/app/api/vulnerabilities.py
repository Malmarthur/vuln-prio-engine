import logging
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.vulnerability import (
    PaginatedVulnerabilities,
    VulnerabilityDetail,
    VulnerabilityStats,
)
from app.services.vulnerability_service import (
    get_vulnerability_by_cve_id,
    get_vulnerability_stats,
    query_vulnerabilities,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/vulnerabilities", tags=["vulnerabilities"])


@router.get("", response_model=PaginatedVulnerabilities)
async def list_vulnerabilities(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    sort_by: Literal["published_date", "cvss_v31_score", "epss_score", "updated_at", "priority_score", "priority_confidence"] = "published_date",
    sort_order: Literal["asc", "desc"] = "desc",
    search: Optional[str] = Query(None, max_length=200),
    severity: Optional[Literal["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"]] = None,
    kev_only: bool = False,
    min_epss: Optional[float] = Query(None, ge=0.0, le=1.0),
    min_cvss: Optional[float] = Query(None, ge=0.0, le=10.0),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    priority_level: Optional[Literal["V0", "V1", "V2", "V3"]] = None,
    preset_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        items, total = await query_vulnerabilities(
            db,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            search=search,
            severity=severity,
            kev_only=kev_only,
            min_epss=min_epss,
            min_cvss=min_cvss,
            date_from=date_from,
            date_to=date_to,
            priority_level=priority_level,
            preset_id=preset_id,
        )
        return PaginatedVulnerabilities(total=total, page=page, per_page=per_page, items=items)
    except Exception as exc:
        logger.exception("Failed to query vulnerabilities")
        raise HTTPException(status_code=500, detail="Failed to retrieve vulnerabilities") from exc


@router.get("/stats", response_model=VulnerabilityStats)
async def vulnerability_stats(db: AsyncSession = Depends(get_db)):
    try:
        return await get_vulnerability_stats(db)
    except Exception as exc:
        logger.exception("Failed to retrieve vulnerability stats")
        raise HTTPException(status_code=500, detail="Failed to retrieve vulnerability stats") from exc


@router.get("/{cve_id}", response_model=VulnerabilityDetail)
async def get_vulnerability(cve_id: str, preset_id: Optional[UUID] = None, db: AsyncSession = Depends(get_db)):
    try:
        vuln = await get_vulnerability_by_cve_id(db, cve_id, preset_id)
        if vuln is None:
            raise HTTPException(status_code=404, detail=f"{cve_id} not found")
        return vuln
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to retrieve vulnerability %s", cve_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve vulnerability") from exc
