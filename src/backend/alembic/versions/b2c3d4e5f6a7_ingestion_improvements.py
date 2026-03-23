"""Ingestion improvements: progress column + enabled settings

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-23 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add progress column to ingestion_logs (0.0–100.0, null when not tracked)
    op.add_column(
        "ingestion_logs",
        sa.Column("progress", sa.Float(), nullable=True),
    )

    # Seed per-source enabled settings (default: all enabled)
    op.execute("""
        INSERT INTO settings (key, value) VALUES
            ('schedule_kev_enabled',  'true'::jsonb),
            ('schedule_epss_enabled', 'true'::jsonb),
            ('schedule_nvd_enabled',  'true'::jsonb),
            ('schedule_euvd_enabled', 'true'::jsonb)
        ON CONFLICT (key) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM settings
        WHERE key IN (
            'schedule_kev_enabled',
            'schedule_epss_enabled',
            'schedule_nvd_enabled',
            'schedule_euvd_enabled'
        );
    """)
    op.drop_column("ingestion_logs", "progress")
