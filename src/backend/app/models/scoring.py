import uuid

from sqlalchemy import Boolean, CheckConstraint, Column, ForeignKey, Index, Integer, Numeric, String, Text, TIMESTAMP, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class ScoringProfile(Base):
    __tablename__ = "scoring_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    stage = Column(String(20), nullable=False)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=False, default="", server_default="")
    config = Column(JSONB, nullable=False)
    revision = Column(Integer, nullable=False, default=1, server_default="1")
    is_builtin = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    vulnerability_contexts = relationship(
        "ScoringContext",
        foreign_keys=lambda: [ScoringContext.vulnerability_profile_id],
        back_populates="vulnerability_profile",
        passive_deletes=True,
    )
    asset_contexts = relationship(
        "ScoringContext",
        foreign_keys=lambda: [ScoringContext.asset_profile_id],
        back_populates="asset_profile",
        passive_deletes=True,
    )
    finding_contexts = relationship(
        "ScoringContext",
        foreign_keys=lambda: [ScoringContext.finding_profile_id],
        back_populates="finding_profile",
        passive_deletes=True,
    )

    __table_args__ = (
        UniqueConstraint("stage", "name", name="uq_scoring_profiles_stage_name"),
        CheckConstraint(
            "stage IN ('vulnerability', 'asset', 'finding')",
            name="ck_scoring_profiles_stage",
        ),
        Index("ix_scoring_profiles_stage", "stage"),
    )


class ScoringContext(Base):
    __tablename__ = "scoring_contexts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vulnerability_profile_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scoring_profiles.id", ondelete="RESTRICT"),
        nullable=False,
    )
    asset_profile_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scoring_profiles.id", ondelete="RESTRICT"),
        nullable=False,
    )
    finding_profile_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scoring_profiles.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    vulnerability_profile = relationship(
        "ScoringProfile",
        foreign_keys=[vulnerability_profile_id],
        back_populates="vulnerability_contexts",
    )
    asset_profile = relationship(
        "ScoringProfile",
        foreign_keys=[asset_profile_id],
        back_populates="asset_contexts",
    )
    finding_profile = relationship(
        "ScoringProfile",
        foreign_keys=[finding_profile_id],
        back_populates="finding_contexts",
    )
    presets = relationship(
        "ScoringPreset",
        back_populates="context",
        passive_deletes=True,
    )
    runs = relationship(
        "ScoringRun",
        back_populates="context",
        passive_deletes=True,
    )

    __table_args__ = (
        UniqueConstraint(
            "vulnerability_profile_id",
            "asset_profile_id",
            "finding_profile_id",
            name="uq_scoring_contexts_profiles",
        ),
        Index("ix_scoring_contexts_vulnerability_profile_id", "vulnerability_profile_id"),
        Index("ix_scoring_contexts_asset_profile_id", "asset_profile_id"),
        Index("ix_scoring_contexts_finding_profile_id", "finding_profile_id"),
    )


class ScoringPreset(Base):
    __tablename__ = "scoring_presets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(120), nullable=False, unique=True)
    description = Column(Text, nullable=False, default="", server_default="")
    context_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scoring_contexts.id", ondelete="RESTRICT"),
        nullable=False,
    )
    is_builtin = Column(Boolean, nullable=False, default=False, server_default="false")
    is_active = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    context = relationship("ScoringContext", back_populates="presets")

    __table_args__ = (
        Index(
            "uq_scoring_presets_active",
            "is_active",
            unique=True,
            postgresql_where=text("is_active IS TRUE"),
        ),
    )


class ScoringJob(Base):
    __tablename__ = "scoring_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind = Column(String(20), nullable=False)
    scope = Column(String(20), nullable=False)
    status = Column(String(20), nullable=False, default="pending", server_default="pending")
    progress = Column(Numeric(5, 2), nullable=False, default=0, server_default="0")
    progress_detail = Column(JSONB, nullable=False, default=dict, server_default="{}")
    request = Column(JSONB, nullable=False, default=dict, server_default="{}")
    result_summary = Column(JSONB)
    error = Column(Text)
    cancel_requested = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    started_at = Column(TIMESTAMP(timezone=True))
    finished_at = Column(TIMESTAMP(timezone=True))

    runs = relationship(
        "ScoringRun",
        back_populates="job",
        passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint("kind IN ('run', 'comparison')", name="ck_scoring_jobs_kind"),
        Index("ix_scoring_jobs_status", "status"),
        Index("ix_scoring_jobs_created_at", "created_at"),
    )


class ScoringRun(Base):
    __tablename__ = "scoring_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("scoring_jobs.id", ondelete="SET NULL"))
    scope = Column(String(20), nullable=False)
    target_id = Column(UUID(as_uuid=True))
    context_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scoring_contexts.id", ondelete="RESTRICT"),
    )
    config_snapshot = Column(JSONB)
    profile_revisions = Column(JSONB)
    distribution = Column(JSONB)
    dataset_watermark_before = Column(JSONB)
    dataset_watermark_after = Column(JSONB)
    rows_scored = Column(Integer, nullable=False, default=0, server_default="0")
    status = Column(String(20), nullable=False, default="pending", server_default="pending")
    is_stale = Column(Boolean, nullable=False, default=False, server_default="false")
    started_at = Column(TIMESTAMP(timezone=True))
    finished_at = Column(TIMESTAMP(timezone=True))

    job = relationship("ScoringJob", back_populates="runs")
    context = relationship("ScoringContext", back_populates="runs")

    __table_args__ = (
        Index("ix_scoring_runs_job_id", "job_id"),
        Index("ix_scoring_runs_context_id", "context_id"),
        Index("ix_scoring_runs_status", "status"),
        Index("ix_scoring_runs_target", "scope", "target_id"),
    )
