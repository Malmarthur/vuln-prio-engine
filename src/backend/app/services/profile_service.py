from __future__ import annotations

import asyncio
import logging
import statistics
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.scoring import ScoringContext, ScoringJob, ScoringPreset, ScoringProfile, ScoringRun
from app.schemas.asset import AssetScoringProfile
from app.schemas.finding import FindingScoringProfile
from app.schemas.scoring import (
    ComparisonCandidateResult,
    ComparisonHistoryItem,
    ComparisonItem,
    ComparisonResult,
    ComparisonSummary,
    NamedProfileCreate,
    NamedProfileUpdate,
    PaginatedComparisonItems,
    PresetCreate,
    PresetUpdate,
    ScoringProfile as VulnerabilityScoringProfile,
)

logger = logging.getLogger(__name__)
_job_lock = asyncio.Lock()
ACTIVE_JOB_STATUSES = ("pending", "running")


class JobCancelled(Exception):
    """Raised by a progress report when the user asked to cancel the job."""


async def ensure_builtin_profiles(session: AsyncSession) -> None:
    if (await session.execute(select(func.count(ScoringPreset.id)))).scalar_one():
        for name in ("Balanced", "Active Exploitation", "Business Impact"):
            await session.execute(update(ScoringProfile).where(
                ScoringProfile.name == name,
                ScoringProfile.is_builtin.is_(True),
                ScoringProfile.description == "",
            ).values(description=f"Built-in {name} scoring profile"))
            await session.execute(update(ScoringPreset).where(
                ScoringPreset.name == name,
                ScoringPreset.is_builtin.is_(True),
                ScoringPreset.description == "",
            ).values(description=f"Built-in {name} scoring scenario"))
        await session.commit()
        return
    from app.services.asset_service import DEFAULT_ASSET_SCORING_PROFILE
    from app.services.finding_service import DEFAULT_FINDING_SCORING_PROFILE
    from app.services.scoring_service import DEFAULT_SCORING_PROFILE

    specs = {
        "Balanced": ((40, 35, 25), (40, 40, 20), (50, 50)),
        "Active Exploitation": ((20, 45, 35), (60, 25, 15), (65, 35)),
        "Business Impact": ((55, 20, 25), (20, 65, 15), (40, 60)),
    }
    for index, (name, weights) in enumerate(specs.items()):
        vuln = _weighted_vulnerability_config(DEFAULT_SCORING_PROFILE, weights[0])
        asset = _weighted_asset_config(DEFAULT_ASSET_SCORING_PROFILE, weights[1])
        finding = _weighted_finding_config(DEFAULT_FINDING_SCORING_PROFILE, weights[2])
        profiles = []
        for stage, config in (("vulnerability", vuln), ("asset", asset), ("finding", finding)):
            profile = ScoringProfile(
                stage=stage,
                name=name,
                description=f"Built-in {name} {stage} profile",
                config=config,
                is_builtin=True,
            )
            session.add(profile)
            profiles.append(profile)
        await session.flush()
        context = ScoringContext(
            vulnerability_profile_id=profiles[0].id,
            asset_profile_id=profiles[1].id,
            finding_profile_id=profiles[2].id,
        )
        session.add(context)
        await session.flush()
        session.add(ScoringPreset(
            name=name,
            description=f"Built-in {name} scoring scenario",
            context_id=context.id,
            is_builtin=True,
            is_active=index == 0,
        ))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()


def _weighted_vulnerability_config(base: dict[str, Any], weights: tuple[int, int, int]) -> dict[str, Any]:
    config = {"thresholds": dict(base["thresholds"]), "columns": {k: dict(v) for k, v in base["columns"].items()}}
    for key, weight in zip(("cvss_v40_score", "epss_score", "kev_known_exploited"), weights):
        config["columns"][key]["weight"] = weight
    return config


def _weighted_asset_config(base: dict[str, Any], weights: tuple[int, int, int]) -> dict[str, Any]:
    return {
        "thresholds": dict(base["thresholds"]),
        "weights": dict(zip(("internet_exposure", "business_criticality", "patch_complexity"), weights)),
        "values": {key: dict(value) for key, value in base["values"].items()},
    }


def _weighted_finding_config(base: dict[str, Any], weights: tuple[int, int]) -> dict[str, Any]:
    return {
        "thresholds": dict(base["thresholds"]),
        "weights": dict(zip(("vulnerability_priority", "asset_priority"), weights)),
    }


def validate_stage_config(stage: str, config: dict[str, Any]) -> dict[str, Any]:
    if stage == "vulnerability":
        parsed = VulnerabilityScoringProfile.model_validate(config)
        from app.services.scoring_service import _validate_profile
        _validate_profile(parsed)
    elif stage == "asset":
        parsed = AssetScoringProfile.model_validate(config)
    elif stage == "finding":
        parsed = FindingScoringProfile.model_validate(config)
    else:
        raise ValueError(f"Unknown scoring stage '{stage}'")
    return parsed.model_dump()


async def list_profiles(session: AsyncSession, stage: str | None = None) -> list[ScoringProfile]:
    await ensure_builtin_profiles(session)
    stmt = select(ScoringProfile).order_by(ScoringProfile.stage, ScoringProfile.is_builtin.desc(), ScoringProfile.name)
    if stage:
        stmt = stmt.where(ScoringProfile.stage == stage)
    return list((await session.execute(stmt)).scalars())


async def create_profile(session: AsyncSession, payload: NamedProfileCreate) -> ScoringProfile:
    profile = ScoringProfile(
        stage=payload.stage,
        name=payload.name.strip(),
        description=payload.description,
        config=validate_stage_config(payload.stage, payload.config),
    )
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return profile


