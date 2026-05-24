from sqlalchemy import select

from app.models.asset import Finding
from app.services.vulnerability_service import sync_vulnerability_products_from_records


def _payload():
    return {
        "bomFormat": "CycloneDX",
        "specVersion": "1.6",
        "serialNumber": "urn:uuid:api-asset",
        "metadata": {
            "component": {
                "name": "api-web",
                "properties": [
                    {"name": "vulnprio:internet_exposure", "value": "internet"},
                    {"name": "vulnprio:business_criticality", "value": "high"},
                    {"name": "vulnprio:patch_complexity", "value": "medium"},
                ],
            }
        },
        "components": [
            {
                "name": "nginx",
                "version": "1.25.0",
                "cpe": "cpe:2.3:a:nginx:nginx:1.25.0:*:*:*:*:*:*:*",
            }
        ],
    }


async def test_assets_import_list_and_stats(client):
    res = await client.post("/api/v1/assets/import/cyclonedx", json=_payload())
    assert res.status_code == 200
    data = res.json()
    assert data["component_count"] == 1
    assert data["asset"]["internet_exposure"] == "internet"

    res = await client.get("/api/v1/assets")
    assert res.status_code == 200
    assert res.json()["total"] == 1

    res = await client.get("/api/v1/assets/stats")
    assert res.status_code == 200
    assert res.json()["components_with_cpe"] == 1


async def test_findings_match_and_score_endpoints(client, db_session, vuln_factory):
    vuln = vuln_factory(
        cve_id="CVE-2025-00001",
        cvss_v31_score=9.0,
        cvss_v31_severity="CRITICAL",
        affected_products=[{"cpe": "cpe:2.3:a:nginx:nginx:1.25.0:*:*:*:*:*:*:*"}],
    )
    db_session.add(vuln)
    await db_session.commit()
    await sync_vulnerability_products_from_records(
        db_session,
        [{"cve_id": vuln.cve_id, "affected_products": vuln.affected_products}],
    )

    res = await client.post("/api/v1/assets/import/cyclonedx", json=_payload())
    assert res.status_code == 200

    res = await client.post("/api/v1/findings/match/run")
    assert res.status_code == 200
    assert res.json()["findings_matched"] == 1
    assert (await db_session.execute(select(Finding))).scalar_one().match_type == "exact_version"

    res = await client.post("/api/v1/findings/scoring/run")
    assert res.status_code == 200
    assert res.json()["rows_updated"] == 1

    res = await client.get("/api/v1/findings")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["vulnerability"]["cve_id"] == "CVE-2025-00001"
    assert item["component"]["cpe"] == "cpe:2.3:a:nginx:nginx:1.25.0:*:*:*:*:*:*:*"
    assert item["component"]["cpe_vendor"] == "nginx"
    assert item["component"]["cpe_product"] == "nginx"
    assert item["component"]["cpe_version"] == "1.25.0"

    res = await client.get("/api/v1/findings/stats")
    assert res.status_code == 200
    assert res.json()["total_findings"] == 1


async def test_finding_scoring_profile_crud(client):
    res = await client.get("/api/v1/findings/scoring/profile")
    assert res.status_code == 200
    default_profile = res.json()
    assert default_profile["weights"]["vulnerability_priority"] == 50

    custom_profile = {
        "thresholds": {"P0": 80, "P1": 55, "P2": 30, "P3": 0},
        "weights": {
            "vulnerability_priority": 60,
            "internet_exposure": 15,
            "business_criticality": 20,
            "patch_complexity": 5,
        },
        "values": default_profile["values"],
    }
    res = await client.put("/api/v1/findings/scoring/profile", json=custom_profile)
    assert res.status_code == 200
    assert res.json()["weights"]["vulnerability_priority"] == 60

    res = await client.get("/api/v1/findings/scoring/profile")
    assert res.status_code == 200
    assert res.json()["thresholds"]["P0"] == 80

    res = await client.delete("/api/v1/findings/scoring/profile")
    assert res.status_code == 200
    assert res.json()["weights"]["vulnerability_priority"] == 50


async def test_finding_scoring_profile_validation(client):
    res = await client.put(
        "/api/v1/findings/scoring/profile",
        json={
            "thresholds": {"P0": 80, "P1": 55, "P2": 30, "P3": 0},
            "weights": {
                "vulnerability_priority": 0,
                "internet_exposure": 0,
                "business_criticality": 0,
                "patch_complexity": 0,
            },
            "values": {
                "internet_exposure": {"internet": 100, "internal": 45, "isolated": 10, "unknown": 65},
                "business_criticality": {"critical": 100, "high": 75, "medium": 45, "low": 15, "unknown": 65},
                "patch_complexity": {"high": 100, "medium": 55, "low": 20, "unknown": 65},
            },
        },
    )
    assert res.status_code == 422

    res = await client.put(
        "/api/v1/findings/scoring/profile",
        json={
            "thresholds": {"P0": 80, "P1": 55, "P2": 30, "P3": 0},
            "weights": {
                "vulnerability_priority": 60,
                "internet_exposure": 15,
                "business_criticality": 20,
                "patch_complexity": 5,
            },
            "values": {
                "internet_exposure": {"internet": 101, "internal": 45, "isolated": 10, "unknown": 65},
                "business_criticality": {"critical": 100, "high": 75, "medium": 45, "low": 15, "unknown": 65},
                "patch_complexity": {"high": 100, "medium": 55, "low": 20, "unknown": 65},
            },
        },
    )
    assert res.status_code == 422
