"""Unit tests for RateLimiter and fetch_with_retry."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import respx

from app.ingestion.utils import RateLimiter, fetch_with_retry


# ---------------------------------------------------------------------------
# RateLimiter
# ---------------------------------------------------------------------------

class TestRateLimiter:
    async def test_allows_requests_within_limit(self):
        rl = RateLimiter(calls=5, period=1.0)
        # Should complete without sleeping
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            for _ in range(5):
                await rl.acquire()
            mock_sleep.assert_not_called()

    async def test_blocks_when_limit_exceeded(self):
        rl = RateLimiter(calls=2, period=10.0)
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await rl.acquire()
            await rl.acquire()
            await rl.acquire()  # third call should sleep
            mock_sleep.assert_called_once()

    async def test_timestamps_accumulate(self):
        rl = RateLimiter(calls=3, period=60.0)
        with patch("asyncio.sleep", new_callable=AsyncMock):
            for _ in range(3):
                await rl.acquire()
        assert len(rl._timestamps) == 3


# ---------------------------------------------------------------------------
# fetch_with_retry
# ---------------------------------------------------------------------------

class TestFetchWithRetry:
    @respx.mock
    async def test_success_on_first_attempt(self):
        respx.get("https://example.com/api").mock(return_value=httpx.Response(200, json={"ok": True}))
        async with httpx.AsyncClient() as client:
            response = await fetch_with_retry(client, "GET", "https://example.com/api")
        assert response.status_code == 200

    @respx.mock
    async def test_429_respects_retry_after(self):
        respx.get("https://example.com/api").mock(side_effect=[
            httpx.Response(429, headers={"Retry-After": "1"}),
            httpx.Response(200, json={"ok": True}),
        ])
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            async with httpx.AsyncClient() as client:
                response = await fetch_with_retry(client, "GET", "https://example.com/api")
            mock_sleep.assert_called_once_with(1)
        assert response.status_code == 200

    @respx.mock
    async def test_500_retries_with_backoff(self):
        respx.get("https://example.com/api").mock(side_effect=[
            httpx.Response(500),
            httpx.Response(500),
            httpx.Response(200, json={"ok": True}),
        ])
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            async with httpx.AsyncClient() as client:
                response = await fetch_with_retry(client, "GET", "https://example.com/api", max_retries=3)
            assert mock_sleep.call_count == 2
        assert response.status_code == 200

    @respx.mock
    async def test_500_exhausts_retries_raises(self):
        respx.get("https://example.com/api").mock(return_value=httpx.Response(500))
        with patch("asyncio.sleep", new_callable=AsyncMock):
            async with httpx.AsyncClient() as client:
                with pytest.raises(httpx.HTTPStatusError):
                    await fetch_with_retry(client, "GET", "https://example.com/api", max_retries=2)

    @respx.mock
    async def test_4xx_does_not_retry_raises_immediately(self):
        respx.get("https://example.com/api").mock(return_value=httpx.Response(404))
        async with httpx.AsyncClient() as client:
            with pytest.raises(httpx.HTTPStatusError) as exc_info:
                await fetch_with_retry(client, "GET", "https://example.com/api", max_retries=3)
        assert exc_info.value.response.status_code == 404

    @respx.mock
    async def test_connect_error_retries(self):
        respx.get("https://example.com/api").mock(side_effect=[
            httpx.ConnectError("connection refused"),
            httpx.Response(200, json={"ok": True}),
        ])
        with patch("asyncio.sleep", new_callable=AsyncMock):
            async with httpx.AsyncClient() as client:
                response = await fetch_with_retry(client, "GET", "https://example.com/api")
        assert response.status_code == 200

    @respx.mock
    async def test_timeout_error_retries(self):
        respx.get("https://example.com/api").mock(side_effect=[
            httpx.TimeoutException("timeout"),
            httpx.Response(200, json={"ok": True}),
        ])
        with patch("asyncio.sleep", new_callable=AsyncMock):
            async with httpx.AsyncClient() as client:
                response = await fetch_with_retry(client, "GET", "https://example.com/api")
        assert response.status_code == 200

    @respx.mock
    async def test_rate_limiter_called_before_each_request(self):
        respx.get("https://example.com/api").mock(side_effect=[
            httpx.Response(500),
            httpx.Response(200, json={"ok": True}),
        ])
        mock_limiter = AsyncMock(spec=RateLimiter)
        with patch("asyncio.sleep", new_callable=AsyncMock):
            async with httpx.AsyncClient() as client:
                await fetch_with_retry(
                    client, "GET", "https://example.com/api",
                    max_retries=2, rate_limiter=mock_limiter,
                )
        assert mock_limiter.acquire.call_count == 2
