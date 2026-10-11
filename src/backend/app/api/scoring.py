import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.scoring import ScoringContext, ScoringJob
from app.schemas.scoring import (
    ComparisonExplanation,
    ComparisonFacets,
    ComparisonFilters,
    ComparisonFollowed,
    ComparisonRequest,
    ComparisonHistoryItem,
    ComparisonResult,
    ComparisonSummary,
    JobResponse,
    NamedProfileCreate,
    NamedProfileResponse,
    NamedProfileUpdate,
    PresetCreate,
    PresetResponse,
    PresetUpdate,
    FollowedChange,
    FollowedEntityType,
    FollowedItem,
    FollowedItemsRequest,
    PaginatedComparisonItems,
    ProfileCloneRequest,
    ScoreDistribution,
    ScoringProfile,
    ScoringRunRequest,
    ScoringRunResponse,
    RunHistoryResponse,
    SubsetPreview,
    SubsetPreviewRequest,
)
from app.services.comparison_analysis import (
    comparison_facets,
    comparison_followed,
    explain_item,
    follow,
    follow_matching,
    followed_ids,
    list_followed,
    preview_subset,
    unfollow,
)
from app.services.comparison_filters import entity_type
from app.services.profile_service import (
    activate_preset,
    cancel_job,
    clone_profile,
    comparison_items,
    comparison_result,
    create_preset,
    create_profile,
    delete_preset,
    delete_profile,
    enqueue_job,
    get_active_preset,
    get_comparison_summary,
    list_comparisons,
    list_presets,
    list_profiles,
    list_runs,
    preset_payload,
    reset_active_stage,
    update_preset,
    update_profile as update_named_profile,
)
from app.services.scoring_service import (
    ELIGIBLE_COLUMNS,
    compute_scores,
    get_column_distinct_values,
    get_score_distribution,
    get_scoring_profile,
    save_scoring_profile,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scoring", tags=["scoring"])


def _api_error(exc: Exception) -> HTTPException:
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=422, detail=str(exc))
    return HTTPException(status_code=409, detail="A profile or preset with this name already exists")


@router.get("/profiles", response_model=list[NamedProfileResponse])
async def named_profiles(stage: str | None = None, db: AsyncSession = Depends(get_db)):
    return await list_profiles(db, stage)


