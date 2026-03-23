import uuid

from sqlalchemy import Column, Float, Index, Integer, String, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class IngestionLog(Base):
    __tablename__ = "ingestion_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source = Column(String(20), nullable=False)
    started_at = Column(TIMESTAMP(timezone=True))
    finished_at = Column(TIMESTAMP(timezone=True))
    status = Column(String(20))  # "running", "success", "failed"
    records_processed = Column(Integer)
    records_created = Column(Integer)
    records_updated = Column(Integer)
    error_message = Column(Text)
    trigger_type = Column(String(20))  # "scheduled", "manual"
    progress = Column(Float, nullable=True)  # 0.0–100.0, null when not tracked

    __table_args__ = (
        Index("ix_ingestion_logs_source", "source"),
        Index("ix_ingestion_logs_started_at", "started_at"),
    )
