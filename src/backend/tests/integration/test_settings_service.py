"""Integration tests for settings service (get_setting, set_setting, delete_setting, get_all_settings)."""
from __future__ import annotations

import pytest

from app.services.vulnerability_service import (
    delete_setting,
    get_all_settings,
    get_setting,
    set_setting,
)

pytestmark = pytest.mark.integration


class TestSettings:
    async def test_get_missing_returns_none(self, db_session):
        result = await get_setting(db_session, "nonexistent_key")
        assert result is None

    async def test_set_and_get(self, db_session):
        await set_setting(db_session, "my_key", {"foo": "bar"})
        result = await get_setting(db_session, "my_key")
        assert result == {"foo": "bar"}

    async def test_upsert_overwrites(self, db_session):
        await set_setting(db_session, "my_key", "first")
        await set_setting(db_session, "my_key", "second")
        result = await get_setting(db_session, "my_key")
        assert result == "second"

    async def test_delete(self, db_session):
        await set_setting(db_session, "my_key", "value")
        await delete_setting(db_session, "my_key")
        result = await get_setting(db_session, "my_key")
        assert result is None

    async def test_get_all(self, db_session):
        await set_setting(db_session, "key_a", 1)
        await set_setting(db_session, "key_b", 2)
        all_settings = await get_all_settings(db_session)
        assert all_settings["key_a"] == 1
        assert all_settings["key_b"] == 2
