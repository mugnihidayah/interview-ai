"""
Authentication API routes: register, login, me, profile, password.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    create_access_token,
    verify_password,
    get_current_user,
)
from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limiter import auth_limiter
from app.models.tables import UserTable
from app.services.users import (
    create_user,
    get_user_by_email,
    update_user_profile,
    change_user_password,
    get_user_stats,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


# Request / Response Models


class RegisterRequest(BaseModel):
    """Request body for user registration."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=100)


class LoginRequest(BaseModel):
    """Request body for user login."""

    email: EmailStr
    password: str = Field(..., min_length=1)


class AuthResponse(BaseModel):
    """Response after successful authentication."""

    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    """Serialized user info."""

    id: str
    email: str
    full_name: str


class UpdateProfileRequest(BaseModel):
    """Request body for updating user profile."""

    full_name: str = Field(..., min_length=1, max_length=100)


class ChangePasswordRequest(BaseModel):
    """Request body for changing password."""

    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


class UserStatsResponse(BaseModel):
    """User interview statistics."""

    total_sessions: int
    completed_sessions: int
    average_score: float | None
    best_score: float | None
    member_since: str | None


def _set_auth_cookie(response: Response, token: str) -> None:
    """Set httpOnly cookie with JWT token."""
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=settings.APP_ENV != "development",
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


# Endpoints


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register_endpoint(
    request: RegisterRequest,
    response: Response,
    raw_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user account."""
    client_ip = raw_request.client.host if raw_request.client else "unknown"
    auth_limiter.check(f"ip:{client_ip}")

    # Check if email already exists
    existing = await get_user_by_email(db, request.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    try:
        user = await create_user(
            db,
            email=request.email,
            password=request.password,
            full_name=request.full_name,
        )
    except Exception as e:
        logger.error("Registration failed: %s", type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail="Registration failed. Please try again.",
        )

    token = create_access_token(data={"sub": user.id})
    _set_auth_cookie(response, token)

    return AuthResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
        ),
    )


@router.post("/login", response_model=AuthResponse)
async def login_endpoint(
    request: LoginRequest,
    response: Response,
    raw_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Login with email and password."""
    client_ip = raw_request.client.host if raw_request.client else "unknown"
    auth_limiter.check(f"ip:{client_ip}")

    user = await get_user_by_email(db, request.email)
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(data={"sub": user.id})
    _set_auth_cookie(response, token)

    return AuthResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
        ),
    )


@router.post("/logout")
async def logout_endpoint(
    response: Response,
    raw_request: Request,
):
    """Clear the auth cookie."""
    client_ip = raw_request.client.host if raw_request.client else "unknown"
    auth_limiter.check(f"ip:{client_ip}")

    response.delete_cookie(
        key="access_token",
        path="/",
        httponly=True,
        samesite="lax",
    )
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def me_endpoint(
    current_user: UserTable = Depends(get_current_user),
):
    """Get the currently authenticated user."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
    )


@router.put("/profile", response_model=UserResponse)
async def update_profile_endpoint(
    request: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserTable = Depends(get_current_user),
):
    """Update user profile (full name)."""
    user = await update_user_profile(
        db,
        user_id=current_user.id,
        full_name=request.full_name,
    )

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
    )


@router.put("/password")
async def change_password_endpoint(
    request: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserTable = Depends(get_current_user),
):
    """Change user password."""
    if request.current_password == request.new_password:
        raise HTTPException(
            status_code=400,
            detail="New password must be different from current password",
        )

    try:
        success = await change_user_password(
            db,
            user_id=current_user.id,
            current_password=request.current_password,
            new_password=request.new_password,
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found")

    if not success:
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect",
        )

    return {"message": "Password changed successfully"}


@router.get("/stats", response_model=UserStatsResponse)
async def user_stats_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: UserTable = Depends(get_current_user),
):
    """Get interview statistics for the current user."""
    stats = await get_user_stats(db, current_user.id)
    return UserStatsResponse(**stats)