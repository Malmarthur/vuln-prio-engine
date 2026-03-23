"""
APScheduler integration — one interval job per ingestion source.

Schedule intervals and enabled state are read from the `settings` table on
startup and can be changed at runtime via `reschedule_source()` and
`toggle_source()`.
"""
from __future__ import annotations

import logging
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import settings as app_settings
from app.database import AsyncSessionLocal
from app.ingestion import runner
from app.services.vulnerability_service import get_setting

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

# Maps a schedule interval setting key → source name
SCHEDULE_SETTING_MAP: dict[str, str] = {
    "schedule_nvd_interval_hours": "nvd",
    "schedule_epss_interval_hours": "epss",
    "schedule_kev_interval_hours": "kev",
    "schedule_euvd_interval_hours": "euvd",
}

# Maps a schedule enabled setting key → source name
ENABLED_SETTING_MAP: dict[str, str] = {
    "schedule_nvd_enabled": "nvd",
    "schedule_epss_enabled": "epss",
    "schedule_kev_enabled": "kev",
    "schedule_euvd_enabled": "euvd",
}

# Default intervals (hours) if DB settings are missing
_DEFAULTS: dict[str, int] = {
    "nvd": 6,
    "epss": 24,
    "kev": 12,
    "euvd": 12,
}


# ---------------------------------------------------------------------------
# Per-source job functions (each creates its own DB session)
# ---------------------------------------------------------------------------

async def _job_kev() -> None:
    async with AsyncSessionLocal() as session:
        await runner.run_kev(session, "scheduled")


async def _job_nvd() -> None:
    async with AsyncSessionLocal() as session:
        await runner.run_nvd(session, "scheduled", api_key=app_settings.nvd_api_key)


async def _job_epss() -> None:
    async with AsyncSessionLocal() as session:
        await runner.run_epss(session, "scheduled")


async def _job_euvd() -> None:
    async with AsyncSessionLocal() as session:
        await runner.run_euvd(session, "scheduled")


_JOB_FUNCS = {
    "kev": _job_kev,
    "nvd": _job_nvd,
    "epss": _job_epss,
    "euvd": _job_euvd,
}


def _is_enabled(raw: Optional[object]) -> bool:
    """Interpret a settings value as a boolean, defaulting to True."""
    if raw is None:
        return True
    if isinstance(raw, bool):
        return raw
    return str(raw).lower() not in ("false", "0", "no")


# ---------------------------------------------------------------------------
# Startup: read intervals from DB and register jobs
# ---------------------------------------------------------------------------

async def init_scheduler() -> None:
    """Read schedule settings from DB, add interval jobs, and pause disabled ones."""
    async with AsyncSessionLocal() as session:
        for setting_key, source in SCHEDULE_SETTING_MAP.items():
            raw = await get_setting(session, setting_key)
            hours = int(raw) if raw is not None else _DEFAULTS[source]
            scheduler.add_job(
                _JOB_FUNCS[source],
                "interval",
                hours=hours,
                id=source,
                replace_existing=True,
            )
            logger.info("Scheduled '%s' every %d hour(s)", source, hours)

            # Respect enabled setting
            enabled_raw = await get_setting(session, f"schedule_{source}_enabled")
            if not _is_enabled(enabled_raw):
                scheduler.pause_job(source)
                logger.info("Job '%s' is disabled — paused on startup", source)

    scheduler.start()
    logger.info("Scheduler started")


def shutdown_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler shut down")


# ---------------------------------------------------------------------------
# Dynamic rescheduling and toggling
# ---------------------------------------------------------------------------

def reschedule_source(source: str, hours: int) -> None:
    """Update the interval for a running job. No-op if the job doesn't exist."""
    try:
        scheduler.reschedule_job(source, trigger="interval", hours=hours)
        logger.info("Rescheduled '%s' to every %d hour(s)", source, hours)
    except Exception:
        logger.exception("Failed to reschedule '%s'", source)


def toggle_source(source: str, enabled: bool) -> None:
    """Pause or resume a scheduled job without removing it."""
    try:
        if enabled:
            scheduler.resume_job(source)
            logger.info("Resumed scheduled job '%s'", source)
        else:
            scheduler.pause_job(source)
            logger.info("Paused scheduled job '%s'", source)
    except Exception:
        logger.exception("Failed to toggle job '%s' (enabled=%s)", source, enabled)
