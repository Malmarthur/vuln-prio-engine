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
    internet_exposure: float = Field(..., ge=0)
    business_criticality: float = Field(..., ge=0)
    patch_complexity: float = Field(..., ge=0)

    @model_validator(mode="after")
    def require_positive_total(self):
        total = (
            self.vulnerability_priority
            + self.internet_exposure
            + self.business_criticality
            + self.patch_complexity
        )
        if total <= 0:
            raise ValueError("At least one finding scoring weight must be greater than 0")
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


class FindingScoringValues(BaseModel):
    model_config = ConfigDict(extra="forbid")

    internet_exposure: InternetExposureValues
    business_criticality: BusinessCriticalityValues
    patch_complexity: PatchComplexityValues


class FindingScoringProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    thresholds: PriorityThresholds
    weights: FindingScoringWeights
    values: FindingScoringValues
