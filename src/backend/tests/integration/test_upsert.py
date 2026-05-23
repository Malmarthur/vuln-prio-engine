"""Integration tests for upsert_vulnerabilities."""
from __future__ import annotations

import json

import polars as pl
import pytest
from sqlalchemy import select, text

from app.ingestion.aggregator import normalize_kev, normalize_nvd
from app.models.vulnerability import Vulnerability
from app.services.vulnerability_service import upsert_vulnerabilities

pytestmark = pytest.mark.integration


def _nvd_df(cve_id: str = "CVE-2024-12345") -> pl.DataFrame:
    item = {
        "cve": {
            "id": cve_id,
            "published": "2024-06-15T10:00:00.000",
            "lastModified": "2024-06-16T12:00:00.000",
            "descriptions": [{"lang": "en", "value": "A critical vulnerability. Details here."}],
            "metrics": {
                "cvssMetricV31": [{
                    "type": "Primary",
                    "cvssData": {
                        "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
                        "baseScore": 9.8,
                        "baseSeverity": "CRITICAL",
                    },
                }]
            },
            "weaknesses": [],
            "configurations": [],
            "references": [],
        }
    }
    return normalize_nvd([item])


def _kev_df(cve_id: str = "CVE-2024-12345") -> pl.DataFrame:
    entry = {
        "cveID": cve_id,
        "vendorProject": "FooBar",
        "product": "Widget",
        "vulnerabilityName": "FooBar Widget RCE",
        "dateAdded": "2024-06-20",
        "shortDescription": "FooBar Widget allows remote code execution",
        "knownRansomwareCampaignUse": "Known",
        "notes": "",
    }
    return normalize_kev([entry])


class TestUpsertVulnerabilities:
    async def test_creates_new_record(self, db_session):
        df = _nvd_df()
        total, _ = await upsert_vulnerabilities(db_session, df, "nvd")
        assert total == 1
        result = await db_session.execute(
            select(Vulnerability).where(Vulnerability.cve_id == "CVE-2024-12345")
        )
        vuln = result.scalar_one()
        assert float(vuln.cvss_v31_score) == pytest.approx(9.8)
        assert vuln.cvss_v31_severity == "CRITICAL"

    async def test_column_ownership_nvd_then_kev(self, db_session):
        # Insert NVD first (sets summary from description)
        await upsert_vulnerabilities(db_session, _nvd_df(), "nvd")
        # Insert KEV — should NOT overwrite NVD summary
        await upsert_vulnerabilities(db_session, _kev_df(), "kev")
        result = await db_session.execute(
            select(Vulnerability).where(Vulnerability.cve_id == "CVE-2024-12345")
        )
        vuln = result.scalar_one()
        # NVD summary should still be there (KEV is a fallback)
        assert vuln.summary == "A critical vulnerability"
        # KEV data should be set
        assert vuln.kev_known_exploited is True

    async def test_kev_provides_fallback_summary_when_no_nvd(self, db_session):
        await upsert_vulnerabilities(db_session, _kev_df(), "kev")
        result = await db_session.execute(
            select(Vulnerability).where(Vulnerability.cve_id == "CVE-2024-12345")
        )
        vuln = result.scalar_one()
        assert vuln.summary == "FooBar Widget allows remote code execution"

    async def test_sources_raw_merged_across_sources(self, db_session):
        await upsert_vulnerabilities(db_session, _nvd_df(), "nvd")
        await upsert_vulnerabilities(db_session, _kev_df(), "kev")
        result = await db_session.execute(
            select(Vulnerability.sources_raw).where(Vulnerability.cve_id == "CVE-2024-12345")
        )
        raw = result.scalar_one()
        assert "nvd" in raw
        assert "kev" in raw

    async def test_sources_raw_has_cve_id(self, db_session):
        await upsert_vulnerabilities(db_session, _nvd_df(), "nvd")
        result = await db_session.execute(
            select(Vulnerability.sources_raw).where(Vulnerability.cve_id == "CVE-2024-12345")
        )
        raw = result.scalar_one()
        assert raw["nvd"]["id"] == "CVE-2024-12345"

    async def test_updated_at_bumped_on_conflict(self, db_session):
        await upsert_vulnerabilities(db_session, _nvd_df(), "nvd")
        result1 = await db_session.execute(
            select(Vulnerability.updated_at).where(Vulnerability.cve_id == "CVE-2024-12345")
        )
        ts1 = result1.scalar_one()

        # Re-upsert same record
        await upsert_vulnerabilities(db_session, _nvd_df(), "nvd")
        # Need a fresh session view
        db_session.expire_all()
        result2 = await db_session.execute(
            select(Vulnerability.updated_at).where(Vulnerability.cve_id == "CVE-2024-12345")
        )
        ts2 = result2.scalar_one()
        assert ts2 >= ts1

    async def test_empty_df_returns_zero(self, db_session):
        total, _ = await upsert_vulnerabilities(db_session, pl.DataFrame(), "nvd")
        assert total == 0

    async def test_batching_large_input(self, db_session):
        """Ensure records > UPSERT_BATCH_SIZE (800) are all inserted."""
        items = [
            {
                "cve": {
                    "id": f"CVE-2024-{i:05d}",
                    "published": "2024-01-01T00:00:00.000",
                    "lastModified": "2024-01-01T00:00:00.000",
                    "descriptions": [{"lang": "en", "value": f"Vulnerability {i}. Description here."}],
                    "metrics": {},
                    "weaknesses": [],
                    "configurations": [],
                    "references": [],
                }
            }
            for i in range(850)
        ]
        df = normalize_nvd(items)
        total, _ = await upsert_vulnerabilities(db_session, df, "nvd")
        assert total == 850
        count = (await db_session.execute(text("SELECT COUNT(*) FROM vulnerabilities"))).scalar_one()
        assert count == 850

    async def test_multiple_records_in_single_call(self, db_session):
        items = [
            {
                "cve": {
                    "id": f"CVE-2024-{i:05d}",
                    "published": "2024-01-01T00:00:00.000",
                    "lastModified": "2024-01-01T00:00:00.000",
                    "descriptions": [{"lang": "en", "value": f"Vulnerability {i}."}],
                    "metrics": {},
                    "weaknesses": [],
                    "configurations": [],
                    "references": [],
                }
            }
            for i in range(3)
        ]
        df = normalize_nvd(items)
        total, _ = await upsert_vulnerabilities(db_session, df, "nvd")
        assert total == 3
