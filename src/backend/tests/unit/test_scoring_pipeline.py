"""Unit tests for _normalize_column and _build_scoring_pipeline."""
from __future__ import annotations

import polars as pl
import pytest

from app.schemas.scoring import ColumnConfig, ScoringProfile
from app.services.scoring_service import _build_scoring_pipeline, _normalize_column


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cfg(**kwargs) -> ColumnConfig:
    defaults = {"enabled": True, "weight": 50, "type": "numeric"}
    defaults.update(kwargs)
    return ColumnConfig(**defaults)


def _apply(expr: pl.Expr, df: pl.DataFrame) -> pl.Series:
    return df.select(expr).to_series()


# ---------------------------------------------------------------------------
# _normalize_column — numeric
# ---------------------------------------------------------------------------

class TestNormalizeColumnNumeric:
    def test_basic_range_0_10(self):
        df = pl.DataFrame({"score": [0.0, 5.0, 10.0]})
        cfg = _cfg(type="numeric", range=[0, 10])
        result = _apply(_normalize_column("score", cfg), df).to_list()
        assert result == pytest.approx([0.0, 50.0, 100.0])

    def test_basic_range_0_1(self):
        df = pl.DataFrame({"epss": [0.0, 0.5, 1.0]})
        cfg = _cfg(type="numeric", range=[0, 1])
        result = _apply(_normalize_column("epss", cfg), df).to_list()
        assert result == pytest.approx([0.0, 50.0, 100.0])

    def test_null_stays_null(self):
        df = pl.DataFrame({"score": pl.Series([None, 5.0], dtype=pl.Float64)})
        cfg = _cfg(type="numeric", range=[0, 10])
        result = _apply(_normalize_column("score", cfg), df).to_list()
        assert result[0] is None
        assert result[1] == pytest.approx(50.0)

    def test_alias_is_prefixed(self):
        df = pl.DataFrame({"cvss_v31_score": [9.8]})
        cfg = _cfg(type="numeric", range=[0, 10])
        expr = _normalize_column("cvss_v31_score", cfg)
        result_df = df.select(expr)
        assert "_norm_cvss_v31_score" in result_df.columns

    def test_fallback_coalesced(self):
        # primary null, fallback has value
        df = pl.DataFrame({
            "cvss_v40_score": pl.Series([None], dtype=pl.Float64),
            "cvss_v31_score": [8.0],
        })
        cfg = _cfg(type="numeric", range=[0, 10], fallbacks=["cvss_v31_score"])
        result = _apply(_normalize_column("cvss_v40_score", cfg), df).to_list()
        assert result[0] == pytest.approx(80.0)

    def test_both_null_stays_null(self):
        df = pl.DataFrame({
            "cvss_v40_score": pl.Series([None], dtype=pl.Float64),
            "cvss_v31_score": pl.Series([None], dtype=pl.Float64),
        })
        cfg = _cfg(type="numeric", range=[0, 10], fallbacks=["cvss_v31_score"])
        result = _apply(_normalize_column("cvss_v40_score", cfg), df).to_list()
        assert result[0] is None


# ---------------------------------------------------------------------------
# _normalize_column — boolean
# ---------------------------------------------------------------------------

class TestNormalizeColumnBoolean:
    def test_true_maps_to_100(self):
        df = pl.DataFrame({"kev": [True]})
        cfg = _cfg(type="boolean", values={"true": 100, "false": 0})
        result = _apply(_normalize_column("kev", cfg), df).to_list()
        assert result[0] == pytest.approx(100.0)

    def test_false_maps_to_0(self):
        df = pl.DataFrame({"kev": [False]})
        cfg = _cfg(type="boolean", values={"true": 100, "false": 0})
        result = _apply(_normalize_column("kev", cfg), df).to_list()
        assert result[0] == pytest.approx(0.0)

    def test_null_stays_null(self):
        df = pl.DataFrame({"kev": pl.Series([None], dtype=pl.Boolean)})
        cfg = _cfg(type="boolean", values={"true": 100, "false": 0})
        result = _apply(_normalize_column("kev", cfg), df).to_list()
        assert result[0] is None

    def test_custom_values(self):
        df = pl.DataFrame({"ransomware": [True, False]})
        cfg = _cfg(type="boolean", values={"true": 80, "false": 20})
        result = _apply(_normalize_column("ransomware", cfg), df).to_list()
        assert result == pytest.approx([80.0, 20.0])

    def test_no_values_defaults_100_0(self):
        df = pl.DataFrame({"kev": [True, False]})
        cfg = _cfg(type="boolean")
        result = _apply(_normalize_column("kev", cfg), df).to_list()
        assert result == pytest.approx([100.0, 0.0])


# ---------------------------------------------------------------------------
# _normalize_column — categorical
# ---------------------------------------------------------------------------

class TestNormalizeColumnCategorical:
    def test_basic_mapping(self):
        df = pl.DataFrame({"severity": ["CRITICAL", "HIGH", "MEDIUM", "LOW"]})
        cfg = _cfg(type="categorical", values={"CRITICAL": 100, "HIGH": 75, "MEDIUM": 50, "LOW": 25})
        result = _apply(_normalize_column("severity", cfg), df).to_list()
        assert result == pytest.approx([100.0, 75.0, 50.0, 25.0])

    def test_unknown_value_maps_to_null(self):
        df = pl.DataFrame({"severity": ["CRITICAL", "UNKNOWN"]})
        cfg = _cfg(type="categorical", values={"CRITICAL": 100})
        result = _apply(_normalize_column("severity", cfg), df).to_list()
        assert result[0] == pytest.approx(100.0)
        assert result[1] is None

    def test_no_values_returns_all_null(self):
        df = pl.DataFrame({"severity": ["CRITICAL", "HIGH"]})
        cfg = _cfg(type="categorical")
        result = _apply(_normalize_column("severity", cfg), df).to_list()
        assert all(v is None for v in result)


