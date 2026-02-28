import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.models.schemas import InterviewConfig
from app.services.interview import get_session, start_interview, submit_answer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/interview", tags=["Interview"])


# API REQUEST / RESPONSE MODELS
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
        description="candidate's answer to the current question",
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
    current_question: Optional[str] = None
    question_number: int
    is_follow_up: bool
    total_questions: int
    questions_answered: int
    error_message: Optional[str] = None


# ENDPOINTS
@router.post("/start", response_model=StartInterviewResponse)
def start_interview_endpoint(config: InterviewConfig):
    """
    Start a new interview session.

    Requires resume text, job description, interview type, and difficulty.
    Returns the first interview question.
    """

    try:
        session = start_interview(config)
        state = session.state

        # extract candidate name safely
        candidate_name = "Unknown"
        if state.candidate_profile:
            candidate_name = state.candidate_profile.candidate_name

        return StartInterviewResponse(
            session_id=session.session_id,
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
            detail="Failed to start interview. Please try again."
        )
    

@router.post("/answer", response_model=SubmitAnswerResponse)
def submit_answer_endpoint(request: SubmitAnswerRequest):
    """
    Submit an answer to the current question.

    If follow-up is needed, returns the follow-up question.
    If all questions are done, returns the final coaching report.
    Otherwise, returns the next question.
    """

    try:
        session = submit_answer(request.session_id, request.answer)
        state = session.state

        # build evaluation detail
        last_eval = None
        if (
            not session.awaiting_follow_up
            and state.qa_pairs
            and state.qa_pairs[-1].evaluation
        ):
            eval_data = state.qa_pairs[-1].evaluation
            last_eval = EvaluationDetail(
                score=eval_data.score,
                strengths=eval_data.strengths,
                weaknesses=eval_data.weaknesses,
            )

        # build final report
        final_report = None
        if state.final_report:
            final_report = state.final_report.model_dump()

        # determine question number
        if state.status == "completed":
            q_number = len(state.qa_pairs)
        else:
            q_number = state.current_question_index + 1

        # determine current question
        current_q = None
        if state.status not in ("completed", "error"):
            current_q = state.current_question

        # determine display status
        display_status = (
            "awaiting_follow_up"
            if session.awaiting_follow_up
            else state.status
        )

        return SubmitAnswerResponse(
            session_id=session.session_id,
            status=display_status,
            current_question=current_q,
            question_number=q_number,
            is_follow_up=session.awaiting_follow_up,
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
def get_session_endpoint(session_id: str):
    """Get current session status and information."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    state = session.state

    # Determine current question
    current_q = None
    if state.status not in ("completed", "error"):
        current_q = state.current_question

    # Determine display status
    display_status = (
        "awaiting_follow_up"
        if session.awaiting_follow_up
        else state.status
    )

    return SessionStatusResponse(
        session_id=session.session_id,
        status=display_status,
        current_question=current_q,
        question_number=state.current_question_index + 1,
        is_follow_up=session.awaiting_follow_up,
        total_questions=settings.MAX_QUESTIONS,
        questions_answered=len(state.qa_pairs),
        error_message=state.error_message,
    )