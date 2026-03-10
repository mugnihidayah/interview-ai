import asyncio
from collections.abc import AsyncGenerator
import logging
import re
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graph import run_process_answer, run_setup
from app.agents.interviewer import (
    decide_follow_up,
    generate_follow_up,
    advance_question,
    generate_question,
)
from app.agents.evaluator import evaluate_answer
from app.agents.coach import generate_coaching_report
from app.core.config import settings
from app.core.redis import delete_cache, get_cache, set_cache
from app.models.schemas import InterviewConfig, InterviewState, QAPair
from app.services import database as db_service
from app.services.tts_prefetch import prefetch_tts_audio

logger = logging.getLogger(__name__)

REDIS_KEY_PREFIX = "interview"


# HELPERS
def _redis_key(session_id: str) -> str:
    """Build redis key for a session"""
    return f"{REDIS_KEY_PREFIX}: {session_id}"


def _sanitize_text(text: str) -> str:
    """Basic text sanitization for user input"""
    text = text.strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)
    return text


# REDIS CACHE OPERATION
async def _cache_session(
    session_id: str,
    state: InterviewState,
    awaiting_follow_up: bool = False,
    pending_main_question: str = "",
    pending_main_answer: str = "",
) -> None:
    """Cache active session state in redis"""
    cache_data = {
        "state": state.model_dump(mode="json"),
        "awaiting_follow_up": awaiting_follow_up,
        "pending_main_question": pending_main_question,
        "pending_main_answer": pending_main_answer,
    }
    await set_cache(
        _redis_key(session_id),
        cache_data,
        ttl=settings.SESSION_TTL_SECONDS,
    )


async def _load_from_cache(session_id: str) -> dict | None:
    """Load session from redis cache"""
    return await get_cache(_redis_key(session_id))


async def _clear_cache(session_id: str) -> None:
    """Remove session from redis cache"""
    await delete_cache(_redis_key(session_id))


# SESSION LOADING
async def _load_session(
    db: AsyncSession,
    session_id: str,
) -> dict:
    """
    Load session data. Try redis first, fallback to DB.

    Returns dict with:
    - state: InterviewState
    - awaiting_follow_up: bool
    - pending_main_question: str
    - pending_main_answer: str
    """

    # try redis first
    cached = await _load_from_cache(session_id)
    if cached:
        cached["state"] = InterviewState.model_validate(cached["state"])
        logger.debug("Session %s loaded from redis", session_id[:8])
        return cached

    # fallback to DB
    session_row = await db_service.get_session(db, session_id)
    if not session_row:
        raise ValueError("Session not found")

    state = db_service.db_to_interview_state(session_row)

    session_data = {
        "state": state,
        "awaiting_follow_up": False,
        "pending_main_question": "",
        "pending_main_answer": "",
    }

    # re-cache in redis for next access
    if state.status not in ("completed", "error"):
        await _cache_session(session_id, state)
        logger.info("Session %s loaded from DB and re-cached", session_id[:8])

    return session_data


# SERVICE FUNCTION
async def start_interview(
    db: AsyncSession,
    config: InterviewConfig,
    user_id: str | None = None,
) -> dict:
    """
    Start a new interview session.

    Flow: create state → run setup graph → save to DB → cache in Redis
    """

    logger.info("Starting new interview session...")

    session_id = uuid.uuid4().hex

    state = InterviewState(
        resume_text=config.resume_text,
        job_description=config.job_description,
        interview_type=config.interview_type,
        difficulty=config.difficulty,
        language=config.language,
    )

    # run setup graph in thread
    state = await asyncio.to_thread(run_setup, state)

    # save to database
    await db_service.create_session(db, session_id, state, user_id=user_id)

    # cache in redis
    await _cache_session(session_id, state)

    logger.info(
        "Interview session created: %s (status: %s)",
        session_id[:8],
        state.status,
    )

    return {
        "session_id": session_id,
        "state": state,
    }


