from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

import polars as pl
from sqlalchemy import Float, and_, bindparam, func, or_, select, text, tuple_
from sqlalchemy.dialects.postgresql import JSONB, insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload, selectinload, with_loader_criteria

from app.models.asset import Asset, AssetComponent, AssetScore, Finding, FindingScore, VulnerabilityProduct
from app.models.vulnerability import Vulnerability, VulnerabilityScore
from app.schemas.finding import FindingScoringProfile
from app.schemas.scoring import ScoringProfile
from app.services.asset_service import compute_asset_scores
from app.services.cpe import VersionMatcher, cpe_product_candidates
from app.services.scoring_service import compute_scores, get_scoring_profile
from app.models.ingestion_log import IngestionLog
from app.services.vulnerability_service import backfill_vulnerability_products, get_setting, set_setting

logger = logging.getLogger(__name__)

MATCH_UPSERT_BATCH_SIZE = 3_000
CANDIDATE_KEY_BATCH_SIZE = 1_000
CPE_VERSION_WILDCARDS = ["*", "-", ""]
VERSION_MATCHER = VersionMatcher()

DEFAULT_FINDING_SCORING_PROFILE: dict[str, Any] = {
    "thresholds": {"P0": 76, "P1": 51, "P2": 26, "P3": 0},
    "weights": {
        "vulnerability_priority": 50,
        "asset_priority": 50,
    },
}
LEGACY_FINDING_PRIORITY_MAP = {"V0": "P0", "V1": "P1", "V2": "P2", "V3": "P3"}
LAST_MATCHED_SETTING = "findings_last_matched_at"


async def run_matching(session: AsyncSession) -> dict[str, int]:
    # Record when this run started so data that lands during the run still
    # counts as newer than the matching.
    started_at = (await session.execute(select(func.now()))).scalar_one()
    product_rows = (await session.execute(select(func.count(VulnerabilityProduct.id)))).scalar_one()
    if product_rows == 0:
        await backfill_vulnerability_products(session)

    component_filters = (
        AssetComponent.cpe_part.is_not(None),
        AssetComponent.cpe_vendor.is_not(None),
        AssetComponent.cpe_product.is_not(None),
    )
    components_processed = (
        await session.execute(select(func.count(AssetComponent.id)).where(*component_filters))
    ).scalar_one()
    candidate_rows = await _load_candidate_rows(session)
    matched_findings = _evaluate_candidate_matches(candidate_rows)
    await _bulk_upsert_findings(session, matched_findings)
    await session.commit()
    await set_setting(session, LAST_MATCHED_SETTING, started_at.isoformat())

    logger.info(
        "Finding matching evaluated %d candidates and matched %d",
        len(candidate_rows),
        len(matched_findings),
    )
    return {
        "components_processed": components_processed,
        "candidates": len(candidate_rows),
        "findings_matched": len(matched_findings),
    }


