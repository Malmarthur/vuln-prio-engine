"""Interactive analysis of completed comparisons.

Facets recomputed under attribute filters, followed items and their position in
each scenario, divergence explanations and population previews. Ranks always come
from the comparison population (``job.request["subset"]``); view filters only
slice it.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scoring import FollowedItem, ScoringJob, ScoringRun
from app.schemas.scoring import (
    ComparisonExplanation,
    ComparisonFacetCandidate,
    ComparisonFacets,
    ComparisonFilters,
    ComparisonFollowed,
    ComparisonFollowedRow,
    ComparisonItem,
    ExplanationFactor,
    ExplanationSignal,
    FollowedItem as FollowedItemSchema,
    FollowedScenarioPosition,
    SubsetPreview,
)
from app.services.comparison_filters import entity_filter_sql, entity_type
from app.services.profile_service import (
    TOP_N_SIZES,
    _details_available,
    _resolved_score_target,
    compared_cte,
    job_subset,
    population_sql,
    ranked_cte,
    selection_conditions,
    view_conditions,
)
from app.services.scoring_service import ELIGIBLE_COLUMNS

FOLLOW_MATCHING_LIMIT = 1000
FOLLOWED_POSITIONS_LIMIT = 200


async def _comparison_job(session: AsyncSession, job_id: UUID) -> ScoringJob:
    job = await session.get(ScoringJob, job_id)
    if job is None or job.kind != "comparison":
        raise LookupError("Comparison job not found")
    return job


# ---------------------------------------------------------------------------
# Facets
# ---------------------------------------------------------------------------

async def comparison_facets(session: AsyncSession, job_id: UUID, filters: ComparisonFilters | None) -> ComparisonFacets:
    """Distributions, transitions, movements and top-N for the filtered slice."""
    job = await _comparison_job(session, job_id)
    top_columns = ",\n".join(
        f"COUNT(*) FILTER (WHERE candidate_rank <= {size} AND (baseline_rank IS NULL OR baseline_rank > {size})) AS entered_{size},"
        f" COUNT(*) FILTER (WHERE baseline_rank <= {size} AND (candidate_rank IS NULL OR candidate_rank > {size})) AS left_{size},"
        f" COUNT(*) FILTER (WHERE baseline_rank <= {size} AND candidate_rank <= {size}) AS overlap_{size}"
        for size in TOP_N_SIZES
    )
    baseline_distribution: dict[str, int] = {}
    baseline_total = 0
    candidates: list[ComparisonFacetCandidate] = []
    for index, candidate_id in enumerate(UUID(value) for value in job.request["candidate_ids"]):
        cte, params = await compared_cte(session, job, candidate_id)
        conditions, view_params = view_conditions(job.scope, filters)
        params.update(view_params)
        rows = (await session.execute(text(f"""
            {cte}
            SELECT baseline_priority, candidate_priority,
                   baseline_rank IS NOT NULL AS in_baseline, candidate_rank IS NOT NULL AS in_candidate,
                   COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE rank_delta > 0) AS promoted,
                   COUNT(*) FILTER (WHERE rank_delta < 0) AS demoted,
                   {top_columns}
            FROM compared
            WHERE {" AND ".join(["TRUE", *conditions])}
            GROUP BY 1, 2, 3, 4
        """), params)).mappings().all()
        distribution: dict[str, int] = {}
        transitions: dict[str, dict[str, int]] = {}
        top_n = {str(size): {"entered": 0, "left": 0, "overlap": 0} for size in TOP_N_SIZES}
        total = promoted = demoted = 0
        for row in rows:
            count = int(row["total"])
            total += count
            promoted += int(row["promoted"])
            demoted += int(row["demoted"])
            transitions.setdefault(row["baseline_priority"], {})
            transitions[row["baseline_priority"]][row["candidate_priority"]] = (
                transitions[row["baseline_priority"]].get(row["candidate_priority"], 0) + count
            )
            if row["in_candidate"]:
                distribution[row["candidate_priority"]] = distribution.get(row["candidate_priority"], 0) + count
            if index == 0 and row["in_baseline"]:
                baseline_total += count
                baseline_distribution[row["baseline_priority"]] = baseline_distribution.get(row["baseline_priority"], 0) + count
            for size in TOP_N_SIZES:
                for key in ("entered", "left", "overlap"):
                    top_n[str(size)][key] += int(row[f"{key}_{size}"])
        candidates.append(ComparisonFacetCandidate(
            id=candidate_id, total=total, distribution=distribution, transition_matrix=transitions,
            promoted=promoted, demoted=demoted, unchanged=total - promoted - demoted, top_n=top_n,
        ))
    return ComparisonFacets(baseline_total=baseline_total, baseline_distribution=baseline_distribution, candidates=candidates)


# ---------------------------------------------------------------------------
# Followed items
# ---------------------------------------------------------------------------

def _label_sql(kind: str) -> str:
    if kind == "vulnerability":
        return "SELECT fi.entity_id, fi.created_at, v.cve_id AS label FROM followed_items fi LEFT JOIN vulnerabilities v ON v.id = fi.entity_id"
    if kind == "asset":
        return "SELECT fi.entity_id, fi.created_at, a.name AS label FROM followed_items fi LEFT JOIN assets a ON a.id = fi.entity_id"
    return (
        "SELECT fi.entity_id, fi.created_at, v.cve_id || ' @ ' || a.name AS label FROM followed_items fi"
        " LEFT JOIN findings f ON f.id = fi.entity_id LEFT JOIN vulnerabilities v ON v.id = f.vulnerability_id"
        " LEFT JOIN assets a ON a.id = f.asset_id"
    )


async def list_followed(session: AsyncSession, kind: str) -> list[FollowedItemSchema]:
    """Followed entities with a readable label; entities deleted since are purged."""
    rows = (await session.execute(
        text(f"{_label_sql(kind)} WHERE fi.entity_type = :kind ORDER BY fi.created_at DESC"), {"kind": kind}
    )).mappings().all()
    orphans = [row["entity_id"] for row in rows if row["label"] is None]
    if orphans:
        await session.execute(
            text("DELETE FROM followed_items WHERE entity_type = :kind AND entity_id = ANY(CAST(:ids AS uuid[]))"),
            {"kind": kind, "ids": [str(value) for value in orphans]},
        )
        await session.commit()
    return [
        FollowedItemSchema(entity_type=kind, entity_id=row["entity_id"], label=row["label"], created_at=row["created_at"])
        for row in rows if row["label"] is not None
    ]


async def followed_ids(session: AsyncSession, kind: str) -> list[UUID]:
    return list((await session.execute(
        select(FollowedItem.entity_id).where(FollowedItem.entity_type == kind).order_by(FollowedItem.created_at.desc())
    )).scalars())


async def _count_followed(session: AsyncSession, kind: str) -> int:
    return (await session.execute(
        text("SELECT COUNT(*) FROM followed_items WHERE entity_type = :kind"), {"kind": kind}
    )).scalar_one()


async def follow(session: AsyncSession, kind: str, ids: list[UUID]) -> tuple[int, int]:
    if ids:
        result = await session.execute(
            insert(FollowedItem).values([{"entity_type": kind, "entity_id": value} for value in dict.fromkeys(ids)])
            .on_conflict_do_nothing(constraint="uq_followed_items_entity")
        )
        changed = result.rowcount or 0
    else:
        changed = 0
    await session.commit()
    return changed, await _count_followed(session, kind)


async def unfollow(session: AsyncSession, kind: str, ids: list[UUID] | None) -> tuple[int, int]:
    """Stop following the given entities, or all of this type when ``ids`` is None."""
    if ids is None:
        result = await session.execute(text("DELETE FROM followed_items WHERE entity_type = :kind"), {"kind": kind})
    else:
        result = await session.execute(
            text("DELETE FROM followed_items WHERE entity_type = :kind AND entity_id = ANY(CAST(:ids AS uuid[]))"),
            {"kind": kind, "ids": [str(value) for value in ids]},
        )
    await session.commit()
    return result.rowcount or 0, await _count_followed(session, kind)


async def follow_matching(
    session: AsyncSession,
    job_id: UUID,
    candidate_id: UUID,
    filters: ComparisonFilters | None,
    movement: str | None = None,
    from_priority: str | None = None,
    to_priority: str | None = None,
    top_n: int | None = None,
    top_change: str | None = None,
) -> tuple[int, int]:
    """Follow the items matching the current view (largest rank shifts first, capped)."""
    job = await _comparison_job(session, job_id)
    cte, params = await compared_cte(session, job, candidate_id)
    conditions, view_params = view_conditions(job.scope, filters)
    selected, selection_params = selection_conditions(movement, from_priority, to_priority, top_n, top_change)
    params.update(view_params)
    params.update(selection_params)
    ids = list((await session.execute(text(f"""
        {cte}
        SELECT entity_id FROM compared
        WHERE {" AND ".join(["TRUE", *conditions, *selected])}
        ORDER BY ABS(rank_delta) DESC NULLS LAST, entity_id::text
        LIMIT {FOLLOW_MATCHING_LIMIT}
    """), params)).scalars())
    return await follow(session, entity_type(job.scope), ids)


async def comparison_followed(session: AsyncSession, job_id: UUID) -> ComparisonFollowed:
    """Position of each followed item in the reference and every candidate."""
    job = await _comparison_job(session, job_id)
    if job.status != "completed":
        raise ValueError("Comparison is not complete")
    if not await _details_available(session, job):
        raise RuntimeError("Comparison details have expired")
    kind = entity_type(job.scope)
    ids = await followed_ids(session, kind)
    shown = ids[:FOLLOWED_POSITIONS_LIMIT]
    if not shown:
        baseline = (job.result_summary or {}).get("baseline") or {}
        return ComparisonFollowed(
            followed_total=0, in_population=0, population_total=sum((baseline.get("distribution") or {}).values()), items=[],
        )
    population, base_params = population_sql(job.scope, job_subset(job))
    scenario_ids = [job.request["baseline_id"], *job.request["candidate_ids"]]
    rows: dict[UUID, ComparisonFollowedRow] = {}
    population_total = 0
    for index, scenario_id in enumerate(scenario_ids):
        params = {
            **base_params,
            "target": await _resolved_score_target(session, job.scope, UUID(scenario_id)),
            "ids": [str(value) for value in shown],
        }
        result = (await session.execute(text(f"""
            WITH {ranked_cte(job.scope, "ranked", "target", population)}
            SELECT entity_id, label, score, priority, rank, (SELECT COUNT(*) FROM ranked) AS population
            FROM ranked WHERE entity_id = ANY(CAST(:ids AS uuid[]))
        """), params)).mappings().all()
        if index == 0:
            population_total = result[0]["population"] if result else (await session.execute(text(
                f"WITH {ranked_cte(job.scope, 'ranked', 'target', population)} SELECT COUNT(*) FROM ranked"
            ), params)).scalar_one()
        for row in result:
            entry = rows.setdefault(row["entity_id"], ComparisonFollowedRow(entity_id=row["entity_id"], label=row["label"], positions={}))
            entry.positions[scenario_id] = FollowedScenarioPosition(score=row["score"], priority=row["priority"], rank=row["rank"])
    ordered = [rows[value] for value in shown if value in rows]
    return ComparisonFollowed(
        followed_total=len(ids), in_population=len(ordered), population_total=population_total, items=ordered,
    )


# ---------------------------------------------------------------------------
# Divergence explanation
# ---------------------------------------------------------------------------

def _stage_configs(scope: str, snapshot: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    if not snapshot:
        return {}
    if scope in ("vulnerability", "asset"):
        return {scope: snapshot}
    return {stage: snapshot[stage] for stage in ("vulnerability", "asset", "finding") if stage in snapshot}


def _weights(stage: str, config: dict[str, Any]) -> dict[str, tuple[str, float]]:
    """Factor key → (label, weight) for one stage configuration."""
    if stage == "vulnerability":
        return {
            key: (column.get("label") or ELIGIBLE_COLUMNS.get(key, {}).get("label") or key, float(column.get("weight", 0)))
            for key, column in (config.get("columns") or {}).items() if column.get("enabled")
        }
    return {key: (key.replace("_", " ").capitalize(), float(value)) for key, value in (config.get("weights") or {}).items()}


def _factors(scope: str, baseline: dict[str, Any] | None, candidate: dict[str, Any] | None) -> list[ExplanationFactor]:
    left, right = _stage_configs(scope, baseline), _stage_configs(scope, candidate)
    factors: list[ExplanationFactor] = []
    for stage in ("vulnerability", "asset", "finding"):
        if stage not in left and stage not in right:
            continue
        lw, rw = _weights(stage, left.get(stage, {})), _weights(stage, right.get(stage, {}))
        ltotal, rtotal = sum(w for _, w in lw.values()) or 1, sum(w for _, w in rw.values()) or 1
        for key in dict.fromkeys([*lw, *rw]):
            label = (lw.get(key) or rw.get(key))[0]
            lshare = round(lw[key][1] / ltotal * 100, 1) if key in lw else None
            rshare = round(rw[key][1] / rtotal * 100, 1) if key in rw else None
            factors.append(ExplanationFactor(
                stage=stage, key=key, label=label,
                baseline_weight=lw[key][1] if key in lw else None,
                candidate_weight=rw[key][1] if key in rw else None,
                baseline_share=lshare, candidate_share=rshare,
                changed=lshare != rshare,
            ))
    return factors


async def _signals(session: AsyncSession, kind: str, entity_id: UUID) -> list[ExplanationSignal]:
    vulnerability_columns = """
        v.cve_id, COALESCE(v.cvss_v40_score, v.cvss_v31_score, v.cvss_v30_score, v.cvss_v2_score)::float8 AS cvss_score,
        CASE WHEN v.cvss_v40_score IS NOT NULL THEN '4.0' WHEN v.cvss_v31_score IS NOT NULL THEN '3.1'
             WHEN v.cvss_v30_score IS NOT NULL THEN '3.0' WHEN v.cvss_v2_score IS NOT NULL THEN '2.0' END AS cvss_version,
        COALESCE(v.cvss_v40_severity, v.cvss_v31_severity, v.cvss_v30_severity, v.cvss_v2_severity) AS severity,
        v.epss_score::float8 AS epss_score, v.epss_percentile::float8 AS epss_percentile,
        v.kev_known_exploited, v.kev_ransomware_use, v.euvd_exploitation
    """
    asset_columns = "a.name AS asset_name, a.asset_type, a.internet_exposure, a.business_criticality, a.patch_complexity"
    if kind == "vulnerability":
        sql = f"SELECT {vulnerability_columns} FROM vulnerabilities v WHERE v.id = :id"
    elif kind == "asset":
        sql = f"SELECT {asset_columns} FROM assets a WHERE a.id = :id"
    else:
        sql = f"""
            SELECT {vulnerability_columns}, {asset_columns}, f.match_type, f.match_confidence::float8 AS match_confidence,
                   c.name AS component_name, c.version AS component_version
            FROM findings f JOIN vulnerabilities v ON v.id = f.vulnerability_id JOIN assets a ON a.id = f.asset_id
            LEFT JOIN asset_components c ON c.id = f.asset_component_id
            WHERE f.id = :id
        """
    row = (await session.execute(text(sql), {"id": entity_id})).mappings().first()
    if row is None:
        return []
    labels = [
        ("vulnerability", "cve_id", "CVE"),
        ("vulnerability", "cvss_score", "CVSS score"),
        ("vulnerability", "cvss_version", "CVSS version"),
        ("vulnerability", "severity", "Severity"),
        ("vulnerability", "epss_score", "EPSS score"),
        ("vulnerability", "epss_percentile", "EPSS percentile"),
        ("vulnerability", "kev_known_exploited", "Known exploited (KEV)"),
        ("vulnerability", "kev_ransomware_use", "KEV ransomware use"),
        ("vulnerability", "euvd_exploitation", "EUVD exploitation"),
        ("asset", "asset_name", "Asset"),
        ("asset", "asset_type", "Asset type"),
        ("asset", "internet_exposure", "Internet exposure"),
        ("asset", "business_criticality", "Business criticality"),
        ("asset", "patch_complexity", "Patch complexity"),
        ("finding", "component_name", "Component"),
        ("finding", "component_version", "Component version"),
        ("finding", "match_type", "Match type"),
        ("finding", "match_confidence", "Match confidence"),
    ]
    return [ExplanationSignal(group=group, key=key, label=label, value=row[key]) for group, key, label in labels if key in row]


async def explain_item(session: AsyncSession, job_id: UUID, candidate_id: UUID, entity_id: UUID) -> ComparisonExplanation:
    """Input signals of one item and how the two scenarios weigh them.

    Per-factor contributions are not recomputed: that would duplicate the scoring
    engines. The weight shares used by each run are shown instead.
    """
    job = await _comparison_job(session, job_id)
    cte, params = await compared_cte(session, job, candidate_id)
    params["entity_id"] = entity_id
    row = (await session.execute(text(f"{cte} SELECT * FROM compared WHERE entity_id = :entity_id"), params)).mappings().first()
    if row is None:
        raise LookupError("Item not found in this comparison")
    runs = {
        run.target_id: run for run in (await session.execute(select(ScoringRun).where(ScoringRun.job_id == job.id))).scalars()
    }
    baseline_run = runs.get(UUID(job.request["baseline_id"]))
    candidate_run = runs.get(candidate_id)
    baseline_snapshot = baseline_run.config_snapshot if baseline_run else None
    candidate_snapshot = candidate_run.config_snapshot if candidate_run else None

    def thresholds(snapshot: dict[str, Any] | None) -> dict[str, dict[str, float]]:
        return {stage: config.get("thresholds", {}) for stage, config in _stage_configs(job.scope, snapshot).items()}

    return ComparisonExplanation(
        item=ComparisonItem.model_validate(dict(row)),
        signals=await _signals(session, entity_type(job.scope), entity_id),
        factors=_factors(job.scope, baseline_snapshot, candidate_snapshot),
        thresholds={"baseline": thresholds(baseline_snapshot), "candidate": thresholds(candidate_snapshot)},
    )


# ---------------------------------------------------------------------------
# Population preview
# ---------------------------------------------------------------------------

BASE_TABLES = {"vulnerability": "vulnerabilities", "asset": "assets", "finding": "findings"}


async def preview_subset(session: AsyncSession, scope: str, subset: ComparisonFilters) -> SubsetPreview:
    """How many entities a population definition selects (before scoring)."""
    table = BASE_TABLES[entity_type(scope)]
    conditions, params = entity_filter_sql(scope, subset, "x.id", "pop_")
    total = (await session.execute(text(f"SELECT COUNT(*) FROM {table} x"))).scalar_one()
    count = (await session.execute(
        text(f"SELECT COUNT(*) FROM {table} x WHERE {' AND '.join(['TRUE', *conditions])}"), params
    )).scalar_one()
    return SubsetPreview(count=count, total=total)
