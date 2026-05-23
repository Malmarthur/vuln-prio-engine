"""Integration tests for scoring_service (compute_scores, profile CRUD, distribution)."""
from __future__ import annotations

import pytest
from sqlalchemy import text

from app.schemas.scoring import ColumnConfig, ScoringProfile
from app.services.scoring_service import (
    DEFAULT_SCORING_PROFILE,
    compute_scores,
    get_score_distribution,
    get_scoring_profile,
    save_scoring_profile,
)

pytestmark = pytest.mark.integration

# ---------------------------------------------------------------------------
# Minimal valid profile for tests
# ---------------------------------------------------------------------------

_SIMPLE_PROFILE = ScoringProfile(
    columns={
        "cvss_v31_score": ColumnConfig(
            enabled=True, weight=100, type="numeric", range=[0, 10], default_value=50
        )
    },
    thresholds={"V0": 76, "V1": 51, "V2": 26, "V3": 0},
)


class TestScoringProfileCrud:
    async def test_get_returns_default_when_not_set(self, db_session):
        profile = await get_scoring_profile(db_session)
        assert "cvss_v40_score" in profile.columns

    async def test_save_and_retrieve(self, db_session):
        await save_scoring_profile(db_session, _SIMPLE_PROFILE)
        retrieved = await get_scoring_profile(db_session)
        assert "cvss_v31_score" in retrieved.columns

    async def test_save_invalid_raises(self, db_session):
        bad_profile = ScoringProfile(
            columns={"not_eligible": ColumnConfig(enabled=True, weight=50, type="numeric")},
            thresholds={"V0": 76, "V1": 51, "V2": 26, "V3": 0},
        )
        with pytest.raises(ValueError, match="not eligible"):
            await save_scoring_profile(db_session, bad_profile)


class TestComputeScores:
    async def test_empty_db_returns_zero(self, db_session):
        rows, dist = await compute_scores(db_session, _SIMPLE_PROFILE)
        assert rows == 0
        assert dist == {}

    async def test_basic_score_computation(self, db_session, vuln_factory):
        vuln = vuln_factory(cve_id="CVE-2024-00001", cvss_v31_score=10.0)
        db_session.add(vuln)
        await db_session.commit()

        rows, dist = await compute_scores(db_session, _SIMPLE_PROFILE)
        assert rows == 1
        # A score of 10.0/10 → 100 → V0
        assert dist.get("V0", 0) == 1

    async def test_scores_written_to_db(self, db_session, vuln_factory):
        vuln = vuln_factory(cve_id="CVE-2024-00001", cvss_v31_score=5.0)
        db_session.add(vuln)
        await db_session.commit()

        await compute_scores(db_session, _SIMPLE_PROFILE)

        count = (
            await db_session.execute(text("SELECT COUNT(*) FROM vulnerability_scores"))
        ).scalar_one()
        assert count == 1

    async def test_no_enabled_columns_raises(self, db_session):
        profile = ScoringProfile(
            columns={
                "cvss_v31_score": ColumnConfig(enabled=False, weight=100, type="numeric", range=[0, 10])
            },
            thresholds={"V0": 76, "V1": 51, "V2": 26, "V3": 0},
        )
        with pytest.raises(ValueError, match="No columns are enabled"):
            await compute_scores(db_session, profile)

    async def test_multiple_rows(self, db_session, vuln_factory):
        vulns = [
            vuln_factory(cve_id=f"CVE-2024-{i:05d}", cvss_v31_score=float(i))
            for i in range(1, 6)
        ]
        for v in vulns:
            db_session.add(v)
        await db_session.commit()

        rows, dist = await compute_scores(db_session, _SIMPLE_PROFILE)
        assert rows == 5


class TestGetScoreDistribution:
    async def test_empty_returns_zeros(self, db_session):
        dist = await get_score_distribution(db_session)
        assert dist.scored_count == 0
        assert dist.unscored_count == 0
        assert dist.priority_counts == {}

    async def test_after_compute(self, db_session, vuln_factory):
        vuln = vuln_factory(cve_id="CVE-2024-00001", cvss_v31_score=9.0)
        db_session.add(vuln)
        await db_session.commit()

        await compute_scores(db_session, _SIMPLE_PROFILE)
        dist = await get_score_distribution(db_session)
        assert dist.scored_count == 1
        assert dist.unscored_count == 0
        assert len(dist.score_histogram) > 0
