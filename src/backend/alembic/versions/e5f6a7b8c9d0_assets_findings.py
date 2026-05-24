"""Add assets, vulnerability products, findings, and finding scores

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-23 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("external_id", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("asset_type", sa.String(50), nullable=False, server_default="application"),
        sa.Column("source", sa.String(50), nullable=False, server_default="cyclonedx"),
        sa.Column("internet_exposure", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("business_criticality", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("patch_complexity", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("raw_payload", postgresql.JSONB),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_assets_name", "assets", ["name"])
    op.create_index("ix_assets_internet_exposure", "assets", ["internet_exposure"])
    op.create_index("ix_assets_business_criticality", "assets", ["business_criticality"])

    op.create_table(
        "asset_components",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bom_ref", sa.String(255)),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("version", sa.String(255)),
        sa.Column("vendor", sa.String(255)),
        sa.Column("product", sa.String(255)),
        sa.Column("purl", sa.Text),
        sa.Column("cpe", sa.Text),
        sa.Column("cpe_part", sa.String(20)),
        sa.Column("cpe_vendor", sa.String(255)),
        sa.Column("cpe_product", sa.String(255)),
        sa.Column("cpe_version", sa.String(255)),
        sa.Column("raw_component", postgresql.JSONB),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_asset_components_asset_id", "asset_components", ["asset_id"])
    op.create_index("ix_asset_components_cpe_lookup", "asset_components", ["cpe_part", "cpe_vendor", "cpe_product"])

    op.create_table(
        "vulnerability_products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("vulnerability_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vulnerabilities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cve_id", sa.String(20), nullable=False),
        sa.Column("cpe", sa.Text, nullable=False),
        sa.Column("cpe_part", sa.String(20)),
        sa.Column("cpe_vendor", sa.String(255)),
        sa.Column("cpe_product", sa.String(255)),
        sa.Column("cpe_version", sa.String(255)),
        sa.Column("version_start", sa.String(255)),
        sa.Column("version_start_including", sa.Boolean),
        sa.Column("version_end", sa.String(255)),
        sa.Column("version_end_including", sa.Boolean),
        sa.UniqueConstraint(
            "vulnerability_id",
            "cpe",
            "version_start",
            "version_start_including",
            "version_end",
            "version_end_including",
            name="uq_vulnerability_products_identity",
        ),
    )
    op.create_index("ix_vulnerability_products_cve_id", "vulnerability_products", ["cve_id"])
    op.create_index("ix_vulnerability_products_lookup", "vulnerability_products", ["cpe_part", "cpe_vendor", "cpe_product"])

    op.create_table(
        "findings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("asset_component_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("asset_components.id", ondelete="CASCADE"), nullable=False),
        sa.Column("vulnerability_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vulnerabilities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("match_type", sa.String(50), nullable=False),
        sa.Column("match_confidence", sa.Numeric(4, 1), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("first_seen_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("asset_component_id", "vulnerability_id", name="uq_findings_component_vulnerability"),
    )
    op.create_index("ix_findings_asset_id", "findings", ["asset_id"])
    op.create_index("ix_findings_vulnerability_id", "findings", ["vulnerability_id"])
    op.create_index("ix_findings_status", "findings", ["status"])

    op.create_table(
        "finding_scores",
        sa.Column("finding_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("findings.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("priority_score", sa.Numeric(4, 1)),
        sa.Column("priority_confidence", sa.Numeric(4, 1)),
        sa.Column("priority_level", sa.String(2)),
    )
    op.create_index("ix_finding_scores_priority_score", "finding_scores", ["priority_score"])
    op.create_index("ix_finding_scores_priority_level", "finding_scores", ["priority_level"])


def downgrade() -> None:
    op.drop_index("ix_finding_scores_priority_level", table_name="finding_scores")
    op.drop_index("ix_finding_scores_priority_score", table_name="finding_scores")
    op.drop_table("finding_scores")

    op.drop_index("ix_findings_status", table_name="findings")
    op.drop_index("ix_findings_vulnerability_id", table_name="findings")
    op.drop_index("ix_findings_asset_id", table_name="findings")
    op.drop_table("findings")

    op.drop_index("ix_vulnerability_products_lookup", table_name="vulnerability_products")
    op.drop_index("ix_vulnerability_products_cve_id", table_name="vulnerability_products")
    op.drop_table("vulnerability_products")

    op.drop_index("ix_asset_components_cpe_lookup", table_name="asset_components")
    op.drop_index("ix_asset_components_asset_id", table_name="asset_components")
    op.drop_table("asset_components")

    op.drop_index("ix_assets_business_criticality", table_name="assets")
    op.drop_index("ix_assets_internet_exposure", table_name="assets")
    op.drop_index("ix_assets_name", table_name="assets")
    op.drop_table("assets")
