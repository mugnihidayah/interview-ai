"""
User service: create, lookup, and manage user accounts.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import hash_password
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
