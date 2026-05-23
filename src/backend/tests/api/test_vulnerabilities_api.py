"""API tests for /api/v1/vulnerabilities."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.api

BASE = "/api/v1/vulnerabilities"


class TestListVulnerabilities:
    async def test_empty_db(self, client):
        response = await client.get(BASE)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["items"] == []

    async def test_returns_records(self, client, db_session, vuln_factory):
        db_session.add(vuln_factory(cve_id="CVE-2024-00001"))
        await db_session.commit()
        response = await client.get(BASE)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["cve_id"] == "CVE-2024-00001"

    async def test_pagination_per_page(self, client, db_session, vuln_factory):
        for i in range(5):
            db_session.add(vuln_factory(cve_id=f"CVE-2024-{i:05d}"))
        await db_session.commit()
        response = await client.get(f"{BASE}?per_page=2")
        data = response.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2

    async def test_search_filter(self, client, db_session, vuln_factory):
        db_session.add(vuln_factory(cve_id="CVE-2024-00001", summary="Remote code execution"))
        db_session.add(vuln_factory(cve_id="CVE-2024-00002", summary="Directory traversal"))
        await db_session.commit()
        response = await client.get(f"{BASE}?search=Remote+code")
        data = response.json()
        assert data["total"] == 1

    async def test_severity_filter(self, client, db_session, vuln_factory):
        db_session.add(vuln_factory(cve_id="CVE-2024-00001", cvss_v31_severity="CRITICAL"))
        db_session.add(vuln_factory(cve_id="CVE-2024-00002", cvss_v31_severity="HIGH"))
        await db_session.commit()
        response = await client.get(f"{BASE}?severity=CRITICAL")
        data = response.json()
        assert data["total"] == 1

    async def test_kev_only_filter(self, client, db_session, vuln_factory):
        db_session.add(vuln_factory(cve_id="CVE-2024-00001", kev_known_exploited=True))
        db_session.add(vuln_factory(cve_id="CVE-2024-00002", kev_known_exploited=False))
        await db_session.commit()
        response = await client.get(f"{BASE}?kev_only=true")
        data = response.json()
        assert data["total"] == 1

    async def test_sort_asc(self, client, db_session, vuln_factory):
        from datetime import datetime, timezone
        db_session.add(vuln_factory(cve_id="CVE-2024-00001", published_date=datetime(2024, 1, 1, tzinfo=timezone.utc)))
        db_session.add(vuln_factory(cve_id="CVE-2024-00002", published_date=datetime(2024, 6, 1, tzinfo=timezone.utc)))
        await db_session.commit()
        response = await client.get(f"{BASE}?sort_by=published_date&sort_order=asc")
        data = response.json()
        assert data["items"][0]["cve_id"] == "CVE-2024-00001"

    async def test_invalid_sort_by_returns_422(self, client):
        response = await client.get(f"{BASE}?sort_by=invalid_column")
        assert response.status_code == 422


class TestGetVulnerability:
    async def test_found(self, client, db_session, vuln_factory):
        db_session.add(vuln_factory(cve_id="CVE-2024-99999"))
        await db_session.commit()
        response = await client.get(f"{BASE}/CVE-2024-99999")
        assert response.status_code == 200
        assert response.json()["cve_id"] == "CVE-2024-99999"

    async def test_not_found_returns_404(self, client):
        response = await client.get(f"{BASE}/CVE-9999-00000")
        assert response.status_code == 404


class TestVulnerabilityStats:
    async def test_stats_empty(self, client):
        response = await client.get(f"{BASE}/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0

    async def test_stats_with_data(self, client, db_session, vuln_factory):
        db_session.add(vuln_factory(cve_id="CVE-2024-00001", kev_known_exploited=True))
        await db_session.commit()
        response = await client.get(f"{BASE}/stats")
        data = response.json()
        assert data["total"] == 1
        assert data["kev_count"] == 1
