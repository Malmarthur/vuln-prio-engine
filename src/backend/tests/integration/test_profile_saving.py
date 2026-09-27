"""Saving the active stage profile only creates revisions for real changes."""
import pytest
from sqlalchemy import func, select

from app.models.scoring import ScoringPreset, ScoringProfile
from app.services.profile_service import ensure_builtin_profiles, get_active_profile, save_active_profile_config

pytestmark = pytest.mark.integration


async def _counts(db_session) -> tuple[int, int]:
    profiles = (await db_session.execute(select(func.count(ScoringProfile.id)))).scalar_one()
    presets = (await db_session.execute(select(func.count(ScoringPreset.id)))).scalar_one()
    return profiles, presets


async def test_unchanged_save_is_a_noop_and_changes_bump_revision(db_session):
    await ensure_builtin_profiles(db_session)
    builtin = await get_active_profile(db_session, "asset")
    before = await _counts(db_session)

    # Unchanged built-in config: no clone of the profile or preset.
    saved = await save_active_profile_config(db_session, "asset", dict(builtin.config))
    assert saved.id == builtin.id
    assert await _counts(db_session) == before

    changed = {**builtin.config, "weights": {**builtin.config["weights"], "internet_exposure": 45, "business_criticality": 35}}
    custom = await save_active_profile_config(db_session, "asset", changed)
    assert custom.id != builtin.id
    assert custom.revision == 1

    # Saving the same custom config again keeps the revision.
    again = await save_active_profile_config(db_session, "asset", changed)
    assert again.id == custom.id
    assert again.revision == 1

    changed_twice = {**changed, "weights": {**changed["weights"], "patch_complexity": 20, "internet_exposure": 50, "business_criticality": 30}}
    bumped = await save_active_profile_config(db_session, "asset", changed_twice)
    assert bumped.id == custom.id
    assert bumped.revision == 2