@router.post("/profiles", response_model=NamedProfileResponse, status_code=201)
async def add_named_profile(payload: NamedProfileCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await create_profile(db, payload)
    except Exception as exc:
        raise _api_error(exc) from exc


@router.patch("/profiles/{profile_id}", response_model=NamedProfileResponse)
async def edit_named_profile(profile_id: UUID, payload: NamedProfileUpdate, db: AsyncSession = Depends(get_db)):
    try:
        return await update_named_profile(db, profile_id, payload)
    except Exception as exc:
        raise _api_error(exc) from exc


@router.post("/profiles/{profile_id}/clone", response_model=NamedProfileResponse, status_code=201)
async def copy_named_profile(profile_id: UUID, payload: ProfileCloneRequest, db: AsyncSession = Depends(get_db)):
    try:
        return await clone_profile(db, profile_id, payload.name, payload.description)
    except Exception as exc:
        raise _api_error(exc) from exc


@router.delete("/profiles/{profile_id}", status_code=204)
async def remove_named_profile(profile_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        await delete_profile(db, profile_id)
    except Exception as exc:
        raise _api_error(exc) from exc


@router.get("/presets", response_model=list[PresetResponse])
async def presets(db: AsyncSession = Depends(get_db)):
    values = await list_presets(db)
    return [preset_payload(item, await db.get(ScoringContext, item.context_id)) for item in values]


@router.post("/presets", response_model=PresetResponse, status_code=201)
async def add_preset(payload: PresetCreate, db: AsyncSession = Depends(get_db)):
    try:
        item = await create_preset(db, payload)
        return preset_payload(item, await db.get(ScoringContext, item.context_id))
    except Exception as exc:
        raise _api_error(exc) from exc


@router.patch("/presets/{preset_id}", response_model=PresetResponse)
async def edit_preset(preset_id: UUID, payload: PresetUpdate, db: AsyncSession = Depends(get_db)):
    try:
        item = await update_preset(db, preset_id, payload)
        return preset_payload(item, await db.get(ScoringContext, item.context_id))
    except Exception as exc:
        raise _api_error(exc) from exc


@router.post("/presets/{preset_id}/clone", response_model=PresetResponse, status_code=201)
async def copy_preset(preset_id: UUID, payload: ProfileCloneRequest, db: AsyncSession = Depends(get_db)):
    try:
        values = await list_presets(db)
        source = next((item for item in values if item.id == preset_id), None)
        if source is None:
            raise LookupError("Scoring preset not found")
        context = await db.get(ScoringContext, source.context_id)
        item = await create_preset(db, PresetCreate(
            name=payload.name, description=payload.description or source.description,
            vulnerability_profile_id=context.vulnerability_profile_id,
            asset_profile_id=context.asset_profile_id,
            finding_profile_id=context.finding_profile_id,
        ))
        return preset_payload(item, await db.get(ScoringContext, item.context_id))
    except Exception as exc:
        raise _api_error(exc) from exc


@router.post("/presets/{preset_id}/activate", response_model=PresetResponse)
async def set_active_preset(preset_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        item = await activate_preset(db, preset_id)
        return preset_payload(item, await db.get(ScoringContext, item.context_id))
    except Exception as exc:
        raise _api_error(exc) from exc


@router.delete("/presets/{preset_id}", status_code=204)
async def remove_preset(preset_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        await delete_preset(db, preset_id)
    except Exception as exc:
        raise _api_error(exc) from exc


@router.post("/runs", response_model=JobResponse, status_code=202)
async def create_run(payload: ScoringRunRequest, db: AsyncSession = Depends(get_db)):
    target = payload.target_id
    if target is None:
        preset, context = await get_active_preset(db)
        target = preset.id if payload.scope == "preset" else getattr(context, f"{payload.scope}_profile_id")
    return await enqueue_job(db, "run", payload.scope, {"target_ids": [str(target)]})


@router.get("/runs", response_model=list[RunHistoryResponse])
async def run_history(scope: str | None = None, target_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    return await list_runs(db, scope, target_id)


def comparison_filters(
    q: str | None = Query(None, max_length=200),
    kev: bool | None = None,
    min_epss: float | None = Query(None, ge=0, le=1),
    severity: list[str] = Query([]),
    criticality: list[str] = Query([]),
    exposure: list[str] = Query([]),
    vendor: str | None = Query(None, max_length=200),
    product: str | None = Query(None, max_length=200),
    followed_only: bool = False,
) -> ComparisonFilters:
    """Attribute filters of the comparison views, as query parameters."""
    return ComparisonFilters(
        q=q, kev=kev, min_epss=min_epss, severities=severity, criticalities=criticality,
        exposures=exposure, vendor=vendor, product=product, followed_only=followed_only,
    )


MOVEMENT_PATTERN = "^(promoted|demoted|unchanged)$"
TOP_CHANGE_PATTERN = "^(entered|left|stayed)$"


@router.post("/comparisons", response_model=JobResponse, status_code=202)
async def create_comparison(payload: ComparisonRequest, db: AsyncSession = Depends(get_db)):
    ids = list(dict.fromkeys([payload.baseline_id, *payload.candidate_ids]))
    request = {
        "baseline_id": str(payload.baseline_id), "candidate_ids": [str(value) for value in payload.candidate_ids],
        "target_ids": [str(value) for value in ids],
    }
    subset = payload.subset
    if subset is not None and subset.followed_only:
        # Freeze the followed list so the population stays reproducible.
        followed = await followed_ids(db, entity_type(payload.scope))
        if not followed:
            raise HTTPException(status_code=422, detail="No followed items for this scope")
        restricted = set(subset.entity_ids)
        frozen = [value for value in followed if not restricted or value in restricted]
        subset = subset.model_copy(update={"followed_only": False, "entity_ids": frozen[:5000]})
    if subset is not None and not subset.is_empty():
        request["subset"] = subset.model_dump(mode="json", exclude_defaults=True)
    return await enqueue_job(db, "comparison", payload.scope, request)


@router.post("/comparisons/subset/preview", response_model=SubsetPreview)
async def comparison_subset_preview(payload: SubsetPreviewRequest, db: AsyncSession = Depends(get_db)):
    return await preview_subset(db, payload.scope, payload.subset)


@router.get("/followed", response_model=list[FollowedItem])
async def followed_items(entity_type: FollowedEntityType, db: AsyncSession = Depends(get_db)):
    return await list_followed(db, entity_type)


@router.post("/followed", response_model=FollowedChange)
async def add_followed_items(payload: FollowedItemsRequest, db: AsyncSession = Depends(get_db)):
    changed, total = await follow(db, payload.entity_type, payload.entity_ids)
    return FollowedChange(changed=changed, total=total)


@router.delete("/followed", response_model=FollowedChange)
async def remove_followed_items(
    entity_type: FollowedEntityType,
    entity_id: list[UUID] = Query([]),
    clear: bool = False,
    db: AsyncSession = Depends(get_db),
):
    if not entity_id and not clear:
        raise HTTPException(status_code=422, detail="Pass entity_id values or clear=true")
    changed, total = await unfollow(db, entity_type, None if clear else entity_id)
    return FollowedChange(changed=changed, total=total)


@router.get("/comparisons", response_model=list[ComparisonHistoryItem])
async def comparison_history(
    scope: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await list_comparisons(db, scope, limit)


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def job_status(job_id: UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(ScoringJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Scoring job not found")
    return job


@router.post("/jobs/{job_id}/cancel", response_model=JobResponse)
async def stop_job(job_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        return await cancel_job(db, job_id)
    except Exception as exc:
        raise _api_error(exc) from exc


@router.get("/comparisons/{job_id}", response_model=ComparisonResult)
async def comparison(job_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        return await comparison_result(db, job_id)
    except Exception as exc:
        raise _api_error(exc) from exc


@router.get("/comparisons/{job_id}/summary", response_model=ComparisonSummary)
async def comparison_summary(job_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        return await get_comparison_summary(db, job_id)
    except Exception as exc:
        raise _api_error(exc) from exc


@router.get("/comparisons/{job_id}/items", response_model=PaginatedComparisonItems)
async def comparison_item_page(
    job_id: UUID,
    candidate_id: UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    movement: str | None = Query(None, pattern=MOVEMENT_PATTERN),
    from_priority: str | None = None,
    to_priority: str | None = None,
    top_n: int | None = Query(None, ge=1, le=100000),
    top_change: str | None = Query(None, pattern=TOP_CHANGE_PATTERN),
    sort: str = Query("abs_rank_delta", pattern="^(abs_rank_delta|rank_delta|abs_score_delta|score_delta|label|baseline_rank|candidate_rank)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    filters: ComparisonFilters = Depends(comparison_filters),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await comparison_items(
            db, job_id, candidate_id, page, per_page, None, movement,
            from_priority, to_priority, sort, order, filters, top_n, top_change,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc
    except Exception as exc:
        raise _api_error(exc) from exc


@router.get("/comparisons/{job_id}/facets", response_model=ComparisonFacets)
async def comparison_facet_counts(
    job_id: UUID,
    filters: ComparisonFilters = Depends(comparison_filters),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await comparison_facets(db, job_id, filters)
    except RuntimeError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc
    except Exception as exc:
        raise _api_error(exc) from exc


@router.get("/comparisons/{job_id}/followed", response_model=ComparisonFollowed)
async def comparison_followed_positions(job_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        return await comparison_followed(db, job_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc
    except Exception as exc:
        raise _api_error(exc) from exc


@router.post("/comparisons/{job_id}/followed", response_model=FollowedChange)
async def follow_comparison_matches(
    job_id: UUID,
    candidate_id: UUID,
    movement: str | None = Query(None, pattern=MOVEMENT_PATTERN),
    from_priority: str | None = None,
    to_priority: str | None = None,
    top_n: int | None = Query(None, ge=1, le=100000),
    top_change: str | None = Query(None, pattern=TOP_CHANGE_PATTERN),
    filters: ComparisonFilters = Depends(comparison_filters),
    db: AsyncSession = Depends(get_db),
):
    try:
        changed, total = await follow_matching(
            db, job_id, candidate_id, filters, movement, from_priority, to_priority, top_n, top_change,
        )
        return FollowedChange(changed=changed, total=total)
    except RuntimeError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc
    except Exception as exc:
        raise _api_error(exc) from exc


@router.get("/comparisons/{job_id}/items/{entity_id}/explain", response_model=ComparisonExplanation)
async def comparison_item_explanation(
    job_id: UUID, entity_id: UUID, candidate_id: UUID, db: AsyncSession = Depends(get_db),
):
    try:
        return await explain_item(db, job_id, candidate_id, entity_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc
    except Exception as exc:
        raise _api_error(exc) from exc


@router.get("/profile", response_model=ScoringProfile)
async def get_profile(db: AsyncSession = Depends(get_db)):
    try:
        return await get_scoring_profile(db)
    except Exception as exc:
        logger.exception("Failed to load scoring profile")
        raise HTTPException(status_code=500, detail="Failed to load scoring profile") from exc


@router.put("/profile", response_model=ScoringProfile)
async def update_profile(profile: ScoringProfile, db: AsyncSession = Depends(get_db)):
    try:
        await save_scoring_profile(db, profile)
        return profile
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to save scoring profile")
        raise HTTPException(status_code=500, detail="Failed to save scoring profile") from exc


@router.delete("/profile", response_model=ScoringProfile)
async def reset_profile(db: AsyncSession = Depends(get_db)):
    """Delete the custom scoring profile — the default profile is returned on next GET."""
    try:
        profile = await reset_active_stage(db, "vulnerability")
        return ScoringProfile.model_validate(profile.config)
    except Exception as exc:
        logger.exception("Failed to reset scoring profile")
        raise HTTPException(status_code=500, detail="Failed to reset scoring profile") from exc


@router.post("/run", response_model=ScoringRunResponse)
async def run_scoring(db: AsyncSession = Depends(get_db)):
    try:
        profile = await get_scoring_profile(db)
        rows, distribution = await compute_scores(db, profile)
        return ScoringRunResponse(rows_updated=rows, distribution=distribution)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to compute scores")
        raise HTTPException(status_code=500, detail="Failed to compute scores") from exc


@router.get("/column-values/{column}")
async def column_values(column: str, db: AsyncSession = Depends(get_db)):
    if column not in ELIGIBLE_COLUMNS:
        raise HTTPException(status_code=422, detail=f"Column '{column}' is not eligible for scoring")
    try:
        values = await get_column_distinct_values(db, column)
        return {"column": column, "values": values}
    except Exception as exc:
        logger.exception("Failed to fetch distinct values for column %s", column)
        raise HTTPException(status_code=500, detail="Failed to fetch column values") from exc


@router.get("/distribution", response_model=ScoreDistribution)
async def distribution(preset_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    try:
        return await get_score_distribution(db, preset_id)
    except Exception as exc:
        logger.exception("Failed to fetch score distribution")
        raise HTTPException(status_code=500, detail="Failed to fetch distribution") from exc


@router.get("/eligible-columns")
async def get_eligible_columns():
    """Return all columns eligible for scoring with their type metadata."""
    return ELIGIBLE_COLUMNS
