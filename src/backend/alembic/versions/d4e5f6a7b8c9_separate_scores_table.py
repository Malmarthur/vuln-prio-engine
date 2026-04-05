"""Move priority scores to separate table for fast TRUNCATE+COPY

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create the new scores table
    op.create_table(
        "vulnerability_scores",
        sa.Column("vulnerability_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("vulnerabilities.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("priority_score", sa.Numeric(4, 1)),
        sa.Column("priority_confidence", sa.Numeric(4, 1)),
        sa.Column("priority_level", sa.String(2)),
    )
    op.create_index("ix_vulnerability_scores_priority_score", "vulnerability_scores", ["priority_score"])
    op.create_index("ix_vulnerability_scores_priority_level", "vulnerability_scores", ["priority_level"])

    # Migrate existing scores
    op.execute("""
        INSERT INTO vulnerability_scores (vulnerability_id, priority_score, priority_confidence, priority_level)
        SELECT id, priority_score, priority_confidence, priority_level
        FROM vulnerabilities
        WHERE priority_score IS NOT NULL
    """)

    # Drop old columns and indexes from vulnerabilities
    op.drop_index("ix_vulnerabilities_priority_score", table_name="vulnerabilities")
    op.drop_index("ix_vulnerabilities_priority_level", table_name="vulnerabilities")
    op.drop_column("vulnerabilities", "priority_score")
    op.drop_column("vulnerabilities", "priority_confidence")
    op.drop_column("vulnerabilities", "priority_level")


def downgrade() -> None:
    # Re-add columns
    op.add_column("vulnerabilities", sa.Column("priority_level", sa.String(2)))
    op.add_column("vulnerabilities", sa.Column("priority_score", sa.Numeric(4, 1)))
    op.add_column("vulnerabilities", sa.Column("priority_confidence", sa.Numeric(4, 1)))
    op.create_index("ix_vulnerabilities_priority_level", "vulnerabilities", ["priority_level"])
    op.create_index("ix_vulnerabilities_priority_score", "vulnerabilities", ["priority_score"])

    # Copy scores back
    op.execute("""
        UPDATE vulnerabilities v SET
            priority_score = s.priority_score,
            priority_confidence = s.priority_confidence,
            priority_level = s.priority_level
        FROM vulnerability_scores s
        WHERE v.id = s.vulnerability_id
    """)

    op.drop_table("vulnerability_scores")
