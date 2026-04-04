import asyncio
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal, get_db
from app.ingestion import runner
from app.schemas.ingestion import (
    IngestionLogResponse,
    PaginatedIngestionLogs,
    TriggerRequest,
    TriggerResponse,
)
from app.services.vulnerability_service import (
    cancel_stale_logs,
    create_pending_log,
    get_ingestion_logs,
    get_latest_ingestion_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingestion", tags=["ingestion"])

VALID_SOURCES = {"nvd", "epss", "kev", "euvd", "all"}
ALL_SOURCES = ["kev", "epss", "nvd", "euvd"]

# Module-level registry: source name → running asyncio.Task
_running_tasks: dict[str, asyncio.Task] = {}


async def _run_ingestion_bg(
    source: str,
    api_key: Optional[str],
    log_ids: Optional[dict[str, UUID]] = None,
) -> None:
    """Background task — creates its own DB session so the request session is free."""
    try:
        async with AsyncSessionLocal() as session:
            if source == "all":
                await runner.run_all(session, "manual", api_key=api_key, log_ids=log_ids)
            elif source == "nvd":
                lid = log_ids.get("nvd") if log_ids else None
                await runner.run_nvd(session, "manual", api_key=api_key, log_id=lid)
            elif source == "kev":
                lid = log_ids.get("kev") if log_ids else None
                await runner.run_kev(session, "manual", log_id=lid)
            elif source == "epss":
                lid = log_ids.get("epss") if log_ids else None
                await runner.run_epss(session, "manual", log_id=lid)
            elif source == "euvd":
                lid = log_ids.get("euvd") if log_ids else None
                await runner.run_euvd(session, "manual", log_id=lid)
            logger.info("Background ingestion completed successfully for source '%s'", source)
    except asyncio.CancelledError:
        logger.info("Ingestion for '%s' was cancelled", source)
    except Exception:
        logger.exception("Background ingestion failed for source '%s'", source)
    finally:
        _running_tasks.pop(source, None)


@router.post("/trigger", response_model=TriggerResponse, status_code=202)
async def trigger_ingestion(body: TriggerRequest):
    try:
        if body.source not in VALID_SOURCES:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid source '{body.source}'. Must be one of: {sorted(VALID_SOURCES)}",
            )

        # Reject if already running
        existing = _running_tasks.get(body.source)
        if existing and not existing.done():
            raise HTTPException(
                status_code=409,
                detail=f"Source '{body.source}' is already running",
            )

        log_ids: Optional[dict[str, UUID]] = None

        if body.source == "all":
            async with AsyncSessionLocal() as session:
                log_ids = {}
                for src in ALL_SOURCES:
                    log = await create_pending_log(session, src, "manual")
                    log_ids[src] = log.id

        task = asyncio.create_task(_run_ingestion_bg(body.source, settings.nvd_api_key, log_ids))
        _running_tasks[body.source] = task
        logger.info("Ingestion triggered for source '%s'", body.source)
        return TriggerResponse(status="triggered", source=body.source)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to trigger ingestion for source '%s'", body.source)
        raise HTTPException(status_code=500, detail="Failed to trigger ingestion") from exc


@router.post("/cancel", response_model=TriggerResponse)
async def cancel_ingestion(body: TriggerRequest, db: AsyncSession = Depends(get_db)):
    if body.source not in VALID_SOURCES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid source '{body.source}'. Must be one of: {sorted(VALID_SOURCES)}",
        )
    task = _running_tasks.get(body.source)
    if task and not task.done():
        task.cancel()
        logger.info("Cancel requested for source '%s'", body.source)
        return TriggerResponse(status="cancelling", source=body.source)

    # No live task — clean up any stale "running"/"pending" DB logs left behind
    # when a task ended without successfully committing its final status.
    sources_to_clean = ALL_SOURCES if body.source == "all" else [body.source]
    cleaned = await cancel_stale_logs(db, sources_to_clean)
    if cleaned > 0:
        logger.info("Cleaned %d stale log(s) for source '%s'", cleaned, body.source)
        return TriggerResponse(status="cancelling", source=body.source)

    raise HTTPException(
        status_code=404,
        detail=f"No running ingestion for '{body.source}'",
    )


@router.get("/status", response_model=list[IngestionLogResponse])
async def ingestion_status(db: AsyncSession = Depends(get_db)):
    """Latest run per source."""
    return await get_latest_ingestion_status(db)


@router.get("/logs", response_model=PaginatedIngestionLogs)
async def ingestion_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    source: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    items, total = await get_ingestion_logs(db, page=page, per_page=per_page, source=source)
    return PaginatedIngestionLogs(total=total, page=page, per_page=per_page, items=items)
