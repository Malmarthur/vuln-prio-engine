"""Persist compact comparison summaries and richer job progress.

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c8d9e0f1a2b3"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "scoring_jobs",
        sa.Column(
            "progress_detail",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "scoring_jobs",
        sa.Column("result_summary", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("scoring_jobs", "result_summary")
    op.drop_column("scoring_jobs", "progress_detail")
