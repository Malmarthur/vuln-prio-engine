"""
Scoring service: builds and executes a dynamic SQL UPDATE to compute priority
scores for all vulnerabilities based on a user-configurable scoring profile.

The entire computation is a single PostgreSQL UPDATE with a subquery — no
Python-side data loading — so it handles 400k+ rows efficiently.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.scoring import ColumnConfig, ScoreDistribution, ScoringProfile
from app.services.vulnerability_service import get_setting, set_setting

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Allowlists
# ---------------------------------------------------------------------------

ELIGIBLE_COLUMNS: dict[str, dict[str, Any]] = {
    "cvss_v2_score":      {"type": "numeric",     "range": [0, 10]},
    "cvss_v30_score":     {"type": "numeric",     "range": [0, 10]},
    "cvss_v31_score":     {"type": "numeric",     "range": [0, 10]},
    "cvss_v40_score":     {"type": "numeric",     "range": [0, 10]},
    "epss_score":         {"type": "numeric",     "range": [0, 1]},
    "epss_percentile":    {"type": "numeric",     "range": [0, 1]},
    "kev_known_exploited":{"type": "boolean"},
    "kev_ransomware_use": {"type": "boolean"},
    "cvss_v2_severity":   {"type": "categorical"},
    "cvss_v30_severity":  {"type": "categorical"},
    "cvss_v31_severity":  {"type": "categorical"},
    "cvss_v40_severity":  {"type": "categorical"},
    "euvd_exploitation":  {"type": "categorical"},
}

_SAFE_VALUE_RE = re.compile(r"^[A-Za-z0-9_\-]+$")

# ---------------------------------------------------------------------------
# Default profile
# ---------------------------------------------------------------------------

DEFAULT_SCORING_PROFILE: dict[str, Any] = {
    "thresholds": {"V0": 76, "V1": 51, "V2": 26, "V3": 0},
    "columns": {
        "cvss_v31_score":     {"enabled": True,  "weight": 30, "type": "numeric",     "range": [0, 10], "default_value": 100},
        "epss_score":         {"enabled": True,  "weight": 25, "type": "numeric",     "range": [0, 1],  "default_value": 100},
        "kev_known_exploited":{"enabled": True,  "weight": 20, "type": "boolean",     "values": {"true": 100, "false": 0}, "default_value": 100},
        "cvss_v31_severity":  {"enabled": True,  "weight": 15, "type": "categorical", "values": {"CRITICAL": 100, "HIGH": 66, "MEDIUM": 33, "LOW": 0}, "default_value": 100},
        "euvd_exploitation":  {"enabled": True,  "weight": 10, "type": "categorical", "values": {}, "default_value": 100},
        "cvss_v2_score":      {"enabled": False, "weight": 0,  "type": "numeric",     "range": [0, 10], "default_value": 100},
        "cvss_v30_score":     {"enabled": False, "weight": 0,  "type": "numeric",     "range": [0, 10], "default_value": 100},
        "cvss_v40_score":     {"enabled": False, "weight": 0,  "type": "numeric",     "range": [0, 10], "default_value": 100},
        "epss_percentile":    {"enabled": False, "weight": 0,  "type": "numeric",     "range": [0, 1],  "default_value": 100},
        "kev_ransomware_use": {"enabled": False, "weight": 0,  "type": "boolean",     "values": {}, "default_value": 100},
        "cvss_v2_severity":   {"enabled": False, "weight": 0,  "type": "categorical", "values": {"HIGH": 100, "MEDIUM": 50, "LOW": 0}, "default_value": 100},
        "cvss_v30_severity":  {"enabled": False, "weight": 0,  "type": "categorical", "values": {"CRITICAL": 100, "HIGH": 66, "MEDIUM": 33, "LOW": 0}, "default_value": 100},
        "cvss_v40_severity":  {"enabled": False, "weight": 0,  "type": "categorical", "values": {"CRITICAL": 100, "HIGH": 66, "MEDIUM": 33, "LOW": 0}, "default_value": 100},
    },
}

# ---------------------------------------------------------------------------
# Profile CRUD
# ---------------------------------------------------------------------------


async def get_scoring_profile(session: AsyncSession) -> ScoringProfile:
    raw = await get_setting(session, "scoring_profile")
    if raw is None:
        raw = DEFAULT_SCORING_PROFILE
    return ScoringProfile.model_validate(raw)


async def save_scoring_profile(session: AsyncSession, profile: ScoringProfile) -> None:
    _validate_profile(profile)
    await set_setting(session, "scoring_profile", profile.model_dump())


def _validate_profile(profile: ScoringProfile) -> None:
    for col_name, cfg in profile.columns.items():
        if col_name not in ELIGIBLE_COLUMNS:
            raise ValueError(f"Column '{col_name}' is not eligible for scoring")
        if cfg.values:
            for key in cfg.values:
                if not _SAFE_VALUE_RE.match(key):
                    raise ValueError(f"Unsafe category key '{key}' in column '{col_name}'")
    if "V0" not in profile.thresholds or "V3" not in profile.thresholds:
        raise ValueError("Thresholds must include V0 and V3")


# ---------------------------------------------------------------------------
# Score computation
# ---------------------------------------------------------------------------


async def compute_scores(session: AsyncSession, profile: ScoringProfile) -> tuple[int, dict[str, int]]:
    """
    Build and execute a single UPDATE on the vulnerabilities table.
    Returns (rows_updated, priority_distribution).
    """
    enabled = {
        col: cfg
        for col, cfg in profile.columns.items()
        if cfg.enabled and cfg.weight > 0
    }
    if not enabled:
        raise ValueError("No columns are enabled with weight > 0 in the scoring profile")

    sql = _build_update_sql(enabled, profile.thresholds)
    logger.info("Running score computation for %d columns", len(enabled))

    result = await session.execute(text(sql))
    await session.commit()
    rows = result.rowcount

    # Fetch distribution
    dist_rows = await session.execute(
        text("SELECT priority_level, COUNT(*) FROM vulnerabilities WHERE priority_level IS NOT NULL GROUP BY priority_level")
    )
    distribution = {row[0]: row[1] for row in dist_rows}
    logger.info("Scored %d rows. Distribution: %s", rows, distribution)
    return rows, distribution


def _build_update_sql(enabled: dict[str, ColumnConfig], thresholds: dict[str, float]) -> str:
    total_weight = sum(cfg.weight for cfg in enabled.values())

    score_terms: list[str] = []
    confidence_terms: list[str] = []

    for col, cfg in enabled.items():
        norm_w = cfg.weight / total_weight

        if cfg.type == "numeric":
            lo, hi = cfg.range  # type: ignore[misc]
            span = hi - lo
            raw_expr = f"({col}::float - {lo}) / {span} * 100"
        elif cfg.type == "boolean":
            true_val = (cfg.values or {}).get("true", 100)
            false_val = (cfg.values or {}).get("false", 0)
            raw_expr = f"CASE WHEN {col} = true THEN {true_val} WHEN {col} = false THEN {false_val} ELSE NULL END"
        else:  # categorical
            if not cfg.values:
                # No mappings defined → always use default
                raw_expr = "NULL"
            else:
                cases = " ".join(
                    f"WHEN '{cat}' THEN {val}"
                    for cat, val in cfg.values.items()
                )
                raw_expr = f"CASE {col} {cases} ELSE NULL END"

        score_terms.append(f"COALESCE({raw_expr}, {cfg.default_value}) * {norm_w}")
        confidence_terms.append(
            f"CASE WHEN {col} IS NOT NULL THEN {cfg.weight} ELSE 0 END"
        )

    score_expr = " + ".join(score_terms)
    confidence_expr = f"({' + '.join(confidence_terms)}) / {total_weight} * 100"

    t = thresholds
    return f"""
