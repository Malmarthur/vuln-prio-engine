"""Add named scoring profiles, presets, jobs, runs, and per-profile scores.

Revision ID: b7c8d9e0f1a2
Revises: a7b8c9d0e1f2
Create Date: 2026-08-10 00:00:00.000000

"""
from typing import Sequence, Union

import json

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEFAULT_VULNERABILITY_PROFILE = {
    "thresholds": {"V0": 76, "V1": 51, "V2": 26, "V3": 0},
    "columns": {
        "cvss_v40_score": {
            "enabled": True,
            "weight": 40,
            "type": "numeric",
            "range": [0, 10],
            "label": "CVSS Score",
            "default_value": 100,
            "fallbacks": ["cvss_v31_score", "cvss_v30_score", "cvss_v2_score"],
        },
        "epss_score": {
            "enabled": True,
            "weight": 35,
            "type": "numeric",
            "range": [0, 1],
            "label": "EPSS Score",
            "default_value": 100,
        },
        "kev_known_exploited": {
            "enabled": True,
            "weight": 25,
            "type": "boolean",
            "label": "KEV Exploited",
            "values": {"true": 100, "false": 0},
            "default_value": 100,
        },
    },
}

# This was the seed written by c3d4e5f6a7b8 before the active scoring defaults
# moved to CVSS v4 with CVSS-version fallbacks.  Treat it as an uncustomized
# legacy setting during this migration.
LEGACY_VULNERABILITY_PROFILE = {
    "thresholds": {"V0": 76, "V1": 51, "V2": 26, "V3": 0},
    "columns": {
        "cvss_v31_score": {
            "enabled": True,
            "weight": 30,
            "type": "numeric",
            "range": [0, 10],
            "default_value": 100,
        },
        "epss_score": {
            "enabled": True,
            "weight": 25,
            "type": "numeric",
            "range": [0, 1],
            "default_value": 100,
        },
        "kev_known_exploited": {
            "enabled": True,
            "weight": 20,
            "type": "boolean",
            "values": {"true": 100, "false": 0},
            "default_value": 100,
        },
        "cvss_v31_severity": {
            "enabled": True,
            "weight": 15,
            "type": "categorical",
            "values": {"CRITICAL": 100, "HIGH": 66, "MEDIUM": 33, "LOW": 0},
            "default_value": 100,
        },
        "euvd_exploitation": {
            "enabled": True,
            "weight": 10,
            "type": "categorical",
            "values": {},
            "default_value": 100,
        },
        "cvss_v2_score": {
            "enabled": False,
            "weight": 0,
            "type": "numeric",
            "range": [0, 10],
            "default_value": 100,
        },
        "cvss_v30_score": {
            "enabled": False,
            "weight": 0,
            "type": "numeric",
            "range": [0, 10],
            "default_value": 100,
        },
        "cvss_v40_score": {
            "enabled": False,
            "weight": 0,
            "type": "numeric",
            "range": [0, 10],
            "default_value": 100,
        },
        "epss_percentile": {
            "enabled": False,
            "weight": 0,
            "type": "numeric",
            "range": [0, 1],
            "default_value": 100,
        },
        "kev_ransomware_use": {
            "enabled": False,
            "weight": 0,
            "type": "boolean",
            "values": {},
            "default_value": 100,
        },
        "cvss_v2_severity": {
            "enabled": False,
            "weight": 0,
            "type": "categorical",
            "values": {"HIGH": 100, "MEDIUM": 50, "LOW": 0},
            "default_value": 100,
        },
        "cvss_v30_severity": {
            "enabled": False,
            "weight": 0,
            "type": "categorical",
            "values": {"CRITICAL": 100, "HIGH": 66, "MEDIUM": 33, "LOW": 0},
            "default_value": 100,
        },
        "cvss_v40_severity": {
            "enabled": False,
            "weight": 0,
            "type": "categorical",
            "values": {"CRITICAL": 100, "HIGH": 66, "MEDIUM": 33, "LOW": 0},
            "default_value": 100,
        },
    },
}

