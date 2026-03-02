from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for all database models."""
    pass


class InterviewSessionTable(Base):
    """Stores interview session data."""

    __tablename__ = "interview_sessions"

    # primary key
    id: Mapped[str] = mapped_column(String(64), primary_key=True)

    # input data
    resume_text: Mapped[str] = mapped_column(Text, nullable=False)
    job_description: Mapped[str] = mapped_column(Text, nullable=False)
    interview_type: Mapped[str] = mapped_column(String(20), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False)
    language: Mapped[str] = mapped_column(String(5), nullable=False, default="en")

    # analysis results
    candidate_profile: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    interview_plan: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # status tracking
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="initialized"
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # final_result
    overall_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    overall_grade: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # relationships
    qa_pairs: Mapped[list["QAPairTable"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="QAPairTable.question_number",
    )
    coaching_report: Mapped["CoachingReportTable | None"] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        uselist=False
    )

    def __repr__(self) -> str:
        return f"<Session {self.id[:8]} | {self.status}>"


class QAPairTable(Base):
    """Stores individual question-answer pairs with evaluations."""

    __tablename__ = "qa_pairs"

    # primary key
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # foreign key
    session_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Q&A data
    question_number: Mapped[int] = mapped_column(Integer, nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    follow_up_question: Mapped[str | None] = mapped_column(Text, nullable=True)
    follow_up_answer: Mapped[str | None] = mapped_column(Text, nullable=True)

    # evaluation results
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    strengths: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    weaknesses: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # relationship
    session: Mapped["InterviewSessionTable"] = relationship(
        back_populates="qa_pairs"
    )

    def __repr__(self) -> str:
        return f"<QA #{self.question_number} | Score: {self.score}>"


class CoachingReportTable(Base):
    """Stores final coaching report for a session"""

    __tablename__ = "coaching_reports"

    # primary key
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Foreign key (unique — one report per session)
    session_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Full report data
    report_data: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    session: Mapped["InterviewSessionTable"] = relationship(
        back_populates="coaching_report"
    )

    def __repr__(self) -> str:
        return f"<Report for session {self.session_id[:8]}>"