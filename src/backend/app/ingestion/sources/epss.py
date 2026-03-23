"""FIRST EPSS connector.

Uses the official FIRST EPSS API: https://api.first.org/data/v1/epss
~260k CVEs fetched via pagination and assembled into a Polars DataFrame
by the aggregator layer.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Any, Optional

from app.ingestion.utils import RateLimiter, fetch_with_retry, get_http_client

logger = logging.getLogger(__name__)

EPSS_API_URL = "https://api.first.org/data/v1/epss"
EPSS_PAGE_SIZE = 10_000
EPSS_RATE_LIMITER = RateLimiter(calls=10, period=1.0)


async def fetch_epss(score_date: Optional[date] = None) -> list[dict[str, Any]]:
    """
    Fetch all EPSS scores for `score_date` (defaults to today's published scores).

    Returns a flat list of raw dicts with keys: cve, epss, percentile, date.
    Pass the result to aggregator.normalize_epss().
    """
    all_rows: list[dict[str, Any]] = []
    params: dict[str, Any] = {"limit": EPSS_PAGE_SIZE, "offset": 0}
    if score_date:
        params["date"] = score_date.isoformat()

    async with get_http_client(timeout=60.0) as client:
        total: Optional[int] = None

        while True:
            response = await fetch_with_retry(
                client, "GET", EPSS_API_URL,
                params=params,
                rate_limiter=EPSS_RATE_LIMITER,
            )
            data = response.json()

            if total is None:
                total = data.get("total", 0)
                logger.info("EPSS: %d scores to fetch", total)

            rows = data.get("data", [])
            if not rows:
                break

            all_rows.extend(rows)
            logger.debug("EPSS: fetched %d / %d", len(all_rows), total)

            if len(all_rows) >= (total or 0):
                break

            params["offset"] += EPSS_PAGE_SIZE

    logger.info("EPSS: fetched %d scores total", len(all_rows))
    return all_rows
