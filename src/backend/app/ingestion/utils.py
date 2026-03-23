import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 30.0
DEFAULT_MAX_RETRIES = 3


class RateLimiter:
    """Sliding-window rate limiter: at most `calls` requests per `period` seconds."""

    def __init__(self, calls: int, period: float):
        self.calls = calls
        self.period = period
        self._lock = asyncio.Lock()
        self._timestamps: list[float] = []

    async def acquire(self) -> None:
        async with self._lock:
            loop = asyncio.get_event_loop()
            now = loop.time()
            # Evict timestamps outside the window
            self._timestamps = [t for t in self._timestamps if now - t < self.period]
            if len(self._timestamps) >= self.calls:
                # Sleep until the oldest slot expires
                wait = self.period - (now - self._timestamps[0]) + 0.01
                await asyncio.sleep(wait)
                now = loop.time()
                self._timestamps = [t for t in self._timestamps if now - t < self.period]
            self._timestamps.append(loop.time())


@asynccontextmanager
async def get_http_client(
    timeout: float = DEFAULT_TIMEOUT,
    headers: Optional[dict] = None,
) -> AsyncGenerator[httpx.AsyncClient, None]:
    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=True,
        headers=headers or {},
    ) as client:
        yield client


async def fetch_with_retry(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    max_retries: int = DEFAULT_MAX_RETRIES,
    rate_limiter: Optional[RateLimiter] = None,
    **kwargs,
) -> httpx.Response:
    last_exc: Optional[Exception] = None
    for attempt in range(max_retries + 1):
        if rate_limiter:
            await rate_limiter.acquire()
        try:
            response = await client.request(method, url, **kwargs)
            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", 30))
                logger.warning("Rate limited by %s — waiting %ss", url, retry_after)
                await asyncio.sleep(retry_after)
                continue
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code >= 500 and attempt < max_retries:
                wait = 2.0**attempt
                logger.warning(
                    "HTTP %s from %s, retry %s/%s in %.1fs",
                    exc.response.status_code, url, attempt + 1, max_retries, wait,
                )
                await asyncio.sleep(wait)
                last_exc = exc
            else:
                raise
        except (httpx.ConnectError, httpx.TimeoutException, httpx.RemoteProtocolError) as exc:
            if attempt < max_retries:
                wait = 2.0**attempt
                logger.warning(
                    "Connection error for %s, retry %s/%s in %.1fs: %s",
                    url, attempt + 1, max_retries, wait, exc,
                )
                await asyncio.sleep(wait)
                last_exc = exc
            else:
                raise
    raise last_exc or RuntimeError("fetch_with_retry exhausted retries")
