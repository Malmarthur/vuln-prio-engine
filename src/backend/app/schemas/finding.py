from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class FindingAssetSummary(BaseModel):
    id: UUID
    name: str
    internet_exposure: str
    business_criticality: str
    patch_complexity: str
    priority_level: Optional[str] = None
    priority_score: Optional[float] = None
    priority_confidence: Optional[float] = None


class FindingComponentSummary(BaseModel):
    id: UUID
    name: str
    version: Optional[str] = None
    vendor: Optional[str] = None
    product: Optional[str] = None
    purl: Optional[str] = None
    cpe: Optional[str] = None
    cpe_vendor: Optional[str] = None
    cpe_product: Optional[str] = None
    cpe_version: Optional[str] = None


class FindingVulnerabilitySummary(BaseModel):
    id: UUID
    cve_id: str
    summary: Optional[str] = None
    cvss_v31_score: Optional[float] = None
    epss_score: Optional[float] = None
    kev_known_exploited: Optional[bool] = None
    vulnerability_priority_level: Optional[str] = None
    vulnerability_priority_score: Optional[float] = None


class FindingResponse(BaseModel):
    id: UUID
    match_type: str
    match_confidence: float
    status: str
    first_seen_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None
    priority_level: Optional[str] = None
    priority_score: Optional[float] = None
    priority_confidence: Optional[float] = None
    asset: FindingAssetSummary
    component: FindingComponentSummary
    vulnerability: FindingVulnerabilitySummary


class PaginatedFindings(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[FindingResponse]


class FindingStats(BaseModel):
    total_findings: int
    scored_findings: int
    unscored_findings: int
    priority_distribution: dict[str, int]
    exposure_distribution: dict[str, int]


class MatchingRunResponse(BaseModel):
    components_processed: int
    candidates: int
    findings_matched: int


class FindingScoringRunResponse(BaseModel):
    rows_updated: int
    distribution: dict[str, int]


class PriorityThresholds(BaseModel):
    model_config = ConfigDict(extra="forbid")

    P0: float = Field(..., ge=0, le=100)
    P1: float = Field(..., ge=0, le=100)
    P2: float = Field(..., ge=0, le=100)
    P3: float = Field(..., ge=0, le=100)


class FindingScoringWeights(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vulnerability_priority: float = Field(..., ge=0)
    asset_priority: float = Field(..., ge=0)

    @model_validator(mode="after")
    def require_positive_total(self):
        total = (
            self.vulnerability_priority
            + self.asset_priority
        )
        if total <= 0:
            raise ValueError("At least one finding scoring weight must be greater than 0")
        return self


class FindingScoringProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    thresholds: PriorityThresholds
    weights: FindingScoringWeights
