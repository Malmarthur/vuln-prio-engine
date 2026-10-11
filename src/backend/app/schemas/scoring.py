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


class ComparisonFilters(BaseModel):
    """Entity attribute filters: a comparison population or a view slice."""
    q: Optional[str] = Field(None, max_length=200)
    kev: Optional[bool] = None
    min_epss: Optional[float] = Field(None, ge=0, le=1)
    severities: list[str] = Field(default_factory=list, max_length=10)
    criticalities: list[str] = Field(default_factory=list, max_length=10)
    exposures: list[str] = Field(default_factory=list, max_length=10)
    vendor: Optional[str] = Field(None, max_length=200)
    product: Optional[str] = Field(None, max_length=200)
    followed_only: bool = False
    entity_ids: list[UUID] = Field(default_factory=list, max_length=5000)

    def is_empty(self) -> bool:
        return not self.model_dump(exclude_defaults=True)


class ComparisonRequest(BaseModel):
    scope: ScoringScope
    baseline_id: UUID
    candidate_ids: list[UUID] = Field(..., min_length=1)
    subset: Optional[ComparisonFilters] = None


class SubsetPreviewRequest(BaseModel):
    scope: ScoringScope
    subset: ComparisonFilters = Field(default_factory=ComparisonFilters)


class SubsetPreview(BaseModel):
    count: int
    total: int


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


class ActivityJob(JobResponse):
    title: str
    result_summary: Optional[dict[str, Any]] = None


class ActivityIngestion(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    source: str
    status: str
    progress: Optional[float] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    records_processed: Optional[int] = None
    error_message: Optional[str] = None


class ActivityResponse(BaseModel):
    jobs: list[ActivityJob]
    ingestions: list[ActivityIngestion]


class MatchingJobRequest(BaseModel):
    score_after: bool = False


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
    top_n: dict[str, dict[str, int]] = Field(default_factory=dict)
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
    top_n: dict[str, dict[str, int]] = Field(default_factory=dict)


class ChangedScenario(BaseModel):
    id: UUID
    name: str
    reasons: list[str]


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
    data_changed: bool = False
    changed_scenarios: list[ChangedScenario] = Field(default_factory=list)
    subset: Optional[ComparisonFilters] = None
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
    data_changed: bool = False
    changed_scenarios: list[ChangedScenario] = Field(default_factory=list)
    subset: Optional[ComparisonFilters] = None
    created_at: datetime
    finished_at: Optional[datetime] = None
    error: Optional[str] = None


class PaginatedComparisonItems(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[ComparisonItem]


class ComparisonFacetCandidate(BaseModel):
    id: UUID
    total: int
    distribution: dict[str, int]
    transition_matrix: dict[str, dict[str, int]]
    promoted: int
    demoted: int
    unchanged: int
    top_n: dict[str, dict[str, int]] = Field(default_factory=dict)


class ComparisonFacets(BaseModel):
    baseline_total: int
    baseline_distribution: dict[str, int]
    candidates: list[ComparisonFacetCandidate]


FollowedEntityType = Literal["vulnerability", "asset", "finding"]


class FollowedItemsRequest(BaseModel):
    entity_type: FollowedEntityType
    entity_ids: list[UUID] = Field(..., min_length=1, max_length=1000)


class FollowedItem(BaseModel):
    entity_type: FollowedEntityType
    entity_id: UUID
    label: str
    created_at: datetime


class FollowedChange(BaseModel):
    changed: int
    total: int


class FollowedScenarioPosition(BaseModel):
    score: Optional[float] = None
    priority: str = "UNSCORED"
    rank: Optional[int] = None


class ComparisonFollowedRow(BaseModel):
    entity_id: UUID
    label: str
    positions: dict[str, FollowedScenarioPosition]


class ComparisonFollowed(BaseModel):
    followed_total: int
    in_population: int
    population_total: int
    items: list[ComparisonFollowedRow]


class ExplanationSignal(BaseModel):
    group: str
    key: str
    label: str
    value: Any = None


class ExplanationFactor(BaseModel):
    stage: str
    key: str
    label: str
    baseline_weight: Optional[float] = None
    candidate_weight: Optional[float] = None
    baseline_share: Optional[float] = None
    candidate_share: Optional[float] = None
    changed: bool = False


class ComparisonExplanation(BaseModel):
    item: ComparisonItem
    signals: list[ExplanationSignal]
    factors: list[ExplanationFactor]
    thresholds: dict[str, dict[str, dict[str, float]]] = Field(default_factory=dict)
