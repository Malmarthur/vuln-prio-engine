"""Unit tests for normalize_epss."""
from __future__ import annotations

import json

import polars as pl
import pytest

from app.ingestion.aggregator import normalize_epss


class TestNormalizeEpss:
    def test_basic_column_renaming(self, epss_raw_rows):
        df = normalize_epss(epss_raw_rows)
        assert "cve_id" in df.columns
        assert "epss_score" in df.columns
        assert "epss_percentile" in df.columns
        assert "epss_date" in df.columns
        assert "cve" not in df.columns
        assert "epss" not in df.columns
        assert "percentile" not in df.columns
        assert "date" not in df.columns

    def test_row_count(self, epss_raw_rows):
        assert len(normalize_epss(epss_raw_rows)) == 3

    def test_score_values(self, epss_raw_rows):
        df = normalize_epss(epss_raw_rows)
        rows = {r["cve_id"]: r for r in df.to_dicts()}
        assert rows["CVE-2024-12345"]["epss_score"] == pytest.approx(0.95432)
        assert rows["CVE-2024-12345"]["epss_percentile"] == pytest.approx(0.99123)

    def test_numeric_columns_are_float64(self, epss_raw_rows):
        df = normalize_epss(epss_raw_rows)
        assert df["epss_score"].dtype == pl.Float64
        assert df["epss_percentile"].dtype == pl.Float64

    def test_epss_date_is_string(self, epss_raw_rows):
        df = normalize_epss(epss_raw_rows)
        assert df["epss_date"].dtype == pl.Utf8

    def test_sources_raw_has_epss_key(self, epss_raw_rows):
        df = normalize_epss(epss_raw_rows)
        raw = json.loads(df.row(0, named=True)["sources_raw"])
        assert "epss" in raw

    def test_empty_input_returns_empty_dataframe(self):
        assert normalize_epss([]).is_empty()

    def test_large_batch(self):
        rows = [
            {"cve": f"CVE-2024-{i:05d}", "epss": "0.10000", "percentile": "0.50000", "date": "2024-06-20"}
            for i in range(1000)
        ]
        df = normalize_epss(rows)
        assert len(df) == 1000
