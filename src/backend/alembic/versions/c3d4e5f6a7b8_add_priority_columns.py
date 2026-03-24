"""Add priority scoring columns to vulnerabilities

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-24 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DEFAULT_SCORING_PROFILE = """{
  "thresholds": {"V0": 76, "V1": 51, "V2": 26, "V3": 0},
  "columns": {
    "cvss_v31_score":    {"enabled": true,  "weight": 30, "type": "numeric",     "range": [0, 10], "default_value": 100},
    "epss_score":        {"enabled": true,  "weight": 25, "type": "numeric",     "range": [0, 1],  "default_value": 100},
    "kev_known_exploited":{"enabled": true, "weight": 20, "type": "boolean",     "values": {"true": 100, "false": 0}, "default_value": 100},
    "cvss_v31_severity": {"enabled": true,  "weight": 15, "type": "categorical", "values": {"CRITICAL": 100, "HIGH": 66, "MEDIUM": 33, "LOW": 0}, "default_value": 100},
    "euvd_exploitation": {"enabled": true,  "weight": 10, "type": "categorical", "values": {}, "default_value": 100},
    "cvss_v2_score":     {"enabled": false, "weight": 0,  "type": "numeric",     "range": [0, 10], "default_value": 100},
    "cvss_v30_score":    {"enabled": false, "weight": 0,  "type": "numeric",     "range": [0, 10], "default_value": 100},
    "cvss_v40_score":    {"enabled": false, "weight": 0,  "type": "numeric",     "range": [0, 10], "default_value": 100},
    "epss_percentile":   {"enabled": false, "weight": 0,  "type": "numeric",     "range": [0, 1],  "default_value": 100},
    "kev_ransomware_use":{"enabled": false, "weight": 0,  "type": "boolean",     "values": {}, "default_value": 100},
    "cvss_v2_severity":  {"enabled": false, "weight": 0,  "type": "categorical", "values": {"HIGH": 100, "MEDIUM": 50, "LOW": 0}, "default_value": 100},
    "cvss_v30_severity": {"enabled": false, "weight": 0,  "type": "categorical", "values": {"CRITICAL": 100, "HIGH": 66, "MEDIUM": 33, "LOW": 0}, "default_value": 100},
    "cvss_v40_severity": {"enabled": false, "weight": 0,  "type": "categorical", "values": {"CRITICAL": 100, "HIGH": 66, "MEDIUM": 33, "LOW": 0}, "default_value": 100}
  }
}"""


def upgrade() -> None:
    op.add_column("vulnerabilities", sa.Column("priority_level", sa.String(2), nullable=True))
    op.add_column("vulnerabilities", sa.Column("priority_score", sa.Numeric(4, 1), nullable=True))
    op.add_column("vulnerabilities", sa.Column("priority_confidence", sa.Numeric(4, 1), nullable=True))

    op.create_index("ix_vulnerabilities_priority_level", "vulnerabilities", ["priority_level"])
    op.create_index("ix_vulnerabilities_priority_score", "vulnerabilities", ["priority_score"])

    # _DEFAULT_SCORING_PROFILE contains only double-quoted JSON — no single quotes to escape.
    op.execute(
        f"INSERT INTO settings (key, value) VALUES ('scoring_profile', '{_DEFAULT_SCORING_PROFILE}'::jsonb) "
        "ON CONFLICT (key) DO NOTHING"
    )


def downgrade() -> None:
    op.execute("DELETE FROM settings WHERE key = 'scoring_profile'")
    op.drop_index("ix_vulnerabilities_priority_score", table_name="vulnerabilities")
    op.drop_index("ix_vulnerabilities_priority_level", table_name="vulnerabilities")
    op.drop_column("vulnerabilities", "priority_confidence")
    op.drop_column("vulnerabilities", "priority_score")
    op.drop_column("vulnerabilities", "priority_level")
