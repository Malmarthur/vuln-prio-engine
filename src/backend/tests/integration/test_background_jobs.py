"""Background jobs: matching with progress, cancellation, activity feed."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Finding, FindingScore
from app.models.vulnerability import VulnerabilityScore
from app.services import finding_service, profile_service, scoring_service
from app.models.ingestion_log import IngestionLog
from app.models.scoring import ScoringJob
from app.services.asset_service import import_cyclonedx_asset
from app.services.finding_service import LAST_MATCHED_SETTING
from app.services.profile_service import ensure_builtin_profiles, get_active_preset, run_job
from app.services.vulnerability_service import get_setting, sync_vulnerability_products_from_records

pytestmark = pytest.mark.integration


def _payload():
    return {
        "bomFormat": "CycloneDX",
        "specVersion": "1.6",
        "serialNumber": "urn:uuid:job-asset",
        "metadata": {"component": {"name": "job-web", "properties": [{"name": "vulnprio:internet_exposure", "value": "internet"}]}},
        "components": [{"name": "nginx", "version": "1.25.0", "cpe": "cpe:2.3:a:nginx:nginx:1.25.0:*:*:*:*:*:*:*"}],
    }


async def _seed(db_session, vuln_factory):
    await ensure_builtin_profiles(db_session)
    vuln = vuln_factory(cve_id="CVE-2025-10001", cvss_v31_score=9.8, affected_products=[{"cpe": "cpe:2.3:a:nginx:nginx:1.25.0:*:*:*:*:*:*:*"}])
    db_session.add(vuln)
    await db_session.commit()
    await sync_vulnerability_products_from_records(db_session, [{"cve_id": vuln.cve_id, "affected_products": vuln.affected_products}])
    await import_cyclonedx_asset(db_session, _payload())


async def _queue(db_session, **request) -> ScoringJob:
    job = ScoringJob(kind="matching", scope="finding", status="pending", progress=0, progress_detail={}, request=request)
    db_session.add(job)
    await db_session.commit()
    return job


async def test_matching_job_reports_progress_and_scores(db_session, vuln_factory):
    await _seed(db_session, vuln_factory)
    job = await _queue(db_session, score_after=True)

    await run_job(db_session, job)

    await db_session.refresh(job)
    assert job.status == "completed"
    assert float(job.progress) == 100
    assert job.progress_detail["phase"] == "completed"
    assert job.result_summary["findings_matched"] == 1
    assert job.result_summary["rows_scored"] == 1
    assert (await db_session.execute(select(func.count(Finding.id)))).scalar_one() == 1
    assert (await db_session.execute(select(func.count(FindingScore.finding_id)))).scalar_one() == 1
    assert await get_setting(db_session, LAST_MATCHED_SETTING) is not None


async def test_matching_job_honours_cancellation(db_session, vuln_factory):
    await _seed(db_session, vuln_factory)
    job = await _queue(db_session, score_after=False)
    job.cancel_requested = True
    await db_session.commit()

    await run_job(db_session, job)

    await db_session.refresh(job)
    assert job.status == "cancelled"
    assert job.finished_at is not None
    assert await get_setting(db_session, LAST_MATCHED_SETTING) is None


async def _queue_preset_run(db_session) -> ScoringJob:
    preset, _ = await get_active_preset(db_session)
    job = ScoringJob(kind="run", scope="preset", status="pending", progress=0, progress_detail={}, request={"target_ids": [str(preset.id)]})
    db_session.add(job)
    await db_session.commit()
    return job


async def test_scoring_job_reports_progress_while_writing(db_session, vuln_factory, monkeypatch):
    await _seed(db_session, vuln_factory)
    db_session.add(vuln_factory(cve_id="CVE-2025-10002", cvss_v31_score=5.0))
    await db_session.commit()
    await run_job(db_session, await _queue(db_session, score_after=False))
    monkeypatch.setattr(scoring_service, "SCORE_COPY_BATCH_SIZE", 1)
    monkeypatch.setattr(finding_service, "FINDING_SCORE_BATCH_SIZE", 1)
    reported: list[tuple[float, str]] = []
    original = profile_service._report_progress

    async def spy(session, job, progress, detail):
        reported.append((progress, detail.get("label", "")))
        await original(session, job, progress, detail)

    monkeypatch.setattr(profile_service, "_report_progress", spy)
    job = await _queue_preset_run(db_session)

    await run_job(db_session, job)

    await db_session.refresh(job)
    assert job.status == "completed"
    percents = [pct for pct, _ in reported]
    assert percents == sorted(percents)
    assert [label for _, label in reported if label.startswith("Writing vulnerability scores")] == [
        "Writing vulnerability scores (0/2)", "Writing vulnerability scores (1/2)",
    ]
    assert any(label.startswith("Scoring findings (0/1)") for _, label in reported)
    assert any(0 < pct < 100 for pct in percents)


async def test_cancel_during_score_write_rolls_back(db_session, vuln_factory, monkeypatch):
    await _seed(db_session, vuln_factory)
    db_session.add(vuln_factory(cve_id="CVE-2025-10002", cvss_v31_score=5.0))
    await db_session.commit()
    monkeypatch.setattr(scoring_service, "SCORE_COPY_BATCH_SIZE", 1)
    job = await _queue_preset_run(db_session)
    original = profile_service._report_progress

    async def cancel_on_second_batch(session, job, progress, detail):
        if detail.get("label", "").startswith("Writing vulnerability scores (1/"):
            # As the cancel endpoint does: from another session.
            async with AsyncSession(db_session.bind) as other:
                await other.execute(update(ScoringJob).where(ScoringJob.id == job.id).values(cancel_requested=True))
                await other.commit()
        await original(session, job, progress, detail)

    monkeypatch.setattr(profile_service, "_report_progress", cancel_on_second_batch)

    await run_job(db_session, job)

    await db_session.refresh(job)
    assert job.status == "cancelled"
    # The first COPY batch was already sent: it must be rolled back with the rest.
    assert (await db_session.execute(select(func.count()).select_from(VulnerabilityScore))).scalar_one() == 0


async def test_matching_job_conflict_and_activity_feed(client, db_session):
    running = ScoringJob(kind="matching", scope="finding", status="running", progress=42, progress_detail={"phase": "saving", "label": "Saving findings"}, request={"score_after": True})
    old = ScoringJob(kind="run", scope="preset", status="completed", progress=100, progress_detail={}, request={}, finished_at=datetime.now(timezone.utc) - timedelta(hours=1))
    recent = ScoringJob(kind="run", scope="vulnerability", status="failed", progress=10, progress_detail={}, request={}, error="boom", finished_at=datetime.now(timezone.utc))
    db_session.add_all([running, old, recent, IngestionLog(source="nvd", status="running", progress=55.0, started_at=datetime.now(timezone.utc))])
    await db_session.commit()

    res = await client.post("/api/v1/findings/match/jobs", json={"score_after": True})
    assert res.status_code == 409

    body = (await client.get("/api/v1/tasks")).json()
    jobs = {job["id"]: job for job in body["jobs"]}
    assert str(old.id) not in jobs
    assert jobs[str(running.id)]["title"] == "Matching & scoring findings"
    assert jobs[str(running.id)]["progress"] == 42
    assert jobs[str(recent.id)]["title"] == "Scoring vulnerabilities"
    assert jobs[str(recent.id)]["error"] == "boom"
    assert body["ingestions"][0]["source"] == "nvd"
    assert body["ingestions"][0]["progress"] == 55.0