DEFAULT_ASSET_PROFILE = {
    "thresholds": {"A0": 76, "A1": 51, "A2": 26, "A3": 0},
    "weights": {
        "internet_exposure": 40,
        "business_criticality": 40,
        "patch_complexity": 20,
    },
    "values": {
        "internet_exposure": {"internet": 100, "internal": 45, "isolated": 10, "unknown": 65},
        "business_criticality": {"critical": 100, "high": 75, "medium": 45, "low": 15, "unknown": 65},
        "patch_complexity": {"high": 100, "medium": 55, "low": 20, "unknown": 65},
    },
}

DEFAULT_FINDING_PROFILE = {
    "thresholds": {"P0": 76, "P1": 51, "P2": 26, "P3": 0},
    "weights": {"vulnerability_priority": 50, "asset_priority": 50},
}


def _weighted_vulnerability_profile(weights: tuple[int, int, int]) -> dict:
    config = json.loads(json.dumps(DEFAULT_VULNERABILITY_PROFILE))
    for key, weight in zip(
        ("cvss_v40_score", "epss_score", "kev_known_exploited"), weights
    ):
        config["columns"][key]["weight"] = weight
    return config


def _weighted_asset_profile(weights: tuple[int, int, int]) -> dict:
    config = json.loads(json.dumps(DEFAULT_ASSET_PROFILE))
    config["weights"] = dict(
        zip(
            ("internet_exposure", "business_criticality", "patch_complexity"),
            weights,
        )
    )
    return config


def _weighted_finding_profile(weights: tuple[int, int]) -> dict:
    config = json.loads(json.dumps(DEFAULT_FINDING_PROFILE))
    config["weights"] = dict(
        zip(("vulnerability_priority", "asset_priority"), weights)
    )
    return config


def _json_literal(value: object) -> str:
    return json.dumps(value, separators=(",", ":")).replace("'", "''")


def _execute_sql(sql: str) -> None:
    """Execute generated SQL without SQLAlchemy's colon bind parsing."""
    op.get_bind().exec_driver_sql(sql)


