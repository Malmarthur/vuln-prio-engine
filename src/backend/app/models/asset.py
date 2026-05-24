import uuid

from sqlalchemy import Boolean, Column, ForeignKey, Index, Numeric, String, Text, TIMESTAMP, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Asset(Base):
    __tablename__ = "assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_id = Column(String(255), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    asset_type = Column(String(50), nullable=False, default="application")
    source = Column(String(50), nullable=False, default="cyclonedx")

    internet_exposure = Column(String(20), nullable=False, default="unknown")
    business_criticality = Column(String(20), nullable=False, default="unknown")
    patch_complexity = Column(String(20), nullable=False, default="unknown")

    raw_payload = Column(JSONB)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    components = relationship(
        "AssetComponent",
        back_populates="asset",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        Index("ix_assets_name", "name"),
        Index("ix_assets_internet_exposure", "internet_exposure"),
        Index("ix_assets_business_criticality", "business_criticality"),
    )


class AssetComponent(Base):
    __tablename__ = "asset_components"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)

    bom_ref = Column(String(255))
    name = Column(String(255), nullable=False)
    version = Column(String(255))
    vendor = Column(String(255))
    product = Column(String(255))
    purl = Column(Text)
    cpe = Column(Text)
    cpe_part = Column(String(20))
    cpe_vendor = Column(String(255))
    cpe_product = Column(String(255))
    cpe_version = Column(String(255))
    raw_component = Column(JSONB)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    asset = relationship("Asset", back_populates="components")

    __table_args__ = (
        Index("ix_asset_components_asset_id", "asset_id"),
        Index("ix_asset_components_cpe_lookup", "cpe_part", "cpe_vendor", "cpe_product"),
    )


class VulnerabilityProduct(Base):
    __tablename__ = "vulnerability_products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vulnerability_id = Column(
        UUID(as_uuid=True),
        ForeignKey("vulnerabilities.id", ondelete="CASCADE"),
        nullable=False,
    )
    cve_id = Column(String(20), nullable=False)
    cpe = Column(Text, nullable=False)
    cpe_part = Column(String(20))
    cpe_vendor = Column(String(255))
    cpe_product = Column(String(255))
    cpe_version = Column(String(255))
    version_start = Column(String(255))
    version_start_including = Column(Boolean)
    version_end = Column(String(255))
    version_end_including = Column(Boolean)

    vulnerability = relationship("Vulnerability")

    __table_args__ = (
        Index("ix_vulnerability_products_cve_id", "cve_id"),
        Index("ix_vulnerability_products_lookup", "cpe_part", "cpe_vendor", "cpe_product"),
        UniqueConstraint(
            "vulnerability_id",
            "cpe",
            "version_start",
            "version_start_including",
            "version_end",
            "version_end_including",
            name="uq_vulnerability_products_identity",
        ),
    )


class Finding(Base):
    __tablename__ = "findings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    asset_component_id = Column(
        UUID(as_uuid=True),
        ForeignKey("asset_components.id", ondelete="CASCADE"),
        nullable=False,
    )
    vulnerability_id = Column(
        UUID(as_uuid=True),
        ForeignKey("vulnerabilities.id", ondelete="CASCADE"),
        nullable=False,
    )
    match_type = Column(String(50), nullable=False)
    match_confidence = Column(Numeric(4, 1), nullable=False)
    status = Column(String(20), nullable=False, default="open")
    first_seen_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    last_seen_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    asset = relationship("Asset")
    component = relationship("AssetComponent")
    vulnerability = relationship("Vulnerability")
    score = relationship("FindingScore", uselist=False, lazy="joined", cascade="all, delete-orphan")

    @property
    def priority_score(self):
        return self.score.priority_score if self.score else None

    @property
    def priority_level(self):
        return self.score.priority_level if self.score else None

    @property
    def priority_confidence(self):
        return self.score.priority_confidence if self.score else None

    __table_args__ = (
        UniqueConstraint("asset_component_id", "vulnerability_id", name="uq_findings_component_vulnerability"),
        Index("ix_findings_asset_id", "asset_id"),
        Index("ix_findings_vulnerability_id", "vulnerability_id"),
        Index("ix_findings_status", "status"),
    )


class FindingScore(Base):
    __tablename__ = "finding_scores"

    finding_id = Column(
        UUID(as_uuid=True),
        ForeignKey("findings.id", ondelete="CASCADE"),
        primary_key=True,
    )
    priority_score = Column(Numeric(4, 1))
    priority_confidence = Column(Numeric(4, 1))
    priority_level = Column(String(2))

    __table_args__ = (
        Index("ix_finding_scores_priority_score", "priority_score"),
        Index("ix_finding_scores_priority_level", "priority_level"),
    )
