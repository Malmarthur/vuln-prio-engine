"""
Scoring service: loads vulnerability data into a Polars DataFrame, computes
priority scores using vectorized operations, then writes results back to DB
via asyncpg temp-table COPY for maximum throughput.
"""
from __future__ import annotations

import logging
from typing import Any

import polars as pl
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.scoring import ColumnConfig, ScoreDistribution, ScoringProfile

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

import re
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
    from app.services.profile_service import get_active_profile
    return ScoringProfile.model_validate((await get_active_profile(session, "vulnerability")).config)


async def save_scoring_profile(session: AsyncSession, profile: ScoringProfile) -> None:
    _validate_profile(profile)
    from app.services.profile_service import save_active_profile_config
    await save_active_profile_config(session, "vulnerability", profile.model_dump())


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
# Score computation — Polars pipeline
# ---------------------------------------------------------------------------


async def compute_scores(
    session: AsyncSession,
    profile: ScoringProfile,
    profile_id: Any | None = None,
    profile_revision: int = 1,
    scoring_run_id: Any | None = None,
) -> tuple[int, dict[str, int]]:
    """
    Load vulnerability data into Polars, compute scores vectorially, then
    write results back to DB via asyncpg temp-table COPY.
    Returns (rows_updated, priority_distribution).
    """
    enabled = {
        col: cfg
        for col, cfg in profile.columns.items()
        if cfg.enabled and cfg.weight > 0
    }
    if not enabled:
        raise ValueError("No columns are enabled with weight > 0 in the scoring profile")

    logger.info("Running Polars score computation for %d columns", len(enabled))

    df = await _load_vulnerabilities_df(session, enabled)
    if df.is_empty():
        return 0, {}

    scored_df = _build_scoring_pipeline(df.lazy(), enabled, profile.thresholds).collect()

    # Compute distribution from the scored DataFrame (no extra SQL round-trips)
    dist_df = (
        scored_df
        .filter(pl.col("priority_level").is_not_null())
        .group_by("priority_level")
        .agg(pl.len().alias("count"))
    )
    distribution = {row[0]: row[1] for row in dist_df.iter_rows()}

    if profile_id is None:
        from app.services.profile_service import get_active_preset
        _, context = await get_active_preset(session)
        profile_id = context.vulnerability_profile_id
    rows = await _write_back_scores(session, scored_df, profile_id, profile_revision, scoring_run_id)
    logger.info("Scored %d rows. Distribution: %s", rows, distribution)
    return rows, distribution


async def _load_vulnerabilities_df(
    session: AsyncSession,
    enabled: dict[str, ColumnConfig],
) -> pl.DataFrame:
    """SELECT only columns required by the scoring profile, return as Polars DataFrame."""
    needed: set[str] = {"id"}
    for col, cfg in enabled.items():
        needed.add(col)
        for fb in cfg.fallbacks or []:
            needed.add(fb)

    # Cast id to text (Polars needs plain strings, not UUID objects).
    # Cast Numeric columns to float8 so asyncpg returns Python floats directly
    # instead of Decimal — avoids a 400k-row isinstance() conversion loop.
    numeric_cols = {
        name for name, meta in ELIGIBLE_COLUMNS.items() if meta["type"] == "numeric"
    }
    col_selects = ", ".join(
        f"{c}::text" if c == "id"
        else f"{c}::float8" if c in numeric_cols
        else c
        for c in sorted(needed)
    )
    result = await session.execute(text(f"SELECT {col_selects} FROM vulnerabilities"))  # noqa: S608
    rows = result.fetchall()
    if not rows:
        return pl.DataFrame()

    columns = list(result.keys())
    # zip(*rows) transposes rows→columns in C-level iteration (no Python loop)
    data = dict(zip(columns, zip(*rows)))
    return pl.DataFrame(data)


