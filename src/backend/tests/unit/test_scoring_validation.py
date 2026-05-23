"""Unit tests for _validate_profile."""
from __future__ import annotations

import pytest

from app.schemas.scoring import ColumnConfig, ScoringProfile
from app.services.scoring_service import DEFAULT_SCORING_PROFILE, _validate_profile


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cfg(**kwargs) -> ColumnConfig:
    defaults = {"enabled": True, "weight": 50, "type": "numeric", "range": [0, 10]}
    defaults.update(kwargs)
    return ColumnConfig(**defaults)


def _profile(columns: dict, thresholds: dict | None = None) -> ScoringProfile:
    t = thresholds or {"V0": 76, "V1": 51, "V2": 26, "V3": 0}
    return ScoringProfile(columns=columns, thresholds=t)


# ---------------------------------------------------------------------------
# TestValidateProfile
# ---------------------------------------------------------------------------

class TestValidateProfile:
    def test_default_profile_is_valid(self):
        profile = ScoringProfile.model_validate(DEFAULT_SCORING_PROFILE)
        _validate_profile(profile)  # should not raise

    def test_valid_single_numeric_column(self):
        profile = _profile({"cvss_v31_score": _cfg()})
        _validate_profile(profile)  # should not raise

    def test_ineligible_column_raises(self):
        profile = _profile({"not_a_real_column": _cfg()})
        with pytest.raises(ValueError, match="not eligible"):
            _validate_profile(profile)

    def test_unsafe_category_key_raises(self):
        profile = _profile({
            "cvss_v31_severity": _cfg(
                type="categorical",
                values={"CRITICAL": 100, "HIGH; DROP TABLE": 50},
            )
        })
        with pytest.raises(ValueError, match="Unsafe category key"):
            _validate_profile(profile)

    def test_safe_category_keys_pass(self):
        profile = _profile({
            "cvss_v31_severity": _cfg(
                type="categorical",
                values={"CRITICAL": 100, "HIGH": 75, "MEDIUM-LOW_2": 50},
            )
        })
        _validate_profile(profile)  # should not raise

    def test_ineligible_fallback_raises(self):
        profile = _profile({
            "cvss_v40_score": _cfg(fallbacks=["not_a_real_column"])
        })
        with pytest.raises(ValueError, match="not eligible"):
            _validate_profile(profile)

    def test_self_fallback_raises(self):
        profile = _profile({
            "cvss_v31_score": _cfg(fallbacks=["cvss_v31_score"])
        })
        with pytest.raises(ValueError, match="cannot be its own fallback"):
            _validate_profile(profile)

    def test_duplicate_fallback_raises(self):
        # cvss_v2_score used as fallback by both v40 and v31
        profile = _profile({
            "cvss_v40_score": _cfg(fallbacks=["cvss_v2_score"]),
            "cvss_v31_score": _cfg(fallbacks=["cvss_v2_score"]),
        })
        with pytest.raises(ValueError, match="used as fallback by both"):
            _validate_profile(profile)

    def test_fallback_also_top_level_raises(self):
        # cvss_v31_score is both a top-level column and a fallback
        profile = _profile({
            "cvss_v40_score": _cfg(fallbacks=["cvss_v31_score"]),
            "cvss_v31_score": _cfg(),
        })
        with pytest.raises(ValueError, match="both as a top-level entry and as fallback"):
            _validate_profile(profile)

    def test_missing_v0_threshold_raises(self):
        profile = _profile(
            {"cvss_v31_score": _cfg()},
            thresholds={"V1": 51, "V2": 26, "V3": 0},
        )
        with pytest.raises(ValueError, match="V0"):
            _validate_profile(profile)

    def test_missing_v3_threshold_raises(self):
        profile = _profile(
            {"cvss_v31_score": _cfg()},
            thresholds={"V0": 76, "V1": 51, "V2": 26},
        )
        with pytest.raises(ValueError, match="V3"):
            _validate_profile(profile)
