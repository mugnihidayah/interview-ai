import logging
from fastapi import HTTPException
from app.core.redis import get_redis

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    Simple rate limiter using Upstash Redis.
    Uses fixed-window counter with INCR + EXPIRE.
    """

    def __init__(
        self,
        max_requests: int,
        window_seconds: int,
        key_prefix: str,
    ):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.key_prefix = key_prefix

    def check(self, identifier: str) -> None:
        """
        Check rate limit for given identifier.
        Raises HTTPException 429 if limit exceeded.
        Falls through silently if Redis unavailable (fail-open).
        """
        redis = get_redis()
        if not redis:
            # Redis down, don't block users, just log
            logger.warning("Redis unavailable, skipping rate limit check")
            return

        key = f"rl:{self.key_prefix}:{identifier}"

        try:
            # Increment counter
            current = redis.incr(key)

            # Set expiry only on first request in window
            if current == 1:
                redis.expire(key, self.window_seconds)

            if current > self.max_requests:
                # Get remaining TTL for retry-after header
                remaining_ttl = redis.ttl(key)
                logger.warning(
                    "Rate limit exceeded: %s (count: %d, limit: %d)",
                    key, current, self.max_requests,
                )
                raise HTTPException(
                    status_code=429,
                    detail={
                        "error": "Too many requests. Please slow down.",
                        "retry_after_seconds": remaining_ttl if remaining_ttl > 0 else self.window_seconds,
                        "limit": self.max_requests,
                        "window_seconds": self.window_seconds,
                    },
                )

        except HTTPException:
            raise
        except Exception as e:
            # Redis error, fail-open, don't block user
            logger.error("Rate limiter error: %s", type(e).__name__)


# PRE-CONFIGURED LIMITERS

# Auth: 10 requests per 60s per IP
auth_limiter = RateLimiter(
    max_requests=10,
    window_seconds=60,
    key_prefix="auth",
)

# Start interview: 5 per 5 minutes per user
interview_start_limiter = RateLimiter(
    max_requests=5,
    window_seconds=300,
    key_prefix="start",
)

# Submit answer: 30 per 5 minutes per user
answer_limiter = RateLimiter(
    max_requests=30,
    window_seconds=300,
    key_prefix="answer",
)

# Read endpoints: 60 per minute per user
read_limiter = RateLimiter(
    max_requests=60,
    window_seconds=60,
    key_prefix="read",
)