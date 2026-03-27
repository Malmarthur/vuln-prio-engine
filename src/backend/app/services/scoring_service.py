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
    "cvss_v2_score":      {"type": "numeric",     "range": [0, 10],  "label": "CVSS v2 Score",      "group": "cvss_score"},
    "cvss_v30_score":     {"type": "numeric",     "range": [0, 10],  "label": "CVSS v3.0 Score",    "group": "cvss_score"},
    "cvss_v31_score":     {"type": "numeric",     "range": [0, 10],  "label": "CVSS v3.1 Score",    "group": "cvss_score"},
    "cvss_v40_score":     {"type": "numeric",     "range": [0, 10],  "label": "CVSS v4.0 Score",    "group": "cvss_score"},
    "epss_score":         {"type": "numeric",     "range": [0, 1],   "label": "EPSS Score"},
    "epss_percentile":    {"type": "numeric",     "range": [0, 1],   "label": "EPSS Percentile"},
    "kev_known_exploited":{"type": "boolean",                         "label": "KEV Exploited"},
    "kev_ransomware_use": {"type": "boolean",                         "label": "KEV Ransomware"},
    "cvss_v2_severity":   {"type": "categorical",                     "label": "CVSS v2 Severity",   "group": "cvss_severity"},
    "cvss_v30_severity":  {"type": "categorical",                     "label": "CVSS v3.0 Severity", "group": "cvss_severity"},
    "cvss_v31_severity":  {"type": "categorical",                     "label": "CVSS v3.1 Severity", "group": "cvss_severity"},
    "cvss_v40_severity":  {"type": "categorical",                     "label": "CVSS v4.0 Severity", "group": "cvss_severity"},
    "euvd_exploitation":  {"type": "categorical",                     "label": "EUVD Exploitation"},
}

_SAFE_VALUE_RE = re.compile(r"^[A-Za-z0-9_\-]+$")

# ---------------------------------------------------------------------------
# Default profile
# ---------------------------------------------------------------------------

DEFAULT_SCORING_PROFILE: dict[str, Any] = {
    "thresholds": {"V0": 76, "V1": 51, "V2": 26, "V3": 0},
    "columns": {
        # CVSS score group: v4.0 preferred, falls back to v3.1 → v3.0 → v2
        "cvss_v40_score": {
            "enabled": True, "weight": 40, "type": "numeric", "range": [0, 10],
            "label": "CVSS Score",
            "default_value": 100,
            "fallbacks": ["cvss_v31_score", "cvss_v30_score", "cvss_v2_score"],
        },
        "epss_score": {
            "enabled": True, "weight": 35, "type": "numeric", "range": [0, 1],
            "label": "EPSS Score",
            "default_value": 100,
        },
        "kev_known_exploited": {
            "enabled": True, "weight": 25, "type": "boolean",
            "label": "KEV Exploited",
            "values": {"true": 100, "false": 0},
            "default_value": 100,
        },
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
    seen_as_fallback: dict[str, str] = {}  # fb_col -> primary_col
    for col_name, cfg in profile.columns.items():
        if col_name not in ELIGIBLE_COLUMNS:
            raise ValueError(f"Column '{col_name}' is not eligible for scoring")
        if cfg.values:
            for key in cfg.values:
                if not _SAFE_VALUE_RE.match(key):
                    raise ValueError(f"Unsafe category key '{key}' in column '{col_name}'")
        if cfg.fallbacks:
            for fb in cfg.fallbacks:
                if fb not in ELIGIBLE_COLUMNS:
                    raise ValueError(f"Fallback column '{fb}' is not eligible for scoring")
                if fb == col_name:
                    raise ValueError(f"Column '{col_name}' cannot be its own fallback")
                if fb in seen_as_fallback:
                    raise ValueError(
                        f"Column '{fb}' is used as fallback by both '{seen_as_fallback[fb]}' and '{col_name}'"
                    )
                if fb in profile.columns:
                    raise ValueError(
                        f"Column '{fb}' appears both as a top-level entry and as fallback of '{col_name}'"
                    )
                seen_as_fallback[fb] = col_name
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

    # Columns that appear as fallbacks are handled inside their group's COALESCE
    all_fallbacks: set[str] = set()
    for cfg in enabled.values():
        if cfg.fallbacks:
            all_fallbacks.update(cfg.fallbacks)

    score_terms: list[str] = []
    confidence_terms: list[str] = []

    for col, cfg in enabled.items():
        if col in all_fallbacks:
            continue  # handled inside the group that owns it

        col_list = [col] + (cfg.fallbacks or [])
        norm_w = cfg.weight / total_weight

        if cfg.type == "numeric":
            lo, hi = cfg.range  # type: ignore[misc]
            span = hi - lo
            parts = [f"({c}::float - {lo}) / {span} * 100" for c in col_list]
        elif cfg.type == "boolean":
            true_val = (cfg.values or {}).get("true", 100)
            false_val = (cfg.values or {}).get("false", 0)
            parts = [
                f"CASE WHEN {c} = true THEN {true_val} WHEN {c} = false THEN {false_val} ELSE NULL END"
                for c in col_list
            ]
        else:  # categorical
            if not cfg.values:
                parts = ["NULL"]
            else:
                cases = " ".join(f"WHEN '{cat}' THEN {val}" for cat, val in cfg.values.items())
                parts = [f"CASE {c} {cases} ELSE NULL END" for c in col_list]

        # COALESCE across the group (or single expression), then fall back to default_value
        inner = f"COALESCE({', '.join(parts)})" if len(parts) > 1 else parts[0]
        score_terms.append(f"COALESCE({inner}, {cfg.default_value}) * {norm_w}")

        # Confidence: this group has real data if ANY column in the chain is non-null
        null_checks = " OR ".join(f"{c} IS NOT NULL" for c in col_list)
        confidence_terms.append(
            f"CASE WHEN {null_checks} THEN {cfg.weight} ELSE 0 END"
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
