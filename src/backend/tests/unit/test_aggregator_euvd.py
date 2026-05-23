"""Unit tests for normalize_euvd and _extract_euvd_cve_ids."""
from __future__ import annotations

import json

import pytest

from app.ingestion.aggregator import _extract_euvd_cve_ids, normalize_euvd


class TestNormalizeEuvd:
    def test_basic_fields(self, euvd_raw_entry):
        df = normalize_euvd([euvd_raw_entry])
        row = df.row(0, named=True)
        assert row["cve_id"] == "CVE-2024-12345"
        assert row["euvd_id"] == "EUVD-2024-14346"
        assert "euvd.enisa.europa.eu" in row["euvd_source_url"]

    def test_single_cve_alias(self, euvd_raw_entry):
        df = normalize_euvd([euvd_raw_entry])
        assert len(df) == 1

    def test_comma_separated_aliases_produce_multiple_rows(self):
        entry = {"id": "EUVD-2024-001", "aliases": "CVE-2024-11111,CVE-2024-22222"}
        df = normalize_euvd([entry])
        assert len(df) == 2
        cve_ids = set(df["cve_id"].to_list())
        assert cve_ids == {"CVE-2024-11111", "CVE-2024-22222"}

    def test_euvd_id_truncated_to_30_chars(self):
        long_id = "EUVD-" + "X" * 40
        entry = {"id": long_id, "aliases": "CVE-2024-12345"}
        row = normalize_euvd([entry]).row(0, named=True)
        assert len(row["euvd_id"]) == 30

    def test_exploitation_is_none(self, euvd_raw_entry):
        row = normalize_euvd([euvd_raw_entry]).row(0, named=True)
        assert row["euvd_exploitation"] is None

    def test_sources_raw_has_euvd_key(self, euvd_raw_entry):
        row = normalize_euvd([euvd_raw_entry]).row(0, named=True)
        raw = json.loads(row["sources_raw"])
        assert "euvd" in raw

    def test_empty_input(self):
        assert normalize_euvd([]).is_empty()

    def test_no_cve_aliases_skipped(self):
        entry = {"id": "EUVD-2024-001", "aliases": "ENISA-2024-XYZ"}
        assert normalize_euvd([entry]).is_empty()

    def test_enisa_id_aliases_fallback(self):
        entry = {"id": "EUVD-2024-001", "enisaIdAliases": "CVE-2024-99999"}
        df = normalize_euvd([entry])
        assert len(df) == 1
        assert df.row(0, named=True)["cve_id"] == "CVE-2024-99999"


class TestExtractEuvdCveIds:
    def test_string_single(self):
        assert _extract_euvd_cve_ids({"aliases": "CVE-2024-12345"}) == ["CVE-2024-12345"]

    def test_string_comma_separated(self):
        result = _extract_euvd_cve_ids({"aliases": "CVE-2024-11111,CVE-2024-22222"})
        assert result == ["CVE-2024-11111", "CVE-2024-22222"]

    def test_list_input(self):
        result = _extract_euvd_cve_ids({"cveIds": ["CVE-2024-11111", "CVE-2024-22222"]})
        assert "CVE-2024-11111" in result

    def test_too_long_cve_id_skipped(self):
        long_id = "CVE-2024-" + "1" * 15
        assert len(long_id) > 20
        result = _extract_euvd_cve_ids({"aliases": long_id})
        assert result == []

    def test_non_cve_prefix_skipped(self):
        result = _extract_euvd_cve_ids({"aliases": "ENISA-2024-001"})
        assert result == []

    def test_empty_entry(self):
        assert _extract_euvd_cve_ids({}) == []

    def test_enisa_id_aliases_fallback(self):
        result = _extract_euvd_cve_ids({"enisaIdAliases": "CVE-2024-99999"})
        assert result == ["CVE-2024-99999"]