# ---------------------------------------------------------------------------
# _build_scoring_pipeline
# ---------------------------------------------------------------------------

class TestBuildScoringPipeline:
    def _run(self, df: pl.DataFrame, enabled: dict, thresholds: dict | None = None) -> pl.DataFrame:
        t = thresholds or {"V0": 76, "V1": 51, "V2": 26, "V3": 0}
        return _build_scoring_pipeline(df.lazy(), enabled, t).collect()

    def test_output_columns(self):
        df = pl.DataFrame({"id": ["1"], "cvss_v31_score": [9.8]})
        enabled = {"cvss_v31_score": _cfg(type="numeric", range=[0, 10], weight=100)}
        result = self._run(df, enabled)
        assert set(result.columns) == {"id", "priority_score", "priority_confidence", "priority_level"}

    def test_single_column_score(self):
        df = pl.DataFrame({"id": ["1"], "cvss_v31_score": [5.0]})
        enabled = {"cvss_v31_score": _cfg(type="numeric", range=[0, 10], weight=100)}
        row = self._run(df, enabled).row(0, named=True)
        assert row["priority_score"] == pytest.approx(50.0, abs=0.1)

    def test_weighted_two_columns(self):
        # cvss=100/100 (weight 50) + kev=true/100 (weight 50) → 100.0
        df = pl.DataFrame({
            "id": ["1"],
            "cvss_v31_score": [10.0],
            "kev_known_exploited": [True],
        })
        enabled = {
            "cvss_v31_score": _cfg(type="numeric", range=[0, 10], weight=50),
            "kev_known_exploited": _cfg(type="boolean", values={"true": 100, "false": 0}, weight=50),
        }
        row = self._run(df, enabled).row(0, named=True)
        assert row["priority_score"] == pytest.approx(100.0, abs=0.1)

    def test_priority_level_v0(self):
        df = pl.DataFrame({"id": ["1"], "epss_score": [1.0]})
        enabled = {"epss_score": _cfg(type="numeric", range=[0, 1], weight=100)}
        row = self._run(df, enabled, {"V0": 76, "V1": 51, "V2": 26, "V3": 0}).row(0, named=True)
        assert row["priority_level"] == "V0"

    def test_priority_level_v3(self):
        df = pl.DataFrame({"id": ["1"], "epss_score": [0.1]})
        enabled = {"epss_score": _cfg(type="numeric", range=[0, 1], weight=100)}
        row = self._run(df, enabled, {"V0": 76, "V1": 51, "V2": 26, "V3": 0}).row(0, named=True)
        assert row["priority_level"] == "V3"

    def test_threshold_boundary_exact_v1(self):
        # score should be exactly 51.0 → V1
        df = pl.DataFrame({"id": ["1"], "epss_score": [0.51]})
        enabled = {"epss_score": _cfg(type="numeric", range=[0, 1], weight=100)}
        row = self._run(df, enabled, {"V0": 76, "V1": 51, "V2": 26, "V3": 0}).row(0, named=True)
        assert row["priority_level"] == "V1"

    def test_confidence_100_when_all_present(self):
        df = pl.DataFrame({"id": ["1"], "cvss_v31_score": [8.0]})
        enabled = {"cvss_v31_score": _cfg(type="numeric", range=[0, 10], weight=100)}
        row = self._run(df, enabled).row(0, named=True)
        assert row["priority_confidence"] == pytest.approx(100.0, abs=0.1)

    def test_confidence_partial_when_null(self):
        # col1 weight=50 present, col2 weight=50 null → confidence 50%
        df = pl.DataFrame({
            "id": ["1"],
            "cvss_v31_score": [8.0],
            "epss_score": pl.Series([None], dtype=pl.Float64),
        })
        enabled = {
            "cvss_v31_score": _cfg(type="numeric", range=[0, 10], weight=50),
            "epss_score": _cfg(type="numeric", range=[0, 1], weight=50),
        }
        row = self._run(df, enabled).row(0, named=True)
        assert row["priority_confidence"] == pytest.approx(50.0, abs=0.1)

    def test_default_value_used_when_null(self):
        # epss null, default_value=100 → score = 100 * 1.0 weight
        df = pl.DataFrame({"id": ["1"], "epss_score": pl.Series([None], dtype=pl.Float64)})
        enabled = {"epss_score": _cfg(type="numeric", range=[0, 1], weight=100, default_value=100)}
        row = self._run(df, enabled).row(0, named=True)
        assert row["priority_score"] == pytest.approx(100.0, abs=0.1)

    def test_fallback_resolved_in_pipeline(self):
        df = pl.DataFrame({
            "id": ["1"],
            "cvss_v40_score": pl.Series([None], dtype=pl.Float64),
            "cvss_v31_score": [8.0],
        })
        enabled = {
            "cvss_v40_score": _cfg(type="numeric", range=[0, 10], weight=100, fallbacks=["cvss_v31_score"]),
        }
        row = self._run(df, enabled).row(0, named=True)
        assert row["priority_score"] == pytest.approx(80.0, abs=0.1)

    def test_batch_multiple_rows(self):
        df = pl.DataFrame({"id": [str(i) for i in range(10)], "epss_score": [float(i) / 10 for i in range(10)]})
        enabled = {"epss_score": _cfg(type="numeric", range=[0, 1], weight=100)}
        result = self._run(df, enabled)
        assert len(result) == 10
