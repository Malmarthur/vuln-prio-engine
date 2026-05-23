"""API tests for /api/v1/ingestion."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

pytestmark = pytest.mark.api

BASE = "/api/v1/ingestion"


async def _noop(*args, **kwargs):
    pass


class TestTriggerIngestion:
    async def test_valid_source_returns_202(self, client):
        with patch("app.api.ingestion._run_ingestion_bg", new=_noop):
            with patch("asyncio.create_task") as mock_task:
                mock_task.return_value = MagicMock(done=lambda: True)
                response = await client.post(f"{BASE}/trigger", json={"source": "kev"})
        assert response.status_code == 202
        data = response.json()
        assert data["source"] == "kev"
        assert data["status"] == "triggered"

    async def test_invalid_source_returns_422(self, client):
        response = await client.post(f"{BASE}/trigger", json={"source": "invalid_source"})
        assert response.status_code == 422

    async def test_already_running_returns_409(self, client):
        # Simulate a running task
        mock_task = MagicMock()
        mock_task.done.return_value = False

        with patch("app.api.ingestion._running_tasks", {"kev": mock_task}):
            response = await client.post(f"{BASE}/trigger", json={"source": "kev"})
        assert response.status_code == 409


class TestCancelIngestion:
    async def test_cancel_no_task_returns_404(self, client):
        with patch("app.api.ingestion._running_tasks", {}):
            response = await client.post(f"{BASE}/cancel", json={"source": "kev"})
        assert response.status_code == 404

    async def test_cancel_running_task(self, client):
        mock_task = MagicMock()
        mock_task.done.return_value = False
        mock_task.cancel.return_value = True

        with patch("app.api.ingestion._running_tasks", {"kev": mock_task}):
            response = await client.post(f"{BASE}/cancel", json={"source": "kev"})
        assert response.status_code == 200
        assert response.json()["status"] == "cancelling"


class TestIngestionStatus:
    async def test_status_empty(self, client):
        response = await client.get(f"{BASE}/status")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    async def test_status_with_logs(self, client, db_session, log_factory):
        db_session.add(log_factory(source="nvd", status="success"))
        await db_session.commit()
        response = await client.get(f"{BASE}/status")
        data = response.json()
        sources = [entry["source"] for entry in data]
        assert "nvd" in sources


class TestIngestionLogs:
    async def test_logs_empty(self, client):
        response = await client.get(f"{BASE}/logs")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["items"] == []

    async def test_logs_with_data(self, client, db_session, log_factory):
        db_session.add(log_factory(source="nvd"))
        db_session.add(log_factory(source="kev"))
        await db_session.commit()
        response = await client.get(f"{BASE}/logs")
        data = response.json()
        assert data["total"] == 2

    async def test_logs_filter_source(self, client, db_session, log_factory):
        db_session.add(log_factory(source="nvd"))
        db_session.add(log_factory(source="kev"))
        await db_session.commit()
        response = await client.get(f"{BASE}/logs?source=nvd")
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["source"] == "nvd"