def _normalize_column(col: str, cfg: ColumnConfig) -> pl.Expr:
    """Return a Polars expression that normalizes a column (+ its fallbacks) to 0–100."""
    col_chain = [col] + (cfg.fallbacks or [])
    raw = pl.coalesce([pl.col(c) for c in col_chain])

    if cfg.type == "numeric":
        lo, hi = cfg.range  # type: ignore[misc]
        span = hi - lo
        return ((raw.cast(pl.Float64) - lo) / span * 100).alias(f"_norm_{col}")

    if cfg.type == "boolean":
        true_val = float((cfg.values or {}).get("true", 100))
        false_val = float((cfg.values or {}).get("false", 0))
        return (
            pl.when(raw == True).then(true_val)   # noqa: E712
              .when(raw == False).then(false_val)  # noqa: E712
              .otherwise(None)
              .cast(pl.Float64)
        ).alias(f"_norm_{col}")

    # categorical
    if not cfg.values:
        return pl.lit(None, dtype=pl.Float64).alias(f"_norm_{col}")

    # replace_strict maps category strings → float scores
    mapping = {k: float(v) for k, v in cfg.values.items()}
    return raw.replace_strict(mapping, default=None).cast(pl.Float64).alias(f"_norm_{col}")


def _build_scoring_pipeline(
    lf: pl.LazyFrame,
    enabled: dict[str, ColumnConfig],
    thresholds: dict[str, float],
) -> pl.LazyFrame:
    """
    Pure function: builds the full scoring pipeline on a LazyFrame.
    Adds priority_score, priority_confidence, priority_level columns,
    keeping only id + the three result columns.
    """
    # Columns that only appear as fallbacks are handled inside their group's COALESCE
    all_fallbacks: set[str] = set()
    for cfg in enabled.values():
        all_fallbacks.update(cfg.fallbacks or [])
    primary = {c: cfg for c, cfg in enabled.items() if c not in all_fallbacks}

    total_weight = sum(cfg.weight for cfg in primary.values())

    # Step 1: normalized columns + confidence (single pass over source data)
    norm_exprs = [_normalize_column(col, cfg) for col, cfg in primary.items()]
    confidence_exprs = [
        pl.when(
            pl.any_horizontal(*[pl.col(c).is_not_null() for c in [col] + (cfg.fallbacks or [])])
        ).then(pl.lit(cfg.weight)).otherwise(pl.lit(0.0)).alias(f"_conf_{col}")
        for col, cfg in primary.items()
    ]
    lf = lf.with_columns(norm_exprs + confidence_exprs)

    # Step 2: weighted score + confidence + priority level (single pass over normalized data)
    score_parts = [
        pl.col(f"_norm_{col}").fill_null(cfg.default_value) * (cfg.weight / total_weight)
        for col, cfg in primary.items()
    ]
    t = thresholds
    score_expr = pl.sum_horizontal(*score_parts).round(1).alias("priority_score")
    conf_expr = (
        pl.sum_horizontal(*[pl.col(f"_conf_{col}") for col in primary]) / total_weight * 100
    ).round(1).alias("priority_confidence")

    lf = lf.with_columns([score_expr, conf_expr])

    lf = lf.with_columns([
        pl.when(pl.col("priority_score") >= t["V0"]).then(pl.lit("V0"))
          .when(pl.col("priority_score") >= t["V1"]).then(pl.lit("V1"))
          .when(pl.col("priority_score") >= t["V2"]).then(pl.lit("V2"))
          .otherwise(pl.lit("V3"))
          .alias("priority_level"),
    ])

    return lf.select("id", "priority_score", "priority_confidence", "priority_level")


