import json
import logging
from typing import Any

from upstash_redis import Redis

from app.core.config import settings

logger = logging.getLogger(__name__)

# Redis client (initialized at startup)
redis_client: Redis | None = None


async def init_redis() -> None:
    """Initialize Redis connection on startup."""
    global redis_client
    try:
        redis_client = Redis(
            url=settings.UPSTASH_REDIS_REST_URL,
            token=settings.UPSTASH_REDIS_REST_TOKEN,
        )
        # Test connection
        redis_client.ping()
        logger.info("Redis connection established")
    except Exception as e:
        logger.error("Redis connection failed: %s", type(e).__name__)
        redis_client = None


async def close_redis() -> None:
    """Close Redis connection on shutdown."""
    global redis_client
    if redis_client:
        redis_client = None
        logger.info("Redis connection closed")


def get_redis() -> Redis | None:
    """Get Redis client instance."""
    return redis_client


async def set_cache(key: str, value: Any, ttl: int | None = None) -> bool:
    """Set a value in Redis cache."""
    if not redis_client:
        logger.warning("Redis not available, skipping cache set")
        return False

    try:
        serialized = json.dumps(value, default=str)
        if ttl:
            redis_client.setex(key, ttl, serialized)
        else:
            redis_client.set(key, serialized)
        return True
    except Exception as e:
        logger.error("Redis set error: %s", type(e).__name__)
        return False


async def get_cache(key: str) -> Any | None:
    """Get a value from Redis cache."""
    if not redis_client:
        return None

    try:
        value = redis_client.get(key)
        if value:
            return json.loads(value)
        return None
    except Exception as e:
        logger.error("Redis get error: %s", type(e).__name__)
        return None


async def delete_cache(key: str) -> bool:
    """Delete a value from Redis cache."""
    if not redis_client:
        return False

    try:
        redis_client.delete(key)
        return True
    except Exception as e:
        logger.error("Redis delete error: %s", type(e).__name__)
        return False