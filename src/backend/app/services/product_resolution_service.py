from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.asset import Asset, AssetComponent
from app.models.product import Product, ProductAlias, ProductExternalBinding, ProductResolutionDecision, ProductResolutionRun
from app.services.product_resolution import CANDIDATE_SCHEMA_VERSION, MODULE_ID, MODULE_VERSION, load_catalog, normalize_identifier, resolve_component

logger = logging.getLogger(__name__)
# The operational catalog travels with the backend image.  The independent
# annotated benchmark corpus remains under repository samples/.
CATALOG_PATH = Path(__file__).parents[1] / "evaluation" / "data" / "product_catalog_v0.json"


def _digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


async def ensure_catalog(session: AsyncSession) -> tuple[list[Any], str, dict[str, Product]]:
    catalog, digest = load_catalog(CATALOG_PATH)
    keys = [item.key for item in catalog]
    existing = {item.key: item for item in (await session.execute(select(Product).where(Product.key.in_(keys)).options(selectinload(Product.aliases), selectinload(Product.bindings)))).scalars()}
    for entry in catalog:
        product = existing.get(entry.key)
        is_new = product is None
        if product is None:
            product = Product(key=entry.key, vendor=entry.vendor, canonical_name=entry.canonical_name, product_metadata={"catalog_digest": digest})
            session.add(product)
            existing[entry.key] = product
            await session.flush()
        for alias in entry.aliases:
            alias_exists = False if is_new else (await session.execute(
                select(ProductAlias.id).where(
                    ProductAlias.product_id == product.id,
                    ProductAlias.vendor_raw == alias["vendor"],
                    ProductAlias.name_raw == alias["name"],
                    ProductAlias.alias_type == "validated",
                ).limit(1)
            )).scalar_one_or_none() is not None
            if not alias_exists:
                session.add(ProductAlias(product_id=product.id, vendor_raw=alias["vendor"], name_raw=alias["name"], vendor_normalized=normalize_identifier(alias["vendor"]), name_normalized=normalize_identifier(alias["name"]), alias_type="validated", provenance={"catalog": "product_resolution_v0"}))
        for binding in entry.bindings:
            binding_exists = False if is_new else (await session.execute(
                select(ProductExternalBinding.id).where(
                    ProductExternalBinding.product_id == product.id,
                    ProductExternalBinding.binding_type == binding["type"],
                    ProductExternalBinding.value_raw == binding["value"],
                ).limit(1)
            )).scalar_one_or_none() is not None
            if not binding_exists:
                session.add(ProductExternalBinding(product_id=product.id, binding_type=binding["type"], value_raw=binding["value"], normalized_fields={}, status="validated", provenance={"catalog": "product_resolution_v0"}))
    await session.flush()
    return catalog, digest, existing


def component_snapshot(component: AssetComponent, asset: Asset | None = None) -> dict[str, Any]:
    return {"asset": {"id": str(component.asset_id), "external_id": asset.external_id if asset else None}, "component": {"id": str(component.id), "bom_ref": component.bom_ref, "name": component.name, "version": component.version, "vendor": component.vendor, "product": component.product, "purl": component.purl, "cpe": component.cpe, "cpe_vendor": component.cpe_vendor, "cpe_product": component.cpe_product, "cpe_version": component.cpe_version, "raw_component": component.raw_component}}


async def run_product_resolution(session: AsyncSession, asset_id: UUID | None = None) -> ProductResolutionRun:
    catalog, catalog_sha256, products = await ensure_catalog(session)
    config: dict[str, Any] = {}
    run = ProductResolutionRun(scope={"asset_id": str(asset_id) if asset_id else None}, status="running", module_id=MODULE_ID, module_version=MODULE_VERSION, configuration=config, configuration_digest=_digest(config), catalog_digest=catalog_sha256, decision_schema_version=CANDIDATE_SCHEMA_VERSION)
    session.add(run)
    await session.flush()
    stmt = select(AssetComponent, Asset).join(Asset, Asset.id == AssetComponent.asset_id).order_by(AssetComponent.id)
    if asset_id:
        stmt = stmt.where(AssetComponent.asset_id == asset_id)
    rows = (await session.execute(stmt)).all()
    counts = {"resolved": 0, "unknown": 0, "ambiguous": 0, "error": 0}
    for component, asset in rows:
        snap = component_snapshot(component, asset)
        input_value = snap["component"]
        result = resolve_component(input_value, catalog)
        prior = (await session.execute(select(ProductResolutionDecision).where(ProductResolutionDecision.asset_component_id == component.id).order_by(ProductResolutionDecision.decided_at.desc(), ProductResolutionDecision.id.desc()).limit(1))).scalar_one_or_none()
        product = products.get(result.product_key) if result.product_key else None
        session.add(ProductResolutionDecision(run_id=run.id, asset_component_id=component.id, asset_id=asset.id, resolved_product_id=product.id if product else None, previous_decision_id=prior.id if prior else None, component_snapshot=snap, input_fingerprint=_digest(input_value), status=result.status, method=result.method, confidence=int(result.confidence) if result.confidence is not None else None, confidence_basis=result.confidence_basis, candidates={"schema_version": CANDIDATE_SCHEMA_VERSION, "items": result.candidates}, evidence={"schema_version": "product-resolution-evidence/v1", "signals": result.signals}, module_id=MODULE_ID, module_version=MODULE_VERSION, configuration=config, configuration_digest=run.configuration_digest, catalog_digest=catalog_sha256))
        counts[result.status] += 1
    run.components_processed = len(rows)
    run.resolved_count, run.unknown_count, run.ambiguous_count, run.error_count = counts["resolved"], counts["unknown"], counts["ambiguous"], counts["error"]
    run.status, run.finished_at = "completed", datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(run)
    logger.info("Product resolution run %s completed: %s", run.id, counts)
    return run


async def attach_latest_resolutions(session: AsyncSession, assets: list[Asset]) -> None:
    component_ids = [component.id for asset in assets for component in asset.components]
    if not component_ids:
        return
    # PostgreSQL DISTINCT ON selects a single latest record for each current component.
    latest = (await session.execute(select(ProductResolutionDecision).where(ProductResolutionDecision.asset_component_id.in_(component_ids)).options(selectinload(ProductResolutionDecision.resolved_product)).order_by(ProductResolutionDecision.asset_component_id, ProductResolutionDecision.decided_at.desc(), ProductResolutionDecision.id.desc()).distinct(ProductResolutionDecision.asset_component_id))).scalars().all()
    by_component = {decision.asset_component_id: decision for decision in latest}
    for asset in assets:
        for component in asset.components:
            component.latest_resolution = by_component.get(component.id)