def upgrade() -> None:
    op.create_table(
        "scoring_profiles",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("stage", sa.String(20), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("config", postgresql.JSONB(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stage", "name", name="uq_scoring_profiles_stage_name"),
        sa.CheckConstraint(
            "stage IN ('vulnerability', 'asset', 'finding')",
            name="ck_scoring_profiles_stage",
        ),
    )
    op.create_index("ix_scoring_profiles_stage", "scoring_profiles", ["stage"])

    op.create_table(
        "scoring_contexts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("vulnerability_profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("asset_profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("finding_profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["vulnerability_profile_id"],
            ["scoring_profiles.id"],
            name="fk_scoring_contexts_vulnerability_profile",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["asset_profile_id"],
            ["scoring_profiles.id"],
            name="fk_scoring_contexts_asset_profile",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["finding_profile_id"],
            ["scoring_profiles.id"],
            name="fk_scoring_contexts_finding_profile",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "vulnerability_profile_id",
            "asset_profile_id",
            "finding_profile_id",
            name="uq_scoring_contexts_profiles",
        ),
    )
    op.create_index(
        "ix_scoring_contexts_vulnerability_profile_id",
        "scoring_contexts",
        ["vulnerability_profile_id"],
    )
    op.create_index(
        "ix_scoring_contexts_asset_profile_id",
        "scoring_contexts",
        ["asset_profile_id"],
    )
    op.create_index(
        "ix_scoring_contexts_finding_profile_id",
        "scoring_contexts",
        ["finding_profile_id"],
    )

    op.create_table(
        "scoring_presets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("context_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["context_id"],
            ["scoring_contexts.id"],
            name="fk_scoring_presets_context",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_scoring_presets_name"),
    )
    op.create_index(
        "uq_scoring_presets_active",
        "scoring_presets",
        ["is_active"],
        unique=True,
        postgresql_where=sa.text("is_active IS TRUE"),
    )

    op.create_table(
        "scoring_jobs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("scope", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("progress", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("request", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("error", sa.Text()),
        sa.Column("cancel_requested", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("finished_at", sa.TIMESTAMP(timezone=True)),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("kind IN ('run', 'comparison')", name="ck_scoring_jobs_kind"),
    )
    op.create_index("ix_scoring_jobs_status", "scoring_jobs", ["status"])
    op.create_index("ix_scoring_jobs_created_at", "scoring_jobs", ["created_at"])

    op.create_table(
        "scoring_runs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("scope", sa.String(20), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("context_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("config_snapshot", postgresql.JSONB()),
        sa.Column("profile_revisions", postgresql.JSONB()),
        sa.Column("distribution", postgresql.JSONB()),
        sa.Column("dataset_watermark_before", postgresql.JSONB()),
        sa.Column("dataset_watermark_after", postgresql.JSONB()),
        sa.Column("rows_scored", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("is_stale", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("finished_at", sa.TIMESTAMP(timezone=True)),
        sa.ForeignKeyConstraint(
            ["job_id"],
            ["scoring_jobs.id"],
            name="fk_scoring_runs_job",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["context_id"],
            ["scoring_contexts.id"],
            name="fk_scoring_runs_context",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scoring_runs_job_id", "scoring_runs", ["job_id"])
    op.create_index("ix_scoring_runs_context_id", "scoring_runs", ["context_id"])
    op.create_index("ix_scoring_runs_status", "scoring_runs", ["status"])
    op.create_index("ix_scoring_runs_target", "scoring_runs", ["scope", "target_id"])

    # Add the new score dimensions while the old primary keys are still in
    # place. They are nullable temporarily so existing rows can be backfilled.
    op.add_column(
        "vulnerability_scores",
        sa.Column("vulnerability_profile_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "vulnerability_scores",
        sa.Column("profile_revision", sa.Integer(), nullable=True, server_default="1"),
    )
    op.add_column(
        "vulnerability_scores",
        sa.Column("scoring_run_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_vulnerability_scores_profile",
        "vulnerability_scores",
        "scoring_profiles",
        ["vulnerability_profile_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_vulnerability_scores_scoring_run",
        "vulnerability_scores",
        "scoring_runs",
        ["scoring_run_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "asset_scores",
        sa.Column("asset_profile_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "asset_scores",
        sa.Column("profile_revision", sa.Integer(), nullable=True, server_default="1"),
    )
    op.add_column(
        "asset_scores",
        sa.Column("scoring_run_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_asset_scores_profile",
        "asset_scores",
        "scoring_profiles",
        ["asset_profile_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_asset_scores_scoring_run",
        "asset_scores",
        "scoring_runs",
        ["scoring_run_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "finding_scores",
        sa.Column("scoring_context_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "finding_scores",
        sa.Column(
            "profile_revisions",
            postgresql.JSONB(),
            nullable=True,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "finding_scores",
        sa.Column("scoring_run_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_finding_scores_context",
        "finding_scores",
        "scoring_contexts",
        ["scoring_context_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_finding_scores_scoring_run",
        "finding_scores",
        "scoring_runs",
        ["scoring_run_id"],
        ["id"],
        ondelete="SET NULL",
    )

    profiles = (
        ("00000000-0000-0000-0000-000000000101", "vulnerability", "Balanced", _weighted_vulnerability_profile((40, 35, 25))),
        ("00000000-0000-0000-0000-000000000102", "asset", "Balanced", _weighted_asset_profile((40, 40, 20))),
        ("00000000-0000-0000-0000-000000000103", "finding", "Balanced", _weighted_finding_profile((50, 50))),
        ("00000000-0000-0000-0000-000000000111", "vulnerability", "Active Exploitation", _weighted_vulnerability_profile((20, 45, 35))),
        ("00000000-0000-0000-0000-000000000112", "asset", "Active Exploitation", _weighted_asset_profile((60, 25, 15))),
        ("00000000-0000-0000-0000-000000000113", "finding", "Active Exploitation", _weighted_finding_profile((65, 35))),
        ("00000000-0000-0000-0000-000000000121", "vulnerability", "Business Impact", _weighted_vulnerability_profile((55, 20, 25))),
        ("00000000-0000-0000-0000-000000000122", "asset", "Business Impact", _weighted_asset_profile((20, 65, 15))),
        ("00000000-0000-0000-0000-000000000123", "finding", "Business Impact", _weighted_finding_profile((40, 60))),
    )
    profile_values = ",\n".join(
        "('{}'::uuid, '{}', '{}', '{}'::jsonb, 1, true)".format(
            profile_id,
            stage,
            name,
            _json_literal(config),
        )
        for profile_id, stage, name, config in profiles
    )
    _execute_sql(
        """
        INSERT INTO scoring_profiles (id, stage, name, config, revision, is_builtin)
        VALUES
        """
        + profile_values
        + " ON CONFLICT (stage, name) DO NOTHING"
    )

    contexts = (
        ("00000000-0000-0000-0000-000000000201", "00000000-0000-0000-0000-000000000101", "00000000-0000-0000-0000-000000000102", "00000000-0000-0000-0000-000000000103"),
        ("00000000-0000-0000-0000-000000000202", "00000000-0000-0000-0000-000000000111", "00000000-0000-0000-0000-000000000112", "00000000-0000-0000-0000-000000000113"),
        ("00000000-0000-0000-0000-000000000203", "00000000-0000-0000-0000-000000000121", "00000000-0000-0000-0000-000000000122", "00000000-0000-0000-0000-000000000123"),
    )
    context_values = ",\n".join(
        "('{}'::uuid, '{}'::uuid, '{}'::uuid, '{}'::uuid)".format(*context)
        for context in contexts
    )
    _execute_sql(
        """
        INSERT INTO scoring_contexts (
            id, vulnerability_profile_id, asset_profile_id, finding_profile_id
        )
        VALUES
        """
        + context_values
        + " ON CONFLICT (vulnerability_profile_id, asset_profile_id, finding_profile_id) DO NOTHING"
    )

    presets = (
        ("00000000-0000-0000-0000-000000000301", "Balanced", "00000000-0000-0000-0000-000000000201", "true"),
        ("00000000-0000-0000-0000-000000000302", "Active Exploitation", "00000000-0000-0000-0000-000000000202", "false"),
        ("00000000-0000-0000-0000-000000000303", "Business Impact", "00000000-0000-0000-0000-000000000203", "false"),
    )
    preset_values = ",\n".join(
        "('{}'::uuid, '{}', '{}'::uuid, {})".format(*preset)
        for preset in presets
    )
    _execute_sql(
        """
        INSERT INTO scoring_presets (id, name, context_id, is_builtin, is_active)
        SELECT value.id, value.name, value.context_id, true, value.is_active
        FROM (VALUES
        """
        + preset_values
        + """
        ) AS value(id, name, context_id, is_active)
        ON CONFLICT (name) DO NOTHING
        """
    )

    current_vulnerability = _json_literal(DEFAULT_VULNERABILITY_PROFILE)
    legacy_vulnerability = _json_literal(LEGACY_VULNERABILITY_PROFILE)
    current_asset = _json_literal(DEFAULT_ASSET_PROFILE)
    current_finding = _json_literal(DEFAULT_FINDING_PROFILE)
    _execute_sql(
        f"""
        DO $$
        DECLARE
            v_vulnerability_setting jsonb;
            v_asset_setting jsonb;
            v_finding_setting jsonb;
            v_vulnerability_default jsonb := '{current_vulnerability}'::jsonb;
            v_vulnerability_legacy_default jsonb := '{legacy_vulnerability}'::jsonb;
            v_asset_default jsonb := '{current_asset}'::jsonb;
            v_finding_default jsonb := '{current_finding}'::jsonb;
            v_vulnerability_profile uuid;
            v_asset_profile uuid;
            v_finding_profile uuid;
            v_context uuid;
            v_preset uuid;
            v_custom boolean;
        BEGIN
            SELECT value INTO v_vulnerability_setting
            FROM settings WHERE key = 'scoring_profile';
            SELECT value INTO v_asset_setting
            FROM settings WHERE key = 'asset_scoring_profile';
            SELECT value INTO v_finding_setting
            FROM settings WHERE key = 'finding_scoring_profile';

            v_vulnerability_setting := COALESCE(v_vulnerability_setting, v_vulnerability_default);
            v_asset_setting := COALESCE(v_asset_setting, v_asset_default);
            v_finding_setting := COALESCE(v_finding_setting, v_finding_default);

            -- Normalize the two legacy finding representations used before
            -- the P0..P3 naming and before the asset/vulnerability split.
            IF (v_finding_setting -> 'thresholds') ? 'V0'
               AND NOT ((v_finding_setting -> 'thresholds') ? 'P0') THEN
                v_finding_setting := v_finding_setting || jsonb_build_object(
                    'thresholds', jsonb_build_object(
                        'P0', v_finding_setting #> '{{thresholds,V0}}',
                        'P1', v_finding_setting #> '{{thresholds,V1}}',
                        'P2', v_finding_setting #> '{{thresholds,V2}}',
                        'P3', v_finding_setting #> '{{thresholds,V3}}'
                    )
                );
            END IF;
            IF (v_finding_setting -> 'weights') IS NOT NULL
               AND NOT ((v_finding_setting -> 'weights') ? 'asset_priority') THEN
                v_finding_setting := jsonb_set(
                    v_finding_setting,
                    '{{weights}}',
                    jsonb_build_object(
                        'vulnerability_priority', COALESCE(v_finding_setting #> '{{weights,vulnerability_priority}}', '50'::jsonb),
                        'asset_priority', COALESCE(v_finding_setting #> '{{weights,asset_priority}}', '50'::jsonb)
                    ),
                    true
                );
            END IF;
            IF v_finding_setting ? 'values' THEN
                v_finding_setting := v_finding_setting - 'values';
            END IF;

            v_custom := (
                v_vulnerability_setting IS DISTINCT FROM v_vulnerability_default
                AND v_vulnerability_setting IS DISTINCT FROM v_vulnerability_legacy_default
            ) OR v_asset_setting IS DISTINCT FROM v_asset_default
              OR v_finding_setting IS DISTINCT FROM v_finding_default;

            IF v_custom THEN
                INSERT INTO scoring_profiles (
                    stage, name, description, config, revision, is_builtin
                ) VALUES (
                    'vulnerability', 'Current Vulnerability', 'Migrated legacy vulnerability scoring profile', v_vulnerability_setting, 1, false
                ) RETURNING id INTO v_vulnerability_profile;
                INSERT INTO scoring_profiles (
                    stage, name, description, config, revision, is_builtin
                ) VALUES (
                    'asset', 'Current Asset', 'Migrated legacy asset scoring profile', v_asset_setting, 1, false
                ) RETURNING id INTO v_asset_profile;
                INSERT INTO scoring_profiles (
                    stage, name, description, config, revision, is_builtin
                ) VALUES (
                    'finding', 'Current Finding', 'Migrated legacy finding scoring profile', v_finding_setting, 1, false
                ) RETURNING id INTO v_finding_profile;

                INSERT INTO scoring_contexts (
                    vulnerability_profile_id, asset_profile_id, finding_profile_id
                ) VALUES (
                    v_vulnerability_profile, v_asset_profile, v_finding_profile
                ) RETURNING id INTO v_context;
                INSERT INTO scoring_presets (
                    name, description, context_id, is_builtin, is_active
                ) VALUES (
                    'Current configuration', 'Migrated legacy scoring configuration', v_context, false, false
                ) RETURNING id INTO v_preset;
            ELSE
                SELECT id INTO v_vulnerability_profile
                FROM scoring_profiles
                WHERE stage = 'vulnerability' AND name = 'Balanced';
                SELECT id INTO v_asset_profile
                FROM scoring_profiles
                WHERE stage = 'asset' AND name = 'Balanced';
                SELECT id INTO v_finding_profile
                FROM scoring_profiles
                WHERE stage = 'finding' AND name = 'Balanced';
                SELECT id INTO v_context
                FROM scoring_contexts
                WHERE vulnerability_profile_id = v_vulnerability_profile
                  AND asset_profile_id = v_asset_profile
                  AND finding_profile_id = v_finding_profile;
                SELECT id INTO v_preset
                FROM scoring_presets
                WHERE name = 'Balanced';
            END IF;

            UPDATE scoring_presets SET is_active = false WHERE is_active IS TRUE;
            UPDATE scoring_presets SET is_active = true WHERE id = v_preset;

            UPDATE vulnerability_scores
            SET vulnerability_profile_id = v_vulnerability_profile,
                profile_revision = 1
            WHERE vulnerability_profile_id IS NULL;
            UPDATE asset_scores
            SET asset_profile_id = v_asset_profile,
                profile_revision = 1
            WHERE asset_profile_id IS NULL;
            UPDATE finding_scores
            SET scoring_context_id = v_context,
                profile_revisions = jsonb_build_object(
                    v_vulnerability_profile::text, 1,
                    v_asset_profile::text, 1,
                    v_finding_profile::text, 1
                )
            WHERE scoring_context_id IS NULL;
        END $$;
        """
    )

    op.alter_column("vulnerability_scores", "vulnerability_profile_id", nullable=False)
    op.alter_column("vulnerability_scores", "profile_revision", nullable=False)
    op.alter_column("asset_scores", "asset_profile_id", nullable=False)
    op.alter_column("asset_scores", "profile_revision", nullable=False)
    op.alter_column("finding_scores", "scoring_context_id", nullable=False)
    op.alter_column("finding_scores", "profile_revisions", nullable=False)

    op.drop_constraint("vulnerability_scores_pkey", "vulnerability_scores", type_="primary")
    op.create_primary_key(
        "vulnerability_scores_pkey",
        "vulnerability_scores",
        ["vulnerability_id", "vulnerability_profile_id"],
    )
    op.create_index(
        "ix_vulnerability_scores_profile_id",
        "vulnerability_scores",
        ["vulnerability_profile_id"],
    )
    op.create_index(
        "ix_vulnerability_scores_scoring_run_id",
        "vulnerability_scores",
        ["scoring_run_id"],
    )

    op.drop_constraint("asset_scores_pkey", "asset_scores", type_="primary")
    op.create_primary_key(
        "asset_scores_pkey",
        "asset_scores",
        ["asset_id", "asset_profile_id"],
    )
    op.create_index("ix_asset_scores_profile_id", "asset_scores", ["asset_profile_id"])
    op.create_index("ix_asset_scores_scoring_run_id", "asset_scores", ["scoring_run_id"])

    op.drop_constraint("finding_scores_pkey", "finding_scores", type_="primary")
    op.create_primary_key(
        "finding_scores_pkey",
        "finding_scores",
        ["finding_id", "scoring_context_id"],
    )
    op.create_index("ix_finding_scores_context_id", "finding_scores", ["scoring_context_id"])
    op.create_index("ix_finding_scores_scoring_run_id", "finding_scores", ["scoring_run_id"])
    _execute_sql(
        "UPDATE scoring_profiles SET description = 'Built-in ' || name || ' scoring profile' "
        "WHERE is_builtin IS TRUE AND description = ''"
    )
    _execute_sql(
        "UPDATE scoring_presets SET description = 'Built-in ' || name || ' scoring scenario' "
        "WHERE is_builtin IS TRUE AND description = ''"
    )


def _keep_active_profile_score(table: str, entity_column: str, profile_column: str, active_column: str) -> None:
    op.execute(
        f"""
        WITH active_context AS (
            SELECT c.{active_column} AS profile_id
            FROM scoring_presets p
            JOIN scoring_contexts c ON c.id = p.context_id
            WHERE p.is_active IS TRUE
            ORDER BY p.id
            LIMIT 1
        ), chosen AS (
            SELECT DISTINCT ON (s.{entity_column}) s.ctid
            FROM {table} s
            LEFT JOIN active_context a ON TRUE
            ORDER BY s.{entity_column},
                (s.{profile_column} = a.profile_id) DESC NULLS LAST,
                s.profile_revision DESC NULLS LAST,
                s.{profile_column}
        )
        DELETE FROM {table} s
        WHERE NOT EXISTS (
            SELECT 1 FROM chosen c WHERE c.ctid = s.ctid
        )
        """
    )


def _keep_active_context_score() -> None:
    op.execute(
        """
        WITH active_context AS (
            SELECT p.context_id
            FROM scoring_presets p
            WHERE p.is_active IS TRUE
            ORDER BY p.id
            LIMIT 1
        ), chosen AS (
            SELECT DISTINCT ON (s.finding_id) s.ctid
            FROM finding_scores s
            LEFT JOIN active_context a ON TRUE
            ORDER BY s.finding_id,
                (s.scoring_context_id = a.context_id) DESC NULLS LAST,
                s.scoring_context_id
        )
        DELETE FROM finding_scores s
        WHERE NOT EXISTS (
            SELECT 1 FROM chosen c WHERE c.ctid = s.ctid
        )
        """
    )


def downgrade() -> None:
    # Collapse the versioned score sets before restoring the historical
    # one-row-per-entity primary keys. The active preset wins whenever its
    # profile/context has a score; the deterministic revision/id ordering is
    # only a fallback for entities missing from that active result set.
    _keep_active_profile_score(
        "vulnerability_scores",
        "vulnerability_id",
        "vulnerability_profile_id",
        "vulnerability_profile_id",
    )
    _keep_active_profile_score(
        "asset_scores",
        "asset_id",
        "asset_profile_id",
        "asset_profile_id",
    )
    _keep_active_context_score()

    op.drop_index("ix_vulnerability_scores_scoring_run_id", table_name="vulnerability_scores")
    op.drop_index("ix_vulnerability_scores_profile_id", table_name="vulnerability_scores")
    op.drop_constraint("fk_vulnerability_scores_scoring_run", "vulnerability_scores", type_="foreignkey")
    op.drop_constraint("fk_vulnerability_scores_profile", "vulnerability_scores", type_="foreignkey")
    op.drop_constraint("vulnerability_scores_pkey", "vulnerability_scores", type_="primary")
    op.drop_column("vulnerability_scores", "scoring_run_id")
    op.drop_column("vulnerability_scores", "profile_revision")
    op.drop_column("vulnerability_scores", "vulnerability_profile_id")
    op.create_primary_key("vulnerability_scores_pkey", "vulnerability_scores", ["vulnerability_id"])

    op.drop_index("ix_asset_scores_scoring_run_id", table_name="asset_scores")
    op.drop_index("ix_asset_scores_profile_id", table_name="asset_scores")
    op.drop_constraint("fk_asset_scores_scoring_run", "asset_scores", type_="foreignkey")
    op.drop_constraint("fk_asset_scores_profile", "asset_scores", type_="foreignkey")
    op.drop_constraint("asset_scores_pkey", "asset_scores", type_="primary")
    op.drop_column("asset_scores", "scoring_run_id")
    op.drop_column("asset_scores", "profile_revision")
    op.drop_column("asset_scores", "asset_profile_id")
    op.create_primary_key("asset_scores_pkey", "asset_scores", ["asset_id"])

    op.drop_index("ix_finding_scores_scoring_run_id", table_name="finding_scores")
    op.drop_index("ix_finding_scores_context_id", table_name="finding_scores")
    op.drop_constraint("fk_finding_scores_scoring_run", "finding_scores", type_="foreignkey")
    op.drop_constraint("fk_finding_scores_context", "finding_scores", type_="foreignkey")
    op.drop_constraint("finding_scores_pkey", "finding_scores", type_="primary")
    op.drop_column("finding_scores", "scoring_run_id")
    op.drop_column("finding_scores", "profile_revisions")
    op.drop_column("finding_scores", "scoring_context_id")
    op.create_primary_key("finding_scores_pkey", "finding_scores", ["finding_id"])

    op.drop_table("scoring_runs")
    op.drop_table("scoring_jobs")
    op.drop_table("scoring_presets")
    op.drop_table("scoring_contexts")
    op.drop_table("scoring_profiles")
