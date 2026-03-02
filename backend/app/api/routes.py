import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.schemas import InterviewConfig
from app.services import interview as interview_service
from app.services.database import get_coaching_report, get_session, delete_session
from app.core.redis import delete_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/interview", tags=["Interview"])


# API RESPONSE MODEL
class SubmitAnswerRequest(BaseModel):
    """Request body for submitting an answer."""

    session_id: str = Field(
        ...,
        min_length=1,
        description="Interview session ID",
    )
    answer: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="Candidate's answer to the current question",
    )


class EvaluationDetail(BaseModel):
    """Evaluation detail exposed to the user."""

    score: int
    strengths: list[str]
    weaknesses: list[str]


class StartInterviewResponse(BaseModel):
    """Response after starting an interview."""

    session_id: str
    status: str
    current_question: str
    question_number: int
    total_questions: int
    candidate_name: str
    interview_type: str
    difficulty: str
    error_message: Optional[str] = None


class SubmitAnswerResponse(BaseModel):
    """Response after submitting an answer."""

    session_id: str
    status: str
    current_question: Optional[str] = None
    question_number: int
    is_follow_up: bool = False
    total_questions: int
    last_evaluation: Optional[EvaluationDetail] = None
    final_report: Optional[dict] = None
    error_message: Optional[str] = None


class SessionStatusResponse(BaseModel):
    """Current session status."""

    session_id: str
    status: str
    candidate_name: Optional[str] = None
    interview_type: Optional[str] = None
    difficulty: Optional[str] = None
    current_question: Optional[str] = None
    question_number: int
    is_follow_up: bool
    total_questions: int
    questions_answered: int
    overall_score: Optional[float] = None
    overall_grade: Optional[str] = None
    error_message: Optional[str] = None


class SessionSummary(BaseModel):
    """Summary of an interview session for listing."""

    session_id: str
    interview_type: str
    difficulty: str
    status: str
    overall_score: Optional[float] = None
    overall_grade: Optional[str] = None
    candidate_name: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


class SessionListResponse(BaseModel):
    """Response for listing sessions."""

    sessions: list[SessionSummary]
    total: int
    page: int
    page_size: int
    total_pages: int


class CoachingReportResponse(BaseModel):
    """Response for getting a coaching report."""

    session_id: str
    status: str
    report: Optional[dict] = None
    error_message: Optional[str] = None


# ENDPOINTS
@router.post("/start", response_model=StartInterviewResponse)
async def start_interview_endpoint(
    config: InterviewConfig,
    db: AsyncSession = Depends(get_db),
):
    """
    Start a new interview session.

    Requires resume text, job description, interview type, and difficulty.
    Returns the first interview question.
    """
    try:
        result = await interview_service.start_interview(db, config)
        state = result["state"]

        candidate_name = "Unknown"
        if state.candidate_profile:
            candidate_name = state.candidate_profile.candidate_name

        return StartInterviewResponse(
            session_id=result["session_id"],
            status=state.status,
            current_question=state.current_question,
            question_number=state.current_question_index + 1,
            total_questions=settings.MAX_QUESTIONS,
            candidate_name=candidate_name,
            interview_type=state.interview_type.value,
            difficulty=state.difficulty.value,
            error_message=state.error_message,
        )

    except Exception as e:
        logger.error("Failed to start interview: %s", type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail="Failed to start interview. Please try again.",
        )


