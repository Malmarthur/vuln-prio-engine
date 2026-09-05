from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator
from app.schemas.product import ProductResolutionDecisionResponse

AssetExposure = Literal["internet", "internal", "isolated", "unknown"]
BusinessCriticality = Literal["critical", "high", "medium", "low", "unknown"]
PatchComplexity = Literal["high", "medium", "low", "unknown"]


class AssetComponentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    bom_ref: Optional[str] = None
    name: str
    version: Optional[str] = None
    vendor: Optional[str] = None
    product: Optional[str] = None
    purl: Optional[str] = None
    cpe: Optional[str] = None
    cpe_vendor: Optional[str] = None
    cpe_product: Optional[str] = None
    cpe_version: Optional[str] = None
    latest_resolution: ProductResolutionDecisionResponse | None = None


class AssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    external_id: str
    name: str
    asset_type: str
    source: str
    internet_exposure: AssetExposure
    business_criticality: BusinessCriticality
    patch_complexity: PatchComplexity
    priority_level: Optional[str] = None
    priority_score: Optional[float] = None
    priority_confidence: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    components: list[AssetComponentResponse] = []

    @computed_field
    @property
    def component_count(self) -> int:
        return len(self.components)

    @computed_field
    @property
    def cpe_count(self) -> int:
        return sum(1 for component in self.components if component.cpe)


class PaginatedAssets(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[AssetResponse]


class AssetStats(BaseModel):
    total_assets: int
    scored_assets: int
    unscored_assets: int
    total_components: int
    components_with_cpe: int
    priority_distribution: dict[str, int]
    exposure_distribution: dict[str, int]
    criticality_distribution: dict[str, int]


class CycloneDXImportResponse(BaseModel):
    asset: AssetResponse
    component_count: int


class CycloneDXImportRequest(BaseModel):
    model_config = ConfigDict(extra="allow")


class AssetDetail(AssetResponse):
    raw_payload: Optional[Any] = None


class AssetPriorityThresholds(BaseModel):
    model_config = ConfigDict(extra="forbid")

    A0: float = Field(..., ge=0, le=100)
    A1: float = Field(..., ge=0, le=100)
    A2: float = Field(..., ge=0, le=100)
    A3: float = Field(..., ge=0, le=100)


class AssetScoringWeights(BaseModel):
    model_config = ConfigDict(extra="forbid")

    internet_exposure: float = Field(..., ge=0)
    business_criticality: float = Field(..., ge=0)
    patch_complexity: float = Field(..., ge=0)

    @model_validator(mode="after")
    def require_positive_total(self):
        total = self.internet_exposure + self.business_criticality + self.patch_complexity
        if total <= 0:
            raise ValueError("At least one asset scoring weight must be greater than 0")
        return self


class InternetExposureValues(BaseModel):
    model_config = ConfigDict(extra="forbid")

    internet: float = Field(..., ge=0, le=100)
    internal: float = Field(..., ge=0, le=100)
    isolated: float = Field(..., ge=0, le=100)
    unknown: float = Field(..., ge=0, le=100)


class BusinessCriticalityValues(BaseModel):
    model_config = ConfigDict(extra="forbid")

    critical: float = Field(..., ge=0, le=100)
    high: float = Field(..., ge=0, le=100)
    medium: float = Field(..., ge=0, le=100)
    low: float = Field(..., ge=0, le=100)
    unknown: float = Field(..., ge=0, le=100)


class PatchComplexityValues(BaseModel):
    model_config = ConfigDict(extra="forbid")

    high: float = Field(..., ge=0, le=100)
    medium: float = Field(..., ge=0, le=100)
    low: float = Field(..., ge=0, le=100)
    unknown: float = Field(..., ge=0, le=100)


class AssetScoringValues(BaseModel):
    model_config = ConfigDict(extra="forbid")

    internet_exposure: InternetExposureValues
    business_criticality: BusinessCriticalityValues
    patch_complexity: PatchComplexityValues


class AssetScoringProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    thresholds: AssetPriorityThresholds
    weights: AssetScoringWeights
    values: AssetScoringValues


class AssetScoringRunResponse(BaseModel):
    rows_updated: int
    distribution: dict[str, int]
