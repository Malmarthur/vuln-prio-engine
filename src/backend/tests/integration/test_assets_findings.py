from sqlalchemy import select

from app.models.asset import AssetComponent, AssetScore, Finding, FindingScore, VulnerabilityProduct
from app.services.asset_service import import_cyclonedx_asset
from app.services.asset_service import compute_asset_scores
from app.services.finding_service import compute_finding_scores, get_finding_scoring_profile, run_matching
from app.services.vulnerability_service import set_setting, sync_vulnerability_products_from_records


def _cyclonedx_payload():
    return {
        "bomFormat": "CycloneDX",
        "specVersion": "1.6",
        "serialNumber": "urn:uuid:test-asset-1",
        "metadata": {
            "component": {
                "bom-ref": "prod-web-01",
                "name": "prod-web-01",
                "type": "application",
                "properties": [
                    {"name": "vulnprio:internet_exposure", "value": "internet"},
                    {"name": "vulnprio:business_criticality", "value": "critical"},
                    {"name": "vulnprio:patch_complexity", "value": "high"},
                ],
            }
        },
        "components": [
            {
                "bom-ref": "openssl",
                "type": "library",
                "name": "OpenSSL",
                "version": "1.1.1",
                "cpe": "cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*",
            }
        ],
    }


def _windows_payload(cpe: str, version: str | None = None):
    component = {
        "bom-ref": "windows",
        "type": "operating-system",
        "name": "Microsoft Windows",
        "cpe": cpe,
    }
    if version:
        component["version"] = version
    return {
        "bomFormat": "CycloneDX",
        "specVersion": "1.6",
        "serialNumber": f"urn:uuid:{cpe}",
        "metadata": {
            "component": {
                "bom-ref": cpe,
                "name": "windows-test-host",
                "type": "device",
            }
        },
        "components": [component],
    }


async def test_import_cyclonedx_asset_replaces_components(db_session):
    asset, count = await import_cyclonedx_asset(db_session, _cyclonedx_payload())
    assert asset.name == "prod-web-01"
    assert count == 1

    payload = _cyclonedx_payload()
    payload["components"] = []
    asset, count = await import_cyclonedx_asset(db_session, payload)
    assert count == 0

    component_count = (await db_session.execute(select(AssetComponent))).scalars().all()
    assert component_count == []


async def test_product_sync_matching_and_finding_scoring(db_session, vuln_factory):
    vuln = vuln_factory(
        cve_id="CVE-2024-99999",
        cvss_v31_score=9.8,
        cvss_v31_severity="CRITICAL",
        affected_products=[
            {
                "cpe": "cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*:*",
                "version_start": "1.1.0",
                "version_start_including": True,
                "version_end": "1.1.2",
                "version_end_including": False,
            }
        ],
    )
    db_session.add(vuln)
    await db_session.commit()

    product_count = await sync_vulnerability_products_from_records(
        db_session,
        [{"cve_id": vuln.cve_id, "affected_products": vuln.affected_products}],
    )
    assert product_count == 1
    assert (await db_session.execute(select(VulnerabilityProduct))).scalar_one().cpe_product == "openssl"

    # NVD repeats identical cpeMatch entries across configuration nodes.
    duplicated = vuln.affected_products + vuln.affected_products
    product_count = await sync_vulnerability_products_from_records(
        db_session,
        [{"cve_id": vuln.cve_id, "affected_products": duplicated}],
    )
    assert product_count == 1

    await import_cyclonedx_asset(db_session, _cyclonedx_payload())
    match_result = await run_matching(db_session)
    assert match_result["findings_matched"] == 1
    assert (await db_session.execute(select(Finding))).scalar_one().match_type == "version_range"

    match_result = await run_matching(db_session)
    assert match_result["findings_matched"] == 1
    assert len((await db_session.execute(select(Finding))).scalars().all()) == 1

    rows, distribution = await compute_finding_scores(db_session)
    assert rows == 1
    assert distribution
    assert (await db_session.execute(select(FindingScore))).scalar_one().priority_level in {"P0", "P1"}
    assert (await db_session.execute(select(AssetScore))).scalar_one().priority_level in {"A0", "A1"}


