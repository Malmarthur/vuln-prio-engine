from __future__ import annotations

import logging
from typing import Any, Iterable
from uuid import UUID

from sqlalchemy import Float, and_, bindparam, delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, selectinload

from app.models.asset import Asset, AssetComponent, AssetScore
from app.schemas.asset import AssetScoringProfile
from app.services.cpe import cpe_fields

logger = logging.getLogger(__name__)

ASSET_METRICS = {
    "internet_exposure": {"internet", "internal", "isolated", "unknown"},
    "business_criticality": {"critical", "high", "medium", "low", "unknown"},
    "patch_complexity": {"high", "medium", "low", "unknown"},
}
DEFAULT_ASSET_SCORING_PROFILE: dict[str, Any] = {
    "thresholds": {"A0": 76, "A1": 51, "A2": 26, "A3": 0},
    "weights": {
        "internet_exposure": 40,
        "business_criticality": 40,
        "patch_complexity": 20,
    },
    "values": {
        "internet_exposure": {"internet": 100, "internal": 45, "isolated": 10, "unknown": 65},
        "business_criticality": {"critical": 100, "high": 75, "medium": 45, "low": 15, "unknown": 65},
        "patch_complexity": {"high": 100, "medium": 55, "low": 20, "unknown": 65},
    },
}

_METRIC_PROPERTY_NAMES = {
    "vulnprio:internet_exposure": "internet_exposure",
    "vulnprio:business_criticality": "business_criticality",
    "vulnprio:patch_complexity": "patch_complexity",
}
_CPE_PROPERTY_NAMES = {"cpe", "cpe23", "cpe_2_3", "vulnprio:cpe"}
_PURL_PROPERTY_NAMES = {"purl", "package-url", "vulnprio:purl"}


async def import_cyclonedx_asset(session: AsyncSession, bom: dict[str, Any]) -> tuple[Asset, int]:
    if not isinstance(bom, dict):
        raise ValueError("CycloneDX payload must be a JSON object")

    metadata = bom.get("metadata") or {}
    metadata_component = metadata.get("component") or {}
    external_id = _asset_external_id(bom, metadata_component)
    name = metadata_component.get("name") or bom.get("name") or external_id
    asset_type = metadata_component.get("type") or "application"
    metrics = _extract_metrics(bom, metadata_component)

    result = await session.execute(select(Asset).where(Asset.external_id == external_id))
    asset = result.scalar_one_or_none()
    if asset is None:
        asset = Asset(external_id=external_id)
        session.add(asset)

    asset.name = str(name)
    asset.asset_type = str(asset_type)
    asset.source = "cyclonedx"
    asset.raw_payload = bom
    asset.internet_exposure = metrics["internet_exposure"]
    asset.business_criticality = metrics["business_criticality"]
    asset.patch_complexity = metrics["patch_complexity"]
    await session.flush()

    await session.execute(delete(AssetComponent).where(AssetComponent.asset_id == asset.id))
    components = [_component_from_cyclonedx(asset.id, item) for item in bom.get("components", []) if isinstance(item, dict)]
    session.add_all(components)
    await session.commit()
    await session.refresh(asset)
    logger.info("Imported CycloneDX asset %s with %d components", asset.external_id, len(components))
    return asset, len(components)