async def update_profile(session: AsyncSession, profile_id: UUID, payload: NamedProfileUpdate) -> ScoringProfile:
    profile = await session.get(ScoringProfile, profile_id)
    if profile is None:
        raise LookupError("Scoring profile not found")
    if profile.is_builtin:
        clone = ScoringProfile(
            stage=profile.stage,
            name=payload.name or f"{profile.name} copy",
            description=payload.description if payload.description is not None else profile.description,
            config=validate_stage_config(profile.stage, payload.config or profile.config),
        )
        session.add(clone)
        await session.commit()
        await session.refresh(clone)
        return clone
    if payload.name is not None:
        profile.name = payload.name.strip()
    if payload.description is not None:
        profile.description = payload.description
    if payload.config is not None:
        profile.config = validate_stage_config(profile.stage, payload.config)
        profile.revision += 1
        await _mark_profile_runs_stale(session, profile.id)
    await session.commit()
    await session.refresh(profile)
    return profile


async def clone_profile(session: AsyncSession, profile_id: UUID, name: str, description: str | None) -> ScoringProfile:
    source = await session.get(ScoringProfile, profile_id)
    if source is None:
        raise LookupError("Scoring profile not found")
    return await create_profile(session, NamedProfileCreate(
        stage=source.stage, name=name, description=description or source.description, config=source.config,
    ))


async def delete_profile(session: AsyncSession, profile_id: UUID) -> None:
    profile = await session.get(ScoringProfile, profile_id)
    if profile is None:
        raise LookupError("Scoring profile not found")
    if profile.is_builtin:
        raise ValueError("Built-in profiles cannot be deleted")
    await session.delete(profile)
    await session.commit()


async def _context(session: AsyncSession, vuln_id: UUID, asset_id: UUID, finding_id: UUID) -> ScoringContext:
    profiles = [await session.get(ScoringProfile, value) for value in (vuln_id, asset_id, finding_id)]
    if any(profile is None for profile in profiles):
        raise LookupError("One or more scoring profiles were not found")
    if [profile.stage for profile in profiles] != ["vulnerability", "asset", "finding"]:
        raise ValueError("Preset profile stages do not match their slots")
    existing = (await session.execute(select(ScoringContext).where(
        ScoringContext.vulnerability_profile_id == vuln_id,
        ScoringContext.asset_profile_id == asset_id,
        ScoringContext.finding_profile_id == finding_id,
    ))).scalar_one_or_none()
    if existing:
        return existing
    value = ScoringContext(vulnerability_profile_id=vuln_id, asset_profile_id=asset_id, finding_profile_id=finding_id)
    session.add(value)
    await session.flush()
    return value


async def list_presets(session: AsyncSession) -> list[ScoringPreset]:
    await ensure_builtin_profiles(session)
    return list((await session.execute(select(ScoringPreset).order_by(ScoringPreset.is_active.desc(), ScoringPreset.is_builtin.desc(), ScoringPreset.name))).scalars())


async def create_preset(session: AsyncSession, payload: PresetCreate) -> ScoringPreset:
    context = await _context(session, payload.vulnerability_profile_id, payload.asset_profile_id, payload.finding_profile_id)
    preset = ScoringPreset(name=payload.name.strip(), description=payload.description, context_id=context.id)
    session.add(preset)
    await session.commit()
    await session.refresh(preset)
    return preset


async def update_preset(session: AsyncSession, preset_id: UUID, payload: PresetUpdate) -> ScoringPreset:
    preset = await session.get(ScoringPreset, preset_id)
    if preset is None:
        raise LookupError("Scoring preset not found")
    current = await session.get(ScoringContext, preset.context_id)
    values = (
        payload.vulnerability_profile_id or current.vulnerability_profile_id,
        payload.asset_profile_id or current.asset_profile_id,
        payload.finding_profile_id or current.finding_profile_id,
    )
    if preset.is_builtin:
        clone = ScoringPreset(
            name=payload.name or f"{preset.name} copy",
            description=payload.description if payload.description is not None else preset.description,
            context_id=(await _context(session, *values)).id,
        )
        session.add(clone)
        await session.commit()
        await session.refresh(clone)
        return clone
    if payload.name is not None:
        preset.name = payload.name.strip()
    if payload.description is not None:
        preset.description = payload.description
    preset.context_id = (await _context(session, *values)).id
    await session.commit()
    await session.refresh(preset)
    return preset


async def activate_preset(session: AsyncSession, preset_id: UUID) -> ScoringPreset:
    preset = await session.get(ScoringPreset, preset_id)
    if preset is None:
        raise LookupError("Scoring preset not found")
    await session.execute(update(ScoringPreset).values(is_active=False))
    preset.is_active = True
    await session.commit()
    await session.refresh(preset)
    return preset


async def delete_preset(session: AsyncSession, preset_id: UUID) -> None:
    preset = await session.get(ScoringPreset, preset_id)
    if preset is None:
        raise LookupError("Scoring preset not found")
    if preset.is_builtin or preset.is_active:
        raise ValueError("Built-in or active presets cannot be deleted")
    await session.delete(preset)
    await session.commit()


async def get_active_preset(session: AsyncSession) -> tuple[ScoringPreset, ScoringContext]:
    await ensure_builtin_profiles(session)
    preset = (await session.execute(select(ScoringPreset).where(ScoringPreset.is_active.is_(True)))).scalar_one()
    return preset, await session.get(ScoringContext, preset.context_id)


async def resolve_context(session: AsyncSession, preset_id: UUID | None = None) -> ScoringContext:
    if preset_id is None:
        return (await get_active_preset(session))[1]
    preset = await session.get(ScoringPreset, preset_id)
    if preset is None:
        raise LookupError("Scoring preset not found")
    return await session.get(ScoringContext, preset.context_id)


async def get_active_profile(session: AsyncSession, stage: str) -> ScoringProfile:
    _, context = await get_active_preset(session)
    return await _require_profile(session, getattr(context, f"{stage}_profile_id"), stage)


