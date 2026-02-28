import logging
import re
import uuid
from dataclasses import dataclass

from app.agents.graph import run_process_answer, run_setup
from app.agents.interviewer import decide_follow_up, generate_follow_up
from app.models.schemas import InterviewConfig, InterviewState, QAPair

logger = logging.getLogger(__name__)


# SESSION MANAGEMENT
@dataclass
class InterviewSession:
    """
    Tracks an active interview session.

    Wraps InterviewState with service-level tracking
    for follow-up flow that requires user input mid-process.
    """

    session_id: str
    state: InterviewState
    awaiting_follow_up: bool = False
    pending_main_question: str = ""
    pending_main_answer: str = ""


# In-memory session store (will replaced by redis)
_sessions: dict[str, InterviewSession] = {}


# HELPERS
def _sanitize_text(text: str) -> str:
    """Basic text sanitization for user input."""
    text = text.strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)
    return text


# SERVICE FUNCTIONS
def start_interview(config: InterviewConfig) -> InterviewSession:
    """
    Start a new interview session.

    Flow: analyze resume -> plan interview -> generate first question
    """

    logger.info("Starting new interview session...")

    # generate secure session ID
    session_id = uuid.uuid4().hex

    # create initial state from validated config
    state = InterviewState(
        resume_text=config.resume_text,
        job_description=config.job_description,
        interview_type=config.interview_type,
        difficulty=config.difficulty,
    )

    # run setup graph
    state = run_setup(state)

    # create and store session
    session = InterviewSession(session_id=session_id, state=state)
    _sessions[session_id] = session

    logger.info(
        "Interview session created: %s (status: %s)",
        session_id[:8],
        state.status,
    )

    return session


def submit_answer(session_id: str, answer: str) -> InterviewSession:
    """
    Submit an answer to the current question.

    Handles two scenarios:
    1. Main answer → decide follow-up → process or ask follow-up
    2. Follow-up answer → record full Q&A → process
    """

    session = get_session(session_id)
    if not session:
        raise ValueError("Session not found")
    
    state = session.state

    # guard: interview must be in progress
    if state.status == "completed":
        raise ValueError("Interview already completed")
    
    if state.status == "error":
        raise ValueError("Interview is in error state")
    
    # sanitize user input
    clean_answer = _sanitize_text(answer)
    if not clean_answer:
        raise ValueError("Answer cannot be empty")
    
    # route based on follow-up state
    if session.awaiting_follow_up:
        _handle_follow_up_answer(session, clean_answer)
    else:
        _handle_main_answer(session, clean_answer)

    return session


def get_session(session_id: str) -> InterviewSession | None:
    """Retrieve an interview session by ID"""
    return _sessions.get(session_id)


# INTERNAL HANDLERS
def _handle_main_answer(session: InterviewSession, answer: str) -> None:
    """
    Handle answer to a main question.

    Decision flow:
    1. Ask LLM: does this answer need a follow-up?
    2a. YES → save answer, generate follow-up, wait for user
    2b. NO  → record Q&A, run process graph (evaluate + next Q or coaching)
    """

    state = session.state

    # decide if follow-up needed
    state = decide_follow_up(state, answer)

    if state.is_follow_up:
        session.pending_main_question = state.current_question
        session.pending_main_answer = answer

        # generate follow-up question
        state = generate_follow_up(state, answer)
        session.state = state
        session.awaiting_follow_up = True

        logger.info(
            "Follow-up generated for Q%d, awaiting answer",
            state.current_question_index + 1,
        )
    else:
        # no follow-up: record and process immediately
        qa_pair = QAPair(
            question_number=state.current_question_index + 1,
            question=state.current_question,
            answer=answer,
        )
        state.qa_pairs.append(qa_pair)

        # evaluate + next question or coaching
        session.state = run_process_answer(state)

        # ensure status is correct after graph processing
        _normalize_status(session)

        logger.info(
            "Answer processed for Q%d, status: %s",
            len(state.qa_pairs),
            session.state.status
        )


def _handle_follow_up_answer(session: InterviewSession, answer: str) -> None:
    """
    Handle answer to a follow-up question.

    Records the full Q&A pair, then runs process graph.
    """

    state = session.state

    # record complete Q&A pair with follow-up
    qa_pair = QAPair(
        question_number=state.current_question_index + 1,
        question=session.pending_main_question,
        answer=session.pending_main_answer,
        follow_up_question=state.current_question,
        follow_up_answer=answer,
    )
    state.qa_pairs.append(qa_pair)

    # reset follow-up tracking
    session.awaiting_follow_up = False
    session.pending_main_question = ""
    session.pending_main_answer = ""

    # evaluate + next question or coaching
    session.state = run_process_answer(state)

    # ensure status is correct after graph processing
    _normalize_status(session)

    logger.info(
        "Follow-up processed for Q%d, status: %s",
        len(state.qa_pairs),
        session.state.status,
    )


def _normalize_status(session: InterviewSession) -> None:
    """
    Ensure state status is correct after graph processing.

    The graph may leave status as 'evaluating' after generating the next question. 
    Normalize it to 'interviewing'.
    """

    state = session.state
    if state.status not in ("complete", "error"):
        state.status = "interviewing"