async def _load_candidate_rows(session: AsyncSession) -> list[dict[str, Any]]:
    components_stmt = (
        select(
            AssetComponent.asset_id.label("asset_id"),
            AssetComponent.id.label("asset_component_id"),
            func.coalesce(AssetComponent.version, AssetComponent.cpe_version).label("asset_version"),
            AssetComponent.cpe_part.label("cpe_part"),
            AssetComponent.cpe_vendor.label("cpe_vendor"),
            AssetComponent.cpe_product.label("cpe_product"),
        )
        .where(
            AssetComponent.cpe_part.is_not(None),
            AssetComponent.cpe_vendor.is_not(None),
            AssetComponent.cpe_product.is_not(None),
        )
        .order_by(AssetComponent.id)
    )
    components_result = await session.execute(components_stmt)
    components_by_key: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for row in components_result.mappings().all():
        for product in cpe_product_candidates(row["cpe_vendor"], row["cpe_product"]):
            key = (row["cpe_part"], row["cpe_vendor"], product)
            components_by_key.setdefault(key, []).append(
                {
                    "asset_id": row["asset_id"],
                    "asset_component_id": row["asset_component_id"],
                    "asset_version": row["asset_version"],
                    "asset_cpe_vendor": row["cpe_vendor"],
                    "asset_cpe_product": row["cpe_product"],
                }
            )
    if not components_by_key:
        return []

    candidate_rows: list[dict[str, Any]] = []
    keys = list(components_by_key)
    for offset in range(0, len(keys), CANDIDATE_KEY_BATCH_SIZE):
        key_batch = keys[offset : offset + CANDIDATE_KEY_BATCH_SIZE]
        products_stmt = select(
            VulnerabilityProduct.vulnerability_id,
            VulnerabilityProduct.cpe_part,
            VulnerabilityProduct.cpe_vendor,
            VulnerabilityProduct.cpe_product,
            VulnerabilityProduct.cpe_version,
            VulnerabilityProduct.version_start,
            VulnerabilityProduct.version_start_including,
            VulnerabilityProduct.version_end,
            VulnerabilityProduct.version_end_including,
        ).where(
            tuple_(
                VulnerabilityProduct.cpe_part,
                VulnerabilityProduct.cpe_vendor,
                VulnerabilityProduct.cpe_product,
            ).in_(key_batch)
        )
        products_result = await session.execute(products_stmt)
        for product_row in products_result.mappings().all():
            key = (product_row["cpe_part"], product_row["cpe_vendor"], product_row["cpe_product"])
            for component in components_by_key.get(key, []):
                candidate_rows.append(
                    {
                        "asset_id": str(component["asset_id"]),
                        "asset_component_id": str(component["asset_component_id"]),
                        "asset_version": component["asset_version"],
                        "asset_cpe_vendor": component["asset_cpe_vendor"],
                        "asset_cpe_product": component["asset_cpe_product"],
                        "vulnerability_id": str(product_row["vulnerability_id"]),
                        "cpe_vendor": product_row["cpe_vendor"],
                        "cpe_product": product_row["cpe_product"],
                        "cpe_version": product_row["cpe_version"],
                        "version_start": product_row["version_start"],
                        "version_start_including": product_row["version_start_including"],
                        "version_end": product_row["version_end"],
                        "version_end_including": product_row["version_end_including"],
                    }
                )
    return candidate_rows


