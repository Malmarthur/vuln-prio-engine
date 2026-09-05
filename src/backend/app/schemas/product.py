from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    key: str
    vendor: str
    canonical_name: str


class ProductResolutionDecisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    status: Literal["resolved", "unknown", "ambiguous"]
    resolved_product: ProductResponse | None = None
    method: str
    confidence: int | None = None
    confidence_basis: str
    candidates: dict[str, Any]
    evidence: dict[str, Any]
    module_id: str
    module_version: str
    configuration_digest: str
    catalog_digest: str
    decided_at: datetime


class ProductResolutionRunRequest(BaseModel):
    asset_id: UUID | None = None


class ProductResolutionRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    status: str
    components_processed: int
    resolved_count: int
    unknown_count: int
    ambiguous_count: int
    error_count: int
    module_id: str
    module_version: str
    configuration_digest: str
    catalog_digest: str
    started_at: datetime
    finished_at: datetime | None = None
