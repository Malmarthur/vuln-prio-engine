"""Followed items for the comparison workspace.

Revision ID: f1a2b3c4d5e6
Revises: e0f1a2b3c4d5
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "f1a2b3c4d5e6"
down_revision = "e0f1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "followed_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("entity_type", sa.String(20), nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("entity_type", "entity_id", name="uq_followed_items_entity"),
        sa.CheckConstraint("entity_type IN ('vulnerability', 'asset', 'finding')", name="ck_followed_items_entity_type"),
    )


def downgrade() -> None:
    op.drop_table("followed_items")