def _evaluate_candidate_matches(candidate_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not candidate_rows:
        return []

    df = pl.DataFrame(
        candidate_rows,
        schema_overrides={
            "asset_id": pl.String,
            "asset_component_id": pl.String,
            "asset_version": pl.String,
            "asset_cpe_vendor": pl.String,
            "asset_cpe_product": pl.String,
            "vulnerability_id": pl.String,
            "cpe_vendor": pl.String,
            "cpe_product": pl.String,
            "cpe_version": pl.String,
            "version_start": pl.String,
            "version_start_including": pl.Boolean,
            "version_end": pl.String,
            "version_end_including": pl.Boolean,
        },
    ).with_columns(
        has_exact_version=pl.col("cpe_version").is_not_null() & ~pl.col("cpe_version").is_in(CPE_VERSION_WILDCARDS),
        has_bounds=pl.col("version_start").is_not_null() | pl.col("version_end").is_not_null(),
    )

    select_cols = [
        "asset_id",
        "asset_component_id",
        "vulnerability_id",
        "match_type",
        "match_confidence",
    ]
    matched_frames: list[pl.DataFrame] = []

    exact_matches = (
        df.filter(pl.col("has_exact_version") & pl.col("asset_version").is_not_null())
        .with_columns(
            version_match=pl.struct("asset_version", "cpe_version").map_elements(
                _candidate_exact_version_match,
                return_dtype=pl.Struct({"matched": pl.Boolean, "match_type": pl.String, "match_confidence": pl.Float64}),
            )
        )
        .unnest("version_match")
        .filter(pl.col("matched"))
        .with_columns(
            match_type=pl.col("match_type"),
            match_confidence=pl.col("match_confidence"),
        )
        .select(select_cols)
    )
    if exact_matches.height:
        matched_frames.append(exact_matches)

    range_matches = (
        df.filter(~pl.col("has_exact_version") & pl.col("has_bounds") & pl.col("asset_version").is_not_null())
        .with_columns(
            matches_bounds=pl.struct(
                "asset_version",
                "version_start",
                "version_start_including",
                "version_end",
                "version_end_including",
            ).map_elements(
                _candidate_range_version_match,
                return_dtype=pl.Struct({"matched": pl.Boolean, "match_type": pl.String, "match_confidence": pl.Float64}),
            )
        )
        .unnest("matches_bounds")
        .filter(pl.col("matched"))
        .with_columns(
            match_type=pl.col("match_type"),
            match_confidence=pl.col("match_confidence"),
        )
        .select(select_cols)
    )
    if range_matches.height:
        matched_frames.append(range_matches)

    wildcard_matches = (
        df.filter(~pl.col("has_exact_version") & ~pl.col("has_bounds"))
        .with_columns(
            match_type=pl.lit("product_wildcard"),
            match_confidence=pl.lit(65.0),
        )
        .select(select_cols)
    )
    if wildcard_matches.height:
        matched_frames.append(wildcard_matches)

    if not matched_frames:
        return []

    matches = (
        pl.concat(matched_frames)
        .sort(
            ["asset_component_id", "vulnerability_id", "match_confidence"],
            descending=[False, False, True],
        )
        .unique(subset=["asset_component_id", "vulnerability_id"], keep="first", maintain_order=True)
    )
    return [
        {
            "asset_id": UUID(row["asset_id"]),
            "asset_component_id": UUID(row["asset_component_id"]),
            "vulnerability_id": UUID(row["vulnerability_id"]),
            "match_type": row["match_type"],
            "match_confidence": float(row["match_confidence"]),
        }
        for row in matches.to_dicts()
    ]


def _candidate_exact_version_match(row: dict[str, Any]) -> dict[str, Any]:
    match = VERSION_MATCHER.match_exact(row["asset_version"], row["cpe_version"])
    return {"matched": match.matched, "match_type": match.match_type, "match_confidence": match.confidence}


def _candidate_range_version_match(row: dict[str, Any]) -> dict[str, Any]:
    match = VERSION_MATCHER.match_range(
        row["asset_version"],
        row["version_start"],
        row["version_start_including"],
        row["version_end"],
        row["version_end_including"],
    )
    return {"matched": match.matched, "match_type": match.match_type, "match_confidence": match.confidence}


async def _bulk_upsert_findings(session: AsyncSession, findings: list[dict[str, Any]]) -> None:
    for offset in range(0, len(findings), MATCH_UPSERT_BATCH_SIZE):
        batch = findings[offset : offset + MATCH_UPSERT_BATCH_SIZE]
        stmt = insert(Finding).values(batch)
        stmt = stmt.on_conflict_do_update(
            index_elements=["asset_component_id", "vulnerability_id"],
            set_={
                "match_type": stmt.excluded.match_type,
                "match_confidence": stmt.excluded.match_confidence,
                "last_seen_at": func.now(),
            },
        )
        await session.execute(stmt)


async def list_findings(
    session: AsyncSession,
    *,
    page: int = 1,
    per_page: int = 50,
    search: str | None = None,
    asset_id: UUID | None = None,
    priority_level: str | None = None,
    kev_only: bool = False,
    internet_exposure: str | None = None,
    business_criticality: str | None = None,
    patch_complexity: str | None = None,
    preset_id: UUID | None = None,
) -> tuple[list[Finding], int]:
    from app.services.profile_service import resolve_context
    context = await resolve_context(session, preset_id)
    filters = _finding_filters(
        search,
        asset_id,
        priority_level,
        kev_only,
        internet_exposure,
        business_criticality,
        patch_complexity,
    )
    where_clause = and_(*filters) if filters else None
    needs_score_join = True

    count_stmt = select(func.count(Finding.id)).join(Finding.asset).join(Finding.vulnerability)
    if needs_score_join:
        count_stmt = count_stmt.outerjoin(FindingScore, and_(FindingScore.finding_id == Finding.id, FindingScore.scoring_context_id == context.id))
    if where_clause is not None:
        count_stmt = count_stmt.where(where_clause)
    total = (await session.execute(count_stmt)).scalar_one()

    stmt = (
        select(Finding)
        .options(
            joinedload(Finding.asset).selectinload(Asset.score),
            joinedload(Finding.component),
            joinedload(Finding.vulnerability).selectinload(Vulnerability.score),
            contains_eager(Finding.score),
            with_loader_criteria(AssetScore, AssetScore.asset_profile_id == context.asset_profile_id),
            with_loader_criteria(VulnerabilityScore, VulnerabilityScore.vulnerability_profile_id == context.vulnerability_profile_id),
        )
        .join(Finding.asset)
        .join(Finding.vulnerability)
        .outerjoin(FindingScore, and_(FindingScore.finding_id == Finding.id, FindingScore.scoring_context_id == context.id))
        .order_by(FindingScore.priority_score.desc().nulls_last(), Finding.last_seen_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    if where_clause is not None:
        stmt = stmt.where(where_clause)
    result = await session.execute(stmt)
    return result.scalars().unique().all(), total


async def get_finding_stats(session: AsyncSession, preset_id: UUID | None = None) -> dict[str, Any]:
    from app.services.profile_service import resolve_context
    context = await resolve_context(session, preset_id)
    total = (await session.execute(select(func.count(Finding.id)))).scalar_one()
    scored = (
        await session.execute(select(func.count(FindingScore.finding_id)).where(FindingScore.scoring_context_id == context.id, FindingScore.priority_score.is_not(None)))
    ).scalar_one()
    priority_rows = (
        await session.execute(select(FindingScore.priority_level, func.count(FindingScore.finding_id)).where(FindingScore.scoring_context_id == context.id).group_by(FindingScore.priority_level))
    ).all()
    exposure_rows = (
        await session.execute(
            select(Asset.internet_exposure, func.count(Finding.id)).join(Finding, Finding.asset_id == Asset.id).group_by(Asset.internet_exposure)
        )
    ).all()
    priority_distribution: dict[str, int] = {}
    for row in priority_rows:
        level = normalize_finding_priority_level(row[0])
        if level:
            priority_distribution[level] = priority_distribution.get(level, 0) + row[1]

    return {
        "total_findings": total,
        "scored_findings": scored,
        "unscored_findings": total - scored,
        "priority_distribution": priority_distribution,
        "exposure_distribution": {row[0]: row[1] for row in exposure_rows},
    }


async def get_finding_freshness(session: AsyncSession, preset_id: UUID | None = None) -> dict[str, Any]:
    """Tell whether findings lag behind their inputs.

    Matching is stale when NVD data or assets changed after the last matching
    run; scoring is stale when findings have no score in the active context.
    """
    from app.services.profile_service import resolve_context

    raw_last_matched = await get_setting(session, LAST_MATCHED_SETTING)
    last_matched_at = datetime.fromisoformat(raw_last_matched) if raw_last_matched else None
    if last_matched_at is None:
        # Deployments that matched before this setting existed.
        last_matched_at = (await session.execute(select(func.max(Finding.last_seen_at)))).scalar_one()

    # Failed NVD runs count too: they may have committed some batches before failing.
    vulnerabilities_updated_at = (
        await session.execute(
            select(func.max(IngestionLog.finished_at)).where(
                IngestionLog.source == "nvd", IngestionLog.status.in_(("success", "failed"))
            )
        )
    ).scalar_one()
    assets_updated_at = (await session.execute(select(func.max(Asset.updated_at)))).scalar_one()
    matchable_components = (
        await session.execute(
            select(func.count(AssetComponent.id)).where(
                AssetComponent.cpe_part.is_not(None),
                AssetComponent.cpe_vendor.is_not(None),
                AssetComponent.cpe_product.is_not(None),
            )
        )
    ).scalar_one()
    vulnerability_count = (await session.execute(select(func.count(Vulnerability.id)))).scalar_one()

    reasons: list[str] = []
    if matchable_components and vulnerability_count:
        if last_matched_at is None:
            reasons.append("never_matched")
        else:
            if vulnerabilities_updated_at and vulnerabilities_updated_at > last_matched_at:
                reasons.append("vulnerabilities_updated")
            if assets_updated_at and assets_updated_at > last_matched_at:
                reasons.append("assets_updated")
    matching_stale = bool(reasons)

    context = await resolve_context(session, preset_id)
    total = (await session.execute(select(func.count(Finding.id)))).scalar_one()
    scored = (
        await session.execute(
            select(func.count(FindingScore.finding_id)).where(
                FindingScore.scoring_context_id == context.id,
                FindingScore.priority_score.is_not(None),
            )
        )
    ).scalar_one()
    unscored = total - scored
    if unscored:
        reasons.append("findings_unscored")

    return {
        "matching_stale": matching_stale,
        "scoring_stale": unscored > 0,
        "reasons": reasons,
        "last_matched_at": last_matched_at,
        "vulnerabilities_updated_at": vulnerabilities_updated_at,
        "assets_updated_at": assets_updated_at,
        "unscored_findings": unscored,
    }


async def get_finding_scoring_profile(session: AsyncSession) -> FindingScoringProfile:
    from app.services.profile_service import get_active_profile
    raw = (await get_active_profile(session, "finding")).config
    return FindingScoringProfile.model_validate(_normalize_finding_scoring_profile(raw))


async def save_finding_scoring_profile(session: AsyncSession, profile: FindingScoringProfile) -> None:
    from app.services.profile_service import save_active_profile_config
    await save_active_profile_config(session, "finding", profile.model_dump())


async def compute_finding_scores(
    session: AsyncSession,
    scoring_profile: FindingScoringProfile | None = None,
    context_id: UUID | None = None,
    vulnerability_profile_id: UUID | None = None,
    asset_profile_id: UUID | None = None,
    profile_revisions: dict[str, int] | None = None,
    scoring_run_id: UUID | None = None,
) -> tuple[int, dict[str, int]]:
    if context_id is None:
        from app.models.scoring import ScoringProfile as NamedScoringProfile
        from app.services.profile_service import get_active_preset
        _, context = await get_active_preset(session)
        context_id = context.id
        vulnerability_profile_id = context.vulnerability_profile_id
        asset_profile_id = context.asset_profile_id
        finding_named = await session.get(NamedScoringProfile, context.finding_profile_id)
        scoring_profile = scoring_profile or FindingScoringProfile.model_validate(finding_named.config)
        vuln_named = await session.get(NamedScoringProfile, vulnerability_profile_id)
        asset_named = await session.get(NamedScoringProfile, asset_profile_id)
        await compute_scores(session, ScoringProfile.model_validate(vuln_named.config), vuln_named.id, vuln_named.revision)
        await compute_asset_scores(session, None, asset_named.id, asset_named.revision)
        profile_revisions = {str(vuln_named.id): vuln_named.revision, str(asset_named.id): asset_named.revision, str(finding_named.id): finding_named.revision}
    profile = scoring_profile.model_dump()
    weights = profile["weights"]
    thresholds = profile["thresholds"]

    params = _score_params(weights, thresholds)
    params.update({
        "context_id": context_id,
        "vulnerability_profile_id": vulnerability_profile_id,
        "asset_profile_id": asset_profile_id,
        "profile_revisions": profile_revisions or {},
        "scoring_run_id": scoring_run_id,
    })
    stmt = text(
        """
            INSERT INTO finding_scores (
                finding_id, scoring_context_id, priority_score, priority_confidence, priority_level,
                profile_revisions, scoring_run_id
            )
            SELECT
                f.id,
                :context_id,
                ROUND((
                    COALESCE(vs.priority_score, 100) * :vuln_factor +
                    COALESCE(ars.priority_score, 100) * :asset_factor
                )::numeric, 1),
                ROUND((
                    COALESCE(vs.priority_confidence, 0) * :vuln_conf_factor +
                    COALESCE(ars.priority_confidence, 0) * :asset_conf_factor +
                    f.match_confidence * :match_conf_factor
                )::numeric, 1),
                CASE
                    WHEN (
                        COALESCE(vs.priority_score, 100) * :vuln_factor +
                        COALESCE(ars.priority_score, 100) * :asset_factor
                    ) >= :t_p0 THEN 'P0'
                    WHEN (
                        COALESCE(vs.priority_score, 100) * :vuln_factor +
                        COALESCE(ars.priority_score, 100) * :asset_factor
                    ) >= :t_p1 THEN 'P1'
                    WHEN (
                        COALESCE(vs.priority_score, 100) * :vuln_factor +
                        COALESCE(ars.priority_score, 100) * :asset_factor
                    ) >= :t_p2 THEN 'P2'
                    ELSE 'P3'
                END,
                CAST(:profile_revisions AS jsonb),
                :scoring_run_id
            FROM findings f
            LEFT JOIN vulnerability_scores vs ON vs.vulnerability_id = f.vulnerability_id
                AND vs.vulnerability_profile_id = :vulnerability_profile_id
            LEFT JOIN asset_scores ars ON ars.asset_id = f.asset_id
                AND ars.asset_profile_id = :asset_profile_id
            ON CONFLICT (finding_id, scoring_context_id) DO UPDATE SET
                priority_score = EXCLUDED.priority_score,
                priority_confidence = EXCLUDED.priority_confidence,
                priority_level = EXCLUDED.priority_level,
                profile_revisions = EXCLUDED.profile_revisions,
                scoring_run_id = EXCLUDED.scoring_run_id
            """
    ).bindparams(*[
        bindparam(name, type_=Float)
        for name in params
        if name not in {"context_id", "vulnerability_profile_id", "asset_profile_id", "profile_revisions", "scoring_run_id"}
    ], bindparam("profile_revisions", type_=JSONB))
    await session.execute(
        stmt,
        params,
    )
    await session.commit()

    rows = (await session.execute(select(func.count(FindingScore.finding_id)).where(FindingScore.scoring_context_id == context_id))).scalar_one()
    dist_rows = (
        await session.execute(select(FindingScore.priority_level, func.count(FindingScore.finding_id)).where(FindingScore.scoring_context_id == context_id).group_by(FindingScore.priority_level))
    ).all()
    return rows, {row[0]: row[1] for row in dist_rows if row[0]}


def _score_params(weights: dict[str, float], thresholds: dict[str, float]) -> dict[str, float]:
    total_weight = float(sum(weights.values()))
    confidence_total = total_weight + 50.0
    vuln_weight = float(weights["vulnerability_priority"])
    asset_weight = float(weights["asset_priority"])
    match_weight = 50.0
    return {
        "vuln_factor": vuln_weight / total_weight,
        "asset_factor": asset_weight / total_weight,
        "vuln_conf_factor": vuln_weight / confidence_total,
        "asset_conf_factor": asset_weight / confidence_total,
        "match_conf_factor": match_weight / confidence_total,
        "t_p0": float(thresholds["P0"]),
        "t_p1": float(thresholds["P1"]),
        "t_p2": float(thresholds["P2"]),
    }


def _finding_filters(
    search: str | None,
    asset_id: UUID | None,
    priority_level: str | None,
    kev_only: bool,
    internet_exposure: str | None,
    business_criticality: str | None,
    patch_complexity: str | None,
) -> list[Any]:
    filters: list[Any] = []
    if search:
        filters.append(
            or_(
                Asset.name.ilike(f"%{search}%"),
                Vulnerability.cve_id.ilike(f"%{search}%"),
                Vulnerability.summary.ilike(f"%{search}%"),
            )
        )
    if asset_id:
        filters.append(Finding.asset_id == asset_id)
    if priority_level:
        filters.append(FindingScore.priority_level.in_(_finding_priority_filter_values(priority_level)))
    if kev_only:
        filters.append(Vulnerability.kev_known_exploited == True)  # noqa: E712
    if internet_exposure:
        filters.append(Asset.internet_exposure == internet_exposure)
    if business_criticality:
        filters.append(Asset.business_criticality == business_criticality)
    if patch_complexity:
        filters.append(Asset.patch_complexity == patch_complexity)
    return filters


def normalize_finding_priority_level(priority_level: str | None) -> str | None:
    if priority_level is None:
        return None
    return LEGACY_FINDING_PRIORITY_MAP.get(priority_level, priority_level)


def _finding_priority_filter_values(priority_level: str) -> list[str]:
    legacy_by_new = {new: old for old, new in LEGACY_FINDING_PRIORITY_MAP.items()}
    values = [priority_level]
    if priority_level in legacy_by_new:
        values.append(legacy_by_new[priority_level])
    return values


def _normalize_finding_scoring_profile(raw: dict[str, Any]) -> dict[str, Any]:
    thresholds = raw.get("thresholds")
    if isinstance(thresholds, dict) and "P0" not in thresholds and "V0" in thresholds:
        raw = {**raw, "thresholds": {
            "P0": thresholds.get("V0"),
            "P1": thresholds.get("V1"),
            "P2": thresholds.get("V2"),
            "P3": thresholds.get("V3"),
        }}
    weights = raw.get("weights")
    if isinstance(weights, dict) and "asset_priority" not in weights:
        asset_weight = (
            float(weights.get("internet_exposure") or 0)
            + float(weights.get("business_criticality") or 0)
            + float(weights.get("patch_complexity") or 0)
        )
        raw = {
            **raw,
            "weights": {
                "vulnerability_priority": weights.get("vulnerability_priority", 50),
                "asset_priority": asset_weight if asset_weight > 0 else 50,
            },
        }
    if "values" in raw:
        raw = {key: value for key, value in raw.items() if key != "values"}
    return raw
