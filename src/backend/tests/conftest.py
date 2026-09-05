"""
Root test fixtures.

DB isolation strategy: cleanup runs inside the db_session fixture after each test
(TRUNCATE all tables). This ensures unit tests never touch the DB at all — they
never request db_session or test_engine.
"""
from __future__ import annotations

import os
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.main import app
from app.models.asset import Asset
from app.models.ingestion_log import IngestionLog
from app.models.vulnerability import Vulnerability

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://vulnprio:vulnprio_dev@db:5432/vulnprio_test",
)

# ---------------------------------------------------------------------------
# Session-scoped engine — create tables once, drop at teardown
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# ---------------------------------------------------------------------------
# Function-scoped session — truncates tables after each test
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        # Rollback any uncommitted transaction so the connection
        # is cleanly returned to the pool before the TRUNCATE.
        await session.rollback()
    # Truncate after every test that uses db_session
    async with test_engine.connect() as conn:
        await conn.execute(
            text(
                "TRUNCATE assets, asset_components, findings, finding_scores,"
                " vulnerability_products, vulnerabilities, vulnerability_scores,"
                " ingestion_logs, settings, scoring_runs, scoring_jobs, scoring_presets,"
                " scoring_contexts, scoring_profiles, product_resolution_decisions,"
                " product_resolution_runs, product_external_bindings, product_aliases, products"
                " RESTART IDENTITY CASCADE"
            )
        )
        await conn.commit()


# ---------------------------------------------------------------------------
# FastAPI test client
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def client(db_session) -> AsyncGenerator[httpx.AsyncClient, None]:
    """httpx AsyncClient targeting the FastAPI app with DB dependency overridden."""
    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Model factories
# ---------------------------------------------------------------------------

def make_vulnerability(**overrides) -> Vulnerability:
    defaults = {
        "id": uuid.uuid4(),
        "cve_id": f"CVE-2024-{uuid.uuid4().hex[:5].upper()}",
        "summary": "Test vulnerability summary",
        "description": "A test vulnerability for automated testing.",
        "published_date": datetime(2024, 6, 15, tzinfo=timezone.utc),
        "cvss_v31_score": 7.5,
        "cvss_v31_severity": "HIGH",
        "epss_score": 0.05,
        "epss_percentile": 0.75,
        "kev_known_exploited": False,
    }
    defaults.update(overrides)
    return Vulnerability(**defaults)


def make_ingestion_log(**overrides) -> IngestionLog:
    defaults = {
        "id": uuid.uuid4(),
        "source": "nvd",
        "trigger_type": "manual",
        "status": "success",
        "started_at": datetime(2024, 6, 15, 12, 0, tzinfo=timezone.utc),
        "finished_at": datetime(2024, 6, 15, 12, 5, tzinfo=timezone.utc),
        "records_processed": 100,
        "records_created": 100,
        "records_updated": 0,
    }
    defaults.update(overrides)
    return IngestionLog(**defaults)


def make_asset(**overrides) -> Asset:
    defaults = {
        "id": uuid.uuid4(),
        "external_id": f"asset-{uuid.uuid4().hex[:8]}",
        "name": "Test asset",
        "asset_type": "application",
        "source": "cyclonedx",
        "internet_exposure": "internal",
        "business_criticality": "medium",
        "patch_complexity": "medium",
    }
    defaults.update(overrides)
    return Asset(**defaults)


@pytest.fixture
def vuln_factory():
    return make_vulnerability


@pytest.fixture
def log_factory():
    return make_ingestion_log


@pytest.fixture
def asset_factory():
    return make_asset


# ---------------------------------------------------------------------------
# Raw payload fixtures (aggregator unit tests)
# ---------------------------------------------------------------------------

@pytest.fixture
def nvd_raw_cve():
    return {
        "cve": {
            "id": "CVE-2024-12345",
            "published": "2024-06-15T10:00:00.000",
            "lastModified": "2024-06-16T12:00:00.000",
            "descriptions": [
                {"lang": "en", "value": "A critical vulnerability. It allows remote code execution."}
            ],
            "metrics": {
                "cvssMetricV31": [{
                    "type": "Primary",
                    "cvssData": {
                        "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
                        "baseScore": 9.8,
                        "baseSeverity": "CRITICAL",
                    },
                }]
            },
            "weaknesses": [
                {"description": [{"value": "CWE-79"}, {"value": "CWE-89"}]}
            ],
            "configurations": [],
            "references": [
                {"url": "https://example.com/advisory", "source": "vendor", "tags": ["Vendor Advisory"]}
            ],
        }
    }


@pytest.fixture
def kev_raw_entry():
    return {
        "cveID": "CVE-2024-12345",
        "vendorProject": "FooBar",
        "product": "Widget",
        "vulnerabilityName": "FooBar Widget RCE",
        "dateAdded": "2024-06-20",
        "dueDate": "2024-07-10",
        "shortDescription": "FooBar Widget allows remote code execution",
        "knownRansomwareCampaignUse": "Known",
        "notes": "",
    }


@pytest.fixture
def epss_raw_rows():
    return [
        {"cve": "CVE-2024-12345", "epss": "0.95432", "percentile": "0.99123", "date": "2024-06-20"},
        {"cve": "CVE-2024-12346", "epss": "0.00123", "percentile": "0.15000", "date": "2024-06-20"},
        {"cve": "CVE-2024-12347", "epss": "0.50000", "percentile": "0.80000", "date": "2024-06-20"},
    ]


@pytest.fixture
def euvd_raw_entry():
    return {
        "id": "EUVD-2024-14346",
        "aliases": "CVE-2024-12345",
        "description": "A vulnerability tracked by ENISA",
        "baseScore": 9.8,
    }
