import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.schemas import (
    CandidateProfile,
    FinalReport,
    InterviewPlan,
    InterviewState,
    InterviewType,
    Difficulty,
    QAPair,
    QuestionEvaluation,
    Language,
)
from app.models.tables import (
    CoachingReportTable,
    InterviewSessionTable,
    QAPairTable,
)

logger = logging.getLogger(__name__)


# SESSION CRUD
async def create_session(
    db: AsyncSession,
    session_id: str,
    state: InterviewState,
) -> InterviewSessionTable:
    """Create a new interview session in database."""
    session_row = InterviewSessionTable(
        id=session_id,
        resume_text=state.resume_text,
        job_description=state.job_description,
        interview_type=state.interview_type.value,
        difficulty=state.difficulty.value,
        language=state.language.value,
        candidate_profile=state.candidate_profile.model_dump()
        if state.candidate_profile
        else None,
        interview_plan=state.interview_plan.model_dump()
        if state.interview_plan
        else None,
        status=state.status,
        error_message=state.error_message,
    )

    db.add(session_row)
    await db.commit()
    await db.refresh(session_row)

    logger.info("Session %s saved to database", session_id[:8])
    return session_row


async def get_session(
    db: AsyncSession,
    session_id: str,
) -> InterviewSessionTable | None:
    """Get a session with all related data"""
    stmt = (
        select(InterviewSessionTable)
        .where(InterviewSessionTable.id == session_id)
        .options(
            selectinload(InterviewSessionTable.qa_pairs),
            selectinload(InterviewSessionTable.coaching_report),
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_session_status(
    db: AsyncSession,
    session_id: str,
    status: str,
    error_message: str | None = None,
) -> None:
    """Update session status"""
    stmt = select(InterviewSessionTable).where(InterviewSessionTable.id == session_id)
    result = await db.execute(stmt)
    session_row = result.scalar_one_or_none()

    if session_row:
        session_row.status = status
        session_row.error_message = error_message
        if status == "completed":
            session_row.completed_at = datetime.now(timezone.utc)
        await db.commit()
        logger.info("Session %s status updated to %s", session_id[:8], status)


async def update_session_results(
    db: AsyncSession,
    session_id: str,
    state: InterviewState,
) -> None:
    """Update session with analysis results"""
    stmt = select(InterviewSessionTable).where(InterviewSessionTable.id == session_id)
    result = await db.execute(stmt)
    session_row = result.scalar_one_or_none()

    if session_row:
        session_row.candidate_profile = (
            state.candidate_profile.model_dump() if state.candidate_profile else None
        )
        session_row.interview_plan = (
            state.interview_plan.model_dump() if state.interview_plan else None
        )
        session_row.status = state.status
        session_row.error_message = state.error_message
        await db.commit()
        logger.info("Session %s results updated", session_id[:8])


# Q&A PAIR CRUD
async def save_qa_pair(
    db: AsyncSession,
    session_id: str,
    qa_pair: QAPair,
) -> QAPairTable:
    """Save a Q&A pair with evaluation to database"""
    qa_row = QAPairTable(
        session_id=session_id,
        question_number=qa_pair.question_number,
        question=qa_pair.question,
        answer=qa_pair.answer,
        follow_up_question=qa_pair.follow_up_question,
        follow_up_answer=qa_pair.follow_up_answer,
        score=qa_pair.evaluation.score if qa_pair.evaluation else None,
        strengths=qa_pair.evaluation.strengths if qa_pair.evaluation else None,
        weaknesses=qa_pair.evaluation.weaknesses if qa_pair.evaluation else None,
        notes=qa_pair.evaluation.notes if qa_pair.evaluation else None,
    )

    db.add(qa_row)
    await db.commit()
    await db.refresh(qa_row)

    logger.info(
        "Q&A pair #%d saved for session %s", qa_pair.question_number, session_id[:8]
    )
    return qa_row


# COACHING REPORT CRUD
async def save_coaching_report(
    db: AsyncSession,
    session_id: str,
    report: FinalReport,
) -> CoachingReportTable:
    """Save coaching report to database."""
    report_row = CoachingReportTable(
        session_id=session_id,
        report_data=report.model_dump(),
    )

    db.add(report_row)
    await db.commit()
    await db.refresh(report_row)

    logger.info("Coaching report saved for session %s", session_id[:8])
    return report_row


async def update_session_final_score(
    db: AsyncSession,
    session_id: str,
    report: FinalReport,
) -> None:
    """Update session with final score and grade."""
    stmt = select(InterviewSessionTable).where(InterviewSessionTable.id == session_id)
    result = await db.execute(stmt)
    session_row = result.scalar_one_or_none()

    if session_row:
        session_row.overall_score = report.overall_score
        session_row.overall_grade = report.overall_grade.value
        session_row.status = "completed"
        session_row.completed_at = datetime.now(timezone.utc)
        await db.commit()
        logger.info(
            "Session %s completed. Score: %.1f (%s)",
            session_id[:8],
            report.overall_score,
            report.overall_grade.value,
        )


# STATE CONVERSION
def db_to_interview_state(
    session_row: InterviewSessionTable,
) -> InterviewState:
    """Convert database session row to InterviewState."""

    # Rebuild candidate profile
    candidate_profile = None
    if session_row.candidate_profile:
        candidate_profile = CandidateProfile(**session_row.candidate_profile)

    # Rebuild interview plan
    interview_plan = None
    if session_row.interview_plan:
        interview_plan = InterviewPlan(**session_row.interview_plan)

    # Rebuild Q&A pairs
    qa_pairs = []
    for qa_row in session_row.qa_pairs:
        evaluation = None
        if qa_row.score is not None:
            evaluation = QuestionEvaluation(
                score=qa_row.score,
                strengths=qa_row.strengths or [],
                weaknesses=qa_row.weaknesses or [],
                notes=qa_row.notes or "",
            )

        qa_pairs.append(
            QAPair(
                question_number=qa_row.question_number,
                question=qa_row.question,
                answer=qa_row.answer,
                follow_up_question=qa_row.follow_up_question,
                follow_up_answer=qa_row.follow_up_answer,
                evaluation=evaluation,
            )
        )

    # Rebuild final report
    final_report = None
    if session_row.coaching_report:
        final_report = FinalReport(**session_row.coaching_report.report_data)

    # Determine current question index
    current_question_index = len(qa_pairs)
    if current_question_index > 0 and session_row.status == "completed":
        current_question_index = len(qa_pairs) - 1

    return InterviewState(
        resume_text=session_row.resume_text,
        job_description=session_row.job_description,
        interview_type=InterviewType(session_row.interview_type),
        difficulty=Difficulty(session_row.difficulty),
        language=Language(session_row.language),
        candidate_profile=candidate_profile,
        interview_plan=interview_plan,
        current_question_index=current_question_index,
        qa_pairs=qa_pairs,
        final_report=final_report,
        status=session_row.status,
        error_message=session_row.error_message,
    )


async def list_sessions(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 10,
) -> dict:
    """List all sessions with pagination."""
    import math

    # Count total
    count_stmt = select(func.count(InterviewSessionTable.id))
    count_result = await db.execute(count_stmt)
    total = count_result.scalar_one()

    # Fetch paginated sessions (newest first)
    offset = (page - 1) * page_size
    stmt = (
        select(InterviewSessionTable)
        .order_by(InterviewSessionTable.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    sessions = result.scalars().all()

    return {
        "sessions": sessions,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 0,
    }


async def get_coaching_report(
    db: AsyncSession,
    session_id: str,
) -> CoachingReportTable | None:
    """Get coaching report for a session."""
    stmt = select(CoachingReportTable).where(
        CoachingReportTable.session_id == session_id
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def delete_session(
    db: AsyncSession,
    session_id: str,
) -> bool:
    """Delete a session and all related data."""
    stmt = select(InterviewSessionTable).where(
        InterviewSessionTable.id == session_id
    )
    result = await db.execute(stmt)
    session_row = result.scalar_one_or_none()

    if not session_row:
        return False

    await db.delete(session_row)
    await db.commit()

    logger.info("Session %s deleted", session_id[:8])
    return True


async def cleanup_old_sessions(
    db: AsyncSession,
    completed_days: int = 30,
    error_days: int = 7,
    abandoned_days: int = 3,
) -> dict:
    """
    Delete old sessions based on retention policy.

    - Completed sessions older than completed_days
    - Error sessions older than error_days
    - Abandoned (not completed/error) sessions older than abandoned_days
    """

    now = datetime.now(timezone.utc)
    deleted = {"completed": 0, "error": 0, "abandoned": 0}

    # delete old completed sessions
    completed_cutoff = now - timedelta(days=completed_days)
    stmt = select(InterviewSessionTable).where(
        InterviewSessionTable.status == "completed",
        InterviewSessionTable.completed_at < completed_cutoff,
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    for row in rows:
        await db.delete(row)
    deleted["completed"] = len(rows)

    # delete old error sessions
    error_cutoff = now - timedelta(days=error_days)
    stmt = select(InterviewSessionTable).where(
        InterviewSessionTable.status == "error",
        InterviewSessionTable.created_at < error_cutoff,
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    for row in rows:
        await db.delete(row)
    deleted["error"] = len(rows)

    # Delete abandoned sessions (not completed, not error)
    abandoned_cutoff = now - timedelta(days=abandoned_days)
    stmt = select(InterviewSessionTable).where(
        InterviewSessionTable.status.notin_(["completed", "error"]),
        InterviewSessionTable.created_at < abandoned_cutoff,
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    for row in rows:
        await db.delete(row)
    deleted["abandoned"] = len(rows)

    await db.commit()

    total = sum(deleted.values())
    if total > 0:
        logger.info(
            "Cleanup: deleted %d sessions (completed: %d, error: %d, abandoned: %d)",
            total,
            deleted["completed"],
            deleted["error"],
            deleted["abandoned"],
        )

    return deleted
