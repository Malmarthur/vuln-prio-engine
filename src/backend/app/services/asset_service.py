from __future__ import annotations

import logging
from typing import Any, Iterable
from uuid import UUID

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.asset import Asset, AssetComponent
from app.services.cpe import cpe_fields

logger = logging.getLogger(__name__)

ASSET_METRICS = {
    "internet_exposure": {"internet", "internal", "isolated", "unknown"},
    "business_criticality": {"critical", "high", "medium", "low", "unknown"},
    "patch_complexity": {"high", "medium", "low", "unknown"},
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
) -> tuple[list[Asset], int]:
    filters = _asset_filters(search, internet_exposure, business_criticality, patch_complexity)
    where_clause = and_(*filters) if filters else None

    count_stmt = select(func.count(Asset.id))
    if where_clause is not None:
        count_stmt = count_stmt.where(where_clause)
    total = (await session.execute(count_stmt)).scalar_one()

    stmt = (
        select(Asset)
        .options(selectinload(Asset.components))
        .order_by(Asset.updated_at.desc().nulls_last())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    if where_clause is not None:
        stmt = stmt.where(where_clause)
    rows = await session.execute(stmt)
    return rows.scalars().unique().all(), total


async def get_asset(session: AsyncSession, asset_id: UUID) -> Asset | None:
    result = await session.execute(
        select(Asset)
        .options(selectinload(Asset.components))
        .where(Asset.id == asset_id)
    )
    return result.scalar_one_or_none()


async def get_asset_stats(session: AsyncSession) -> dict[str, Any]:
    total = (await session.execute(select(func.count(Asset.id)))).scalar_one()
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
    return {
        "total_assets": total,
        "total_components": components,
        "components_with_cpe": with_cpe,
        "exposure_distribution": {row[0]: row[1] for row in exposure_rows},
        "criticality_distribution": {row[0]: row[1] for row in criticality_rows},
    }


def _asset_filters(
    search: str | None,
    internet_exposure: str | None,
    business_criticality: str | None,
    patch_complexity: str | None,
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