WITH scored AS (
    SELECT
        id,
        ({score_expr})      AS score,
        ({confidence_expr}) AS confidence
    FROM vulnerabilities
)
UPDATE vulnerabilities SET
    priority_score      = ROUND(s.score::numeric, 1),
    priority_confidence = ROUND(s.confidence::numeric, 1),
    priority_level      = CASE
        WHEN s.score >= {t['V0']} THEN 'V0'
        WHEN s.score >= {t['V1']} THEN 'V1'
        WHEN s.score >= {t['V2']} THEN 'V2'
        ELSE 'V3'
    END
FROM scored s
WHERE vulnerabilities.id = s.id
"""


# ---------------------------------------------------------------------------
# Distribution queries
# ---------------------------------------------------------------------------


async def get_score_distribution(session: AsyncSession) -> ScoreDistribution:
    # Priority counts
    rows = await session.execute(
        text("""
            SELECT priority_level, COUNT(*)
            FROM vulnerabilities
            WHERE priority_level IS NOT NULL
            GROUP BY priority_level
            ORDER BY priority_level
        """)
    )
    priority_counts = {r[0]: r[1] for r in rows}

    # Score histogram (10-point buckets)
    rows = await session.execute(
        text("""
            SELECT FLOOR(priority_score / 10) * 10 AS bucket, COUNT(*)
            FROM vulnerabilities
            WHERE priority_score IS NOT NULL
            GROUP BY bucket
            ORDER BY bucket
        """)
    )
    score_histogram = [
        {"bucket": f"{int(r[0])}-{min(int(r[0]) + 10, 100)}", "count": r[1]}
        for r in rows
    ]

    # Confidence histogram (10-point buckets)
    rows = await session.execute(
        text("""
            SELECT FLOOR(priority_confidence / 10) * 10 AS bucket, COUNT(*)
            FROM vulnerabilities
            WHERE priority_confidence IS NOT NULL
            GROUP BY bucket
            ORDER BY bucket
        """)
    )
    confidence_histogram = [
        {"bucket": f"{int(r[0])}-{min(int(r[0]) + 10, 100)}", "count": r[1]}
        for r in rows
    ]

    scored = (
        await session.execute(
            text("SELECT COUNT(*) FROM vulnerabilities WHERE priority_score IS NOT NULL")
        )
    ).scalar_one()
    total = (
        await session.execute(text("SELECT COUNT(*) FROM vulnerabilities"))
    ).scalar_one()

    return ScoreDistribution(
        priority_counts=priority_counts,
        score_histogram=score_histogram,
        confidence_histogram=confidence_histogram,
        scored_count=scored,
        unscored_count=total - scored,
    )


# ---------------------------------------------------------------------------
# Column distinct values (for categorical UI)
# ---------------------------------------------------------------------------


async def get_column_distinct_values(session: AsyncSession, column: str) -> list[str]:
    if column not in ELIGIBLE_COLUMNS:
        raise ValueError(f"Column '{column}' is not eligible")
    rows = await session.execute(
        text(f"SELECT DISTINCT {column} FROM vulnerabilities WHERE {column} IS NOT NULL ORDER BY {column}")  # noqa: S608
    )
    return [str(r[0]) for r in rows]
