"""Initial schema

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2026-03-22 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vulnerabilities",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("cve_id", sa.String(20), nullable=False),
        # Identity & descriptions
        sa.Column("summary", sa.Text()),
        sa.Column("description", sa.Text()),
        sa.Column("published_date", sa.TIMESTAMP(timezone=True)),
        sa.Column("last_modified_date", sa.TIMESTAMP(timezone=True)),
        # NVD data
        sa.Column("nvd_source_url", sa.Text()),
        # CVSS 2.0
        sa.Column("cvss_v2_vector", sa.String(100)),
        sa.Column("cvss_v2_score", sa.Numeric(3, 1)),
        sa.Column("cvss_v2_severity", sa.String(10)),
        # CVSS 3.0
        sa.Column("cvss_v30_vector", sa.String(100)),
        sa.Column("cvss_v30_score", sa.Numeric(3, 1)),
        sa.Column("cvss_v30_severity", sa.String(10)),
        # CVSS 3.1
        sa.Column("cvss_v31_vector", sa.String(100)),
        sa.Column("cvss_v31_score", sa.Numeric(3, 1)),
        sa.Column("cvss_v31_severity", sa.String(10)),
        # CVSS 4.0
        sa.Column("cvss_v40_vector", sa.String(200)),
        sa.Column("cvss_v40_score", sa.Numeric(3, 1)),
        sa.Column("cvss_v40_severity", sa.String(10)),
        sa.Column("cwe_ids", postgresql.JSONB()),
        sa.Column("affected_products", postgresql.JSONB()),
        sa.Column("references", postgresql.JSONB()),
        # EPSS data
        sa.Column("epss_score", sa.Numeric(8, 6)),
        sa.Column("epss_percentile", sa.Numeric(8, 6)),
        sa.Column("epss_date", sa.Date()),
        # CISA KEV data
        sa.Column("kev_known_exploited", sa.Boolean(), server_default="false"),
        sa.Column("kev_date_added", sa.Date()),
        sa.Column("kev_due_date", sa.Date()),
        sa.Column("kev_ransomware_use", sa.Boolean()),
        sa.Column("kev_notes", sa.Text()),
        # EUVD data
        sa.Column("euvd_id", sa.String(30)),
        sa.Column("euvd_source_url", sa.Text()),
        sa.Column("euvd_exploitation", sa.String(20)),
        # Metadata
        sa.Column("sources_raw", postgresql.JSONB()),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cve_id", name="uq_vulnerabilities_cve_id"),
    )
    op.create_index("ix_vulnerabilities_cve_id", "vulnerabilities", ["cve_id"])
    op.create_index(
        "ix_vulnerabilities_published_date", "vulnerabilities", ["published_date"]
    )
    op.create_index(
        "ix_vulnerabilities_cvss_v2_score", "vulnerabilities", ["cvss_v2_score"]
    )
    op.create_index(
        "ix_vulnerabilities_cvss_v30_score", "vulnerabilities", ["cvss_v30_score"]
    )
    op.create_index(
        "ix_vulnerabilities_cvss_v31_score", "vulnerabilities", ["cvss_v31_score"]
    )
    op.create_index(
        "ix_vulnerabilities_epss_score", "vulnerabilities", ["epss_score"]
    )
    op.create_index(
        "ix_vulnerabilities_kev_known_exploited",
        "vulnerabilities",
        ["kev_known_exploited"],
    )
    op.create_index(
        "ix_vulnerabilities_updated_at", "vulnerabilities", ["updated_at"]
    )

    # Trigger to auto-update updated_at on row updates
    op.execute("""
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ language 'plpgsql';
    """)
    op.execute("""
        CREATE TRIGGER update_vulnerabilities_updated_at
        BEFORE UPDATE ON vulnerabilities
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """)

    op.create_table(
        "ingestion_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("finished_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("status", sa.String(20)),
        sa.Column("records_processed", sa.Integer()),
        sa.Column("records_created", sa.Integer()),
        sa.Column("records_updated", sa.Integer()),
        sa.Column("error_message", sa.Text()),
        sa.Column("trigger_type", sa.String(20)),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ingestion_logs_source", "ingestion_logs", ["source"])
    op.create_index(
        "ix_ingestion_logs_started_at", "ingestion_logs", ["started_at"]
    )

    op.create_table(
        "settings",
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("value", postgresql.JSONB()),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
        ),
        sa.PrimaryKeyConstraint("key"),
    )

    # Seed default settings
    op.execute("""
        INSERT INTO settings (key, value) VALUES
            ('schedule_nvd_interval_hours',  '6'::jsonb),
            ('schedule_epss_interval_hours', '24'::jsonb),
            ('schedule_kev_interval_hours',  '12'::jsonb),
            ('schedule_euvd_interval_hours', '12'::jsonb),
            ('nvd_results_per_page',         '2000'::jsonb),
            ('default_sort_by',              '"published_date"'::jsonb),
            ('default_sort_order',           '"desc"'::jsonb)
        ON CONFLICT (key) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS update_vulnerabilities_updated_at ON vulnerabilities"
    )
    op.execute("DROP FUNCTION IF EXISTS update_updated_at_column")
    op.drop_table("settings")
    op.drop_index("ix_ingestion_logs_started_at", "ingestion_logs")
    op.drop_index("ix_ingestion_logs_source", "ingestion_logs")
    op.drop_table("ingestion_logs")
    op.drop_index("ix_vulnerabilities_updated_at", "vulnerabilities")
    op.drop_index("ix_vulnerabilities_kev_known_exploited", "vulnerabilities")
    op.drop_index("ix_vulnerabilities_epss_score", "vulnerabilities")
    op.drop_index("ix_vulnerabilities_cvss_v31_score", "vulnerabilities")
    op.drop_index("ix_vulnerabilities_cvss_v30_score", "vulnerabilities")
    op.drop_index("ix_vulnerabilities_cvss_v2_score", "vulnerabilities")
    op.drop_index("ix_vulnerabilities_published_date", "vulnerabilities")
    op.drop_index("ix_vulnerabilities_cve_id", "vulnerabilities")
    op.drop_table("vulnerabilities")
