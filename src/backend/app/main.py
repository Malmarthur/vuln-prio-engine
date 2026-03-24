import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import ingestion, scoring, settings, vulnerabilities
from app.config import settings as app_settings
from app.database import AsyncSessionLocal, engine
from app.ingestion.scheduler import init_scheduler, shutdown_scheduler
from app.logging_config import setup_logging
from app.services.vulnerability_service import cleanup_stale_ingestion_logs

logger = logging.getLogger(__name__)
access_logger = logging.getLogger("app.access")


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("Starting %s", app_settings.app_name)
    async with AsyncSessionLocal() as session:
        count = await cleanup_stale_ingestion_logs(session)
        if count:
            logger.info("Cleaned up %d stale ingestion log(s) from previous run", count)
    await init_scheduler()
    yield
    shutdown_scheduler()
    await engine.dispose()
    logger.info("Shutdown complete")


app = FastAPI(
    title=app_settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start) * 1000
    access_logger.info(
        "%s %s → %s (%.0fms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


app.include_router(vulnerabilities.router, prefix="/api/v1")
app.include_router(ingestion.router, prefix="/api/v1")
app.include_router(settings.router, prefix="/api/v1")
app.include_router(scoring.router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    return {"status": "ok", "app": app_settings.app_name}
