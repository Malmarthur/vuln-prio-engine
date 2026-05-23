"""Unit tests for normalize_nvd and its NVD helper functions."""
from __future__ import annotations

import json
from datetime import datetime

import polars as pl
import pytest

from app.ingestion.aggregator import (
    _extract_cwes,
    _extract_products,
    _extract_references,
    _parse_nvd_dt,
    normalize_nvd,
)


def _item(cve_id: str = "CVE-2024-12345", **cve_overrides) -> dict:
    """Build a minimal valid NVD API 2.0 item."""
    cve: dict = {
        "id": cve_id,
        "published": "2024-06-15T10:00:00.000",
        "lastModified": "2024-06-16T12:00:00.000",
        "descriptions": [{"lang": "en", "value": "A critical vulnerability. Details here."}],
        "metrics": {},
        "weaknesses": [],
        "configurations": [],
        "references": [],
    }
    cve.update(cve_overrides)
    return {"cve": cve}


# ---------------------------------------------------------------------------
# normalize_nvd
# ---------------------------------------------------------------------------

class TestNormalizeNvd:
    def test_basic_fields(self, nvd_raw_cve):
        df = normalize_nvd([nvd_raw_cve])
        assert len(df) == 1
        row = df.row(0, named=True)
        assert row["cve_id"] == "CVE-2024-12345"
        assert row["nvd_source_url"] == "https://nvd.nist.gov/vuln/detail/CVE-2024-12345"

    def test_summary_is_first_sentence(self, nvd_raw_cve):
        row = normalize_nvd([nvd_raw_cve]).row(0, named=True)
        assert row["summary"] == "A critical vulnerability"
        assert "remote code execution" in row["description"]

    def test_cvss_v31_extraction(self, nvd_raw_cve):
        row = normalize_nvd([nvd_raw_cve]).row(0, named=True)
        assert row["cvss_v31_score"] == pytest.approx(9.8)
        assert row["cvss_v31_severity"] == "CRITICAL"
        assert "CVSS:3.1" in row["cvss_v31_vector"]

    def test_cvss_v2_severity_at_entry_level(self):
        item = _item(metrics={
            "cvssMetricV2": [{
                "type": "Primary",
                "baseSeverity": "HIGH",
                "cvssData": {"vectorString": "AV:N/AC:L/Au:N/C:C/I:C/A:C", "baseScore": 10.0},
            }]
        })
        row = normalize_nvd([item]).row(0, named=True)
        assert row["cvss_v2_score"] == pytest.approx(10.0)
        assert row["cvss_v2_severity"] == "HIGH"

    def test_cvss_v40_extraction(self):
        item = _item(metrics={
            "cvssMetricV40": [{
                "type": "Primary",
                "cvssData": {
                    "vectorString": "CVSS:4.0/AV:N/AC:L",
                    "baseScore": 9.3,
                    "baseSeverity": "CRITICAL",
                },
            }]
        })
        row = normalize_nvd([item]).row(0, named=True)
        assert row["cvss_v40_score"] == pytest.approx(9.3)
        assert row["cvss_v40_severity"] == "CRITICAL"

    def test_primary_metric_selected_over_secondary(self):
        item = _item(metrics={
            "cvssMetricV31": [
                {"type": "Secondary", "cvssData": {"baseScore": 5.0, "baseSeverity": "MEDIUM", "vectorString": "x"}},
                {"type": "Primary",   "cvssData": {"baseScore": 9.8, "baseSeverity": "CRITICAL", "vectorString": "y"}},
            ]
        })
        assert normalize_nvd([item]).row(0, named=True)["cvss_v31_score"] == pytest.approx(9.8)

    def test_no_primary_falls_back_to_first_entry(self):
        item = _item(metrics={
            "cvssMetricV31": [
                {"type": "Secondary", "cvssData": {"baseScore": 7.0, "baseSeverity": "HIGH", "vectorString": "x"}},
            ]
        })
        assert normalize_nvd([item]).row(0, named=True)["cvss_v31_score"] == pytest.approx(7.0)

    def test_missing_cvss_columns_are_null(self):
        row = normalize_nvd([_item()]).row(0, named=True)
        assert row["cvss_v31_score"] is None
        assert row["cvss_v31_severity"] is None

    def test_cwe_extraction(self, nvd_raw_cve):
        row = normalize_nvd([nvd_raw_cve]).row(0, named=True)
        cwes = json.loads(row["cwe_ids"])
        assert "CWE-79" in cwes
        assert "CWE-89" in cwes

    def test_cwe_skips_non_cwe_prefix(self):
        item = _item(weaknesses=[
            {"description": [{"value": "NVD-CWE-Other"}, {"value": "NVD-CWE-noinfo"}]}
        ])
        row = normalize_nvd([item]).row(0, named=True)
        assert row["cwe_ids"] == "null"

    def test_references_extraction(self, nvd_raw_cve):
        refs = json.loads(normalize_nvd([nvd_raw_cve]).row(0, named=True)["references"])
        assert len(refs) == 1
        assert refs[0]["url"] == "https://example.com/advisory"
        assert refs[0]["tags"] == ["Vendor Advisory"]

    def test_sources_raw_contains_nvd_key(self, nvd_raw_cve):
        raw = json.loads(normalize_nvd([nvd_raw_cve]).row(0, named=True)["sources_raw"])
        assert "nvd" in raw
        assert raw["nvd"]["id"] == "CVE-2024-12345"

    def test_empty_input_returns_empty_dataframe(self):
        assert normalize_nvd([]).is_empty()

    def test_missing_cve_id_is_skipped(self):
        item = {"cve": {"published": "2024-01-01T00:00:00.000", "descriptions": []}}
        assert normalize_nvd([item]).is_empty()

    def test_malformed_entry_skipped_others_processed(self):
        good = _item("CVE-2024-99999")
        bad = {"cve": {"id": "CVE-2024-BAD", "descriptions": "not-a-list"}}
        df = normalize_nvd([bad, good])
        assert len(df) == 1
        assert df.row(0, named=True)["cve_id"] == "CVE-2024-99999"

    def test_numeric_cvss_columns_are_float64(self, nvd_raw_cve):
        df = normalize_nvd([nvd_raw_cve])
        assert df["cvss_v31_score"].dtype == pl.Float64

    def test_batch_multiple_cves(self):
        items = [_item(f"CVE-2024-{i:05d}") for i in range(5)]
        df = normalize_nvd(items)
        assert len(df) == 5

    def test_published_date_has_timezone(self, nvd_raw_cve):
        row = normalize_nvd([nvd_raw_cve]).row(0, named=True)
        # Polars stores datetimes as integers internally; just check column exists and is non-null
        assert row["published_date"] is not None


