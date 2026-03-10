"""
User service: create, lookup, and manage user accounts.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import hash_password, verify_password
from app.models.tables import UserTable

logger = logging.getLogger(__name__)


async def create_user(
    db: AsyncSession,
    email: str,
    password: str,
    full_name: str,
) -> UserTable:
    """Create a new user account."""
    hashed = hash_password(password)
    user = UserTable(
        email=email.lower().strip(),
        hashed_password=hashed,
        full_name=full_name.strip(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info("Created user: %s", user.email)
    return user


async def get_user_by_email(db: AsyncSession, email: str) -> UserTable | None:
    """Lookup a user by email address."""
    stmt = select(UserTable).where(UserTable.email == email.lower().strip())
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> UserTable | None:
    """Lookup a user by their ID."""
    stmt = select(UserTable).where(UserTable.id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_user_profile(
    db: AsyncSession,
    user_id: str,
    full_name: str | None = None,
) -> UserTable | None:
    """Update user profile fields."""
    stmt = select(UserTable).where(UserTable.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        return None

    if full_name is not None:
        user.full_name = full_name.strip()

    await db.commit()
    await db.refresh(user)
    logger.info("Updated profile for user: %s", user.email)
    return user


async def change_user_password(
    db: AsyncSession,
    user_id: str,
    current_password: str,
    new_password: str,
) -> bool:
    """
    Change user password after verifying current password.

    Returns True if password changed, False if current password is wrong.
    Raises ValueError if user not found.
    """
    stmt = select(UserTable).where(UserTable.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise ValueError("User not found")

    if not verify_password(current_password, user.hashed_password):
        return False

    user.hashed_password = hash_password(new_password)
    await db.commit()
    logger.info("Password changed for user: %s", user.email)
    return True


async def get_user_stats(db: AsyncSession, user_id: str) -> dict:
    """Get interview statistics for a user."""
    from sqlalchemy import func
    from app.models.tables import InterviewSessionTable

    # Total sessions
    total_stmt = (
        select(func.count(InterviewSessionTable.id))
        .where(InterviewSessionTable.user_id == user_id)
    )
    total_result = await db.execute(total_stmt)
    total_sessions = total_result.scalar_one()

    # Completed sessions
    completed_stmt = (
        select(func.count(InterviewSessionTable.id))
        .where(
            InterviewSessionTable.user_id == user_id,
            InterviewSessionTable.status == "completed",
        )
    )
    completed_result = await db.execute(completed_stmt)
    completed_sessions = completed_result.scalar_one()

    # Average score
    avg_stmt = (
        select(func.avg(InterviewSessionTable.overall_score))
        .where(
            InterviewSessionTable.user_id == user_id,
            InterviewSessionTable.overall_score.isnot(None),
        )
    )
    avg_result = await db.execute(avg_stmt)
    avg_score = avg_result.scalar_one()

    # Best score
    best_stmt = (
        select(func.max(InterviewSessionTable.overall_score))
        .where(
            InterviewSessionTable.user_id == user_id,
            InterviewSessionTable.overall_score.isnot(None),
        )
    )
    best_result = await db.execute(best_stmt)
    best_score = best_result.scalar_one()

    # First session date
    first_stmt = (
        select(func.min(InterviewSessionTable.created_at))
        .where(InterviewSessionTable.user_id == user_id)
    )
    first_result = await db.execute(first_stmt)
    first_session = first_result.scalar_one()

    return {
        "total_sessions": total_sessions,
        "completed_sessions": completed_sessions,
        "average_score": round(avg_score, 1) if avg_score else None,
        "best_score": round(best_score, 1) if best_score else None,
        "member_since": first_session.isoformat() if first_session else None,
    }