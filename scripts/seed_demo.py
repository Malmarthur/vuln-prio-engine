"""Synthetic presentation data only; refuses an existing inventory or vulnerability DB."""
import asyncio
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.engine import make_url

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.asset import Asset
from app.models.vulnerability import Vulnerability
from app.services.asset_service import import_cyclonedx_asset
from app.services.vulnerability_service import set_setting, sync_vulnerability_products_from_records


async def main():
    if make_url(settings.database_url).database != "vvln_demo":
        raise SystemExit("Demo seeding requires the dedicated vvln_demo database")
    async with AsyncSessionLocal() as session:
        for model in (Asset, Vulnerability):
            if await session.scalar(select(func.count()).select_from(model)):
                raise SystemExit("Demo requires an empty database; no existing data modified")
        # The scheduler must never fetch live sources for this fixture.
        for source in ("nvd", "epss", "kev", "euvd"):
            await set_setting(session, f"schedule_{source}_enabled", False)
        rows = []
        for i, (cvss, epss, kev) in enumerate([(9.8, .01, False), (7.5, .95, True), (5.0, .4, False), (9.0, .001, False), (4.3, .7, True), (6.5, .02, False)], 1):
            products = [{"cpe": "cpe:2.3:a:apache:tomcat:*:*:*:*:*:*:*:*", "version_end": "9.0.81", "version_end_including": False}]
            row = Vulnerability(
                cve_id=f"CVE-2099-{i:05d}",
                summary=f"SYNTHETIC DEMO {i} — not a real advisory",
                description="Invented scoring fixture; no real applicability claim.",
                published_date=datetime(2024, 1, 1, tzinfo=timezone.utc),
                cvss_v31_score=cvss, cvss_v31_severity="HIGH",
                epss_score=epss, epss_percentile=epss,
                kev_known_exploited=kev, affected_products=products,
                sources_raw={"demo": {"synthetic": True, "fixture_version": 1}},
            )
            rows.append(row)
            session.add(row)
        await session.commit()
        await sync_vulnerability_products_from_records(session, [{"cve_id": row.cve_id, "affected_products": row.affected_products} for row in rows])
        for name, exposure, criticality in [("demo-public-api", "internet", "critical"), ("demo-internal-app", "internal", "medium"), ("demo-isolated-lab", "isolated", "low")]:
            await import_cyclonedx_asset(session, {
                "bomFormat": "CycloneDX", "specVersion": "1.6",
                "serialNumber": f"urn:demo:{name}",
                "metadata": {"component": {"bom-ref": name, "name": name, "type": "application", "properties": [
                    {"name": "vulnprio:internet_exposure", "value": exposure},
                    {"name": "vulnprio:business_criticality", "value": criticality},
                    {"name": "vulnprio:patch_complexity", "value": "medium"},
                ]}},
                "components": [{"type": "application", "name": "Tomcat", "publisher": "Apache", "version": "9.0.80", "cpe": "cpe:2.3:a:apache:tomcat:9.0.80:*:*:*:*:*:*:*"}],
            })
    print("Seeded 6 synthetic vulnerabilities and 3 synthetic assets; live schedules disabled.")


if __name__ == "__main__":
    asyncio.run(main())
