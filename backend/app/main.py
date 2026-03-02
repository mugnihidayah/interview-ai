import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes import router
from app.core.database import init_db, close_db, get_db
from app.core.redis import init_redis, close_redis


# configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)

# LIFESPAN
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan event."""

    # startup
    logger.info("AI Interview Simulator starting up...")
    await init_db()
    await init_redis()
    logger.info("Docs available at: /docs")
    yield
    # shutdown
    await close_db()
    await close_redis()
    logger.info("AI Interview Simulator Shutting down...")


# APP SETUP
app = FastAPI(
    title="AI Interview Simulator",
    description="Agentic AI-powered interview simulation with multi-agent architecture",
    version="0.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# include API router
app.include_router(router)

# HEALTH CHECK
@app.get("/heatlh", tags=["System"])
def health_check():
    """Health check endpoint."""

    return {
        "status": "healthy",
        "version": "0.2.0",
    }


@app.delete("/system/cleanup", tags=["System"])
async def cleanup_sessions_endpoint(
    older_than_days: int = 30,
    db: AsyncSession = Depends(get_db),
):
    """
    Delete old sessions based on retention policy.

    - Completed sessions older than {older_than_days} days
    - Error sessions older than 7 days
    - Abandoned sessions older than 3 days
    """
    try:
        from app.services.database import cleanup_old_sessions

        result = await cleanup_old_sessions(
            db,
            completed_days=older_than_days,
        )

        total = sum(result.values())
        return {
            "message": f"Cleaned up {total} sessions",
            "details": result,
        }

    except Exception as e:
        logger.error("Cleanup failed: %s", type(e).__name__)
        from fastapi import HTTPException
        raise HTTPException(
            status_code=500,
            detail="Cleanup failed. Please try again.",
        )