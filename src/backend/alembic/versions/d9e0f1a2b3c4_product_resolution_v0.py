"""Add durable Product Resolution v0 entities.

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d9e0f1a2b3c4"
down_revision = "c8d9e0f1a2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    jsonb = postgresql.JSONB(astext_type=sa.Text())
    op.create_table("products", sa.Column("id", uuid, primary_key=True), sa.Column("key", sa.String(255), nullable=False, unique=True), sa.Column("vendor", sa.String(255), nullable=False), sa.Column("canonical_name", sa.String(255), nullable=False), sa.Column("metadata", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False), sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False))
    op.create_table("product_aliases", sa.Column("id", uuid, primary_key=True), sa.Column("product_id", uuid, sa.ForeignKey("products.id", ondelete="RESTRICT"), nullable=False), sa.Column("vendor_raw", sa.String(255), nullable=False), sa.Column("name_raw", sa.String(255), nullable=False), sa.Column("vendor_normalized", sa.String(255)), sa.Column("name_normalized", sa.String(255), nullable=False), sa.Column("alias_type", sa.String(50), nullable=False), sa.Column("provenance", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False), sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False), sa.UniqueConstraint("product_id", "vendor_raw", "name_raw", "alias_type", name="uq_product_alias_per_product"))
    op.create_index("ix_product_aliases_normalized", "product_aliases", ["vendor_normalized", "name_normalized"])
    op.create_table("product_external_bindings", sa.Column("id", uuid, primary_key=True), sa.Column("product_id", uuid, sa.ForeignKey("products.id", ondelete="RESTRICT"), nullable=False), sa.Column("binding_type", sa.String(50), nullable=False), sa.Column("value_raw", sa.Text, nullable=False), sa.Column("normalized_fields", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("status", sa.String(50), nullable=False), sa.Column("provenance", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False), sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False), sa.UniqueConstraint("product_id", "binding_type", "value_raw", name="uq_product_binding_per_product"))
    op.create_index("ix_product_external_bindings_lookup", "product_external_bindings", ["binding_type", "value_raw"])
    op.create_table("product_resolution_runs", sa.Column("id", uuid, primary_key=True), sa.Column("scope", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("status", sa.String(20), nullable=False), sa.Column("module_id", sa.String(100), nullable=False), sa.Column("module_version", sa.String(50), nullable=False), sa.Column("configuration", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("configuration_digest", sa.String(64), nullable=False), sa.Column("catalog_digest", sa.String(64), nullable=False), sa.Column("decision_schema_version", sa.String(100), nullable=False), sa.Column("started_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False), sa.Column("finished_at", sa.TIMESTAMP(timezone=True)), sa.Column("components_processed", sa.Integer, nullable=False, server_default="0"), sa.Column("resolved_count", sa.Integer, nullable=False, server_default="0"), sa.Column("unknown_count", sa.Integer, nullable=False, server_default="0"), sa.Column("ambiguous_count", sa.Integer, nullable=False, server_default="0"), sa.Column("error_count", sa.Integer, nullable=False, server_default="0"), sa.Column("terminal_error", sa.Text))
    op.create_table("product_resolution_decisions", sa.Column("id", uuid, primary_key=True), sa.Column("run_id", uuid, sa.ForeignKey("product_resolution_runs.id", ondelete="RESTRICT"), nullable=False), sa.Column("asset_component_id", uuid, sa.ForeignKey("asset_components.id", ondelete="SET NULL")), sa.Column("asset_id", uuid, sa.ForeignKey("assets.id", ondelete="SET NULL")), sa.Column("resolved_product_id", uuid, sa.ForeignKey("products.id", ondelete="RESTRICT")), sa.Column("previous_decision_id", uuid, sa.ForeignKey("product_resolution_decisions.id", ondelete="SET NULL")), sa.Column("component_snapshot", jsonb, nullable=False), sa.Column("input_fingerprint", sa.String(64), nullable=False), sa.Column("status", sa.String(20), nullable=False), sa.Column("method", sa.String(100), nullable=False), sa.Column("confidence", sa.Integer), sa.Column("confidence_basis", sa.Text, nullable=False), sa.Column("candidates", jsonb, nullable=False), sa.Column("evidence", jsonb, nullable=False), sa.Column("module_id", sa.String(100), nullable=False), sa.Column("module_version", sa.String(50), nullable=False), sa.Column("configuration", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("configuration_digest", sa.String(64), nullable=False), sa.Column("catalog_digest", sa.String(64), nullable=False), sa.Column("decided_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False))
    for name, columns in (("ix_product_resolution_decisions_component_decided", ["asset_component_id", "decided_at"]), ("ix_product_resolution_decisions_asset_id", ["asset_id"]), ("ix_product_resolution_decisions_run_id", ["run_id"]), ("ix_product_resolution_decisions_status", ["status"])): op.create_index(name, "product_resolution_decisions", columns)


def downgrade() -> None:
    op.drop_table("product_resolution_decisions")
    op.drop_table("product_resolution_runs")
    op.drop_table("product_external_bindings")
    op.drop_table("product_aliases")
    op.drop_table("products")
