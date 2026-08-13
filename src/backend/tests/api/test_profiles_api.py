import uuid

from app.models.scoring import ScoringJob, ScoringProfile, ScoringRun
from app.models.vulnerability import Vulnerability, VulnerabilityScore
from app.services.profile_service import dataset_watermark
from sqlalchemy import select


async def test_builtin_profiles_and_presets_are_seeded(client):
    profiles = (await client.get("/api/v1/scoring/profiles")).json()
    presets = (await client.get("/api/v1/scoring/presets")).json()

    assert len(profiles) == 9
    assert {item["name"] for item in presets} == {"Balanced", "Active Exploitation", "Business Impact"}
    assert sum(item["is_active"] for item in presets) == 1
    assert all(item["is_builtin"] for item in profiles)


async def test_builtin_profile_is_locked_and_cloneable(client):
    profile = (await client.get("/api/v1/scoring/profiles?stage=asset")).json()[0]
    deleted = await client.delete(f"/api/v1/scoring/profiles/{profile['id']}")
    assert deleted.status_code == 422

    clone = await client.post(
        f"/api/v1/scoring/profiles/{profile['id']}/clone",
        json={"name": f"Asset clone {uuid.uuid4()}"},
    )
    assert clone.status_code == 201
    assert clone.json()["is_builtin"] is False
    assert clone.json()["config"] == profile["config"]


async def test_preset_activation_keeps_exactly_one_active(client):
    presets = (await client.get("/api/v1/scoring/presets")).json()
    target = next(item for item in presets if item["name"] == "Business Impact")
    response = await client.post(f"/api/v1/scoring/presets/{target['id']}/activate")
    assert response.status_code == 200

    refreshed = (await client.get("/api/v1/scoring/presets")).json()
    active = [item for item in refreshed if item["is_active"]]
    assert [item["name"] for item in active] == ["Business Impact"]


async def test_compact_summary_history_and_paginated_divergences(client, db_session):
    await client.get("/api/v1/scoring/profiles")
    profiles = list((await db_session.execute(
        select(ScoringProfile).where(ScoringProfile.stage == "vulnerability").order_by(ScoringProfile.name)
    )).scalars())
    baseline, candidate = profiles[:2]
    first = Vulnerability(cve_id="CVE-2026-0001", summary="First")
    second = Vulnerability(cve_id="CVE-2026-0002", summary="Second")
    db_session.add_all([first, second])
    await db_session.flush()
    watermark = await dataset_watermark(db_session)
    job = ScoringJob(
        kind="comparison",
        scope="vulnerability",
        status="completed",
        progress=100,
        progress_detail={"phase": "completed", "completed_targets": 2, "total_targets": 2},
        request={
            "baseline_id": str(baseline.id),
            "candidate_ids": [str(candidate.id)],
            "target_ids": [str(baseline.id), str(candidate.id)],
        },
    )
    db_session.add(job)
    await db_session.flush()
    baseline_run = ScoringRun(
        job_id=job.id, scope="vulnerability", target_id=baseline.id,
        profile_revisions={str(baseline.id): baseline.revision},
        dataset_watermark_before=watermark, dataset_watermark_after=watermark,
        rows_scored=2, distribution={"V0": 1, "V1": 1}, status="completed",
    )
    candidate_run = ScoringRun(
        job_id=job.id, scope="vulnerability", target_id=candidate.id,
        profile_revisions={str(candidate.id): candidate.revision},
        dataset_watermark_before=watermark, dataset_watermark_after=watermark,
        rows_scored=2, distribution={"V0": 2}, status="completed",
    )
    db_session.add_all([baseline_run, candidate_run])
    await db_session.flush()
    db_session.add_all([
        VulnerabilityScore(vulnerability_id=first.id, vulnerability_profile_id=baseline.id, priority_score=90, priority_confidence=90, priority_level="V0", profile_revision=1, scoring_run_id=baseline_run.id),
        VulnerabilityScore(vulnerability_id=second.id, vulnerability_profile_id=baseline.id, priority_score=70, priority_confidence=80, priority_level="V1", profile_revision=1, scoring_run_id=baseline_run.id),
        VulnerabilityScore(vulnerability_id=first.id, vulnerability_profile_id=candidate.id, priority_score=80, priority_confidence=90, priority_level="V0", profile_revision=1, scoring_run_id=candidate_run.id),
        VulnerabilityScore(vulnerability_id=second.id, vulnerability_profile_id=candidate.id, priority_score=95, priority_confidence=80, priority_level="V0", profile_revision=1, scoring_run_id=candidate_run.id),
    ])
    job.result_summary = {
        "baseline": {"id": str(baseline.id), "name": baseline.name, "description": baseline.description, "revision": 1, "profile_revisions": {str(baseline.id): 1}, "distribution": {"V0": 1, "V1": 1}},
        "candidates": [{"id": str(candidate.id), "name": candidate.name, "description": candidate.description, "revision": 1, "profile_revisions": {str(candidate.id): 1}, "distribution": {"V0": 2}, "transition_matrix": {"V0": {"V0": 1}, "V1": {"V0": 1}}, "promoted": 1, "demoted": 1, "unchanged": 0, "mean_score_delta": 7.5, "median_score_delta": 7.5, "spearman_rank_correlation": -1}],
        "dataset_watermark": watermark,
    }
    await db_session.commit()

    summary = await client.get(f"/api/v1/scoring/comparisons/{job.id}/summary")
    assert summary.status_code == 200
    assert summary.json()["details_available"] is True
    assert summary.json()["candidates"][0]["promoted"] == 1

    history = await client.get("/api/v1/scoring/comparisons")
    assert history.status_code == 200
    assert history.json()[0]["baseline_name"] == baseline.name

    page = await client.get(
        f"/api/v1/scoring/comparisons/{job.id}/items",
        params={"candidate_id": str(candidate.id), "movement": "promoted", "per_page": 1},
    )
    assert page.status_code == 200
    assert page.json()["total"] == 1
    assert page.json()["items"][0]["label"] == "CVE-2026-0002"
    assert page.json()["items"][0]["rank_delta"] == 1
