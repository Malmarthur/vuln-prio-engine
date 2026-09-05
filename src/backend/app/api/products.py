import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.product import ProductResolutionRunRequest, ProductResolutionRunResponse
from app.services.product_resolution_service import run_product_resolution

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/products", tags=["products"])


@router.post("/resolution/run", response_model=ProductResolutionRunResponse)
async def resolve_products(payload: ProductResolutionRunRequest = ProductResolutionRunRequest(), db: AsyncSession = Depends(get_db)):
    try:
        return await run_product_resolution(db, payload.asset_id)
    except Exception as exc:
        logger.exception("Product resolution run failed")
        raise HTTPException(status_code=500, detail="Product resolution run failed") from exc