@router.post("/answer", response_model=SubmitAnswerResponse)
async def submit_answer_endpoint(
    request: SubmitAnswerRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Submit an answer to the current question.

    If follow-up is needed, returns the follow-up question.
    If all questions are done, returns the final coaching report.
    Otherwise, returns the next question.
    """
    try:
        result = await interview_service.submit_answer(
            db, request.session_id, request.answer
        )
        state = result["state"]
        awaiting_follow_up = result.get("awaiting_follow_up", False)

        # Build evaluation detail
        last_eval = None
        if (
            not awaiting_follow_up
            and state.qa_pairs
            and state.qa_pairs[-1].evaluation
        ):
            eval_data = state.qa_pairs[-1].evaluation
            last_eval = EvaluationDetail(
                score=eval_data.score,
                strengths=eval_data.strengths,
                weaknesses=eval_data.weaknesses,
            )

        # Build final report
        final_report = None
        if state.final_report:
            final_report = state.final_report.model_dump()

        # Determine question number
        if state.status == "completed":
            q_number = len(state.qa_pairs)
        else:
            q_number = state.current_question_index + 1

        # Determine current question
        current_q = None
        if state.status not in ("completed", "error"):
            current_q = state.current_question

        # Determine display status
        display_status = (
            "awaiting_follow_up" if awaiting_follow_up else state.status
        )

        return SubmitAnswerResponse(
            session_id=request.session_id,
            status=display_status,
            current_question=current_q,
            question_number=q_number,
            is_follow_up=awaiting_follow_up,
            total_questions=settings.MAX_QUESTIONS,
            last_evaluation=last_eval,
            final_report=final_report,
            error_message=state.error_message,
        )

    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            raise HTTPException(status_code=404, detail="Session not found")
        raise HTTPException(status_code=400, detail=error_msg)

    except Exception as e:
        logger.error("Failed to process answer: %s", type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail="Failed to process answer. Please try again.",
        )


@router.get("/session/{session_id}", response_model=SessionStatusResponse)
async def get_session_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get current session status and information."""
    try:
        session_data = await interview_service.get_session_status(
            db, session_id
        )
        state = session_data["state"]
        awaiting_follow_up = session_data.get("awaiting_follow_up", False)

        # Determine current question
        current_q = None
        if state.status not in ("completed", "error"):
            current_q = state.current_question

        # Determine display status
        display_status = (
            "awaiting_follow_up" if awaiting_follow_up else state.status
        )

        # Extract candidate name
        candidate_name = None
        if state.candidate_profile:
            candidate_name = state.candidate_profile.candidate_name

        # Extract final scores
        overall_score = None
        overall_grade = None
        if state.final_report:
            overall_score = state.final_report.overall_score
            overall_grade = state.final_report.overall_grade.value

        return SessionStatusResponse(
            session_id=session_id,
            status=display_status,
            candidate_name=candidate_name,
            interview_type=state.interview_type.value,
            difficulty=state.difficulty.value,
            current_question=current_q,
            question_number=state.current_question_index + 1,
            is_follow_up=awaiting_follow_up,
            total_questions=settings.MAX_QUESTIONS,
            questions_answered=len(state.qa_pairs),
            overall_score=overall_score,
            overall_grade=overall_grade,
            error_message=state.error_message,
        )

    except ValueError:
        raise HTTPException(status_code=404, detail="Session not found")

    except Exception as e:
        logger.error("Failed to get session: %s", type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve session.",
        )


@router.get("/history", response_model=SessionListResponse)
async def list_sessions_endpoint(
    page: int = 1,
    page_size: int = 10,
    db: AsyncSession = Depends(get_db),
):
    """
    List all interview sessions with pagination.

    Returns session summaries ordered by newest first.
    """
    try:
        # Validate pagination params
        page = max(1, page)
        page_size = max(1, min(50, page_size))

        from app.services.database import list_sessions

        result = await list_sessions(db, page, page_size)

        sessions = []
        for row in result["sessions"]:
            # Extract candidate name from profile JSON
            candidate_name = None
            if row.candidate_profile:
                candidate_name = row.candidate_profile.get("candidate_name")

            sessions.append(
                SessionSummary(
                    session_id=row.id,
                    interview_type=row.interview_type,
                    difficulty=row.difficulty,
                    status=row.status,
                    overall_score=row.overall_score,
                    overall_grade=row.overall_grade,
                    candidate_name=candidate_name,
                    created_at=row.created_at.isoformat(),
                    completed_at=row.completed_at.isoformat() if row.completed_at else None,
                )
            )

        return SessionListResponse(
            sessions=sessions,
            total=result["total"],
            page=result["page"],
            page_size=result["page_size"],
            total_pages=result["total_pages"],
        )

    except Exception as e:
        logger.error("Failed to list sessions: %s", type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail="Failed to list sessions.",
        )


@router.get("/{session_id}/report", response_model=CoachingReportResponse)
async def get_report_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Get the coaching report for a completed session.

    Returns the full coaching report with scores, feedback, and recommendations.
    """
    try:
        # Check session exists
        session_row = await get_session(db, session_id)
        if not session_row:
            raise HTTPException(status_code=404, detail="Session not found")

        # Check session is completed
        if session_row.status != "completed":
            return CoachingReportResponse(
                session_id=session_id,
                status=session_row.status,
                report=None,
                error_message="Interview not yet completed",
            )

        # Get report
        report_row = await get_coaching_report(db, session_id)
        report_data = report_row.report_data if report_row else None

        return CoachingReportResponse(
            session_id=session_id,
            status=session_row.status,
            report=report_data,
        )

    except HTTPException:
        raise

    except Exception as e:
        logger.error("Failed to get report: %s", type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve report.",
        )


@router.delete("/session/{session_id}")
async def delete_session_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Delete an interview session and all related data.

    Removes session, Q&A pairs, and coaching report permanently.
    """
    try:
        # Delete from database
        deleted = await delete_session(db, session_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Session not found")

        # Clear Redis cache
        await delete_cache(f"interview:{session_id}")

        return {
            "message": "Session deleted successfully",
            "session_id": session_id,
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.error("Failed to delete session: %s", type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail="Failed to delete session.",
        )