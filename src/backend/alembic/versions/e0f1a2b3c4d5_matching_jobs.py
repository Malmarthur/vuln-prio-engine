"""Allow matching as a background job kind.

Revision ID: e0f1a2b3c4d5
Revises: d9e0f1a2b3c4
"""
from alembic import op

revision = "e0f1a2b3c4d5"
down_revision = "d9e0f1a2b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_scoring_jobs_kind", "scoring_jobs", type_="check")
    op.create_check_constraint("ck_scoring_jobs_kind", "scoring_jobs", "kind IN ('run', 'comparison', 'matching')")


def downgrade() -> None:
    op.execute("DELETE FROM scoring_jobs WHERE kind = 'matching'")
    op.drop_constraint("ck_scoring_jobs_kind", "scoring_jobs", type_="check")
    op.create_check_constraint("ck_scoring_jobs_kind", "scoring_jobs", "kind IN ('run', 'comparison')")
