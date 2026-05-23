"""Unit tests for normalize_kev."""
from __future__ import annotations

import json
from datetime import date

import pytest

from app.ingestion.aggregator import normalize_kev


class TestNormalizeKev:
    def test_basic_fields(self, kev_raw_entry):
        df = normalize_kev([kev_raw_entry])
        row = df.row(0, named=True)
        assert row["cve_id"] == "CVE-2024-12345"
        assert row["kev_known_exploited"] is True

    def test_date_fields(self, kev_raw_entry):
        row = normalize_kev([kev_raw_entry]).row(0, named=True)
        assert row["kev_date_added"] == date(2024, 6, 20)
        assert row["kev_due_date"] == date(2024, 7, 10)

    def test_ransomware_known(self, kev_raw_entry):
        row = normalize_kev([kev_raw_entry]).row(0, named=True)
        assert row["kev_ransomware_use"] is True

    def test_ransomware_unknown(self):
        entry = {"cveID": "CVE-2024-11111", "knownRansomwareCampaignUse": "Unknown",
                 "dateAdded": "2024-01-01", "shortDescription": "x"}
        row = normalize_kev([entry]).row(0, named=True)
        assert row["kev_ransomware_use"] is False

    def test_summary_from_short_description(self, kev_raw_entry):
        row = normalize_kev([kev_raw_entry]).row(0, named=True)
        assert row["summary"] == "FooBar Widget allows remote code execution"

    def test_sources_raw_has_kev_key(self, kev_raw_entry):
        row = normalize_kev([kev_raw_entry]).row(0, named=True)
        raw = json.loads(row["sources_raw"])
        assert "kev" in raw
        assert raw["kev"]["cveID"] == "CVE-2024-12345"

    def test_empty_notes_is_null(self, kev_raw_entry):
        # notes="" should become None
        row = normalize_kev([kev_raw_entry]).row(0, named=True)
        assert row["kev_notes"] is None

    def test_missing_cve_id_skipped(self):
        entry = {"vendorProject": "Foo", "dateAdded": "2024-01-01", "shortDescription": "bar"}
        assert normalize_kev([entry]).is_empty()

    def test_empty_input(self):
        assert normalize_kev([]).is_empty()

    def test_multiple_entries(self):
        entries = [
            {"cveID": f"CVE-2024-{i:05d}", "dateAdded": "2024-01-01",
             "knownRansomwareCampaignUse": "Unknown", "shortDescription": f"desc {i}"}
            for i in range(3)
        ]
        df = normalize_kev(entries)
        assert len(df) == 3
