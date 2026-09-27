"""Live activity feed: background jobs and ingestions, for UI progress tracking."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.scoring import ScoringJob
from app.schemas.scoring import ActivityIngestion, ActivityJob, ActivityResponse
from app.services.profile_service import ACTIVE_JOB_STATUSES
from app.services.vulnerability_service import get_latest_ingestion_status

router = APIRouter(prefix="/activity", tags=["activity"])

RECENT_WINDOW = timedelta(minutes=10)
SCOPE_LABELS = {
    "preset": "preset",
    "vulnerability": "vulnerabilities",
    "asset": "assets",
    "finding": "findings",
}


def job_title(job: ScoringJob) -> str:
    if job.kind == "matching":
        return "Matching & scoring findings" if job.request.get("score_after") else "Matching findings"
    if job.kind == "comparison":
        return "Strategy comparison"
    return f"Scoring {SCOPE_LABELS.get(job.scope, job.scope)}"


@router.get("", response_model=ActivityResponse)
async def activity(db: AsyncSession = Depends(get_db)) -> ActivityResponse:
    since = datetime.now(timezone.utc) - RECENT_WINDOW
    jobs = (
        await db.execute(
            select(ScoringJob)
            .where(or_(ScoringJob.status.in_(ACTIVE_JOB_STATUSES), ScoringJob.finished_at >= since))
            .order_by(ScoringJob.created_at.desc())
            .limit(20)
        )
    ).scalars().all()
    ingestions = await get_latest_ingestion_status(db)
    return ActivityResponse(
        jobs=[ActivityJob(**_job_fields(job), title=job_title(job)) for job in jobs],
        ingestions=[ActivityIngestion.model_validate(log) for log in ingestions],
    )


def _job_fields(job: ScoringJob) -> dict:
    return {
        "id": job.id,
        "kind": job.kind,
        "scope": job.scope,
        "status": job.status,
        "progress": float(job.progress or 0),
        "progress_detail": job.progress_detail or {},
        "request": job.request or {},
        "error": job.error,
        "cancel_requested": job.cancel_requested,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "result_summary": job.result_summary,
    }
