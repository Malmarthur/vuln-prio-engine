"""Add asset priority scores

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-05-24 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "asset_scores",
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("priority_score", sa.Numeric(4, 1)),
        sa.Column("priority_confidence", sa.Numeric(4, 1)),
        sa.Column("priority_level", sa.String(2)),
    )
    op.create_index("ix_asset_scores_priority_score", "asset_scores", ["priority_score"])
    op.create_index("ix_asset_scores_priority_level", "asset_scores", ["priority_level"])


def downgrade() -> None:
    op.drop_index("ix_asset_scores_priority_level", table_name="asset_scores")
    op.drop_index("ix_asset_scores_priority_score", table_name="asset_scores")
    op.drop_table("asset_scores")
