"""API tests for /api/v1/settings."""
from __future__ import annotations

from unittest.mock import patch

import pytest

pytestmark = pytest.mark.api

BASE = "/api/v1/settings"


class TestSettingsApi:
    async def test_list_empty(self, client):
        response = await client.get(BASE)
        assert response.status_code == 200
        assert response.json() == {}

    async def test_update_setting(self, client):
        with patch("app.api.settings.reschedule_source"), patch("app.api.settings.toggle_source"):
            response = await client.put(f"{BASE}/my_key", json={"value": "my_value"})
        assert response.status_code == 200
        data = response.json()
        assert data["key"] == "my_key"
        assert data["value"] == "my_value"

    async def test_list_after_update(self, client):
        with patch("app.api.settings.reschedule_source"), patch("app.api.settings.toggle_source"):
            await client.put(f"{BASE}/my_key", json={"value": 42})
        response = await client.get(BASE)
        assert response.status_code == 200
        assert response.json()["my_key"] == 42

    async def test_schedule_key_triggers_reschedule(self, client):
        from app.ingestion.scheduler import SCHEDULE_SETTING_MAP

        if not SCHEDULE_SETTING_MAP:
            pytest.skip("No schedule setting keys defined")

        schedule_key = next(iter(SCHEDULE_SETTING_MAP))
        with patch("app.api.settings.reschedule_source") as mock_reschedule, \
             patch("app.api.settings.toggle_source"):
            await client.put(f"{BASE}/{schedule_key}", json={"value": 60})

        mock_reschedule.assert_called_once()
