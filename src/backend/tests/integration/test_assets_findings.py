from sqlalchemy import select

from app.models.asset import AssetComponent, Finding, FindingScore, VulnerabilityProduct
from app.services.asset_service import import_cyclonedx_asset
from app.services.finding_service import compute_finding_scores, run_matching
from app.services.vulnerability_service import sync_vulnerability_products_from_records


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
