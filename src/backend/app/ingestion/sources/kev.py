"""CISA Known Exploited Vulnerabilities (KEV) connector.

Single JSON file download — simplest of the four sources.
"""
import logging
from typing import Any

from app.ingestion.utils import fetch_with_retry, get_http_client

logger = logging.getLogger(__name__)

KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"


async def fetch_kev() -> list[dict[str, Any]]:
    """Download the full CISA KEV catalog and return the raw vulnerability list."""
    async with get_http_client(timeout=60.0) as client:
        logger.info("Fetching CISA KEV catalog from %s", KEV_URL)
        response = await fetch_with_retry(client, "GET", KEV_URL)
        data = response.json()

    entries = data.get("vulnerabilities", [])
    logger.info("KEV: fetched %d entries (catalog version %s)", len(entries), data.get("catalogVersion"))
    return entries