async def save_active_profile_config(session: AsyncSession, stage: str, config: dict[str, Any]) -> ScoringProfile:
    preset, context = await get_active_preset(session)
    current = await get_active_profile(session, stage)
    validated = validate_stage_config(stage, config)
    # Saving an unchanged configuration is a no-op: no new revision, no stale
    # runs, and no editable clone of a built-in profile or preset.
    if validated == validate_stage_config(stage, current.config):
        return current
    if current.is_builtin:
        suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
        current = ScoringProfile(
            stage=stage, name=f"{current.name} custom {suffix}",
            description=f"Editable clone of {current.name}", config=validated,
        )
        session.add(current)
        await session.flush()
    else:
        current.config = validated
        current.revision += 1
        await _mark_profile_runs_stale(session, current.id)
    ids = {
        "vulnerability": context.vulnerability_profile_id,
        "asset": context.asset_profile_id,
        "finding": context.finding_profile_id,
    }
    ids[stage] = current.id
    new_context = await _context(session, ids["vulnerability"], ids["asset"], ids["finding"])
    if preset.is_builtin:
        suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
        await session.execute(update(ScoringPreset).values(is_active=False))
        preset = ScoringPreset(
            name=f"{preset.name} custom {suffix}", description=f"Editable clone of {preset.name}",
            context_id=new_context.id, is_active=True,
        )
        session.add(preset)
    else:
        preset.context_id = new_context.id
    await session.commit()
    await session.refresh(current)
    return current


async def reset_active_stage(session: AsyncSession, stage: str) -> ScoringProfile:
    balanced = (await session.execute(select(ScoringPreset).where(ScoringPreset.name == "Balanced"))).scalar_one()
    balanced_context = await session.get(ScoringContext, balanced.context_id)
    balanced_profile = await _require_profile(session, getattr(balanced_context, f"{stage}_profile_id"), stage)
    preset, context = await get_active_preset(session)
    ids = {
        "vulnerability": context.vulnerability_profile_id,
        "asset": context.asset_profile_id,
        "finding": context.finding_profile_id,
    }
    ids[stage] = balanced_profile.id
    if preset.is_builtin:
        if preset.name == "Balanced":
            return balanced_profile
        suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
        await session.execute(update(ScoringPreset).values(is_active=False))
        session.add(ScoringPreset(
            name=f"{preset.name} custom {suffix}", description=f"Editable clone of {preset.name}",
            context_id=(await _context(session, ids["vulnerability"], ids["asset"], ids["finding"])).id,
            is_active=True,
        ))
    else:
        preset.context_id = (await _context(session, ids["vulnerability"], ids["asset"], ids["finding"])).id
    await session.commit()
    return balanced_profile


def preset_payload(preset: ScoringPreset, context: ScoringContext) -> dict[str, Any]:
    return {
        "id": preset.id, "name": preset.name, "description": preset.description,
        "context_id": context.id,
        "vulnerability_profile_id": context.vulnerability_profile_id,
        "asset_profile_id": context.asset_profile_id,
        "finding_profile_id": context.finding_profile_id,
        "is_builtin": preset.is_builtin, "is_active": preset.is_active,
        "created_at": preset.created_at, "updated_at": preset.updated_at,
    }


