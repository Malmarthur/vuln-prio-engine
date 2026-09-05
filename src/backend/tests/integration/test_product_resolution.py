from sqlalchemy import select

from app.models.product import Product, ProductResolutionDecision
from app.services.asset_service import get_asset, import_cyclonedx_asset
from app.services.product_resolution_service import run_product_resolution


def _payload(name="Widget"):
    return {
        "bomFormat": "CycloneDX", "serialNumber": "urn:uuid:product-resolution-test",
        "metadata": {"component": {"name": "product-resolution-test"}},
        "components": [{"bom-ref": "widget", "name": name, "vendor": "Acme", "version": "1.0"}],
    }


async def test_resolution_is_append_only_and_snapshot_survives_component_reimport(db_session):
    asset, _ = await import_cyclonedx_asset(db_session, _payload())
    first_run = await run_product_resolution(db_session, asset.id)
    first = (await db_session.execute(select(ProductResolutionDecision))).scalar_one()
    assert first_run.resolved_count == 1
    assert first.status == "resolved"
    assert first.component_snapshot["component"]["name"] == "Widget"
    assert (await db_session.execute(select(Product))).scalar_one().key == "acme/widget"

    asset, _ = await import_cyclonedx_asset(db_session, _payload("Unknown package"))
    second_run = await run_product_resolution(db_session, asset.id)
    decisions = (await db_session.execute(select(ProductResolutionDecision).order_by(ProductResolutionDecision.decided_at))).scalars().all()
    assert second_run.unknown_count == 1
    assert len(decisions) == 2
    assert decisions[0].asset_component_id is None
    assert decisions[0].component_snapshot["component"]["name"] == "Widget"
    latest_asset = await get_asset(db_session, asset.id)
    assert latest_asset.components[0].latest_resolution.status == "unknown"