async def list_assets(
    session: AsyncSession,
    *,
    page: int = 1,
    per_page: int = 50,
    search: str | None = None,
    internet_exposure: str | None = None,
    business_criticality: str | None = None,
    patch_complexity: str | None = None,
    priority_level: str | None = None,
    preset_id: UUID | None = None,
) -> tuple[list[Asset], int]:
    from app.services.profile_service import resolve_context
    profile_id = (await resolve_context(session, preset_id)).asset_profile_id
    filters = _asset_filters(search, internet_exposure, business_criticality, patch_complexity, priority_level)
    where_clause = and_(*filters) if filters else None
    needs_score_join = True

    count_stmt = select(func.count(Asset.id))
    if needs_score_join:
        count_stmt = count_stmt.outerjoin(AssetScore, and_(AssetScore.asset_id == Asset.id, AssetScore.asset_profile_id == profile_id))
    if where_clause is not None:
        count_stmt = count_stmt.where(where_clause)
    total = (await session.execute(count_stmt)).scalar_one()

    stmt = (
        select(Asset)
        .options(selectinload(Asset.components), contains_eager(Asset.score))
        .outerjoin(AssetScore, and_(AssetScore.asset_id == Asset.id, AssetScore.asset_profile_id == profile_id))
        .order_by(AssetScore.priority_score.desc().nulls_last(), Asset.updated_at.desc().nulls_last())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    if where_clause is not None:
        stmt = stmt.where(where_clause)
    rows = await session.execute(stmt)
    assets = rows.scalars().unique().all()
    from app.services.product_resolution_service import attach_latest_resolutions
    await attach_latest_resolutions(session, assets)
    return assets, total


async def get_asset(session: AsyncSession, asset_id: UUID, preset_id: UUID | None = None) -> Asset | None:
    from app.services.profile_service import resolve_context
    profile_id = (await resolve_context(session, preset_id)).asset_profile_id
    result = await session.execute(
        select(Asset)
        .options(selectinload(Asset.components), contains_eager(Asset.score))
        .outerjoin(AssetScore, and_(AssetScore.asset_id == Asset.id, AssetScore.asset_profile_id == profile_id))
        .where(Asset.id == asset_id)
    )
    asset = result.scalars().unique().one_or_none()
    if asset:
        from app.services.product_resolution_service import attach_latest_resolutions
        await attach_latest_resolutions(session, [asset])
    return asset


async def get_asset_stats(session: AsyncSession, preset_id: UUID | None = None) -> dict[str, Any]:
    from app.services.profile_service import resolve_context
    profile_id = (await resolve_context(session, preset_id)).asset_profile_id
    total = (await session.execute(select(func.count(Asset.id)))).scalar_one()
    scored = (
        await session.execute(select(func.count(AssetScore.asset_id)).where(AssetScore.asset_profile_id == profile_id, AssetScore.priority_score.is_not(None)))
    ).scalar_one()
    components = (await session.execute(select(func.count(AssetComponent.id)))).scalar_one()
    with_cpe = (
        await session.execute(select(func.count(AssetComponent.id)).where(AssetComponent.cpe.is_not(None)))
    ).scalar_one()
    exposure_rows = (
        await session.execute(select(Asset.internet_exposure, func.count(Asset.id)).group_by(Asset.internet_exposure))
    ).all()
    criticality_rows = (
        await session.execute(select(Asset.business_criticality, func.count(Asset.id)).group_by(Asset.business_criticality))
    ).all()
    priority_rows = (
        await session.execute(select(AssetScore.priority_level, func.count(AssetScore.asset_id)).where(AssetScore.asset_profile_id == profile_id).group_by(AssetScore.priority_level))
    ).all()
    return {
        "total_assets": total,
        "scored_assets": scored,
        "unscored_assets": total - scored,
        "total_components": components,
        "components_with_cpe": with_cpe,
        "priority_distribution": {row[0]: row[1] for row in priority_rows if row[0]},
        "exposure_distribution": {row[0]: row[1] for row in exposure_rows},
        "criticality_distribution": {row[0]: row[1] for row in criticality_rows},
    }


async def get_asset_scoring_profile(session: AsyncSession) -> AssetScoringProfile:
    from app.services.profile_service import get_active_profile
    return AssetScoringProfile.model_validate((await get_active_profile(session, "asset")).config)


async def save_asset_scoring_profile(session: AsyncSession, profile: AssetScoringProfile) -> None:
    from app.services.profile_service import save_active_profile_config
    await save_active_profile_config(session, "asset", profile.model_dump())


async def compute_asset_scores(
    session: AsyncSession,
    scoring_profile: AssetScoringProfile | None = None,
    profile_id: UUID | None = None,
    profile_revision: int = 1,
    scoring_run_id: UUID | None = None,
) -> tuple[int, dict[str, int]]:
    if scoring_profile is None or profile_id is None:
        from app.models.scoring import ScoringProfile as NamedScoringProfile
        from app.services.profile_service import get_active_preset
        _, context = await get_active_preset(session)
        profile_id = profile_id or context.asset_profile_id
        if scoring_profile is None:
            named = await session.get(NamedScoringProfile, profile_id)
            scoring_profile = AssetScoringProfile.model_validate(named.config)
            profile_revision = named.revision
    profile = scoring_profile.model_dump()
    params = _asset_score_params(profile["weights"], profile["values"], profile["thresholds"])
    params.update({"profile_id": profile_id, "profile_revision": profile_revision, "scoring_run_id": scoring_run_id})
    stmt = text(
        """
        INSERT INTO asset_scores (
            asset_id, asset_profile_id, priority_score, priority_confidence, priority_level,
            profile_revision, scoring_run_id
        )
        SELECT
            a.id,
            :profile_id,
            ROUND((
                CASE a.internet_exposure
                    WHEN 'internet' THEN :exposure_internet
                    WHEN 'internal' THEN :exposure_internal
                    WHEN 'isolated' THEN :exposure_isolated
                    ELSE :exposure_unknown
                END * :exposure_factor +
                CASE a.business_criticality
                    WHEN 'critical' THEN :criticality_critical
                    WHEN 'high' THEN :criticality_high
                    WHEN 'medium' THEN :criticality_medium
                    WHEN 'low' THEN :criticality_low
                    ELSE :criticality_unknown
                END * :criticality_factor +
                CASE a.patch_complexity
                    WHEN 'high' THEN :patch_high
                    WHEN 'medium' THEN :patch_medium
                    WHEN 'low' THEN :patch_low
                    ELSE :patch_unknown
                END * :patch_factor
            )::numeric, 1),
            ROUND((
                CASE WHEN a.internet_exposure <> 'unknown' THEN 100 ELSE 0 END * :exposure_factor +
                CASE WHEN a.business_criticality <> 'unknown' THEN 100 ELSE 0 END * :criticality_factor +
                CASE WHEN a.patch_complexity <> 'unknown' THEN 100 ELSE 0 END * :patch_factor
            )::numeric, 1),
            CASE
                WHEN (
                    CASE a.internet_exposure
                        WHEN 'internet' THEN :exposure_internet
                        WHEN 'internal' THEN :exposure_internal
                        WHEN 'isolated' THEN :exposure_isolated
                        ELSE :exposure_unknown
                    END * :exposure_factor +
                    CASE a.business_criticality
                        WHEN 'critical' THEN :criticality_critical
                        WHEN 'high' THEN :criticality_high
                        WHEN 'medium' THEN :criticality_medium
                        WHEN 'low' THEN :criticality_low
                        ELSE :criticality_unknown
                    END * :criticality_factor +
                    CASE a.patch_complexity
                        WHEN 'high' THEN :patch_high
                        WHEN 'medium' THEN :patch_medium
                        WHEN 'low' THEN :patch_low
                        ELSE :patch_unknown
                    END * :patch_factor
                ) >= :t_a0 THEN 'A0'
                WHEN (
                    CASE a.internet_exposure
                        WHEN 'internet' THEN :exposure_internet
                        WHEN 'internal' THEN :exposure_internal
                        WHEN 'isolated' THEN :exposure_isolated
                        ELSE :exposure_unknown
                    END * :exposure_factor +
                    CASE a.business_criticality
                        WHEN 'critical' THEN :criticality_critical
                        WHEN 'high' THEN :criticality_high
                        WHEN 'medium' THEN :criticality_medium
                        WHEN 'low' THEN :criticality_low
                        ELSE :criticality_unknown
                    END * :criticality_factor +
                    CASE a.patch_complexity
                        WHEN 'high' THEN :patch_high
                        WHEN 'medium' THEN :patch_medium
                        WHEN 'low' THEN :patch_low
                        ELSE :patch_unknown
                    END * :patch_factor
                ) >= :t_a1 THEN 'A1'
                WHEN (
                    CASE a.internet_exposure
                        WHEN 'internet' THEN :exposure_internet
                        WHEN 'internal' THEN :exposure_internal
                        WHEN 'isolated' THEN :exposure_isolated
                        ELSE :exposure_unknown
                    END * :exposure_factor +
                    CASE a.business_criticality
                        WHEN 'critical' THEN :criticality_critical
                        WHEN 'high' THEN :criticality_high
                        WHEN 'medium' THEN :criticality_medium
                        WHEN 'low' THEN :criticality_low
                        ELSE :criticality_unknown
                    END * :criticality_factor +
                    CASE a.patch_complexity
                        WHEN 'high' THEN :patch_high
                        WHEN 'medium' THEN :patch_medium
                        WHEN 'low' THEN :patch_low
                        ELSE :patch_unknown
                    END * :patch_factor
                ) >= :t_a2 THEN 'A2'
                ELSE 'A3'
            END,
            :profile_revision,
            :scoring_run_id
        FROM assets a
        ON CONFLICT (asset_id, asset_profile_id) DO UPDATE SET
            priority_score = EXCLUDED.priority_score,
            priority_confidence = EXCLUDED.priority_confidence,
            priority_level = EXCLUDED.priority_level,
            profile_revision = EXCLUDED.profile_revision,
            scoring_run_id = EXCLUDED.scoring_run_id
        """
    ).bindparams(*[
        bindparam(name, type_=Float)
        for name in params
        if name not in {"profile_id", "profile_revision", "scoring_run_id"}
    ])
    await session.execute(stmt, params)
    await session.commit()

    rows = (await session.execute(select(func.count(AssetScore.asset_id)).where(AssetScore.asset_profile_id == profile_id))).scalar_one()
    dist_rows = (
        await session.execute(select(AssetScore.priority_level, func.count(AssetScore.asset_id)).where(AssetScore.asset_profile_id == profile_id).group_by(AssetScore.priority_level))
    ).all()
    return rows, {row[0]: row[1] for row in dist_rows if row[0]}


def _asset_score_params(
    weights: dict[str, float],
    values: dict[str, dict[str, float]],
    thresholds: dict[str, float],
) -> dict[str, float]:
    total_weight = float(sum(weights.values()))
    exposure_weight = float(weights["internet_exposure"])
    criticality_weight = float(weights["business_criticality"])
    patch_weight = float(weights["patch_complexity"])
    return {
        "exposure_factor": exposure_weight / total_weight,
        "criticality_factor": criticality_weight / total_weight,
        "patch_factor": patch_weight / total_weight,
        "exposure_internet": float(values["internet_exposure"]["internet"]),
        "exposure_internal": float(values["internet_exposure"]["internal"]),
        "exposure_isolated": float(values["internet_exposure"]["isolated"]),
        "exposure_unknown": float(values["internet_exposure"]["unknown"]),
        "criticality_critical": float(values["business_criticality"]["critical"]),
        "criticality_high": float(values["business_criticality"]["high"]),
        "criticality_medium": float(values["business_criticality"]["medium"]),
        "criticality_low": float(values["business_criticality"]["low"]),
        "criticality_unknown": float(values["business_criticality"]["unknown"]),
        "patch_high": float(values["patch_complexity"]["high"]),
        "patch_medium": float(values["patch_complexity"]["medium"]),
        "patch_low": float(values["patch_complexity"]["low"]),
        "patch_unknown": float(values["patch_complexity"]["unknown"]),
        "t_a0": float(thresholds["A0"]),
        "t_a1": float(thresholds["A1"]),
        "t_a2": float(thresholds["A2"]),
    }


def _asset_filters(
    search: str | None,
    internet_exposure: str | None,
    business_criticality: str | None,
    patch_complexity: str | None,
    priority_level: str | None,
) -> list[Any]:
    filters: list[Any] = []
    if search:
        filters.append(or_(Asset.name.ilike(f"%{search}%"), Asset.external_id.ilike(f"%{search}%")))
    if internet_exposure:
        filters.append(Asset.internet_exposure == internet_exposure)
    if business_criticality:
        filters.append(Asset.business_criticality == business_criticality)
    if patch_complexity:
        filters.append(Asset.patch_complexity == patch_complexity)
    if priority_level:
        filters.append(AssetScore.priority_level == priority_level)
    return filters


def _asset_external_id(bom: dict[str, Any], metadata_component: dict[str, Any]) -> str:
    for value in (metadata_component.get("bom-ref"), bom.get("serialNumber"), metadata_component.get("name")):
        if value:
            return str(value)
    raise ValueError("CycloneDX asset must define metadata.component.bom-ref, serialNumber, or metadata.component.name")


def _extract_metrics(bom: dict[str, Any], metadata_component: dict[str, Any]) -> dict[str, str]:
    values = {
        "internet_exposure": "unknown",
        "business_criticality": "unknown",
        "patch_complexity": "unknown",
    }
    for prop in _iter_properties(bom.get("properties")):
        _apply_metric_property(values, prop)
    for prop in _iter_properties(metadata_component.get("properties")):
        _apply_metric_property(values, prop)
    return values


def _apply_metric_property(values: dict[str, str], prop: dict[str, Any]) -> None:
    key = _METRIC_PROPERTY_NAMES.get(str(prop.get("name", "")).lower())
    if not key:
        return
    value = str(prop.get("value", "")).lower()
    values[key] = value if value in ASSET_METRICS[key] else "unknown"


def _component_from_cyclonedx(asset_id: UUID, item: dict[str, Any]) -> AssetComponent:
    cpe = _extract_component_cpe(item)
    fields = cpe_fields(cpe)
    vendor = item.get("publisher") or item.get("author") or fields["cpe_vendor"]
    product = item.get("name") or fields["cpe_product"]
    version = item.get("version") or fields["cpe_version"]
    return AssetComponent(
        asset_id=asset_id,
        bom_ref=item.get("bom-ref"),
        name=str(item.get("name") or product or "Unnamed component"),
        version=str(version) if version else None,
        vendor=str(vendor) if vendor else None,
        product=str(product) if product else None,
        purl=_extract_component_purl(item),
        cpe=cpe,
        cpe_part=fields["cpe_part"],
        cpe_vendor=fields["cpe_vendor"],
        cpe_product=fields["cpe_product"],
        cpe_version=fields["cpe_version"],
        raw_component=item,
    )


def _extract_component_cpe(item: dict[str, Any]) -> str | None:
    if item.get("cpe"):
        return str(item["cpe"])
    for ref in item.get("externalReferences") or []:
        if isinstance(ref, dict) and str(ref.get("type", "")).lower() == "cpe" and ref.get("url"):
            return str(ref["url"])
    for prop in _iter_properties(item.get("properties")):
        name = str(prop.get("name", "")).lower()
        if name in _CPE_PROPERTY_NAMES and prop.get("value"):
            return str(prop["value"])
    return None


def _extract_component_purl(item: dict[str, Any]) -> str | None:
    if item.get("purl"):
        return str(item["purl"])
    for prop in _iter_properties(item.get("properties")):
        name = str(prop.get("name", "")).lower()
        if name in _PURL_PROPERTY_NAMES and prop.get("value"):
            return str(prop["value"])
    return None


def _iter_properties(raw: Any) -> Iterable[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, dict)]
