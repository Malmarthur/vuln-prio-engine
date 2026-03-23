"""NVD API 2.0 connector.

Strategy:
- Full sync (no date filter): used on first run or when forced.
- Incremental sync (lastModStartDate/lastModEndDate): used on subsequent runs.
  NVD caps the date range at 120 days per request, so we split larger ranges
  into 120-day windows automatically.

Rate limits:
- With API key:    50 requests / 30 seconds
- Without API key:  5 requests / 30 seconds
"""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.ingestion.utils import RateLimiter, fetch_with_retry, get_http_client

logger = logging.getLogger(__name__)

NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
NVD_MAX_RESULTS_PER_PAGE = 2000
NVD_MAX_DATE_RANGE_DAYS = 120


def _make_rate_limiter(api_key: Optional[str]) -> RateLimiter:
    return RateLimiter(calls=50 if api_key else 5, period=30.0)


def _nvd_headers(api_key: Optional[str]) -> dict:
    return {"apiKey": api_key} if api_key else {}


def _fmt_dt(dt: datetime) -> str:
    """Format datetime for NVD API date params (ISO 8601 UTC)."""
    utc = dt.astimezone(timezone.utc)
    return utc.strftime("%Y-%m-%dT%H:%M:%S.000+00:00")


async def fetch_nvd_full(
    api_key: Optional[str] = None,
) -> AsyncIterator[tuple[list[dict[str, Any]], int]]:
    """
    Async generator — yields (items, total_results) tuples for the full NVD database.
    `total_results` is the same value on every yield (discovered from the first page).
    """
    rate_limiter = _make_rate_limiter(api_key)
    headers = _nvd_headers(api_key)

    async with get_http_client(timeout=60.0, headers=headers) as client:
        start_index = 0
        total_results: int = 0

        while True:
            params: dict[str, Any] = {
                "resultsPerPage": NVD_MAX_RESULTS_PER_PAGE,
                "startIndex": start_index,
            }
            data = await _fetch_page(client, params, rate_limiter)
            items = data.get("vulnerabilities", [])

            if start_index == 0:
                total_results = data.get("totalResults", 0)
                logger.info("NVD full sync: %d total CVEs to fetch", total_results)

            if items:
                yield items, total_results

            start_index += len(items)
            logger.debug("NVD full sync progress: %d / %d", start_index, total_results)

            if start_index >= total_results or not items:
                break


async def fetch_nvd_since(
    since: datetime,
    until: Optional[datetime] = None,
    api_key: Optional[str] = None,
) -> AsyncIterator[tuple[list[dict[str, Any]], int]]:
    """
    Async generator — yields (items, window_total) tuples for CVEs modified since `since`.
    Automatically splits ranges larger than 120 days into multiple windows.
    `window_total` is the total for the current 120-day window.
    """
    if until is None:
        until = datetime.now(timezone.utc)

    rate_limiter = _make_rate_limiter(api_key)
    headers = _nvd_headers(api_key)
    window = timedelta(days=NVD_MAX_DATE_RANGE_DAYS)

    window_start = since
    async with get_http_client(timeout=60.0, headers=headers) as client:
        while window_start < until:
            window_end = min(window_start + window, until)
            logger.info(
                "NVD incremental: fetching %s → %s",
                window_start.isoformat(),
                window_end.isoformat(),
            )

            start_index = 0
            window_total: int = 0

            while True:
                params: dict[str, Any] = {
                    "resultsPerPage": NVD_MAX_RESULTS_PER_PAGE,
                    "startIndex": start_index,
                    "lastModStartDate": _fmt_dt(window_start),
                    "lastModEndDate": _fmt_dt(window_end),
                }
                data = await _fetch_page(client, params, rate_limiter)
                items = data.get("vulnerabilities", [])

                if start_index == 0:
                    window_total = data.get("totalResults", 0)

                if items:
                    yield items, window_total

                start_index += len(items)
                if start_index >= window_total or not items:
                    break

            window_start = window_end


async def _fetch_page(
    client: Any,
    params: dict,
    rate_limiter: RateLimiter,
) -> dict:
    response = await fetch_with_retry(
        client, "GET", NVD_URL,
        params=params,
        rate_limiter=rate_limiter,
    )
    return response.json()
