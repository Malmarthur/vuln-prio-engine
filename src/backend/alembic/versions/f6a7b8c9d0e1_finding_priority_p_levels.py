"""Rename finding priority levels from Vx to Px

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-05-24 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE finding_scores
            SET priority_level = CASE priority_level
                WHEN 'V0' THEN 'P0'
                WHEN 'V1' THEN 'P1'
                WHEN 'V2' THEN 'P2'
                WHEN 'V3' THEN 'P3'
                ELSE priority_level
            END
            WHERE priority_level IN ('V0', 'V1', 'V2', 'V3')
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE settings
            SET value = jsonb_set(
                value,
                '{thresholds}',
                jsonb_build_object(
                    'P0', value #> '{thresholds,V0}',
                    'P1', value #> '{thresholds,V1}',
                    'P2', value #> '{thresholds,V2}',
                    'P3', value #> '{thresholds,V3}'
                )
            )
            WHERE key = 'finding_scoring_profile'
              AND value #> '{thresholds,V0}' IS NOT NULL
              AND value #> '{thresholds,P0}' IS NULL
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE finding_scores
            SET priority_level = CASE priority_level
                WHEN 'P0' THEN 'V0'
                WHEN 'P1' THEN 'V1'
                WHEN 'P2' THEN 'V2'
                WHEN 'P3' THEN 'V3'
                ELSE priority_level
            END
            WHERE priority_level IN ('P0', 'P1', 'P2', 'P3')
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE settings
            SET value = jsonb_set(
                value,
                '{thresholds}',
                jsonb_build_object(
                    'V0', value #> '{thresholds,P0}',
                    'V1', value #> '{thresholds,P1}',
                    'V2', value #> '{thresholds,P2}',
                    'V3', value #> '{thresholds,P3}'
                )
            )
            WHERE key = 'finding_scoring_profile'
              AND value #> '{thresholds,P0}' IS NOT NULL
            """
        )
    )
