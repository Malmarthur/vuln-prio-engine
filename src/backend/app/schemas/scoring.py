from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ColumnConfig(BaseModel):
    enabled: bool = False
    weight: float = Field(0, ge=0)
    type: str  # "numeric" | "boolean" | "categorical"
    label: Optional[str] = None              # user-customizable display name
    range: Optional[list[float]] = None      # numeric only, e.g. [0, 10]
    values: Optional[dict[str, float]] = None    # boolean/categorical value mappings
    default_value: float = Field(100, ge=0, le=100)
    fallbacks: Optional[list[str]] = None        # ordered fallback columns (COALESCE chain)


class ScoringProfile(BaseModel):
    columns: dict[str, ColumnConfig]
    thresholds: dict[str, float]  # {"V0": 76, "V1": 51, "V2": 26, "V3": 0}


class ScoringRunResponse(BaseModel):
    rows_updated: int
    distribution: dict[str, int]


class ScoreDistribution(BaseModel):
    priority_counts: dict[str, int]
    score_histogram: list[dict[str, Any]]
    confidence_histogram: list[dict[str, Any]]
    scored_count: int
    unscored_count: int


ScoringStage = Literal["vulnerability", "asset", "finding"]
ScoringScope = Literal["vulnerability", "asset", "finding", "preset"]


class NamedProfileCreate(BaseModel):
    stage: ScoringStage
    name: str = Field(..., min_length=1, max_length=120)
    description: str = Field("", max_length=500)
    config: dict[str, Any]


class NamedProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=500)
    config: Optional[dict[str, Any]] = None


class NamedProfileResponse(NamedProfileCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    revision: int
    is_builtin: bool
    created_at: datetime
    updated_at: datetime


class ProfileCloneRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=500)


class PresetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: str = Field("", max_length=500)
    vulnerability_profile_id: UUID
    asset_profile_id: UUID
    finding_profile_id: UUID


class PresetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=500)
    vulnerability_profile_id: Optional[UUID] = None
    asset_profile_id: Optional[UUID] = None
    finding_profile_id: Optional[UUID] = None


class PresetResponse(BaseModel):
    id: UUID
    name: str
    description: str
    context_id: UUID
    vulnerability_profile_id: UUID
    asset_profile_id: UUID
    finding_profile_id: UUID
    is_builtin: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ScoringRunRequest(BaseModel):
    scope: ScoringScope = "preset"
    target_id: Optional[UUID] = None


class ComparisonRequest(BaseModel):
    scope: ScoringScope
    baseline_id: UUID
    candidate_ids: list[UUID] = Field(..., min_length=1)


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    kind: str
    scope: str
    status: str
    progress: float
    progress_detail: dict[str, Any] = Field(default_factory=dict)
    request: dict[str, Any]
    error: Optional[str] = None
    cancel_requested: bool
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class RunHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    job_id: Optional[UUID] = None
    scope: str
    target_id: Optional[UUID] = None
    context_id: Optional[UUID] = None
    config_snapshot: Optional[dict[str, Any]] = None
    profile_revisions: Optional[dict[str, int]] = None
    distribution: Optional[dict[str, int]] = None
    dataset_watermark_before: Optional[dict[str, Any]] = None
    dataset_watermark_after: Optional[dict[str, Any]] = None
    rows_scored: int
    status: str
    is_stale: bool
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class ComparisonItem(BaseModel):
    entity_id: UUID
    label: str
    baseline_score: Optional[float] = None
    candidate_score: Optional[float] = None
    score_delta: Optional[float] = None
    baseline_priority: Optional[str] = None
    candidate_priority: Optional[str] = None
    baseline_rank: Optional[int] = None
    candidate_rank: Optional[int] = None
    rank_delta: Optional[int] = None


class ComparisonCandidateResult(BaseModel):
    candidate_id: UUID
    distribution: dict[str, int]
    transition_matrix: dict[str, dict[str, int]]
    promoted: int
    demoted: int
    unchanged: int
    mean_score_delta: float
    median_score_delta: float
    spearman_rank_correlation: Optional[float] = None
    items: list[ComparisonItem]


class ComparisonResult(BaseModel):
    job_id: UUID
    scope: ScoringScope
    baseline_id: UUID
    baseline_distribution: dict[str, int]
    candidates: list[ComparisonCandidateResult]


class ComparisonScenarioSummary(BaseModel):
    id: UUID
    name: str
    description: str = ""
    revision: Optional[int] = None
    profile_revisions: dict[str, int] = Field(default_factory=dict)
    distribution: dict[str, int] = Field(default_factory=dict)


class ComparisonCandidateSummary(ComparisonScenarioSummary):
    transition_matrix: dict[str, dict[str, int]] = Field(default_factory=dict)
    promoted: int = 0
    demoted: int = 0
    unchanged: int = 0
    mean_score_delta: float = 0
    median_score_delta: float = 0
    spearman_rank_correlation: Optional[float] = None


class ComparisonSummary(BaseModel):
    job_id: UUID
    scope: ScoringScope
    status: str
    progress: float
    progress_detail: dict[str, Any] = Field(default_factory=dict)
    baseline: ComparisonScenarioSummary
    candidates: list[ComparisonCandidateSummary]
    dataset_watermark: dict[str, Any] = Field(default_factory=dict)
    is_stale: bool = False
    is_inconsistent: bool = False
    details_available: bool = False
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error: Optional[str] = None


class ComparisonHistoryItem(BaseModel):
    job_id: UUID
    scope: ScoringScope
    baseline_id: UUID
    candidate_ids: list[UUID]
    status: str
    progress: float
    baseline_name: str
    candidate_names: list[str]
    is_stale: bool = False
    is_inconsistent: bool = False
    details_available: bool = False
    created_at: datetime
    finished_at: Optional[datetime] = None
    error: Optional[str] = None


class PaginatedComparisonItems(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[ComparisonItem]
