"""API tests for /api/v1/scoring."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.api

BASE = "/api/v1/scoring"

_VALID_PROFILE = {
    "columns": {
        "cvss_v31_score": {
            "enabled": True,
            "weight": 100,
            "type": "numeric",
            "range": [0, 10],
            "default_value": 50,
        }
    },
    "thresholds": {"V0": 76, "V1": 51, "V2": 26, "V3": 0},
}

_INVALID_PROFILE = {
    "columns": {
        "not_a_real_column": {
            "enabled": True,
            "weight": 100,
            "type": "numeric",
        }
    },
    "thresholds": {"V0": 76, "V1": 51, "V2": 26, "V3": 0},
}


class TestScoringProfileApi:
    async def test_get_default_profile(self, client):
        response = await client.get(f"{BASE}/profile")
        assert response.status_code == 200
        data = response.json()
        assert "columns" in data
        assert "thresholds" in data

    async def test_update_profile(self, client):
        response = await client.put(f"{BASE}/profile", json=_VALID_PROFILE)
        assert response.status_code == 200
        data = response.json()
        assert "cvss_v31_score" in data["columns"]

    async def test_update_invalid_profile_returns_422(self, client):
        response = await client.put(f"{BASE}/profile", json=_INVALID_PROFILE)
        assert response.status_code == 422

    async def test_reset_profile_returns_default(self, client):
        # First set a custom profile
        await client.put(f"{BASE}/profile", json=_VALID_PROFILE)
        # Then reset
        response = await client.delete(f"{BASE}/profile")
        assert response.status_code == 200
        data = response.json()
        # Default profile has cvss_v40_score
        assert "cvss_v40_score" in data["columns"]


class TestScoringRun:
    async def test_run_empty_db(self, client):
        response = await client.post(f"{BASE}/run")
        assert response.status_code == 200
        data = response.json()
        assert data["rows_updated"] == 0

    async def test_run_with_data(self, client, db_session, vuln_factory):
        db_session.add(vuln_factory(cve_id="CVE-2024-00001", cvss_v31_score=9.0))
        await db_session.commit()

        # Use simple profile so we don't depend on full default (v40 fallback chain)
        await client.put(f"{BASE}/profile", json=_VALID_PROFILE)
        response = await client.post(f"{BASE}/run")
        assert response.status_code == 200
        data = response.json()
        assert data["rows_updated"] == 1

    async def test_run_no_enabled_columns_returns_422(self, client):
        disabled_profile = {
            "columns": {
                "cvss_v31_score": {
                    "enabled": False,
                    "weight": 100,
                    "type": "numeric",
                    "range": [0, 10],
                }
            },
            "thresholds": {"V0": 76, "V1": 51, "V2": 26, "V3": 0},
        }
        await client.put(f"{BASE}/profile", json=disabled_profile)
        response = await client.post(f"{BASE}/run")
        assert response.status_code == 422


class TestEligibleColumns:
    async def test_returns_columns_dict(self, client):
        response = await client.get(f"{BASE}/eligible-columns")
        assert response.status_code == 200
        data = response.json()
        assert "cvss_v31_score" in data
        assert "epss_score" in data


class TestColumnValues:
    async def test_eligible_column_empty_db(self, client):
        response = await client.get(f"{BASE}/column-values/cvss_v31_severity")
        assert response.status_code == 200
        data = response.json()
        assert data["column"] == "cvss_v31_severity"
        assert isinstance(data["values"], list)

    async def test_ineligible_column_returns_422(self, client):
        response = await client.get(f"{BASE}/column-values/not_a_real_column")
        assert response.status_code == 422


class TestDistribution:
    async def test_distribution_empty(self, client):
        response = await client.get(f"{BASE}/distribution")
        assert response.status_code == 200
        data = response.json()
        assert data["scored_count"] == 0
        assert data["unscored_count"] == 0
