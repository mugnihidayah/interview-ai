import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes import router
from app.api.auth_routes import router as auth_router
from app.api.voice_routes import router as voice_router
from app.core.database import init_db, close_db, get_db
from app.core.redis import init_redis, close_redis, get_redis
from app.core.auth import get_current_user
from app.models.tables import UserTable

# configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)

APP_VERSION = "0.5.0"


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
    version=APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# include API routers
app.include_router(router)
app.include_router(auth_router)
app.include_router(voice_router)


# HEALTH CHECK — fixed typo + added dependency checks
@app.get("/health", tags=["System"])
def health_check():
    """Health check endpoint."""
    redis = get_redis()

    return {
        "status": "healthy",
        "version": APP_VERSION,
        "services": {
            "redis": "connected" if redis else "disconnected",
        },
    }


# Keep old typo route for backward compat (redirect / same response)
@app.get("/heatlh", tags=["System"], include_in_schema=False)
def health_check_typo():
    """Backward-compatible typo route. Hidden from docs."""
    return health_check()


@app.delete("/system/cleanup", tags=["System"])
async def cleanup_sessions_endpoint(
    older_than_days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: UserTable = Depends(get_current_user),
):
    """
    Delete old sessions based on retention policy.
    Requires authentication.

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

        logger.info(
            "Cleanup triggered by user %s: %d sessions removed",
            current_user.id[:8],
            total,
        )

        return {
            "message": f"Cleaned up {total} sessions",
            "details": result,
        }

    except Exception as e:
        logger.error("Cleanup failed: %s", type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail="Cleanup failed. Please try again.",
        )