async def enqueue_job(session: AsyncSession, kind: str, scope: str, request: dict[str, Any]) -> ScoringJob:
    target_count = len(request.get("target_ids", []))
    job = ScoringJob(
        kind=kind,
        scope=scope,
        status="pending",
        progress=0,
        progress_detail={"phase": "queued", "completed_targets": 0, "total_targets": target_count},
        request=request,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    asyncio.create_task(_execute_job(job.id))
    return job


async def enqueue_matching_job(session: AsyncSession, score_after: bool) -> ScoringJob:
    """Queue asset ↔ vulnerability matching, optionally followed by scoring of the active preset."""
    active = (
        await session.execute(
            select(ScoringJob.id).where(ScoringJob.kind == "matching", ScoringJob.status.in_(ACTIVE_JOB_STATUSES))
        )
    ).first()
    if active is not None:
        raise JobConflict("A matching job is already queued or running")
    return await enqueue_job(session, "matching", "finding", {"score_after": score_after})


class JobConflict(Exception):
    """Raised when an equivalent job is already queued or running."""


async def cancel_job(session: AsyncSession, job_id: UUID) -> ScoringJob:
    job = await session.get(ScoringJob, job_id)
    if job is None:
        raise LookupError("Scoring job not found")
    job.cancel_requested = True
    if job.status == "pending":
        job.status = "cancelled"
        job.finished_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(job)
    return job


async def _execute_job(job_id: UUID) -> None:
    async with _job_lock:
        async with AsyncSessionLocal() as session:
            job = await session.get(ScoringJob, job_id)
            if job is None or job.status == "cancelled":
                return
            await run_job(session, job)


async def _report_progress(session: AsyncSession, job: ScoringJob, progress: float, detail: dict[str, Any]) -> None:
    """Persist progress, then honour a pending cancellation request."""
    job.progress = round(max(0.0, min(progress, 100.0)), 2)
    job.progress_detail = detail
    await session.commit()
    cancel_requested = (
        await session.execute(select(ScoringJob.cancel_requested).where(ScoringJob.id == job.id))
    ).scalar_one()
    if cancel_requested:
        raise JobCancelled()


async def run_job(session: AsyncSession, job: ScoringJob) -> None:
    """Execute a queued job in the given session and record its outcome."""
    job_id = job.id
    job.status, job.started_at = "running", datetime.now(timezone.utc)
    job.progress_detail = {
        "phase": "preparing",
        "label": "Preparing",
        "completed_targets": 0,
        "total_targets": len(job.request.get("target_ids", [])),
    }
    await session.commit()
    try:
        if job.kind == "matching":
            await _run_matching_job(session, job)
        else:
            await _run_scoring_job(session, job)
        job.status = "completed"
        job.progress = 100
        job.finished_at = datetime.now(timezone.utc)
        await session.commit()
    except JobCancelled:
        await session.rollback()
        job = await session.get(ScoringJob, job_id)
        job.status = "cancelled"
        job.progress_detail = {**(job.progress_detail or {}), "phase": "cancelled", "label": "Cancelled"}
        job.finished_at = datetime.now(timezone.utc)
        await session.commit()
    except Exception as exc:
        logger.exception("Scoring job %s failed", job_id)
        await session.rollback()
        job = await session.get(ScoringJob, job_id)
        job.status, job.error = "failed", str(exc)
        job.progress_detail = {**(job.progress_detail or {}), "phase": "failed"}
        job.finished_at = datetime.now(timezone.utc)
        await session.commit()


async def _run_matching_job(session: AsyncSession, job: ScoringJob) -> None:
    from app.services.finding_service import run_matching

    score_after = bool(job.request.get("score_after"))
    matching_share = 60.0 if score_after else 100.0

    async def matching_progress(pct: float, detail: dict[str, Any]) -> None:
        await _report_progress(session, job, pct * matching_share / 100, {**detail, "stage": "matching"})

    result = await run_matching(session, matching_progress)
    summary: dict[str, Any] = {**result}
    if score_after:
        preset, _ = await get_active_preset(session)

        async def scoring_progress(pct: float, detail: dict[str, Any]) -> None:
            await _report_progress(session, job, matching_share + pct * (100 - matching_share) / 100, {**detail, "stage": "scoring"})

        run = await run_target(session, "preset", preset.id, job.id, on_progress=scoring_progress)
        summary["rows_scored"] = run.rows_scored
    job.result_summary = summary
    job.progress_detail = {"phase": "completed", "label": "Completed"}


async def _run_scoring_job(session: AsyncSession, job: ScoringJob) -> None:
    targets = [UUID(value) for value in job.request.get("target_ids", [])]
    total = max(len(targets), 1)
    cache: dict[str, set[UUID]] = {"vulnerability": set(), "asset": set(), "finding": set()}
    rows_scored = 0
    for index, target in enumerate(targets):
        target_name = await _target_name(session, job.scope, target)
        base = {"target_id": str(target), "target_name": target_name, "total_targets": total}

        async def target_progress(pct: float, detail: dict[str, Any], index: int = index, base: dict[str, Any] = base) -> None:
            await _report_progress(session, job, (index + pct / 100) / total * 100, {**base, **detail, "completed_targets": index})

        await target_progress(0, {"phase": "scoring", "label": f"Scoring {target_name}"})
        run = await run_target(session, job.scope, target, job.id, cache, on_progress=target_progress)
        rows_scored += run.rows_scored or 0
        await _report_progress(session, job, (index + 1) / total * 100, {**base, "phase": "scoring", "label": f"Scored {target_name}", "completed_targets": index + 1})
    if job.kind == "comparison":
        job.progress_detail = {"phase": "finalizing", "label": "Building the comparison", "completed_targets": total, "total_targets": total}
        await session.commit()
        job.result_summary = await _build_comparison_summary(session, job)
    else:
        job.result_summary = {"rows_scored": rows_scored}
    job.progress_detail = {"phase": "completed", "label": "Completed", "completed_targets": total, "total_targets": total}


async def run_target(
    session: AsyncSession,
    scope: str,
    target_id: UUID,
    job_id: UUID | None = None,
    cache: dict[str, set[UUID]] | None = None,
    on_progress: Any = None,
) -> ScoringRun:
    from app.services.asset_service import compute_asset_scores
    from app.services.finding_service import compute_finding_scores
    from app.services.scoring_service import compute_scores

    before = await dataset_watermark(session)
    cache = cache or {"vulnerability": set(), "asset": set(), "finding": set()}
    context = None
    if scope == "preset":
        preset = await session.get(ScoringPreset, target_id)
        if preset is None:
            raise LookupError("Scoring preset not found")
        context = await session.get(ScoringContext, preset.context_id)
    elif scope == "finding":
        _, active = await get_active_preset(session)
        context = await _context(session, active.vulnerability_profile_id, active.asset_profile_id, target_id)

    if scope == "vulnerability":
        profile = await _require_profile(session, target_id, "vulnerability")
        rows, distribution = await compute_scores(session, VulnerabilityScoringProfile.model_validate(profile.config), profile.id, profile.revision)
        cache["vulnerability"].add(profile.id)
        revisions, snapshot, context_id = {str(profile.id): profile.revision}, profile.config, None
    elif scope == "asset":
        profile = await _require_profile(session, target_id, "asset")
        rows, distribution = await compute_asset_scores(session, AssetScoringProfile.model_validate(profile.config), profile.id, profile.revision)
        cache["asset"].add(profile.id)
        revisions, snapshot, context_id = {str(profile.id): profile.revision}, profile.config, None
    else:
        assert context is not None
        vp = await _require_profile(session, context.vulnerability_profile_id, "vulnerability")
        ap = await _require_profile(session, context.asset_profile_id, "asset")
        fp = await _require_profile(session, context.finding_profile_id, "finding")
        if on_progress:
            await on_progress(0, {"phase": "scoring", "label": "Scoring vulnerabilities"})
        if vp.id not in cache["vulnerability"]:
            await compute_scores(session, VulnerabilityScoringProfile.model_validate(vp.config), vp.id, vp.revision)
            cache["vulnerability"].add(vp.id)
        if on_progress:
            await on_progress(40, {"phase": "scoring", "label": "Scoring assets"})
        if ap.id not in cache["asset"]:
            await compute_asset_scores(session, AssetScoringProfile.model_validate(ap.config), ap.id, ap.revision)
            cache["asset"].add(ap.id)
        if on_progress:
            await on_progress(50, {"phase": "scoring", "label": "Scoring findings"})
        if context.id not in cache["finding"]:
            rows, distribution = await compute_finding_scores(
                session, FindingScoringProfile.model_validate(fp.config), context.id,
                vp.id, ap.id, {str(vp.id): vp.revision, str(ap.id): ap.revision, str(fp.id): fp.revision},
            )
            cache["finding"].add(context.id)
        else:
            existing = list((await session.execute(
                text("SELECT s.finding_id, '' AS label, s.priority_score::float8, s.priority_confidence::float8, s.priority_level FROM finding_scores s WHERE s.scoring_context_id=:id"),
                {"id": context.id},
            )).tuples())
            rows, distribution = len(existing), _distribution(existing)
        revisions = {str(vp.id): vp.revision, str(ap.id): ap.revision, str(fp.id): fp.revision}
        snapshot = {"vulnerability": vp.config, "asset": ap.config, "finding": fp.config}
        context_id = context.id
    after = await dataset_watermark(session)
    run = ScoringRun(
        job_id=job_id, scope=scope, target_id=target_id, context_id=context_id,
        config_snapshot=snapshot, profile_revisions=revisions, distribution=distribution,
        dataset_watermark_before=before, dataset_watermark_after=after, rows_scored=rows,
        status="inconsistent" if before != after else "completed", is_stale=False,
        started_at=datetime.now(timezone.utc), finished_at=datetime.now(timezone.utc),
    )
    session.add(run)
    await session.flush()
    if scope == "vulnerability":
        await session.execute(text("UPDATE vulnerability_scores SET scoring_run_id=:run_id WHERE vulnerability_profile_id=:target_id"), {"run_id": run.id, "target_id": target_id})
    elif scope == "asset":
        await session.execute(text("UPDATE asset_scores SET scoring_run_id=:run_id WHERE asset_profile_id=:target_id"), {"run_id": run.id, "target_id": target_id})
    else:
        await session.execute(text("UPDATE finding_scores SET scoring_run_id=:run_id WHERE scoring_context_id=:context_id"), {"run_id": run.id, "context_id": context_id})
    await session.commit()
    return run


async def dataset_watermark(session: AsyncSession) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for table in ("vulnerabilities", "assets", "findings"):
        row = (await session.execute(text(f"SELECT COUNT(*), MAX(updated_at) FROM {table}" if table != "findings" else "SELECT COUNT(*), MAX(last_seen_at) FROM findings"))).one()
        result[table] = {"count": row[0], "updated_at": row[1].isoformat() if row[1] else None}
    return result


async def _require_profile(session: AsyncSession, profile_id: UUID, stage: str) -> ScoringProfile:
    profile = await session.get(ScoringProfile, profile_id)
    if profile is None or profile.stage != stage:
        raise LookupError(f"{stage.capitalize()} scoring profile not found")
    return profile


async def _mark_profile_runs_stale(session: AsyncSession, profile_id: UUID) -> None:
    await session.execute(text("UPDATE scoring_runs SET is_stale = true WHERE profile_revisions ? :profile_id"), {"profile_id": str(profile_id)})


async def recover_interrupted_jobs(session: AsyncSession) -> int:
    result = await session.execute(update(ScoringJob).where(ScoringJob.status.in_(["pending", "running"])).values(
        status="failed", error="Application restarted before the job completed", finished_at=datetime.now(timezone.utc),
    ))
    await session.commit()
    return result.rowcount


async def list_runs(
    session: AsyncSession,
    scope: str | None = None,
    target_id: UUID | None = None,
) -> list[ScoringRun]:
    current = await dataset_watermark(session)
    await session.execute(update(ScoringRun).where(
        ScoringRun.dataset_watermark_after.is_not(None),
        ScoringRun.dataset_watermark_after != current,
    ).values(is_stale=True))
    stmt = select(ScoringRun).order_by(ScoringRun.finished_at.desc().nulls_last()).limit(200)
    if scope:
        stmt = stmt.where(ScoringRun.scope == scope)
    if target_id:
        stmt = stmt.where(ScoringRun.target_id == target_id)
    values = list((await session.execute(stmt)).scalars())
    await session.commit()
    return values


async def _target_name(session: AsyncSession, scope: str, target_id: UUID) -> str:
    if scope == "preset":
        target = await session.get(ScoringPreset, target_id)
    else:
        target = await session.get(ScoringProfile, target_id)
    return target.name if target is not None else str(target_id)


async def _scenario_snapshot(
    session: AsyncSession,
    scope: str,
    target_id: UUID,
    distribution: dict[str, int],
    runs: dict[UUID, ScoringRun],
) -> dict[str, Any]:
    if scope == "preset":
        target = await session.get(ScoringPreset, target_id)
        revision = None
    else:
        target = await session.get(ScoringProfile, target_id)
        revision = target.revision if target else None
    run = runs.get(target_id)
    return {
        "id": str(target_id),
        "name": target.name if target else str(target_id),
        "description": target.description if target else "",
        "revision": revision,
        "profile_revisions": run.profile_revisions if run and run.profile_revisions else {},
        "distribution": distribution,
    }


async def _build_comparison_summary(session: AsyncSession, job: ScoringJob) -> dict[str, Any]:
    baseline_id = UUID(job.request["baseline_id"])
    candidate_ids = [UUID(value) for value in job.request["candidate_ids"]]
    run_values = list((await session.execute(
        select(ScoringRun).where(ScoringRun.job_id == job.id)
    )).scalars())
    runs = {run.target_id: run for run in run_values if run.target_id is not None}
    baseline_rows = await _score_rows(session, job.scope, baseline_id)
    baseline = await _scenario_snapshot(
        session, job.scope, baseline_id, _distribution(baseline_rows), runs
    )
    candidates: list[dict[str, Any]] = []
    for candidate_id in candidate_ids:
        candidate_rows = await _score_rows(session, job.scope, candidate_id)
        compared = _compare(candidate_id, baseline_rows, candidate_rows)
        snapshot = await _scenario_snapshot(
            session, job.scope, candidate_id, compared.distribution, runs
        )
        snapshot.update({
            "transition_matrix": compared.transition_matrix,
            "promoted": compared.promoted,
            "demoted": compared.demoted,
            "unchanged": compared.unchanged,
            "mean_score_delta": compared.mean_score_delta,
            "median_score_delta": compared.median_score_delta,
            "spearman_rank_correlation": compared.spearman_rank_correlation,
        })
        candidates.append(snapshot)
    watermark = next(
        (run.dataset_watermark_after for run in reversed(run_values) if run.dataset_watermark_after),
        {},
    )
    return {"baseline": baseline, "candidates": candidates, "dataset_watermark": watermark}


async def _run_details_available(session: AsyncSession, run: ScoringRun) -> bool:
    if run.rows_scored == 0:
        return True
    if run.scope == "vulnerability":
        query = "SELECT COUNT(*) FROM vulnerability_scores WHERE vulnerability_profile_id=:target_id AND scoring_run_id=:run_id"
        target_id = run.target_id
    elif run.scope == "asset":
        query = "SELECT COUNT(*) FROM asset_scores WHERE asset_profile_id=:target_id AND scoring_run_id=:run_id"
        target_id = run.target_id
    else:
        query = "SELECT COUNT(*) FROM finding_scores WHERE scoring_context_id=:target_id AND scoring_run_id=:run_id"
        target_id = run.context_id
    count = (await session.execute(text(query), {"target_id": target_id, "run_id": run.id})).scalar_one()
    return count >= run.rows_scored


async def _comparison_state(session: AsyncSession, job: ScoringJob) -> tuple[bool, bool, bool]:
    runs = list((await session.execute(
        select(ScoringRun).where(ScoringRun.job_id == job.id)
    )).scalars())
    if not runs:
        return False, False, False
    current = await dataset_watermark(session)
    is_stale = any(run.is_stale or (run.dataset_watermark_after and run.dataset_watermark_after != current) for run in runs)
    is_inconsistent = any(run.status == "inconsistent" for run in runs)
    details_available = job.status == "completed" and all([
        await _run_details_available(session, run) for run in runs
    ])
    return is_stale, is_inconsistent, details_available


async def get_comparison_summary(session: AsyncSession, job_id: UUID) -> ComparisonSummary:
    job = await session.get(ScoringJob, job_id)
    if job is None or job.kind != "comparison":
        raise LookupError("Comparison job not found")
    if job.status != "completed":
        raise ValueError("Comparison summary is not available")
    if not job.result_summary:
        job.result_summary = await _build_comparison_summary(session, job)
        await session.commit()
    is_stale, is_inconsistent, details_available = await _comparison_state(session, job)
    return ComparisonSummary(
        job_id=job.id,
        scope=job.scope,
        status=job.status,
        progress=float(job.progress),
        progress_detail=job.progress_detail or {},
        baseline=job.result_summary["baseline"],
        candidates=job.result_summary["candidates"],
        dataset_watermark=job.result_summary.get("dataset_watermark", {}),
        is_stale=is_stale,
        is_inconsistent=is_inconsistent,
        details_available=details_available,
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
        error=job.error,
    )


async def list_comparisons(
    session: AsyncSession,
    scope: str | None = None,
    limit: int = 20,
) -> list[ComparisonHistoryItem]:
    stmt = select(ScoringJob).where(ScoringJob.kind == "comparison").order_by(
        ScoringJob.created_at.desc()
    ).limit(min(max(limit, 1), 100))
    if scope:
        stmt = stmt.where(ScoringJob.scope == scope)
    jobs = list((await session.execute(stmt)).scalars())
    values: list[ComparisonHistoryItem] = []
    for job in jobs:
        summary = job.result_summary or {}
        baseline = summary.get("baseline") or {}
        candidates = summary.get("candidates") or []
        if not baseline:
            baseline_id = UUID(job.request["baseline_id"])
            baseline = {"name": await _target_name(session, job.scope, baseline_id)}
            candidates = [
                {"name": await _target_name(session, job.scope, UUID(value))}
                for value in job.request.get("candidate_ids", [])
            ]
        is_stale, is_inconsistent, details_available = await _comparison_state(session, job)
        values.append(ComparisonHistoryItem(
            job_id=job.id,
            scope=job.scope,
            baseline_id=UUID(job.request["baseline_id"]),
            candidate_ids=[UUID(value) for value in job.request.get("candidate_ids", [])],
            status=job.status,
            progress=float(job.progress),
            baseline_name=baseline.get("name", "Unknown baseline"),
            candidate_names=[item.get("name", "Unknown candidate") for item in candidates],
            is_stale=is_stale,
            is_inconsistent=is_inconsistent,
            details_available=details_available,
            created_at=job.created_at,
            finished_at=job.finished_at,
            error=job.error,
        ))
    return values


async def _resolved_score_target(session: AsyncSession, scope: str, target_id: UUID) -> UUID:
    if scope == "preset":
        preset = await session.get(ScoringPreset, target_id)
        if preset is None:
            raise LookupError("Scoring preset not found")
        return preset.context_id
    if scope == "finding":
        _, active = await get_active_preset(session)
        return (await _context(
            session,
            active.vulnerability_profile_id,
            active.asset_profile_id,
            target_id,
        )).id
    return target_id


def _ranked_score_source(scope: str, parameter: str) -> str:
    if scope == "vulnerability":
        return f"""
            SELECT s.vulnerability_id AS entity_id, v.cve_id AS label,
                   s.priority_score::float8 AS score, s.priority_confidence::float8 AS confidence,
                   COALESCE(s.priority_level, 'UNSCORED') AS priority
            FROM vulnerability_scores s
            JOIN vulnerabilities v ON v.id = s.vulnerability_id
            WHERE s.vulnerability_profile_id = :{parameter}
        """
    if scope == "asset":
        return f"""
            SELECT s.asset_id AS entity_id, a.name AS label,
                   s.priority_score::float8 AS score, s.priority_confidence::float8 AS confidence,
                   COALESCE(s.priority_level, 'UNSCORED') AS priority
            FROM asset_scores s
            JOIN assets a ON a.id = s.asset_id
            WHERE s.asset_profile_id = :{parameter}
        """
    return f"""
        SELECT s.finding_id AS entity_id, v.cve_id || ' @ ' || a.name AS label,
               s.priority_score::float8 AS score, s.priority_confidence::float8 AS confidence,
               COALESCE(s.priority_level, 'UNSCORED') AS priority
        FROM finding_scores s
        JOIN findings f ON f.id = s.finding_id
        JOIN vulnerabilities v ON v.id = f.vulnerability_id
        JOIN assets a ON a.id = f.asset_id
        WHERE s.scoring_context_id = :{parameter}
    """


async def comparison_items(
    session: AsyncSession,
    job_id: UUID,
    candidate_id: UUID,
    page: int = 1,
    per_page: int = 50,
    query: str | None = None,
    movement: str | None = None,
    from_priority: str | None = None,
    to_priority: str | None = None,
    sort: str = "abs_rank_delta",
    order: str = "desc",
) -> PaginatedComparisonItems:
    job = await session.get(ScoringJob, job_id)
    if job is None or job.kind != "comparison":
        raise LookupError("Comparison job not found")
    if job.status != "completed":
        raise ValueError("Comparison is not complete")
    candidates = {UUID(value) for value in job.request.get("candidate_ids", [])}
    if candidate_id not in candidates:
        raise LookupError("Comparison candidate not found")
    _, _, details_available = await _comparison_state(session, job)
    if not details_available:
        raise RuntimeError("Comparison details have expired")

    baseline_id = await _resolved_score_target(session, job.scope, UUID(job.request["baseline_id"]))
    resolved_candidate_id = await _resolved_score_target(session, job.scope, candidate_id)
    baseline_source = _ranked_score_source(job.scope, "baseline_id")
    candidate_source = _ranked_score_source(job.scope, "candidate_id")
    compared_cte = f"""
        WITH baseline_source AS ({baseline_source}),
        candidate_source AS ({candidate_source}),
        baseline AS (
            SELECT *, ROW_NUMBER() OVER (
                ORDER BY score DESC NULLS LAST, confidence DESC NULLS LAST, entity_id::text
            )::int AS rank
            FROM baseline_source
        ),
        candidate AS (
            SELECT *, ROW_NUMBER() OVER (
                ORDER BY score DESC NULLS LAST, confidence DESC NULLS LAST, entity_id::text
            )::int AS rank
            FROM candidate_source
        ),
        compared AS (
            SELECT COALESCE(b.entity_id, c.entity_id) AS entity_id,
                   COALESCE(b.label, c.label) AS label,
                   b.score AS baseline_score,
                   c.score AS candidate_score,
                   CASE WHEN b.score IS NOT NULL AND c.score IS NOT NULL THEN c.score - b.score END AS score_delta,
                   COALESCE(b.priority, 'UNSCORED') AS baseline_priority,
                   COALESCE(c.priority, 'UNSCORED') AS candidate_priority,
                   b.rank AS baseline_rank,
                   c.rank AS candidate_rank,
                   CASE WHEN b.rank IS NOT NULL AND c.rank IS NOT NULL THEN b.rank - c.rank END AS rank_delta
            FROM baseline b
            FULL OUTER JOIN candidate c ON c.entity_id = b.entity_id
        )
    """
    conditions = ["TRUE"]
    params: dict[str, Any] = {
        "baseline_id": baseline_id,
        "candidate_id": resolved_candidate_id,
        "limit": min(max(per_page, 1), 100),
        "offset": (max(page, 1) - 1) * min(max(per_page, 1), 100),
    }
    if query:
        conditions.append("label ILIKE :query")
        params["query"] = f"%{query.strip()}%"
    if movement == "promoted":
        conditions.append("rank_delta > 0")
    elif movement == "demoted":
        conditions.append("rank_delta < 0")
    elif movement == "unchanged":
        conditions.append("(rank_delta = 0 OR rank_delta IS NULL)")
    if from_priority:
        conditions.append("baseline_priority = :from_priority")
        params["from_priority"] = from_priority
    if to_priority:
        conditions.append("candidate_priority = :to_priority")
        params["to_priority"] = to_priority
    where = " AND ".join(conditions)
    sort_columns = {
        "abs_rank_delta": "ABS(rank_delta)",
        "rank_delta": "rank_delta",
        "abs_score_delta": "ABS(score_delta)",
        "score_delta": "score_delta",
        "label": "LOWER(label)",
    }
    sort_column = sort_columns.get(sort, sort_columns["abs_rank_delta"])
    direction = "ASC" if order == "asc" else "DESC"
    total = (await session.execute(
        text(f"{compared_cte} SELECT COUNT(*) FROM compared WHERE {where}"), params
    )).scalar_one()
    rows = (await session.execute(text(f"""
        {compared_cte}
        SELECT * FROM compared
        WHERE {where}
        ORDER BY {sort_column} {direction} NULLS LAST, LOWER(label), entity_id::text
        LIMIT :limit OFFSET :offset
    """), params)).mappings().all()
    return PaginatedComparisonItems(
        total=total,
        page=max(page, 1),
        per_page=params["limit"],
        items=[ComparisonItem.model_validate(dict(row)) for row in rows],
    )


async def comparison_result(session: AsyncSession, job_id: UUID) -> ComparisonResult:
    job = await session.get(ScoringJob, job_id)
    if job is None or job.kind != "comparison":
        raise LookupError("Comparison job not found")
    if job.status != "completed":
        raise ValueError("Comparison is not complete")
    baseline = UUID(job.request["baseline_id"])
    candidates = [UUID(value) for value in job.request["candidate_ids"]]
    baseline_rows = await _score_rows(session, job.scope, baseline)
    candidate_results = []
    for candidate in candidates:
        rows = await _score_rows(session, job.scope, candidate)
        candidate_results.append(_compare(candidate, baseline_rows, rows))
    return ComparisonResult(
        job_id=job.id, scope=job.scope, baseline_id=baseline,
        baseline_distribution=_distribution(baseline_rows), candidates=candidate_results,
    )


async def _score_rows(session: AsyncSession, scope: str, target_id: UUID) -> list[tuple[UUID, str, float | None, float | None, str | None]]:
    if scope == "vulnerability":
        query = text("SELECT vs.vulnerability_id, v.cve_id, vs.priority_score::float8, vs.priority_confidence::float8, vs.priority_level FROM vulnerability_scores vs JOIN vulnerabilities v ON v.id=vs.vulnerability_id WHERE vs.vulnerability_profile_id=:id")
    elif scope == "asset":
        query = text("SELECT s.asset_id, a.name, s.priority_score::float8, s.priority_confidence::float8, s.priority_level FROM asset_scores s JOIN assets a ON a.id=s.asset_id WHERE s.asset_profile_id=:id")
    else:
        context_id = target_id
        if scope == "preset":
            preset = await session.get(ScoringPreset, target_id)
            context_id = preset.context_id
        elif scope == "finding":
            _, active = await get_active_preset(session)
            context_id = (await _context(
                session,
                active.vulnerability_profile_id,
                active.asset_profile_id,
                target_id,
            )).id
        query = text("SELECT s.finding_id, v.cve_id || ' @ ' || a.name, s.priority_score::float8, s.priority_confidence::float8, s.priority_level FROM finding_scores s JOIN findings f ON f.id=s.finding_id JOIN vulnerabilities v ON v.id=f.vulnerability_id JOIN assets a ON a.id=f.asset_id WHERE s.scoring_context_id=:id")
        target_id = context_id
    return list((await session.execute(query, {"id": target_id})).tuples())


def _distribution(rows: list[tuple]) -> dict[str, int]:
    result: dict[str, int] = {}
    for row in rows:
        level = row[4] or "UNSCORED"
        result[level] = result.get(level, 0) + 1
    return result


def _compare(candidate_id: UUID, baseline_rows: list[tuple], candidate_rows: list[tuple]) -> ComparisonCandidateResult:
    baseline = {row[0]: row for row in baseline_rows}
    candidate = {row[0]: row for row in candidate_rows}
    baseline_rank = _ranks(baseline_rows)
    candidate_rank = _ranks(candidate_rows)
    ids = set(baseline) | set(candidate)
    transitions: dict[str, dict[str, int]] = {}
    items, deltas, rank_pairs = [], [], []
    promoted = demoted = unchanged = 0
    for entity_id in ids:
        left, right = baseline.get(entity_id), candidate.get(entity_id)
        lp, rp = (left[4] if left else None) or "UNSCORED", (right[4] if right else None) or "UNSCORED"
        transitions.setdefault(lp, {})[rp] = transitions.setdefault(lp, {}).get(rp, 0) + 1
        ls, rs = (left[2] if left else None), (right[2] if right else None)
        delta = rs - ls if rs is not None and ls is not None else None
        if delta is not None:
            deltas.append(delta)
        rd = baseline_rank.get(entity_id, 0) - candidate_rank.get(entity_id, 0) if entity_id in baseline_rank and entity_id in candidate_rank else None
        if rd is None or rd == 0: unchanged += 1
        elif rd > 0: promoted += 1
        else: demoted += 1
        if entity_id in baseline_rank and entity_id in candidate_rank:
            rank_pairs.append((baseline_rank[entity_id], candidate_rank[entity_id]))
        items.append(ComparisonItem(
            entity_id=entity_id, label=(left or right)[1], baseline_score=ls, candidate_score=rs,
            score_delta=delta, baseline_priority=lp, candidate_priority=rp,
            baseline_rank=baseline_rank.get(entity_id), candidate_rank=candidate_rank.get(entity_id), rank_delta=rd,
        ))
    items.sort(key=lambda item: abs(item.score_delta or 0), reverse=True)
    return ComparisonCandidateResult(
        candidate_id=candidate_id, distribution=_distribution(candidate_rows), transition_matrix=transitions,
        promoted=promoted, demoted=demoted, unchanged=unchanged,
        mean_score_delta=statistics.fmean(deltas) if deltas else 0,
        median_score_delta=statistics.median(deltas) if deltas else 0,
        spearman_rank_correlation=_spearman(rank_pairs), items=items,
    )


def _ranks(rows: list[tuple]) -> dict[UUID, int]:
    ordered = sorted(rows, key=lambda row: (-(row[2] or -1), -(row[3] or -1), str(row[0])))
    return {row[0]: index + 1 for index, row in enumerate(ordered)}


def _spearman(pairs: list[tuple[int, int]]) -> float | None:
    n = len(pairs)
    if n < 2:
        return None
    squared = sum((left - right) ** 2 for left, right in pairs)
    return 1 - (6 * squared) / (n * (n * n - 1))
