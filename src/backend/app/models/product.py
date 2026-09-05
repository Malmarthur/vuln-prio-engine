import uuid

from sqlalchemy import Column, ForeignKey, Index, Integer, String, Text, TIMESTAMP, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Product(Base):
    __tablename__ = "products"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key = Column(String(255), nullable=False, unique=True)
    vendor = Column(String(255), nullable=False)
    canonical_name = Column(String(255), nullable=False)
    product_metadata = Column("metadata", JSONB, nullable=False, default=dict, server_default="{}")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    aliases = relationship("ProductAlias", back_populates="product", cascade="all, delete-orphan")
    bindings = relationship("ProductExternalBinding", back_populates="product", cascade="all, delete-orphan")


class ProductAlias(Base):
    __tablename__ = "product_aliases"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    vendor_raw = Column(String(255), nullable=False)
    name_raw = Column(String(255), nullable=False)
    vendor_normalized = Column(String(255), nullable=True)
    name_normalized = Column(String(255), nullable=False)
    alias_type = Column(String(50), nullable=False, default="validated")
    provenance = Column(JSONB, nullable=False, default=dict, server_default="{}")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    product = relationship("Product", back_populates="aliases")
    __table_args__ = (UniqueConstraint("product_id", "vendor_raw", "name_raw", "alias_type", name="uq_product_alias_per_product"), Index("ix_product_aliases_normalized", "vendor_normalized", "name_normalized"))


class ProductExternalBinding(Base):
    __tablename__ = "product_external_bindings"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    binding_type = Column(String(50), nullable=False)
    value_raw = Column(Text, nullable=False)
    normalized_fields = Column(JSONB, nullable=False, default=dict, server_default="{}")
    status = Column(String(50), nullable=False, default="validated")
    provenance = Column(JSONB, nullable=False, default=dict, server_default="{}")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    product = relationship("Product", back_populates="bindings")
    __table_args__ = (UniqueConstraint("product_id", "binding_type", "value_raw", name="uq_product_binding_per_product"), Index("ix_product_external_bindings_lookup", "binding_type", "value_raw"))


class ProductResolutionRun(Base):
    __tablename__ = "product_resolution_runs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scope = Column(JSONB, nullable=False, default=dict, server_default="{}")
    status = Column(String(20), nullable=False, default="running")
    module_id = Column(String(100), nullable=False)
    module_version = Column(String(50), nullable=False)
    configuration = Column(JSONB, nullable=False, default=dict, server_default="{}")
    configuration_digest = Column(String(64), nullable=False)
    catalog_digest = Column(String(64), nullable=False)
    decision_schema_version = Column(String(100), nullable=False)
    started_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    finished_at = Column(TIMESTAMP(timezone=True))
    components_processed = Column(Integer, nullable=False, default=0, server_default="0")
    resolved_count = Column(Integer, nullable=False, default=0, server_default="0")
    unknown_count = Column(Integer, nullable=False, default=0, server_default="0")
    ambiguous_count = Column(Integer, nullable=False, default=0, server_default="0")
    error_count = Column(Integer, nullable=False, default=0, server_default="0")
    terminal_error = Column(Text)
    decisions = relationship("ProductResolutionDecision", back_populates="run")


class ProductResolutionDecision(Base):
    __tablename__ = "product_resolution_decisions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("product_resolution_runs.id", ondelete="RESTRICT"), nullable=False)
    asset_component_id = Column(UUID(as_uuid=True), ForeignKey("asset_components.id", ondelete="SET NULL"))
    asset_id = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="SET NULL"))
    resolved_product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="RESTRICT"))
    previous_decision_id = Column(UUID(as_uuid=True), ForeignKey("product_resolution_decisions.id", ondelete="SET NULL"))
    component_snapshot = Column(JSONB, nullable=False)
    input_fingerprint = Column(String(64), nullable=False)
    status = Column(String(20), nullable=False)
    method = Column(String(100), nullable=False)
    confidence = Column(Integer)
    confidence_basis = Column(Text, nullable=False)
    candidates = Column(JSONB, nullable=False)
    evidence = Column(JSONB, nullable=False)
    module_id = Column(String(100), nullable=False)
    module_version = Column(String(50), nullable=False)
    configuration = Column(JSONB, nullable=False, default=dict, server_default="{}")
    configuration_digest = Column(String(64), nullable=False)
    catalog_digest = Column(String(64), nullable=False)
    decided_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    run = relationship("ProductResolutionRun", back_populates="decisions")
    resolved_product = relationship("Product", foreign_keys=[resolved_product_id])
    __table_args__ = (Index("ix_product_resolution_decisions_component_decided", "asset_component_id", "decided_at"), Index("ix_product_resolution_decisions_asset_id", "asset_id"), Index("ix_product_resolution_decisions_run_id", "run_id"), Index("ix_product_resolution_decisions_status", "status"))