async def test_asset_scoring_orders_contextual_priority(db_session):
    high_payload = _cyclonedx_payload()
    low_payload = _cyclonedx_payload()
    low_payload["serialNumber"] = "urn:uuid:test-asset-2"
    low_payload["metadata"]["component"]["bom-ref"] = "dev-web-01"
    low_payload["metadata"]["component"]["name"] = "dev-web-01"
    low_payload["metadata"]["component"]["properties"] = [
        {"name": "vulnprio:internet_exposure", "value": "isolated"},
        {"name": "vulnprio:business_criticality", "value": "low"},
        {"name": "vulnprio:patch_complexity", "value": "low"},
    ]

    high_asset, _ = await import_cyclonedx_asset(db_session, high_payload)
    low_asset, _ = await import_cyclonedx_asset(db_session, low_payload)

    rows, distribution = await compute_asset_scores(db_session)
    assert rows == 2
    assert distribution

    scores = {
        row.asset_id: row
        for row in (await db_session.execute(select(AssetScore))).scalars().all()
    }
    assert float(scores[high_asset.id].priority_score) > float(scores[low_asset.id].priority_score)
    assert scores[high_asset.id].priority_level in {"A0", "A1"}
    assert scores[low_asset.id].priority_level in {"A2", "A3"}


async def test_legacy_finding_setting_is_retained_but_no_longer_read(db_session):
    await set_setting(
        db_session,
        "finding_scoring_profile",
        {
            "thresholds": {"V0": 80, "V1": 55, "V2": 30, "V3": 0},
            "weights": {
                "vulnerability_priority": 60,
                "internet_exposure": 15,
                "business_criticality": 20,
                "patch_complexity": 5,
            },
            "values": {
                "internet_exposure": {"internet": 100, "internal": 45, "isolated": 10, "unknown": 65},
                "business_criticality": {"critical": 100, "high": 75, "medium": 45, "low": 15, "unknown": 65},
                "patch_complexity": {"high": 100, "medium": 55, "low": 20, "unknown": 65},
            },
        },
    )

    profile = await get_finding_scoring_profile(db_session)
    assert profile.thresholds.P0 == 76
    assert profile.weights.vulnerability_priority == 50
    assert profile.weights.asset_priority == 50


async def test_windows_product_alias_matches_client_not_server(db_session, vuln_factory):
    client_vuln = vuln_factory(
        cve_id="CVE-2025-11001",
        affected_products=[{"cpe": "cpe:2.3:o:microsoft:windows_11:*:*:*:*:*:*:*:*"}],
    )
    server_vuln = vuln_factory(
        cve_id="CVE-2025-11002",
        affected_products=[{"cpe": "cpe:2.3:o:microsoft:windows_server_2019:*:*:*:*:*:*:*:*"}],
    )
    db_session.add_all([client_vuln, server_vuln])
    await db_session.commit()
    await sync_vulnerability_products_from_records(
        db_session,
        [
            {"cve_id": client_vuln.cve_id, "affected_products": client_vuln.affected_products},
            {"cve_id": server_vuln.cve_id, "affected_products": server_vuln.affected_products},
        ],
    )

    await import_cyclonedx_asset(db_session, _windows_payload("cpe:2.3:o:microsoft:windows 11:*:*:*:*:*:*:*:*"))
    match_result = await run_matching(db_session)

    assert match_result["findings_matched"] == 1
    finding = (await db_session.execute(select(Finding))).scalar_one()
    assert finding.match_type == "product_wildcard"
    assert finding.vulnerability_id == client_vuln.id


async def test_windows_product_alias_with_normalized_build_range(db_session, vuln_factory):
    vuln = vuln_factory(
        cve_id="CVE-2025-11003",
        affected_products=[
            {
                "cpe": "cpe:2.3:o:microsoft:windows_10_22h2:*:*:*:*:*:*:*:*",
                "version_end": "10.0.19045.0",
                "version_end_including": True,
            }
        ],
    )
    db_session.add(vuln)
    await db_session.commit()
    await sync_vulnerability_products_from_records(
        db_session,
        [{"cve_id": vuln.cve_id, "affected_products": vuln.affected_products}],
    )

    await import_cyclonedx_asset(
        db_session,
        _windows_payload("cpe:2.3:o:microsoft:windows 10 22h2:10.0.19045:*:*:*:*:*:*:*"),
    )
    match_result = await run_matching(db_session)

    assert match_result["findings_matched"] == 1
    finding = (await db_session.execute(select(Finding))).scalar_one()
    assert finding.match_type == "normalized_version_range"
    assert float(finding.match_confidence) == 90.0
