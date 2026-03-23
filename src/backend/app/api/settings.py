from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.ingestion.scheduler import ENABLED_SETTING_MAP, SCHEDULE_SETTING_MAP, reschedule_source, toggle_source
from app.services.vulnerability_service import get_all_settings, set_setting

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingUpdate(BaseModel):
    value: Any


def _is_truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).lower() not in ("false", "0", "no")


@router.get("")
async def list_settings(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return await get_all_settings(db)


@router.put("/{key}")
async def update_setting(
    key: str,
    body: SettingUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await set_setting(db, key, body.value)

    # If a schedule interval was changed, reschedule the corresponding job
    if key in SCHEDULE_SETTING_MAP:
        reschedule_source(SCHEDULE_SETTING_MAP[key], int(body.value))

    # If an enabled toggle was changed, pause/resume the corresponding job
    if key in ENABLED_SETTING_MAP:
        toggle_source(ENABLED_SETTING_MAP[key], _is_truthy(body.value))

    return {"key": key, "value": body.value}
