"""
High-level ingestion runners — one per source.

Each runner:
  1. Opens an ingestion log (status = "running"), optionally reusing a pending log
  2. Fetches raw data from the source
  3. Normalises to a Polars DataFrame via the aggregator
  4. Upserts into the DB
  5. Updates the ingestion log (status = "success" / "failed")
  6. Reports progress throughout via update_progress()
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.ingestion import aggregator
from app.ingestion.sources import epss as epss_source
from app.ingestion.sources import euvd as euvd_source
from app.ingestion.sources import kev as kev_source
from app.ingestion.sources import nvd as nvd_source
from app.services.vulnerability_service import (
    get_setting,
    ingestion_run,
    set_setting,
    update_progress,
    upsert_vulnerabilities,
)

logger = logging.getLogger(__name__)

NVD_LAST_SYNC_KEY = "nvd_last_sync_time"


def _log_progress_milestone(source: str, pct: float, last_milestone: list[int]) -> None:
    """Log at each 10% step. `last_milestone` is a single-element list used as mutable state."""
    milestone = (int(pct) // 10) * 10
    if milestone > last_milestone[0] and milestone > 0:
        last_milestone[0] = milestone
        logger.info("%s ingestion: %d%% complete", source.upper(), milestone)


# ---------------------------------------------------------------------------
# KEV
# ---------------------------------------------------------------------------

async def run_kev(
    session: AsyncSession,
    trigger_type: str = "manual",
    log_id: Optional[UUID] = None,
) -> None:
    async with ingestion_run(session, "kev", trigger_type, log_id=log_id) as ctx:
        raw = await kev_source.fetch_kev()
        await update_progress(session, ctx["log"], 33.0)

        df = aggregator.normalize_kev(raw)
        await update_progress(session, ctx["log"], 66.0)

        created, _ = await upsert_vulnerabilities(session, df, "kev")
        ctx["processed"] = len(df)
        ctx["created"] = created


# ---------------------------------------------------------------------------
# NVD
# ---------------------------------------------------------------------------

async def run_nvd(
    session: AsyncSession,
    trigger_type: str = "manual",
    force_full: bool = False,
    api_key: Optional[str] = None,
    log_id: Optional[UUID] = None,
) -> None:
    """
    Run NVD ingestion.

    - First run (or force_full=True): full sync of all CVEs.
    - Subsequent runs: incremental sync since the last successful sync time.
    """
    async with ingestion_run(session, "nvd", trigger_type, log_id=log_id) as ctx:
        last_sync_raw = await get_setting(session, NVD_LAST_SYNC_KEY)
        last_sync: Optional[datetime] = None
        if last_sync_raw and not force_full:
            try:
                last_sync = datetime.fromisoformat(str(last_sync_raw))
            except ValueError:
                pass

        sync_start = datetime.now(timezone.utc)

        if last_sync:
            logger.info("NVD incremental sync since %s", last_sync.isoformat())
            pages = nvd_source.fetch_nvd_since(since=last_sync, api_key=api_key)
        else:
            logger.info("NVD full sync (first run or forced)")
            pages = nvd_source.fetch_nvd_full(api_key=api_key)

        milestone = [0]
        async for page, total in pages:
            df = aggregator.normalize_nvd(page)
            if df.is_empty():
                continue
            created, _ = await upsert_vulnerabilities(session, df, "nvd")
            ctx["processed"] += len(df)
            ctx["created"] += created

            if total > 0:
                pct = min(ctx["processed"] / total * 99.0, 99.0)
                await update_progress(session, ctx["log"], pct)
                _log_progress_milestone("nvd", pct, milestone)

        # Persist the sync start time so the next run can use it
        await set_setting(session, NVD_LAST_SYNC_KEY, sync_start.isoformat())


# ---------------------------------------------------------------------------
# EPSS
# ---------------------------------------------------------------------------

async def run_epss(
    session: AsyncSession,
    trigger_type: str = "manual",
    log_id: Optional[UUID] = None,
) -> None:
    async with ingestion_run(session, "epss", trigger_type, log_id=log_id) as ctx:
        raw = await epss_source.fetch_epss()
        await update_progress(session, ctx["log"], 33.0)

        df = aggregator.normalize_epss(raw)
        await update_progress(session, ctx["log"], 66.0)

        created, _ = await upsert_vulnerabilities(session, df, "epss")
        ctx["processed"] = len(df)
        ctx["created"] = created


# ---------------------------------------------------------------------------
# EUVD
# ---------------------------------------------------------------------------

async def run_euvd(
    session: AsyncSession,
    trigger_type: str = "manual",
    log_id: Optional[UUID] = None,
) -> None:
    async with ingestion_run(session, "euvd", trigger_type, log_id=log_id) as ctx:
        milestone = [0]
        async for page, total in euvd_source.fetch_euvd():
            df = aggregator.normalize_euvd(page)
            if df.is_empty():
                continue
            created, _ = await upsert_vulnerabilities(session, df, "euvd")
            ctx["processed"] += len(df)
            ctx["created"] += created

            if total > 0:
                pct = min(ctx["processed"] / total * 99.0, 99.0)
                await update_progress(session, ctx["log"], pct)
                _log_progress_milestone("euvd", pct, milestone)


# ---------------------------------------------------------------------------
# All sources
# ---------------------------------------------------------------------------

async def run_all(
    session: AsyncSession,
    trigger_type: str = "manual",
    api_key: Optional[str] = None,
    log_ids: Optional[dict[str, UUID]] = None,
) -> None:
    """
    Run all four sources sequentially.

    log_ids: optional dict mapping source name → pre-created pending log UUID.
    Failures in one source do not block the others.
    """
    sources = [
        ("kev",  run_kev,  {}),
        ("epss", run_epss, {}),
        ("nvd",  run_nvd,  {"api_key": api_key}),
        ("euvd", run_euvd, {}),
    ]
    for name, runner_fn, extra_kwargs in sources:
        lid = log_ids.get(name) if log_ids else None
        try:
            await runner_fn(session, trigger_type, log_id=lid, **extra_kwargs)
        except Exception:
            logger.exception("Source '%s' failed — continuing with remaining sources", name)
