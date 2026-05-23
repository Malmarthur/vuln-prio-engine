"""Integration tests for ingestion runners (sources mocked, DB real)."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select, text

from app.ingestion.runner import run_all, run_epss, run_euvd, run_kev, run_nvd
from app.models.ingestion_log import IngestionLog
from app.services.vulnerability_service import get_setting

pytestmark = pytest.mark.integration

# ---------------------------------------------------------------------------
# Minimal raw payloads
# ---------------------------------------------------------------------------

_KEV_ENTRIES = [
    {
        "cveID": "CVE-2024-00001",
        "vendorProject": "Test",
        "product": "Foo",
        "vulnerabilityName": "Test CVE",
        "dateAdded": "2024-06-01",
        "shortDescription": "A test vulnerability",
        "knownRansomwareCampaignUse": "Unknown",
        "notes": "",
    }
]

_EPSS_ROWS = [
    {"cve": "CVE-2024-00001", "epss": "0.50000", "percentile": "0.80000", "date": "2024-06-01"},
]

_NVD_PAGE = [
    {
        "cve": {
            "id": "CVE-2024-00001",
            "published": "2024-06-01T00:00:00.000",
            "lastModified": "2024-06-01T00:00:00.000",
            "descriptions": [{"lang": "en", "value": "A test vulnerability. Details here."}],
            "metrics": {},
            "weaknesses": [],
            "configurations": [],
            "references": [],
        }
    }
]

_EUVD_PAGE = [
    {"id": "EUVD-2024-00001", "aliases": "CVE-2024-00001", "description": "Test"},
]


async def _async_gen_pages(page, total):
    yield page, total


class TestRunKev:
    async def test_success(self, db_session):
        with patch("app.ingestion.runner.kev_source.fetch_kev", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = _KEV_ENTRIES
            await run_kev(db_session)

        result = await db_session.execute(select(IngestionLog).where(IngestionLog.source == "kev"))
        log = result.scalar_one()
        assert log.status == "success"
        assert log.records_processed == 1

    async def test_failure_logs_failed_status(self, db_session):
        with patch("app.ingestion.runner.kev_source.fetch_kev", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.side_effect = RuntimeError("network error")
            with pytest.raises(RuntimeError):
                await run_kev(db_session)

        result = await db_session.execute(select(IngestionLog).where(IngestionLog.source == "kev"))
        log = result.scalar_one()
        assert log.status == "failed"
        assert "network error" in log.error_message


class TestRunEpss:
    async def test_success(self, db_session):
        with patch("app.ingestion.runner.epss_source.fetch_epss", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = _EPSS_ROWS
            await run_epss(db_session)

        result = await db_session.execute(select(IngestionLog).where(IngestionLog.source == "epss"))
        log = result.scalar_one()
        assert log.status == "success"


class TestRunNvd:
    async def test_full_sync_stores_last_sync_time(self, db_session):
        async def _fake_pages(*args, **kwargs):
            yield _NVD_PAGE, 1

        with patch("app.ingestion.runner.nvd_source.fetch_nvd_full", return_value=_fake_pages()):
            await run_nvd(db_session)

        last_sync = await get_setting(db_session, "nvd_last_sync_time")
        assert last_sync is not None

    async def test_incremental_uses_since(self, db_session):
        from app.services.vulnerability_service import set_setting
        await set_setting(db_session, "nvd_last_sync_time", "2024-01-01T00:00:00+00:00")

        async def _fake_pages(*args, **kwargs):
            yield _NVD_PAGE, 1

        with patch("app.ingestion.runner.nvd_source.fetch_nvd_since", return_value=_fake_pages()) as mock_since:
            await run_nvd(db_session)

        mock_since.assert_called_once()


class TestRunEuvd:
    async def test_success(self, db_session):
        async def _fake_pages():
            yield _EUVD_PAGE, 1

        with patch("app.ingestion.runner.euvd_source.fetch_euvd", return_value=_fake_pages()):
            await run_euvd(db_session)

        result = await db_session.execute(select(IngestionLog).where(IngestionLog.source == "euvd"))
        log = result.scalar_one()
        assert log.status == "success"


class TestRunAll:
    async def test_continues_on_single_source_failure(self, db_session):
        """A failure in KEV should not prevent EPSS from running."""
        async def _fake_epss_pages(*args, **kwargs):
            return _EPSS_ROWS

        with (
            patch("app.ingestion.runner.kev_source.fetch_kev", new_callable=AsyncMock, side_effect=RuntimeError("kev down")),
            patch("app.ingestion.runner.epss_source.fetch_epss", new_callable=AsyncMock, return_value=_EPSS_ROWS),
            patch("app.ingestion.runner.nvd_source.fetch_nvd_full", return_value=_async_gen_pages([], 0)),
            patch("app.ingestion.runner.euvd_source.fetch_euvd", return_value=_async_gen_pages([], 0)),
        ):
            await run_all(db_session)

        result = await db_session.execute(select(IngestionLog).where(IngestionLog.source == "epss"))
        epss_log = result.scalar_one()
        assert epss_log.status == "success"
