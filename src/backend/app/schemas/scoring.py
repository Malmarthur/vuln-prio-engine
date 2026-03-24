from typing import Any, Optional

from pydantic import BaseModel, Field


class ColumnConfig(BaseModel):
    enabled: bool = False
    weight: float = Field(0, ge=0)
    type: str  # "numeric" | "boolean" | "categorical"
    range: Optional[list[float]] = None          # numeric only, e.g. [0, 10]
    values: Optional[dict[str, float]] = None    # boolean/categorical value mappings
    default_value: float = Field(100, ge=0, le=100)


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