async def submit_answer(
    db: AsyncSession,
    session_id: str,
    answer: str,
) -> dict:
    """
    Submit an answer to the current question.

    Handles two scenarios:
    1. Main answer → decide follow-up → process or ask follow-up
    2. Follow-up answer → record full Q&A → process
    """

    # load session
    session_data = await _load_session(db, session_id)
    state = session_data["state"]

    # guards
    if state.status == "completed":
        raise ValueError("Interview already completed")
    if state.status == "error":
        raise ValueError("Interview is in error state")

    # sanitize input
    clean_answer = _sanitize_text(answer)
    if not clean_answer:
        raise ValueError("Answer cannot be empty")

    # Route based on follow-up state
    if session_data["awaiting_follow_up"]:
        return await _handle_follow_up_answer(
            db, session_id, session_data, clean_answer
        )
    else:
        return await _handle_main_answer(db, session_id, session_data, clean_answer)


async def get_session_status(
    db: AsyncSession,
    session_id: str,
) -> dict:
    """Get current session status and info."""
    return await _load_session(db, session_id)


# INTERNAL HANDLERS
async def _handle_main_answer(
    db: AsyncSession,
    session_id: str,
    session_data: dict,
    answer: str,
) -> dict:
    """Handle answer to a main question."""
    state = session_data["state"]

    # Decide if follow-up needed
    state = await asyncio.to_thread(decide_follow_up, state, answer)

    if state.is_follow_up:
        # Save original question before it gets overwritten
        pending_question = state.current_question

        # Generate follow-up question
        state = await asyncio.to_thread(generate_follow_up, state, answer)

        # Cache with follow-up state
        await _cache_session(
            session_id,
            state,
            awaiting_follow_up=True,
            pending_main_question=pending_question,
            pending_main_answer=answer,
        )

        logger.info(
            "Follow-up generated for Q%d, awaiting answer",
            state.current_question_index + 1,
        )

        return {
            "state": state,
            "awaiting_follow_up": True,
        }

    else:
        # No follow-up: record Q&A and process
        qa_pair = QAPair(
            question_number=state.current_question_index + 1,
            question=state.current_question,
            answer=answer,
        )
        state.qa_pairs.append(qa_pair)

        # Evaluate + next question or coaching
        state = await asyncio.to_thread(run_process_answer, state)

        # Normalize status
        if state.status not in ("completed", "error"):
            state.status = "interviewing"

        # Save evaluated Q&A to database
        await db_service.save_qa_pair(db, session_id, state.qa_pairs[-1])

        # Handle completion or continue
        await _sync_after_processing(db, session_id, state)

        logger.info(
            "Answer processed for Q%d, status: %s",
            len(state.qa_pairs),
            state.status,
        )

        return {
            "state": state,
            "awaiting_follow_up": False,
        }


async def _handle_follow_up_answer(
    db: AsyncSession,
    session_id: str,
    session_data: dict,
    answer: str,
) -> dict:
    """Handle answer to a follow-up question."""
    state = session_data["state"]

    # Record complete Q&A pair
    qa_pair = QAPair(
        question_number=state.current_question_index + 1,
        question=session_data["pending_main_question"],
        answer=session_data["pending_main_answer"],
        follow_up_question=state.current_question,
        follow_up_answer=answer,
    )
    state.qa_pairs.append(qa_pair)

    # Evaluate + next question or coaching
    state = await asyncio.to_thread(run_process_answer, state)

    # Normalize status
    if state.status not in ("completed", "error"):
        state.status = "interviewing"

    # Save evaluated Q&A to database
    await db_service.save_qa_pair(db, session_id, state.qa_pairs[-1])

    # Handle completion or continue
    await _sync_after_processing(db, session_id, state)

    logger.info(
        "Follow-up processed for Q%d, status: %s",
        len(state.qa_pairs),
        state.status,
    )

    return {
        "state": state,
        "awaiting_follow_up": False,
    }


