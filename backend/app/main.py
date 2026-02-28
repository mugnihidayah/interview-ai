import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router


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
    logger.info("Docs available at: /docs")
    yield
    # shutdown
    logger.info("AI Interview Simulator Shutting down...")


# APP SETUP
app = FastAPI(
    title="AI Interview Simulator",
    description="Agentic AI-powered interview simulation with multi-agent architecture",
    version="0.1.0",
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
        "version": "0.1.0",
    }

