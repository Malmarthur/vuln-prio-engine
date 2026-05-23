"""API test: GET /health."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.api


async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
