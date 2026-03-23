"""ENISA EUVD connector.

API docs: https://euvd.enisa.europa.eu/apidoc
Base URL: https://euvdservices.enisa.europa.eu/api

The main domain (euvd.enisa.europa.eu) is a React SPA; all API calls go to
euvdservices.enisa.europa.eu.

Pagination endpoint: GET /api/search
  - page (0-indexed), size (max 100)
  - fromUpdatedDate / toUpdatedDate (YYYY-MM-DD) for incremental sync
  - Response: {"items": [...], "total": N}

Each entry has: id (EUVD-YYYY-NNNNN), aliases (CVE ID string), description,
baseScore, baseScoreVersion, epss, datePublished, dateUpdated, etc.
"""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any, Optional

from app.ingestion.utils import RateLimiter, fetch_with_retry, get_http_client

logger = logging.getLogger(__name__)

EUVD_BASE_URL = "https://euvdservices.enisa.europa.eu/api"
EUVD_SEARCH_ENDPOINT = f"{EUVD_BASE_URL}/search"
EUVD_PAGE_SIZE = 100
EUVD_RATE_LIMITER = RateLimiter(calls=10, period=1.0)
EUVD_HEADERS = {"Accept": "application/json"}


async def fetch_euvd(
    since: Optional[datetime] = None,
) -> AsyncIterator[tuple[list[dict[str, Any]], int]]:
    """
    Async generator — yields (items, total) tuples per page.

    `total` is the API-reported total entry count (constant across all yields).
    Callers should iterate and normalize/upsert per page for live progress tracking.
    """
    params: dict[str, Any] = {"size": EUVD_PAGE_SIZE, "page": 0}
    if since:
        params["fromUpdatedDate"] = since.astimezone(timezone.utc).strftime("%Y-%m-%d")

    async with get_http_client(timeout=60.0, headers=EUVD_HEADERS) as client:
        total: int = 0
        while True:
            response = await fetch_with_retry(
                client, "GET", EUVD_SEARCH_ENDPOINT,
                params=params,
                rate_limiter=EUVD_RATE_LIMITER,
            )

            try:
                data = response.json()
            except Exception:
                logger.warning(
                    "EUVD: response is not JSON (status=%d, content-type=%s, body=%s)",
                    response.status_code,
                    response.headers.get("content-type", "?"),
                    response.text[:200],
                )
                return

            items = _extract_items(data)

            if params["page"] == 0:
                total = data.get("total", 0) if isinstance(data, dict) else 0
                logger.info("EUVD: %d total entries to fetch", total)

            if not items:
                return

            yield items, total

            fetched_so_far = (params["page"] + 1) * EUVD_PAGE_SIZE
            if fetched_so_far >= total or len(items) < EUVD_PAGE_SIZE:
                return

            params["page"] += 1


def _extract_items(data: Any) -> list[dict]:
    """
    Extract the list of entries from whatever shape the EUVD API returns.
    Handles both {"items": [...]} and flat list responses gracefully.
    """
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("items", "vulnerabilities", "data", "results"):
            if key in data and isinstance(data[key], list):
                return data[key]
    logger.warning("EUVD: unexpected response shape — %s", str(data)[:200])
    return []
