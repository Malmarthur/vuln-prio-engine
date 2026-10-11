"""Comparison workspace: config-change detection, filters, facets, subsets, followed items."""
import uuid

import pytest
from sqlalchemy import select

from app.models.asset import VulnerabilityProduct
from app.models.scoring import ScoringJob, ScoringPreset, ScoringProfile, ScoringRun
from app.models.vulnerability import Vulnerability, VulnerabilityScore
from app.services import profile_service
from app.services.profile_service import dataset_watermark

# label, KEV, severity, vendor, baseline score, candidate score
ROWS = [
    ("CVE-2026-1001", True, "CRITICAL", "acme", 90, 60),
    ("CVE-2026-1002", False, "HIGH", "globex", 80, 95),
    ("CVE-2026-1003", True, "MEDIUM", "acme", 40, 85),
    ("CVE-2026-1004", False, "LOW", "initech", 20, 10),
]


def level(score: float) -> str:
    return "V0" if score >= 76 else "V1" if score >= 51 else "V2" if score >= 26 else "V3"


async def _profiles(client, db_session):
    await client.get("/api/v1/scoring/profiles")
    builtin = list((await db_session.execute(
        select(ScoringProfile).where(ScoringProfile.stage == "vulnerability").order_by(ScoringProfile.name)
    )).scalars())[0]
    clone = await client.post(
        f"/api/v1/scoring/profiles/{builtin.id}/clone", json={"name": f"Candidate {uuid.uuid4()}"}
    )
    candidate = await db_session.get(ScoringProfile, uuid.UUID(clone.json()["id"]))
    return builtin, candidate


async def _vulnerability_comparison(client, db_session, subset=None):
    """A completed vulnerability comparison with real score rows."""
    baseline, candidate = await _profiles(client, db_session)
    vulns = []
    for cve, kev, severity, vendor, _, _ in ROWS:
        value = Vulnerability(cve_id=cve, summary=cve, kev_known_exploited=kev, cvss_v31_severity=severity, epss_score=0.5 if kev else 0.01)
        db_session.add(value)
        vulns.append((value, vendor))
    await db_session.flush()
    for value, vendor in vulns:
        db_session.add(VulnerabilityProduct(vulnerability_id=value.id, cve_id=value.cve_id, cpe=f"cpe:2.3:a:{vendor}:app:*:*:*:*:*:*:*:*", cpe_part="a", cpe_vendor=vendor, cpe_product="app"))
    watermark = await dataset_watermark(db_session)
    request = {"baseline_id": str(baseline.id), "candidate_ids": [str(candidate.id)], "target_ids": [str(baseline.id), str(candidate.id)]}
    if subset:
        request["subset"] = subset
    job = ScoringJob(kind="comparison", scope="vulnerability", status="completed", progress=100, progress_detail={"phase": "completed"}, request=request)
    db_session.add(job)
    await db_session.flush()
    runs = {}
    for profile, weights in ((baseline, {"epss_score": 50, "kev_known_exploited": 50}), (candidate, {"epss_score": 20, "kev_known_exploited": 80})):
        runs[profile.id] = ScoringRun(
            job_id=job.id, scope="vulnerability", target_id=profile.id,
            profile_revisions={str(profile.id): profile.revision},
            config_snapshot={"thresholds": {"V0": 76}, "columns": {key: {"enabled": True, "weight": weight, "type": "numeric"} for key, weight in weights.items()}},
            dataset_watermark_before=watermark, dataset_watermark_after=watermark,
            rows_scored=len(ROWS), distribution={}, status="completed",
        )
        db_session.add(runs[profile.id])
    await db_session.flush()
    for (value, _), (_, _, _, _, left, right) in zip(vulns, ROWS):
        for profile, score in ((baseline, left), (candidate, right)):
            db_session.add(VulnerabilityScore(
                vulnerability_id=value.id, vulnerability_profile_id=profile.id, priority_score=score,
                priority_confidence=90, priority_level=level(score), profile_revision=profile.revision,
                scoring_run_id=runs[profile.id].id,
            ))
    await db_session.commit()
    summary = await client.get(f"/api/v1/scoring/comparisons/{job.id}/summary")
    assert summary.status_code == 200
    return job, baseline, candidate, {value.cve_id: value for value, _ in vulns}, summary.json()