# DB + CACHE SYNC
async def _sync_after_processing(
    db: AsyncSession,
    session_id: str,
    state: InterviewState,
) -> None:
    """
    Sync state to DB and cache after answer processing.

    If completed: save report to DB, clear Redis cache
    If continuing: update Redis cache, update DB status
    """
    if state.status == "completed" and state.final_report:
        # Save coaching report
        await db_service.save_coaching_report(db, session_id, state.final_report)
        # Update session with final score
        await db_service.update_session_final_score(db, session_id, state.final_report)
        # Clear Redis cache
        await _clear_cache(session_id)

        logger.info("Session %s completed and saved", session_id[:8])

    elif state.status == "error":
        # Update DB with error status
        await db_service.update_session_status(
            db, session_id, state.status, state.error_message
        )
        # Clear Redis cache
        await _clear_cache(session_id)

        logger.warning("Session %s errored", session_id[:8])

    else:
        # Update Redis cache for next question
        await _cache_session(session_id, state)
        # Update DB status
        await db_service.update_session_status(db, session_id, state.status)


# STREAMING SUBMIT (SSE)
async def submit_answer_stream(
    db: AsyncSession,
    session_id: str,
    answer: str,
    *,
    prefetch_tts: bool = False,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Streaming version of submit_answer.

    Async generator that yields phase-update dicts for SSE.
    Bypasses the compiled graph to yield progress between each step:
    processing → evaluating → evaluated → generating_question/report → result

    The non-streaming POST /answer endpoint remains unchanged.
    """

    # Load & Validate
    try:
        session_data = await _load_session(db, session_id)
    except ValueError:
        yield {"phase": "error", "message": "Session not found"}
        return

    state = session_data["state"]

    if state.status == "completed":
        yield {"phase": "error", "message": "Interview already completed"}
        return
    if state.status == "error":
        yield {"phase": "error", "message": "Interview is in error state"}
        return

    clean_answer = _sanitize_text(answer)
    if not clean_answer:
        yield {"phase": "error", "message": "Answer cannot be empty"}
        return

    # Route: follow-up answer vs main answer
    if session_data["awaiting_follow_up"]:
        # Follow-up answer: build full QAPair
        qa_pair = QAPair(
            question_number=state.current_question_index + 1,
            question=session_data["pending_main_question"],
            answer=session_data["pending_main_answer"],
            follow_up_question=state.current_question,
            follow_up_answer=clean_answer,
        )
        state.qa_pairs.append(qa_pair)

    else:
        # Main answer: decide follow-up first
        yield {"phase": "processing", "message": "Processing your answer..."}

        try:
            state = await asyncio.to_thread(decide_follow_up, state, clean_answer)
        except Exception as e:
            logger.error("Follow-up decision failed: %s", str(e))
            yield {"phase": "error", "message": "Failed to process answer"}
            return

        if state.is_follow_up:
            yield {
                "phase": "generating_question",
                "message": "Preparing follow-up question...",
            }

            # Generate follow-up question and return early
            pending_question = state.current_question

            try:
                state = await asyncio.to_thread(
                    generate_follow_up, state, clean_answer
                )
            except Exception as e:
                logger.error("Follow-up generation failed: %s", str(e))
                yield {"phase": "error", "message": "Failed to generate follow-up"}
                return

            await _cache_session(
                session_id,
                state,
                awaiting_follow_up=True,
                pending_main_question=pending_question,
                pending_main_answer=clean_answer,
            )

            tts_cache_key = None
            if prefetch_tts and state.current_question:
                yield {
                    "phase": "generating_question",
                    "message": "Preparing follow-up audio...",
                }
                try:
                    tts_cache_key = await prefetch_tts_audio(
                        session_id=session_id,
                        question_number=state.current_question_index + 1,
                        text=state.current_question,
                        language=state.language.value,
                        is_follow_up=True,
                    )
                except Exception as e:
                    logger.warning("Failed to prefetch TTS for follow-up: %s", str(e))

            logger.info(
                "Stream: follow-up generated for Q%d",
                state.current_question_index + 1,
            )

            yield {
                "phase": "follow_up",
                "data": {
                    "session_id": session_id,
                    "status": "awaiting_follow_up",
                    "current_question": state.current_question,
                    "question_number": state.current_question_index + 1,
                    "is_follow_up": True,
                    "total_questions": settings.MAX_QUESTIONS,
                    "last_evaluation": None,
                    "final_report": None,
                    "tts_cache_key": tts_cache_key,
                    "error_message": None,
                },
            }
            return

        # No follow-up needed, build QAPair
        qa_pair = QAPair(
            question_number=state.current_question_index + 1,
            question=state.current_question,
            answer=clean_answer,
        )
        state.qa_pairs.append(qa_pair)

    # Evaluate
    yield {"phase": "evaluating", "message": "Evaluating your answer..."}

    try:
        state = await asyncio.to_thread(evaluate_answer, state)
    except Exception as e:
        logger.error("Stream evaluation failed: %s", str(e))
        yield {"phase": "error", "message": "Evaluation failed"}
        return

    # Extract evaluation result for intermediate event
    eval_data = None
    if state.qa_pairs and state.qa_pairs[-1].evaluation:
        e = state.qa_pairs[-1].evaluation
        eval_data = {
            "score": e.score,
            "strengths": e.strengths,
            "weaknesses": e.weaknesses,
        }

    yield {"phase": "evaluated", "evaluation": eval_data}

    # Save Q&A pair to DB
    await db_service.save_qa_pair(db, session_id, state.qa_pairs[-1])

    # Check for errors after evaluation
    if state.status == "error":
        await db_service.update_session_status(
            db, session_id, "error", state.error_message
        )
        await _clear_cache(session_id)
        yield {"phase": "error", "message": state.error_message or "Evaluation error"}
        return

    # Next question OR Coaching report
    is_complete = state.current_question_index >= settings.MAX_QUESTIONS - 1

    if is_complete:
        # Generate coaching report
        yield {
            "phase": "generating_report",
            "message": "Generating your coaching report...",
        }

        try:
            state = await asyncio.to_thread(generate_coaching_report, state)
        except Exception as e:
            logger.error("Stream report generation failed: %s", str(e))
            yield {"phase": "error", "message": "Report generation failed"}
            return

        if state.status not in ("completed", "error"):
            state.status = "completed"

        # Persist report
        if state.final_report:
            await db_service.save_coaching_report(
                db, session_id, state.final_report
            )
            await db_service.update_session_final_score(
                db, session_id, state.final_report
            )
        await _clear_cache(session_id)

        final_report = (
            state.final_report.model_dump() if state.final_report else None
        )

        logger.info("Stream: session %s completed", session_id[:8])

        yield {
            "phase": "result",
            "data": {
                "session_id": session_id,
                "status": "completed",
                "current_question": None,
                "question_number": len(state.qa_pairs),
                "is_follow_up": False,
                "total_questions": settings.MAX_QUESTIONS,
                "last_evaluation": eval_data,
                "final_report": final_report,
                "error_message": None,
            },
        }

    else:
        # Generate next question
        yield {
            "phase": "generating_question",
            "message": "Preparing next question...",
        }

        try:

            def _advance_and_generate(s: InterviewState) -> InterviewState:
                s = advance_question(s)
                s = generate_question(s)
                return s

            state = await asyncio.to_thread(_advance_and_generate, state)
        except Exception as e:
            logger.error("Stream next question failed: %s", str(e))
            yield {"phase": "error", "message": "Failed to generate next question"}
            return

        if state.status not in ("completed", "error"):
            state.status = "interviewing"

        # Cache for next round
        await _cache_session(session_id, state)
        await db_service.update_session_status(db, session_id, state.status)

        tts_cache_key = None
        if prefetch_tts and state.current_question:
            yield {
                "phase": "generating_question",
                "message": "Preparing voice playback...",
            }
            try:
                tts_cache_key = await prefetch_tts_audio(
                    session_id=session_id,
                    question_number=state.current_question_index + 1,
                    text=state.current_question,
                    language=state.language.value,
                    is_follow_up=False,
                )
            except Exception as e:
                logger.warning("Failed to prefetch TTS for next question: %s", str(e))

        logger.info(
            "Stream: Q%d ready for session %s",
            state.current_question_index + 1,
            session_id[:8],
        )

        yield {
            "phase": "result",
            "data": {
                "session_id": session_id,
                "status": state.status,
                "current_question": state.current_question,
                "question_number": state.current_question_index + 1,
                "is_follow_up": False,
                "total_questions": settings.MAX_QUESTIONS,
                "last_evaluation": eval_data,
                "final_report": None,
                "tts_cache_key": tts_cache_key,
                "error_message": None,
            },
        }