async def _write_back_scores(
    session: AsyncSession,
    df: pl.DataFrame,
    profile_id: Any | None = None,
    profile_revision: int = 1,
    scoring_run_id: Any | None = None,
) -> int:
    """
    Bulk-write scores to the vulnerability_scores table using TRUNCATE + COPY.

    This is dramatically faster than UPDATE because:
    - TRUNCATE is O(1) (no row-by-row delete)
    - COPY is sequential write (no index lookup per row)
    - Indexes are rebuilt from scratch after COPY (faster than incremental maintenance)
    - No trigger overhead, no dead tuples
    """
    import io

    conn = await session.connection()
    raw = await conn.get_raw_connection()
    asyncpg_conn = raw.driver_connection

    # Drop indexes before bulk load
    await asyncpg_conn.execute("DROP INDEX IF EXISTS ix_vulnerability_scores_priority_score")
    await asyncpg_conn.execute("DROP INDEX IF EXISTS ix_vulnerability_scores_priority_level")

    if profile_id is None:
        from app.services.profile_service import get_active_preset
        _, context = await get_active_preset(session)
        profile_id = context.vulnerability_profile_id
    await asyncpg_conn.execute(
        "DELETE FROM vulnerability_scores WHERE vulnerability_profile_id = $1", profile_id
    )

    # Rename 'id' → 'vulnerability_id' for the target table
    write_df = (
        df.rename({"id": "vulnerability_id"})
        .with_columns([
            pl.lit(str(profile_id)).alias("vulnerability_profile_id"),
            pl.lit(profile_revision).alias("profile_revision"),
            pl.lit(str(scoring_run_id) if scoring_run_id else None).alias("scoring_run_id"),
        ])
        .select(
            "vulnerability_id", "vulnerability_profile_id", "priority_score",
            "priority_confidence", "priority_level", "profile_revision", "scoring_run_id",
        )
    )

    # Write CSV to an in-memory buffer (Rust-speed serialization via Polars)
    buf = io.BytesIO()
    write_df.write_csv(buf, include_header=False, null_value="")
    buf.seek(0)

    await asyncpg_conn.copy_to_table(
        "vulnerability_scores",
        source=buf,
        format="csv",
        columns=[
            "vulnerability_id", "vulnerability_profile_id", "priority_score",
            "priority_confidence", "priority_level", "profile_revision", "scoring_run_id",
        ],
    )

    # Rebuild indexes from scratch (faster than incremental maintenance during COPY)
    await asyncpg_conn.execute(
        "CREATE INDEX ix_vulnerability_scores_priority_score ON vulnerability_scores (priority_score)"
    )
    await asyncpg_conn.execute(
        "CREATE INDEX ix_vulnerability_scores_priority_level ON vulnerability_scores (priority_level)"
    )

    await session.commit()
    return len(df)


# ---------------------------------------------------------------------------
# Distribution queries (reads persisted scores from DB)
# ---------------------------------------------------------------------------


async def get_score_distribution(session: AsyncSession, preset_id: Any | None = None) -> ScoreDistribution:
    from app.services.profile_service import resolve_context
    profile_id = (await resolve_context(session, preset_id)).vulnerability_profile_id
    # Priority counts
    rows = await session.execute(
        text("""
            SELECT priority_level, COUNT(*)
            FROM vulnerability_scores
            WHERE priority_level IS NOT NULL AND vulnerability_profile_id = :profile_id
            GROUP BY priority_level
            ORDER BY priority_level
        """), {"profile_id": profile_id}
    )
    priority_counts = {r[0]: r[1] for r in rows}

    # Score histogram (10-point buckets)
    rows = await session.execute(
        text("""
            SELECT FLOOR(priority_score / 10) * 10 AS bucket, COUNT(*)
            FROM vulnerability_scores
            WHERE priority_score IS NOT NULL AND vulnerability_profile_id = :profile_id
            GROUP BY bucket
            ORDER BY bucket
        """), {"profile_id": profile_id}
    )
    score_histogram = [
        {"bucket": f"{int(r[0])}-{min(int(r[0]) + 10, 100)}", "count": r[1]}
        for r in rows
    ]

    # Confidence histogram (10-point buckets)
    rows = await session.execute(
        text("""
            SELECT FLOOR(priority_confidence / 10) * 10 AS bucket, COUNT(*)
            FROM vulnerability_scores
            WHERE priority_confidence IS NOT NULL AND vulnerability_profile_id = :profile_id
            GROUP BY bucket
            ORDER BY bucket
        """), {"profile_id": profile_id}
    )
    confidence_histogram = [
        {"bucket": f"{int(r[0])}-{min(int(r[0]) + 10, 100)}", "count": r[1]}
        for r in rows
    ]

    scored = (
        await session.execute(
            text("SELECT COUNT(*) FROM vulnerability_scores WHERE priority_score IS NOT NULL AND vulnerability_profile_id = :profile_id"),
            {"profile_id": profile_id},
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