async def test_summary_flags_revised_profile_separately_from_data(client, db_session):
    job, _, candidate, _, summary = await _vulnerability_comparison(client, db_session)
    assert summary["is_stale"] is False and summary["changed_scenarios"] == []

    config = {**candidate.config, "thresholds": {"V0": 80, "V1": 55, "V2": 30, "V3": 0}}
    assert (await client.patch(f"/api/v1/scoring/profiles/{candidate.id}", json={"config": config})).status_code == 200

    summary = (await client.get(f"/api/v1/scoring/comparisons/{job.id}/summary")).json()
    assert summary["is_stale"] is True
    assert summary["data_changed"] is False
    changed = summary["changed_scenarios"]
    assert [item["id"] for item in changed] == [str(candidate.id)]
    assert "revised (r1 → r2)" in changed[0]["reasons"][0]
    history = (await client.get("/api/v1/scoring/comparisons")).json()
    assert history[0]["changed_scenarios"][0]["id"] == str(candidate.id)


async def test_summary_detects_preset_rewired_to_another_profile(client, db_session):
    presets = (await client.get("/api/v1/scoring/presets")).json()
    profiles = (await client.get("/api/v1/scoring/profiles?stage=asset")).json()
    source = presets[0]
    created = (await client.post("/api/v1/scoring/presets", json={
        "name": f"Custom {uuid.uuid4()}", "vulnerability_profile_id": source["vulnerability_profile_id"],
        "asset_profile_id": source["asset_profile_id"], "finding_profile_id": source["finding_profile_id"],
    })).json()
    revisions = {}
    for key in ("vulnerability_profile_id", "asset_profile_id", "finding_profile_id"):
        revisions[created[key]] = (await db_session.get(ScoringProfile, uuid.UUID(created[key]))).revision
    watermark = await dataset_watermark(db_session)
    job = ScoringJob(kind="comparison", scope="preset", status="completed", progress=100, request={
        "baseline_id": source["id"], "candidate_ids": [created["id"]], "target_ids": [source["id"], created["id"]],
    }, result_summary={
        "baseline": {"id": source["id"], "name": source["name"], "distribution": {}},
        "candidates": [{"id": created["id"], "name": created["name"], "distribution": {}}],
        "dataset_watermark": watermark,
    })
    db_session.add(job)
    await db_session.flush()
    db_session.add(ScoringRun(
        job_id=job.id, scope="preset", target_id=uuid.UUID(created["id"]), profile_revisions=revisions,
        dataset_watermark_before=watermark, dataset_watermark_after=watermark, rows_scored=0, status="completed",
    ))
    await db_session.commit()
    assert (await client.get(f"/api/v1/scoring/comparisons/{job.id}/summary")).json()["changed_scenarios"] == []

    other = next(item for item in profiles if item["id"] != created["asset_profile_id"])
    assert (await client.patch(f"/api/v1/scoring/presets/{created['id']}", json={"asset_profile_id": other["id"]})).status_code == 200
    changed = (await client.get(f"/api/v1/scoring/comparisons/{job.id}/summary")).json()["changed_scenarios"]
    assert changed[0]["name"] == created["name"]
    assert any("another asset profile" in reason for reason in changed[0]["reasons"])


async def test_items_attribute_filters_and_top_n_selection(client, db_session):
    job, _, candidate, _, summary = await _vulnerability_comparison(client, db_session)
    url = f"/api/v1/scoring/comparisons/{job.id}/items"
    base = {"candidate_id": str(candidate.id)}

    kev = (await client.get(url, params={**base, "kev": "true"})).json()
    assert {item["label"] for item in kev["items"]} == {"CVE-2026-1001", "CVE-2026-1003"}
    severity = (await client.get(url, params={**base, "severity": ["critical", "low"]})).json()
    assert {item["label"] for item in severity["items"]} == {"CVE-2026-1001", "CVE-2026-1004"}
    vendor = (await client.get(url, params={**base, "q": "globex"})).json()
    assert [item["label"] for item in vendor["items"]] == ["CVE-2026-1002"]
    # Ranks come from the whole population even when the view is filtered.
    assert vendor["items"][0]["baseline_rank"] == 2 and vendor["items"][0]["candidate_rank"] == 1

    # Reference top 1 = 1001; candidate top 1 = 1002.
    assert summary["candidates"][0]["top_n"]["10"]["overlap"] == 4
    entered = (await client.get(url, params={**base, "top_n": 1, "top_change": "entered"})).json()
    left = (await client.get(url, params={**base, "top_n": 1, "top_change": "left"})).json()
    assert [item["label"] for item in entered["items"]] == ["CVE-2026-1002"]
    assert [item["label"] for item in left["items"]] == ["CVE-2026-1001"]


