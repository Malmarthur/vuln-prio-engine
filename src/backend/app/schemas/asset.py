from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field

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
    total_components: int
    components_with_cpe: int
    exposure_distribution: dict[str, int]
    criticality_distribution: dict[str, int]


class CycloneDXImportResponse(BaseModel):
    asset: AssetResponse
    component_count: int


class CycloneDXImportRequest(BaseModel):
    model_config = ConfigDict(extra="allow")


class AssetDetail(AssetResponse):
    raw_payload: Optional[Any] = None
