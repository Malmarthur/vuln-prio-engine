from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class IngestionLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source: str
    trigger_type: Optional[str] = None
    status: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    records_processed: Optional[int] = None
    records_created: Optional[int] = None
    records_updated: Optional[int] = None
    error_message: Optional[str] = None
    progress: Optional[float] = None


class PaginatedIngestionLogs(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[IngestionLogResponse]


class TriggerRequest(BaseModel):
    source: str  # "nvd" | "epss" | "kev" | "euvd" | "all"


class TriggerResponse(BaseModel):
    status: str
    source: str