async def test_facets_recompute_charts_for_filtered_slice(client, db_session):
    job, _, candidate, _, _ = await _vulnerability_comparison(client, db_session)
    facets = (await client.get(f"/api/v1/scoring/comparisons/{job.id}/facets", params={"kev": "true"})).json()
    assert facets["baseline_total"] == 2
    assert facets["baseline_distribution"] == {"V0": 1, "V2": 1}
    entry = facets["candidates"][0]
    assert entry["id"] == str(candidate.id)
    assert entry["total"] == 2
    assert entry["transition_matrix"] == {"V0": {"V1": 1}, "V2": {"V0": 1}}
    assert entry["promoted"] == 1 and entry["demoted"] == 1


async def test_subset_defines_population_and_ranks(client, db_session):
    job, _, candidate, _, summary = await _vulnerability_comparison(client, db_session, subset={"kev": True})
    assert summary["subset"]["kev"] is True
    assert sum(summary["baseline"]["distribution"].values()) == 2
    items = (await client.get(
        f"/api/v1/scoring/comparisons/{job.id}/items", params={"candidate_id": str(candidate.id), "sort": "label", "order": "asc"}
    )).json()
    assert items["total"] == 2
    ranks = {item["label"]: (item["baseline_rank"], item["candidate_rank"]) for item in items["items"]}
    assert ranks == {"CVE-2026-1001": (1, 2), "CVE-2026-1003": (2, 1)}

    preview = (await client.post("/api/v1/scoring/comparisons/subset/preview", json={"scope": "vulnerability", "subset": {"severities": ["HIGH"]}})).json()
    assert preview == {"count": 1, "total": 4}


async def test_followed_items_crud_positions_and_frozen_subset(client, db_session, monkeypatch):
    job, baseline, candidate, vulns, _ = await _vulnerability_comparison(client, db_session)
    followed_id = str(vulns["CVE-2026-1003"].id)
    added = await client.post("/api/v1/scoring/followed", json={"entity_type": "vulnerability", "entity_ids": [followed_id, followed_id]})
    assert added.json() == {"changed": 1, "total": 1}
    listed = (await client.get("/api/v1/scoring/followed", params={"entity_type": "vulnerability"})).json()
    assert [item["label"] for item in listed] == ["CVE-2026-1003"]

    positions = (await client.get(f"/api/v1/scoring/comparisons/{job.id}/followed")).json()
    assert positions["followed_total"] == 1 and positions["population_total"] == 4
    row = positions["items"][0]
    assert row["positions"][str(baseline.id)]["rank"] == 3
    assert row["positions"][str(candidate.id)]["rank"] == 2

    only = (await client.get(f"/api/v1/scoring/comparisons/{job.id}/items", params={"candidate_id": str(candidate.id), "followed_only": "true"})).json()
    assert [item["label"] for item in only["items"]] == ["CVE-2026-1003"]

    matched = await client.post(f"/api/v1/scoring/comparisons/{job.id}/followed", params={"candidate_id": str(candidate.id), "movement": "demoted"})
    assert matched.json()["total"] == 2

    async def no_execute(_job_id):
        return None
    monkeypatch.setattr(profile_service, "_execute_job", no_execute)
    created = await client.post("/api/v1/scoring/comparisons", json={
        "scope": "vulnerability", "baseline_id": str(baseline.id), "candidate_ids": [str(candidate.id)],
        "subset": {"followed_only": True},
    })
    assert created.status_code == 202
    subset = created.json()["request"]["subset"]
    assert "followed_only" not in subset and len(subset["entity_ids"]) == 2

    removed = await client.delete("/api/v1/scoring/followed", params={"entity_type": "vulnerability", "clear": "true"})
    assert removed.json() == {"changed": 2, "total": 0}
    empty = await client.post("/api/v1/scoring/comparisons", json={
        "scope": "vulnerability", "baseline_id": str(baseline.id), "candidate_ids": [str(candidate.id)],
        "subset": {"followed_only": True},
    })
    assert empty.status_code == 422


async def test_explain_returns_signals_and_weight_changes(client, db_session):
    job, _, candidate, vulns, _ = await _vulnerability_comparison(client, db_session)
    response = await client.get(
        f"/api/v1/scoring/comparisons/{job.id}/items/{vulns['CVE-2026-1001'].id}/explain",
        params={"candidate_id": str(candidate.id)},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["item"]["label"] == "CVE-2026-1001"
    signals = {item["key"]: item["value"] for item in body["signals"]}
    assert signals["kev_known_exploited"] is True and signals["severity"] == "CRITICAL"
    factors = {item["key"]: item for item in body["factors"]}
    assert factors["kev_known_exploited"]["baseline_share"] == pytest.approx(50)
    assert factors["kev_known_exploited"]["candidate_share"] == pytest.approx(80)
    assert factors["kev_known_exploited"]["changed"] is True
    assert factors["kev_known_exploited"]["label"] == "KEV Exploited"
