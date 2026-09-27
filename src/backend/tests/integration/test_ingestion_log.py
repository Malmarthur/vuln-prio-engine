"""Integration tests for ingestion log functions."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest
from sqlalchemy import select, text

from app.models.ingestion_log import IngestionLog
from app.services.vulnerability_service import (
    cancel_stale_logs,
    cleanup_stale_ingestion_logs,
    create_pending_log,
    get_ingestion_logs,
    get_latest_ingestion_status,
    ingestion_run,
    update_progress,
)

pytestmark = pytest.mark.integration


class TestIngestionRunContextManager:
    async def test_success_sets_status(self, db_session):
        async with ingestion_run(db_session, "kev") as ctx:
            ctx["processed"] = 100
            ctx["created"] = 80

        result = await db_session.execute(select(IngestionLog).where(IngestionLog.source == "kev"))
        log = result.scalar_one()
        assert log.status == "success"
        assert log.records_processed == 100
        assert log.records_created == 80
        assert log.progress == 100.0

    async def test_exception_sets_failed(self, db_session):
        with pytest.raises(ValueError, match="boom"):
            async with ingestion_run(db_session, "kev"):
                raise ValueError("boom")

        result = await db_session.execute(select(IngestionLog).where(IngestionLog.source == "kev"))
        log = result.scalar_one()
        assert log.status == "failed"
        assert "boom" in log.error_message

    async def test_database_error_still_records_failure(self, db_session):
        """An aborted transaction must not leave the log stuck in 'running'."""
        with pytest.raises(Exception):
            async with ingestion_run(db_session, "nvd") as ctx:
                ctx["processed"] = 42
                await db_session.execute(text("SELECT 1/0"))

        db_session.expire_all()
        result = await db_session.execute(select(IngestionLog).where(IngestionLog.source == "nvd"))
        log = result.scalar_one()
        assert log.status == "failed"
        assert "division by zero" in log.error_message
        assert log.records_processed == 42
        assert log.finished_at is not None

    async def test_cancellation_sets_cancelled(self, db_session):
        with pytest.raises(asyncio.CancelledError):
            async with ingestion_run(db_session, "nvd"):
                raise asyncio.CancelledError()

        result = await db_session.execute(select(IngestionLog).where(IngestionLog.source == "nvd"))
        log = result.scalar_one()
        assert log.status == "cancelled"

    async def test_pending_log_resumed(self, db_session):
        pending = await create_pending_log(db_session, "epss")
        async with ingestion_run(db_session, "epss", log_id=pending.id) as ctx:
            ctx["processed"] = 50

        result = await db_session.execute(select(IngestionLog).where(IngestionLog.id == pending.id))
        log = result.scalar_one()
        assert log.status == "success"
        assert log.records_processed == 50

    async def test_finished_at_is_set(self, db_session):
        async with ingestion_run(db_session, "kev"):
            pass
        result = await db_session.execute(select(IngestionLog).where(IngestionLog.source == "kev"))
        log = result.scalar_one()
        assert log.finished_at is not None


class TestCreatePendingLog:
    async def test_creates_with_pending_status(self, db_session):
        log = await create_pending_log(db_session, "nvd", trigger_type="scheduled")
        assert log.status == "pending"
        assert log.source == "nvd"
        assert log.trigger_type == "scheduled"
        assert log.id is not None


class TestCleanupStaleLogs:
    async def test_marks_running_as_failed(self, db_session, log_factory):
        log = log_factory(source="nvd", status="running")
        db_session.add(log)
        await db_session.commit()
        log_id = log.id

        count = await cleanup_stale_ingestion_logs(db_session)
        assert count == 1
        db_session.expire_all()
        result = await db_session.execute(select(IngestionLog).where(IngestionLog.id == log_id))
        updated = result.scalar_one()
        assert updated.status == "failed"
        assert "restarted" in updated.error_message

    async def test_leaves_success_intact(self, db_session, log_factory):
        log = log_factory(source="nvd", status="success")
        db_session.add(log)
        await db_session.commit()
        count = await cleanup_stale_ingestion_logs(db_session)
        assert count == 0


class TestCancelStaleLogs:
    async def test_cancels_matching_source(self, db_session, log_factory):
        log = log_factory(source="kev", status="running")
        db_session.add(log)
        await db_session.commit()
        count = await cancel_stale_logs(db_session, ["kev"])
        assert count == 1

    async def test_does_not_cancel_other_sources(self, db_session, log_factory):
        log = log_factory(source="nvd", status="running")
        db_session.add(log)
        await db_session.commit()
        count = await cancel_stale_logs(db_session, ["kev"])
        assert count == 0


class TestUpdateProgress:
    async def test_progress_updated(self, db_session):
        async with ingestion_run(db_session, "kev") as ctx:
            log_id = ctx["log"].id
            await update_progress(db_session, ctx["log"], 45.0)
            db_session.expire_all()
            result = await db_session.execute(
                select(IngestionLog).where(IngestionLog.id == log_id)
            )
            log = result.scalar_one()
            assert log.progress == pytest.approx(45.0)

    async def test_progress_capped_at_100(self, db_session):
        async with ingestion_run(db_session, "kev") as ctx:
            await update_progress(db_session, ctx["log"], 150.0)
            assert ctx["log"].progress == pytest.approx(100.0)


class TestGetLatestIngestionStatus:
    async def test_returns_one_per_source(self, db_session, log_factory):
        logs = [
            log_factory(source="nvd", status="success"),
            log_factory(source="nvd", status="failed"),
            log_factory(source="kev", status="success"),
        ]
        for log in logs:
            db_session.add(log)
        await db_session.commit()

        result = await get_latest_ingestion_status(db_session)
        sources = [r.source for r in result]
        assert len(sources) == len(set(sources))  # one per source
        assert "nvd" in sources
        assert "kev" in sources


class TestGetIngestionLogs:
    async def test_pagination(self, db_session, log_factory):
        for i in range(5):
            db_session.add(log_factory(source="nvd"))
        await db_session.commit()
        _, total = await get_ingestion_logs(db_session, per_page=100)
        assert total == 5

    async def test_filter_by_source(self, db_session, log_factory):
        db_session.add(log_factory(source="nvd"))
        db_session.add(log_factory(source="kev"))
        await db_session.commit()
        _, total = await get_ingestion_logs(db_session, source="nvd")
        assert total == 1