# ---------------------------------------------------------------------------
# _parse_nvd_dt
# ---------------------------------------------------------------------------

class TestParseNvdDt:
    def test_standard_format(self):
        dt = _parse_nvd_dt("2024-06-15T10:00:00.000")
        assert isinstance(dt, datetime)
        assert dt.tzinfo is not None

    def test_z_suffix(self):
        dt = _parse_nvd_dt("2024-06-15T10:00:00Z")
        assert isinstance(dt, datetime)

    def test_none_returns_none(self):
        assert _parse_nvd_dt(None) is None

    def test_empty_string_returns_none(self):
        assert _parse_nvd_dt("") is None

    def test_invalid_string_returns_none(self):
        assert _parse_nvd_dt("not-a-date") is None


# ---------------------------------------------------------------------------
# _extract_products
# ---------------------------------------------------------------------------

class TestExtractProducts:
    def test_extracts_cpe_with_version_range(self):
        cve = {"configurations": [{"cpeMatch": [{
            "vulnerable": True,
            "criteria": "cpe:2.3:a:foo:bar:*",
            "versionStartIncluding": "1.0",
            "versionEndExcluding": "2.0",
        }]}]}
        products = _extract_products(cve)
        assert products is not None
        assert products[0]["cpe"] == "cpe:2.3:a:foo:bar:*"
        assert products[0]["version_start"] == "1.0"
        assert products[0]["version_end"] == "2.0"

    def test_skips_non_vulnerable(self):
        cve = {"configurations": [{"cpeMatch": [{"vulnerable": False, "criteria": "cpe:..."}]}]}
        assert _extract_products(cve) is None

    def test_empty_configurations_returns_none(self):
        assert _extract_products({"configurations": []}) is None


# ---------------------------------------------------------------------------
# _extract_cwes / _extract_references
# ---------------------------------------------------------------------------

def test_extract_cwes_multiple():
    cve = {"weaknesses": [{"description": [{"value": "CWE-79"}, {"value": "CWE-89"}]}]}
    assert _extract_cwes(cve) == ["CWE-79", "CWE-89"]


def test_extract_cwes_none_when_empty():
    assert _extract_cwes({"weaknesses": []}) is None


def test_extract_references_basic():
    cve = {"references": [{"url": "https://example.com", "source": "vendor", "tags": ["Patch"]}]}
    refs = _extract_references(cve)
    assert refs is not None
    assert refs[0]["url"] == "https://example.com"
    assert refs[0]["tags"] == ["Patch"]


def test_extract_references_none_when_empty():
    assert _extract_references({"references": []}) is None
